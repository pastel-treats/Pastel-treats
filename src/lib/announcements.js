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
