// What happens if an order is cancelled now? (follows the cancellation policy in Business settings)
import { wallNow, wallAt } from './dates.js'

export function slotStart(o, slots) {
  const label = o.confirmed_slot_label || o.slot_label
  const s = (slots || []).find((x) => x.id === o.slot_id) || (slots || []).find((x) => x.label === label)
  return (s?.start_time || '09:00').slice(0, 5)
}

export function cancellationTerms(o, slots, settings, now = new Date()) {
  const windowHrs = +settings?.cancel_full_refund_hours || 48
  const startMs = wallAt(o.confirmed_date || o.requested_date, slotStart(o, slots))
  const hoursLeft = Math.floor((startMs - wallNow(settings?.timezone, now)) / 3600e3)
  // count payments the baker hasn't checked yet too (customer already paid them)
  const pendingPaid = (o.payments || []).filter((p) => p.status === 'pending' && p.kind !== 'refund').reduce((a, p) => a + (p.amount || 0), 0)
  const paid = Math.max((o.amount_paid || 0) + pendingPaid, 0)
  const fullRefund = hoursLeft >= windowHrs
  return {
    hoursLeft, windowHrs, paid, fullRefund,
    refund: fullRefund ? paid : 0,
    closed: ['cancelled', 'refund_pending', 'refunded', 'completed'].includes(o.status),
    summary: paid === 0
      ? 'Nothing has been paid yet, so there is nothing to refund.'
      : fullRefund
        ? `Cancelled ${hoursLeft} hrs before the slot (more than ${windowHrs} hrs) — full refund of the advance.`
        : `Cancelled ${Math.max(hoursLeft, 0)} hrs before the slot (less than ${windowHrs} hrs) — the advance is non-refundable as per policy.`,
  }
}
