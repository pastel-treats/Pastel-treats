// Ready-made WhatsApp messages. The baker taps "Send" → WhatsApp opens with the text → she presses send.
// (Nothing is sent automatically; that needs the WhatsApp Business API — see SETUP.md.)
import { inr } from './format.js'
import { fmtDate } from './dates.js'

const link = (o) => `${location.origin}${location.pathname}#/order/${o.order_number}`
const when = (o) => `${fmtDate(o.confirmed_date || o.requested_date, { weekday: true })}, ${o.confirmed_slot_label || o.slot_label}`
const first = (n) => (n || '').replace(/^Demo · /, '').split(' ')[0]

export const ORDER_TEMPLATES = {
  received: { label: 'Order received', text: (o, s) => `Hi ${first(o.customer_name)}! 🎂 Thank you for your order ${o.order_number} with ${s.business_name}. We're reviewing it and will confirm shortly.\nTrack it here: ${link(o)}` },
  pay_advance: { label: 'Request advance', text: (o, s) => `Hi ${first(o.customer_name)}! To lock in your slot (${when(o)}), please pay the advance of ${inr(o.advance_due - o.amount_paid)} for order ${o.order_number}.\nUPI: ${s.upi_id || '(UPI ID)'}\nPay & track here: ${link(o)}` },
  quote: { label: 'Send custom quote', text: (o, s) => `Hi ${first(o.customer_name)}! We loved your custom cake idea 💐 The final price for order ${o.order_number} is ${inr(o.total)} (advance ${inr(o.advance_due)}).${o.quote_note ? '\nNote: ' + o.quote_note : ''}\nIf you're happy, please pay the advance here: ${link(o)}` },
  payment_received: { label: 'Payment received', text: (o) => `Hi ${first(o.customer_name)}! We've received ${inr(o.amount_paid)} for order ${o.order_number}. Thank you! Balance due: ${inr(o.total - o.amount_paid)}.` },
  confirmed: { label: 'Order confirmed', text: (o, s) => `Hi ${first(o.customer_name)}! ✅ Your order ${o.order_number} is confirmed for ${when(o)} (${o.fulfilment === 'pickup' ? 'pickup at ' + s.pickup_address : 'home delivery'}). See you soon!` },
  rescheduled: { label: 'Schedule changed', text: (o) => `Hi ${first(o.customer_name)}, a quick update on order ${o.order_number}: your new ${o.fulfilment} time is ${when(o)}. Please let us know if that doesn't work. Details: ${link(o)}` },
  price_changed: { label: 'Price changed', text: (o) => `Hi ${first(o.customer_name)}, the total for order ${o.order_number} has been updated to ${inr(o.total)} (advance ${inr(o.advance_due)}, paid ${inr(o.amount_paid)}). Details: ${link(o)}` },
  preparing: { label: 'Preparation started', text: (o) => `Hi ${first(o.customer_name)}! Your cake for order ${o.order_number} is being baked right now 👩‍🍳` },
  ready: { label: 'Ready for pickup', text: (o, s) => `Hi ${first(o.customer_name)}! 🎉 Order ${o.order_number} is ready for pickup at ${s.pickup_address}. Balance due: ${inr(o.total - o.amount_paid)}. ${s.pickup_instructions || ''}` },
  out_for_delivery: { label: 'Out for delivery', text: (o) => `Hi ${first(o.customer_name)}! 🚗 Order ${o.order_number} is on its way. Balance due on delivery: ${inr(o.total - o.amount_paid)}.` },
  completed: { label: 'Thank you + feedback', text: (o, s) => `Hi ${first(o.customer_name)}! Thank you for choosing ${s.business_name} 💚 We hope everyone loved it. We'd be grateful for a quick review or a tag on Instagram ${s.instagram || ''}` },
  cancelled: { label: 'Cancelled', text: (o) => `Hi ${first(o.customer_name)}, order ${o.order_number} has been cancelled. ${o.amount_paid > 0 ? 'Your refund will be processed as per our policy.' : ''}` },
  refunded: { label: 'Refund processed', text: (o) => `Hi ${first(o.customer_name)}, the refund for order ${o.order_number} has been processed. It should reach your account in a few days.` },
}

export const occasionMessage = (c, occ, s, offer) =>
  `Hi ${first(c?.name)}! 🎂 ${occ.person_name ? occ.person_name + "'s" : 'Your'} ${occ.kind.toLowerCase()} is coming up on ${fmtDate(occ.next || occ.occasion_date)}. ` +
  `Shall we bake something special again${occ.preferred_flavour ? ` — maybe your favourite ${occ.preferred_flavour}` : ''}?${offer ? ' ' + offer : ''} Order here: ${location.origin}${location.pathname}#/menu\n(Reply STOP to opt out.)`
