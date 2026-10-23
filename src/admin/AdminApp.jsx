import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom'
import { api, isDemo } from '../api/index.js'
import { DEMO_ADMIN_PASSWORD } from '../api/demo.js'
import { useStore } from '../store.jsx'
import { cleanError } from '../lib/format.js'
import { isAdminEmail, savedAdminEmail, rememberAdminEmail } from '../lib/admin.js'
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
  const [email, setEmail] = useState(() => savedAdminEmail())
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const wrongEmail = !isDemo && email.includes('@') && !isAdminEmail(email)

  async function go(e) {
    e.preventDefault()
    if (wrongEmail) return toast('This dashboard is only for the Pastel Treats account', true)
    setBusy(true)
    try {
      if (forgot) { await api.resetPassword(email.trim()); setSent(true) }
      else {
        await api.signIn(email.trim(), pw)
        rememberAdminEmail(email.trim(), remember)
        onDone()
      }
    } catch (err) { toast(cleanError(err), true) } finally { setBusy(false) }
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--mint)', padding: 16 }}>
      <form className="card stack login-card" onSubmit={go} autoComplete="on">
        <img src="logo-mint.svg" alt="Pastel Treats" style={{ borderRadius: 14 }} />
        <h2 className="center">{forgot ? 'Reset your password' : 'Baker’s dashboard'}</h2>
        {isDemo && <div className="notice warn small">Demo mode: use any e-mail and the password <b>{DEMO_ADMIN_PASSWORD}</b>.</div>}
        {sent ? (
          <div className="notice info small"><Icon name="check" size={18} /><div>
            <b>Check {email} for a reset link.</b> Open it <b>on this same phone and browser</b>. It can take a few minutes and may land in Spam/Promotions.
          </div></div>
        ) : <>
          <Field label="E-mail" error={wrongEmail ? 'Only the Pastel Treats account can sign in here' : null}>
            <input className={'input' + (wrongEmail ? ' err' : '')} type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" />
          </Field>
          {!forgot && (
            <Field label="Password">
              <div className="pw-wrap">
                <input className="input" type={show ? 'text' : 'password'} name="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                <button type="button" className="link-btn small" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
              </div>
            </Field>
          )}
          {!forgot && <label className="check small"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my e-mail on this device</label>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : forgot ? 'Send reset link' : 'Sign in'}</button>
          {!forgot && <p className="tiny muted center" style={{ margin: 0 }}>Tip: when your phone offers to <b>save the password</b>, tap Save — next time it fills in by itself.</p>}
        </>}
        <div className="row between wrap" style={{ marginTop: 4 }}>
          <button type="button" className="link-btn small" onClick={() => { setForgot((v) => !v); setSent(false) }}>{forgot ? '← Back to sign in' : 'Forgot password?'}</button>
          <Link to="/" className="small">Back to the shop</Link>
        </div>
      </form>
    </div>
  )
}

// Opened from the reset e-mail: set a new password
function ResetPassword() {
  const { toast } = useStore()
  const nav = useNavigate()
  const [ready, setReady] = useState(undefined)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.recoveryReady().then(setReady).catch(() => setReady(false)) }, [])
  async function save(e) {
    e.preventDefault()
    if (pw.length < 8) return toast('Use at least 8 characters', true)
    if (pw !== pw2) return toast('The two passwords don’t match', true)
    setBusy(true)
    try {
      await api.updatePassword(pw)
      toast('Password changed — you’re signed in')
      try { history.replaceState(null, '', location.pathname + '#/admin') } catch { /* */ }
      nav('/admin', { replace: true }); location.reload()
    } catch (err) { toast(cleanError(err), true) } finally { setBusy(false) }
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--mint)', padding: 16 }}>
      <form className="card stack login-card" onSubmit={save}>
        <img src="logo-mint.svg" alt="Pastel Treats" style={{ borderRadius: 14 }} />
        <h2 className="center">Set a new password</h2>
        {ready === undefined ? <Spinner /> : !ready ? (
          <>
            <div className="notice warn small"><Icon name="sparkle" size={18} /><div>This reset link has expired or was opened in a different browser. Please ask for a new one and open it on the same phone.</div></div>
            <Link to="/admin" className="btn btn-primary btn-block">Back to sign in</Link>
          </>
        ) : <>
          <Field label="New password" hint="at least 8 characters"><input className="input" type="password" name="new-password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Type it again"><input className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </>}
      </form>
    </div>
  )
}

function NotAdmin({ me, onDone }) {
  const { toast } = useStore()
  const canClaim = isDemo || isAdminEmail(me.user.email)
  return (
    <div style={{ minHeight: '100vh', background: 'var(--mint)', padding: 16 }}>
      <div className="card stack login-card">
        <h2>{canClaim ? 'Almost there' : 'No access'}</h2>
        <p className="small">You’re signed in as <b>{me.user.email}</b>.</p>
        {canClaim ? <>
          <p className="small muted">Tap below once to set this account up as the bakery owner.</p>
          <button className="btn btn-primary" onClick={async () => { try { const ok = await api.claimFirstAdmin(); if (ok) { toast('You are now the owner'); onDone() } else toast('Could not set up the owner — please contact support', true) } catch (e) { toast(cleanError(e), true) } }}>Set up owner access</button>
        </> : <p className="small muted">The baker’s dashboard can only be used by the Pastel Treats account.</p>}
        <button className="btn btn-ghost" onClick={async () => { await api.adminSignOut(); onDone() }}>Sign out</button>
      </div>
    </div>
  )
}

const NAV = [
  ['Today', [['', 'Overview', 'home'], ['tasks', 'Tasks & reminders', 'bell'], ['announcements', 'Announcement board', 'megaphone'], ['orders', 'Orders', 'receipt'], ['calendar', 'Calendar', 'calendar'], ['approvals', 'Custom approvals', 'sparkle']]],
  ['Money', [['payments', 'Payments', 'wallet'], ['analytics', 'Sales analytics', 'chart']]],
  ['People', [['customers', 'Customers', 'users'], ['dates', 'Special dates', 'gift'], ['segments', 'Segments', 'heart']]],
  ['Shop', [['menu', 'Menu & pricing', 'cake'], ['settings', 'Business settings', 'settings'], ['data', 'Data & reports', 'download']]],
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
  const { pathname } = useLocation()
  const [me, setMe] = useState(undefined)
  const check = useCallback(async () => { try { setMe(await api.adminState()) } catch { setMe({ user: null }) } }, [])
  useEffect(() => { check() }, [check])
  useEffect(() => { document.title = 'Pastel Treats · Admin'; return () => { document.title = 'Pastel Treats' } }, [])
  if (pathname === '/admin/reset') return <ResetPassword />
  if (me === undefined) return <Spinner />
  if (!me.user) return <Login onDone={check} />
  if (!me.isAdmin || (!isDemo && !isAdminEmail(me.user.email))) return <NotAdmin me={me} onDone={check} />
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
