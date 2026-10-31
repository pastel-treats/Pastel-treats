import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { inr, cleanError } from '../lib/format.js'
import { fmtDate, fmtDateTime } from '../lib/dates.js'
import { waLink, telLink, prettyPhone } from '../lib/contact.js'
import { Badge, Empty, Field, Icon, WaIcon } from '../components/ui.jsx'

// Hamper & seasonal enquiries ("Request a quote"), tracked separately from cake orders.
const STATUS = {
  new: ['New', 'peach'], quoted: ['Quote sent', 'butter'], confirmed: ['Confirmed', 'mint'], completed: ['Delivered', 'sky'], cancelled: ['Not going ahead', 'grey'],
}
const KIND = { hamper: '🎁 Hamper', seasonal: '🥭 Seasonal', other: '✨ Enquiry' }
const first = (n) => { const w = (n || '').trim().split(/\s+/)[0] || ''; return w.charAt(0) + w.slice(1).toLowerCase() }

function EnquiryCard({ e, onSaved }) {
  const { toast, settings: s } = useAdmin()
  const [v, setV] = useState({ status: e.status, quote_amount: e.quote_amount ?? '', amount_paid: e.amount_paid || 0, admin_notes: e.admin_notes || '' })
  const [busy, setBusy] = useState(false)
  const dirty = v.status !== e.status || String(v.quote_amount ?? '') !== String(e.quote_amount ?? '') || +v.amount_paid !== (e.amount_paid || 0) || v.admin_notes !== (e.admin_notes || '')
  const save = async (patch = {}) => {
    setBusy(true)
    try {
      await api.update('enquiries', e.id, { ...v, ...patch, quote_amount: (patch.quote_amount ?? v.quote_amount) === '' ? null : +(patch.quote_amount ?? v.quote_amount), amount_paid: +(patch.amount_paid ?? v.amount_paid) || 0, updated_at: new Date().toISOString() })
      toast('Saved'); onSaved()
    } catch (er) { toast(cleanError(er), true) } finally { setBusy(false) }
  }
  const quoteMsg = `Hi ${first(e.customer_name)}! Thank you for your ${e.kind === 'hamper' ? 'hamper' : ''} request ${e.enquiry_number} 💚\n${e.product_name || ''}${e.quantity ? ' · ' + e.quantity : ''}\nPrice: ${v.quote_amount ? inr(+v.quote_amount) : '₹____'}${e.kind === 'hamper' && e.quantity ? ' (total)' : ''}\n${e.needed_by ? 'Ready by: ' + fmtDate(e.needed_by, { weekday: true }) + '\n' : ''}To confirm, please pay the advance to ${s.upi_id || 'our UPI'} and send the screenshot here.`
  const [label, tone] = STATUS[e.status] || STATUS.new
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div><b className="serif" style={{ fontSize: '1.4rem', color: 'var(--forest)' }}>{e.enquiry_number}</b> <span className="small">{KIND[e.kind]}</span></div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="small"><b>{e.product_name}</b>{e.quantity ? ` · ${e.quantity}` : ''}{e.budget ? ` · budget ${inr(e.budget)}${e.kind === 'hamper' ? ' each' : ''}` : ''}</div>
      <div className="small">{e.customer_name} · {prettyPhone(e.phone)}{e.city ? ` · ${e.city}` : ''} · {e.fulfilment === 'courier' ? 'Courier' : 'Pickup'}</div>
      {e.needed_by && <div className="small">Needed by <b>{fmtDate(e.needed_by, { weekday: true, year: true })}</b></div>}
      {e.notes && <div className="small" style={{ background: 'var(--ivory)', borderRadius: 10, padding: '8px 10px' }}>“{e.notes}”</div>}
      <div className="tiny muted">Received {fmtDateTime(e.created_at)}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        <a className="btn btn-sm" style={{ background: '#25d366', color: '#fff' }} href={waLink(e.phone, `Hi ${first(e.customer_name)}, about your request ${e.enquiry_number}: `)} target="_blank" rel="noreferrer"><WaIcon size={16} /> WhatsApp</a>
        <a className="btn btn-soft btn-sm" href={telLink(e.phone)}><Icon name="phone" size={16} /> Call</a>
        <a className="btn btn-white btn-sm" href={waLink(e.phone, quoteMsg)} target="_blank" rel="noreferrer" onClick={() => { if (v.status === 'new' && v.quote_amount) save({ status: 'quoted' }) }}>Send quote on WhatsApp</a>
      </div>
      <div className="grid-2">
        <Field label="Status">
          <select className="input" value={v.status} onChange={(x) => setV({ ...v, status: x.target.value })}>
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Total price quoted ₹"><input className="input" inputMode="numeric" value={v.quote_amount} onChange={(x) => setV({ ...v, quote_amount: x.target.value.replace(/\D/g, '') })} placeholder="e.g. 20000" /></Field>
        <Field label="Amount received ₹"><input className="input" inputMode="numeric" value={v.amount_paid} onChange={(x) => setV({ ...v, amount_paid: x.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Balance">
          <div className="input" style={{ background: 'var(--ivory)' }}>{v.quote_amount ? inr(Math.max(+v.quote_amount - (+v.amount_paid || 0), 0)) : '—'}</div>
        </Field>
      </div>
      <Field label="Your notes" hint="only you see these"><textarea className="input" rows={2} value={v.admin_notes} onChange={(x) => setV({ ...v, admin_notes: x.target.value })} placeholder="Items agreed, packing, logo, delivery address…" /></Field>
      {dirty && <button className="btn btn-primary" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save changes'}</button>}
    </div>
  )
}

export default function Enquiries() {
  const { db, reload } = useAdmin()
  const [tab, setTab] = useState('open')
  const [kind, setKind] = useState('all')
  const all = useMemo(() => [...(db.enquiries || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [db.enquiries])
  const list = all.filter((e) => (kind === 'all' || e.kind === kind) && (tab === 'open' ? ['new', 'quoted', 'confirmed'].includes(e.status) : ['completed', 'cancelled'].includes(e.status)))
  const confirmed = all.filter((e) => ['confirmed', 'completed'].includes(e.status))
  const value = confirmed.reduce((a, e) => a + (e.quote_amount || 0), 0)
  const received = all.reduce((a, e) => a + (e.amount_paid || 0), 0)
  return (
    <>
      <PageHead title="Hampers & enquiries" sub="Every “Request a quote” for gift hampers and seasonal treats, with its own number (HP- / SE-). Separate from cake orders." />
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <div className="card"><div className="tiny muted">New — reply soon</div><b className="serif" style={{ fontSize: '1.8rem' }}>{all.filter((e) => e.status === 'new').length}</b></div>
        <div className="card"><div className="tiny muted">Confirmed value</div><b className="serif" style={{ fontSize: '1.8rem' }}>{inr(value)}</b></div>
        <div className="card"><div className="tiny muted">Received so far</div><b className="serif" style={{ fontSize: '1.8rem' }}>{inr(received)}</b></div>
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <button className={'chip' + (tab === 'open' ? ' on' : '')} onClick={() => setTab('open')}>Open ({all.filter((e) => ['new', 'quoted', 'confirmed'].includes(e.status)).length})</button>
        <button className={'chip' + (tab === 'closed' ? ' on' : '')} onClick={() => setTab('closed')}>Delivered / closed</button>
        <span style={{ width: 8 }} />
        {[['all', 'All'], ['hamper', '🎁 Hampers'], ['seasonal', '🥭 Seasonal'], ['other', '✨ Other']].map(([k, l]) => <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {!list.length ? <Empty title={tab === 'open' ? 'No open enquiries' : 'Nothing here yet'}>When a customer taps “Request a quote” on a hamper or seasonal treat, it appears here with its own number and a ring on your phone.</Empty>
        : <div className="stack">{list.map((e) => <EnquiryCard key={e.id + e.updated_at} e={e} onSaved={reload} />)}</div>}
    </>
  )
}
