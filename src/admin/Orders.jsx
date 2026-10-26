import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { inr, cleanError, itemSummary, ORDER_STATUS, statusLabel } from '../lib/format.js'
import { fmtDate, fmtDateTime, todayISO, addDaysISO } from '../lib/dates.js'
import { calcAdvance } from '../lib/pricing.js'
import { orderDate } from '../lib/analytics.js'
import { cancellationTerms } from '../lib/cancellation.js'
import { ORDER_TEMPLATES } from '../lib/templates.js'
import { waLink, prettyPhone, telLink, downloadCSV } from '../lib/contact.js'
import { Modal, StatusBadge, PayBadge, Badge, Icon, Field, Empty, WaIcon, Spinner } from '../components/ui.jsx'

const NEXT = {
  submitted: [['awaiting_payment', 'Approve & request advance'], ['confirmed', 'Confirm now']],
  awaiting_payment: [['confirmed', 'Confirm without advance']],
  payment_verification: [],
  advance_received: [['confirmed', 'Confirm order']],
  confirmed: [['in_preparation', 'Start preparing']],
  in_preparation: [['ready', 'Ready for pickup'], ['out_for_delivery', 'Out for delivery']],
  ready: [['completed', 'Mark collected']],
  out_for_delivery: [['completed', 'Mark delivered']],
  cancelled: [],
}
const TEMPLATE_FOR = { confirmed: 'confirmed', in_preparation: 'preparing', ready: 'ready', out_for_delivery: 'out_for_delivery', completed: 'completed', cancelled: 'cancelled', awaiting_payment: 'pay_advance', refunded: 'refunded' }

function SignedImg({ path, label }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { api.fileUrl(path).then(setUrl) }, [path])
  if (!url) return <div className="u" style={{ display: 'grid', placeItems: 'center', background: 'var(--mint-wash)' }}><Spinner /></div>
  return <a className="u" href={url} target="_blank" rel="noreferrer" title={label}><img src={url} alt={label || 'Upload'} /></a>
}

export function OrderDrawer({ id, onClose }) {
  const { db, reload, settings: s, toast } = useAdmin()
  const o = db.orders.find((x) => x.id === id)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [manual, setManual] = useState('')
  const [sched, setSched] = useState(() => ({ date: o?.confirmed_date || o?.requested_date || '', slot: o?.confirmed_slot_label || o?.slot_label || '' }))
  const [price, setPrice] = useState(() => ({ delivery_charge: o?.delivery_charge || 0, discount: o?.discount || 0, subtotal: o?.subtotal || 0, quote_note: o?.quote_note || '', reason: '' }))
  const [pay, setPay] = useState({ kind: 'advance', method: 'upi', amount: '', reference: '' })
  const [notes, setNotes] = useState(o?.admin_notes || '')
  // WhatsApp follow-up suggestion — a brand-new order first offers the "Order placed, awaiting confirmation" message
  const [prompt, setPrompt] = useState(() => (o && ['submitted', 'awaiting_payment', 'payment_verification'].includes(o.status)
    && !db.notification_log.some((n) => n.order_id === o.id && /^received-/.test(n.template)) ? 'received' : null))
  const [cancelling, setCancelling] = useState(false)
  if (!o) return null
  const payments = db.payments.filter((p) => p.order_id === o.id)
  const history = db.order_status_history.filter((h) => h.order_id === o.id).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const customer = db.customers.find((c) => c.id === o.customer_id)
  const msgs = db.notification_log.filter((n) => n.order_id === o.id)
  const phone = o.whatsapp || o.phone
  const run = async (fn, okMsg, follow) => {
    setBusy(true)
    try { await fn(); await reload(); okMsg && toast(okMsg); if (follow) setPrompt(follow) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  const setStatus = (st, n) => run(() => api.setStatus(o.id, st, n || note || null).then(() => st === 'completed' && api.update('orders', o.id, { actual_handover_at: new Date().toISOString() })),
    `Status: ${statusLabel(st)}`, TEMPLATE_FOR[st])
  const sendWA = async (key) => {
    const fresh = db.orders.find((x) => x.id === o.id)
    const text = ORDER_TEMPLATES[key].text(fresh, s)
    window.open(waLink(phone, text), '_blank')
    await api.insert('notification_log', { order_id: o.id, customer_id: o.customer_id, channel: 'whatsapp', template: `${key}-${o.id}-${Date.now()}`, message: text, status: 'sent_manually' }).catch(() => {})
    setPrompt(null); reload()
  }
  const newTotal = Math.max(+price.subtotal + +price.delivery_charge - +price.discount, 0)
  const priceChanged = newTotal !== o.total || +price.delivery_charge !== o.delivery_charge || +price.discount !== o.discount
  const closed = ['cancelled', 'refunded', 'refund_pending', 'completed'].includes(o.status)

  return (
    <Modal title={o.order_number} onClose={onClose} wide>
      <div className="row wrap" style={{ marginTop: -6, marginBottom: 12 }}>
        <StatusBadge s={o.status} short={false} /><PayBadge s={o.payment_status} />
        {o.is_custom && <Badge tone="rose">Custom · quote {o.quote_status}</Badge>}
        {o.needs_delivery_approval && <Badge tone="peach">Delivery needs approval</Badge>}
        <Badge tone="sky">{o.payment_method}</Badge>
        {o.demo && <Badge tone="butter">Demo record</Badge>}
      </div>

      {prompt && ORDER_TEMPLATES[prompt] && (
        <div className="notice info row" style={{ marginBottom: 12, alignItems: 'center' }}>
          <WaIcon size={22} /><div className="grow small">Let the customer know? <b>{ORDER_TEMPLATES[prompt].label}</b></div>
          <button className="btn btn-sm" style={{ background: '#25d366', color: '#fff' }} onClick={() => sendWA(prompt)}>Send on WhatsApp</button>
          <button className="btn btn-white btn-sm" onClick={() => setPrompt(null)}>Skip</button>
        </div>
      )}

      <div className="cards-2">
        <div className="stack">
          <div className="card flat">
            <div className="row between"><b>{o.customer_name}</b>{customer && <span className="tiny muted">{customer.marketing_consent ? '✓ marketing consent' : 'no marketing consent'}</span>}</div>
            <div className="small">{prettyPhone(o.phone)} {o.email && `· ${o.email}`}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <a className="btn btn-sm" style={{ background: '#25d366', color: '#fff' }} href={waLink(phone, `Hi ${o.customer_name.split(' ')[0]}, about your order ${o.order_number}: `)} target="_blank" rel="noreferrer"><WaIcon size={16} /> WhatsApp</a>
              <a className="btn btn-soft btn-sm" href={telLink(o.phone)}><Icon name="phone" size={16} /> Call</a>
            </div>
            <hr className="soft" />
            <dl className="kv small">
              <dt>{o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</dt><dd>{fmtDate(orderDate(o), { weekday: true, year: true })} · {o.confirmed_slot_label || o.slot_label}{!o.confirmed_date && <span className="muted"> (requested)</span>}</dd>
              {o.alt_date && <><dt>Alternative</dt><dd>{fmtDate(o.alt_date)} {o.alt_slot_label}</dd></>}
              {o.address && <><dt>Address</dt><dd>{[o.address.line, o.address.area, o.address.city, o.address.pincode, o.address.landmark && 'near ' + o.address.landmark].filter(Boolean).join(', ')}</dd></>}
              {o.occasion && <><dt>Occasion</dt><dd>{o.occasion} {o.occasion_date && `· ${fmtDate(o.occasion_date)}`}</dd></>}
              <dt>Placed</dt><dd>{fmtDateTime(o.created_at)}</dd>
              {o.actual_handover_at && <><dt>Handed over</dt><dd>{fmtDateTime(o.actual_handover_at)}</dd></>}
              {o.notes && <><dt>Notes</dt><dd style={{ whiteSpace: 'pre-line' }}>{o.notes}</dd></>}
            </dl>
          </div>

          <div className="card flat">
            <b>Items</b>
            {o.items.map((i, k) => (
              <div className="line-item" key={k}>
                <div className="grow">
                  <div className="row between"><b className="small">{i.qty} × {i.name}</b><span className="small">{inr(i.line_total)}</span></div>
                  <div className="tiny muted">{itemSummary(i)}</div>
                  {[['Message', i.message], ['Name', i.name_on_cake], ['Age', i.age], ['Colours', i.colours], ['Theme', i.theme], ['Instructions', i.instructions], ['Custom design', i.custom_description]].filter(([, v]) => v).map(([k2, v]) => <div className="tiny" key={k2}><b>{k2}:</b> {v}</div>)}
                  {i.addons?.length > 0 && <div className="tiny">+ {i.addons.map((a) => `${a.name} (${inr(a.price)})`).join(', ')}</div>}
                  {i.reference_images?.length > 0 && <div className="upload-prev" style={{ marginTop: 6 }}>{i.reference_images.map((p) => <SignedImg key={p.slice(-50)} path={p} label="Reference" />)}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="card flat">
            <b>Status history</b>
            <ul className="timeline" style={{ marginTop: 8 }}>
              {history.map((h) => <li key={h.id} className="done"><span><b className="small">{statusLabel(h.to_status)}</b><br /><span className="tiny muted">{fmtDateTime(h.created_at)}{h.note ? ` · ${h.note}` : ''}</span></span></li>)}
            </ul>
            {msgs.length > 0 && <div className="tiny muted">Messages sent: {msgs.map((m) => m.template.split('-')[0]).join(', ')}</div>}
          </div>
        </div>

        <div className="stack">
          {!closed && (
            <div className="card flat stack">
              <b>Next step</b>
              <div className="row wrap">
                {(NEXT[o.status] || []).filter(([st]) => !(o.fulfilment === 'pickup' && st === 'out_for_delivery') && !(o.fulfilment === 'delivery' && st === 'ready')).map(([st, label]) => (
                  <button key={st} className="btn btn-primary btn-sm" disabled={busy || (o.quote_status === 'pending' && st !== 'confirmed' && false)} onClick={() => {
                    if (st === 'confirmed' && !o.confirmed_date) return run(async () => { await api.update('orders', o.id, { confirmed_date: sched.date, confirmed_slot_label: sched.slot }); await api.setStatus(o.id, 'confirmed', note || null) }, 'Order confirmed', 'confirmed')
                    if (st === 'awaiting_payment' && o.quote_status === 'pending') return run(async () => { await api.update('orders', o.id, { quote_status: 'approved', needs_delivery_approval: false }); await api.setStatus(o.id, 'awaiting_payment', 'Design approved') }, 'Approved', 'quote')
                    if (st === 'awaiting_payment' && o.needs_delivery_approval) return run(async () => { await api.update('orders', o.id, { needs_delivery_approval: false }); await api.setStatus(o.id, 'awaiting_payment', 'Delivery approved') }, 'Approved', 'pay_advance')
                    setStatus(st)
                  }}>{label}</button>
                ))}
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setCancelling((v) => !v)}>Cancel order…</button>
              </div>
              {cancelling && (() => {
                const t = cancellationTerms(o, db.time_slots, s)
                const doCancel = (refund) => run(async () => {
                  await api.setStatus(o.id, 'cancelled', note || `Cancelled ${t.hoursLeft} hrs before slot`)
                  if (refund > 0) await api.insert('payments', { order_id: o.id, kind: 'refund', method: 'upi', amount: refund, status: 'pending', note: 'Refund as per cancellation policy' })
                  setCancelling(false)
                }, refund > 0 ? `Cancelled — refund of ${inr(refund)} marked pending` : 'Order cancelled', 'cancelled')
                return (
                  <div className="notice rose small" style={{ display: 'grid', gap: 8 }}>
                    <b>Cancel {o.order_number}?</b>
                    <span>Paid so far: {inr(t.paid)}. {t.summary}</span>
                    <span className="tiny">The time slot is freed for other customers straight away.</span>
                    <div className="row wrap">
                      {t.paid > 0 && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => doCancel(t.paid)}>Cancel & refund {inr(t.paid)}</button>}
                      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => doCancel(0)}>{t.paid > 0 ? 'Cancel, no refund' : 'Yes, cancel'}</button>
                      <button className="btn btn-white btn-sm" onClick={() => setCancelling(false)}>Keep order</button>
                    </div>
                    {t.paid > 0 && <span className="tiny">Policy suggests: {t.fullRefund ? 'full refund' : 'no refund'}. After you send the money back, open Payments here and tap “Mark refunded”.</span>}
                  </div>
                )
              })()}
              <Field label="Note for the history" hint="optional"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <Field label="Or set status manually">
                <select className="input" value={manual} onChange={(e) => setManual(e.target.value)}>
                  <option value="">Choose…</option>{Object.entries(ORDER_STATUS).filter(([k]) => k !== o.status).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              {manual && (
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => { const st = manual; setManual(''); setStatus(st) }}>Save — change to “{ORDER_STATUS[manual]?.label}”</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setManual('')}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {(o.is_custom || o.needs_delivery_approval) && o.quote_status !== 'rejected' && !closed && (
            <div className="card flat stack" style={{ background: 'var(--pink)' }}>
              <b>{o.is_custom ? 'Custom design quote' : o.fulfilment === 'courier' ? 'Courier charge' : 'Out-of-area delivery'}</b>
              <p className="tiny" style={{ margin: 0 }}>Set the final price below (“Price & charges”), then approve. The customer pays the advance only after this.</p>
              <Field label="Note to customer"><input className="input" value={price.quote_note} onChange={(e) => setPrice({ ...price, quote_note: e.target.value })} placeholder="Includes 2-tier sugar flowers…" /></Field>
              <div className="row wrap">
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => {
                  await api.update('orders', o.id, { quote_status: o.is_custom ? 'approved' : o.quote_status, needs_delivery_approval: false, quote_note: price.quote_note || null })
                  if (['submitted'].includes(o.status)) await api.setStatus(o.id, 'awaiting_payment', 'Quote approved')
                }, 'Quote approved', o.is_custom ? 'quote' : 'pay_advance')}>Approve & send quote</button>
                {o.is_custom && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => { if (confirm('Reject this design request? The order will be cancelled.')) run(async () => { await api.update('orders', o.id, { quote_status: 'rejected', quote_note: price.quote_note || null }); await api.setStatus(o.id, 'cancelled', 'Design rejected: ' + (price.quote_note || '')) }, 'Rejected', 'cancelled') }}>Reject design</button>}
              </div>
            </div>
          )}

          <div className="card flat stack">
            <b>Confirm / reschedule</b>
            <div className="grid-2">
              <Field label="Date"><input type="date" className="input" value={sched.date} onChange={(e) => setSched({ ...sched, date: e.target.value })} /></Field>
              <Field label="Time slot"><select className="input" value={sched.slot} onChange={(e) => setSched({ ...sched, slot: e.target.value })}>{db.time_slots.map((t) => <option key={t.id}>{t.label}</option>)}</select></Field>
            </div>
            <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => {
              const slot = db.time_slots.find((t) => t.label === sched.slot)
              const changed = o.confirmed_date ? sched.date !== o.confirmed_date || sched.slot !== o.confirmed_slot_label : sched.date !== o.requested_date || sched.slot !== o.slot_label
              run(() => api.update('orders', o.id, { confirmed_date: sched.date, confirmed_slot_label: sched.slot, ...(slot ? { slot_id: slot.id } : {}),
                admin_notes: changed ? `${o.admin_notes ? o.admin_notes + '\n' : ''}[${new Date().toLocaleString('en-IN')}] Schedule set to ${sched.date} ${sched.slot}${note ? ' — ' + note : ''}` : o.admin_notes }),
              'Schedule saved', changed ? 'rescheduled' : 'confirmed')
            }}>Save schedule</button>
          </div>

          <div className="card flat stack">
            <b>Price & charges</b>
            <div className="grid-2">
              <Field label="Items subtotal"><input type="number" className="input" value={price.subtotal} onChange={(e) => setPrice({ ...price, subtotal: e.target.value })} /></Field>
              <Field label={o.fulfilment === 'courier' ? 'Courier charge' : 'Delivery charge'}><input type="number" className="input" value={price.delivery_charge} onChange={(e) => setPrice({ ...price, delivery_charge: e.target.value })} /></Field>
              <Field label="Discount"><input type="number" className="input" value={price.discount} onChange={(e) => setPrice({ ...price, discount: e.target.value })} /></Field>
              <Field label="New total"><div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--ivory)' }}><b>{inr(newTotal)}</b>&nbsp;<span className="tiny muted">advance {inr(calcAdvance(newTotal, s))}</span></div></Field>
            </div>
            {priceChanged && <Field label="Reason for change (saved in the audit trail)"><input className="input" value={price.reason} onChange={(e) => setPrice({ ...price, reason: e.target.value })} /></Field>}
            <button className="btn btn-soft btn-sm" disabled={busy || !priceChanged} onClick={() => {
              if (!price.reason.trim()) return toast('Please add a reason for the price change', true)
              run(() => api.update('orders', o.id, { subtotal: +price.subtotal, delivery_charge: +price.delivery_charge, discount: +price.discount, total: newTotal, advance_due: calcAdvance(newTotal, s),
                admin_notes: `${o.admin_notes ? o.admin_notes + '\n' : ''}[${new Date().toLocaleString('en-IN')}] Price ${inr(o.total)} → ${inr(newTotal)}: ${price.reason}` }), 'Price updated', o.is_custom && o.quote_status === 'pending' ? null : 'price_changed')
            }}>Save price</button>
          </div>

          <div className="card flat stack">
            <div className="row between"><b>Payments</b><span className="small">Paid {inr(o.amount_paid)} of {inr(o.total)} · advance {inr(o.advance_due)}</span></div>
            {payments.map((p) => (
              <div className="list-row" key={p.id} style={{ alignItems: 'flex-start' }}>
                <div className="grow small">
                  <b>{p.kind === 'refund' ? 'Refund' : p.kind} · {inr(p.amount)}</b> <Badge tone={p.status === 'verified' ? 'mint' : p.status === 'pending' ? 'peach' : 'grey'}>{p.status}</Badge>
                  <div className="tiny muted">{p.method}{p.reference ? ` · ref ${p.reference}` : ''} · {fmtDateTime(p.created_at)}{p.note ? ` · ${p.note}` : ''}</div>
                  {p.proof_path && <div className="upload-prev" style={{ marginTop: 6 }}><SignedImg path={p.proof_path} label="Payment proof" /></div>}
                </div>
                {p.status === 'pending' && (
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => api.update('payments', p.id, { status: 'verified' }), p.kind === 'refund' ? 'Refund recorded' : 'Payment verified', p.kind === 'refund' ? 'refunded' : 'payment_received')}>{p.kind === 'refund' ? 'Mark refunded' : 'Verify'}</button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => api.update('payments', p.id, { status: 'rejected' }), 'Marked as not received')}>Reject</button>
                  </div>
                )}
              </div>
            ))}
            <div className="tiny muted">Check your bank / UPI app for the amount & UTR before verifying.</div>
            <div className="grid-2">
              <Field label="Type"><select className="input" value={pay.kind} onChange={(e) => setPay({ ...pay, kind: e.target.value })}><option value="advance">Advance</option><option value="balance">Balance</option><option value="refund">Refund</option></select></Field>
              <Field label="Method"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="gateway">Gateway</option><option value="other">Other</option></select></Field>
              <Field label="Amount ₹"><input type="number" className="input" value={pay.amount} placeholder={String(Math.max(o.advance_due - o.amount_paid, 0) || o.total - o.amount_paid)} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Reference / UTR"><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
            </div>
            <button className="btn btn-soft btn-sm" disabled={busy || !(+pay.amount > 0)} onClick={() => run(async () => {
              await api.insert('payments', { order_id: o.id, kind: pay.kind, method: pay.method, amount: +pay.amount, reference: pay.reference || null, status: pay.kind === 'refund' ? 'pending' : 'verified', note: 'Recorded by baker' })
              setPay({ kind: 'balance', method: 'cash', amount: '', reference: '' })
            }, pay.kind === 'refund' ? 'Refund marked pending — verify once sent' : 'Payment recorded', pay.kind === 'refund' ? null : 'payment_received')}>{pay.kind === 'refund' ? 'Record refund' : 'Record payment received'}</button>
          </div>

          <div className="card flat stack">
            <b>Message the customer</b>
            <div className="chips">{Object.entries(ORDER_TEMPLATES).map(([k, t]) => <button key={k} className="chip" onClick={() => sendWA(k)}>{t.label}</button>)}</div>
          </div>

          <div className="card flat stack">
            <b>Private notes</b>
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn btn-soft btn-sm" disabled={notes === (o.admin_notes || '')} onClick={() => run(() => api.update('orders', o.id, { admin_notes: notes }), 'Notes saved')}>Save notes</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

const SCOPES = [['all', 'All dates'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days'], ['past', 'Past'], ['range', 'Custom range']]
const STATUS_TABS = [
  ['active', 'Active', (o) => !['completed', 'cancelled', 'refunded', 'refund_pending'].includes(o.status)],
  ['pending_confirm', 'Pending confirmation', (o) => ['submitted', 'advance_received'].includes(o.status)],
  ['pending_pay', 'Pending payment', (o) => ['awaiting_payment', 'payment_verification'].includes(o.status)],
  ['confirmed', 'Confirmed', (o) => o.status === 'confirmed'],
  ['in_preparation', 'In preparation', (o) => o.status === 'in_preparation'],
  ['ready', 'Ready', (o) => o.status === 'ready'],
  ['out_for_delivery', 'Out for delivery', (o) => o.status === 'out_for_delivery'],
  ['completed', 'Completed', (o) => o.status === 'completed'],
  ['cancelled', 'Cancelled', (o) => ['cancelled', 'refunded', 'refund_pending'].includes(o.status)],
  ['all', 'All', () => true],
]

export default function Orders({ preset }) {
  const { db, settings: s } = useAdmin()
  const [sp, setSp] = useSearchParams()
  const [scope, setScope] = useState('all')
  const [tab, setTab] = useState(sp.get('tab') || 'active')
  const [q, setQ] = useState('')
  const [range, setRange] = useState({ from: todayISO(), to: addDaysISO(todayISO(), 30) })
  const openId = sp.get('open')
  const today = todayISO(s.timezone)
  const rows = useMemo(() => {
    let r = db.orders
    if (preset === 'approvals') r = r.filter((o) => (o.quote_status === 'pending' || o.needs_delivery_approval) && !['cancelled', 'refunded', 'completed'].includes(o.status))
    else r = r.filter(STATUS_TABS.find((t) => t[0] === tab)[2])
    r = r.filter((o) => {
      const d = orderDate(o)
      if (scope === 'today') return d === today
      if (scope === 'tomorrow') return d === addDaysISO(today, 1)
      if (scope === 'week') return d >= today && d <= addDaysISO(today, 6)
      if (scope === 'past') return d < today
      if (scope === 'range') return d >= range.from && d <= range.to
      return true
    })
    if (q) { const t = q.toLowerCase(); r = r.filter((o) => (o.order_number + o.customer_name + o.phone + o.items.map((i) => i.name).join()).toLowerCase().includes(t)) }
    return r.slice().sort((a, b) => (scope === 'past' ? orderDate(b).localeCompare(orderDate(a)) : orderDate(a).localeCompare(orderDate(b))) || a.created_at.localeCompare(b.created_at))
  }, [db.orders, tab, scope, q, range, preset, today])
  const exportCsv = () => downloadCSV(`orders-${today}.csv`, rows, [
    { label: 'Order', get: (o) => o.order_number }, { label: 'Placed', get: (o) => o.created_at }, { label: 'Customer', get: (o) => o.customer_name }, { label: 'Mobile', get: (o) => o.phone },
    { label: 'Items', get: (o) => o.items.map((i) => `${i.qty}x ${i.name} (${itemSummary(i)})`).join('; ') }, { label: 'Total', get: (o) => o.total }, { label: 'Advance', get: (o) => o.advance_due },
    { label: 'Paid', get: (o) => o.amount_paid }, { label: 'Balance', get: (o) => o.total - o.amount_paid }, { label: 'Date', get: orderDate }, { label: 'Slot', get: (o) => o.confirmed_slot_label || o.slot_label },
    { label: 'Mode', get: (o) => o.fulfilment }, { label: 'Payment status', get: (o) => o.payment_status }, { label: 'Status', get: (o) => o.status },
  ])
  return (
    <>
      <PageHead title={preset === 'approvals' ? 'Custom design & delivery approvals' : 'Orders'} sub={`${rows.length} order${rows.length === 1 ? '' : 's'}`}>
        <button className="btn btn-soft btn-sm" onClick={exportCsv}><Icon name="download" size={16} /> CSV</button>
      </PageHead>
      {preset !== 'approvals' && <div className="pill-tabs">{STATUS_TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}
      <div className="toolbar">
        <input className="input" placeholder="Search name, mobile, order…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>{SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {scope === 'range' && <><input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /><input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></>}
      </div>
      {!rows.length ? <Empty title="No orders here">Try another filter.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Order</th><th>Customer</th><th>For</th><th>Cake</th><th>Total</th><th>Paid</th><th>Balance</th><th>Payment</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="click" onClick={() => setSp({ open: o.id, tab })}>
                  <td><b>{o.order_number}</b><div className="tiny muted">{fmtDateTime(o.created_at)}</div></td>
                  <td>{o.customer_name}<div className="tiny muted">{prettyPhone(o.phone)}</div></td>
                  <td>{fmtDate(orderDate(o), { weekday: true })}<div className="tiny muted">{o.confirmed_slot_label || o.slot_label} · {o.fulfilment}</div></td>
                  <td className="small">{o.items.map((i) => `${i.qty > 1 ? i.qty + '× ' : ''}${i.name}${i.weight ? ' ' + i.weight : ''}`).join(', ')}{o.is_custom && <> <Badge tone="rose">custom</Badge></>}</td>
                  <td>{inr(o.total)}<div className="tiny muted">adv {inr(o.advance_due)}</div></td>
                  <td>{inr(o.amount_paid)}</td>
                  <td>{inr(o.total - o.amount_paid)}</td>
                  <td><PayBadge s={o.payment_status} /></td>
                  <td><StatusBadge s={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <OrderDrawer id={openId} onClose={() => setSp({ tab })} />}
    </>
  )
}
