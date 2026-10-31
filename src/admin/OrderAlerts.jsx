import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { inr, itemSummary } from '../lib/format.js'
import { fmtDate } from '../lib/dates.js'
import { Icon } from '../components/ui.jsx'

// Swiggy/Zomato-style new-order alert for the baker:
// checks for new orders every 15 s while the dashboard is open, rings until she taps it,
// vibrates the phone, shows a phone notification and flashes the tab title.
const POLL_MS = 15000
const PREF = 'pt-order-alerts'
const NEW_STATUSES = ['submitted', 'awaiting_payment', 'payment_verification']
const getPref = () => { try { return localStorage.getItem(PREF) } catch { return null } }
const setPref = (v) => { try { localStorage.setItem(PREF, v) } catch { /* ignore */ } }

// A bright two-tone "ding-dong" made in the browser (no sound file needed)
function makeRinger() {
  let ctx = null, timer = null
  // a loud, attention-grabbing ring: bright square + triangle tones through a compressor (as loud as the phone allows)
  let out = null
  const ding = () => {
    if (!ctx) return
    if (!out) { out = ctx.createDynamicsCompressor(); out.threshold.value = -10; out.ratio.value = 4; out.connect(ctx.destination) }
    const t = ctx.currentTime
    for (let r = 0; r < 2; r++) {
      ;[[1046, 0], [1318, 0.16], [1568, 0.32], [1318, 0.48]].forEach(([f, d]) => {
        ;['square', 'triangle'].forEach((type) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), at = t + r * 0.8 + d
          o.type = type; o.frequency.value = f
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(type === 'square' ? 0.35 : 0.9, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
          o.connect(g).connect(out); o.start(at); o.stop(at + 0.32)
        })
      })
    }
    navigator.vibrate?.([500, 150, 500, 150, 800])
  }
  return {
    unlock() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume() } catch { /* no audio */ } },
    ready: () => !!ctx && ctx.state === 'running',
    start() { if (timer) return; ding(); timer = setInterval(ding, 2000) },
    stop() { clearInterval(timer); timer = null; navigator.vibrate?.(0) },
    test() { ding() },
  }
}

async function phoneNotification(o) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const title = `🎂 New order ${o.order_number}`
  const body = `${o.customer_name} · ${inr(o.total)} · ${fmtDate(o.requested_date)}${o.slot_label ? ', ' + o.slot_label : ''}`
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return reg.showNotification(title, { body, tag: o.id, renotify: true, requireInteraction: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [300, 120, 300] })
    new Notification(title, { body, tag: o.id, requireInteraction: true })
  } catch { /* ignore */ }
}

export default function OrderAlerts() {
  const { db, reload } = useAdmin()
  const nav = useNavigate()
  const ringer = useRef(null)
  if (!ringer.current) ringer.current = makeRinger()
  const known = useRef(null)
  const [queue, setQueue] = useState([]) // orders waiting to be acknowledged
  const [on, setOn] = useState(() => getPref() === 'on')
  const [needTap, setNeedTap] = useState(false)

  // orders already in the dashboard when it opened are "known" — only brand-new ones ring
  useEffect(() => {
    if (!known.current) known.current = new Set(db.orders.map((o) => o.id))
  }, [db.orders])

  const check = useCallback(async () => {
    if (!known.current) return
    try {
      const rows = await api.list('orders', { order: 'created_at', asc: false, limit: 10 })
      const fresh = rows.filter((o) => !known.current.has(o.id))
      if (!fresh.length) return
      fresh.forEach((o) => known.current.add(o.id))
      const alerts = fresh.filter((o) => NEW_STATUSES.includes(o.status)).sort((a, b) => a.created_at.localeCompare(b.created_at))
      if (!alerts.length) return
      setQueue((q) => [...q, ...alerts])
      alerts.forEach(phoneNotification)
      reload()
    } catch { /* offline — try again next time */ }
  }, [reload])

  useEffect(() => {
    const t = setInterval(check, POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [check])

  // ring + flash the tab title while something is waiting
  useEffect(() => {
    if (!queue.length) { ringer.current.stop(); document.title = 'Pastel Treats · Admin'; return }
    if (on) { ringer.current.unlock(); ringer.current.ready() ? ringer.current.start() : setNeedTap(true) }
    let flip = false
    const t = setInterval(() => { flip = !flip; document.title = flip ? `🔔 ${queue.length} new order${queue.length > 1 ? 's' : ''}!` : 'Pastel Treats · Admin' }, 1000)
    return () => clearInterval(t)
  }, [queue.length, on])
  useEffect(() => () => ringer.current.stop(), [])

  // keep the screen awake while alerts are on, so the dashboard can keep ringing
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock = null
    const get = () => { if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => { lock = l }).catch(() => {}) }
    get(); document.addEventListener('visibilitychange', get)
    return () => { document.removeEventListener('visibilitychange', get); lock?.release().catch(() => {}) }
  }, [on])

  async function enable() {
    ringer.current.unlock()
    ringer.current.test()
    setOn(true); setPref('on'); setNeedTap(false)
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission() } catch { /* ignore */ } }
  }
  const disable = () => { setOn(false); setPref('off'); ringer.current.stop() }
  const done = (id) => setQueue((q) => q.filter((o) => o.id !== id))
  const o = queue[0]

  return (
    <>
      <div className={'alert-switch' + (on ? ' on' : '')}>
        {on ? (
          <>
            <span className="pulse-dot" aria-hidden="true" />
            <span className="grow small"><b>Order alerts on</b> — this page rings for every new order. For alerts with the app closed, set up <Link to="/admin/alerts">Phone alerts</Link>.</span>
            <button className="btn btn-white btn-sm" onClick={() => ringer.current.test()}>Test sound</button>
            <button className="link-btn small" onClick={disable}>Turn off</button>
          </>
        ) : (
          <>
            <Icon name="bell" size={20} />
            <span className="grow small"><b>Never miss an order.</b> Turn on the ring + phone notification for new orders.</span>
            <button className="btn btn-primary btn-sm" onClick={enable}>Turn on order alerts</button>
          </>
        )}
      </div>

      {o && (
        <div className="order-alert-back" role="alertdialog" aria-modal="true" aria-labelledby="oa-title">
          <div className="order-alert">
            <div className="oa-bell" aria-hidden="true">🔔</div>
            <div className="eyebrow" style={{ color: '#fff' }}>New order{queue.length > 1 ? ` · 1 of ${queue.length}` : ''}</div>
            <h2 id="oa-title">{o.order_number}</h2>
            <div className="oa-total">{inr(o.total)}</div>
            <div className="oa-card">
              <b>{o.customer_name}</b>
              <div className="small">{o.fulfilment === 'courier' ? '📦 Courier' : o.fulfilment === 'pickup' ? '🏠 Pickup' : '🚗 Delivery'} · {fmtDate(o.requested_date, { weekday: true })}{o.slot_label ? `, ${o.slot_label}` : ''}</div>
              <ul>{(o.items || []).slice(0, 4).map((i, k) => <li key={k}>{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}{itemSummary(i) ? <span className="muted"> — {itemSummary(i)}</span> : null}</li>)}</ul>
              {o.is_custom && <div className="badge t-butter">Custom design — needs your quote</div>}
            </div>
            {needTap && !ringer.current.ready() && <button className="btn btn-white btn-block" onClick={() => { ringer.current.unlock(); ringer.current.start(); setNeedTap(false) }}>🔊 Tap to hear the ring</button>}
            <button className="btn oa-accept btn-block" onClick={() => { done(o.id); nav(`/admin/orders?open=${o.id}`) }}>Open & respond</button>
            <button className="btn oa-later btn-block" onClick={() => done(o.id)}>Stop ringing — I'll check soon</button>
          </div>
        </div>
      )}
    </>
  )
}
