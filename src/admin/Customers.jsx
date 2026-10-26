import PlaceSelect from '../components/PlaceSelect.jsx'
import { ADMIN_EMAIL } from '../lib/admin.js'
import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api, isDemo } from '../api/index.js'
import { inr, cleanError, itemSummary } from '../lib/format.js'
import { fmtDate, todayISO, nextOccurrence } from '../lib/dates.js'
import { customerStats, SEGMENTS, orderDate } from '../lib/analytics.js'
import { prettyPhone, normalizePhone, waLink, downloadCSV } from '../lib/contact.js'
import { Modal, Field, Switch, Badge, Icon, Empty, StatusBadge, WaIcon } from '../components/ui.jsx'
import { OrderDrawer } from './Orders.jsx'

export function OccasionForm({ customerId, initial, onDone }) {
  const { reload, toast } = useAdmin()
  const [f, setF] = useState(initial || { kind: 'Birthday', person_name: '', occasion_date: '', repeats: true, preferred_flavour: '', preferred_design: '', budget: '', notes: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e })
  async function save() {
    if (!f.occasion_date) return toast('Add a date', true)
    try {
      const { id, created_at, ...row } = { ...f, customer_id: customerId, budget: f.budget ? +f.budget : null }
      id ? await api.update('occasions', id, row) : await api.insert('occasions', { ...row, source: 'admin' })
      await reload(); toast('Saved'); onDone()
    } catch (e) { toast(cleanError(e), true) }
  }
  return (
    <div className="card flat stack">
      <div className="grid-2">
        <Field label="Occasion"><select className="input" value={f.kind} onChange={set('kind')}>{['Birthday', 'Anniversary', 'Spouse birthday', 'Child birthday', 'Baby shower', 'Graduation', 'Festival', 'Other'].map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Whose / name"><input className="input" value={f.person_name || ''} onChange={set('person_name')} /></Field>
        <Field label="Date"><input type="date" className="input" value={f.occasion_date} onChange={set('occasion_date')} /></Field>
        <Field label="Typical budget ₹"><input type="number" className="input" value={f.budget || ''} onChange={set('budget')} /></Field>
        <Field label="Preferred flavour"><input className="input" value={f.preferred_flavour || ''} onChange={set('preferred_flavour')} /></Field>
        <Field label="Preferred design"><input className="input" value={f.preferred_design || ''} onChange={set('preferred_design')} /></Field>
      </div>
      <Field label="Notes"><input className="input" value={f.notes || ''} onChange={set('notes')} /></Field>
      <label className="check"><input type="checkbox" checked={f.repeats} onChange={set('repeats')} /> Repeats every year</label>
      <div className="row"><button className="btn btn-primary btn-sm" onClick={save}>Save occasion</button><button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button></div>
    </div>
  )
}

function Profile({ id, onClose }) {
  const { db, reload, toast, settings: s } = useAdmin()
  const c = db.customers.find((x) => x.id === id)
  const st = c ? customerStats([c], db.orders).get(id) : null
  const [f, setF] = useState(() => ({ ...c }))
  const [occ, setOcc] = useState(null)
  const [openOrder, setOpenOrder] = useState(null)
  const [deleting, setDeleting] = useState(false)
  if (!c) return null
  const occs = db.occasions.filter((o) => o.customer_id === id)
  const addrs = db.customer_addresses.filter((a) => a.customer_id === id)
  const today = todayISO(s.timezone)
  async function save() {
    try {
      const phone = normalizePhone(f.phone)
      if (!phone) return toast('Invalid mobile number', true)
      const patch = { name: f.name, phone, state: f.state || null, city: (f.city || '').trim() || null, whatsapp: normalizePhone(f.whatsapp) || null, email: f.email || null, notes: f.notes || null, preferred_reminder: f.preferred_reminder,
        marketing_consent: !!f.marketing_consent, consent_at: f.marketing_consent && !c.marketing_consent ? new Date().toISOString() : c.consent_at, opted_out_at: !f.marketing_consent && c.marketing_consent ? new Date().toISOString() : c.opted_out_at }
      await api.update('customers', id, patch); await reload(); toast('Saved')
    } catch (e) { toast(cleanError(e), true) }
  }
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="row wrap" style={{ marginTop: -6, marginBottom: 12 }}>
        {SEGMENTS.filter((sg) => sg.test(st, s.segments || {}, occs, today)).map((sg) => <Badge key={sg.id} tone="mint">{sg.label.replace(' customers', '')}</Badge>)}
        <Badge tone={c.marketing_consent ? 'lime' : 'grey'}>{c.marketing_consent ? 'Consented to messages' : 'No marketing consent'}</Badge>
      </div>
      <div className="kpis" style={{ marginBottom: 14 }}>
        <div className="kpi"><div className="v">{st.count}</div><div className="l">Orders ({st.cancelled} cancelled)</div></div>
        <div className="kpi"><div className="v">{inr(st.spend)}</div><div className="l">Total spend</div></div>
        <div className="kpi"><div className="v">{inr(st.aov)}</div><div className="l">Average order</div></div>
        <div className="kpi"><div className="v" style={{ fontSize: '1.2rem' }}>{st.first ? fmtDate(st.first, { year: true }) : '—'}</div><div className="l">First order · last {st.last ? fmtDate(st.last, { year: true }) : '—'}</div></div>
      </div>
      <div className="cards-2">
        <div className="stack">
          <div className="card flat stack">
            <div className="grid-2">
              <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label="Mobile"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              <Field label="WhatsApp"><input className="input" value={f.whatsapp || ''} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
              <Field label="E-mail"><input className="input" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <div style={{ gridColumn: '1 / -1' }}><PlaceSelect state={f.state || ''} city={f.city || ''} onChange={({ state, city }) => setF({ ...f, state, city })} /></div>
              <Field label="Reminder via"><select className="input" value={f.preferred_reminder || 'whatsapp'} onChange={(e) => setF({ ...f, preferred_reminder: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="call">Phone call</option><option value="email">E-mail</option><option value="none">No reminders</option></select></Field>
              <div style={{ alignSelf: 'end' }}><Switch checked={f.marketing_consent} onChange={(v) => setF({ ...f, marketing_consent: v })} label="Agreed to offers/reminders" /></div>
            </div>
            <Field label="Private notes"><textarea className="input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Allergic to nuts, prefers less sweet…" /></Field>
            <div className="row"><button className="btn btn-primary btn-sm" onClick={save}>Save</button>
              <a className="btn btn-sm" style={{ background: '#25d366', color: '#fff' }} href={waLink(c.whatsapp || c.phone, `Hi ${c.name.split(' ')[0]}! `)} target="_blank" rel="noreferrer"><WaIcon size={16} /> WhatsApp</a></div>
          </div>
          <div className="card flat small">
            <b>Preferences (from orders)</b>
            <dl className="kv" style={{ marginTop: 6 }}><dt>Favourite</dt><dd>{st.favProduct || '—'}</dd><dt>Flavour</dt><dd>{st.favFlavour || '—'}</dd><dt>Size</dt><dd>{st.favSize || '—'}</dd><dt>Design</dt><dd>{st.favDesign || '—'}</dd><dt>Prefers</dt><dd>{st.prefMode || '—'}</dd></dl>
          </div>
          {addrs.length > 0 && <div className="card flat small"><b>Saved addresses</b>{addrs.map((a) => <div key={a.id} className="list-row">{[a.line, a.area, a.city, a.pincode].filter(Boolean).join(', ')}<button className="btn btn-white btn-sm" style={{ marginLeft: 'auto' }} onClick={async () => { await api.remove('customer_addresses', a.id); reload() }}><Icon name="trash" size={14} /></button></div>)}</div>}
          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>Delete customer data</button>
          {deleting && <DeleteCustomer c={c} st={st} onClose={() => setDeleting(false)} onDeleted={async () => { onClose(); await reload() }} />}
        </div>
        <div className="stack">
          <div className="card flat">
            <div className="row between"><b>Special dates</b><button className="btn btn-soft btn-sm" onClick={() => setOcc({})}><Icon name="plus" size={14} /> Add</button></div>
            {occs.map((o) => (
              <div className="list-row small" key={o.id}><Icon name="gift" size={18} /><span className="grow"><b>{o.kind}</b>{o.person_name && ` · ${o.person_name}`}<div className="tiny muted">{fmtDate(o.occasion_date, { year: !o.repeats })}{o.repeats && ` · next ${fmtDate(nextOccurrence(o.occasion_date, today))}`}{o.preferred_flavour && ` · likes ${o.preferred_flavour}`}{o.budget ? ` · ~${inr(o.budget)}` : ''}</div></span>
                <button className="btn btn-white btn-sm" onClick={() => setOcc(o)}>Edit</button><button className="btn btn-white btn-sm" onClick={async () => { if (confirm('Remove?')) { await api.remove('occasions', o.id); reload() } }}><Icon name="trash" size={14} /></button></div>
            ))}
            {!occs.length && !occ && <p className="tiny muted">None saved.</p>}
            {occ && <OccasionForm customerId={id} initial={occ.id ? occ : null} onDone={() => setOcc(null)} />}
          </div>
          <div className="card flat">
            <b>Orders</b>
            {st.orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((o) => (
              <div className="list-row small" key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenOrder(o.id)}>
                <span className="grow"><b>{o.order_number}</b> · {fmtDate(orderDate(o), { year: true })}<div className="tiny muted">{o.items.map((i) => `${i.name} (${itemSummary(i)})`).join('; ')}</div></span><span>{inr(o.total)}</span><StatusBadge s={o.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {openOrder && <OrderDrawer id={openOrder} onClose={() => setOpenOrder(null)} />}
    </Modal>
  )
}

// Deleting a customer needs a one-time code e-mailed to the bakery account (checked again by the database).
function DeleteCustomer({ c, st, onClose, onDeleted }) {
  const { toast } = useAdmin()
  const [step, setStep] = useState('confirm')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    setBusy(true)
    try { await api.sendDeleteCode(ADMIN_EMAIL); setStep('code'); toast('Code sent to ' + ADMIN_EMAIL) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  async function confirmDelete() {
    if (!/^\d{6,8}$/.test(code.trim())) return toast('Enter the code from the e-mail', true)
    setBusy(true)
    try {
      await api.verifyDeleteCode(ADMIN_EMAIL, code)
      await api.deleteCustomer(c.id)
      toast(`${c.name}'s data was deleted`); onDeleted()
    } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  return (
    <Modal title="Delete customer data?" onClose={onClose}>
      <div className="stack">
        <div className="card flat small" style={{ background: 'var(--pink)' }}>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Name</dt><dd><b>{c.name}</b></dd>
            <dt>Mobile</dt><dd>{prettyPhone(c.phone)}</dd>
            <dt>Place</dt><dd>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</dd>
            <dt>Orders</dt><dd>{st?.count || 0} · {inr(st?.spend || 0)}</dd>
          </dl>
        </div>
        <p className="small" style={{ margin: 0 }}>This permanently deletes the profile, saved addresses and special dates. Orders stay in your records without the link. <b>This can’t be undone.</b></p>
        {isDemo && <div className="notice warn small">Demo mode: the code is <b>123456</b>.</div>}
        {step === 'confirm' ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>To protect customer data, a one-time code will be e-mailed to <b>{ADMIN_EMAIL}</b>.</p>
            <button className="btn btn-danger" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send code to the bakery e-mail'}</button>
          </>
        ) : (
          <>
            <Field label="Code from the e-mail" hint="valid for a few minutes · check Spam/Promotions">
              <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
            </Field>
            <button className="btn btn-danger" disabled={busy} onClick={confirmDelete}>{busy ? 'Deleting…' : `Delete ${c.name}'s data permanently`}</button>
            <button className="link-btn small" disabled={busy} onClick={send}>Didn’t get it? Send again</button>
          </>
        )}
        <button className="btn btn-ghost" onClick={onClose}>Cancel — keep the customer</button>
      </div>
    </Modal>
  )
}

export default function Customers() {
  const { db, settings: s, reload, toast } = useAdmin()
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('all')
  const [sort, setSort] = useState('recent')
  const [place, setPlace] = useState('all')
  const places = useMemo(() => [...new Set(db.customers.map((c) => c.city).filter(Boolean))].sort(), [db.customers])
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ name: '', phone: '' })
  const today = todayISO(s.timezone)
  const stats = useMemo(() => customerStats(db.customers, db.orders), [db])
  const rows = useMemo(() => {
    let r = [...stats.values()]
    if (seg !== 'all') { const sg = SEGMENTS.find((x) => x.id === seg); r = r.filter((x) => sg.test(x, s.segments || {}, db.occasions.filter((o) => o.customer_id === x.c.id), today)) }
    if (place !== 'all') r = r.filter((x) => (place === 'none' ? !x.c.city : x.c.city === place))
    if (q) { const t = q.toLowerCase(); r = r.filter((x) => (x.c.name + x.c.phone + (x.c.email || '') + (x.c.city || '') + (x.c.state || '')).toLowerCase().includes(t)) }
    const by = { recent: (a, b) => (b.last || '').localeCompare(a.last || ''), spend: (a, b) => b.spend - a.spend, orders: (a, b) => b.count - a.count, name: (a, b) => a.c.name.localeCompare(b.c.name) }
    return r.sort(by[sort])
  }, [stats, seg, q, sort, place, s.segments, db.occasions, today])
  return (
    <>
      <PageHead title="Customers" sub={`${db.customers.length} customers · matched by mobile number`}>
        <button className="btn btn-soft btn-sm" onClick={() => downloadCSV(`customers-${today}.csv`, rows, [
          { label: 'Name', get: (x) => x.c.name }, { label: 'Mobile', get: (x) => x.c.phone }, { label: 'City / district', get: (x) => x.c.city }, { label: 'State', get: (x) => x.c.state }, { label: 'WhatsApp', get: (x) => x.c.whatsapp }, { label: 'E-mail', get: (x) => x.c.email },
          { label: 'Orders', get: (x) => x.count }, { label: 'Spend', get: (x) => x.spend }, { label: 'Avg order', get: (x) => x.aov }, { label: 'First order', get: (x) => x.first }, { label: 'Last order', get: (x) => x.last },
          { label: 'Fav flavour', get: (x) => x.favFlavour }, { label: 'Marketing consent', get: (x) => (x.c.marketing_consent ? 'yes' : 'no') }])}><Icon name="download" size={16} /> CSV</button>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add</button>
      </PageHead>
      <div className="toolbar">
        <input className="input" placeholder="Search name, mobile, place" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={place} onChange={(e) => setPlace(e.target.value)}><option value="all">All places</option>{places.map((p) => <option key={p} value={p}>{p}</option>)}<option value="none">Place not known</option></select>
        <select className="input" value={seg} onChange={(e) => setSeg(e.target.value)}><option value="all">All customers</option>{SEGMENTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Most recent</option><option value="spend">Top spend</option><option value="orders">Most orders</option><option value="name">Name</option></select>
      </div>
      {adding && (
        <div className="card row wrap" style={{ marginBottom: 12 }}>
          <input className="input" style={{ maxWidth: 240 }} placeholder="Name" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
          <input className="input" style={{ maxWidth: 200 }} placeholder="Mobile" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
          <button className="btn btn-primary btn-sm" onClick={async () => {
            const phone = normalizePhone(nc.phone)
            if (!nc.name.trim() || !phone) return toast('Name and a valid mobile are needed', true)
            if (db.customers.some((c) => c.phone === phone)) return toast('A customer with this number already exists', true)
            try { await api.insert('customers', { name: nc.name.trim().toUpperCase(), phone, whatsapp: phone }); setNc({ name: '', phone: '' }); setAdding(false); reload() } catch (e) { toast(cleanError(e), true) }
          }}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
      {!rows.length ? <Empty title="No customers yet">They appear automatically with each order.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Mobile</th><th>Place</th><th>Orders</th><th>Spend</th><th>Avg</th><th>Last order</th><th>Likes</th><th>Consent</th></tr></thead>
            <tbody>{rows.map((x) => (
              <tr key={x.c.id} className="click" onClick={() => setOpen(x.c.id)}>
                <td><b>{x.c.name}</b></td>
                <td className="nowrap">{prettyPhone(x.c.phone)}</td>
                <td>{x.c.city ? <>{x.c.city}<div className="tiny muted">{x.c.state}</div></> : <span className="muted">—</span>}</td>
                <td>{x.count}</td><td>{inr(x.spend)}</td><td>{inr(x.aov)}</td><td>{x.last ? fmtDate(x.last, { year: true }) : '—'}</td>
                <td className="small">{[x.favFlavour, x.favSize].filter(Boolean).join(' · ') || '—'}</td>
                <td>{x.c.marketing_consent ? <Badge tone="lime">yes</Badge> : <Badge tone="grey">no</Badge>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {open && <Profile id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
