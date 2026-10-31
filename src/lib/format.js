export const inr = (n) => '₹' + Math.round(+n || 0).toLocaleString('en-IN')

export const ORDER_STATUS = {
  draft: { label: 'Draft', tone: 'grey' },
  submitted: { label: 'Submitted — awaiting review', short: 'Awaiting review', tone: 'butter' },
  awaiting_payment: { label: 'Awaiting advance payment', short: 'Awaiting advance', tone: 'peach' },
  payment_verification: { label: 'Advance paid — being checked', short: 'Verify payment', tone: 'peach' },
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
  verification_pending: { label: 'Paid — being checked', tone: 'peach' },
  part_paid: { label: 'Part paid', tone: 'butter' },
  advance_received: { label: 'Advance received', tone: 'sky' },
  fully_paid: { label: 'Fully paid', tone: 'mint' },
  payment_failed: { label: 'Payment failed', tone: 'rose' },
  refund_pending: { label: 'Refund pending', tone: 'rose' },
  refunded: { label: 'Refunded', tone: 'grey' },
}
export const statusLabel = (s, short) => (short && ORDER_STATUS[s]?.short) || ORDER_STATUS[s]?.label || s
export const STATUS_FLOW = ['submitted', 'awaiting_payment', 'payment_verification', 'advance_received', 'confirmed', 'in_preparation', 'ready', 'out_for_delivery', 'completed']

// Turn any error into a short, friendly sentence (never show technical database / network text to customers)
export const cleanError = (e) => {
  const raw = e?.message || String(e || '')
  if (/failed to fetch|networkerror|load failed|network request failed|err_internet|offline/i.test(raw)) return 'No internet connection. Please check your connection and try again.'
  if (/timeout|timed out|504|502|503|upstream/i.test(raw)) return 'The bakery server is busy right now. Please try again in a moment.'
  if (/jwt|token.*expired|refresh token|not authenticated/i.test(raw)) return 'Your session has expired. Please sign in again.'
  if (/duplicate key|idempotency/i.test(raw)) return 'This was already sent. Please check “My orders” before trying again.'
  if (!/^[A-Z_]+:/.test(raw) && /violates|relation |column |function |syntax error|permission denied|schema cache|PGRST|null value|invalid input/i.test(raw))
    return 'Something went wrong on our side. Please try again, or message us on WhatsApp.'
  const m = (raw || 'Something went wrong').replace(/^[A-Z_]+:\s*/, '')
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export const itemSummary = (i) =>
  [i.weight, i.flavour, i.filling, i.frosting, i.design, i.egg].filter(Boolean).join(' · ')

export const OCCASIONS = ['Birthday', 'Anniversary', 'Baby shower', 'Wedding', 'Graduation', 'Corporate', 'Festival', 'Other']

// '48 hrs (2 days prior)'
export const leadLabel = (h = 48) => { const d = (+h || 48) / 24; return `${+h || 48} hrs${Number.isInteger(d) ? ` (${d} day${d > 1 ? 's' : ''} prior)` : ''}` }
