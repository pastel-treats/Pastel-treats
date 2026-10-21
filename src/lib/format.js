export const inr = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN')

export const ORDER_STATUS = {
  draft: { label: 'Draft', tone: 'grey' },
  submitted: { label: 'Submitted — awaiting review', short: 'Awaiting review', tone: 'butter' },
  awaiting_payment: { label: 'Awaiting advance payment', short: 'Awaiting advance', tone: 'peach' },
  payment_verification: { label: 'Payment verification pending', short: 'Verify payment', tone: 'peach' },
  advance_received: { label: 'Advance payment received', short: 'Advance received', tone: 'sky' },
  confirmed: { label: 'Confirmed by baker', short: 'Confirmed', tone: 'mint' },
  in_preparation: { label: 'In preparation', tone: 'mint' },
  ready: { label: 'Ready for pickup', short: 'Ready', tone: 'mint' },
  out_for_delivery: { label: 'Out for delivery', tone: 'mint' },
  completed: { label: 'Completed', tone: 'forest' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
  refund_pending: { label: 'Refund pending', tone: 'rose' },
  refunded: { label: 'Refunded', tone: 'grey' },
}
export const PAYMENT_STATUS = {
  not_paid: { label: 'Not paid', tone: 'rose' },
  proof_uploaded: { label: 'Proof uploaded', tone: 'peach' },
  verification_pending: { label: 'Verification pending', tone: 'peach' },
  part_paid: { label: 'Part paid', tone: 'butter' },
  advance_received: { label: 'Advance received', tone: 'sky' },
  fully_paid: { label: 'Fully paid', tone: 'mint' },
  payment_failed: { label: 'Payment failed', tone: 'rose' },
  refund_pending: { label: 'Refund pending', tone: 'rose' },
  refunded: { label: 'Refunded', tone: 'grey' },
}
export const statusLabel = (s, short) => (short && ORDER_STATUS[s]?.short) || ORDER_STATUS[s]?.label || s
export const STATUS_FLOW = ['submitted', 'awaiting_payment', 'payment_verification', 'advance_received', 'confirmed', 'in_preparation', 'ready', 'out_for_delivery', 'completed']

export const cleanError = (e) => {
  const m = (e?.message || String(e || 'Something went wrong')).replace(/^[A-Z_]+:\s*/, '')
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export const itemSummary = (i) =>
  [i.weight, i.flavour, i.filling, i.frosting, i.design, i.egg].filter(Boolean).join(' · ')

export const OCCASIONS = ['Birthday', 'Anniversary', 'Baby shower', 'Wedding', 'Graduation', 'Corporate', 'Festival', 'Other']

// '48 hrs (2 days prior)'
export const leadLabel = (h = 48) => { const d = (+h || 48) / 24; return `${+h || 48} hrs${Number.isInteger(d) ? ` (${d} day${d > 1 ? 's' : ''} prior)` : ''}` }
