// Mirror of SQL get_availability() — used by demo mode only. Live mode asks the server.
import { wallNow, wallAt, addDaysISO, dowISO, isoFromWall } from './dates.js'

export const ACTIVE = (s) => !['draft', 'cancelled', 'refund_pending', 'refunded'].includes(s)
export const orderDay = (o) => o.confirmed_date || o.requested_date

export function availability({ settings, slots, blackouts, orders, products, from, to, productIds = [], mode = 'pickup', now = new Date() }) {
  const tz = settings.timezone || 'Asia/Kolkata'
  const nowW = wallNow(tz, now)
  const prodLead = Math.max(0, ...products.filter((p) => productIds.includes(p.id)).map((p) => p.lead_time_hours || 0))
  const lead = Math.max(+settings.lead_time_hours || 48, prodLead)
  const earliest = nowW + lead * 3600e3
  const closed = settings.closed_weekdays || []
  const active = orders.filter((o) => ACTIVE(o.status))
  const days = []
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    let reason = null
    const bo = blackouts.find((b) => b.day === d)
    if (closed.includes(dowISO(d))) reason = 'Closed'
    else if (bo) reason = bo.reason || 'Unavailable'
    const dayOrders = active.filter((o) => orderDay(o) === d)
    if (!reason && settings.max_orders_per_day && dayOrders.length >= settings.max_orders_per_day) reason = 'Fully booked'
    if (!reason && mode === 'delivery' && settings.max_deliveries_per_day && dayOrders.filter((o) => o.fulfilment === 'delivery').length >= settings.max_deliveries_per_day)
      reason = 'Deliveries full'
    if (!reason) {
      for (const p of products.filter((x) => productIds.includes(x.id) && x.max_per_day)) {
        const n = dayOrders.reduce((s, o) => s + o.items.filter((i) => i.product_id === p.id).reduce((a, i) => a + i.qty, 0), 0)
        if (n >= p.max_per_day) reason = 'Sold out for this day'
      }
    }
    const daySlots = slots
      .filter((s) => s.active !== false && (mode === 'pickup' ? s.for_pickup !== false : s.for_delivery !== false))
      .filter((s) => !s.weekdays?.length || s.weekdays.includes(dowISO(d)))
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.start_time.localeCompare(b.start_time))
      .map((s) => {
        const rem = Math.max(s.capacity - dayOrders.filter((o) => o.slot_id === s.id).length, 0)
        const early = wallAt(d, s.start_time) < earliest
        const eligible = !reason && !early && rem > 0
        return { id: s.id, label: s.label, start: s.start_time, remaining: rem, eligible, why: reason || (early ? `Order ${lead} hrs (${lead / 24} days) prior` : rem === 0 ? 'Full' : null) }
      })
    days.push({ date: d, reason, available: daySlots.some((s) => s.eligible), slots: daySlots })
  }
  return { now: nowW, earliest, lead_hours: lead, timezone: tz, days, earliestISO: isoFromWall(earliest) }
}
