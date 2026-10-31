import { todayISO, wallNow, wallAt, fmtDate } from './dates.js'

export const KINDS = {
  info: { label: 'Update', icon: '📣', tone: 'mint' },
  offer: { label: 'Special', icon: '🎉', tone: 'butter' },
  leave: { label: 'On leave', icon: '🌴', tone: 'peach' },
  closed: { label: 'Orders closed', icon: '⏸️', tone: 'rose' },
}

// Announcements that should be visible today
export function activeAnnouncements(s) {
  const today = todayISO(s?.timezone)
  return (s?.announcements || []).filter((a) => a.active !== false && (!a.from || today >= a.from) && (!a.to || today <= a.to))
}

// Orders can be scheduled to open at a date & time ('YYYY-MM-DDTHH:MM', bakery time)
export function opensAtMs(s) {
  const v = s?.orders_open_at
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null
  return wallAt(v.slice(0, 10), v.slice(11, 16))
}
export const notYetOpen = (s, now = new Date()) => { const at = opensAtMs(s); return at != null && wallNow(s?.timezone, now) < at }
export function opensLabel(s) {
  const v = s?.orders_open_at; if (!v) return ''
  const [h, m] = v.slice(11, 16).split(':').map(Number)
  const t = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  return `${fmtDate(v.slice(0, 10), { weekday: true })} at ${t}`
}
// Orders are closed when the baker switched them off (until the reopen date, if she set one), or before the opening time
export function ordersClosed(s) {
  if (notYetOpen(s)) return true
  if (!s?.orders_paused) return false
  return !s.orders_paused_until || todayISO(s?.timezone) < s.orders_paused_until
}
export const closedMessage = (s) => notYetOpen(s)
  ? `Online orders open on ${opensLabel(s)}. See you then!`
  : s?.orders_paused_message || 'We are not taking new orders right now.'

// Pop-up announcements: shown once a day per visitor (until dismissed for that day)
export function popupsToShow(s) {
  const list = activeAnnouncements(s).filter((a) => a.popup)
  if (notYetOpen(s)) list.unshift({ id: 'opens-' + s.orders_open_at, kind: 'info', title: 'Online orders open soon', message: closedMessage(s), popup: true })
  else if (ordersClosed(s) && s.orders_paused_popup !== false)
    list.unshift({ id: 'closed-' + (s.orders_paused_since || ''), kind: 'closed', title: 'Not taking new orders right now', message: closedMessage(s), popup: true, until: s.orders_paused_until })
  return list
}
