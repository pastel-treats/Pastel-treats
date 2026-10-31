import React from 'react'
import { Link } from 'react-router-dom'
import { ProductImage, Badge } from './ui.jsx'
import { inr } from '../lib/format.js'
import { startingPrice, hasChoices } from '../lib/pricing.js'

export default function ProductCard({ p }) {
  const eggless = (p.egg_options || []).some((e) => /eggless/i.test(e.name)) || /eggless/i.test(p.dietary || '')
  const flv = (p.flavours || []).length
  const sizes = (p.weights || []).map((w) => w.label)
  return (
    <Link to={`/cake/${p.id}`} className="pcard fade-in">
      <div className="ph">
        <ProductImage product={p} thumb />
        <div className="tags">
          {!p.is_available && <Badge tone="grey">Sold out</Badge>}
          {eggless && <Badge tone="lime">Eggless option</Badge>}
          {p.courier_ok && <Badge tone="mint">Courier</Badge>}
          {p.seasonal_note && <Badge tone="butter">{p.seasonal_note}</Badge>}
        </div>
      </div>
      <div className="body">
        <div className="name">{p.name}</div>
        <div className="tiny muted">
          {sizes.length ? sizes.slice(0, 3).join(' · ') + (sizes.length > 3 ? ' +' : '') : p.unit_label === 'each' ? 'per piece' : p.unit_label}
          {flv > 1 && ` · ${flv} flavours`}
        </div>
        <div className="price">
          {p.enquiry_only ? (p.base_price ? <><small>from </small>{inr(p.base_price)}</> : <small>Price on request</small>)
            : p.unit_label === 'each' ? <>{inr(p.base_price)} <small>each · min {p.min_qty || 1}</small></>
            : <>{(hasChoices(p) || p.pricing_mode === 'per_kg') && <small>from </small>}{inr(startingPrice(p))}{p.pricing_mode === 'per_kg' && <small> /kg</small>}</>}
        </div>
        <div className="cta">{!p.is_available ? 'Currently unavailable' : p.enquiry_only ? 'Request a quote →' : 'Customise & order →'}</div>
      </div>
    </Link>
  )
}
