import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { inr, itemSummary, cleanError } from '../lib/format.js'
import { todayISO, addDaysISO, fmtDate, MONTHS_LONG, dowISO } from '../lib/dates.js'
import { upcomingOccasions, customerStats } from '../lib/analytics.js'
import { occasionMessage } from '../lib/templates.js'
import { waLink } from '../lib/contact.js'
import { Badge, Empty, Icon, Modal, Field, WaIcon } from '../components/ui.jsx'
import { OccasionForm } from './Customers.jsx'

const WINDOWS = [['7', 'Next 7 days'], ['30', 'Next 30 days'], ['60', 'Next 60 days'], ['next_month', 'Next month'], ['month_after', 'Month after'], ['calendar', 'Calendar']]

export default function SpecialDates() {
  const { db, settings: s, reload, toast } = useAdmin()
  const today = todayISO(s.timezone)
  const [win, setWin] = useState('30')
  const [offer, setOffer] = useState(null)
  const [addFor, setAddFor] = useState(null)
  const all = useMemo(() => upcomingOccasions({ occasions: db.occasions, orders: db.orders, customers: db.customers }, 400, today), [db, today])
  const stats = useMemo(() => customerStats(db.customers, db.orders), [db])
  const monthKey = (n) => { const [y, m] = today.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }
  const list = all.filter((u) => {
    if (win === 'next_month') return u.next.startsWith(monthKey(1))
    if (win === 'month_after') return u.next.startsWith(monthKey(2))
    if (win === 'calendar') return u.next.startsWith(monthKey(0)) || u.next.startsWith(monthKey(1))
    return u.inDays <= +win
  })
  const sentKeys = new Set(db.notification_log.map((n) => n.template))
  const keyOf = (u) => `occ-msg-${u.customer?.id}-${u.occasion.kind}-${u.next}`
  async function send(u, text) {
    window.open(waLink(u.customer.whatsapp || u.customer.phone, text), '_blank')
    try { await api.insert('notification_log', { customer_id: u.customer.id, occasion_id: u.occasion.id || null, channel: 'whatsapp', template: keyOf(u), message: text, status: 'sent_manually' }); reload() } catch (e) { toast(cleanError(e), true) }
    setOffer(null)
  }
  const Row = ({ u }) => {
    const st = stats.get(u.customer?.id)
    const last = u.occasion.last_order || db.orders.find((o) => o.id === u.occasion.last_order_id) || st?.orders.filter((o) => o.occasion === u.occasion.kind).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return (
      <div className="list-row" style={{ alignItems: 'flex-start' }}>
        <Badge tone={u.inDays <= 7 ? 'peach' : 'lime'}>{u.inDays === 0 ? 'Today' : `${u.inDays} d`}</Badge>
        <div className="grow small">
          <b>{u.customer?.name}</b> · {u.occasion.person_name ? `${u.occasion.person_name}’s ` : ''}{u.occasion.kind} · {fmtDate(u.next, { weekday: true })}
          {u.source === 'last_year_order' && <> <Badge tone="sky">ordered last year</Badge></>}
          <div className="tiny muted">
            {last ? `Last time: ${last.items.map((i) => `${i.name} (${itemSummary(i)})`).join('; ')} · ${inr(last.total)}` : 'No previous order for this occasion'}
            {st && ` · usually ${[st.favFlavour, st.favSize].filter(Boolean).join(', ') || '—'} · avg ${inr(st.aov)}`}
            {u.occasion.budget ? ` · budget ~${inr(u.occasion.budget)}` : ''}
          </div>
          {sentKeys.has(keyOf(u)) && <div className="tiny" style={{ color: 'var(--forest)' }}>✓ Reminder sent</div>}
        </div>
        {u.customer?.marketing_consent ? (
          <button className="btn btn-sm" style={{ background: '#25d366', color: '#fff' }} onClick={() => setOffer({ u, text: occasionMessage(u.customer, { ...u.occasion, next: u.next, preferred_flavour: u.occasion.preferred_flavour || st?.favFlavour }, s) })}><WaIcon size={16} /> Offer</button>
        ) : <span className="tiny muted" title="Customer has not agreed to marketing messages">no consent</span>}
        {u.source === 'last_year_order' && u.customer && <button className="btn btn-white btn-sm" onClick={() => setAddFor(u)} title="Save this date"><Icon name="plus" size={14} /></button>}
      </div>
    )
  }
  // calendar of this + next month
  const [y, m] = today.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const start = addDaysISO(first, -dowISO(first))
  return (
    <>
      <PageHead title="Special dates & reminders" sub="Birthdays, anniversaries and last year’s celebration orders — so you can prepare and reach out in time." />
      <div className="pill-tabs" style={{ marginBottom: 12 }}>{WINDOWS.map(([k, l]) => <button key={k} className={win === k ? 'on' : ''} onClick={() => setWin(k)}>{l}</button>)}</div>
      <div className="notice info small" style={{ marginBottom: 12 }}><Icon name="sparkle" size={18} /><div>Suggested rhythm: <b>{(s.reminder_days || [30, 14, 7])[0]} days</b> before — review; <b>{(s.reminder_days || [30, 14, 7])[1]} days</b> — prepare a personalised offer; <b>{(s.reminder_days || [30, 14, 7])[2]} days</b> — send the reminder (only to customers who agreed). These appear in Tasks automatically.</div></div>
      {win === 'calendar' ? (
        <div className="card">
          {[0, 1].map((n) => {
            const mk = monthKey(n)
            const f1 = mk + '-01'
            const s0 = addDaysISO(f1, -dowISO(f1))
            return (
              <div key={mk} style={{ marginBottom: 18 }}>
                <div className="card-title">{MONTHS_LONG[+mk.slice(5) - 1]} {mk.slice(0, 4)}</div>
                <div className="month">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="tiny muted center">{d}</div>)}
                  {Array.from({ length: 42 }, (_, i) => addDaysISO(s0, i)).filter((d, i) => i < 35 || d.startsWith(mk)).map((d) => {
                    const items = all.filter((u) => u.next === d)
                    return <div key={d} className={'d' + (d.startsWith(mk) ? '' : ' o')} style={d === today ? { outline: '2px solid var(--mint)' } : null}><div className="n">{+d.slice(8)}</div>
                      {items.map((u, k) => <div key={k} className="tiny" title={`${u.customer?.name} · ${u.occasion.kind}`}>🎂 {u.customer?.name?.replace('Demo · ', '').split(' ')[0]}</div>)}</div>
                  })}
                </div>
              </div>
            )
          })}
          <span hidden>{start}</span>
        </div>
      ) : !list.length ? <Empty title="No special days in this window">Add dates from a customer’s profile, or ask customers to save them in their account.</Empty> : (
        <div className="card">{list.map((u, i) => <Row key={i} u={u} />)}</div>
      )}
      {offer && (
        <Modal title="Personalised reminder" onClose={() => setOffer(null)}>
          <Field label="Message (edit freely — add an offer if you like)"><textarea className="input" style={{ minHeight: 180 }} value={offer.text} onChange={(e) => setOffer({ ...offer, text: e.target.value })} /></Field>
          <button className="btn btn-block" style={{ background: '#25d366', color: '#fff', marginTop: 12 }} onClick={() => send(offer.u, offer.text)}><WaIcon size={18} /> Open in WhatsApp</button>
        </Modal>
      )}
      {addFor && (
        <Modal title={`Save date for ${addFor.customer.name}`} onClose={() => setAddFor(null)}>
          <OccasionForm customerId={addFor.customer.id} initial={{ kind: addFor.occasion.kind, person_name: '', occasion_date: addFor.occasion.occasion_date, repeats: true, preferred_flavour: addFor.occasion.last_order?.items[0]?.flavour || '', preferred_design: addFor.occasion.last_order?.items[0]?.design || '', budget: addFor.occasion.last_order?.total || '', notes: '' }} onDone={() => setAddFor(null)} />
        </Modal>
      )}
    </>
  )
}
