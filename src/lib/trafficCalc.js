// Mirror of SQL admin_traffic() for demo mode, plus a month of sample visits so the demo page isn't empty.
const IST = 5.5 * 3600e3
const day = (ms) => new Date(ms + IST).toISOString().slice(0, 10)
const hour = (ms) => new Date(ms + IST).getUTCHours()
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const pageOf = (p) => !p || p === '/' ? '/' : p.startsWith('/cake/') ? '/cake' : p.startsWith('/menu/') ? '/menu' : p.startsWith('/order/') || p.startsWith('/o/') ? '/order' : p.split('?')[0]
const count = (arr, key) => { const m = new Map(); arr.forEach((x) => { const k = key(x); m.set(k, (m.get(k) || 0) + 1) }); return m }
const desc = (m, name, val) => [...m].map(([k, v]) => ({ [name]: k, [val]: v })).sort((a, b) => b[val] - a[val])

export function trafficSummary(all, days = 7, db = {}) {
  days = Math.min(Math.max(+days || 7, 1), 400)
  const now = Date.now()
  const d0 = addDays(day(now), -(days - 1))
  const t0 = Date.parse(d0 + 'T00:00:00+05:30'), pt0 = t0 - days * 864e5, pt1 = now - days * 864e5
  const ev = all.map((e) => ({ ...e, t: Date.parse(e.at) })).sort((a, b) => a.t - b.t)
  const e = ev.filter((x) => x.t >= t0 && x.t <= now)
  const firstSeen = new Map(); ev.forEach((x) => { if (!firstSeen.has(x.visitor)) firstSeen.set(x.visitor, x.t) })
  const ses = new Map(), vis = new Map()
  for (const x of e) {
    const s = ses.get(x.session) || ses.set(x.session, { source: x.source || 'direct', device: x.device, app: false, views: 0, events: 0, first: x.t, last: x.t, k: new Set() }).get(x.session)
    s.events++; if (x.kind === 'view') s.views++; s.app ||= !!x.app; s.last = x.t; s.k.add(x.kind)
    if (!vis.has(x.visitor)) vis.set(x.visitor, { device: x.device || 'mobile', os: x.os || 'Other', browser: x.browser || 'Other', isNew: firstSeen.get(x.visitor) >= t0 })
  }
  const S = [...ses.values()], Vv = [...vis.values()]
  const has = (s, ...k) => k.some((q) => s.k.has(q))
  const prevE = ev.filter((x) => x.t >= pt0 && x.t <= pt1)
  const daily = []
  for (let d = d0; d <= day(now); d = addDays(d, 1)) {
    const de = e.filter((x) => day(x.t) === d)
    daily.push({ day: d, visitors: new Set(de.map((x) => x.visitor)).size, views: de.filter((x) => x.kind === 'view').length, orders: new Set(de.filter((x) => x.kind === 'order').map((x) => x.session)).size })
  }
  const views = e.filter((x) => x.kind === 'view')
  const pages = new Map()
  views.forEach((x) => { const p = pageOf(x.path); const r = pages.get(p) || pages.set(p, { page: p, views: 0, v: new Set() }).get(p); r.views++; r.v.add(x.visitor) })
  const prods = new Map()
  e.filter((x) => x.product_id).forEach((x) => { const r = prods.get(x.product_id) || prods.set(x.product_id, { id: x.product_id, views: 0, carts: 0 }).get(x.product_id); if (x.kind === 'product') r.views++; if (x.kind === 'cart') r.carts++ })
  const srcM = new Map(); S.forEach((s) => { const r = srcM.get(s.source) || srcM.set(s.source, { source: s.source, sessions: 0, orders: 0 }).get(s.source); r.sessions++; if (s.k.has('order')) r.orders++ })
  const multi = S.filter((s) => s.events > 1)
  return {
    days, from: d0,
    live: new Set(ev.filter((x) => x.t > now - 5 * 60e3).map((x) => x.visitor)).size,
    totals: {
      visitors: Vv.length, new_visitors: Vv.filter((v) => v.isNew).length, sessions: S.length, views: views.length,
      order_sessions: S.filter((s) => s.k.has('order')).length, bounce: S.filter((s) => s.events <= 1).length,
      avg_secs: multi.length ? Math.round(multi.reduce((a, s) => a + (s.last - s.first) / 1000, 0) / multi.length) : 0,
      app_sessions: S.filter((s) => s.app).length,
      orders: (db.orders || []).filter((o) => Date.parse(o.created_at) >= t0 && o.status !== 'draft').length,
    },
    previous: { visitors: new Set(prevE.map((x) => x.visitor)).size, sessions: new Set(prevE.map((x) => x.session)).size, views: prevE.filter((x) => x.kind === 'view').length, order_sessions: new Set(prevE.filter((x) => x.kind === 'order').map((x) => x.session)).size },
    daily,
    hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, views: views.filter((x) => hour(x.t) === h).length })),
    sources: [...srcM.values()].sort((a, b) => b.sessions - a.sessions),
    referrers: desc(count(e.filter((x) => x.ref), (x) => x.ref), 'ref', 'visits').slice(0, 8),
    devices: desc(count(Vv, (v) => v.device), 'device', 'visitors'),
    os: desc(count(Vv, (v) => v.os), 'os', 'visitors'),
    browsers: desc(count(Vv, (v) => v.browser), 'browser', 'visitors'),
    pages: [...pages.values()].map((r) => ({ page: r.page, views: r.views, visitors: r.v.size })).sort((a, b) => b.views - a.views).slice(0, 12),
    products: [...prods.values()].sort((a, b) => b.views - a.views || b.carts - a.carts).slice(0, 10).map((r) => ({ ...r, name: (db.products || []).find((p) => p.id === r.id)?.name || 'Removed item' })),
    funnel: { visits: S.length, product: S.filter((s) => has(s, 'product', 'cart', 'checkout', 'order')).length, cart: S.filter((s) => has(s, 'cart', 'checkout', 'order')).length, checkout: S.filter((s) => has(s, 'checkout', 'order')).length, order: S.filter((s) => s.k.has('order')).length },
  }
}

// ~30 days of believable sample visits (demo only) — busier evenings and weekends, mostly phones from Instagram & WhatsApp
export function demoTraffic(products = []) {
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const pick = (arr) => { let r = rnd() * arr.reduce((a, x) => a + x[1], 0); for (const [v, w] of arr) { if ((r -= w) <= 0) return v } return arr[0][0] }
  const prods = products.filter((p) => p.is_active !== false).slice(0, 14)
  const out = []
  const now = Date.now()
  let vid = 0
  const returning = []
  for (let d = 30; d >= 0; d--) {
    const base = now - d * 864e5
    const dow = new Date(base + IST).getUTCDay()
    const n = Math.round((14 + (30 - d) * 0.9) * (dow === 0 || dow === 6 ? 1.4 : 1) * (0.75 + rnd() * 0.5))
    for (let i = 0; i < n; i++) {
      const h = pick([[8, 2], [9, 3], [10, 4], [11, 5], [12, 5], [13, 4], [14, 3], [15, 3], [16, 4], [17, 5], [18, 7], [19, 9], [20, 10], [21, 9], [22, 6], [23, 2]])
      let t = Date.parse(new Date(base + IST).toISOString().slice(0, 10) + 'T00:00:00+05:30') + h * 36e5 + Math.floor(rnd() * 36e5)
      if (t > now) continue
      const back = returning.length && rnd() < 0.3
      const v = back ? returning[Math.floor(rnd() * returning.length)] : { id: 'demo-v' + (++vid), ...pick([[{ device: 'mobile', os: 'Android', browser: 'Chrome' }, 46], [{ device: 'mobile', os: 'iPhone', browser: 'Safari' }, 22], [{ device: 'mobile', os: 'Android', browser: 'Instagram' }, 14], [{ device: 'mobile', os: 'Android', browser: 'Samsung' }, 6], [{ device: 'desktop', os: 'Windows', browser: 'Chrome' }, 8], [{ device: 'tablet', os: 'Android', browser: 'Chrome' }, 4]]) }
      if (!back) returning.push(v)
      const source = v.browser === 'Instagram' ? 'instagram' : pick([['instagram', 34], ['whatsapp', 30], ['direct', 22], ['google', 10], ['facebook', 3], ['other', 1]])
      const app = v.os === 'Android' && back && rnd() < 0.4
      const s = 'demo-s' + out.length
      const push = (kind, path, product_id = null) => { out.push({ visitor: v.id, session: s, kind, path, source, ref: source === 'other' ? 'linktr.ee' : null, device: v.device, os: v.os, browser: v.browser, app, product_id, at: new Date(t).toISOString() }); t += 20e3 + Math.floor(rnd() * 70e3) }
      push('view', pick([['/', 70], ['/menu', 20], ['/track', 5], ['/contact', 5]]))
      if (rnd() < 0.3) continue // left after one page
      push('view', '/menu')
      const looks = 1 + Math.floor(rnd() * 3)
      let chosen = null
      for (let k = 0; k < looks && prods.length; k++) {
        const p = prods[Math.min(Math.floor(rnd() * rnd() * prods.length), prods.length - 1)]
        push('product', '/cake/' + p.id, p.id); push('view', '/cake/' + p.id); chosen = p
      }
      if (!chosen || rnd() < 0.62) continue
      push('cart', '/cake/' + chosen.id, chosen.id); push('view', '/cart')
      if (rnd() < 0.35) continue
      push('checkout', '/checkout'); push('view', '/checkout')
      if (rnd() < 0.45) continue
      push('order', '/checkout'); push('view', '/order/PT-' + (out.length % 90) + '-26')
    }
  }
  return out
}
