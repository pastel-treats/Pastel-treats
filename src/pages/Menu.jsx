import React, { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import ProductCard from '../components/ProductCard.jsx'
import { Empty, Icon } from '../components/ui.jsx'

export default function Menu() {
  const { data } = useStore()
  const { cat } = useParams()
  const [sp] = useSearchParams()
  const occasion = sp.get('occasion')
  const [q, setQ] = useState('')
  const [eggless, setEggless] = useState(false)
  const cats = data.categories.filter((c) => c.visible)
  const current = cats.find((c) => c.slug === cat)
  const today = new Date().toISOString().slice(0, 10)

  const list = useMemo(() => data.products.filter((p) => {
    if (!p.is_active) return false
    if (p.available_from && today < p.available_from) return false
    if (p.available_to && today > p.available_to) return false
    if (current && p.category_id !== current.id) return false
    if (occasion && occasion !== 'Other' && !(p.occasions || []).includes(occasion)) return false
    if (eggless && !(p.egg_options || []).some((e) => /eggless/i.test(e.name))) return false
    if (q && !(p.name + ' ' + (p.description || '') + ' ' + (p.flavours || []).map((f) => f.name).join(' ')).toLowerCase().includes(q.toLowerCase())) return false
    const c = data.categories.find((x) => x.id === p.category_id)
    return !c || c.visible
  }), [data, current, occasion, eggless, q, today])

  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <div className="eyebrow">{occasion ? `For ${occasion}` : 'Our menu'}</div>
      <h1 style={{ fontSize: 'clamp(2rem,6vw,3rem)', margin: '6px 0 14px' }}>{current ? current.name : occasion ? `${occasion} treats` : 'Everything nice'}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="grow" style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: 13, color: 'var(--ink-soft)' }}><Icon name="search" size={20} /></span>
          <input className="input" style={{ paddingLeft: 44 }} placeholder="Search cakes, flavours…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the menu" />
        </label>
        {data.products.some((p) => (p.egg_options || []).some((e) => /eggless/i.test(e.name))) && <button className={'chip' + (eggless ? ' on' : '')} onClick={() => setEggless((v) => !v)}>Eggless</button>}
      </div>
      <div className="scroll-x" style={{ marginBottom: 20 }}>
        <Link to="/menu" className={'chip' + (!current && !occasion ? ' on' : '')} style={{ textDecoration: 'none' }}>All</Link>
        {cats.map((c) => (
          <Link key={c.id} to={`/menu/${c.slug}`} className={'chip' + (current?.id === c.id ? ' on' : '')} style={{ textDecoration: 'none' }}>{c.name}</Link>
        ))}
      </div>
      {current?.description && <p className="muted" style={{ marginTop: -8 }}>{current.description}</p>}
      {list.length ? (
        <div className="grid-products four">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      ) : (
        <Empty title="Nothing here yet">Try another category, or <Link to="/contact">ask us</Link> — we love a custom request.</Empty>
      )}
      <div className="notice info" style={{ marginTop: 28 }}>
        <Icon name="sparkle" size={20} />
        <div>Cakes and cupcakes can be customised. Don’t see what you want? <Link to="/menu/custom-cakes">Request a custom cake</Link>.</div>
      </div>
    </div>
  )
}
