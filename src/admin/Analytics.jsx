import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead, Bars, HBars } from './AdminApp.jsx'
import { inr } from '../lib/format.js'
import { todayISO, MONTHS_LONG, fmtDate } from '../lib/dates.js'
import { salesSummary, periodRange, monthlySeries, productStats, categoryStats, decliningProducts, customerStats, SEGMENTS, weekdayWeekend, areaStats, occasionStats, monthOfYear, placedDay, isLive } from '../lib/analytics.js'
import { downloadCSV, prettyPhone } from '../lib/contact.js'
import { Icon, Badge, Empty } from '../components/ui.jsx'

const PERIODS = [['week', 'Last 7 days'], ['month', 'This month'], ['last_month', 'Last month'], ['90', 'Last 90 days'], ['ytd', 'This year'], ['last_year', 'Last year'], ['all', 'All time']]
const k = (v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)

function Delta({ now, before }) {
  if (!before) return <span className="tiny muted">—</span>
  const d = Math.round(((now - before) / before) * 100)
  return <span className="tiny" style={{ color: d >= 0 ? 'var(--forest)' : 'var(--rose-deep)' }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)}%</span>
}

export default function Analytics() {
  const { db, settings: s } = useAdmin()
  const tz = s.timezone
  const today = todayISO(tz)
  const [period, setPeriod] = useState('month')
  const range = periodRange(period, today)
  const inRange = useMemo(() => db.orders.filter((o) => { const d = placedDay(o, tz); return d >= range[0] && d <= range[1] }), [db.orders, range[0], range[1], tz])
  const A = useMemo(() => {
    const sum = salesSummary(db.orders, db.payments, range, tz)
    const thisM = salesSummary(db.orders, db.payments, periodRange('month', today), tz)
    const lastM = salesSummary(db.orders, db.payments, periodRange('last_month', today), tz)
    const thisY = salesSummary(db.orders, db.payments, periodRange('ytd', today), tz)
    const ly = periodRange('last_year', today)
    const lastYtd = salesSummary(db.orders, db.payments, [ly[0], `${ly[0].slice(0, 4)}${today.slice(4)}`], tz)
    const stats = customerStats(db.customers, db.orders)
    const all = [...stats.values()].filter((x) => x.count > 0)
    const newInRange = all.filter((x) => x.first >= range[0] && x.first <= range[1]).length
    const returningInRange = new Set(inRange.filter((o) => isLive(o) && stats.get(o.customer_id)?.first < range[0]).map((o) => o.customer_id)).size
    const buckets = [['Under ₹1k', 0, 1000], ['₹1k–3k', 1000, 3000], ['₹3k–6k', 3000, 6000], ['₹6k–10k', 6000, 10000], ['₹10k+', 10000, 1e12]].map(([l, a, b]) => [l, all.filter((x) => x.spend >= a && x.spend < b).length])
    const freq = [['1 order', 1, 1], ['2 orders', 2, 2], ['3–4', 3, 4], ['5+', 5, 1e9]].map(([l, a, b]) => [l, all.filter((x) => x.count >= a && x.count <= b).length])
    return {
      sum, thisM, lastM, thisY, lastYtd, all, newInRange, returningInRange, buckets, freq,
      repeatRate: all.length ? Math.round((all.filter((x) => x.count >= 2).length / all.length) * 100) : 0,
      avgSpend: all.length ? Math.round(all.reduce((a, x) => a + x.spend, 0) / all.length) : 0,
      top: all.sort((a, b) => b.spend - a.spend).slice(0, 8),
      inactive: all.filter((x) => SEGMENTS.find((sg) => sg.id === 'inactive').test(x, s.segments || {}, [], today)),
      series: monthlySeries(db.orders, 12, today, tz).map((x) => ({ ...x, label: MONTHS_LONG[+x.key.slice(5) - 1].slice(0, 3) })),
      prod: productStats(inRange), cats: categoryStats(inRange, db.products, db.categories), declining: decliningProducts(db.orders, today, tz),
      wk: weekdayWeekend(inRange), areas: areaStats(inRange), occ: occasionStats(inRange),
      seasonal: monthOfYear(db.orders).map(([m, n]) => [MONTHS_LONG[+m - 1], n]).sort((a, b) => MONTHS_LONG.indexOf(a[0]) - MONTHS_LONG.indexOf(b[0])),
    }
  }, [db, range[0], range[1], inRange, today, tz, s.segments])
  const S = A.sum
  if (!db.orders.length) return <><PageHead title="Sales analytics" /><Empty title="No orders yet">Your numbers will appear here as orders come in.</Empty></>
  return (
    <>
      <PageHead title="Sales analytics" sub="All figures come from your actual orders and recorded payments.">
        <select className="input" style={{ minHeight: 40, width: 'auto' }} value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="btn btn-soft btn-sm" onClick={() => downloadCSV(`sales-${range[0]}-${range[1]}.csv`, inRange, [
          { label: 'Placed', get: (o) => placedDay(o, tz) }, { label: 'Order', get: (o) => o.order_number }, { label: 'Customer', get: (o) => o.customer_name }, { label: 'Status', get: (o) => o.status },
          { label: 'Items value', get: (o) => o.subtotal }, { label: 'Delivery', get: (o) => o.delivery_charge }, { label: 'Discount', get: (o) => o.discount }, { label: 'Total', get: (o) => o.total }, { label: 'Paid', get: (o) => o.amount_paid },
          { label: 'Occasion', get: (o) => o.occasion }, { label: 'Mode', get: (o) => o.fulfilment }, { label: 'Area', get: (o) => o.address?.area || o.address?.pincode }])}><Icon name="download" size={16} /> CSV</button>
      </PageHead>
      <div className="kpis">
        <div className="kpi"><div className="v">{inr(S.gross)}</div><div className="l">Gross order value</div></div>
        <div className="kpi"><div className="v">{inr(S.discounts)}</div><div className="l">Discounts</div></div>
        <div className="kpi"><div className="v">{inr(S.net)}</div><div className="l">Net sales (gross − discounts)</div></div>
        <div className="kpi"><div className="v">{inr(S.collected)}</div><div className="l">Payments collected</div></div>
        <div className="kpi"><div className="v">{inr(S.refunds)}</div><div className="l">Refunds paid</div></div>
        <div className="kpi"><div className="v">{inr(S.outstanding)}</div><div className="l">Outstanding (all open orders)</div></div>
        <div className="kpi"><div className="v">{S.count}</div><div className="l">Orders · {S.perDay}/day</div></div>
        <div className="kpi"><div className="v">{inr(S.aov)}</div><div className="l">Average order value</div></div>
        <div className="kpi"><div className="v">{S.cancelRate}%</div><div className="l">Cancellation rate</div></div>
        <div className="kpi"><div className="v">{A.repeatRate}%</div><div className="l">Repeat-customer rate (all time)</div></div>
        <div className="kpi"><div className="v">{A.newInRange} / {A.returningInRange}</div><div className="l">New / returning customers</div></div>
        <div className="kpi"><div className="v">{inr(A.avgSpend)}</div><div className="l">Average lifetime spend</div></div>
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Sales are counted on the day an order is placed (cancelled orders excluded). Collections are counted on the day a payment was verified. None of these figures is profit — ingredient and packaging costs are not tracked.</p>

      <div className="cards-2" style={{ marginTop: 14 }}>
        <div className="card"><div className="card-title">Order value by month</div><Bars data={A.series} fmt={k} /></div>
        <div className="card">
          <div className="card-title">Comparisons</div>
          <div className="list-row small"><span className="grow">This month vs last month</span><b>{inr(A.thisM.net)}</b><span className="muted">vs {inr(A.lastM.net)}</span><Delta now={A.thisM.net} before={A.lastM.net} /></div>
          <div className="list-row small"><span className="grow">This year vs same period last year</span><b>{inr(A.thisY.net)}</b><span className="muted">vs {inr(A.lastYtd.net)}</span><Delta now={A.thisY.net} before={A.lastYtd.net} /></div>
          <div className="list-row small"><span className="grow">Weekday vs weekend orders (period)</span><b>{A.wk.weekday}</b><span className="muted">vs {A.wk.weekend}</span></div>
          <div className="card-title" style={{ marginTop: 14 }}>Seasonal demand (all time, by month of event)</div>
          <HBars rows={A.seasonal} limit={12} />
        </div>
        <div className="card"><div className="card-title">Most ordered</div><HBars rows={A.prod.byCount} /></div>
        <div className="card"><div className="card-title">Highest revenue</div><HBars rows={A.prod.byRevenue} fmt={inr} /></div>
        <div className="card"><div className="card-title">Popular flavours</div><HBars rows={A.prod.flavours} /></div>
        <div className="card"><div className="card-title">Popular sizes</div><HBars rows={A.prod.sizes} /></div>
        <div className="card"><div className="card-title">Popular add-ons</div><HBars rows={A.prod.addons} /></div>
        <div className="card"><div className="card-title">Categories by revenue</div><HBars rows={A.cats} fmt={inr} /></div>
        <div className="card"><div className="card-title">Occasions</div><HBars rows={A.occ} /><p className="tiny muted">Custom-design requests: <b>{A.prod.custom}</b> of {A.prod.total} items in this period.</p></div>
        <div className="card"><div className="card-title">Deliveries by area</div><HBars rows={A.areas} /></div>
        <div className="card"><div className="card-title">Customers by spend</div><HBars rows={A.buckets} /><div className="card-title" style={{ marginTop: 12 }}>By order frequency</div><HBars rows={A.freq} /></div>
        <div className="card">
          <div className="card-title">Declining items</div>
          <p className="tiny muted">Last 45 days vs the 45 days before.</p>
          {A.declining.length ? A.declining.slice(0, 8).map((x) => <div className="list-row small" key={x.name}><span className="grow">{x.name}</span><span>{x.before} → <b>{x.now}</b></span></div>) : <p className="small muted">Nothing declining. 🎉</p>}
        </div>
        <div className="card">
          <div className="card-title">Top customers</div>
          {A.top.map((x) => <div className="list-row small" key={x.c.id}><span className="grow"><b>{x.c.name}</b><div className="tiny muted">{prettyPhone(x.c.phone)} · {x.count} orders</div></span><b>{inr(x.spend)}</b></div>)}
        </div>
        <div className="card">
          <div className="card-title">Haven’t ordered in a while</div>
          <p className="tiny muted">No order in {(s.segments || {}).inactive_days || 120}+ days.</p>
          {A.inactive.slice(0, 8).map((x) => <div className="list-row small" key={x.c.id}><span className="grow">{x.c.name}</span><span className="tiny muted">last {fmtDate(x.last, { year: true })}</span>{x.c.marketing_consent && <Badge tone="lime">ok to message</Badge>}</div>)}
          {!A.inactive.length && <p className="small muted">Everyone’s been back recently.</p>}
        </div>
      </div>
    </>
  )
}

export function Segments() {
  const { db, settings: s } = useAdmin()
  const today = todayISO(s.timezone)
  const [seg, setSeg] = useState('repeat')
  const [consentOnly, setConsentOnly] = useState(true)
  const stats = useMemo(() => [...customerStats(db.customers, db.orders).values()], [db])
  const cfg = s.segments || {}
  const counts = SEGMENTS.map((sg) => [sg, stats.filter((x) => sg.test(x, cfg, db.occasions.filter((o) => o.customer_id === x.c.id), today))])
  const [cur, members] = counts.find(([sg]) => sg.id === seg)
  const shown = members.filter((x) => !consentOnly || x.c.marketing_consent)
  const ideas = { new: 'Thank-you message + feedback request', repeat: 'Loyalty treat on their next order', frequent: 'Early access to festival menus', high: 'Personal call before big occasions', birthday: 'Reminder 7 days before the birthday', anniversary: 'Anniversary cake suggestion', custom: 'Show new designer work', inactive: 'Festival specials / “we miss you” note' }
  return (
    <>
      <PageHead title="Customer segments" sub={`Rules: frequent = ${cfg.frequent_orders || 4}+ orders · high-spend = ${inr(cfg.high_spend || 5000)}+ · inactive = ${cfg.inactive_days || 120}+ days (change in Business settings)`} />
      <div className="kpis">
        {counts.map(([sg, m]) => <button key={sg.id} className={'kpi'} style={{ border: seg === sg.id ? '2px solid var(--forest)' : '2px solid transparent', textAlign: 'left', cursor: 'pointer' }} onClick={() => setSeg(sg.id)}><div className="v">{m.length}</div><div className="l">{sg.label}</div></button>)}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between wrap">
          <div><div className="card-title" style={{ margin: 0 }}>{cur.label}</div><div className="tiny muted">Suggested follow-up: {ideas[cur.id]}</div></div>
          <div className="row">
            <label className="check small"><input type="checkbox" checked={consentOnly} onChange={(e) => setConsentOnly(e.target.checked)} /> Only customers who agreed to messages</label>
            <button className="btn btn-soft btn-sm" onClick={() => downloadCSV(`segment-${cur.id}-${today}.csv`, shown, [{ label: 'Name', get: (x) => x.c.name }, { label: 'WhatsApp', get: (x) => x.c.whatsapp || x.c.phone }, { label: 'E-mail', get: (x) => x.c.email }, { label: 'Orders', get: (x) => x.count }, { label: 'Spend', get: (x) => x.spend }, { label: 'Consent', get: (x) => (x.c.marketing_consent ? 'yes' : 'no') }])}><Icon name="download" size={16} /> Export</button>
          </div>
        </div>
        {shown.map((x) => <div className="list-row small" key={x.c.id}><span className="grow"><b>{x.c.name}</b><div className="tiny muted">{prettyPhone(x.c.phone)} · {x.count} orders · {inr(x.spend)}</div></span>{x.c.marketing_consent ? <Badge tone="lime">consented</Badge> : <Badge tone="grey">no consent</Badge>}</div>)}
        {!shown.length && <p className="small muted">No customers in this segment{consentOnly ? ' who agreed to messages' : ''}.</p>}
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>Exports are for your own business follow-up. Only message customers who agreed, and honour opt-outs (shown on each profile).</p>
    </>
  )
}
