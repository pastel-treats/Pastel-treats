import React, { useState } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { Icon, WaIcon } from './ui.jsx'
import { waLink, telLink, callsToday, NO_CALL_NOTE } from '../lib/contact.js'
import { isDemo } from '../api/index.js'
import { activeAnnouncements, KINDS } from '../lib/announcements.js'

export default function Layout() {
  const { settings: s, cart } = useStore()
  const [waOpen, setWaOpen] = useState(false)
  const { pathname } = useLocation()
  const n = cart.length
  const hideFab = /^\/(checkout|cake|cart)/.test(pathname)
  const top = activeAnnouncements(s)[0]
  return (
    <div className="has-tabbar">
      {isDemo && <div className="demo-bar">Demo mode — orders are saved only on this device until the bakery database is connected.</div>}
      {s.orders_paused ? <div className="promo" style={{ background: 'var(--rose-deep)' }}>⏸️ {s.orders_paused_message || 'We are not taking new orders right now.'}</div>
        : top ? <Link to="/" className="promo" style={{ display: 'block', textDecoration: 'none' }}>{KINDS[top.kind]?.icon} {top.title}{top.message ? ` — ${top.message}` : ''}</Link>
        : s.promo_banner && <div className="promo">{s.promo_banner}</div>}
      <header className="topbar">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="Pastel Treats home"><img src="logo.svg" alt="Pastel Treats" /></Link>
          <nav className="nav hide-sm">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/menu">Menu</NavLink>
            <NavLink to="/track">My orders</NavLink>
            <NavLink to="/contact">Contact</NavLink>
          </nav>
          <div className="row" style={{ gap: 10 }}>
          <Link to="/contact" className="baker-chip" aria-label="Meet the baker" title="Meet the baker"><img src="images/baker-avatar.webp" alt="" /></Link>
          <Link to="/cart" className="cart-btn" aria-label={`Cart, ${n} items`}><Icon name="bag" />{n > 0 && <span className="count">{n}</span>}</Link>
          </div>
        </div>
      </header>

      <main><Outlet /></main>

      <footer className="footer">
        <div className="wrap cols">
          <div>
            <img src="logo-mint.svg" alt="Pastel Treats" style={{ height: 76, marginBottom: 12, borderRadius: 16 }} />
            <p className="small" style={{ maxWidth: 360 }}><b>{s.brand_line || 'Premium home baker'}</b> · Dindigul</p>
          </div>
          <div>
            <h4>Say hello</h4>
            <ul>
              {s.whatsapp && <li><a href={waLink(s.whatsapp, 'Hi Pastel Treats!')} target="_blank" rel="noreferrer">WhatsApp</a></li>}
              {s.phone && <li>{callsToday(s) ? <a href={telLink(s.phone)}>{s.phone}</a> : <span title={NO_CALL_NOTE}>{s.phone} (no calls on Sunday)</span>}</li>}
              {s.email && <li><a href={`mailto:${s.email}`}>{s.email}</a></li>}
              {s.instagram && <li><a href={s.instagram} target="_blank" rel="noreferrer">Instagram</a></li>}
              {s.pickup_address && <li>{s.pickup_address}{s.maps_link && <> · <a href={s.maps_link} target="_blank" rel="noopener noreferrer">Get directions</a></>}</li>}
              {s.business_hours && <li>{s.business_hours}</li>}
            </ul>
          </div>
          <div>
            <h4>Good to know</h4>
            <ul>
              <li><Link to="/policies#ordering">Ordering & cancellation</Link></li>
              <li><Link to="/policies#privacy">Privacy policy</Link></li>
              <li><Link to="/policies#terms">Terms & conditions</Link></li>
              <li><Link to="/track">My orders</Link></li>
              <li><Link to="/app">Get the app (Android & iPhone)</Link></li>
              <li><Link to="/admin">Baker’s dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="wrap tiny" style={{ marginTop: 26, opacity: 0.7 }}>© {new Date().getFullYear()} {s.business_name}. Baked to order with love.</div>
      </footer>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><Icon name="home" />Home</NavLink>
        <NavLink to="/menu"><Icon name="cake" />Menu</NavLink>
        <NavLink to="/cart"><Icon name="bag" />{n > 0 && <span className="count">{n}</span>}Cart</NavLink>
        <NavLink to="/track"><Icon name="receipt" />Orders</NavLink>
        <NavLink to="/contact"><Icon name="phone" />Contact</NavLink>
      </nav>

      {s.whatsapp && !hideFab && (
        <>
          {waOpen && (
            <div className="wa-menu fade-in" role="menu">
              <Link to="/menu" onClick={() => setWaOpen(false)} style={{ fontWeight: 600 }}>🧁 Place an order in the app</Link>
              <div className="tiny muted" style={{ padding: '6px 12px' }}>Questions? Chat with the baker on WhatsApp</div>
              <a href={waLink(s.whatsapp, 'Hi! I have a question about a cake.')} target="_blank" rel="noreferrer">Ask about a cake</a>
              <a href={waLink(s.whatsapp, 'Hi! I’d like to discuss a custom cake design.')} target="_blank" rel="noreferrer">Discuss a custom design</a>
              <a href={waLink(s.whatsapp, 'Hi! I have a question about my order: ')} target="_blank" rel="noreferrer">Ask about my order</a>
              {s.phone && (callsToday(s) ? <a href={telLink(s.phone)}>Call {s.phone}</a> : <div className="tiny muted" style={{ padding: '6px 12px' }}>{NO_CALL_NOTE}</div>)}
            </div>
          )}
          <button className="fab-wa" onClick={() => setWaOpen((o) => !o)} aria-label="Contact on WhatsApp">{waOpen ? <Icon name="x" /> : <WaIcon />}</button>
        </>
      )}
    </div>
  )
}
