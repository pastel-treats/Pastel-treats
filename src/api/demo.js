// DEMO adapter — a complete stand-in for the Supabase backend that lives in this browser's storage.
// Same rules as the SQL functions (pricing, 48-hour notice, capacity, payments) so the app can be
// tried end-to-end before a database is connected. Nothing here is shared between devices.
import { SEED_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_ADDONS, SEED_SLOTS, SEED_ZONES } from '../data/seed.js'
import { quote as quoteCalc, calcAdvance } from '../lib/pricing.js'
import { availability as availCalc, ACTIVE } from '../lib/schedule.js'
import { normalizePhone } from '../lib/contact.js'
import { todayISO, addDaysISO } from '../lib/dates.js'

const KEY = 'pt-demo-db-v11'
const SESSION = 'pt-demo-session'
export const DEMO_ADMIN_PASSWORD = 'pastel123'
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now())
const nowISO = () => new Date().toISOString()
const clone = (x) => JSON.parse(JSON.stringify(x))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function freshDb() {
  const db = { settings: clone(SEED_SETTINGS), categories: [], products: [], addons: [], time_slots: [], delivery_zones: [], blackout_dates: [],
    customers: [], customer_addresses: [], occasions: [], orders: [], order_status_history: [], payments: [], notification_log: [], audit_logs: [], admins: [], reviews: [] }
  db.settings.upi_id = 'pasteltreats@okaxis'
  SEED_CATEGORIES.forEach((c) => db.categories.push({ id: uid(), visible: true, image_url: null, ...c }))
  SEED_PRODUCTS.forEach((p, i) => {
    const { cat, featured, unit, ...rest } = p
    db.products.push({
      id: uid(), category_id: db.categories.find((c) => c.slug === cat)?.id, unit_label: unit || 'cake',
      weights: [], flavours: [], fillings: [], frostings: [], designs: [], egg_options: [], occasions: [],
      lead_time_hours: null, max_per_day: null, max_qty: 50, min_qty: 1, pricing_mode: 'fixed', courier_ok: false, cost_percent: null, is_available: true, is_active: true, is_featured: !!featured,
      customizable: true, allow_message: true, seasonal_note: null, allergens: null, dietary: null, sort: i + 1, created_at: nowISO(), ...rest,
    })
  })
  SEED_ADDONS.forEach((a, i) => db.addons.push({ id: uid(), active: true, sort: i + 1, ...a }))
  SEED_SLOTS.forEach((s, i) => db.time_slots.push({ id: uid(), for_pickup: true, for_delivery: true, active: true, sort: i + 1, ...s }))
  SEED_ZONES.forEach((z, i) => db.delivery_zones.push({ id: uid(), active: true, sort: i + 1, ...z }))
  seedDemoOrders(db)
  return db
}

// A handful of clearly-labelled demo orders so the dashboards have something to show
function seedDemoOrders(db) {
  const today = todayISO()
  const people = [
    ['Demo · Anitha R', '9840011122', 'Birthday', '-05-14'], ['Demo · Karthik S', '9840011133', 'Anniversary', '-11-02'],
    ['Demo · Meena V', '9840011144', 'Birthday', '-10-24'], ['Demo · Rahul P', '9840011155', 'Birthday', '-11-19'],
    ['Demo · Divya K', '9840011166', 'Anniversary', '-12-05'], ['Demo · Sanjay M', '9840011177', 'Birthday', '-10-16'],
  ]
  people.forEach(([name, ph, occ, md], idx) => {
    const c = { id: uid(), name, phone: normalizePhone(ph), phone_verified: false, whatsapp: normalizePhone(ph), email: null, notes: 'Demo record — delete before launch',
      marketing_consent: idx % 2 === 0, consent_at: idx % 2 === 0 ? nowISO() : null, preferred_reminder: 'whatsapp', created_at: nowISO(), demo: true,
      state: idx === 5 ? 'Karnataka' : 'Tamil Nadu', city: ['Dindigul', 'Madurai', 'Dindigul', 'Coimbatore', 'Dindigul', 'Bengaluru'][idx] }
    db.customers.push(c)
    const lastYear = String(+today.slice(0, 4) - 1)
    db.occasions.push({ id: uid(), customer_id: c.id, kind: occ, person_name: name.replace('Demo · ', ''), occasion_date: lastYear + md, repeats: true,
      preferred_flavour: idx % 2 ? 'Red velvet' : 'Chocolate', preferred_design: null, budget: 1500 + idx * 200, notes: null, source: 'admin', created_at: nowISO() })
  })
  const P = (n) => db.products.find((p) => p.name === n)
  const cake = P('Celebration Cake'), entremet = P('Entremet (single serve)'), cookies = P('New York Chunky Cookie'), brownie = P('Brownie Box'), tres = P('Tres Leches'), choux = P('Choux Pastry')
  const mk = (ci, daysAgo, prod, sel, status, payFrac, fulfil = 'pickup', fut = 0) => {
    const c = db.customers[ci]
    const date = fut ? addDaysISO(today, fut) : addDaysISO(today, -daysAgo)
    const q = quoteCalc({ items: [{ product_id: prod.id, qty: prod.min_qty || 1, ...sel }], fulfilment: fulfil, address: { pincode: '624001' } },
      { products: db.products, addons: db.addons, zones: db.delivery_zones, settings: db.settings })
    const created = new Date(Date.now() - (daysAgo + 3) * 864e5).toISOString()
    const slot = db.time_slots[(ci + daysAgo) % db.time_slots.length]
    const o = { id: uid(), order_number: 'DEMO-' + String(1000 + db.orders.length), idempotency_key: null, customer_id: c.id, customer_name: c.name, phone: c.phone, whatsapp: c.phone,
      email: null, status, payment_status: 'not_paid', payment_method: 'upi', items: q.items, subtotal: q.subtotal, delivery_charge: q.delivery_charge, discount: 0, total: q.total,
      advance_due: q.advance_due, amount_paid: 0, is_custom: false, quote_status: 'n/a', quote_note: null, fulfilment: fulfil,
      address: fulfil !== 'pickup' ? { line: '12, Demo Street', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' } : null,
      zone_id: null, needs_delivery_approval: false, requested_date: date, slot_id: slot.id, slot_label: slot.label, alt_date: null, alt_slot_label: null,
      confirmed_date: ['confirmed', 'in_preparation', 'completed'].includes(status) ? date : null, confirmed_slot_label: null, occasion: 'Birthday', occasion_date: date,
      notes: null, admin_notes: null, reference_images: [], created_at: created, updated_at: created, demo: true }
    db.orders.push(o)
    db.order_status_history.push({ id: uid(), order_id: o.id, from_status: null, to_status: status, note: 'Demo record', created_at: created })
    if (payFrac) db.payments.push({ id: uid(), order_id: o.id, kind: payFrac >= 1 ? 'balance' : 'advance', method: 'upi', amount: Math.round(q.total * payFrac),
      reference: 'DEMO' + db.payments.length, status: 'verified', created_at: created, verified_at: created })
    recalc(db, o.id)
  }
  const C = { weight: '1 kg', flavour: 'Chocolate' }
  mk(0, 160, cake, { ...C, flavour: 'Red velvet' }, 'completed', 1)
  mk(1, 120, entremet, { flavour: 'Coffee hazelnut' }, 'completed', 1)
  mk(2, 95, cookies, { flavour: 'Lotus Biscoff' }, 'completed', 1)
  mk(0, 70, brownie, { weight: '16 pieces', flavour: 'Walnut' }, 'completed', 1, 'courier')
  mk(3, 45, cake, { ...C, flavour: 'Pistachio' }, 'completed', 1)
  mk(4, 30, cake, { weight: '1.5 kg', flavour: 'Pecan' }, 'completed', 1)
  mk(2, 20, tres, {}, 'cancelled', 0)
  mk(5, 12, cookies, { flavour: 'Nutella' }, 'completed', 1)
  mk(0, 6, cake, { weight: '1 kg', flavour: 'Vanilla' }, 'completed', 1)
  mk(1, 0, choux, {}, 'awaiting_payment', 0, 'pickup', 4)
  mk(3, 0, brownie, { weight: '8 pieces', flavour: 'Classic' }, 'confirmed', 0.5, 'pickup', 3)
  mk(5, 0, cake, { weight: '1 kg', flavour: 'Lotus Biscoff' }, 'payment_verification', 0, 'pickup', 5)
  const pending = db.orders.at(-1)
  db.payments.push({ id: uid(), order_id: pending.id, kind: 'advance', method: 'upi', amount: pending.advance_due, reference: 'DEMO-UTR-4471', status: 'pending', note: 'Reported by customer', created_at: nowISO() })
  recalc(db, pending.id)
  const done = db.orders.filter((o) => o.status === 'completed')
  const words = [
    [5, 'The red velvet cake was so soft and the buttercream not too sweet. Everyone at the party asked where we ordered from!', true],
    [5, 'Coffee hazelnut entremets looked like they came from a five-star patisserie. Beautifully packed too.', true],
    [5, 'Brownies reached Chennai by courier perfectly fudgy. Ordering again for Diwali.', true],
    [4, 'Lovely pistachio cake, delivered right on time.', false],
  ]
  words.forEach(([rating, body, approved], i) => {
    const o = done[i]; if (!o) return
    const at = new Date(new Date(o.requested_date).getTime() + 864e5).toISOString()
    db.reviews.push({ id: uid(), order_id: o.id, rating, body, display_name: o.customer_name.replace(/^Demo · /, '').split(' ')[0], approved, approved_at: approved ? at : null, created_at: at })
  })
}

function recalc(db, orderId) {
  const o = db.orders.find((x) => x.id === orderId)
  if (!o) return
  const ps = db.payments.filter((p) => p.order_id === orderId)
  const paid = ps.filter((p) => p.kind !== 'refund' && p.status === 'verified').reduce((s, p) => s + p.amount, 0)
  const refunded = ps.filter((p) => p.kind === 'refund' && p.status === 'verified').reduce((s, p) => s + p.amount, 0)
  const refundPending = ps.some((p) => p.kind === 'refund' && p.status === 'pending')
  const proofs = ps.some((p) => p.kind !== 'refund' && p.status === 'pending')
  let st
  if (refundPending) st = 'refund_pending'
  else if (refunded > 0) st = 'refunded'
  else if (paid >= o.total && o.total > 0) st = 'fully_paid'
  else if (paid >= o.advance_due && paid > 0) st = 'advance_received'
  else if (proofs) st = 'verification_pending'
  else if (paid > 0) st = 'part_paid'
  else st = 'not_paid'
  let ns = o.status
  if (['awaiting_payment', 'payment_verification', 'submitted'].includes(o.status) && ['advance_received', 'fully_paid'].includes(st) && ['n/a', 'approved'].includes(o.quote_status)) ns = 'advance_received'
  else if (o.status === 'awaiting_payment' && st === 'verification_pending') ns = 'payment_verification'
  else if (o.status === 'payment_verification' && ['not_paid', 'part_paid'].includes(st)) ns = 'awaiting_payment'
  if (st === 'refund_pending' && o.status === 'cancelled') ns = 'refund_pending'
  if (st === 'refunded' && ['cancelled', 'refund_pending'].includes(o.status)) ns = 'refunded'
  o.amount_paid = paid - refunded
  o.payment_status = st
  if (ns !== o.status) setStatusRaw(db, o, ns, null)
}
function setStatusRaw(db, o, status, note) {
  if (o.status === status) return
  db.order_status_history.push({ id: uid(), order_id: o.id, from_status: o.status, to_status: status, note, actor: 'demo-admin', created_at: nowISO() })
  o.status = status
  o.updated_at = nowISO()
}

let cache = null
// another tab (e.g. the shop) placed an order → read the fresh copy next time
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) cache = null })
function load() {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { cache = null }
  if (!cache) { cache = freshDb(); save() }
  return cache
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch (e) { console.warn('Demo storage full', e) }
}
const err = (m) => { throw new Error(m) }
const newToken = () => Array.from({ length: 14 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
const view = (db, o) => ({
  ...o, balance: o.total - o.amount_paid, link_token: o.access_token || (o.access_token = newToken()),
  review: (() => { const r = (db.reviews || []).find((x) => x.order_id === o.id); return r ? { rating: r.rating, body: r.body, approved: r.approved, at: r.created_at } : null })(),
  history: db.order_status_history.filter((h) => h.order_id === o.id).map((h) => ({ to: h.to_status, at: h.created_at })),
  payments: db.payments.filter((p) => p.order_id === o.id).map((p) => ({ kind: p.kind, method: p.method, amount: p.amount, status: p.status, at: p.created_at })),
})
const attempts = []
function rateLimit(key, max, ms) {
  const t = Date.now()
  while (attempts.length && attempts[0].t < t - 864e5) attempts.shift()
  if (attempts.filter((a) => a.key === key && a.t > t - ms).length >= max) err('RATE_LIMIT: too many attempts, please wait a few minutes')
  attempts.push({ key, t })
}
function getSess() { try { return JSON.parse(localStorage.getItem(SESSION) || 'null') } catch { return null } }
function setSess(s) { try { s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION) } catch { /* ignore */ } }
function audit(db, action, entity, id, details) {
  db.audit_logs.push({ id: db.audit_logs.length + 1, actor: 'demo-admin', action, entity, entity_id: id, details, created_at: nowISO() })
  if (db.audit_logs.length > 500) db.audit_logs.splice(0, db.audit_logs.length - 500)
}

export function createDemoApi() {
  const ctx = () => { const db = load(); return { products: db.products, addons: db.addons, zones: db.delivery_zones, settings: db.settings } }
  const myCustomer = (db) => {
    const s = getSess()
    if (!s?.customer) return null
    return db.customers.find((c) => (s.customer.phone && c.phone === normalizePhone(s.customer.phone)) || (s.customer.email && c.email?.toLowerCase() === s.customer.email.toLowerCase())) || null
  }
  const profile = (db) => {
    const c = myCustomer(db)
    if (!c) return { customer: null }
    return {
      customer: { name: c.name, phone: c.phone, whatsapp: c.whatsapp, email: c.email, marketing_consent: c.marketing_consent },
      addresses: db.customer_addresses.filter((a) => a.customer_id === c.id),
      occasions: db.occasions.filter((o) => o.customer_id === c.id),
      orders: db.orders.filter((o) => o.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => view(db, o)),
    }
  }

  return {
    mode: 'demo',
    async loadStore() {
      await sleep(120)
      const db = load()
      return clone({ settings: db.settings, categories: db.categories.sort((a, b) => a.sort - b.sort), products: db.products.sort((a, b) => a.sort - b.sort),
        addons: db.addons, slots: db.time_slots, zones: db.delivery_zones })
    },
    async availability(from, to, productIds = [], mode = 'pickup') {
      const db = load()
      return availCalc({ settings: db.settings, slots: db.time_slots, blackouts: db.blackout_dates, orders: db.orders, products: db.products, from, to, productIds, mode })
    },
    async quote(payload) { return quoteCalc(payload, ctx()) },
    async placeOrder(p) {
      await sleep(400)
      const db = load()
      if (p.idempotency_key) {
        const dup = db.orders.find((o) => o.idempotency_key === p.idempotency_key)
        if (dup) return { order_number: dup.order_number, duplicate: true, total: dup.total, advance_due: dup.advance_due, status: dup.status, link_token: dup.access_token }
      }
      const phone = normalizePhone(p.phone)
      const wa = normalizePhone(p.whatsapp || p.phone)
      if (!String(p.name || '').trim()) err('INVALID: please enter your name')
      if (!phone) err('INVALID: please enter a valid mobile number')
      if (!(p.items || []).length) err('INVALID: your cart is empty')
      if (!['pickup', 'delivery', 'courier'].includes(p.fulfilment)) err('INVALID: choose pickup or courier')
      if (!p.accepted_policies) err('INVALID: please accept the ordering policy')
      const s = db.settings
      if (s.orders_paused && (!s.orders_paused_until || todayISO() < s.orders_paused_until)) err('PAUSED: ' + (s.orders_paused_message || 'We are not taking new orders right now.'))
      if (p.fulfilment === 'delivery' && !s.home_delivery_enabled) err('INVALID: home delivery is not available — please choose self pickup')
      const method = p.payment_method || 'upi'
      if (method === 'cash' && (s.cash_for || 'both') === 'balance') err('INVALID: the advance must be paid online/UPI; cash is accepted for the balance only')
      if (method === 'cash' && p.fulfilment === 'courier') err('INVALID: courier orders are paid by UPI')
      if (method === 'cash' && p.fulfilment === 'pickup' && !s.cash_pickup) err('INVALID: cash is not available for pickup orders')
      if (method === 'cash' && p.fulfilment === 'delivery' && !s.cash_delivery) err('INVALID: cash is not available for delivery orders')
      if (method === 'gateway' && !s.gateway_enabled) err('INVALID: online payment is not enabled')
      const q = quoteCalc(p, ctx())
      let needsZone = false
      if (p.fulfilment === 'courier') {
        if (!s.courier_enabled) err('INVALID: courier is not available right now')
        if (q.items.some((i) => !db.products.find((x) => x.id === i.product_id)?.courier_ok)) err('INVALID: some items in your cart cannot be couriered — please choose self pickup')
        if (!String(p.address?.line || '').trim() || !String(p.address?.pincode || '').trim()) err('INVALID: please enter the full courier address and PIN code')
        needsZone = true
      }
      if (p.fulfilment === 'delivery') {
        if (!String(p.address?.line || '').trim() || !String(p.address?.pincode || '').trim()) err('INVALID: please enter the full delivery address and PIN code')
        if (!q.zone_found) { if (p.request_out_of_zone) needsZone = true; else err('OUT_OF_ZONE: sorry, we do not deliver to this PIN code yet') }
      }
      const courierNoSlot = p.fulfilment === 'courier' && !p.slot_id
      const slot = courierNoSlot ? { id: null, label: 'Courier dispatch' } : db.time_slots.find((x) => x.id === p.slot_id && x.active !== false)
      if (!slot) err('SLOT_UNAVAILABLE: please choose a time slot')
      const av = availCalc({ settings: s, slots: db.time_slots, blackouts: db.blackout_dates, orders: db.orders, products: db.products, from: p.date, to: p.date,
        productIds: q.items.map((i) => i.product_id), mode: p.fulfilment })
      if (courierNoSlot ? !av.days[0]?.available : !av.days[0]?.slots.find((x) => x.id === slot.id)?.eligible) err(`SLOT_UNAVAILABLE: that date/time is no longer available (please order ${av.lead_hours} hrs prior). Please pick another slot.`)

      let c = db.customers.find((x) => x.phone === phone)
      if (!c) {
        c = { id: uid(), name: p.name.trim().toUpperCase(), phone, phone_verified: false, whatsapp: wa, email: p.email || null, marketing_consent: !!p.marketing_consent,
          consent_at: p.marketing_consent ? nowISO() : null, preferred_reminder: 'whatsapp', notes: null, created_at: nowISO(), state: p.state || null, city: p.city || null }
        db.customers.push(c)
      } else {
        c.whatsapp = c.whatsapp || wa
        c.email = c.email || p.email || null
        if (p.state) c.state = p.state
        if (p.city) c.city = p.city
        if (p.marketing_consent && !c.marketing_consent) { c.marketing_consent = true; c.consent_at = nowISO() }
      }
      if (p.fulfilment !== 'pickup' && p.save_address !== false && !db.customer_addresses.some((a) => a.customer_id === c.id && a.line.toLowerCase() === p.address.line.trim().toLowerCase()))
        db.customer_addresses.push({ id: uid(), customer_id: c.id, label: 'Home', ...p.address, line: p.address.line.trim(), created_at: nowISO() })
      const isCustom = q.items.some((i) => i.custom_request)
      const status = isCustom || needsZone || method === 'cash' ? 'submitted' : 'awaiting_payment'
      const d = new Date()
      const yy = String(d.getFullYear()).slice(2)
      db.counters = db.counters || {}
      let num
      do { db.counters[yy] = (db.counters[yy] || 0) + 1; num = `PT-${db.counters[yy]}-${yy}` } while (db.orders.some((x) => x.order_number === num))
      const zone = db.delivery_zones.find((z) => z.name === q.zone)
      const o = { id: uid(), order_number: num, idempotency_key: p.idempotency_key || null, customer_id: c.id, customer_name: p.name.trim().toUpperCase(), phone, whatsapp: wa, email: p.email || null,
        customer_state: c.state || null, customer_city: c.city || null, access_token: newToken(),
        status, payment_status: 'not_paid', payment_method: method, items: q.items, subtotal: q.subtotal, delivery_charge: q.delivery_charge, discount: 0, total: q.total,
        advance_due: q.advance_due, amount_paid: 0, is_custom: isCustom, quote_status: isCustom ? 'pending' : 'n/a', quote_note: null, fulfilment: p.fulfilment,
        address: p.fulfilment !== 'pickup' ? p.address : null, zone_id: zone?.id || null, needs_delivery_approval: needsZone, requested_date: p.date, slot_id: slot.id,
        slot_label: slot.label, alt_date: p.alt_date || null, alt_slot_label: p.alt_slot_label || null, confirmed_date: null, confirmed_slot_label: null,
        occasion: p.occasion || null, occasion_date: p.occasion_date || null, notes: (p.notes || '').slice(0, 1000), admin_notes: null,
        reference_images: q.items.flatMap((i) => i.reference_images || []), created_at: nowISO(), updated_at: nowISO() }
      db.orders.push(o)
      db.order_status_history.push({ id: uid(), order_id: o.id, from_status: null, to_status: status, note: 'Order placed', created_at: nowISO() })
      if (p.remember_occasion && p.occasion_date)
        db.occasions.push({ id: uid(), customer_id: c.id, kind: p.occasion || 'Other', person_name: p.occasion_person || null, occasion_date: p.occasion_date, repeats: true,
          preferred_flavour: q.items[0]?.flavour, last_order_id: o.id, source: 'checkout', created_at: nowISO() })
      save()
      return { order_number: num, status, total: o.total, advance_due: o.advance_due, subtotal: o.subtotal, delivery_charge: o.delivery_charge, is_custom: isCustom, needs_delivery_approval: needsZone, duplicate: false, link_token: o.access_token }
    },
    async uploadFile(kind, file) {
      // demo: keep a small data-URL copy in this browser
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
    },
    async getOrder(number, phone) {
      await sleep(200)
      const db = load()
      rateLimit('lookup:' + normalizePhone(phone), 10, 6e5)
      const o = db.orders.find((x) => x.order_number === String(number).trim().toUpperCase() && x.phone === normalizePhone(phone))
      if (!o) err('NOT_FOUND: we could not find an order with that number and mobile')
      return clone(view(db, o))
    },
    async getOrderByLink(token) {
      await sleep(150)
      const db = load()
      const o = db.orders.find((x) => x.access_token && x.access_token === String(token || '').trim())
      if (!o) err('NOT_FOUND: this order link is not valid')
      return clone({ ...view(db, o), phone: o.phone })
    },
    async submitReview(token, rating, body) {
      await sleep(200)
      const db = load()
      rateLimit('review:' + token, 5, 6e5)
      const o = db.orders.find((x) => x.access_token && x.access_token === String(token || '').trim())
      if (!o) err('NOT_FOUND: this order link is not valid')
      const d = o.confirmed_date || o.requested_date
      if (!['advance_received', 'confirmed', 'in_preparation', 'ready', 'out_for_delivery', 'completed'].includes(o.status) || (o.status !== 'completed' && d > todayISO()))
        err('INVALID: you can review once your order has been handed over')
      if (!(rating >= 1 && rating <= 5)) err('INVALID: please choose 1 to 5 stars')
      if (String(body || '').trim().length < 3) err('INVALID: please write a few words')
      if (db.reviews.some((r) => r.order_id === o.id)) err('INVALID: you have already reviewed this order — thank you!')
      const first = o.customer_name.replace(/^Demo · /, '').trim().split(/\s+/)[0]
      db.reviews.push({ id: uid(), order_id: o.id, rating, body: String(body).trim().slice(0, 600), display_name: first.charAt(0) + first.slice(1).toLowerCase(), approved: false, approved_at: null, created_at: nowISO() })
      save()
      return clone({ ...view(db, o), phone: o.phone })
    },
    async publicReviews() {
      const db = load()
      return clone((db.reviews || []).filter((r) => r.approved).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30)
        .map((r) => ({ name: r.display_name, rating: r.rating, body: r.body, at: r.created_at, order_number: db.orders.find((o) => o.id === r.order_id)?.order_number })))
    },
    async getOrdersByPhone(phone) {
      await sleep(200)
      const db = load()
      const v = normalizePhone(phone)
      if (!v) err('INVALID: please enter a valid mobile number')
      rateLimit('phone:' + v, 10, 6e5)
      return clone(db.orders.filter((o) => o.phone === v).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => { const x = view(db, o); delete x.address; delete x.payments; return x }))
    },
    async submitProof(number, phone, reference, path, amount) {
      const db = load()
      rateLimit('proof:' + normalizePhone(phone), 6, 6e5)
      const o = db.orders.find((x) => x.order_number === String(number).trim().toUpperCase() && x.phone === normalizePhone(phone))
      if (!o) err('NOT_FOUND: order not found')
      if (['cancelled', 'refunded', 'refund_pending', 'completed'].includes(o.status)) err('INVALID: this order is closed')
      if (!String(reference || '').trim() && !path) err('INVALID: please upload the payment screenshot')
      if (String(reference || '').trim() && db.payments.some((p) => p.order_id === o.id && p.reference === String(reference).trim() && p.status !== 'rejected')) return clone(view(db, o))
      db.payments.push({ id: uid(), order_id: o.id, kind: o.amount_paid >= o.advance_due ? 'balance' : 'advance', method: 'upi',
        amount: Math.max(amount ?? o.advance_due - o.amount_paid, 0), reference: reference?.trim() || null, status: 'pending', proof_path: path || null, note: 'Reported by customer', created_at: nowISO() })
      recalc(db, o.id)
      save()
      return clone(view(db, o))
    },
    async sendOtp() { await sleep(300); return { hint: 'Demo mode: use code 123456' } },
    async verifyOtp({ email, phone, token }) {
      if (token !== '123456') err('INVALID: that code is not correct')
      setSess({ ...(getSess() || {}), customer: { email: email || null, phone: phone || null } })
    },
    async session() { return getSess()?.customer || null },
    async signOut() { const s = getSess() || {}; delete s.customer; setSess(s) },
    async myProfile() { return clone(profile(load())) },
    async saveOccasion(p) {
      const db = load()
      const c = myCustomer(db)
      if (!c) err('NOT_FOUND: place your first order to create a profile')
      if (p.id) {
        const i = db.occasions.findIndex((o) => o.id === p.id && o.customer_id === c.id)
        if (p.delete) db.occasions.splice(i, 1)
        else Object.assign(db.occasions[i], { kind: p.kind, person_name: p.person_name, occasion_date: p.occasion_date })
      } else db.occasions.push({ id: uid(), customer_id: c.id, kind: p.kind || 'Birthday', person_name: p.person_name, occasion_date: p.occasion_date, repeats: true, source: 'customer', created_at: nowISO() })
      save()
      return clone(profile(db))
    },
    async updateProfile(p) {
      const db = load()
      const c = myCustomer(db)
      if (!c) err('NOT_FOUND: place your first order to create a profile')
      if (p.name) c.name = p.name
      if (p.email) c.email = p.email
      if (typeof p.marketing_consent === 'boolean') {
        if (p.marketing_consent && !c.marketing_consent) c.consent_at = nowISO()
        if (!p.marketing_consent && c.marketing_consent) c.opted_out_at = nowISO()
        c.marketing_consent = p.marketing_consent
      }
      save()
      return clone(profile(db))
    },
    async gateway() { err('Online payments are not configured in demo mode') },

    // ---- admin ----
    async signIn(email, password) {
      if (password !== DEMO_ADMIN_PASSWORD) err(`INVALID: demo password is ${DEMO_ADMIN_PASSWORD}`)
      setSess({ ...(getSess() || {}), admin: { email } })
    },
    async signUp(email, password) { await this.signIn(email, password); return true },
    async adminState() {
      const a = getSess()?.admin
      return a ? { user: { id: 'demo-admin', email: a.email }, isAdmin: true, role: 'owner' } : { user: null, isAdmin: false }
    },
    async resetPassword() { err('Demo mode: password reset e-mails work once the bakery database is connected') },
    async recoveryReady() { return false },
    async sendDeleteCode() { /* demo: the code is always 123456 */ },
    async verifyDeleteCode(email, token) { if (String(token).trim() !== '123456') err('INVALID: wrong code (demo code is 123456)'); setSess({ ...(getSess() || {}), codeAt: Date.now() }) },
    async deleteCustomer(id) {
      const s = getSess() || {}
      if (!s.codeAt || Date.now() - s.codeAt > 600000) err('CONFIRM: please confirm with the code sent to the bakery e-mail')
      const db = load()
      db.customers = db.customers.filter((c) => c.id !== id)
      db.customer_addresses = db.customer_addresses.filter((a) => a.customer_id !== id)
      db.occasions = db.occasions.filter((o) => o.customer_id !== id)
      db.orders.forEach((o) => { if (o.customer_id === id) o.customer_id = null })
      save(); return { deleted: true }
    },
    async updatePassword() {},
    async adminSignOut() { const s = getSess() || {}; delete s.admin; setSess(s) },
    async claimFirstAdmin() { return true },
    async list(table) {
      const db = load()
      if (table === 'admins') return [{ user_id: 'demo-admin', email: getSess()?.admin?.email || 'demo', role: 'owner', created_at: nowISO() }]
      return clone(db[table] || [])
    },
    async insert(table, row) {
      const db = load()
      const r = { id: table === 'blackout_dates' ? undefined : uid(), created_at: nowISO(), ...row }
      if (table === 'blackout_dates') { db.blackout_dates = db.blackout_dates.filter((b) => b.day !== row.day); delete r.id }
      db[table].push(r)
      if (table === 'payments') { if (r.status === 'verified') r.verified_at = nowISO(); recalc(db, r.order_id) }
      audit(db, 'insert', table, r.id || r.day, null)
      save()
      return clone(r)
    },
    async update(table, id, patch) {
      const db = load()
      const key = table === 'blackout_dates' ? 'day' : 'id'
      const r = db[table].find((x) => x[key] === id)
      if (!r) err('NOT_FOUND')
      const diff = {}
      for (const k of Object.keys(patch)) if (JSON.stringify(r[k]) !== JSON.stringify(patch[k])) diff[k] = { from: r[k], to: patch[k] }
      if (table === 'orders' && 'status' in patch) { setStatusRaw(db, r, patch.status, null); delete patch.status }
      Object.assign(r, patch, { updated_at: nowISO() })
      if (table === 'payments') { if (r.status === 'verified' && !r.verified_at) r.verified_at = nowISO(); recalc(db, r.order_id) }
      if (table === 'orders' && ('total' in patch || 'advance_due' in patch)) recalc(db, r.id)
      if (Object.keys(diff).length) audit(db, 'update', table, id, diff)
      save()
      return clone(r)
    },
    async remove(table, id) {
      const db = load()
      const key = table === 'blackout_dates' ? 'day' : 'id'
      const r = db[table].find((x) => x[key] === id)
      db[table] = db[table].filter((x) => x[key] !== id)
      if (table === 'payments' && r) recalc(db, r.order_id)
      if (table === 'customers') { db.occasions = db.occasions.filter((o) => o.customer_id !== id); db.customer_addresses = db.customer_addresses.filter((o) => o.customer_id !== id) }
      if (table === 'orders') { db.reviews = (db.reviews || []).filter((p) => p.order_id !== id); db.payments = db.payments.filter((p) => p.order_id !== id); db.order_status_history = db.order_status_history.filter((p) => p.order_id !== id) }
      audit(db, 'delete', table, id, r)
      save()
    },
    async setStatus(orderId, status, note) {
      const db = load()
      const o = db.orders.find((x) => x.id === orderId)
      setStatusRaw(db, o, status, note)
      save()
    },
    async saveSettings(data) { const db = load(); audit(db, 'update', 'settings', '1', null); db.settings = clone(data); save() },
    async fileUrl(path) { return path },
    async uploadProductImage(file) { return this.uploadFile('product', file) },
    resetDemo() { cache = freshDb(); save() },
    clearDemoRecords() {
      const db = load()
      const ids = new Set(db.orders.filter((o) => o.demo).map((o) => o.id))
      db.orders = db.orders.filter((o) => !o.demo)
      db.payments = db.payments.filter((p) => !ids.has(p.order_id))
      db.order_status_history = db.order_status_history.filter((p) => !ids.has(p.order_id))
      const cids = new Set(db.customers.filter((c) => c.demo).map((c) => c.id))
      db.customers = db.customers.filter((c) => !c.demo)
      db.occasions = db.occasions.filter((o) => !cids.has(o.customer_id))
      save()
    },
  }
}
