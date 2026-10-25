import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { api } from '../api/index.js'
import { cleanError, inr } from '../lib/format.js'
import { normalizePhone, waLink } from '../lib/contact.js'
import PhoneInput, { validPhone } from '../components/PhoneInput.jsx'
import { fmtDate, fmtDateTime } from '../lib/dates.js'
import { Field, Icon, StatusBadge, WaIcon } from '../components/ui.jsx'

// Privacy: orders are shown only (a) when they were placed/opened on this phone, or
// (b) when the customer knows BOTH the Order ID and the mobile number. A mobile number alone shows nothing.
export default function Track() {
  const { myOrders, rememberOrder, toast, settings: s } = useStore()
  const nav = useNavigate()
  const yyNow = String(new Date().getFullYear()).slice(2)
  const [number, setNumber] = useState('')
  const [yy, setYy] = useState(yyNow)
  const [phone, setPhone] = useState(() => myOrders[0]?.phone || '')
  const [busy, setBusy] = useState(false)

  async function find(e) {
    e.preventDefault()
    // accepts just the number ("12") or a full ID pasted in ("PT-12-26")
    const raw = number.trim().toUpperCase().replace(/\s+/g, '')
    const full = raw.match(/^PT-?(\d+)-?(\d{2})$/)
    const n = full ? `PT-${+full[1]}-${full[2]}` : /^\d+$/.test(raw) ? `PT-${+raw}-${yy}` : raw
    if (!/^PT-\d+-\d{2}$/.test(n)) return toast('Enter your order number, e.g. 12', true)
    if (!validPhone(phone)) return toast('Enter the mobile number used for the order', true)
    setBusy(true)
    try {
      const r = await api.getOrder(n, phone)
      rememberOrder({ number: r.order_number, phone: normalizePhone(phone), at: r.created_at })
      nav(`/order/${r.order_number}`)
    } catch (err) { toast(cleanError(err), true) } finally { setBusy(false) }
  }

  return (
    <div className="wrap section" style={{ maxWidth: 620, paddingTop: 24 }}>
      <h1 style={{ fontSize: '2.4rem' }}>My orders</h1>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">Orders on this phone</div>
        {!myOrders.length ? (
          <p className="small muted" style={{ margin: 0 }}>Orders you place on this phone appear here automatically.</p>
        ) : myOrders.map((o) => (
          <Link key={o.number} to={`/order/${o.number}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
            <Icon name="receipt" />
            <div className="grow">
              <div className="row wrap" style={{ gap: 6 }}><b>{o.number}</b>{o.status && <StatusBadge s={o.status} />}</div>
              {o.items && <div className="tiny muted">{o.items}</div>}
              <div className="tiny">
                {o.date ? `${o.fulfilment === 'courier' ? 'Courier' : 'Pickup'} ${fmtDate(o.date, { weekday: true })}` : 'Tap to see details'}
                {o.total ? ` · ${inr(o.total)}` : ''}{o.at ? ` · placed ${fmtDateTime(o.at)}` : ''}
              </div>
            </div>
            <Icon name="right" size={18} />
          </Link>
        ))}
      </div>

      <form className="card stack" style={{ marginTop: 16 }} onSubmit={find}>
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>Find an order</div>
          <p className="small muted" style={{ margin: 0 }}><b>Easiest:</b> tap your <b>order link</b> in your WhatsApp chat with us. Or enter your order number and mobile below — for your privacy, a mobile number alone doesn’t show any orders.</p>
        </div>
        <Field label="Order number" hint="just the number — for PT-12-26 type 12">
          <div className="id-input">
            <span>PT-</span>
            <input inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase().replace(/[^0-9PT-]/g, '').slice(0, 12))} placeholder="12" autoComplete="off" aria-label="Order number" />
            <select value={yy} onChange={(e) => setYy(e.target.value)} aria-label="Year">
              {[yyNow, String(+yyNow - 1).padStart(2, '0')].map((y) => <option key={y} value={y}>-{y}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Mobile number"><PhoneInput required value={phone} onChange={setPhone} /></Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Show my order'}</button>
      </form>

      {s.whatsapp && (
        <a className="card row" style={{ marginTop: 16, gap: 12, textDecoration: 'none', color: 'inherit' }} href={waLink(s.whatsapp, 'Hi Pastel Treats! I need help finding my order. My name / mobile: ')} target="_blank" rel="noreferrer">
          <WaIcon size={24} /><div className="grow"><b>Lost your Order ID?</b><div className="tiny muted">Message us on WhatsApp and we’ll help.</div></div><Icon name="right" size={18} />
        </a>
      )}
    </div>
  )
}
