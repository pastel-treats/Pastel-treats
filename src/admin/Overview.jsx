import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin, PageHead, Bars } from './AdminApp.jsx'
import { useTasks } from './Tasks.jsx'
import { inr } from '../lib/format.js'
import { todayISO, addDaysISO, fmtDate, MONTHS_LONG } from '../lib/dates.js'
import { salesSummary, periodRange, monthlySeries, orderDate, placedDay, customerStats, upcomingOccasions, isLive, ownerInsights } from '../lib/analytics.js'
import { StatusBadge, Badge } from '../components/ui.jsx'
import { isDemo } from '../api/index.js'

export default function Overview() {
  const { db, settings: s } = useAdmin()
  const nav = useNavigate()
  const tasks = useTasks()
  const [period, setPeriod] = useState('month')
  const tz = s.timezone
  const today = todayISO(tz)
  const m = useMemo(() => {
    const o = db.orders
    const stats = customerStats(db.customers, o)
    const upcoming = o.filter((x) => isLive(x) && orderDate(x) >= today && orderDate(x) <= addDaysISO(today, 7) && ['confirmed', 'in_preparation', 'ready', 'out_for_delivery', 'advance_received'].includes(x.status))
    return {
      receivedToday: o.filter((x) => placedDay(x, tz) === today).length,
      awaitingConfirm: o.filter((x) => ['submitted', 'advance_received'].includes(x.status)).length,
      awaitingAdvance: o.filter((x) => x.status === 'awaiting_payment').length,
      toVerify: db.payments.filter((p) => p.status === 'pending' && p.kind !== 'refund').length,
      confirmedToday: o.filter((x) => orderDate(x) === today && ['confirmed', 'in_preparation', 'ready', 'out_for_delivery'].includes(x.status)),
      pickups: upcoming.filter((x) => x.fulfilment === 'pickup').length,
      deliveries: upcoming.filter((x) => x.fulfilment === 'delivery').length,
      cancelled: o.filter((x) => ['cancelled', 'refund_pending', 'refunded'].includes(x.status) && placedDay(x, tz) >= periodRange(period, today)[0]).length,
      repeat: [...stats.values()].filter((x) => x.completed >= 2).length,
      occasions: upcomingOccasions({ occasions: db.occasions, orders: db.orders, customers: db.customers }, 30, today),
      sales: salesSummary(o, db.payments, periodRange(period, today), tz),
      ins: ownerInsights({ orders: o, customers: db.customers, products: db.products }, today, tz),
      series: monthlySeries(o, 6, today, tz).map((x) => ({ ...x, label: MONTHS_LONG[+x.key.slice(5) - 1].slice(0, 3) })),
    }
  }, [db, period, today, tz])
  const K = ({ v, l, to, alert }) => <Link className={'kpi' + (alert && v ? ' alert' : '')} to={to || '#'}><div className="v">{v}</div><div className="l">{l}</div></Link>
  return (
    <>
      <PageHead title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}!`} sub={fmtDate(today, { weekday: true, year: true })}>
        <select className="input" style={{ minHeight: 40, width: 'auto' }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="last_month">Last month</option><option value="ytd">This year</option>
        </select>
      </PageHead>
      {isDemo && <div className="notice warn small" style={{ marginBottom: 12 }}>You’re looking at <b>demo records</b> (names start with “Demo ·”). Remove them anytime under Data & reports.</div>}
      <Insights ins={m.ins} today={today} />
      <h2 style={{ fontSize: '1.5rem', margin: '22px 0 10px' }}>Today & this period</h2>
      <div className="kpis">
        <K v={m.receivedToday} l="Orders received today" to="/admin/orders" />
        <K v={m.awaitingConfirm} l="Awaiting your confirmation" to="/admin/orders?tab=pending_confirm" alert />
        <K v={m.awaitingAdvance} l="Awaiting advance payment" to="/admin/orders?tab=pending_pay" />
        <K v={m.toVerify} l="Payments to verify" to="/admin/payments" alert />
        <K v={m.confirmedToday.length} l="Confirmed for today" to="/admin/calendar" />
        <K v={`${m.pickups} / ${m.deliveries}`} l="Pickups / deliveries next 7 days" to="/admin/calendar" />
        <K v={inr(m.sales.net)} l={`Order value (${period.replace('_', ' ')})`} to="/admin/analytics" />
        <K v={inr(m.sales.collected)} l="Payments collected" to="/admin/payments" />
        <K v={inr(m.sales.outstanding)} l="Outstanding balances" to="/admin/payments" />
        <K v={m.cancelled} l="Cancelled in period" to="/admin/orders?tab=cancelled" />
        <K v={m.repeat} l="Repeat customers" to="/admin/segments" />
        <K v={m.occasions.length} l="Birthdays & anniversaries (30 days)" to="/admin/dates" />
      </div>

      <div className="cards-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row between"><div className="card-title">Today’s handovers</div><Link to="/admin/calendar" className="small">Calendar →</Link></div>
          {!m.confirmedToday.length && <p className="small muted">Nothing scheduled for today.</p>}
          {m.confirmedToday.map((o) => (
            <div className="list-row" key={o.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/admin/orders?open=${o.id}&tab=all`)}>
              <Badge tone={o.fulfilment === 'pickup' ? 'mint' : 'rose'}>{o.fulfilment}</Badge>
              <div className="grow small"><b>{o.confirmed_slot_label || o.slot_label}</b> · {o.customer_name}<div className="tiny muted">{o.items.map((i) => i.name).join(', ')} · balance {inr(o.total - o.amount_paid)}</div></div>
              <StatusBadge s={o.status} />
            </div>
          ))}
        </div>
        <div className="card">
          <div className="row between"><div className="card-title">To do</div><Link to="/admin/tasks" className="small">All tasks →</Link></div>
          {tasks.filter((t) => !t.done).slice(0, 6).map((t) => <div className="list-row small" key={t.key}><span className="grow"><b>{t.title}</b><div className="tiny muted">{t.sub}</div></span></div>)}
          {!tasks.filter((t) => !t.done).length && <p className="small muted">All caught up!</p>}
        </div>
        <div className="card">
          <div className="card-title">Order value — last 6 months</div>
          <Bars data={m.series} fmt={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
          <p className="tiny muted">Gross order value of non-cancelled orders by month placed. Not profit.</p>
        </div>
        <div className="card">
          <div className="row between"><div className="card-title">Coming up: special days</div><Link to="/admin/dates" className="small">All →</Link></div>
          {m.occasions.slice(0, 6).map((u, i) => (
            <div className="list-row small" key={i}><Badge tone="lime">{u.inDays === 0 ? 'today' : `${u.inDays} d`}</Badge><span className="grow">{u.customer?.name} · {u.occasion.person_name ? `${u.occasion.person_name}’s ` : ''}{u.occasion.kind}</span><span className="tiny muted">{fmtDate(u.next)}</span></div>
          ))}
          {!m.occasions.length && <p className="small muted">No occasions in the next 30 days.</p>}
        </div>
      </div>
    </>
  )
}

function Insights({ ins, today }) {
  const monthName = MONTHS_LONG[+today.slice(5, 7) - 1]
  const diff = ins.month.lastSales ? Math.round(((ins.month.sales - ins.month.lastSales) / ins.month.lastSales) * 100) : null
  const Row = ({ label, children }) => <div className="list-row small"><span className="muted" style={{ minWidth: 112 }}>{label}</span><span className="grow">{children}</span></div>
  return (
    <div className="cards-2">
      <div className="card" style={{ background: 'var(--mint)' }}>
        <div className="eyebrow" style={{ color: '#2f5a49' }}>{monthName} so far</div>
        <div className="row wrap" style={{ alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span className="serif" style={{ fontSize: '2.6rem', fontWeight: 700, color: 'var(--forest)' }}>{inr(ins.month.sales)}</span>
          {diff != null && <span className="small" style={{ color: diff >= 0 ? 'var(--forest)' : 'var(--rose-deep)' }}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff)}% vs last month ({inr(ins.month.lastSales)})</span>}
        </div>
        <div className="row wrap small" style={{ gap: 18, marginTop: 8, color: '#24493b' }}>
          <span><b>{ins.month.orders}</b> orders</span><span><b>{inr(ins.month.aov)}</b> average order</span><span><b>{ins.month.newCustomers}</b> new customers</span>
        </div>
        <hr className="soft" />
        <Row label="Best seller">{ins.bestSellerMonth ? <><b>{ins.bestSellerMonth.name}</b> · {ins.bestSellerMonth.qty} sold · {inr(ins.bestSellerMonth.revenue)}</> : '—'}</Row>
        <Row label="Top spender">{ins.topMonth[0] ? <><b>{ins.topMonth[0].name}</b> · {inr(ins.topMonth[0].value)} this month</> : '—'}</Row>
      </div>
      <div className="card">
        <div className="card-title">Best customers</div>
        <Row label="All-time best">{ins.bestAll[0] ? <><b>{ins.bestAll[0].name}</b> · {inr(ins.bestAll[0].value)} over {ins.bestAll[0].orders} orders</> : '—'}</Row>
        <Row label="Spends most per month">{ins.perMonth[0] ? <><b>{ins.perMonth[0].name}</b> · avg {inr(ins.perMonth[0].value)}/month</> : '—'}</Row>
        <Row label="Top this month">{ins.topMonth.length ? ins.topMonth.map((x) => `${x.name.replace('Demo · ', '')} (${inr(x.value)})`).join(', ') : '—'}</Row>
        <Row label="Top all time">{ins.bestAll.map((x) => `${x.name.replace('Demo · ', '')} (${inr(x.value)})`).join(', ') || '—'}</Row>
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>“Per month” = total spend ÷ months since their first order.</p>
      </div>
      <div className="card">
        <div className="card-title">Best-selling products</div>
        <Row label="This month">{ins.bestSellerMonth ? `${ins.bestSellerMonth.name} — ${ins.bestSellerMonth.qty} sold` : '—'}</Row>
        <Row label="All time (qty)">{ins.bestSellerAll ? `${ins.bestSellerAll.name} — ${ins.bestSellerAll.qty} sold` : '—'}</Row>
        <Row label="All time (₹)">{ins.topRevenueAll ? `${ins.topRevenueAll.name} — ${inr(ins.topRevenueAll.revenue)}` : '—'}</Row>
      </div>
      <div className="card">
        <div className="card-title">Most profitable products</div>
        {ins.profitable.length ? ins.profitable.map((r, i) => (
          <Row key={r.name} label={i === 0 ? 'Most profitable' : `#${i + 1}`}><b>{r.name}</b> · est. profit {inr(r.profit)} on {inr(r.revenue)} ({100 - r.costPct}% margin)</Row>
        )) : <p className="small muted">Add an “ingredient cost %” to your items to see profit.</p>}
        {ins.missingCost > 0 && <p className="tiny muted" style={{ margin: '8px 0 0' }}><Link to="/admin/menu">{ins.missingCost} items</Link> have no cost % yet — profit is estimated only for items with one.</p>}
      </div>
    </div>
  )
}
