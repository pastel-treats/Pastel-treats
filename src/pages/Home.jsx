import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import ProductCard from '../components/ProductCard.jsx'
import { Icon, WaIcon } from '../components/ui.jsx'
import { waLink } from '../lib/contact.js'
import { leadLabel } from '../lib/format.js'
import { activeAnnouncements, KINDS } from '../lib/announcements.js'
import { fmtDate } from '../lib/dates.js'
import { LocationCard, MeetBaker } from './Info.jsx'
import { InstallBanner } from './GetApp.jsx'
import { api } from '../api/index.js'

const KITCHEN = [
  ['images/ai-kitchen-combi-oven.svg', 'Unox combi oven', 'Professional Italian oven with steam and even heat — the secret behind our soft sponges and crisp choux.'],
  ['images/ai-kitchen-mixer-green.svg', 'KitchenAid stand mixer · pastel green', 'Silky buttercream, airy mousse and perfect meringue, whipped by a pro mixer.'],
  ['images/ai-kitchen-mixer-red.svg', 'KitchenAid stand mixer · red', 'Our second mixer, so dough and cream never wait — every batch made fresh.'],
]

// Approved reviews only (the baker picks them in the dashboard)
function Reviews() {
  const [list, setList] = useState(null)
  useEffect(() => { api.publicReviews?.().then(setList).catch(() => setList([])) }, [])
  if (!list?.length) return null
  return (
    <section className="section" style={{ background: 'var(--ivory)' }}>
      <div className="wrap">
        <div className="eyebrow">Real orders, real people</div>
        <h2 style={{ marginBottom: 18 }}>What our customers say</h2>
        <div className="reviews">
          {list.slice(0, 9).map((r) => (
            <figure key={r.order_number} className="review">
              <div className="stars" aria-label={`${r.rating} out of 5 stars`}>{'★'.repeat(r.rating)}<span className="off">{'★'.repeat(5 - r.rating)}</span></div>
              <blockquote>“{r.body}”</blockquote>
              <figcaption><b>{r.name}</b><span className="tiny muted">{fmtDate(String(r.at).slice(0, 10), { year: true })} · Order {r.order_number} <span className="verified">✓ Verified order</span></span></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}


const CAT_TINTS = ['#ffebf4', '#bfebef', '#ffec9d', '#ffdac1', '#eafeb4', '#d9efe6']
const OCCASIONS = [
  ['Birthday', '🎂', '#ffebf4'], ['Anniversary', '💐', '#ffdac1'], ['Baby shower', '🍼', '#bfebef'], ['Wedding', '💍', '#fffaf2'],
  ['Graduation', '🎓', '#ffec9d'], ['Corporate', '💼', '#d9efe6'], ['For all occasions', '✨', '#eafeb4'],
]

export default function Home() {
  const { data, settings: s } = useStore()
  const featured = data.products.filter((p) => p.is_active && p.is_featured && !p.enquiry_only)
  const cats = data.categories.filter((c) => c.visible)
  const custom = data.products.find((p) => p.is_active && /custom/i.test(p.name))
  const [h1a, ...rest] = (s.hero_headline || '').split(',')
  const news = activeAnnouncements(s)
  const catOf = (slug) => data.categories.find((c) => c.slug === slug)
  const inCat = (slug) => { const c = catOf(slug); return c ? data.products.filter((p) => p.is_active && p.category_id === c.id) : [] }
  const hampers = inCat('hampers')
  const seasonal = inCat('seasonal')

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="fade-in">
            <div className="eyebrow" style={{ color: '#2f5a49' }}>{s.brand_line || 'Premium home baker'} · Dindigul</div>
            <h1 style={{ margin: '12px 0 16px' }}>
              {rest.length ? <>{h1a},<br /><em>{rest.join(',').trim()}</em></> : s.hero_headline}
            </h1>
            <p className="lead" style={{ whiteSpace: 'pre-line' }}>{s.hero_intro}</p>
            <div className="row wrap" style={{ marginTop: 22 }}>
              <Link to="/menu" className="btn btn-primary">Explore our cakes</Link>
              <Link to={custom ? `/cake/${custom.id}` : '/menu/custom-cakes'} className="btn btn-white">Create your custom cake</Link>
              {s.whatsapp && <a className="btn btn-soft" href={waLink(s.whatsapp, 'Hi Pastel Treats! I have a question.')} target="_blank" rel="noreferrer" aria-label="Questions on WhatsApp"><WaIcon size={20} /> Questions?</a>}
            </div>
            <div className="row small" style={{ marginTop: 18, color: '#2f5a49', gap: 16, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 6 }}><Icon name="clock" size={18} /> Order {leadLabel(s.lead_time_hours)}</span>
              <span className="row" style={{ gap: 6 }}><Icon name="heart" size={18} /> Baked fresh to order</span>
              <span className="row" style={{ gap: 6 }}><Icon name="sparkle" size={18} /> Self pickup · courier for brownies & cookies</span>
            </div>
          </div>
          <div className="hero-art fade-in">
            <span className="hero-blob" aria-hidden="true" />
            <img className="hero-baker" src={s.baker_image || 'images/baker.webp'} alt="The baker behind Pastel Treats" />
            <div className="hero-tag">{s.baker_name && <b className="serif baker-name">{s.baker_name}</b>}<b className="serif" style={{ fontSize: '1.05rem', display: 'block' }}>{s.baker_title || 'Certified pastry chef'}</b><span className="muted tiny">Lavonne Academy of Baking Science & Pastry Arts</span></div>
            <div className="hero-dots" aria-hidden="true">{['#ffdac1', '#bfebef', '#ffebf4', '#ffec9d'].map((c) => <span key={c} className="dot" style={{ background: c }} />)}</div>
          </div>
        </div>
      </section>

      <InstallBanner />

      {(news.length > 0 || s.orders_paused) && (
        <section className="wrap" id="news" style={{ paddingTop: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Announcements</div>
          <div className="stack">
            {s.orders_paused && <div className="card" style={{ background: 'var(--pink)' }}><b className="serif" style={{ fontSize: '1.3rem', color: 'var(--rose-deep)' }}>⏸️ Not taking new orders right now</b><p style={{ margin: '4px 0 0' }}>{s.orders_paused_message}</p></div>}
            {news.map((a) => (
              <div key={a.id} className="card" style={{ background: a.kind === 'closed' ? 'var(--pink)' : a.kind === 'leave' ? 'var(--peach)' : a.kind === 'offer' ? 'var(--butter)' : 'var(--mint-wash)' }}>
                <div className="tiny muted">{KINDS[a.kind]?.icon} {KINDS[a.kind]?.label}{a.from ? ` · ${fmtDate(a.from)}${a.to && a.to !== a.from ? ' – ' + fmtDate(a.to) : ''}` : ''}</div>
                <b className="serif" style={{ fontSize: '1.3rem', color: 'var(--forest)' }}>{a.title}</b>
                {a.message && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{a.message}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <div className="row between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
            <div><div className="eyebrow">Loved most</div><h2>Featured treats</h2></div>
            <Link to="/menu" className="btn btn-full-menu">See full menu <Icon name="right" size={18} /></Link>
          </div>
          <div className="grid-products">{featured.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          <div className="center" style={{ marginTop: 22 }}><Link to="/menu" className="btn-full-menu">Browse the full menu — cakes, brownies, cookies & more <Icon name="right" size={18} /></Link></div>
        </div>
      </section>

      {hampers.length > 0 && (
        <section className="section hamper-band">
          <div className="wrap">
            <div className="row between" style={{ marginBottom: 18, alignItems: 'flex-end' }}>
              <div><div className="eyebrow">Gifting</div><h2>Gift hampers</h2><p className="muted" style={{ margin: '6px 0 0' }}>Festivals, corporate gifts, store openings and brand launches — made to your budget.</p></div>
              <Link to="/menu/hampers" className="btn btn-full-menu">All hampers <Icon name="right" size={18} /></Link>
            </div>
            <div className="grid-products">{hampers.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          </div>
        </section>
      )}

      {seasonal.length > 0 && (
        <section className="section">
          <div className="wrap">
            <div className="eyebrow">Only for a while</div>
            <h2 style={{ marginBottom: 18 }}>Seasonal treats</h2>
            <div className="grid-products">{seasonal.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          </div>
        </section>
      )}

      <section className="section" style={{ background: 'var(--ivory)' }}>
        <div className="wrap">
          <div className="eyebrow">Browse</div>
          <h2 style={{ marginBottom: 18 }}>By category</h2>
          <div className="cats">
            {cats.map((c, i) => (
              <Link key={c.id} to={`/menu/${c.slug}`} className="cat" style={{ background: CAT_TINTS[i % CAT_TINTS.length] }}>
                <span className="n">{c.name}</span>
                <span className="d">{c.description}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="eyebrow">Simple as pie</div>
          <h2 style={{ marginBottom: 18 }}>How ordering works</h2>
          <div className="steps">
            {[
              ['Choose', 'Pick your favourite cake or treat from the menu.'],
              ['Customise', 'Flavour, size, design, message — see the price update as you go.'],
              ['Schedule', `Pick a pickup date and time — order ${leadLabel(s.lead_time_hours)}. Brownies & cookies can be couriered.`],
              ['Confirm', 'Pay the advance by UPI and we confirm your order.'],
            ].map(([t, d], i) => (
              <div className="step" key={t}><div className="num">0{i + 1}</div><h3>{t}</h3><p className="small muted" style={{ margin: 0 }}>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'linear-gradient(180deg, var(--cream), var(--pink))' }}>
        <div className="wrap">
          <div className="eyebrow">Celebrations</div>
          <h2 style={{ marginBottom: 18 }}>Make every celebration sweeter</h2>
          <div className="occasions">
            {OCCASIONS.map(([n, ico, bg]) => (
              <Link key={n} to={n === 'For all occasions' ? '/menu' : `/menu?occasion=${encodeURIComponent(n)}`} className="occ" style={{ background: bg, boxShadow: 'var(--shadow)' }}>
                <div className="ico" aria-hidden="true">{ico}</div><div className="n">{n}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Reviews />

      <section className="section kitchen">
        <div className="wrap">
          <div className="eyebrow">Our kitchen</div>
          <h2>Baked with the best equipment</h2>
          <p className="muted" style={{ margin: '6px 0 18px', maxWidth: 640 }}>A professional kitchen at home: the same ovens and mixers used by top patisseries, so every bake comes out just right.</p>
          <div className="kitchen-grid">
            {KITCHEN.map(([img, t, d]) => (
              <figure key={t} className="kit">
                <img src={img} alt={t} loading="lazy" />
                <figcaption><b>{t}</b><span className="small muted">{d}</span></figcaption>
                <span className="ai-tag">Illustration</span>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap" style={{ display: 'grid', gap: 18 }}>
          <MeetBaker />
          <LocationCard />
          <div className="card" style={{ background: 'var(--mint)', display: 'grid', gap: 12 }}>
            <div className="eyebrow" style={{ color: '#2f5a49' }}>Remember the date</div>
            <h2>Never miss a birthday cake again</h2>
            <p style={{ margin: 0, color: '#2f4a3f' }}>Tell us the occasion and date at checkout and tick “remember this date” — we’ll send you a gentle reminder next year, only if you ask us to.</p>
            <div><Link to="/menu" className="btn btn-primary">Order a cake</Link></div>
          </div>
        </div>
      </section>
    </>
  )
}
