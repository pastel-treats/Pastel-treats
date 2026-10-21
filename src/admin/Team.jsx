import React, { useEffect, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api, isDemo } from '../api/index.js'
import { cleanError, itemSummary } from '../lib/format.js'
import { fmtDateTime, todayISO } from '../lib/dates.js'
import { downloadCSV } from '../lib/contact.js'
import { orderDate } from '../lib/analytics.js'
import { Field, Icon } from '../components/ui.jsx'

export default function Team() {
  const { me, toast } = useAdmin()
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ user_id: '', email: '', role: 'staff' })
  const load = () => api.list('admins', { order: 'created_at', asc: true }).then(setRows).catch((e) => toast(cleanError(e), true))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  const isOwner = me.role === 'owner'
  return (
    <>
      <PageHead title="Team" sub="People who can open this dashboard." />
      <div className="card">
        {rows.map((r) => (
          <div className="list-row" key={r.user_id}><Icon name="user" /><span className="grow"><b>{r.email || r.user_id}</b><div className="tiny muted">{r.role} · since {fmtDateTime(r.created_at)}</div></span>
            {isOwner && r.user_id !== me.user.id && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Remove access?')) { await api.remove('admins', r.user_id).catch((e) => toast(cleanError(e), true)); load() } }}>Remove</button>}</div>
        ))}
      </div>
      {isOwner && !isDemo && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <b>Add a helper</b>
          <p className="small muted">1) Ask them to open <code>/#/admin</code>, tap “Create account” and sign in. 2) They’ll see their user ID — paste it here.</p>
          <div className="grid-2">
            <Field label="User ID"><input className="input" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value.trim() })} /></Field>
            <Field label="E-mail (for your reference)"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner (can manage team)</option></select></Field>
          </div>
          <button className="btn btn-primary btn-sm" disabled={!/^[0-9a-f-]{36}$/i.test(f.user_id)} onClick={async () => { try { await api.insert('admins', f); setF({ user_id: '', email: '', role: 'staff' }); load(); toast('Added') } catch (e) { toast(cleanError(e), true) } }}>Give access</button>
        </div>
      )}
      {isDemo && <p className="small muted" style={{ marginTop: 12 }}>Team management works once the real database is connected.</p>}
    </>
  )
}

export function DataExport() {
  const { db, toast, reload } = useAdmin()
  const today = todayISO()
  const [audit, setAudit] = useState(null)
  const exports = [
    ['Orders', () => downloadCSV(`orders-${today}.csv`, db.orders, [{ label: 'Order', get: (o) => o.order_number }, { label: 'Placed', get: (o) => o.created_at }, { label: 'Customer', get: (o) => o.customer_name }, { label: 'Mobile', get: (o) => o.phone }, { label: 'Items', get: (o) => o.items.map((i) => `${i.qty}x ${i.name} (${itemSummary(i)})`).join('; ') }, { label: 'Date', get: orderDate }, { label: 'Slot', get: (o) => o.confirmed_slot_label || o.slot_label }, { label: 'Mode', get: (o) => o.fulfilment }, { label: 'Total', get: (o) => o.total }, { label: 'Paid', get: (o) => o.amount_paid }, { label: 'Status', get: (o) => o.status }, { label: 'Payment', get: (o) => o.payment_status }])],
    ['Customers', () => downloadCSV(`customers-${today}.csv`, db.customers, [{ label: 'Name', get: (c) => c.name }, { label: 'Mobile', get: (c) => c.phone }, { label: 'WhatsApp', get: (c) => c.whatsapp }, { label: 'E-mail', get: (c) => c.email }, { label: 'Consent', get: (c) => c.marketing_consent }, { label: 'Notes', get: (c) => c.notes }, { label: 'Created', get: (c) => c.created_at }])],
    ['Payments', () => downloadCSV(`payments-${today}.csv`, db.payments, [{ label: 'Date', get: (p) => p.created_at }, { label: 'Order', get: (p) => db.orders.find((o) => o.id === p.order_id)?.order_number }, { label: 'Type', get: (p) => p.kind }, { label: 'Method', get: (p) => p.method }, { label: 'Amount', get: (p) => p.amount }, { label: 'Reference', get: (p) => p.reference }, { label: 'Status', get: (p) => p.status }])],
    ['Special dates', () => downloadCSV(`special-dates-${today}.csv`, db.occasions, [{ label: 'Customer', get: (o) => db.customers.find((c) => c.id === o.customer_id)?.name }, { label: 'Occasion', get: (o) => o.kind }, { label: 'Person', get: (o) => o.person_name }, { label: 'Date', get: (o) => o.occasion_date }, { label: 'Yearly', get: (o) => o.repeats }, { label: 'Flavour', get: (o) => o.preferred_flavour }, { label: 'Budget', get: (o) => o.budget }])],
    ['Menu', () => downloadCSV(`menu-${today}.csv`, db.products, [{ label: 'Name', get: (p) => p.name }, { label: 'Base price', get: (p) => p.base_price }, { label: 'Sizes', get: (p) => (p.weights || []).map((w) => `${w.label}:${w.price}`).join(' | ') }, { label: 'Flavours', get: (p) => (p.flavours || []).map((w) => `${w.name}:+${w.price}`).join(' | ') }, { label: 'Active', get: (p) => p.is_active }])],
  ]
  return (
    <>
      <PageHead title="Data & reports" sub="Download spreadsheets (open in Excel or Google Sheets)." />
      <div className="kpis">{exports.map(([l, fn]) => <button key={l} className="kpi" style={{ textAlign: 'left', cursor: 'pointer', border: 'none' }} onClick={fn}><div className="v" style={{ fontSize: '1.3rem' }}><Icon name="download" /> {l}</div><div className="l">Download CSV</div></button>)}</div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between"><b>Change history (audit trail)</b><button className="btn btn-soft btn-sm" onClick={async () => { try { setAudit(await api.list('audit_logs', { order: 'created_at', limit: 200 })) } catch (e) { toast(cleanError(e), true) } }}>Load latest 200</button></div>
        {audit && audit.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => (
          <div className="list-row tiny" key={a.id}><span style={{ minWidth: 120 }}>{fmtDateTime(a.created_at)}</span><b>{a.action}</b> {a.entity}<span className="muted grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.details ? Object.keys(a.details).slice(0, 6).join(', ') : ''}</span></div>
        ))}
      </div>
      {isDemo && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <b>Demo data</b>
          <p className="small muted">The demo came with sample orders (“Demo · …”). Remove them, or reset everything to the starting menu.</p>
          <div className="row"><button className="btn btn-soft btn-sm" onClick={() => { api.clearDemoRecords(); reload(); toast('Demo records removed') }}>Remove demo records</button>
            <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Reset all demo data on this device?')) { api.resetDemo(); location.reload() } }}>Reset demo</button></div>
        </div>
      )}
      {!isDemo && <p className="tiny muted" style={{ marginTop: 12 }}>Backups: Supabase keeps daily backups on paid plans. On the free plan, download these CSVs regularly (e.g. every Monday).</p>}
    </>
  )
}
