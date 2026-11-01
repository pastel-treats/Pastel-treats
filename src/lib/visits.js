// Private, cookie-free visit counting for the baker's "Site traffic" page.
// Each phone gets a random id (no name, number or IP is ever sent). Visits from the
// baker's own phone and from the dashboard are not counted.
import { api } from '../api/index.js'

const VID = 'pt-vid', SES = 'pt-ses', OFF = 'pt-no-track'
const SESSION_GAP = 30 * 60 * 1000 // a new visit after 30 minutes of nothing
const get = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12))

export const isTrackingOff = () => get(OFF) === '1'
export const setTrackingOff = (off) => put(OFF, off ? '1' : '0')
// the baker's own phones are left out of the numbers automatically (she can switch it back on)
export const optOutOwnerDevice = () => { if (get(OFF) === null) put(OFF, '1') }

const SOURCE_WORDS = { ig: 'instagram', insta: 'instagram', instagram: 'instagram', wa: 'whatsapp', whatsapp: 'whatsapp', fb: 'facebook', facebook: 'facebook', g: 'google', google: 'google', qr: 'qr' }

// Where did this visit come from?
export function detectSource({ search = location.search, referrer = document.referrer, ua = navigator.userAgent, host = location.host } = {}) {
  const q = new URLSearchParams(search)
  const tag = (q.get('s') || q.get('utm_source') || q.get('src') || '').toLowerCase().trim()
  if (SOURCE_WORDS[tag]) return { source: SOURCE_WORDS[tag], ref: null }
  if (/Instagram/i.test(ua)) return { source: 'instagram', ref: null }
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return { source: 'facebook', ref: null }
  if (/WhatsApp/i.test(ua)) return { source: 'whatsapp', ref: null }
  let rh = ''
  try { rh = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '' } catch { rh = '' }
  if (!rh || rh === host.replace(/^www\./, '')) return { source: tag ? 'other' : 'direct', ref: tag || null }
  if (/instagram\./.test(rh)) return { source: 'instagram', ref: null }
  if (/(^|\.)facebook\.|^fb\.|^m\.facebook/.test(rh)) return { source: 'facebook', ref: null }
  if (/whatsapp|^wa\.me$/.test(rh)) return { source: 'whatsapp', ref: null }
  if (/(^|\.)google\./.test(rh)) return { source: 'google', ref: null }
  if (/bing\.|duckduckgo|yahoo\.|ecosia/.test(rh)) return { source: 'search', ref: rh }
  return { source: 'other', ref: rh }
}

export function detectDevice(ua = navigator.userAgent) {
  const device = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop'
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux|CrOS/i.test(ua) ? 'Linux' : 'Other'
  const browser = /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook' : /SamsungBrowser/i.test(ua) ? 'Samsung' : /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /CriOS|Chrome\//i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Other'
  return { device, os, browser }
}

function session() {
  const now = Date.now()
  let s = null
  try { s = JSON.parse(get(SES) || 'null') } catch { s = null }
  if (!s || !s.id || now - (s.last || 0) > SESSION_GAP) s = { id: rid(), ...detectSource() }
  s.last = now
  put(SES, JSON.stringify(s))
  return s
}

let lastKey = '', lastAt = 0
export function track(kind, { path, productId } = {}) {
  try {
    if (isTrackingOff()) return
    const p = path ?? (location.hash.replace(/^#/, '') || '/')
    if (p.startsWith('/admin')) return
    if (navigator.webdriver && get('pt-track-test') !== '1') return // robots / automated checks
    const key = kind + p + (productId || '')
    if (key === lastKey && Date.now() - lastAt < 1500) return // same thing twice in a row
    lastKey = key; lastAt = Date.now()
    let visitor = get(VID)
    if (!visitor) { visitor = rid(); put(VID, visitor) }
    const s = session()
    const standalone = !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone)
    api.track?.({ visitor, session: s.id, kind, path: p.slice(0, 120), source: s.source, ref: s.ref, ...detectDevice(), app: standalone, product_id: productId || null })
      ?.catch?.(() => {})
  } catch { /* counting must never break the shop */ }
}
