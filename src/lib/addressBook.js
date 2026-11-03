// Customer details & named addresses ("Home", "Work", "Amma's house"…) remembered ON THIS PHONE only.
// Nothing is looked up from the server by mobile number — that would let anyone see a stranger's address.
import { normalizePhone } from './contact.js'

const KEY = 'pt-address-book'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {} } catch { return {} } }
const write = (b) => { try { localStorage.setItem(KEY, JSON.stringify(b)) } catch { /* private mode */ } }
const rid = () => Math.random().toString(36).slice(2, 10)
const same = (a, b) => (a.line || '').trim().toLowerCase() === (b.line || '').trim().toLowerCase() && (a.pincode || '') === (b.pincode || '')

export const LABELS = [['Home', '🏠'], ['Work', '💼'], ['Other', '📍']]
export const labelIcon = (l) => (LABELS.find(([n]) => n === l)?.[1] || '📍')
export const addressText = (a) => [a.line, a.area, a.city, a.pincode].filter(Boolean).join(', ')

// one-time: bring over details saved by older versions of the site
function migrate(b) {
  try {
    const last = JSON.parse(localStorage.getItem('pt-last-details') || 'null')
    const ph = last && normalizePhone(last.phone)
    if (ph && !b[ph]) b[ph] = { name: last.name || '', email: last.email || '', state: last.state || '', city: last.city || '', addresses: [] }
  } catch { /* ignore */ }
  return b
}

export function getPerson(phone) {
  const ph = normalizePhone(phone)
  if (!ph) return null
  const b = migrate(read())
  const p = b[ph]
  if (!p) return null
  return { ...p, addresses: [...(p.addresses || [])].sort((x, y) => (y.used || 0) - (x.used || 0)) }
}

// the phone number most recently used on this device (to pre-fill checkout)
export function lastPhone() {
  const b = migrate(read())
  return Object.entries(b).sort((x, y) => (y[1].at || 0) - (x[1].at || 0))[0]?.[0] || null
}

export function savePerson(phone, details, address) {
  const ph = normalizePhone(phone)
  if (!ph) return
  const b = migrate(read())
  const p = b[ph] || { addresses: [] }
  Object.assign(p, { name: details.name ?? p.name, email: details.email ?? p.email, state: details.state ?? p.state, city: details.city ?? p.city, at: Date.now() })
  if (address && (address.line || '').trim()) {
    const clean = { label: (address.label || 'Home').trim().slice(0, 30) || 'Home', line: address.line.trim(), area: address.area || '', city: address.city || '', pincode: address.pincode || '', landmark: address.landmark || '', instructions: address.instructions || '' }
    const i = address.id ? p.addresses.findIndex((a) => a.id === address.id) : p.addresses.findIndex((a) => same(a, clean))
    if (i >= 0) p.addresses[i] = { ...p.addresses[i], ...clean, used: Date.now() }
    else p.addresses.push({ id: rid(), ...clean, used: Date.now() })
    p.addresses = p.addresses.slice(-8)
  }
  b[ph] = p
  write(b)
}

export function removeAddress(phone, id) {
  const ph = normalizePhone(phone)
  const b = read()
  if (!b[ph]) return
  b[ph].addresses = (b[ph].addresses || []).filter((a) => a.id !== id)
  write(b)
}
