import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { KINDS, popupsToShow } from '../lib/announcements.js'
import { fmtDate, todayISO } from '../lib/dates.js'
import { waLink } from '../lib/contact.js'
import { WaIcon } from './ui.jsx'

// Pop-up announcement shown when a customer opens the site — once a day per announcement.
const KEY = 'pt-popups-seen'
const seen = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
const markSeen = (id) => { try { const m = seen(); m[id] = todayISO(); localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* ignore */ } }

export default function AnnouncementPopup() {
  const { settings: s } = useStore()
  const { pathname } = useLocation()
  const [, force] = useState(0)
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 700); return () => clearTimeout(t) }, [])
  if (!ready || /^\/(order|o)\//.test(pathname)) return null
  const today = todayISO()
  const a = popupsToShow(s).find((x) => seen()[x.id] !== today)
  if (!a) return null
  const close = () => { markSeen(a.id); force((n) => n + 1) }
  const k = KINDS[a.kind] || KINDS.info
  return (
    <div className="popup-back" role="dialog" aria-modal="true" aria-labelledby="pp-title" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className={'popup-card k-' + a.kind}>
        <div className="popup-icon" aria-hidden="true">{k.icon}</div>
        <div className="eyebrow">{k.label}{a.from && a.kind !== 'closed' ? ` · ${fmtDate(a.from)}${a.to && a.to !== a.from ? ' – ' + fmtDate(a.to) : ''}` : ''}</div>
        <h2 id="pp-title">{a.title}</h2>
        {a.message && <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{a.message}</p>}
        {a.until && <p className="small" style={{ margin: 0 }}><b>Orders open again on {fmtDate(a.until, { weekday: true })}.</b></p>}
        <div className="stack" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn btn-primary btn-block" onClick={close} autoFocus>Got it</button>
          {s.whatsapp && <a className="btn btn-soft btn-block" href={waLink(s.whatsapp, `Hi Pastel Treats! About "${a.title}": `)} target="_blank" rel="noreferrer" onClick={close}><WaIcon size={18} /> Ask us on WhatsApp</a>}
        </div>
      </div>
    </div>
  )
}
