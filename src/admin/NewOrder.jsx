import React, { useMemo, useState } from 'react'
import { useAdmin } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { inr, cleanError } from '../lib/format.js'
import { calcAdvance, startingPrice } from '../lib/pricing.js'
import { todayISO, fmtDate } from '../lib/dates.js'
import { normalizePhone, prettyPhone, waLink } from '../lib/contact.js'
import { ORDER_TEMPLATES } from '../lib/templates.js'
import PhoneInput from '../components/PhoneInput.jsx'
import { Modal, Field, Icon, WaIcon, compressImage, ACCEPT_IMG } from '../components/ui.jsx'

// The baker enters an order she took on WhatsApp, on the phone, on Instagram or in person.
const CHANNELS = [['whatsapp', '💬 WhatsApp'], ['phone', '📞 Phone call'], ['instagram', '📸 Instagram'], ['walk_in', '🏠 In person'], ['other', '✨ Other']]
// a labelled block for things that can't sit inside a <label> (buttons, file pickers)
const Block = ({ label, hint, children }) => <div className="field"><span>{label} {hint && <em className="hint" style={{ fontStyle: 'normal' }}>· {hint}</em>}</span>{children}</div>
const blankItem = () => ({ key: Math.random().toString(36).slice(2), product_id: '', name: '', qty: 1, line_total: '', details: '', message: '' })

export default function NewOrder({ onClose, onOpen }) {
  const { db, settings: s, reload, toast } = useAdmin()
  const products = useMemo(() => db.products.filter((p) => p.is_active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0)), [db.products])
  const slots = db.time_slots.filter((t) => t.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0))
  const [f, setF] = useState({ channel: 'whatsapp', name: '', phone: '', fulfilment: 'pickup', date: todayISO(s.timezone), slot_id: slots[0]?.id || '', slot_label: '',
    city: '', address: { line: '', pincode: '' }, delivery_charge: '', discount: '', advance_due: '', status: 'confirmed', notes: '', occasion: '' })
  const [items, setItems] = useState([blankItem()])
  const [pay, setPay] = useState({ amount: '', method: 'upi', reference: '' })
  const [shot, setShot] = useState(null) // { file, url }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const setItem = (key, patch) => setItems((xs) => xs.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const sub = items.reduce((a, i) => a + (+i.line_total || 0), 0)
  const total = Math.max(sub + (+f.delivery_charge || 0) - (+f.discount || 0), 0)
  const adv = f.advance_due === '' ? calcAdvance(total, s) : Math.min(+f.advance_due, total)
  const known = db.customers.find((c) => c.phone === normalizePhone(f.phone))
  const pastOrders = known ? db.orders.filter((o) => o.customer_id === known.id).length : 0

  const pickProduct = (key, id) => {
    const p = products.find((x) => x.id === id)
    if (!p) return setItem(key, { product_id: '', name: '' })
    const it = items.find((i) => i.key === key)
    setItem(key, { product_id: id, name: p.name.trim(), line_total: it.line_total || String(startingPrice(p) * (+it.qty || 1) || '') })
  }

  async function save() {
    setErr(null)
    if (!f.name.trim()) return setErr('Please enter the customer name')
    if (!normalizePhone(f.phone)) return setErr('Please enter a valid mobile number')
    if (!items.some((i) => i.name.trim())) return setErr('Please add at least one item')
    if (items.some((i) => i.name.trim() && !(+i.line_total >= 0 && i.line_total !== ''))) return setErr('Please enter the price for each item')
    if (+pay.amount > total) return setErr(`Payment received (${inr(+pay.amount)}) is more than the order total (${inr(total)})`)
    setBusy(true)
    try {
      let proof_path = null
      if (shot && +pay.amount > 0) proof_path = await api.uploadFile('proof', await compressImage(shot.file))
      const slot = slots.find((t) => t.id === f.slot_id)
      const r = await api.adminCreateOrder({
        ...f, name: f.name.trim(), slot_id: slot ? slot.id : null, slot_label: slot ? slot.label : f.slot_label,
        items: items.filter((i) => i.name.trim()).map(({ key, ...i }) => ({ ...i, line_total: +i.line_total || 0, qty: +i.qty || 1 })),
        delivery_charge: +f.delivery_charge || 0, discount: +f.discount || 0, advance_due: f.advance_due === '' ? '' : adv,
        payment: +pay.amount > 0 ? { ...pay, amount: +pay.amount, proof_path } : null,
      })
      await reload()
      setDone(r)
      toast(`Order ${r.order_number} saved`)
    } catch (e) { setErr(cleanError(e)) } finally { setBusy(false) }
  }

  if (done) {
    const o = db.orders.find((x) => x.id === done.id) || { ...done, customer_name: f.name, fulfilment: f.fulfilment, requested_date: f.date, slot_label: '', access_token: done.link_token }
    const tpl = o.status === 'confirmed' ? 'confirmed' : 'pay_advance'
    return (
      <Modal title="Order saved 🎉" onClose={onClose}>
        <div className="stack center" style={{ alignItems: 'center' }}>
          <div className="tiny muted">Order number</div>
          <div className="serif" style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--forest)' }}>{done.order_number}</div>
          <p className="small" style={{ margin: 0 }}>{inr(done.total)} · paid {inr(done.amount_paid)} · {o.status === 'confirmed' ? 'confirmed' : 'waiting for advance'}</p>
          <a className="btn btn-wa btn-block" href={waLink(o.whatsapp || o.phone || f.phone, ORDER_TEMPLATES[tpl].text(o, s))} target="_blank" rel="noreferrer"><WaIcon size={18} /> Send {o.status === 'confirmed' ? 'confirmation' : 'advance request'} on WhatsApp</a>
          <p className="tiny muted" style={{ margin: 0 }}>The message includes a private link where the customer can see the order and pay.</p>
          <button className="btn btn-white btn-block" onClick={() => onOpen(done.id)}>Open the order</button>
          <button className="link-btn small" onClick={onClose}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="New order (taken outside the website)" onClose={onClose} wide>
      <div className="stack">
        <Block label="Where did this order come from?">
          <div className="chips">{CHANNELS.map(([k, l]) => <button key={k} type="button" className={'chip' + (f.channel === k ? ' on' : '')} onClick={() => set('channel')(k)}>{l}</button>)}</div>
        </Block>

        <div className="grid-2">
          <Field label="Customer name"><input className="input" value={f.name} style={{ textTransform: 'uppercase' }} onChange={(e) => set('name')(e.target.value.toUpperCase())} /></Field>
          <Field label="Mobile (WhatsApp)" hint={known ? `returning customer · ${pastOrders} order${pastOrders === 1 ? '' : 's'}` : undefined}>
            <PhoneInput value={f.phone} onChange={(v) => { set('phone')(v); const c = db.customers.find((x) => x.phone === normalizePhone(v)); if (c && !f.name) set('name')(c.name.replace(/^Demo · /, '').toUpperCase()) }} />
          </Field>
        </div>

        <div className="card flat stack" style={{ gap: 10 }}>
          <b>Items</b>
          {items.map((i, n) => (
            <div key={i.key} className="stack" style={{ gap: 8, paddingBottom: 10, borderBottom: n < items.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div className="grid-2">
                <Field label={`Item ${n + 1}`}>
                  <select className="input" value={i.product_id} onChange={(e) => pickProduct(i.key, e.target.value)}>
                    <option value="">Something else (type below)</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name.trim()}</option>)}
                  </select>
                </Field>
                {!i.product_id && <Field label="Item name"><input className="input" value={i.name} placeholder="e.g. Custom unicorn cake" onChange={(e) => setItem(i.key, { name: e.target.value })} /></Field>}
                <Field label="Quantity"><input className="input" inputMode="numeric" value={i.qty} onChange={(e) => setItem(i.key, { qty: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
                <Field label="Price for this item ₹" hint="total for the quantity"><input className="input" inputMode="numeric" value={i.line_total} placeholder="e.g. 1600" onChange={(e) => setItem(i.key, { line_total: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
                <Field label="Size / flavour / details" hint="optional"><input className="input" value={i.details} placeholder="1 kg · Chocolate truffle · eggless" onChange={(e) => setItem(i.key, { details: e.target.value })} /></Field>
                <Field label="Message on cake" hint="optional"><input className="input" value={i.message} maxLength={120} onChange={(e) => setItem(i.key, { message: e.target.value })} /></Field>
              </div>
              {items.length > 1 && <button className="link-btn tiny" style={{ alignSelf: 'flex-start' }} onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))}>Remove this item</button>}
            </div>
          ))}
          <button className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setItems((xs) => [...xs, blankItem()])}><Icon name="plus" size={16} /> Add another item</button>
        </div>

        <div className="grid-2">
          <Field label="Pickup or courier?">
            <select className="input" value={f.fulfilment} onChange={set('fulfilment')}>
              <option value="pickup">Self pickup</option><option value="courier">Courier</option><option value="delivery">Home delivery</option>
            </select>
          </Field>
          <Field label="Date"><input type="date" className="input" value={f.date} onChange={set('date')} /></Field>
          <Field label="Time">
            <select className="input" value={f.slot_id} onChange={set('slot_id')}>
              {slots.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              <option value="">Other time…</option>
            </select>
          </Field>
          {!f.slot_id && <Field label="Time (type it)"><input className="input" value={f.slot_label} placeholder="e.g. 6:30 PM" onChange={set('slot_label')} /></Field>}
        </div>
        {f.fulfilment !== 'pickup' && known && db.customer_addresses.some((x) => x.customer_id === known.id) && (
          <Block label="Saved addresses">
            <div className="chips">{db.customer_addresses.filter((x) => x.customer_id === known.id).map((x) => (
              <button key={x.id} type="button" className={'chip' + (f.address.line === x.line ? ' on' : '')} onClick={() => setF((y) => ({ ...y, address: { line: [x.line, x.area].filter(Boolean).join(', '), pincode: [x.city, x.pincode].filter(Boolean).join(' '), label: x.label }, city: x.city || y.city }))}>
                {x.label || 'Address'}<small>{[x.line, x.city].filter(Boolean).join(', ').slice(0, 40)}</small>
              </button>))}</div>
          </Block>
        )}
        {f.fulfilment !== 'pickup' && (
          <div className="grid-2">
            <Field label="Address"><input className="input" value={f.address.line} onChange={(e) => set('address')({ ...f.address, line: e.target.value })} /></Field>
            <Field label="City / PIN code"><input className="input" value={f.address.pincode} onChange={(e) => { set('address')({ ...f.address, pincode: e.target.value }); set('city')(e.target.value.replace(/[\d\s-]+/g, ' ').trim()) }} placeholder="Madurai 625001" /></Field>
          </div>
        )}

        <div className="grid-2">
          <Field label={f.fulfilment === 'pickup' ? 'Extra charge ₹' : 'Courier / delivery charge ₹'} hint="optional"><input className="input" inputMode="numeric" value={f.delivery_charge} onChange={(e) => set('delivery_charge')(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Discount ₹" hint="optional"><input className="input" inputMode="numeric" value={f.discount} onChange={(e) => set('discount')(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Order total"><div className="input" style={{ background: 'var(--ivory)', display: 'flex', alignItems: 'center' }}><b>{inr(total)}</b></div></Field>
          <Field label="Advance needed ₹" hint={`your usual rule: ${inr(calcAdvance(total, s))}`}><input className="input" inputMode="numeric" value={f.advance_due} placeholder={String(calcAdvance(total, s))} onChange={(e) => set('advance_due')(e.target.value.replace(/\D/g, ''))} /></Field>
        </div>

        <div className="card flat stack" style={{ gap: 10 }}>
          <b>Payment already received?</b>
          <div className="grid-2">
            <Field label="Amount received ₹" hint="leave empty if nothing yet"><input className="input" inputMode="numeric" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Paid by"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></Field>
            <Field label="UPI reference / UTR" hint="optional"><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
            <Block label="Customer’s payment screenshot" hint="optional">
              <label className="btn btn-white btn-sm" style={{ justifyContent: 'flex-start' }}>
                <Icon name="upload" size={16} /> {shot ? 'Change screenshot' : 'Upload screenshot'}
                <input type="file" accept={ACCEPT_IMG} hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) setShot({ file, url: URL.createObjectURL(file) }) }} />
              </label>
            </Block>
          </div>
          {shot && <div className="upload-prev"><span className="u"><img src={shot.url} alt="Payment screenshot" /></span><button className="link-btn tiny" onClick={() => setShot(null)}>remove</button></div>}
          {+pay.amount > 0 && <p className="tiny muted" style={{ margin: 0 }}>{+pay.amount >= total ? 'Fully paid ✓' : `Balance after this: ${inr(total - +pay.amount)}`}</p>}
        </div>

        <div className="grid-2">
          <Field label="Order status">
            <select className="input" value={f.status} onChange={set('status')}>
              <option value="confirmed">Confirmed</option>
              <option value="awaiting_payment">Waiting for advance</option>
            </select>
          </Field>
          <Field label="Occasion" hint="optional"><input className="input" value={f.occasion} onChange={set('occasion')} placeholder="Birthday" /></Field>
        </div>
        <Field label="Notes" hint="optional — the customer can see these"><textarea className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>

        {err && <p className="err-text" role="alert" style={{ margin: 0 }}>{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save order · ${inr(total)}`}</button>
        <p className="tiny muted center" style={{ margin: 0 }}>Gets its own PT- number and shows up in Orders, Calendar, Payments and Sales like any website order. No phone alert is sent for orders you enter. {known ? `Saved to ${prettyPhone(known.phone)}’s customer record.` : ''}{f.date < todayISO(s.timezone) ? ` Note: the date is in the past (${fmtDate(f.date)}).` : ''}</p>
      </div>
    </Modal>
  )
}
