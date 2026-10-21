import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { todayISO, addDaysISO, fmtDate, dowISO, MONTHS_LONG } from '../lib/dates.js'
import { orderDate } from '../lib/analytics.js'
import { inr } from '../lib/format.js'
import { StatusBadge, Badge } from '../components/ui.jsx'
import { OrderDrawer } from './Orders.jsx'

const ACTIVE = (o) => !['cancelled', 'refunded', 'refund_pending', 'draft'].includes(o.status)

export default function CalendarAdmin() {
  const { db, settings: s } = useAdmin()
  const today = todayISO(s.timezone)
  const [view, setView] = useState('week')
  const [anchor, setAnchor] = useState(today)
  const [open, setOpen] = useState(null)
  const byDay = useMemo(() => {
    const m = {}
    for (const o of db.orders.filter(ACTIVE)) (m[orderDate(o)] ||= []).push(o)
    for (const k in m) m[k].sort((a, b) => (a.confirmed_slot_label || a.slot_label).localeCompare(b.confirmed_slot_label || b.slot_label))
    return m
  }, [db.orders])
  const slotCap = (d) => {
    const list = byDay[d] || []
    const warn = []
    if (s.max_orders_per_day && list.length > s.max_orders_per_day) warn.push(`${list.length}/${s.max_orders_per_day} orders`)
    for (const t of db.time_slots) { const n = list.filter((o) => o.slot_id === t.id).length; if (n > t.capacity) warn.push(`${t.label}: ${n}/${t.capacity}`) }
    if (s.max_deliveries_per_day && list.filter((o) => o.fulfilment === 'delivery').length > s.max_deliveries_per_day) warn.push('too many deliveries')
    return warn
  }
  const Ev = ({ o }) => (
    <div className={'ev' + (o.fulfilment === 'delivery' ? ' del' : '')} onClick={() => setOpen(o.id)}>
      <b>{(o.confirmed_slot_label || o.slot_label).split('–')[0]}</b> {o.fulfilment === 'delivery' ? '🚗' : '🏠'} {o.customer_name.replace('Demo · ', '')}
      <div>{o.items.map((i) => `${i.qty > 1 ? i.qty + '× ' : ''}${i.name}${i.weight ? ' ' + i.weight : ''}`).join(', ')}</div>
      <div className="row" style={{ gap: 4, marginTop: 2 }}><span className="tiny">{o.order_number}</span><StatusBadge s={o.status} /></div>
    </div>
  )
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30
  const weekStart = addDaysISO(anchor, -dowISO(anchor))
  const [y, mo] = anchor.split('-').map(Number)
  const first = `${y}-${String(mo).padStart(2, '0')}-01`
  const monthStart = addDaysISO(first, -dowISO(first))
  return (
    <>
      <PageHead title="Calendar" sub="Pickups 🏠 and deliveries 🚗 by day. Orange days are over capacity.">
        <div className="pill-tabs">{['day', 'week', 'month'].map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}</div>
        <button className="btn btn-white btn-sm" onClick={() => setAnchor(addDaysISO(anchor, -step))}>‹</button>
        <button className="btn btn-white btn-sm" onClick={() => setAnchor(today)}>Today</button>
        <button className="btn btn-white btn-sm" onClick={() => setAnchor(addDaysISO(anchor, step))}>›</button>
      </PageHead>
      {view === 'day' && (
        <div className="card">
          <div className="card-title">{fmtDate(anchor, { weekday: true, year: true })}</div>
          {slotCap(anchor).map((w) => <div key={w} className="notice warn small">Capacity warning: {w}</div>)}
          {db.time_slots.map((t) => {
            const list = (byDay[anchor] || []).filter((o) => o.slot_id === t.id || (o.confirmed_slot_label || o.slot_label) === t.label)
            return (
              <div key={t.id} style={{ marginTop: 12 }}>
                <div className="row between"><b className="small">{t.label}</b><Badge tone={list.length > t.capacity ? 'peach' : 'mint'}>{list.length}/{t.capacity}</Badge></div>
                {list.map((o) => <Ev key={o.id} o={o} />)}
              </div>
            )
          })}
          <hr className="soft" />
          <div className="small">Prep list: {Object.entries((byDay[anchor] || []).flatMap((o) => o.items).reduce((m, i) => { const k = `${i.name}${i.weight ? ' ' + i.weight : ''}${i.flavour ? ' · ' + i.flavour : ''}`; m[k] = (m[k] || 0) + i.qty; return m }, {})).map(([k, n]) => `${n}× ${k}`).join(' | ') || '—'}</div>
          <div className="small">Balance to collect: {inr((byDay[anchor] || []).reduce((a, o) => a + o.total - o.amount_paid, 0))}</div>
        </div>
      )}
      {view === 'week' && (
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)).map((d) => {
            const warn = slotCap(d)
            return (
              <div key={d} className={'col' + (d === today ? ' today' : '')} style={warn.length ? { background: 'var(--peach)' } : null}>
                <div className="row between"><b className="small">{fmtDate(d, { weekday: true })}</b><span className="tiny muted">{(byDay[d] || []).length}</span></div>
                {warn.map((w) => <div key={w} className="tiny" style={{ color: '#8a4a1f' }}>⚠ {w}</div>)}
                {(byDay[d] || []).map((o) => <Ev key={o.id} o={o} />)}
              </div>
            )
          })}
        </div>
      )}
      {view === 'month' && (
        <div className="card">
          <div className="card-title">{MONTHS_LONG[mo - 1]} {y}</div>
          <div className="month">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="tiny muted center">{d}</div>)}
            {Array.from({ length: 42 }, (_, i) => addDaysISO(monthStart, i)).map((d) => {
              const list = byDay[d] || []
              return (
                <div key={d} className={'d' + (d.slice(5, 7) !== first.slice(5, 7) ? ' o' : '') + (slotCap(d).length ? ' warn' : '')} onClick={() => { setAnchor(d); setView('day') }} style={d === today ? { outline: '2px solid var(--mint)' } : null}>
                  <div className="n">{+d.slice(8)}</div>
                  {list.slice(0, 3).map((o) => <div key={o.id} className="tiny" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.fulfilment === 'delivery' ? '🚗' : '🏠'} {o.items[0]?.name}</div>)}
                  {list.length > 3 && <div className="tiny muted">+{list.length - 3} more</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
