import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead, Bars } from './AdminApp.jsx'
import { inr } from '../lib/format.js'
import { fmtDateTime, todayISO, addDaysISO, fmtDate } from '../lib/dates.js'
import { orderDate, isLive } from '../lib/analytics.js'
import { downloadCSV, prettyPhone } from '../lib/contact.js'
import { Badge, Icon, Empty, PayBadge } from '../components/ui.jsx'
import { OrderDrawer } from './Orders.jsx'

export default function Payments() {
  const { db, settings: s } = useAdmin()
  const [tab, setTab] = useState('pending')
  const [open, setOpen] = useState(null)
  const today = todayISO(s.timezone)
  const [range, setRange] = useState({ from: addDaysISO(today, -29), to: today })
  const byId = useMemo(() => Object.fromEntries(db.orders.map((o) => [o.id, o])), [db.orders])
  const rows = db.payments.filter((p) => {
    if (tab === 'pending') return p.status === 'pending'
    if (tab === 'refunds') return p.kind === 'refund'
    const d = (p.verified_at || p.created_at).slice(0, 10)
    if (d < range.from || d > range.to) return false
    return tab === 'all' ? true : p.status === 'verified' && p.kind !== 'refund'
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const daily = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = addDaysISO(today, i - 13)
    const ps = db.payments.filter((p) => p.status === 'verified' && p.kind !== 'refund' && (p.verified_at || p.created_at).slice(0, 10) === d)
    return { key: d, label: d.slice(8), value: ps.reduce((a, p) => a + p.amount, 0), cash: ps.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0) }
  }), [db.payments, today])
  const todayRow = daily[daily.length - 1]
  const outstanding = db.orders.filter((o) => isLive(o) && o.total - o.amount_paid > 0 && !['submitted'].includes(o.status)).sort((a, b) => orderDate(a).localeCompare(orderDate(b)))
  const exportCsv = () => downloadCSV(`payments-${today}.csv`, rows, [
    { label: 'Date', get: (p) => p.verified_at || p.created_at }, { label: 'Order', get: (p) => byId[p.order_id]?.order_number }, { label: 'Customer', get: (p) => byId[p.order_id]?.customer_name },
    { label: 'Type', get: (p) => p.kind }, { label: 'Method', get: (p) => p.method }, { label: 'Amount', get: (p) => (p.kind === 'refund' ? -p.amount : p.amount) }, { label: 'Reference', get: (p) => p.reference }, { label: 'Status', get: (p) => p.status },
  ])
  return (
    <>
      <PageHead title="Payments" sub="Every rupee in and out, linked to its order.">
        <button className="btn btn-soft btn-sm" onClick={exportCsv}><Icon name="download" size={16} /> CSV</button>
      </PageHead>
      <div className="kpis" style={{ marginBottom: 14 }}>
        <div className="kpi alert"><div className="v">{db.payments.filter((p) => p.status === 'pending' && p.kind !== 'refund').length}</div><div className="l">Waiting for verification</div></div>
        <div className="kpi"><div className="v">{inr(todayRow.value)}</div><div className="l">Collected today ({inr(todayRow.cash)} cash)</div></div>
        <div className="kpi"><div className="v">{inr(outstanding.reduce((a, o) => a + o.total - o.amount_paid, 0))}</div><div className="l">Outstanding balances</div></div>
        <div className="kpi"><div className="v">{db.payments.filter((p) => p.kind === 'refund' && p.status === 'pending').length}</div><div className="l">Refunds pending</div></div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}><div className="card-title">Collected per day (last 14 days)</div><Bars data={daily} fmt={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} height={130} /></div>
      <div className="pill-tabs">{[['pending', 'To verify'], ['verified', 'Received'], ['refunds', 'Refunds'], ['all', 'All'], ['outstanding', 'Outstanding balances']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {['verified', 'all'].includes(tab) && <div className="toolbar"><input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /><input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <span className="small">Total: <b>{inr(rows.reduce((a, p) => a + (p.status === 'verified' ? (p.kind === 'refund' ? -p.amount : p.amount) : 0), 0))}</b></span></div>}
      {tab === 'outstanding' ? (
        <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="tbl"><thead><tr><th>Order</th><th>Customer</th><th>For</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>{outstanding.map((o) => <tr key={o.id} className="click" onClick={() => setOpen(o.id)}><td>{o.order_number}</td><td>{o.customer_name}<div className="tiny muted">{prettyPhone(o.phone)}</div></td><td>{fmtDate(orderDate(o))}</td><td>{inr(o.total)}</td><td>{inr(o.amount_paid)}</td><td><b>{inr(o.total - o.amount_paid)}</b></td><td><PayBadge s={o.payment_status} /></td></tr>)}</tbody></table></div>
      ) : !rows.length ? <Empty title="Nothing here">No payments match.</Empty> : (
        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>When</th><th>Order</th><th>Customer</th><th>Type</th><th>Method</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((p) => { const o = byId[p.order_id]; return (
                <tr key={p.id} className="click" onClick={() => setOpen(p.order_id)}>
                  <td>{fmtDateTime(p.verified_at || p.created_at)}</td><td>{o?.order_number}</td><td>{o?.customer_name}</td><td>{p.kind}</td><td>{p.method}</td>
                  <td><b>{p.kind === 'refund' ? '−' : ''}{inr(p.amount)}</b>{o && p.status === 'pending' && <div className="tiny muted">due {inr(Math.max(o.advance_due - o.amount_paid, 0))}</div>}</td>
                  <td className="small">{p.reference || (p.proof_path ? 'screenshot' : '—')}</td>
                  <td><Badge tone={p.status === 'verified' ? 'mint' : p.status === 'pending' ? 'peach' : 'grey'}>{p.status}</Badge></td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 10 }}>Open an order to verify a payment, record cash, or log a refund. Card numbers, UPI PINs and passwords are never stored.</p>
      {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
