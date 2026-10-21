// Business metrics computed from real order/payment records.
import { todayISO, addDaysISO, dowISO, nextOccurrence, diffDays } from './dates.js'

const DEAD = ['cancelled', 'refund_pending', 'refunded', 'draft']
export const isLive = (o) => !DEAD.includes(o.status)
export const orderDate = (o) => o.confirmed_date || o.requested_date
export const placedDay = (o, tz = 'Asia/Kolkata') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(o.created_at))

export function periodRange(key, today = todayISO()) {
  const y = today.slice(0, 4), m = today.slice(0, 7)
  switch (key) {
    case 'today': return [today, today]
    case 'week': return [addDaysISO(today, -6), today]
    case 'month': return [m + '-01', today]
    case 'last_month': { const d = addDaysISO(m + '-01', -1); return [d.slice(0, 7) + '-01', d] }
    case 'ytd': return [y + '-01-01', today]
    case 'last_year': return [`${+y - 1}-01-01`, `${+y - 1}-12-31`]
    case '90': return [addDaysISO(today, -89), today]
    default: return ['2000-01-01', today]
  }
}

// Sales are attributed to the date the order was PLACED.
export function salesSummary(orders, payments, [from, to], tz) {
  const inRange = orders.filter((o) => { const d = placedDay(o, tz); return d >= from && d <= to })
  const live = inRange.filter(isLive)
  const gross = live.reduce((s, o) => s + o.subtotal + o.delivery_charge, 0)
  const discounts = live.reduce((s, o) => s + (o.discount || 0), 0)
  const pay = payments.filter((p) => p.status === 'verified' && (p.verified_at || p.created_at).slice(0, 10) >= from && (p.verified_at || p.created_at).slice(0, 10) <= to)
  const collected = pay.filter((p) => p.kind !== 'refund').reduce((s, p) => s + p.amount, 0)
  const refunds = pay.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0)
  const outstanding = orders.filter((o) => isLive(o) && o.status !== 'draft').reduce((s, o) => s + Math.max(o.total - o.amount_paid, 0), 0)
  const cancelled = inRange.filter((o) => !isLive(o)).length
  const days = Math.max(diffDays(from, to) + 1, 1)
  return {
    count: live.length, gross, discounts, net: gross - discounts, collected, refunds, netCollected: collected - refunds, outstanding,
    aov: live.length ? Math.round((gross - discounts) / live.length) : 0, perDay: +(live.length / days).toFixed(2),
    cancelRate: inRange.length ? Math.round((cancelled / inRange.length) * 100) : 0, cancelled,
  }
}

export function monthlySeries(orders, months = 12, today = todayISO(), tz) {
  const keys = []
  let d = today.slice(0, 7) + '-01'
  for (let i = 0; i < months; i++) { keys.unshift(d.slice(0, 7)); d = addDaysISO(d, -1).slice(0, 7) + '-01' }
  const map = Object.fromEntries(keys.map((k) => [k, { key: k, value: 0, count: 0 }]))
  for (const o of orders.filter(isLive)) {
    const k = placedDay(o, tz).slice(0, 7)
    if (map[k]) { map[k].value += o.total; map[k].count++ }
  }
  return keys.map((k) => map[k])
}

const tally = (rows, keyFn, valFn = () => 1) => {
  const m = new Map()
  for (const r of rows) for (const k of [].concat(keyFn(r) || [])) if (k) m.set(k, (m.get(k) || 0) + valFn(r))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export function productStats(orders) {
  const items = orders.filter(isLive).flatMap((o) => o.items.map((i) => ({ ...i, _o: o })))
  return {
    byCount: tally(items, (i) => i.name, (i) => i.qty),
    byRevenue: tally(items, (i) => i.name, (i) => i.line_total),
    flavours: tally(items, (i) => i.flavour, (i) => i.qty),
    sizes: tally(items, (i) => i.weight, (i) => i.qty),
    addons: tally(items.flatMap((i) => i.addons || []), (a) => a.name, (a) => a.qty),
    designs: tally(items, (i) => i.design, (i) => i.qty),
    custom: items.filter((i) => i.custom_request).length,
    total: items.length,
  }
}

export function categoryStats(orders, products, categories) {
  const catOf = (pid) => categories.find((c) => c.id === products.find((p) => p.id === pid)?.category_id)?.name || 'Other'
  return tally(orders.filter(isLive).flatMap((o) => o.items), (i) => catOf(i.product_id), (i) => i.line_total)
}

export function decliningProducts(orders, today = todayISO(), tz) {
  const recent = [addDaysISO(today, -44), today], prior = [addDaysISO(today, -89), addDaysISO(today, -45)]
  const cnt = ([a, b]) => tally(orders.filter((o) => isLive(o) && placedDay(o, tz) >= a && placedDay(o, tz) <= b).flatMap((o) => o.items), (i) => i.name, (i) => i.qty)
  const r = Object.fromEntries(cnt(recent)), p = cnt(prior)
  return p.map(([name, before]) => ({ name, before, now: r[name] || 0 })).filter((x) => x.now < x.before).sort((a, b) => (a.now - a.before) - (b.now - b.before))
}

// Per-customer stats (used by customer list, profiles & segmentation)
export function customerStats(customers, orders) {
  const by = new Map(customers.map((c) => [c.id, { c, orders: [], completed: 0, spend: 0, cancelled: 0, first: null, last: null }]))
  for (const o of orders) {
    const s = by.get(o.customer_id)
    if (!s) continue
    s.orders.push(o)
    if (o.status === 'cancelled' || o.status === 'refunded' || o.status === 'refund_pending') s.cancelled++
    if (isLive(o)) {
      s.spend += o.total
      if (o.status === 'completed') s.completed++
      const d = o.created_at.slice(0, 10)
      if (!s.first || d < s.first) s.first = d
      if (!s.last || d > s.last) s.last = d
    }
  }
  for (const s of by.values()) {
    const live = s.orders.filter(isLive)
    s.count = live.length
    s.aov = live.length ? Math.round(s.spend / live.length) : 0
    const items = live.flatMap((o) => o.items)
    s.favFlavour = tally(items, (i) => i.flavour)[0]?.[0] || null
    s.favSize = tally(items, (i) => i.weight)[0]?.[0] || null
    s.favDesign = tally(items, (i) => i.design)[0]?.[0] || null
    s.favProduct = tally(items, (i) => i.name)[0]?.[0] || null
    s.prefMode = tally(live, (o) => o.fulfilment)[0]?.[0] || null
    s.custom = items.some((i) => i.custom_request)
  }
  return by
}

export const SEGMENTS = [
  { id: 'new', label: 'New customers', test: (s) => s.completed === 1 },
  { id: 'repeat', label: 'Repeat customers', test: (s) => s.completed >= 2 },
  { id: 'frequent', label: 'Frequent customers', test: (s, cfg) => s.count >= (cfg.frequent_orders || 4) },
  { id: 'high', label: 'High-spend customers', test: (s, cfg) => s.spend >= (cfg.high_spend || 5000) },
  { id: 'birthday', label: 'Birthday customers', test: (s, cfg, occ) => occ.some((o) => /birthday/i.test(o.kind)) || s.orders.some((o) => o.occasion === 'Birthday') },
  { id: 'anniversary', label: 'Anniversary customers', test: (s, cfg, occ) => occ.some((o) => /anniversary/i.test(o.kind)) || s.orders.some((o) => o.occasion === 'Anniversary') },
  { id: 'custom', label: 'Custom-cake customers', test: (s) => s.custom },
  { id: 'inactive', label: 'Inactive customers', test: (s, cfg, occ, today) => s.count > 0 && diffDays(s.last, today) > (cfg.inactive_days || 120) },
]

// Upcoming yearly occasions, from saved dates AND last year's occasion orders
export function upcomingOccasions({ occasions, orders, customers }, days = 60, today = todayISO()) {
  const end = addDaysISO(today, days)
  const out = []
  for (const o of occasions) {
    if (!o.repeats && o.occasion_date < today) continue
    const next = o.repeats ? nextOccurrence(o.occasion_date, today) : o.occasion_date
    if (next <= end) out.push({ source: 'saved', occasion: o, customer: customers.find((c) => c.id === o.customer_id), next, inDays: diffDays(today, next) })
  }
  // customers who ordered for an occasion last year but haven't saved the date
  const lastYearFrom = addDaysISO(today, -365), lastYearTo = addDaysISO(end, -365)
  for (const ord of orders) {
    const d = ord.occasion_date || (ord.occasion ? orderDate(ord) : null)
    if (!d || !ord.occasion || d < lastYearFrom || d > lastYearTo) continue
    if (out.some((x) => x.customer?.id === ord.customer_id && x.occasion.kind === ord.occasion)) continue
    const next = nextOccurrence(d, today)
    out.push({ source: 'last_year_order', occasion: { kind: ord.occasion, occasion_date: d, person_name: null, last_order: ord }, customer: customers.find((c) => c.id === ord.customer_id), next, inDays: diffDays(today, next) })
  }
  return out.sort((a, b) => a.next.localeCompare(b.next))
}

export function weekdayWeekend(orders) {
  let wd = 0, we = 0
  for (const o of orders.filter(isLive)) { const d = dowISO(orderDate(o)); if (d === 0 || d === 6) we++; else wd++ }
  return { weekday: wd, weekend: we }
}
export const areaStats = (orders) => tally(orders.filter((o) => isLive(o) && o.fulfilment === 'delivery'), (o) => o.address?.area || o.address?.pincode || 'Unknown')
export const occasionStats = (orders) => tally(orders.filter(isLive), (o) => o.occasion || 'None given')
export const monthOfYear = (orders) => tally(orders.filter(isLive), (o) => orderDate(o).slice(5, 7))

// ---- Owner insights: month summary, best customers, best sellers, estimated profit ----
const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) + 1
export function ownerInsights({ orders, customers, products }, today = todayISO(), tz) {
  const live = orders.filter(isLive)
  const month = today.slice(0, 7)
  const inMonth = live.filter((o) => placedDay(o, tz).slice(0, 7) === month)
  const stats = customerStats(customers, orders)
  const all = [...stats.values()].filter((x) => x.count > 0)
  const byCust = new Map()
  for (const o of inMonth) byCust.set(o.customer_id, (byCust.get(o.customer_id) || 0) + o.total - (o.discount || 0))
  const name = (id) => stats.get(id)?.c.name || 'Unknown'
  const topMonth = [...byCust.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => ({ id, name: name(id), value: v }))
  const bestAll = all.slice().sort((a, b) => b.spend - a.spend).slice(0, 3).map((x) => ({ id: x.c.id, name: x.c.name, value: x.spend, orders: x.count }))
  const perMonth = all.map((x) => ({ id: x.c.id, name: x.c.name, months: monthsBetween(x.first, today), value: Math.round(x.spend / monthsBetween(x.first, today)), orders: x.count }))
    .sort((a, b) => b.value - a.value).slice(0, 3)
  const prodAgg = (list) => {
    const m = new Map()
    for (const i of list.flatMap((o) => o.items)) {
      const r = m.get(i.name) || { name: i.name, product_id: i.product_id, qty: 0, revenue: 0 }
      r.qty += i.qty; r.revenue += i.line_total; m.set(i.name, r)
    }
    return [...m.values()].map((r) => {
      const p = products.find((x) => x.id === r.product_id)
      const pct = p?.cost_percent
      return { ...r, costPct: pct ?? null, profit: pct == null || pct === '' ? null : Math.round(r.revenue * (1 - pct / 100)) }
    })
  }
  const pm = prodAgg(inMonth), pa = prodAgg(live)
  const missingCost = products.filter((p) => p.is_active && (p.cost_percent == null || p.cost_percent === '')).length
  const sales = inMonth.reduce((s, o) => s + o.total - (o.discount || 0), 0)
  const lastKey = addDaysISO(month + '-01', -1).slice(0, 7)
  const lastSales = live.filter((o) => placedDay(o, tz).slice(0, 7) === lastKey).reduce((s, o) => s + o.total - (o.discount || 0), 0)
  return {
    month: { sales, lastSales, orders: inMonth.length, aov: inMonth.length ? Math.round(sales / inMonth.length) : 0,
      newCustomers: all.filter((x) => x.first?.slice(0, 7) === month).length },
    topMonth, bestAll, perMonth,
    bestSellerMonth: pm.sort((a, b) => b.qty - a.qty)[0] || null,
    bestSellerAll: pa.slice().sort((a, b) => b.qty - a.qty)[0] || null,
    topRevenueAll: pa.slice().sort((a, b) => b.revenue - a.revenue)[0] || null,
    profitable: pa.filter((r) => r.profit != null).sort((a, b) => b.profit - a.profit).slice(0, 3),
    missingCost,
  }
}
