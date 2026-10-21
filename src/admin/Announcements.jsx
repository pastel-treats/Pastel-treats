import React, { useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { fmtDate, addDaysISO, todayISO } from '../lib/dates.js'
import { KINDS, activeAnnouncements } from '../lib/announcements.js'
import { Field, Switch, Badge, Icon, Empty } from '../components/ui.jsx'

const blank = () => ({ id: Math.random().toString(36).slice(2, 10), kind: 'info', title: '', message: '', from: '', to: '', active: true, block: false })

export default function Announcements() {
  const { settings, reload, toast } = useAdmin()
  const [form, setForm] = useState(blank())
  const [busy, setBusy] = useState(false)
  const [pauseMsg, setPauseMsg] = useState(settings.orders_paused_message || 'We are on a short break and not taking new orders. Back soon!')
  const list = settings.announcements || []
  const live = new Set(activeAnnouncements(settings).map((a) => a.id))
  const save = async (patch, msg) => {
    setBusy(true)
    try { await api.saveSettings({ ...settings, ...patch }); await reload(); msg && toast(msg) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  async function publish() {
    if (!form.title.trim()) return toast('Add a short headline', true)
    if (form.from && form.to && form.to < form.from) return toast('“Until” must be after “From”', true)
    const { block, ...a } = form
    const exists = list.some((x) => x.id === a.id)
    await save({ announcements: exists ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list] }, exists ? 'Announcement updated' : 'Announcement posted')
    if (block && form.from) {
      try {
        const end = form.to || form.from
        let n = 0
        for (let d = form.from; d <= end && n < 62; d = addDaysISO(d, 1), n++) await api.insert('blackout_dates', { day: d, reason: form.title.trim() })
        await reload()
        toast(`Orders blocked for ${n} day${n > 1 ? 's' : ''}`)
      } catch (e) { toast(cleanError(e), true) }
    }
    setForm(blank())
  }
  return (
    <>
      <PageHead title="Announcement board" sub="Tell customers what’s happening — leave, holidays, festive specials. Shown on the home page and the top bar." />

      <div className="card stack" style={{ background: settings.orders_paused ? 'var(--pink)' : undefined }}>
        <div className="row between wrap">
          <div><b>Pause all new orders</b><div className="tiny muted">Use when you’re fully booked or away. Checkout is switched off until you turn this back on.</div></div>
          <Switch checked={settings.orders_paused} onChange={(v) => save({ orders_paused: v, orders_paused_message: pauseMsg }, v ? 'New orders paused' : 'Orders are open again')} label={settings.orders_paused ? 'Paused' : 'Taking orders'} />
        </div>
        <Field label="Message customers will see"><input className="input" value={pauseMsg} onChange={(e) => setPauseMsg(e.target.value)} onBlur={() => settings.orders_paused && pauseMsg !== settings.orders_paused_message && save({ orders_paused_message: pauseMsg }, 'Message updated')} /></Field>
      </div>

      <div className="card stack" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>{list.some((x) => x.id === form.id) ? 'Edit announcement' : 'New announcement'}</div>
        <div className="chips">{Object.entries(KINDS).map(([k, v]) => <button key={k} type="button" className={'chip' + (form.kind === k ? ' on' : '')} onClick={() => setForm({ ...form, kind: k })}>{v.icon} {v.label}</button>)}</div>
        <Field label="Headline"><input className="input" maxLength={90} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.kind === 'leave' ? 'On leave from 20–23 Oct' : form.kind === 'closed' ? 'Diwali orders closed' : 'Diwali hampers now open!'} /></Field>
        <Field label="Details" hint="optional"><textarea className="input" maxLength={400} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Orders placed now will be ready from 24 Oct." /></Field>
        <div className="grid-2">
          <Field label="Show from" hint="blank = now"><input type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
          <Field label="Show until" hint="blank = until removed"><input type="date" className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
        </div>
        {['leave', 'closed'].includes(form.kind) && form.from && (
          <label className="check"><input type="checkbox" checked={form.block} onChange={(e) => setForm({ ...form, block: e.target.checked })} /> Also stop pickups on these dates (blocks them in the order calendar)</label>
        )}
        <div className="row"><button className="btn btn-primary" disabled={busy} onClick={publish}>{list.some((x) => x.id === form.id) ? 'Save changes' : 'Post announcement'}</button>
          {list.some((x) => x.id === form.id) && <button className="btn btn-ghost" onClick={() => setForm(blank())}>Cancel</button>}</div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">All announcements</div>
        {!list.length && <Empty title="Nothing posted yet">Your first announcement will show at the top of the shop.</Empty>}
        {list.map((a) => (
          <div className="list-row" key={a.id} style={{ alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.3rem' }}>{KINDS[a.kind]?.icon}</span>
            <div className="grow small">
              <b>{a.title}</b> {live.has(a.id) ? <Badge tone="mint">showing now</Badge> : a.active === false ? <Badge tone="grey">hidden</Badge> : a.from > todayISO() ? <Badge tone="sky">scheduled</Badge> : <Badge tone="grey">ended</Badge>}
              {a.message && <div className="tiny muted">{a.message}</div>}
              <div className="tiny muted">{a.from ? fmtDate(a.from) : 'From now'} → {a.to ? fmtDate(a.to) : 'until removed'}</div>
            </div>
            <Switch checked={a.active !== false} onChange={(v) => save({ announcements: list.map((x) => (x.id === a.id ? { ...x, active: v } : x)) })} />
            <button className="btn btn-white btn-sm" onClick={() => { setForm({ ...a, block: false }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
            <button className="btn btn-white btn-sm" onClick={() => save({ announcements: list.filter((x) => x.id !== a.id) }, 'Removed')} aria-label="Delete"><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
    </>
  )
}
