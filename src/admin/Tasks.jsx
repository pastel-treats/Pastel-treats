import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { todayISO, addDaysISO, fmtDate, diffDays } from '../lib/dates.js'
import { inr, cleanError } from '../lib/format.js'
import { upcomingOccasions, orderDate } from '../lib/analytics.js'
import { ORDER_TEMPLATES, occasionMessage } from '../lib/templates.js'
import { waLink } from '../lib/contact.js'
import { Icon, Badge, Empty, WaIcon } from '../components/ui.jsx'
import { OrderDrawer } from './Orders.jsx'

const OPEN = ['submitted', 'awaiting_payment', 'payment_verification', 'advance_received']

export function useTasks() {
  const { db, settings: s } = useAdmin()
  return useMemo(() => {
    const today = todayISO(s.timezone)
    const tomorrow = addDaysISO(today, 1)
    const done = new Set(db.notification_log.map((n) => n.template))
    const T = []
    const add = (t) => T.push({ ...t, done: done.has(t.key) })
    for (const o of db.orders) {
      const d = orderDate(o)
      if (o.status === 'submitted') add({ key: `review-${o.id}`, kind: 'review', pri: 1, order: o, title: `Review ${o.is_custom ? 'custom design' : o.needs_delivery_approval ? 'out-of-area delivery' : 'order'} ${o.order_number}`, sub: `${o.customer_name} · for ${fmtDate(d)}` })
      if (OPEN.includes(o.status) && d <= addDaysISO(today, 2) && d >= today) add({ key: `unconfirmed-${o.id}-${d}`, kind: 'urgent', pri: 0, order: o, title: `Unconfirmed order due ${d === today ? 'TODAY' : fmtDate(d)}`, sub: `${o.order_number} · ${o.customer_name} · ${o.status.replace(/_/g, ' ')}` })
      if (o.status === 'awaiting_payment' && diffDays(o.created_at.slice(0, 10), today) >= 1) add({ key: `chase-${o.id}-${today}`, kind: 'chase', pri: 2, order: o, template: 'pay_advance', title: `Remind about advance ${inr(o.advance_due - o.amount_paid)}`, sub: `${o.order_number} · ${o.customer_name}` })
      if (['confirmed', 'in_preparation', 'ready', 'out_for_delivery'].includes(o.status) && d === today) add({ key: `today-${o.id}`, kind: 'today', pri: 1, order: o, title: `${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} today · ${o.confirmed_slot_label || o.slot_label}`, sub: `${o.order_number} · ${o.customer_name} · balance ${inr(o.total - o.amount_paid)}` })
      if (o.status === 'confirmed' && d === tomorrow) add({ key: `prep-${o.id}`, kind: 'prep', pri: 2, order: o, template: 'preparing', title: `Prepare for tomorrow: ${o.items.map((i) => i.name).join(', ')}`, sub: `${o.order_number} · ${o.confirmed_slot_label || o.slot_label}` })
      if (o.status === 'completed' && diffDays(o.updated_at.slice(0, 10), today) <= 3) add({ key: `thanks-${o.id}`, kind: 'thanks', pri: 4, order: o, template: 'completed', title: `Say thank you & ask for feedback`, sub: `${o.order_number} · ${o.customer_name}` })
    }
    for (const p of db.payments.filter((x) => x.status === 'pending')) {
      const o = db.orders.find((x) => x.id === p.order_id)
      if (o) add({ key: `verify-${p.id}`, kind: 'verify', pri: 0, order: o, title: `Verify ${p.method.toUpperCase()} payment of ${inr(p.amount)}`, sub: `${o.order_number} · ${o.customer_name}${p.reference ? ' · ref ' + p.reference : ''}` })
    }
    // capacity conflicts
    const byDaySlot = {}
    for (const o of db.orders.filter((x) => !['cancelled', 'refunded', 'refund_pending', 'draft'].includes(x.status) && orderDate(x) >= today)) {
      const k = orderDate(o) + '|' + o.slot_id
      byDaySlot[k] = (byDaySlot[k] || 0) + 1
    }
    for (const [k, n] of Object.entries(byDaySlot)) {
      const [d, sid] = k.split('|')
      const slot = db.time_slots.find((x) => x.id === sid)
      if (slot && n > slot.capacity) add({ key: `cap-${k}-${n}`, kind: 'urgent', pri: 0, title: `Over capacity: ${n} orders in ${slot.label}`, sub: fmtDate(d, { weekday: true }) + ` (limit ${slot.capacity})` })
    }
    // special days
    const stages = (s.reminder_days || [30, 14, 7]).slice().sort((a, b) => b - a)
    for (const u of upcomingOccasions({ occasions: db.occasions, orders: db.orders, customers: db.customers }, Math.max(...stages, 7), today)) {
      const stage = stages.find((d) => u.inDays <= d && u.inDays > (stages[stages.indexOf(d) + 1] ?? -1))
      if (stage == null || !u.customer) continue
      const isSend = stage === stages[stages.length - 1]
      const consent = u.customer.marketing_consent
      add({
        key: `occ-${u.customer.id}-${u.occasion.kind}-${u.next}-${stage}`, kind: 'occasion', pri: 3, occ: u, consent,
        title: `${isSend ? 'Send reminder' : stage === stages[1] ? 'Prepare a personalised offer' : 'Review upcoming'}: ${u.customer.name}'s ${u.occasion.person_name ? u.occasion.person_name + ' · ' : ''}${u.occasion.kind}`,
        sub: `${fmtDate(u.next, { weekday: true })} · in ${u.inDays} days${consent ? '' : ' · no marketing consent'}`,
      })
    }
    return T.sort((a, b) => a.done - b.done || a.pri - b.pri)
  }, [db, s])
}

export default function Tasks() {
  const { db, reload, settings: s, toast } = useAdmin()
  const tasks = useTasks()
  const [show, setShow] = useState('open')
  const [open, setOpen] = useState(null)
  const list = tasks.filter((t) => (show === 'open' ? !t.done : t.done))
  async function markDone(t, message) {
    try {
      await api.insert('notification_log', { order_id: t.order?.id || null, customer_id: t.order?.customer_id || t.occ?.customer?.id || null, occasion_id: t.occ?.occasion?.id || null,
        channel: message ? 'whatsapp' : 'task', template: t.key, message: message || null, status: message ? 'sent_manually' : 'done' })
      reload()
    } catch (e) { toast(cleanError(e), true) }
  }
  function send(t) {
    const phone = t.order?.whatsapp || t.order?.phone || t.occ?.customer?.whatsapp || t.occ?.customer?.phone
    const text = t.occ ? occasionMessage(t.occ.customer, { ...t.occ.occasion, next: t.occ.next }, s) : ORDER_TEMPLATES[t.template].text(t.order, s)
    window.open(waLink(phone, text), '_blank')
    markDone(t, text)
  }
  const tone = { urgent: 'rose', verify: 'peach', review: 'butter', today: 'mint', prep: 'sky', chase: 'peach', occasion: 'lime', thanks: 'grey' }
  return (
    <>
      <PageHead title="Tasks & reminders" sub="Everything that needs you, in order of urgency. Messages open in WhatsApp — nothing is sent automatically.">
        <div className="pill-tabs"><button className={show === 'open' ? 'on' : ''} onClick={() => setShow('open')}>To do ({tasks.filter((t) => !t.done).length})</button><button className={show === 'done' ? 'on' : ''} onClick={() => setShow('done')}>Done</button></div>
      </PageHead>
      {!list.length ? <Empty title={show === 'open' ? 'All caught up!' : 'Nothing done yet'}>Enjoy a cup of tea ☕</Empty> : (
        <div className="card">
          {list.map((t) => (
            <div className="list-row" key={t.key} style={{ alignItems: 'flex-start', opacity: t.done ? 0.6 : 1 }}>
              <Badge tone={tone[t.kind]}>{t.kind}</Badge>
              <div className="grow"><b className="small">{t.title}</b><div className="tiny muted">{t.sub}</div></div>
              <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {t.order && <button className="btn btn-soft btn-sm" onClick={() => setOpen(t.order.id)}>Open</button>}
                {!t.done && (t.template || (t.occ && t.consent)) && <button className="btn btn-sm" style={{ background: '#25d366', color: '#fff' }} onClick={() => send(t)}><WaIcon size={16} /> Send</button>}
                {!t.done && <button className="btn btn-white btn-sm" onClick={() => markDone(t)} title="Mark done"><Icon name="check" size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && <OrderDrawer id={open} onClose={() => setOpen(null)} />}
      <p className="tiny muted" style={{ marginTop: 12 }}>Reminder timings ({(s.reminder_days || [30, 14, 7]).join(' / ')} days before) can be changed in Business settings. Reminders are only offered for customers who agreed to messages.</p>
      <span hidden>{db.orders.length}</span>
    </>
  )
}
