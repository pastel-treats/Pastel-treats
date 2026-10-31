import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { priceItem } from '../lib/pricing.js'
import { inr, itemSummary, cleanError } from '../lib/format.js'
import { Empty, ProductImage, Icon } from '../components/ui.jsx'

export function pricedLines(cart, data) {
  return cart.map((l) => {
    const p = data.products.find((x) => x.id === l.product_id)
    try { return { l, p, line: priceItem(p, l, data.addons) } } catch (e) { return { l, p, err: cleanError(e) } }
  })
}

export default function Cart() {
  const { cart, data, removeLine, updateLine } = useStore()
  const nav = useNavigate()
  const lines = pricedLines(cart, data)
  const subtotal = lines.reduce((s, x) => s + (x.line?.line_total || 0), 0)
  const bad = lines.some((x) => x.err)
  if (!cart.length)
    return <div className="wrap"><Empty title="Your cart is empty">Something sweet is waiting. <div style={{ marginTop: 14 }}><Link to="/menu" className="btn btn-primary">Browse the menu</Link></div></Empty></div>
  return (
    <div className="wrap section" style={{ paddingTop: 24, maxWidth: 760 }}>
      <h1 style={{ fontSize: '2.4rem', marginBottom: 14 }}>Your cart</h1>
      <div className="card">
        {lines.map(({ l, p, line, err }) => (
          <div className="line-item" key={l.key}>
            <div className="th"><ProductImage product={p} thumb /></div>
            <div className="grow">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="serif" style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--forest)' }}>{p?.name || 'Item'}</div>
                <b>{line ? inr(line.line_total) : '—'}</b>
              </div>
              {line && <div className="tiny muted">{itemSummary(line)}{line.addons.length ? ' · + ' + line.addons.map((a) => a.name).join(', ') : ''}</div>}
              {l.message && <div className="tiny">“{l.message}”</div>}
              {l.custom_request && <div className="tiny" style={{ color: 'var(--rose-deep)' }}>Custom design — final price confirmed by the baker</div>}
              {err && <div className="err-text">{err}</div>}
              <div className="row" style={{ marginTop: 8 }}>
                <div className="qty">
                  <button onClick={() => updateLine(l.key, { qty: Math.max(p?.min_qty || 1, l.qty - 1) })} aria-label="Less">−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => updateLine(l.key, { qty: Math.min(p?.max_qty || 50, l.qty + 1) })} aria-label="More">+</button>
                </div>
                {p && <Link className="btn btn-soft btn-sm" to={`/cake/${p.id}?edit=${l.key}`}>Edit</Link>}
                <button className="btn btn-sm btn-rose" onClick={() => removeLine(l.key)}><Icon name="trash" size={16} /> Remove</button>
              </div>
            </div>
          </div>
        ))}
        <div className="breakdown" style={{ marginTop: 10 }}>
          <div className="ln total"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
          <div className="tiny muted">Delivery charges and the advance amount are shown at checkout.</div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <Link to="/menu" className="btn btn-ghost">Add more</Link>
        <button className="btn btn-primary grow" disabled={bad} onClick={() => nav('/checkout')}>Choose date & checkout</button>
      </div>
    </div>
  )
}
