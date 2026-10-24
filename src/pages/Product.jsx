import React, { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { api } from '../api/index.js'
import { priceItem } from '../lib/pricing.js'
import { inr, cleanError, leadLabel } from '../lib/format.js'
import { Icon, ProductImage, Badge, Empty, compressImage, ACCEPT_IMG, MAX_UPLOAD_MB, WaIcon } from '../components/ui.jsx'
import { waLink, telLink, callsToday, NO_CALL_NOTE } from '../lib/contact.js'

function Options({ n, title, list, value, onChange, hint, priceMode = 'extra', priceOf, suffix = '' }) {
  if (!list?.length) return null
  return (
    <div className="opt-block">
      <div className="opt-head"><span className="n">{n}</span><h3>{title}</h3>{hint && <span className="tiny muted">{hint}</span>}</div>
      <div className="chips" role="radiogroup" aria-label={title}>
        {list.map((o) => {
          const label = o.label || o.name
          const price = priceOf ? priceOf(o) : +o.price || 0
          return (
            <button type="button" key={label} role="radio" aria-checked={value === label} className={'chip' + (value === label ? ' on' : '')} onClick={() => onChange(label)}>
              {label}
              {priceMode === 'full' ? <small>{inr(price)}{suffix}</small> : price > 0 ? <small>+{inr(price)}</small> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Product() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { data, addToCart, updateLine, cart, toast, settings } = useStore()
  const p = data.products.find((x) => x.id === id)
  const editing = cart.find((l) => l.key === sp.get('edit'))
  const first = (l) => (l?.length ? l[0].label || l[0].name : null)
  const [sel, setSel] = useState(() => editing ? { ...editing } : p ? {
    product_id: p.id, qty: p.min_qty || 1, weight: first(p.weights), flavour: first(p.flavours), filling: first(p.fillings), frosting: first(p.frostings),
    design: first(p.designs), egg: first(p.egg_options), addons: [], reference_images: [], ref_previews: [],
    custom_request: !!p.custom_default || /custom/i.test(p.name), message: '', name_on_cake: '', age: '', colours: '', theme: '', instructions: '', custom_description: '',
  } : {})
  const [img, setImg] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [showBreak, setShowBreak] = useState(false)
  const set = (k) => (v) => setSel((s) => ({ ...s, [k]: v }))

  const priced = useMemo(() => {
    try { return { line: priceItem(p, sel, data.addons) } } catch (e) { return { err: cleanError(e) } }
  }, [p, sel, data.addons])

  if (!p || !p.is_active) return <Empty title="This treat isn’t on the menu right now"><Link to="/menu" className="btn btn-soft">Back to menu</Link></Empty>
  const isCakeLike = p.allow_message !== false
  const addons = data.addons.filter((a) => a.active !== false)
  const toggleAddon = (a) => setSel((s) => {
    const has = s.addons.find((x) => x.id === a.id)
    return { ...s, addons: has ? s.addons.filter((x) => x.id !== a.id) : [...s.addons, { id: a.id, qty: 1 }] }
  })

  async function onFiles(files) {
    const list = [...files].slice(0, 3 - sel.reference_images.length)
    if (!list.length) return toast('You can attach up to 3 pictures', true)
    setUploading(true)
    try {
      for (const f of list) {
        if (!/^image\//.test(f.type)) { toast('Please choose a photo (JPG, PNG, WEBP or HEIC)', true); continue }
        if (f.size > 15 * 1024 * 1024) { toast('That photo is too large (max 15 MB before compression)', true); continue }
        const small = await compressImage(f)
        if (small.size > MAX_UPLOAD_MB * 1024 * 1024) { toast(`Photo must be under ${MAX_UPLOAD_MB} MB`, true); continue }
        const path = await api.uploadFile('ref', small)
        const preview = URL.createObjectURL(small)
        setSel((s) => ({ ...s, reference_images: [...s.reference_images, path], ref_previews: [...(s.ref_previews || []), preview] }))
      }
    } catch (e) { toast('Upload failed: ' + cleanError(e), true) } finally { setUploading(false) }
  }
  const removeRef = (i) => setSel((s) => ({ ...s, reference_images: s.reference_images.filter((_, j) => j !== i), ref_previews: (s.ref_previews || []).filter((_, j) => j !== i) }))

  function add(goCheckout) {
    if (priced.err) return toast(priced.err, true)
    if (sel.custom_request && !sel.custom_description?.trim() && !sel.reference_images.length) return toast('Please describe your custom design or attach a reference picture', true)
    if (editing) { updateLine(editing.key, sel); toast('Cart updated') } else { addToCart(sel); toast(`${p.name} added to your cart`) }
    nav(goCheckout ? '/checkout' : '/cart')
  }

  let step = 0
  const N = () => ++step
  const cat = data.categories.find((c) => c.id === p.category_id)
  const lead = Math.max(settings.lead_time_hours || 48, p.lead_time_hours || 0)

  return (
    <div className="wrap" style={{ paddingBottom: 24 }}>
      <div className="pd">
        <div className="gallery">
          <div className="tiny muted" style={{ marginBottom: 8 }}><Link to="/menu">Menu</Link> {cat && <>/ <Link to={`/menu/${cat.slug}`}>{cat.name}</Link></>}</div>
          <div className="main"><ProductImage product={p} index={img} /></div>
          {p.images?.length > 1 && (
            <div className="thumbs">{p.images.map((src, i) => <button key={src} className={i === img ? 'on' : ''} onClick={() => setImg(i)} aria-label={`Photo ${i + 1}`}><img src={src} alt="" /></button>)}</div>
          )}
        </div>
        <div>
          <h1 style={{ fontSize: 'clamp(2rem,6vw,3rem)' }}>{p.name}</h1>
          <div className="row wrap" style={{ margin: '10px 0', gap: 6 }}>
            {!p.is_available && <Badge tone="grey">Currently unavailable</Badge>}
            {(p.egg_options || []).some((e) => /eggless/i.test(e.name)) && <Badge tone="lime">Eggless available</Badge>}
            <Badge tone="sky"><Icon name="clock" size={13} /> Order {leadLabel(lead)}</Badge>
            {p.unit_label && p.unit_label !== 'cake' && <Badge tone="butter">{p.unit_label}{p.min_qty > 1 ? ` · min ${p.min_qty}` : ''}</Badge>}
            {p.courier_ok && <Badge tone="mint">Courier available</Badge>}
          </div>
          <p className="muted">{p.description}</p>
          {(p.allergens || p.dietary) && <p className="tiny muted"><b>Allergens & diet:</b> {[p.dietary, p.allergens].filter(Boolean).join(' · ')}</p>}

          {p.pricing_mode === 'per_kg' ? (
            <>
              <Options n={(p.flavours?.length && N()) || 0} title="Choose flavour" hint="price per kg" list={p.flavours} value={sel.flavour} onChange={set('flavour')} priceMode="full" suffix="/kg" />
              <Options n={(p.weights?.length && N()) || 0} title="Choose size" list={p.weights} value={sel.weight} onChange={set('weight')} priceMode="full"
                priceOf={(w) => Math.round(((p.flavours || []).find((f) => f.name === sel.flavour)?.price || 0) * (+w.kg || 1))} />
              <p className="tiny muted" style={{ margin: '-6px 0 8px' }}>Half kg starts at ₹800 (it’s too small a quantity to enjoy our signature taste ;) ) — {settings.whatsapp ? <a href={`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`Hi! I'd like a half kg ${p.name}.`)}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>ask on WhatsApp</a> : 'ask on WhatsApp'} if you’d still like one.</p>
            </>
          ) : (
            <>
              <Options n={(p.weights?.length && N()) || 0} title="Choose size" list={p.weights} value={sel.weight} onChange={set('weight')} priceMode="full" />
              <Options n={(p.flavours?.length && N()) || 0} title="Choose flavour" list={p.flavours} value={sel.flavour} onChange={set('flavour')} />
            </>
          )}
          <Options n={(p.fillings?.length && N()) || 0} title="Choose filling" list={p.fillings} value={sel.filling} onChange={set('filling')} />
          <Options n={(p.frostings?.length && N()) || 0} title="Choose frosting" list={p.frostings} value={sel.frosting} onChange={set('frosting')} />
          <Options n={(p.designs?.length && N()) || 0} title="Choose design" list={p.designs} value={sel.design} onChange={set('design')} />
          <Options n={(p.egg_options?.length && N()) || 0} title="Egg or eggless" list={p.egg_options} value={sel.egg} onChange={set('egg')} />

          {isCakeLike && (
            <div className="opt-block">
              <div className="opt-head"><span className="n">{N()}</span><h3>Personalise it</h3><span className="tiny muted">optional</span></div>
              <div className="grid-2">
                <label className="field"><span>Message on the cake</span><input className="input" maxLength={60} value={sel.message} onChange={(e) => set('message')(e.target.value)} placeholder="Happy Birthday Anu!" /></label>
                <label className="field"><span>Name on the cake</span><input className="input" maxLength={40} value={sel.name_on_cake} onChange={(e) => set('name_on_cake')(e.target.value)} /></label>
                <label className="field"><span>Age / anniversary year</span><input className="input" maxLength={20} value={sel.age} onChange={(e) => set('age')(e.target.value)} placeholder="e.g. 5 or 25th" /></label>
                <label className="field"><span>Colour preference</span><input className="input" maxLength={80} value={sel.colours} onChange={(e) => set('colours')(e.target.value)} placeholder="Navy & white, pastel pink…" /></label>
              </div>
              <label className="field" style={{ marginTop: 12 }}><span>Theme or reference description</span><input className="input" maxLength={200} value={sel.theme} onChange={(e) => set('theme')(e.target.value)} placeholder="Garden party, football, minimal gold…" /></label>
              <label className="field" style={{ marginTop: 12 }}><span>Special instructions</span><textarea className="input" maxLength={500} value={sel.instructions} onChange={(e) => set('instructions')(e.target.value)} placeholder="Less sweet, no nuts on top, extra candles…" /></label>
            </div>
          )}

          {isCakeLike && p.customizable !== false && (
            <div className="opt-block">
              <div className="opt-head"><span className="n">{N()}</span><h3>Inspiration picture</h3><span className="tiny muted">optional · up to 3</span></div>
              <label className="check" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={!!sel.custom_request} onChange={(e) => set('custom_request')(e.target.checked)} />
                <span><b>I would like a completely customised cake design.</b></span>
              </label>
              {sel.custom_request && (
                <>
                  <label className="field" style={{ marginBottom: 12 }}><span>Describe your dream cake</span>
                    <textarea className="input" maxLength={1500} value={sel.custom_description} onChange={(e) => set('custom_description')(e.target.value)} placeholder="Two-tier, white with gold leaf, fresh flowers cascading down one side…" /></label>
                  <div className="notice warn" style={{ marginBottom: 12 }}><Icon name="sparkle" size={18} /><div>Custom designs are <b>reviewed and quoted by the baker</b> before you pay. The price shown is a starting estimate — your order is confirmed only after we approve the design and you accept the final price.</div></div>
                  {(settings.whatsapp || settings.phone) && (
                    <div className="talk-baker">
                      <div><b>Want to discuss your design first?</b><div className="tiny muted">Send your idea or photos to the baker directly.</div></div>
                      <div className="row wrap" style={{ gap: 8 }}>
                        {settings.whatsapp && <a className="btn btn-wa btn-sm" target="_blank" rel="noreferrer"
                          href={waLink(settings.whatsapp, `Hi Pastel Treats! I'd like to discuss a custom cake design (${p.name}${sel.weight ? `, ${sel.weight}` : ''}).${sel.custom_description?.trim() ? `\nMy idea: ${sel.custom_description.trim().slice(0, 500)}` : ''}\nI'll share reference pictures here.`)}>
                          <WaIcon size={18} /> Message the baker</a>}
                        {settings.phone && (callsToday(settings)
                          ? <a className="btn btn-white btn-sm" href={telLink(settings.phone)}><Icon name="phone" size={16} /> Call the baker</a>
                          : <span className="tiny muted">{NO_CALL_NOTE}</span>)}
                      </div>
                    </div>
                  )}
                </>
              )}
              <label className="dropzone">
                <input type="file" accept={ACCEPT_IMG} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
                <Icon name="upload" /> <div>{uploading ? 'Uploading…' : 'Tap to add a reference photo'}</div>
                <div className="tiny muted">JPG, PNG, WEBP or HEIC · max {MAX_UPLOAD_MB} MB each</div>
              </label>
              {!!sel.reference_images?.length && (
                <div className="upload-prev" style={{ marginTop: 10 }}>
                  {sel.reference_images.map((path, i) => (
                    <div className="u" key={path.slice(-40) + i}>
                      {sel.ref_previews?.[i] || path.startsWith('data:') ? <img src={sel.ref_previews?.[i] || path} alt={`Reference ${i + 1}`} /> : <div className="art tiny" style={{ background: 'var(--mint-soft)' }}>Photo {i + 1}</div>}
                      <button onClick={() => removeRef(i)} aria-label="Remove picture">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isCakeLike && addons.length > 0 && (
            <div className="opt-block">
              <div className="opt-head"><span className="n">{N()}</span><h3>Add-ons</h3></div>
              <div className="chips">
                {addons.map((a) => {
                  const on = sel.addons.some((x) => x.id === a.id)
                  return <button type="button" key={a.id} className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggleAddon(a)}>{on && <Icon name="check" size={16} />}{a.name}<small>+{inr(a.price)}</small></button>
                })}
              </div>
            </div>
          )}

          <div className="opt-block">
            <div className="row between">
              <div><h3>Quantity</h3>{p.min_qty > 1 && <div className="tiny muted">Minimum {p.min_qty} · {inr(priced.line?.unit_price ?? p.base_price)} each</div>}</div>
              <div className="qty">
                <button onClick={() => set('qty')(Math.max(p.min_qty || 1, sel.qty - 1))} aria-label="Less">−</button>
                <span>{sel.qty}</span>
                <button onClick={() => set('qty')(Math.min(p.max_qty || 50, sel.qty + 1))} aria-label="More">+</button>
              </div>
            </div>
          </div>

          {showBreak && priced.line && (
            <div className="card flat breakdown fade-in" style={{ marginTop: 10 }}>
              <div className="ln"><span>{p.weights?.length ? `Base (${priced.line.weight})` : 'Base price'}</span><span>{inr(priced.line.weight_price)}</span></div>
              {priced.line.option_charges > 0 && <div className="ln"><span>Customisation (flavour, design…)</span><span>+{inr(priced.line.option_charges)}</span></div>}
              {sel.qty > 1 && <div className="ln"><span>× {sel.qty}</span><span>{inr(priced.line.unit_price * sel.qty)}</span></div>}
              {priced.line.addons.map((a) => <div className="ln" key={a.id}><span>{a.name}</span><span>+{inr(a.price * a.qty)}</span></div>)}
              <div className="ln total"><span>Cake total</span><span>{inr(priced.line.line_total)}</span></div>
              <div className="tiny muted">Delivery charges, if any, are added at checkout.</div>
            </div>
          )}

          <div className="price-bar">
            <button className="grow" style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => setShowBreak((v) => !v)}>
              <div className="tiny muted">{sel.custom_request ? 'Estimated total' : 'Total'} · <u>{showBreak ? 'hide' : 'see'} breakdown</u></div>
              <div className="total">{priced.line ? inr(priced.line.line_total) : '—'}</div>
            </button>
            <button className="btn btn-primary" disabled={!p.is_available || !!priced.err || uploading} onClick={() => add(false)}>
              {editing ? 'Update cart' : 'Add to cart'}
            </button>
          </div>
          {priced.err && <p className="err-text" style={{ marginTop: 8 }}>{priced.err}</p>}
        </div>
      </div>
    </div>
  )
}
