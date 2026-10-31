import React, { useState } from 'react'
import { useAdmin } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { fmtDate, addDaysISO, todayISO } from '../lib/dates.js'
import { orderDay, ACTIVE } from '../lib/schedule.js'
import { Field, Icon } from '../components/ui.jsx'

export const OVERWHELMED = 'Overwhelmed with orders for the day'
const REASONS = [
  ['🧁', 'Too many orders', OVERWHELMED],
  ['🌴', 'On leave', 'Baker on leave'],
  ['🪔', 'Festival holiday', 'Closed for the festival'],
  ['🛠️', 'Kitchen break', 'Kitchen closed for the day'],
]

// Close only some dates (e.g. overwhelmed with orders) — the rest of the calendar stays open.
export default function ClosedDates() {
  const { db, reload, toast } = useAdmin()
  const today = todayISO()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState(OVERWHELMED)
  const [busy, setBusy] = useState(false)
  const upcoming = (db.blackout_dates || []).filter((b) => b.day >= today).sort((a, b) => a.day.localeCompare(b.day))
  const booked = (d) => db.orders.filter((o) => ACTIVE(o.status) && orderDay(o) === d).length

  async function closeDates() {
    const end = to && to > from ? to : from
    const have = new Set(upcoming.map((b) => b.day))
    const days = []
    for (let d = from; d <= end && days.length < 62; d = addDaysISO(d, 1)) if (!have.has(d)) days.push(d)
    if (!days.length) return toast('Those dates are already closed', true)
    setBusy(true)
    try {
      for (const d of days) await api.insert('blackout_dates', { day: d, reason: reason.trim() || OVERWHELMED })
      await reload(); setFrom(''); setTo('')
      toast(days.length === 1 ? `${fmtDate(days[0], { weekday: true })} is closed for new orders` : `${days.length} dates closed for new orders`)
    } catch (e) { toast(cleanError(e), true); reload() } finally { setBusy(false) }
  }
  const reopen = async (d) => {
    setBusy(true)
    try { await api.remove('blackout_dates', d); await reload(); toast(`${fmtDate(d, { weekday: true })} is open again`) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }

  return (
    <div className="card stack" style={{ marginBottom: 14 }}>
      <div className="card-title" style={{ margin: 0 }}>📅 Close only certain dates</div>
      <p className="small muted" style={{ margin: 0 }}>Too many orders for a day? Close just that date — customers can still order for other days. When they tap a closed date they see: <i>“Overwhelmed with orders for the day — please choose a different date, or kindly come back later.”</i></p>
      <div className="grid-2">
        <Field label="Date"><input type="date" className="input" min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to && to < e.target.value) setTo('') }} /></Field>
        <Field label="Till" hint="optional — for several days in a row"><input type="date" className="input" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="chips">{REASONS.map(([i, t, r]) => <button key={t} type="button" className={'chip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{i} {t}</button>)}</div>
      <Field label="Reason customers will see"><input className="input" maxLength={80} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {from && booked(from) > 0 && <div className="notice info small">You already have {booked(from)} order{booked(from) > 1 ? 's' : ''} on {fmtDate(from, { weekday: true })} — they stay as they are. Only new orders are stopped.</div>}
      <button className="btn btn-danger" disabled={busy || !from} onClick={closeDates}>{busy ? 'Saving…' : to && to > from ? 'Close these dates' : 'Close this date'}</button>

      <div className="stack" style={{ gap: 6 }}>
        <b className="small">Closed dates {upcoming.length ? `(${upcoming.length})` : ''}</b>
        {!upcoming.length ? <span className="tiny muted">None — every date is open for orders.</span>
          : upcoming.map((b) => (
            <div className="list-row small" key={b.day}>
              <span className="grow"><b>{fmtDate(b.day, { weekday: true })}</b> · {b.reason || 'Closed'}{booked(b.day) ? <span className="muted"> · {booked(b.day)} order{booked(b.day) > 1 ? 's' : ''} booked</span> : null}</span>
              <button className="btn btn-white btn-sm" disabled={busy} onClick={() => reopen(b.day)}><Icon name="check" size={14} /> Open again</button>
            </div>
          ))}
      </div>
    </div>
  )
}
