import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom'
import { api, isDemo } from '../api/index.js'
import { DEMO_ADMIN_PASSWORD } from '../api/demo.js'
import { useStore } from '../store.jsx'
import { cleanError } from '../lib/format.js'
import { Icon, Spinner, Field } from '../components/ui.jsx'
import Overview from './Overview.jsx'
import Orders from './Orders.jsx'
import CalendarAdmin from './CalendarAdmin.jsx'
import MenuAdmin from './MenuAdmin.jsx'
import Payments from './Payments.jsx'
import Customers from './Customers.jsx'
import SpecialDates from './SpecialDates.jsx'
import Analytics, { Segments } from './Analytics.jsx'
import Tasks, { useTasks } from './Tasks.jsx'
import Settings from './Settings.jsx'
import Team, { DataExport } from './Team.jsx'
import Announcements from './Announcements.jsx'

const ACtx = createContext(null)
export const useAdmin = () => useContext(ACtx)
const TABLES = ['orders', 'customers', 'customer_addresses', 'occasions', 'payments', 'order_status_history', 'notification_log', 'products', 'categories', 'addons', 'time_slots', 'delivery_zones', 'blackout_dates']

function AdminData({ children, me }) {
  const store = useStore()
  const [db, setDb] = useState(null)
  const [err, setErr] = useState(null)
  const reload = useCallback(async () => {
    try {
      const rows = await Promise.all(TABLES.map((t) => api.list(t, { order: ['products', 'categories', 'addons', 'time_slots', 'delivery_zones'].includes(t) ? 'sort' : t === 'blackout_dates' ? 'day' : 'created_at', asc: t !== 'orders' })))
      const next = Object.fromEntries(TABLES.map((t, i) => [t, rows[i]]))
      setDb(next)
      setErr(null)
      store.reload() // keep the storefront menu in sync
    } catch (e) { setErr(cleanError(e)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { reload() }, [reload])
  const value = useMemo(() => db && { db, reload, me, settings: store.settings, toast: store.toast }, [db, reload, me, store.settings, store.toast])
  if (err) return <div className="admin-main"><div className="notice rose">Could not load data: {err}</div><button className="btn btn-soft" onClick={reload}>Retry</button></div>
  if (!value) return <Spinner />
  return <ACtx.Provider value={value}>{children}</ACtx.Provider>
}

function Login({ onDone }) {
  const { toast } = useStore()
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault(); setBusy(true)
    try {
      if (mode === 'in') await api.signIn(email, pw)
      else { await api.signUp(email, pw); toast('Account created. If e-mail confirmation is on, confirm it, then sign in.') }
      onDone()
    } catch (err) { toast(cleanError(err), true) } finally { setBusy(false) }
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--mint)', padding: 16 }}>
      <form className="card stack login-card" onSubmit={go}>
        <img src="logo-mint.svg" alt="Pastel Treats" style={{ borderRadius: 14 }} />
        <h2 className="center">Baker’s dashboard</h2>
        {isDemo && <div className="notice warn small">Demo mode: use any e-mail and the password <b>{DEMO_ADMIN_PASSWORD}</b>.</div>}
        <Field label="E-mail"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
        <Field label="Password"><input className="input" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        {!isDemo && <button type="button" className="link-btn small" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'First time? Create the owner account' : 'Have an account? Sign in'}</button>}
        <Link to="/" className="small center">← Back to the shop</Link>
      </form>
    </div>
  )
}

function NotAdmin({ me, onDone }) {
  const { toast } = useStore()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--mint)', padding: 16 }}>
      <div className="card stack login-card">
        <h2>Almost there</h2>
        <p className="small">You’re signed in as <b>{me.user.email}</b> but this account isn’t a bakery admin yet.</p>
        <p className="small muted">If this is the very first setup, claim the owner role (works only once). Otherwise ask the owner to add you under Team, quoting this ID:</p>
        <div className="copy">{me.user.id}</div>
        <button className="btn btn-primary" onClick={async () => { try { const ok = await api.claimFirstAdmin(); if (ok) { toast('You are now the owner'); onDone() } else toast('An owner already exists — ask them to add you', true) } catch (e) { toast(cleanError(e), true) } }}>Claim owner role</button>
        <button className="btn btn-ghost" onClick={async () => { await api.adminSignOut(); onDone() }}>Sign out</button>
      </div>
    </div>
  )
}

const NAV = [
  ['Today', [['', 'Overview', 'home'], ['tasks', 'Tasks & reminders', 'bell'], ['announcements', 'Announcement board', 'megaphone'], ['orders', 'Orders', 'receipt'], ['calendar', 'Calendar', 'calendar'], ['approvals', 'Custom approvals', 'sparkle']]],
  ['Money', [['payments', 'Payments', 'wallet'], ['analytics', 'Sales analytics', 'chart']]],
  ['People', [['customers', 'Customers', 'users'], ['dates', 'Special dates', 'gift'], ['segments', 'Segments', 'heart']]],
  ['Shop', [['menu', 'Menu & pricing', 'cake'], ['settings', 'Business settings', 'settings'], ['team', 'Team', 'user'], ['data', 'Data & reports', 'download']]],
]

function Shell() {
  const { db, me, reload } = useAdmin()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  const tasks = useTasks()
  const counts = {
    orders: db.orders.filter((o) => ['submitted', 'payment_verification'].includes(o.status)).length,
    approvals: db.orders.filter((o) => (o.quote_status === 'pending' || o.needs_delivery_approval) && !['cancelled', 'refunded', 'completed'].includes(o.status)).length,
    payments: db.payments.filter((p) => p.status === 'pending').length,
    tasks: tasks.filter((t) => !t.done).length,
  }
  return (
    <div className="admin">
      <header className="admin-top">
        <div className="in">
          <button className="x menu-toggle" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon name="menu" size={20} /></button>
          <span className="t">Pastel Treats <span className="hide-sm">· Admin</span></span>
          {isDemo && <span className="badge t-butter">Demo</span>}
          <span className="grow" />
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={reload} title="Refresh">↻</button>
          <Link to="/" className="btn btn-sm hide-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>View shop</Link>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={async () => { await api.adminSignOut(); location.reload() }} title="Sign out"><Icon name="logout" size={18} /></button>
        </div>
      </header>
      <div className="admin-body">
        <nav className={'side' + (open ? ' open' : '')}>
          <div className="tiny muted" style={{ padding: '4px 12px' }}>{me.user.email}</div>
          {NAV.map(([g, items]) => (
            <div key={g}>
              <div className="grp">{g}</div>
              {items.map(([to, label, ico]) => (
                <NavLink key={to} to={`/admin/${to}`} end={to === ''}><Icon name={ico} size={19} />{label}{counts[to] > 0 && <span className="c">{counts[to]}</span>}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <main className="admin-main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="orders" element={<Orders />} />
            <Route path="approvals" element={<Orders preset="approvals" />} />
            <Route path="calendar" element={<CalendarAdmin />} />
            <Route path="payments" element={<Payments />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="customers" element={<Customers />} />
            <Route path="dates" element={<SpecialDates />} />
            <Route path="segments" element={<Segments />} />
            <Route path="menu" element={<MenuAdmin />} />
            <Route path="settings" element={<Settings />} />
            <Route path="team" element={<Team />} />
            <Route path="data" element={<DataExport />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function AdminApp() {
  const [me, setMe] = useState(undefined)
  const check = useCallback(async () => { try { setMe(await api.adminState()) } catch { setMe({ user: null }) } }, [])
  useEffect(() => { check() }, [check])
  useEffect(() => { document.title = 'Pastel Treats · Admin'; return () => { document.title = 'Pastel Treats' } }, [])
  if (me === undefined) return <Spinner />
  if (!me.user) return <Login onDone={check} />
  if (!me.isAdmin) return <NotAdmin me={me} onDone={check} />
  return <AdminData me={me}><Shell /></AdminData>
}

// ---- small shared admin widgets ----
export function PageHead({ title, sub, children }) {
  return (
    <div className="row between wrap" style={{ marginBottom: 14, alignItems: 'flex-end' }}>
      <div><h1>{title}</h1>{sub && <div className="muted small">{sub}</div>}</div>
      <div className="row wrap">{children}</div>
    </div>
  )
}
export function Bars({ data, fmt = (v) => v, height = 160 }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bar-chart" style={{ height }} role="img" aria-label="Bar chart">
      {data.map((d, i) => (
        <div className="b" key={d.key} title={`${d.label || d.key}: ${fmt(d.value)}`}>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.value ? fmt(d.value) : ''}</span>
          <i className={i === data.length - 1 ? 'cur' : ''} style={{ height: `${(d.value / max) * 100}%` }} />
          <span>{d.label || d.key}</span>
        </div>
      ))}
    </div>
  )
}
export function HBars({ rows, fmt = (v) => v, limit = 8 }) {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  if (!rows.length) return <p className="small muted">No data yet.</p>
  return rows.slice(0, limit).map(([k, v]) => (
    <div className="hbar" key={k}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span><div className="track"><i style={{ width: `${(v / max) * 100}%` }} /></div><b>{fmt(v)}</b></div>
  ))
}
