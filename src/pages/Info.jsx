import React, { useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { waLink, telLink, callsToday, NO_CALL_NOTE } from '../lib/contact.js'
import { Icon, WaIcon } from '../components/ui.jsx'

export const POLICY_TITLES = {
  ordering: 'Ordering & confirmation', advance: 'Advance payment', cancellation: 'Cancellation', refund: 'Refunds', custom: 'Custom cakes',
  delivery: 'Delivery', pickup: 'Pickup', missed_pickup: 'Missed pickup', changes: 'Changes to confirmed orders', allergens: 'Allergens & dietary',
  storage: 'Storing your cake', privacy: 'Privacy policy', terms: 'Terms & conditions',
}

export function PolicyText({ keys }) {
  const { settings: s } = useStore()
  const pol = s.policies || {}
  return (
    <div className="policy">
      {(keys || Object.keys(POLICY_TITLES)).filter((k) => pol[k]).map((k) => (
        <section key={k} id={k}><h3>{POLICY_TITLES[k] || k}</h3><p style={{ whiteSpace: 'pre-line' }}>{pol[k]}</p></section>
      ))}
    </div>
  )
}

// "Meet the baker" card (home & contact pages)
export function MeetBaker() {
  const { settings: s } = useStore()
  if (!s.baker_intro) return null
  return (
    <div className="card meet-baker">
      <img src={s.baker_image || 'images/baker.webp'} alt="The baker behind Pastel Treats" />
      <div>
        <div className="eyebrow">Meet the baker</div>
        {s.baker_name && <div className="baker-name serif">{s.baker_name}</div>}
        <div className="small" style={{ color: 'var(--forest)', fontWeight: 600 }}>{s.baker_title || 'Certified pastry chef'}</div>
        <p className="serif" style={{ fontSize: '1.45rem', lineHeight: 1.3, color: 'var(--forest)', margin: '6px 0 10px' }}>{s.baker_intro}</p>
        {s.instagram && <a className="btn-insta" href={s.instagram} target="_blank" rel="noreferrer"><span className="ig"><Icon name="insta" size={20} /></span> See my bakes on Instagram <Icon name="right" size={16} /></a>}
      </div>
    </div>
  )
}

// Pickup location card with a big, direct Google Maps button
export function LocationCard({ compact }) {
  const { settings: s } = useStore()
  if (!s.pickup_address && !s.maps_link) return null
  return (
    <div className="card" style={{ background: 'var(--mint-wash)' }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span style={{ width: 44, height: 44, borderRadius: 99, background: 'var(--mint)', display: 'grid', placeItems: 'center', color: 'var(--forest)', flex: 'none' }}><Icon name="map" /></span>
        <div className="grow">
          <div className="eyebrow">Pickup location</div>
          <b className="serif" style={{ fontSize: '1.3rem', color: 'var(--forest)' }}>{s.pickup_address}</b>
          {!compact && s.business_hours && <div className="small muted">{s.business_hours}</div>}
          {!compact && <div className="small muted">Self pickup at your chosen time slot.</div>}
        </div>
      </div>
      {s.maps_link && <a className="btn btn-primary btn-block" style={{ marginTop: 12 }} href={s.maps_link} target="_blank" rel="noopener noreferrer"><Icon name="map" size={18} /> Open in Google Maps</a>}
    </div>
  )
}

export function Policies() {
  const { hash } = useLocation()
  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50) }, [hash])
  return (
    <div className="wrap section" style={{ maxWidth: 760, paddingTop: 24 }}>
      <div className="eyebrow">The small print, kindly put</div>
      <h1 style={{ fontSize: '2.4rem' }}>Policies & FAQs</h1>
      <PolicyText />
    </div>
  )
}

export function Contact() {
  const { settings: s } = useStore()
  return (
    <div className="wrap section" style={{ maxWidth: 760, paddingTop: 24 }}>
      <h1 style={{ fontSize: '2.4rem', marginBottom: 16 }}>Say hello</h1>
      <div className="stack">
        <MeetBaker />
        {s.whatsapp && (
          <div className="card stack">
            <div className="card-title"><WaIcon size={22} /> WhatsApp {s.phone || '+' + s.whatsapp}</div>
            {s.order_channel_note && <div className="notice info"><Icon name="sparkle" size={20} /><div>{s.order_channel_note} <Link to="/menu">Order in the app</Link></div></div>}
            <div className="chips">
              {[['Ask about a cake', 'Hi! I have a question about a cake.'], ['Discuss a custom design', 'Hi! I’d like to discuss a custom cake design.'], ['Ask about my order', 'Hi! I have a question about my order: '], ['Just say hi', 'Hi Pastel Treats!']].map(([t, m]) => (
                <a key={t} className="chip" href={waLink(s.whatsapp, m)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{t}</a>
              ))}
            </div>
          </div>
        )}
        <LocationCard />
        <div className="card">
          <dl className="kv">
            {s.phone && <><dt><Icon name="phone" size={18} /></dt><dd>{callsToday(s) ? <a href={telLink(s.phone)}>{s.phone}</a> : <>{s.phone} <span className="tiny muted">· {NO_CALL_NOTE}</span></>}{s.phone2 && <> · <a href={telLink(s.phone2)}>{s.phone2}</a></>}</dd></>}
            {s.email && <><dt>@</dt><dd><a href={`mailto:${s.email}`}>{s.email}</a></dd></>}
            {s.instagram && <><dt><Icon name="insta" size={18} /></dt><dd><a href={s.instagram} target="_blank" rel="noreferrer">{s.instagram.replace(/^https?:\/\/(www\.)?/, '')}</a></dd></>}
            {s.business_hours && <><dt><Icon name="clock" size={18} /></dt><dd>{s.business_hours}</dd></>}
          </dl>
        </div>
        {s.phone && callsToday(s) && <a className="btn btn-primary hide-lg" href={telLink(s.phone)}><Icon name="phone" size={18} /> Call the baker</a>}
        <Link to="/app" className="btn btn-white"><Icon name="download" size={18} /> Get the app on your phone</Link>
      </div>
    </div>
  )
}
