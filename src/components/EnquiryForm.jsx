import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { addDaysISO, todayISO, fmtDate } from '../lib/dates.js'
import { waLink } from '../lib/contact.js'
import PhoneInput from './PhoneInput.jsx'
import { Modal, Field, WaIcon } from './ui.jsx'

// "Request a quote" for gift hampers & seasonal items — gets its own number (HP-… / SE-…) and lands in the
// baker's "Hampers & enquiries" tab. The customer can then continue on WhatsApp with the number filled in.
export default function EnquiryForm({ product, kind, onClose }) {
  const { settings: s } = useStore()
  const last = (() => { try { return JSON.parse(localStorage.getItem('pt-last-details') || 'null') || {} } catch { return {} } })()
  const [f, setF] = useState({ name: last.name || '', phone: last.phone || '', quantity: '', budget: '', needed_by: '', fulfilment: 'pickup', city: last.city || '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }))
  const hamper = kind === 'hamper'
  useEffect(() => { setErr(null) }, [f])

  async function send() {
    if (!f.name.trim()) return setErr('Please enter your name')
    if (!f.phone) return setErr('Please enter your mobile number')
    setBusy(true)
    try {
      const r = await api.submitEnquiry({ product_id: product.id, product_name: product.name, ...f, budget: f.budget ? Math.round(+f.budget) : null })
      setDone(r.enquiry_number)
      try { localStorage.setItem('pt-last-details', JSON.stringify({ ...last, name: f.name.trim(), phone: f.phone, city: f.city })) } catch { /* ignore */ }
    } catch (e) { setErr(cleanError(e)) } finally { setBusy(false) }
  }

  const waText = done && [
    `Hi Pastel Treats! I sent a ${hamper ? 'hamper' : 'quote'} request.`,
    `Request no: ${done}`,
    `Item: ${product.name.trim()}`,
    f.quantity && `Quantity: ${f.quantity}`,
    f.budget && `Budget: ₹${f.budget}${hamper ? ' per hamper' : ''}`,
    f.needed_by && `Needed by: ${fmtDate(f.needed_by, { weekday: true })}`,
    f.notes && `Details: ${f.notes}`,
  ].filter(Boolean).join('\n')

  return (
    <Modal title={done ? 'Request sent 🎉' : `Request a quote — ${product.name.trim()}`} onClose={onClose}>
      {done ? (
        <div className="stack center" style={{ alignItems: 'center' }}>
          <div className="tiny muted">Your request number</div>
          <div className="serif" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--forest)' }}>{done}</div>
          <p className="small" style={{ margin: 0, maxWidth: 380 }}>Thank you! The baker will message you on WhatsApp with options and the price. Mention <b>{done}</b> if you contact us.</p>
          {s.whatsapp && <a className="btn btn-wa btn-block" href={waLink(s.whatsapp, waText)} target="_blank" rel="noreferrer"><WaIcon size={18} /> Send photos / details on WhatsApp</a>}
          <button className="btn btn-white btn-block" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Tell us what you have in mind — we’ll reply on WhatsApp with options and a price. No payment now.</p>
          <div className="grid-2">
            <Field label="Your name"><input className="input" value={f.name} autoComplete="name" style={{ textTransform: 'uppercase' }} onChange={(e) => set('name')(e.target.value.toUpperCase())} /></Field>
            <Field label="Mobile number"><PhoneInput value={f.phone} onChange={set('phone')} /></Field>
            <Field label={hamper ? 'How many hampers?' : 'Quantity'} hint="optional"><input className="input" value={f.quantity} onChange={set('quantity')} placeholder={hamper ? 'e.g. 25' : 'e.g. 2 tubs'} maxLength={80} /></Field>
            <Field label={hamper ? 'Budget per hamper ₹' : 'Budget ₹'} hint="optional"><input className="input" inputMode="numeric" value={f.budget} onChange={(e) => set('budget')(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="e.g. 800" /></Field>
            <Field label="Needed by" hint="optional"><input type="date" className="input" min={addDaysISO(todayISO(s.timezone), 1)} value={f.needed_by} onChange={set('needed_by')} /></Field>
            <Field label="Pickup or courier?">
              <select className="input" value={f.fulfilment} onChange={set('fulfilment')}>
                <option value="pickup">Self pickup</option>
                <option value="courier">Courier / send to someone</option>
              </select>
            </Field>
          </div>
          {f.fulfilment === 'courier' && <Field label="City / town for delivery"><input className="input" value={f.city} onChange={set('city')} maxLength={80} /></Field>}
          <Field label="Anything else?" hint="optional"><textarea className="input" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} placeholder={hamper ? 'Occasion, items you’d like, logo / note card, colours…' : 'Flavours, size, any special request…'} /></Field>
          {err && <p className="err-text" role="alert" style={{ margin: 0 }}>{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send my request'}</button>
          {s.whatsapp && <a className="tiny center" href={waLink(s.whatsapp, `Hi Pastel Treats! I'd like to know more about: ${product.name.trim()}`)} target="_blank" rel="noreferrer">Or just message us on WhatsApp</a>}
        </div>
      )}
    </Modal>
  )
}
