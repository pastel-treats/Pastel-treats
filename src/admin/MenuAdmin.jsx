import React, { useMemo, useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { inr, cleanError } from '../lib/format.js'
import { startingPrice } from '../lib/pricing.js'
import { Modal, Field, Switch, Icon, ProductImage, Badge, compressImage, ACCEPT_IMG } from '../components/ui.jsx'

const LISTS = [['weights', 'Sizes / weights', 'label', 'Full price at this size'], ['flavours', 'Flavours', 'name', 'Extra'], ['fillings', 'Fillings', 'name', 'Extra'],
  ['frostings', 'Frostings', 'name', 'Extra'], ['designs', 'Designs', 'name', 'Extra'], ['egg_options', 'Egg / eggless', 'name', 'Extra']]

function OptionList({ value, onChange, keyName, priceLabel, valueKey = 'price' }) {
  const list = value || []
  const upd = (i, patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div>
      {list.map((o, i) => (
        <div className="opt-edit" key={i}>
          <input className="input" value={o[keyName]} placeholder={keyName === 'label' ? '1 kg' : 'Name'} onChange={(e) => upd(i, { [keyName]: e.target.value })} />
          <input className="input" type="number" step="any" value={o[valueKey] ?? ''} title={priceLabel} onChange={(e) => upd(i, { [valueKey]: +e.target.value })} />
          <button className="x" type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove">×</button>
        </div>
      ))}
      <button type="button" className="btn btn-white btn-sm" onClick={() => onChange([...list, { [keyName]: '', price: 0, ...(valueKey === 'kg' ? { kg: 1 } : {}) }])}><Icon name="plus" size={16} /> Add</button>
    </div>
  )
}

function ProductEditor({ product, onClose }) {
  const { db, reload, toast } = useAdmin()
  const [p, setP] = useState(() => product || { name: '', category_id: db.categories[0]?.id, description: '', images: [], base_price: 500, unit_label: 'cake', weights: [], flavours: [], fillings: [], frostings: [], designs: [], egg_options: [],
    occasions: [], lead_time_hours: null, max_per_day: null, max_qty: 10, is_available: true, is_active: true, is_featured: false, customizable: true, allow_message: true, sort: db.products.length + 1 })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }))
  async function upload(files) {
    setBusy(true)
    try { for (const f of files) { const url = await api.uploadProductImage(await compressImage(f, 1400, 0.85)); setP((x) => ({ ...x, images: [...x.images, url] })) } }
    catch (e) { toast('Upload failed: ' + cleanError(e), true) } finally { setBusy(false) }
  }
  async function save() {
    if (!p.name.trim()) return toast('Please add a name', true)
    for (const [k] of LISTS) if ((p[k] || []).some((o) => !(o.label || o.name)?.trim())) return toast('Every option needs a name', true)
    setBusy(true)
    const { id, created_at, updated_at, ...row } = p
    row.lead_time_hours = row.lead_time_hours ? +row.lead_time_hours : null
    row.max_per_day = row.max_per_day ? +row.max_per_day : null
    row.base_price = +row.base_price || 0
    row.cost_percent = row.cost_percent === '' || row.cost_percent == null ? null : +row.cost_percent
    row.available_from = row.available_from || null
    row.available_to = row.available_to || null
    try { id ? await api.update('products', id, row) : await api.insert('products', row); await reload(); toast('Saved'); onClose() }
    catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  return (
    <Modal title={product ? `Edit ${product.name}` : 'New menu item'} onClose={onClose} wide>
      <div className="cards-2">
        <div className="stack">
          <Field label="Name"><input className="input" value={p.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Category"><select className="input" value={p.category_id || ''} onChange={(e) => set('category_id')(e.target.value)}>{db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Sold as" hint="cake, box of 6…"><input className="input" value={p.unit_label || ''} onChange={(e) => set('unit_label')(e.target.value)} /></Field>
          </div>
          <Field label="Description"><textarea className="input" value={p.description || ''} onChange={(e) => set('description')(e.target.value)} /></Field>
          <div>
            <div className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Photos (first one is the main photo)</div>
            <div className="upload-prev">
              {p.images.map((src, i) => (
                <div className="u" key={src.slice(-40) + i}><img src={src} alt="" /><button onClick={() => set('images')(p.images.filter((_, j) => j !== i))} aria-label="Remove">×</button>
                  {i > 0 && <button style={{ left: 4, right: 'auto' }} onClick={() => set('images')([src, ...p.images.filter((_, j) => j !== i)])} title="Make main">★</button>}</div>
              ))}
              <label className="u dropzone" style={{ display: 'grid', placeItems: 'center', padding: 0 }}><input type="file" hidden multiple accept={ACCEPT_IMG} onChange={(e) => upload([...e.target.files])} /><Icon name="plus" /></label>
            </div>
          </div>
          <div className="grid-2">
            <Field label="Base price ₹" hint="used when there are no sizes"><input type="number" className="input" value={p.base_price} onChange={(e) => set('base_price')(e.target.value)} /></Field>
            <Field label="Minimum order quantity"><input type="number" className="input" value={p.min_qty || 1} onChange={(e) => set('min_qty')(Math.max(1, +e.target.value))} /></Field>
            <Field label="Max quantity per order"><input type="number" className="input" value={p.max_qty} onChange={(e) => set('max_qty')(+e.target.value)} /></Field>
            <Field label="Ingredient + packing cost %" hint="for profit insights"><input type="number" className="input" min={0} max={100} value={p.cost_percent ?? ''} placeholder="e.g. 40" onChange={(e) => set('cost_percent')(e.target.value === '' ? null : +e.target.value)} /></Field>
            <Field label="Lead time (hours)" hint="blank = default"><input type="number" className="input" value={p.lead_time_hours ?? ''} onChange={(e) => set('lead_time_hours')(e.target.value)} /></Field>
            <Field label="Max orders per day" hint="blank = no limit"><input type="number" className="input" value={p.max_per_day ?? ''} onChange={(e) => set('max_per_day')(e.target.value)} /></Field>
            <Field label="Seasonal from"><input type="date" className="input" value={p.available_from || ''} onChange={(e) => set('available_from')(e.target.value)} /></Field>
            <Field label="Seasonal until"><input type="date" className="input" value={p.available_to || ''} onChange={(e) => set('available_to')(e.target.value)} /></Field>
          </div>
          <Field label="Badge text" hint="e.g. Seasonal, New"><input className="input" value={p.seasonal_note || ''} onChange={(e) => set('seasonal_note')(e.target.value)} /></Field>
          <Field label="Allergens"><input className="input" value={p.allergens || ''} onChange={(e) => set('allergens')(e.target.value)} /></Field>
          <Field label="Dietary"><input className="input" value={p.dietary || ''} onChange={(e) => set('dietary')(e.target.value)} placeholder="Eggless available" /></Field>
          <Field label="Occasions" hint="comma separated"><input className="input" value={(p.occasions || []).join(', ')} onChange={(e) => set('occasions')(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></Field>
          <div className="stack">
            <Switch checked={p.is_active} onChange={set('is_active')} label="Show on the menu" />
            <Switch checked={p.is_available} onChange={set('is_available')} label="Available to order (off = “sold out”)" />
            <Switch checked={p.is_featured} onChange={set('is_featured')} label="Featured on the home page" />
            <Switch checked={p.courier_ok} onChange={set('courier_ok')} label="Can be sent by courier" />
            <Switch checked={!!p.enquiry_only} onChange={set('enquiry_only')} label="Message to order (no cart — customers WhatsApp you; for hampers, seasonal, price on request)" />
            <Switch checked={p.allow_message} onChange={set('allow_message')} label="Allow message, add-ons & personalisation" />
            <Switch checked={p.customizable} onChange={set('customizable')} label="Allow custom design requests & reference photos" />
          </div>
        </div>
        <div className="stack">
          <div className="card flat stack">
            <Field label="How is it priced?">
              <select className="input" value={p.pricing_mode || 'fixed'} onChange={(e) => set('pricing_mode')(e.target.value)}>
                <option value="fixed">Fixed price per size / piece</option>
                <option value="per_kg">Cake: flavour rate per kg × size in kg</option>
              </select>
            </Field>
            {p.pricing_mode === 'per_kg' && <p className="tiny muted" style={{ margin: 0 }}>Set each flavour’s price per kg, and each size’s weight in kg (½ kg = 0.5). Example: Vanilla ₹1600/kg × 0.5 = ₹800.</p>}
          </div>
          {LISTS.map(([k, label, keyName, priceLabel]) => {
            const perKg = p.pricing_mode === 'per_kg'
            const lab = perKg && k === 'flavours' ? 'Price per kg ₹' : perKg && k === 'weights' ? 'Weight in kg' : priceLabel + ' ₹'
            return (
              <div className="card flat" key={k}>
                <div className="row between"><b className="small">{label}</b><span className="tiny muted">{lab}</span></div>
                <OptionList value={p[k]} keyName={keyName} priceLabel={lab} valueKey={perKg && k === 'weights' ? 'kg' : 'price'} onChange={set(k)} />
              </div>
            )
          })}
          <div className="notice info small">Customers see “from {inr(startingPrice({ ...p, base_price: +p.base_price || 0 }))}”. Changing prices never alters orders already placed.</div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  )
}

function SimpleTable({ table, rows, fields, newRow }) {
  const { reload, toast } = useAdmin()
  const [edit, setEdit] = useState({})
  const save = async (r) => {
    const key = r.id || 'new'
    try {
      const { id, created_at, ...row } = { ...r, ...(edit[key] || {}) }
      if (table === 'categories' && !row.slug) row.slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (!String(row[fields[0][0]] ?? '').trim()) return toast(`Please fill in ${fields[0][1]}`, true)
      id ? await api.update(table, id, row) : await api.insert(table, row)
      setEdit((e) => ({ ...e, [key]: undefined })); await reload(); toast('Saved')
    } catch (e) { toast(cleanError(e), true) }
  }
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{fields.map((f) => <th key={f[0]}>{f[1]}</th>)}<th /></tr></thead>
        <tbody>
          {[...rows, newRow].map((r, idx) => {
            const v = { ...r, ...(edit[r.id || 'new'] || {}) }
            const ch = (k, val) => setEdit((e) => ({ ...e, [r.id || 'new']: { ...(e[r.id || 'new'] || {}), [k]: val } }))
            return (
              <tr key={r.id || 'new'}>
                {fields.map(([k, , type]) => (
                  <td key={k}>{type === 'bool' ? <Switch checked={v[k]} onChange={(x) => ch(k, x)} /> :
                    type === 'days' ? <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }} title="Days this slot is offered (none selected = every day)">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => { const on = !v[k]?.length || v[k].includes(i); return <button key={i} type="button" className={'chip' + (on ? ' on' : '')} style={{ padding: '4px 7px', minHeight: 0, fontSize: '.75rem' }} onClick={() => { const cur = v[k]?.length ? v[k] : [0, 1, 2, 3, 4, 5, 6]; const next = on ? cur.filter((x) => x !== i) : [...cur, i].sort(); ch(k, next.length === 7 ? null : next) }}>{d}</button> })}</div> :
                    <input className="input" style={{ minHeight: 38 }} type={type || 'text'} value={v[k] ?? ''} onChange={(e) => ch(k, type === 'number' ? +e.target.value : e.target.value)} placeholder={idx === rows.length ? 'Add new…' : ''} />}</td>
                ))}
                <td className="row" style={{ gap: 4 }}>
                  <button className="btn btn-soft btn-sm" disabled={!edit[r.id || 'new']} onClick={() => save(r)}>{r.id ? 'Save' : 'Add'}</button>
                  {r.id && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Delete?')) { try { await api.remove(table, r.id); reload() } catch (e) { toast(cleanError(e), true) } } }}><Icon name="trash" size={14} /></button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BulkPrices() {
  const { db, reload, toast } = useAdmin()
  const [cat, setCat] = useState('all')
  const [mode, setMode] = useState('percent')
  const [val, setVal] = useState(10)
  const [round, setRound] = useState(10)
  const [extras, setExtras] = useState(false)
  const [busy, setBusy] = useState(false)
  const adj = (n) => { const x = mode === 'percent' ? n * (1 + val / 100) : n + +val; return Math.max(0, Math.round(x / (round || 1)) * (round || 1)) }
  const targets = db.products.filter((p) => cat === 'all' || p.category_id === cat)
  const preview = targets.map((p) => {
    const next = p.pricing_mode === 'per_kg'
      ? { base_price: adj(p.base_price), flavours: (p.flavours || []).map((o) => ({ ...o, price: adj(o.price) })) }
      : { base_price: adj(p.base_price), weights: (p.weights || []).map((w) => ({ ...w, price: adj(w.price) })) }
    if (extras) for (const k of (p.pricing_mode === 'per_kg' ? ['fillings', 'frostings', 'designs', 'egg_options'] : ['flavours', 'fillings', 'frostings', 'designs', 'egg_options'])) next[k] = (p[k] || []).map((o) => ({ ...o, price: o.price ? adj(o.price) : 0 }))
    return { p, next, from: startingPrice(p), to: startingPrice({ ...p, ...next }) }
  })
  async function apply() {
    if (!confirm(`Update prices for ${preview.length} items? Existing orders keep their agreed prices.`)) return
    setBusy(true)
    try { for (const x of preview) await api.update('products', x.p.id, x.next); await reload(); toast('Prices updated') } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  return (
    <div className="card stack">
      <div className="grid-2">
        <Field label="Which items"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">Whole menu</option>{db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Change by"><div className="row"><input type="number" className="input" value={val} onChange={(e) => setVal(+e.target.value)} /><select className="input" value={mode} onChange={(e) => setMode(e.target.value)}><option value="percent">%</option><option value="fixed">₹</option></select></div></Field>
        <Field label="Round to nearest ₹"><select className="input" value={round} onChange={(e) => setRound(+e.target.value)}><option value={1}>1</option><option value={5}>5</option><option value={10}>10</option><option value={50}>50</option></select></Field>
        <div style={{ alignSelf: 'end' }}><Switch checked={extras} onChange={setExtras} label="Also change option extras" /></div>
      </div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Item</th><th>Starting price now</th><th>After</th></tr></thead>
        <tbody>{preview.map((x) => <tr key={x.p.id}><td>{x.p.name}</td><td>{inr(x.from)}</td><td><b>{inr(x.to)}</b></td></tr>)}</tbody></table></div>
      <button className="btn btn-primary" disabled={busy || !val} onClick={apply}>{busy ? 'Updating…' : `Apply to ${preview.length} items`}</button>
    </div>
  )
}

export default function MenuAdmin() {
  const { db, reload, toast } = useAdmin()
  const [tab, setTab] = useState('products')
  const [edit, setEdit] = useState(null)
  const [cat, setCat] = useState('all')
  const list = useMemo(() => db.products.filter((p) => cat === 'all' || p.category_id === cat), [db.products, cat])
  const quick = async (p, patch) => { try { await api.update('products', p.id, patch); reload() } catch (e) { toast(cleanError(e), true) } }
  return (
    <>
      <PageHead title="Menu & pricing" sub="Changes appear in the shop immediately.">
        {tab === 'products' && <button className="btn btn-primary btn-sm" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> New item</button>}
      </PageHead>
      <div className="pill-tabs" style={{ marginBottom: 14 }}>
        {[['products', 'Items'], ['categories', 'Categories'], ['addons', 'Add-ons'], ['bulk', 'Bulk price update']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'products' && (
        <>
          <div className="toolbar"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All categories</option>{db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th /><th>Item</th><th>From</th><th>Cost %</th><th>On menu</th><th>Available</th><th>Featured</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td style={{ width: 56 }}><div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden' }}><ProductImage product={p} /></div></td>
                    <td><b>{p.name}</b><div className="tiny muted">{db.categories.find((c) => c.id === p.category_id)?.name} · {p.unit_label}{p.lead_time_hours ? ` · ${p.lead_time_hours}h notice` : ''}</div>{!p.images?.length && <Badge tone="butter">needs photo</Badge>}</td>
                    <td>{p.unit_label === 'each' ? `${inr(p.base_price)} each` : inr(startingPrice(p))}{p.min_qty > 1 && <div className="tiny muted">min {p.min_qty}</div>}</td>
                    <td>{p.cost_percent != null ? `${p.cost_percent}%` : <span className="tiny muted">—</span>}</td>
                    <td><Switch checked={p.is_active} onChange={(v) => quick(p, { is_active: v })} /></td>
                    <td><Switch checked={p.is_available} onChange={(v) => quick(p, { is_available: v })} /></td>
                    <td><Switch checked={p.is_featured} onChange={(v) => quick(p, { is_featured: v })} /></td>
                    <td><button className="btn btn-soft btn-sm" onClick={() => setEdit(p)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'categories' && <SimpleTable table="categories" rows={db.categories} newRow={{ name: '', slug: '', description: '', sort: db.categories.length + 1, visible: true }}
        fields={[['name', 'Name'], ['slug', 'Link name'], ['description', 'Description'], ['sort', 'Order', 'number'], ['visible', 'Visible', 'bool']]} />}
      {tab === 'addons' && <SimpleTable table="addons" rows={db.addons} newRow={{ name: '', price: 0, sort: db.addons.length + 1, active: true }}
        fields={[['name', 'Add-on'], ['price', 'Price ₹', 'number'], ['sort', 'Order', 'number'], ['active', 'Active', 'bool']]} />}
      {tab === 'bulk' && <BulkPrices />}
      {edit && <ProductEditor product={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}
export { SimpleTable }
