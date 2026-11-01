import React, { useCallback, useEffect, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api, isDemo } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { fmtDate } from '../lib/dates.js'
import { isTrackingOff, setTrackingOff } from '../lib/visits.js'
import { Icon, Spinner, Switch } from '../components/ui.jsx'

// Wix-style visitor statistics, from the bakery's own private visit log.
const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '3 months'], [365, '1 year']]
const SOURCE = {
  instagram: ['📸', 'Instagram'], whatsapp: ['💬', 'WhatsApp'], google: ['🔎', 'Google'], facebook: ['👍', 'Facebook'],
  search: ['🔍', 'Other search'], qr: ['🔳', 'QR code'], direct: ['🔗', 'Typed / saved link'], other: ['🌐', 'Other websites'],
}
const PAGE = { '/': 'Home', '/menu': 'Menu', '/cake': 'Cake pages', '/cart': 'Cart', '/checkout': 'Checkout', '/order': 'Order pages', '/track': 'My orders',
  '/contact': 'Contact', '/policies': 'Policies', '/app': 'Get the app' }
const DEVICE = { mobile: '📱 Phone', tablet: '📟 Tablet', desktop: '💻 Computer' }
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const dur = (s) => (!s ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`)
const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)

function Change({ now, before }) {
  if (before == null) return null
  if (before < 5) return <span className="tiny muted">{now ? 'too early to compare' : ''}</span> // not enough history yet
  const d = Math.round(((now - before) / before) * 100)
  if (!d) return <span className="tiny muted">same as before</span>
  return <span className="tiny" style={{ color: d > 0 ? '#1f7a4d' : '#b0603a', fontWeight: 600 }}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%</span>
}
function Kpi({ v, l, now, before, hint }) {
  return (
    <div className="kpi">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
      {(before != null || hint) && <div style={{ marginTop: 4 }}>{before != null ? <Change now={now} before={before} /> : <span className="tiny muted">{hint}</span>}</div>}
    </div>
  )
}
function Bars({ rows, max }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return rows.map((r) => (
    <div className="hbar" key={r.label}>
      <span>{r.label}</span>
      <span className="track"><i style={{ width: `${Math.max(2, (r.value / m) * 100)}%` }} /></span>
      <b className="small">{r.value}{r.extra ? <span className="muted" style={{ fontWeight: 400 }}> {r.extra}</span> : null}</b>
    </div>
  ))
}
// group long ranges by week so the chart stays readable on a phone
function series(t) {
  if (t.days === 1) return { title: 'Page views by hour today', rows: t.hours.map((h) => ({ k: h.hour, label: hourLabel(h.hour), value: h.views })), cur: new Date().getHours() }
  if (t.days <= 31) return { title: 'Visitors per day', rows: t.daily.map((d, i) => ({ k: d.day, label: t.days <= 7 ? fmtDate(d.day, { weekday: true }).split(',')[0] : (i % 3 === 0 || i === t.daily.length - 1 ? String(+d.day.slice(8)) : ''), value: d.visitors, tip: `${fmtDate(d.day, { weekday: true })}: ${d.visitors} visitors, ${d.views} page views${d.orders ? `, ${d.orders} ordered` : ''}` })), cur: t.daily.length - 1 }
  const weeks = []
  t.daily.forEach((d, i) => { if (i % 7 === 0) weeks.push({ k: d.day, label: fmtDate(d.day).replace(/ \d{4}$/, ''), value: 0, views: 0 }); const w = weeks.at(-1); w.value += d.visitors; w.views += d.views })
  return { title: 'Visitors per week', rows: weeks.map((w, i) => ({ ...w, label: i % Math.ceil(weeks.length / 8) === 0 ? w.label : '', tip: `Week of ${fmtDate(w.k)}: ${w.value} visits, ${w.views} page views` })), cur: weeks.length - 1 }
}

export default function Traffic() {
  const { toast } = useAdmin()
  const [days, setDays] = useState(7)
  const [t, setT] = useState(null)
  const [err, setErr] = useState(null)
  const [counting, setCounting] = useState(() => !isTrackingOff())
  const load = useCallback(async (quiet) => {
    if (!quiet) setT(null)
    try { setT(await api.traffic(days)); setErr(null) } catch (e) { setErr(cleanError(e)) }
  }, [days])
  useEffect(() => { load() }, [load])
  useEffect(() => { const i = setInterval(() => document.visibilityState === 'visible' && load(true), 60000); return () => clearInterval(i) }, [load])

  const site = isDemo ? 'https://pasteltreats.in' : location.origin
  const links = [['Instagram bio', 'ig'], ['WhatsApp', 'wa'], ['Facebook', 'fb'], ['QR code', 'qr']]

  if (err) return (
    <>
      <PageHead title="Site traffic" sub="How many people visit your website, where they come from and what they look at." />
      <div className="notice warn">{/function|does not exist|schema cache/i.test(err) ? 'Site traffic needs the latest database update. Run the update file in Supabase, then come back here.' : err}</div>
    </>
  )
  const T = t?.totals, P = t?.previous
  const s = t && series(t)
  const peak = s ? Math.max(1, ...s.rows.map((r) => r.value)) : 1
  const f = t?.funnel
  const busiest = t ? [...t.hours].sort((a, b) => b.views - a.views)[0] : null

  return (
    <>
      <PageHead title="Site traffic" sub="How many people visit your website, where they come from and what they look at. Private to you — no names or numbers are recorded." />
      <div className="row wrap between" style={{ gap: 8, marginBottom: 14 }}>
        <div className="pill-tabs">{RANGES.map(([d, l]) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}</div>
        {t && <span className="live-pill"><span className="pulse-dot" aria-hidden="true" /> {t.live} {t.live === 1 ? 'person' : 'people'} on the site now</span>}
      </div>
      {!t ? <Spinner /> : (
        <>
          {!T.visitors && <div className="notice info small" style={{ marginBottom: 14 }}>No visits yet {days === 1 ? 'today' : 'in this period'}. Visits are counted from the day this update went live — share your link and check back soon.</div>}
          <div className="kpis">
            <Kpi v={T.visitors} l="Visitors" now={T.visitors} before={P?.visitors} />
            <Kpi v={T.views} l="Page views" now={T.views} before={P?.views} />
            <Kpi v={T.order_sessions} l={`Online orders · ${pct(T.order_sessions, T.sessions)}% of visits`} now={T.order_sessions} before={P?.order_sessions} />
            <Kpi v={T.sessions} l="Visits (sessions)" now={T.sessions} before={P?.sessions} />
            <Kpi v={`${pct(T.new_visitors, T.visitors)}%`} l="New visitors" hint={`${T.visitors - T.new_visitors} came back again`} />
            <Kpi v={dur(T.avg_secs)} l="Average time on site" hint={`${T.sessions ? (T.views / T.sessions).toFixed(1) : 0} pages per visit`} />
            <Kpi v={`${pct(T.bounce, T.sessions)}%`} l="Left after one page" hint="lower is better" />
            <Kpi v={T.app_sessions} l="Visits from the installed app" hint={`${pct(T.app_sessions, T.sessions)}% of visits`} />
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title">{s.title}</div>
            <div className="bar-chart" role="img" aria-label={s.title}>
              {s.rows.map((r, i) => (
                <div className="b" key={r.k} title={r.tip || `${r.label}: ${r.value}`}>
                  {r.value > 0 && r.value === peak && <span style={{ fontWeight: 600, color: 'var(--forest)' }}>{r.value}</span>}
                  <i className={i === s.cur ? 'cur' : ''} style={{ height: `${(r.value / peak) * 100}%` }} />
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cards-2" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-title">Where visitors come from</div>
              {!t.sources.length ? <p className="small muted">Nothing yet.</p> : <Bars rows={t.sources.map((x) => ({ label: (SOURCE[x.source] || SOURCE.other).join(' '), value: x.sessions, extra: x.orders ? `· ${x.orders} ordered` : '' }))} />}
              {t.referrers.length > 0 && <p className="tiny muted" style={{ marginBottom: 0 }}>Other websites: {t.referrers.map((r) => `${r.ref} (${r.visits})`).join(', ')}</p>}
            </div>
            <div className="card">
              <div className="card-title">Shopping journey</div>
              {[['Visited the site', f.visits], ['Opened a cake / treat', f.product], ['Added to cart', f.cart], ['Reached checkout', f.checkout], ['Placed an order', f.order]].map(([l, n], i, a) => (
                <div className="hbar" key={l}>
                  <span>{l}</span>
                  <span className="track"><i style={{ width: `${Math.max(2, pct(n, f.visits))}%`, background: i === a.length - 1 ? 'var(--forest)' : undefined }} /></span>
                  <b className="small">{n} <span className="muted" style={{ fontWeight: 400 }}>{pct(n, f.visits)}%</span></b>
                </div>
              ))}
              {f.cart > 0 && <p className="tiny muted" style={{ marginBottom: 0 }}>{f.cart - f.order} of {f.cart} visits with something in the cart didn’t order — a gentle WhatsApp offer or clearer prices can help.</p>}
            </div>
          </div>

          <div className="cards-2" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-title">Most viewed treats</div>
              {!t.products.length ? <p className="small muted">Nothing yet.</p> : <Bars rows={t.products.map((x) => ({ label: x.name.trim(), value: x.views, extra: x.carts ? `· ${x.carts} to cart` : '' }))} />}
            </div>
            <div className="card">
              <div className="card-title">Top pages</div>
              {!t.pages.length ? <p className="small muted">Nothing yet.</p> : <Bars rows={t.pages.map((x) => ({ label: PAGE[x.page] || x.page, value: x.views, extra: `· ${x.visitors} people` }))} />}
            </div>
          </div>

          <div className="cards-2" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="card-title">Devices</div>
              <Bars rows={t.devices.map((x) => ({ label: DEVICE[x.device] || x.device, value: x.visitors }))} />
              <div className="card-title" style={{ marginTop: 14 }}>Phones & computers</div>
              <Bars rows={t.os.map((x) => ({ label: x.os, value: x.visitors }))} />
              <div className="card-title" style={{ marginTop: 14 }}>Browsers</div>
              <Bars rows={t.browsers.slice(0, 6).map((x) => ({ label: x.browser === 'Instagram' ? 'Inside Instagram' : x.browser === 'Facebook' ? 'Inside Facebook' : x.browser, value: x.visitors }))} />
            </div>
            <div className="card">
              <div className="card-title">Busiest hours</div>
              {busiest?.views ? <p className="small" style={{ marginTop: 0 }}>Most people browse around <b>{hourLabel(busiest.hour).replace('a', ' AM').replace('p', ' PM')}</b> — a good time to post on Instagram or your status.</p> : <p className="small muted">Nothing yet.</p>}
              <div className="bar-chart" style={{ height: 120 }} role="img" aria-label="Page views by hour of the day">
                {(() => { const m = Math.max(1, ...t.hours.map((h) => h.views)); return t.hours.map((h) => (
                  <div className="b" key={h.hour} title={`${hourLabel(h.hour)}: ${h.views} page views`}>
                    <i className={h.hour === busiest?.hour && h.views ? 'cur' : ''} style={{ height: `${(h.views / m) * 100}%` }} />
                    <span>{h.hour % 6 === 0 ? hourLabel(h.hour) : ''}</span>
                  </div>
                )) })()}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card stack" style={{ marginTop: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>🔗 Your sharing links</div>
        <p className="small muted" style={{ margin: 0 }}>Use these links when you share the website, so this page can tell exactly which one brings customers. They all open the same site.</p>
        {links.map(([l, k]) => {
          const url = `${site.replace(/\/$/, '')}/?s=${k}`
          return (
            <div className="copy" key={k}>
              <span className="grow small"><b>{l}</b><br /><span style={{ fontFamily: 'monospace' }}>{url.replace(/^https?:\/\//, '')}</span></span>
              <button className="btn btn-white btn-sm" onClick={() => { navigator.clipboard?.writeText(url); toast('Link copied') }}><Icon name="copy" size={16} /> Copy</button>
            </div>
          )
        })}
      </div>

      <div className="card stack" style={{ marginTop: 14 }}>
        <Switch checked={counting} onChange={(v) => { setTrackingOff(!v); setCounting(v) }} label="Count my own visits from this phone" />
        <p className="tiny muted" style={{ margin: 0 }}>Off by default on your phone, so checking your own shop doesn’t inflate the numbers. Visits to this dashboard are never counted. Each visitor is a random code kept on their phone — no names, mobile numbers, locations or cookies are recorded.</p>
      </div>
    </>
  )
}
