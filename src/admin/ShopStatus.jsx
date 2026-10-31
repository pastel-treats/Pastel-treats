import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { fmtDate, addDaysISO, todayISO } from '../lib/dates.js'
import { ordersClosed } from '../lib/announcements.js'
import { Field, Switch } from '../components/ui.jsx'

const REASONS = [
  ['📦', 'Fully booked', 'We are fully booked right now and not taking new orders. Thank you for the love!'],
  ['🌴', 'On leave', 'We are on a short break and not taking new orders. Back soon!'],
  ['🪔', 'Festival holiday', 'We are closed for the festival. Wishing you and your family a happy celebration!'],
  ['🛠️', 'Kitchen break', 'Our kitchen is taking a short break. New orders will open again soon.'],
]

// One big switch to open / close the shop for new orders
export default function ShopStatus() {
  const { settings, reload, toast } = useAdmin()
  const closed = ordersClosed(settings)
  const [msg, setMsg] = useState(settings.orders_paused_message || REASONS[0][2])
  const [until, setUntil] = useState(settings.orders_paused_until || '')
  const [popup, setPopup] = useState(settings.orders_paused_popup !== false)
  const [busy, setBusy] = useState(false)
  const save = async (patch, ok) => {
    setBusy(true)
    try { await api.saveSettings({ ...settings, ...patch }); await reload(); toast(ok) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  const close = () => {
    if (until && until <= todayISO()) return toast('The reopen date must be after today', true)
    save({ orders_paused: true, orders_paused_message: msg.trim(), orders_paused_until: until || null, orders_paused_popup: popup, orders_paused_since: new Date().toISOString() }, 'Orders are now CLOSED')
  }
  const open = () => save({ orders_paused: false, orders_paused_until: null }, 'Orders are OPEN again')

  return (
    <>
      <PageHead title="Open / close orders" sub="Close the shop for new orders in one tap — when you're fully booked, on leave or on holiday. Existing orders are not affected." />
      <div className={'shop-state ' + (closed ? 'closed' : 'open')}>
        <div className="big">{closed ? '🔴 Orders are CLOSED' : '🟢 Taking orders'}</div>
        <div className="small">{closed
          ? <>Customers can browse the menu but can’t place orders.{settings.orders_paused_until ? <> Opens again automatically on <b>{fmtDate(settings.orders_paused_until, { weekday: true })}</b>.</> : ' Stays closed until you open it.'}</>
          : 'Customers can place orders as usual.'}</div>
        {closed && <button className="btn btn-primary btn-lg" disabled={busy} onClick={open}>Open orders now</button>}
      </div>

      <div className="card stack" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>{closed ? 'Change the closed message' : 'Close orders'}</div>
        <div className="chips">{REASONS.map(([i, t, m]) => <button key={t} type="button" className={'chip' + (msg === m ? ' on' : '')} onClick={() => setMsg(m)}>{i} {t}</button>)}</div>
        <Field label="Message customers will see"><textarea className="input" rows={2} maxLength={240} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
        <Field label="Open again automatically on" hint="optional — leave blank to open it yourself">
          <input type="date" className="input" min={addDaysISO(todayISO(), 1)} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Switch checked={popup} onChange={setPopup} label="Also show it as a pop-up when customers open the site" />
        <button className={'btn btn-block ' + (closed ? 'btn-white' : 'btn-danger')} disabled={busy || !msg.trim()} onClick={close}>{closed ? 'Save changes' : 'Close orders now'}</button>
        <p className="tiny muted" style={{ margin: 0 }}>Closing only on certain dates (e.g. leave next week)? Block those days in the <Link to="/admin/calendar">Calendar</Link> or post a “On leave” <Link to="/admin/announcements">announcement</Link> with “stop pickups on these dates”.</p>
      </div>
    </>
  )
}
