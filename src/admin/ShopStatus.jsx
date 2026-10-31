import React, { useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { fmtDate, addDaysISO, todayISO } from '../lib/dates.js'
import { ordersClosed, notYetOpen, opensLabel } from '../lib/announcements.js'
import { Field, Switch } from '../components/ui.jsx'
import ClosedDates from './ClosedDates.jsx'

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
  const [openDate, setOpenDate] = useState((settings.orders_open_at || '').slice(0, 10))
  const [openTime, setOpenTime] = useState((settings.orders_open_at || '').slice(11, 16) || '11:11')
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
      <div className="card stack" style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>⏰ Start taking orders from</div>
        <p className="small muted" style={{ margin: 0 }}>Before this date and time customers can browse the menu (with a countdown) but can’t order. Orders switch on by themselves at the exact time — perfect for a launch.</p>
        <div className="grid-2">
          <label className="field"><span>Date</span><input type="date" className="input" value={openDate} onChange={(e) => setOpenDate(e.target.value)} /></label>
          <label className="field"><span>Time</span><input type="time" className="input" value={openTime} onChange={(e) => setOpenTime(e.target.value)} /></label>
        </div>
        {settings.orders_open_at && <div className={'notice small ' + (notYetOpen(settings) ? 'warn' : 'info')}>{notYetOpen(settings) ? `⏳ Orders open on ${opensLabel(settings)}.` : `✓ Orders opened on ${opensLabel(settings)}.`}</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={busy || !openDate || !openTime} onClick={() => save({ orders_open_at: `${openDate}T${openTime}` }, 'Opening time saved')}>Save opening time</button>
          {settings.orders_open_at && <button className="btn btn-white" disabled={busy} onClick={() => { setOpenDate(''); save({ orders_open_at: null }, 'Opening time removed — orders follow the switch below') }}>Remove opening time</button>}
        </div>
      </div>

      <ClosedDates />

      <div className={'shop-state ' + (closed ? 'closed' : 'open')}>
        <div className="big">{notYetOpen(settings) ? '⏳ Not open yet' : closed ? '🔴 Orders are CLOSED' : '🟢 Taking orders'}</div>
        <div className="small">{closed
          ? <>Customers can browse the menu but can’t place orders.{settings.orders_paused_until ? <> Opens again automatically on <b>{fmtDate(settings.orders_paused_until, { weekday: true })}</b>.</> : ' Stays closed until you open it.'}</>
          : 'Customers can place orders as usual.'}</div>
        {closed && !notYetOpen(settings) && <button className="btn btn-primary btn-lg" disabled={busy} onClick={open}>Open orders now</button>}
        {notYetOpen(settings) && <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => save({ orders_open_at: null, orders_paused: false }, 'Orders are OPEN now')}>Open orders right now</button>}
      </div>

      <div className="card stack" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>{closed ? 'Change the closed message' : 'Close all orders'}</div>
        <div className="chips">{REASONS.map(([i, t, m]) => <button key={t} type="button" className={'chip' + (msg === m ? ' on' : '')} onClick={() => setMsg(m)}>{i} {t}</button>)}</div>
        <Field label="Message customers will see"><textarea className="input" rows={2} maxLength={240} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
        <Field label="Open again automatically on" hint="optional — leave blank to open it yourself">
          <input type="date" className="input" min={addDaysISO(todayISO(), 1)} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Switch checked={popup} onChange={setPopup} label="Also show it as a pop-up when customers open the site" />
        <button className={'btn btn-block ' + (closed ? 'btn-white' : 'btn-danger')} disabled={busy || !msg.trim()} onClick={close}>{closed ? 'Save changes' : 'Close orders now'}</button>
        <p className="tiny muted" style={{ margin: 0 }}>This closes <b>all</b> dates. To close only some days, use “Close only certain dates” above.</p>
      </div>
    </>
  )
}
