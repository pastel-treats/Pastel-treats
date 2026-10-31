import React, { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { MONTHS_LONG, todayISO, addDaysISO, wallAt, fmtWall, fmtDate } from '../lib/dates.js'
import { Icon, Spinner } from './ui.jsx'
import { leadLabel } from '../lib/format.js'

const pad = (n) => String(n).padStart(2, '0')
const monthStart = (iso) => iso.slice(0, 8) + '01'
const monthEnd = (iso) => { const [y, m] = iso.split('-').map(Number); return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` }
const shiftMonth = (iso, n) => { const [y, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01` }

// days the baker closed (or that filled up) are shown and explained, instead of just greyed out
const fullDay = (info) => !!info?.reason && info.reason !== 'Closed'
const closedText = (r) => (/^(fully booked|sold out|deliveries full)/i.test(r || '') ? 'Overwhelmed with orders for the day' : r)

// Month calendar that asks the server which dates/slots are bookable
export default function Calendar({ productIds, mode, date, slotId, onChange, tz, maxMonthsAhead = 4, onMeta, dateOnly = false }) {
  const today = todayISO(tz)
  const [month, setMonth] = useState(monthStart(date || today))
  const [av, setAv] = useState(null)
  const [err, setErr] = useState(null)
  const [why, setWhy] = useState(null) // message for a tapped closed date
  const key = productIds.join(',') + mode + month
  useEffect(() => { setWhy(null) }, [key])

  useEffect(() => {
    let live = true
    setAv(null)
    const from = month < today ? today : month
    api.availability(from, monthEnd(month), productIds, mode)
      .then((r) => {
        if (!live) return
        setAv(r); setErr(null); onMeta && onMeta(r)
        // jump to the first month with availability if the current one is empty
        if (!date && !r.days.some((d) => d.available) && month < shiftMonth(today, 2)) setMonth(shiftMonth(month, 1))
      })
      .catch((e) => live && setErr(e.message))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const [y, m] = month.split('-').map(Number)
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = av ? Object.fromEntries(av.days.map((d) => [d.date, d])) : {}
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = month; d <= monthEnd(month); d = addDaysISO(d, 1)) cells.push(d)
  const selDay = date && days[date]
  const canPrev = month > monthStart(today)
  const canNext = month < shiftMonth(today, maxMonthsAhead)

  return (
    <div className="cal">
      {av && <div className="notice info small" style={{ marginBottom: 12 }}><Icon name="clock" size={18} /><div>Please place your order <b>{leadLabel(av.lead_hours)}</b>. Earliest available: <b>{(() => { const d = av.days.find((x) => x.available); const sl = d?.slots.find((x) => x.eligible); return d ? (dateOnly ? fmtDate(d.date, { weekday: true }) : `${fmtDate(d.date, { weekday: true })}, ${sl.label}`) : fmtWall(av.earliest) })()}</b>.</div></div>}
      <div className="cal-head">
        <button className="cal-nav" disabled={!canPrev} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><Icon name="left" size={18} /></button>
        <div className="m">{MONTHS_LONG[m - 1]} {y}</div>
        <button className="cal-nav" disabled={!canNext} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><Icon name="right" size={18} /></button>
      </div>
      {err && <div className="err-text">{err}</div>}
      {!av && !err ? <Spinner /> : (
        <div className="cal-grid" role="grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div className="cal-dow" key={i}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={'e' + i} />
            const info = days[d]
            const ok = info?.available
            const full = !ok && fullDay(info)
            return (
              <button key={d} type="button" className={'cal-day' + (ok ? ' ok' : full ? ' full' : ' off') + (d === date ? ' sel' : '') + (d === today ? ' today' : '')}
                disabled={!ok && !full} title={info?.reason || (ok ? 'Available' : d < today ? 'Past' : 'Not enough notice')}
                onClick={() => { if (!ok) return setWhy({ date: d, text: closedText(info.reason) }); setWhy(null); onChange({ date: d, slotId: null, slotLabel: null }) }}
                aria-label={`${d}${ok ? '' : full ? ' closed: ' + info.reason : ' unavailable'}`}>
                {+d.slice(8)}
              </button>
            )
          })}
        </div>
      )}
      {av && av.days.some((x) => !x.available && fullDay(x)) && <div className="cal-legend tiny"><span className="cal-key full" /> Closed for orders — tap to see why</div>}
      {why && (
        <div className="notice warn small fade-in" role="status" style={{ marginTop: 12 }}>
          <b>{fmtDate(why.date, { weekday: true })} — {why.text}</b>
          <div>Please choose a different date, or kindly come back later. 💚</div>
        </div>
      )}
      {selDay && dateOnly && <p className="small" style={{ marginTop: 12 }}>📦 We’ll dispatch your courier on <b>{fmtDate(date, { weekday: true })}</b>. No time slot needed.</p>}
      {selDay && !dateOnly && (
        <div style={{ marginTop: 14 }} className="fade-in">
          <div className="small" style={{ fontWeight: 500, marginBottom: 8 }}>Choose a time slot</div>
          <div className="slots">
            {selDay.slots.map((s) => (
              <button key={s.id} type="button" className={'slot' + (slotId === s.id ? ' on' : '')} disabled={!s.eligible} onClick={() => onChange({ date, slotId: s.id, slotLabel: s.label })}>
                <div className="l">{s.label}</div>
                <div className="r">{s.eligible ? (s.remaining <= 1 ? 'Last spot!' : 'Available') : s.why}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
export { wallAt }
