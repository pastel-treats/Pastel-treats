import { todayISO } from './dates.js'

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

// Orders are closed when the baker switched them off — until the reopen date, if she set one
export function ordersClosed(s) {
  if (!s?.orders_paused) return false
  return !s.orders_paused_until || todayISO(s?.timezone) < s.orders_paused_until
}
export const closedMessage = (s) => s?.orders_paused_message || 'We are not taking new orders right now.'

// Pop-up announcements: shown once a day per visitor (until dismissed for that day)
export function popupsToShow(s) {
  const list = activeAnnouncements(s).filter((a) => a.popup)
  if (ordersClosed(s) && s.orders_paused_popup !== false)
    list.unshift({ id: 'closed-' + (s.orders_paused_since || ''), kind: 'closed', title: 'Not taking new orders right now', message: closedMessage(s), popup: true, until: s.orders_paused_until })
  return list
}
