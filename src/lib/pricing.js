// Client-side mirror of the SQL pricing (price_item / quote_order). The server recalculates
// everything before accepting an order — this copy only powers the live price preview & demo mode.

const optPrice = (opts, pick) => (opts || []).find((o) => o.name === pick)?.price || 0
const optOk = (opts, pick) => !pick || !(opts || []).length || (opts || []).some((o) => o.name === pick)

export function priceItem(p, sel, addonsList) {
  if (!p || !p.is_active) throw new Error('ITEM_UNAVAILABLE: a selected item is no longer on the menu')
  if (!p.is_available) throw new Error(`ITEM_UNAVAILABLE: ${p.name} is currently unavailable`)
  const qty = Math.max(parseInt(sel.qty || 1, 10) || 1, 1)
  if (qty > (p.max_qty || 50)) throw new Error(`INVALID: maximum quantity for ${p.name} is ${p.max_qty || 50}`)
  if (qty < (p.min_qty || 1)) throw new Error(`INVALID: minimum order for ${p.name} is ${p.min_qty}`)
  const perKg = p.pricing_mode === 'per_kg'
  let weight = sel.weight || null
  let weightPrice
  if ((p.weights || []).length) {
    const w = p.weights.find((x) => x.label === weight)
    if (!w) throw new Error(`INVALID: please choose a size for ${p.name}`)
    weightPrice = perKg ? Math.round(optPrice(p.flavours, sel.flavour) * (+w.kg || 1)) : +w.price
  } else {
    weightPrice = +p.base_price
    weight = null
  }
  for (const [k, list] of [['flavour', p.flavours], ['filling', p.fillings], ['frosting', p.frostings], ['design', p.designs], ['egg', p.egg_options]])
    if (!optOk(list, sel[k])) throw new Error(`INVALID: one of the options for ${p.name} is no longer offered`)
  const unit = weightPrice + (perKg ? 0 : optPrice(p.flavours, sel.flavour)) + optPrice(p.fillings, sel.filling) + optPrice(p.frostings, sel.frosting) +
    optPrice(p.designs, sel.design) + optPrice(p.egg_options, sel.egg)
  const addons = []
  let addonTotal = 0
  for (const a of sel.addons || []) {
    const ad = (addonsList || []).find((x) => x.id === a.id && x.active !== false)
    if (ad) {
      const q = Math.max(parseInt(a.qty || 1, 10) || 1, 1)
      addonTotal += ad.price * q
      addons.push({ id: ad.id, name: ad.name, price: ad.price, qty: q })
    }
  }
  const cut = (v, n) => (v ? String(v).slice(0, n) : v || null)
  return {
    product_id: p.id, name: p.name, image: (p.images || [])[0] || null, unit_label: p.unit_label,
    qty, weight, weight_price: weightPrice,
    flavour: sel.flavour || null, filling: sel.filling || null, frosting: sel.frosting || null, design: sel.design || null, egg: sel.egg || null,
    option_charges: unit - weightPrice, unit_price: unit, addons, addon_total: addonTotal, line_total: unit * qty + addonTotal,
    message: cut(sel.message, 120), name_on_cake: cut(sel.name_on_cake, 60), age: cut(sel.age, 20), colours: cut(sel.colours, 120),
    theme: cut(sel.theme, 300), instructions: cut(sel.instructions, 600),
    custom_request: !!sel.custom_request, custom_description: cut(sel.custom_description, 1500),
    reference_images: sel.reference_images || [],
  }
}

// Which advance rule applies: orders above the "bigger order" amount can have their own advance
export function advanceRule(total, s) {
  if (s?.advance_tier_enabled && total >= (+s.advance_tier_above || 0))
    return { mode: s.advance_tier_mode || 'percent', value: +(s.advance_tier_value ?? 50) }
  return { mode: s?.advance_mode || 'percent', value: +(s?.advance_value ?? 50) }
}
export function calcAdvance(total, s) {
  const r = advanceRule(total, s)
  if (r.mode === 'fixed') return Math.min(total, Math.round(r.value || 0))
  return Math.min(total, Math.ceil((total * r.value) / 100))
}

export function findZone(zones, pincode) {
  const pin = String(pincode || '').replace(/\s/g, '')
  return (zones || []).filter((z) => z.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0)).find((z) => (z.pincodes || []).includes(pin)) || null
}

export function quote(payload, { products, addons, zones, settings }) {
  const items = (payload.items || []).map((it) => priceItem(products.find((p) => p.id === it.product_id), it, addons))
  const subtotal = items.reduce((s, i) => s + i.line_total, 0)
  let dc = 0
  let zone = null
  if (payload.fulfilment === 'delivery') {
    zone = findZone(zones, payload.address?.pincode)
    if (zone) dc = zone.free_above != null && zone.free_above !== '' && subtotal >= zone.free_above ? 0 : zone.charge
  }
  const total = subtotal + dc
  const adv = calcAdvance(total, settings)
  return { items, subtotal, delivery_charge: dc, zone_found: !!zone, zone: zone?.name || null, total, advance_due: adv, balance: total - adv }
}

// "Starting from" price for menu cards
export function startingPrice(p) {
  const min = (l) => ((l || []).length ? Math.min(...l.map((o) => +o.price || 0)) : 0)
  const qty = p.min_qty || 1
  if (p.pricing_mode === 'per_kg') return Math.round(min(p.flavours) * Math.min(...(p.weights || [{ kg: 1 }]).map((w) => +w.kg || 1))) + min(p.designs)
  const base = (p.weights || []).length ? Math.min(...p.weights.map((w) => +w.price)) : +p.base_price
  return base + min(p.flavours) + min(p.fillings) + min(p.frostings) + min(p.designs) + min(p.egg_options)
}
export const hasChoices = (p) =>
  ['weights', 'flavours', 'fillings', 'frostings', 'designs', 'egg_options'].some((k) => (p[k] || []).length > 1)
