import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { api } from '../api/index.js'
import { cleanError, inr } from '../lib/format.js'
import { normalizePhone } from '../lib/contact.js'
import PhoneInput, { validPhone } from '../components/PhoneInput.jsx'
import { fmtDate, fmtDateTime } from '../lib/dates.js'
import { Field, Icon, StatusBadge, Empty } from '../components/ui.jsx'

// Customers find their orders with just their mobile number
export default function Track() {
  const { myOrders, rememberOrder, toast } = useStore()
  const [phone, setPhone] = useState(() => myOrders[0]?.phone || '')
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  async function go(e) {
    e?.preventDefault()
    if (!validPhone(phone)) return toast('Please enter your mobile number', true)
    setBusy(true)
    try {
      const orders = await api.getOrdersByPhone(phone)
      setList(orders)
      const ph = normalizePhone(phone)
      orders.slice(0, 20).reverse().forEach((o) => rememberOrder({ number: o.order_number, phone: ph, at: o.created_at }))
    } catch (err) { toast(cleanError(err), true) } finally { setBusy(false) }
  }
  return (
    <div className="wrap section" style={{ maxWidth: 620, paddingTop: 24 }}>
      <h1 style={{ fontSize: '2.4rem' }}>My orders</h1>
      <p className="muted">Enter the mobile number you ordered with to see your orders and their status.</p>
      <form className="card stack" style={{ marginTop: 12 }} onSubmit={go}>
        <Field label="Mobile number"><PhoneInput required value={phone} onChange={setPhone} /></Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Show my orders'}</button>
      </form>
      {list && (
        <div className="card" style={{ marginTop: 16 }}>
          {!list.length ? <Empty title="No orders for this number">Check the number, or <Link to="/menu">place your first order</Link>.</Empty> : list.map((o) => (
            <Link key={o.order_number} to={`/order/${o.order_number}`} className="list-row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
              <Icon name="receipt" />
              <div className="grow">
                <div className="row wrap" style={{ gap: 6 }}><b>{o.order_number}</b><StatusBadge s={o.status} /></div>
                <div className="tiny muted">{o.items.map((i) => `${i.qty > 1 ? i.qty + ' × ' : ''}${i.name}`).join(', ')}</div>
                <div className="tiny">{o.fulfilment === 'courier' ? 'Courier dispatch' : 'Pickup'} {fmtDate(o.confirmed_date || o.requested_date, { weekday: true })} · {inr(o.total)} · placed {fmtDateTime(o.created_at)}</div>
              </div>
              <Icon name="right" size={18} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
