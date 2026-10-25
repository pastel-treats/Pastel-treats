import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { api, isDemo } from '../api/index.js'
import { quote as quoteCalc, findZone } from '../lib/pricing.js'
import { inr, cleanError, itemSummary, OCCASIONS } from '../lib/format.js'
import { normalizePhone } from '../lib/contact.js'
import { fmtDate, todayISO, addDaysISO } from '../lib/dates.js'
import Calendar from '../components/Calendar.jsx'
import PhoneInput, { validPhone } from '../components/PhoneInput.jsx'
import PlaceSelect from '../components/PlaceSelect.jsx'
import { DEFAULT_STATE } from '../data/places.js'
import { Empty, Field, Icon, ProductImage, Modal, compressImage, ACCEPT_IMG } from '../components/ui.jsx'
import UpiPayBox from '../components/UpiPayBox.jsx'
import { PolicyText, LocationCard } from './Info.jsx'

const DRAFT = 'pt-checkout-draft'
const loadDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null') } catch { return null } }

export default function Checkout() {
  const { cart, data, settings: s, toast, clearCart, rememberOrder } = useStore()
  const nav = useNavigate()
  const tz = s.timezone || 'Asia/Kolkata'
  const [f, setF] = useState(() => ({
    fulfilment: 'pickup', date: null, slotId: null, slotLabel: null, alt_date: '', alt_slot_label: '',
    name: '', phone: '', sameWa: true, whatsapp: '', email: '', state: DEFAULT_STATE, city: '',
    address: { line: '', area: '', city: 'Dindigul', pincode: '', landmark: '', instructions: '' },
    occasion: '', occasion_date: '', occasion_person: '', remember_occasion: false, marketing_consent: false,
    notes: '', payment_method: 'upi', accepted_policies: false, request_out_of_zone: false,
    ...(loadDraft() || {}),
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [payStep, setPayStep] = useState(false) // UPI: pay first, then the order is placed
  const [utr, setUtr] = useState('')
  const [proof, setProof] = useState(null)
  const idem = useRef(sessionStorage.getItem('pt-idem') || crypto.randomUUID())
  useEffect(() => { try { sessionStorage.setItem('pt-idem', idem.current) } catch { /* */ } }, [])
  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify({ ...f, accepted_policies: false })) } catch { /* */ } }, [f])

  // returning customer on this phone → prefill name & number (stored only on this device)
  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem('pt-last-details') || 'null')
      if (last) setF((x) => ({ ...x, name: x.name || last.name || '', phone: x.phone || last.phone || '', email: x.email || last.email || '', state: x.city ? x.state : last.state || x.state, city: x.city || last.city || '' }))
    } catch { /* private mode */ }
  }, [])

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  const setAddr = (k) => (v) => setF((x) => ({ ...x, address: { ...x.address, [k]: v } }))
  const productIds = useMemo(() => [...new Set(cart.map((l) => l.product_id))], [cart])

  const q = useMemo(() => {
    try { return quoteCalc({ items: cart, fulfilment: f.fulfilment, address: f.address }, { products: data.products, addons: data.addons, zones: data.zones, settings: s }) }
    catch (e) { return { err: cleanError(e) } }
  }, [cart, f.fulfilment, f.address, data, s])

  if (!cart.length) return <div className="wrap"><Empty title="Nothing to check out">Your cart is empty. <div style={{ marginTop: 14 }}><Link to="/menu" className="btn btn-primary">Browse the menu</Link></div></Empty></div>

  const zone = f.fulfilment === 'delivery' ? findZone(data.zones, f.address.pincode) : null
  const shipping = f.fulfilment !== 'pickup'
  const courierable = cart.every((l) => data.products.find((p) => p.id === l.product_id)?.courier_ok)
  const modeLabel = f.fulfilment === 'pickup' ? 'Pickup' : f.fulfilment === 'courier' ? 'Courier dispatch' : 'Delivery'
  const pinTyped = /^\d{6}$/.test(f.address.pincode.trim())
  const outOfZone = f.fulfilment === 'delivery' && pinTyped && !zone
  const isCustom = cart.some((l) => l.custom_request)
  const cashAllowed = s.cash_for !== 'balance' && (f.fulfilment === 'pickup' ? s.cash_pickup : s.cash_delivery)
  const cashBalanceOk = f.fulfilment === 'pickup' ? s.cash_pickup : s.cash_delivery
  const methods = [
    { id: 'upi', t: 'UPI / Google Pay', d: 'Scan the QR or tap to pay the advance' },
    ...(s.gateway_enabled ? [{ id: 'gateway', t: 'Pay online', d: 'UPI, cards & netbanking via secure gateway' }] : []),
    ...(cashAllowed ? [{ id: 'cash', t: 'Cash', d: f.fulfilment === 'pickup' ? 'Pay in cash at pickup' : 'Pay in cash' }] : []),
  ]
  // UPI orders with a known price: show the QR and take the payment BEFORE the order is created.
  // (Custom designs and courier wait for the baker's price, so they still pay after.)
  const payFirst = f.payment_method === 'upi' && !isCustom && f.fulfilment !== 'courier' && !outOfZone && !q.err && q.advance_due > 0 && !!(s.upi_id || s.upi_qr_url)
  if (!methods.find((m) => m.id === f.payment_method) && f.payment_method !== 'upi') setTimeout(() => set('payment_method')('upi'))

  function validate() {
    const e = {}
    if (!f.date || !f.slotId) e.slot = 'Please choose a date and time slot'
    if (!f.name.trim()) e.name = 'Please enter your name'
    if (!validPhone(f.phone)) e.phone = 'Please enter a valid mobile number'
    if (!f.state || !f.city.trim()) e.city = 'Please choose where you are ordering from'
    if (!f.sameWa && f.whatsapp && !validPhone(f.whatsapp)) e.whatsapp = 'Please check this number'
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Please check your e-mail'
    if (f.fulfilment === 'courier' && !courierable) e.line = 'Some items can’t be couriered — please choose self pickup'
    if (shipping) {
      if (!f.address.line.trim()) e.line = 'Please enter the house / street'
      if (!pinTyped) e.pincode = 'Please enter a 6-digit PIN code'
      else if (outOfZone && !f.request_out_of_zone) e.pincode = 'We don’t deliver here yet — choose pickup or request approval below'
    }
    if (f.remember_occasion && !f.occasion_date) e.occasion_date = 'Add the date so we can remind you'
    if (!f.accepted_policies) e.policies = 'Please read and accept the ordering policy'
    setErrors(e)
    if (Object.keys(e).length) {
      toast(Object.values(e)[0], true)
      const first = document.querySelector('[data-err="' + Object.keys(e)[0] + '"]')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return !Object.keys(e).length
  }

  async function submit() {
    if (busy || !validate()) return
    if (payFirst && !payStep) {
      setPayStep(true)
      setTimeout(() => document.getElementById('pay-now')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
      return
    }
    if (payFirst && !utr.trim() && !proof) {
      toast('After paying, enter the UPI transaction ID (UTR) or attach the payment screenshot', true)
      document.getElementById('pay-proof')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    const payload = {
      idempotency_key: idem.current,
      items: cart.map(({ key, ref_previews, ...rest }) => rest),
      fulfilment: f.fulfilment, date: f.date, slot_id: f.slotId, alt_date: f.alt_date || null, alt_slot_label: f.alt_slot_label || null,
      name: f.name.trim(), phone: f.phone, whatsapp: f.sameWa ? f.phone : f.whatsapp || f.phone, email: f.email.trim(), state: f.state, city: f.city.trim(),
      address: shipping ? f.address : null, request_out_of_zone: outOfZone && f.request_out_of_zone,
      occasion: f.occasion, occasion_date: f.occasion_date || null, occasion_person: f.occasion_person, remember_occasion: f.remember_occasion,
      marketing_consent: f.marketing_consent, notes: [f.notes, f.address.instructions && shipping ? 'Courier/delivery note: ' + f.address.instructions : ''].filter(Boolean).join('\n'),
      payment_method: f.payment_method, accepted_policies: f.accepted_policies,
    }
    try {
      const r = await api.placeOrder(payload)
      rememberOrder({ number: r.order_number, phone: normalizePhone(f.phone), at: new Date().toISOString(), status: r.status,
        items: (q.items || []).map((i) => `${i.qty > 1 ? i.qty + ' × ' : ''}${i.name}`).join(', '), total: r.total, date: f.date, fulfilment: f.fulfilment })
      if (payFirst) {
        try {
          const path = proof ? await api.uploadFile('proof', await compressImage(proof, 1200)) : null
          await api.submitProof(r.order_number, f.phone, utr.trim(), path, q.advance_due)
        } catch (pe) { toast('Order placed. Please send your payment details again on the next screen: ' + cleanError(pe), true) }
      }
      try { localStorage.setItem('pt-last-details', JSON.stringify({ name: f.name.trim(), phone: f.phone, email: f.email, state: f.state, city: f.city.trim() })) } catch { /* */ }
      clearCart()
      sessionStorage.removeItem(DRAFT)
      sessionStorage.removeItem('pt-idem')
      nav(`/order/${r.order_number}?new=1`)
    } catch (e) {
      const msg = cleanError(e)
      toast(msg, true)
      if (/SLOT_UNAVAILABLE/.test(e.message)) {
        setF((x) => ({ ...x, slotId: null, slotLabel: null })); setErrors({ slot: msg })
        if (payStep) toast('That time slot just filled up. Your payment details are kept — please pick another slot and tap the button again. Don’t pay twice.', true)
        document.querySelector('[data-err="slot"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // keep the same idempotency key so a retry after a network drop can't create a duplicate
    } finally { setBusy(false) }
  }

  const tentative = f.date && [
    ['Order submitted', fmtDate(todayISO(tz)), 'done'],
    [isCustom ? 'Baker reviews your design & sends a quote' : 'Baker reviews your order', fmtDate(todayISO(tz)), ''],
    [f.payment_method === 'cash' ? 'Baker confirms (cash on ' + (f.fulfilment === 'pickup' ? 'pickup)' : 'delivery)') : 'Advance payment verified', 'after you pay', ''],
    ['Preparation planned', fmtDate(isCustom ? addDaysISO(f.date, -1) : f.date, { weekday: true }), 'future'],
    [modeLabel, `${fmtDate(f.date, { weekday: true })}, ${f.slotLabel || ''}`, 'future'],
  ]

  return (
    <div className="wrap" style={{ paddingBottom: 30 }}>
      <h1 style={{ fontSize: '2.4rem', marginTop: 20 }}>Checkout</h1>
      <div className="co">
        <div className="stack">
          {/* 1. how */}
          <section className="card">
            <div className="card-title">1 · How will you collect it?</div>
            <div className="seg" style={{ gridTemplateColumns: s.courier_enabled || s.home_delivery_enabled ? '1fr 1fr' : '1fr' }}>
              <button type="button" className={f.fulfilment === 'pickup' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, fulfilment: 'pickup', slotId: null }))}>
                <Icon name="store" /><b>Self pickup</b><span>From our location, at your chosen time</span>
              </button>
              {s.courier_enabled && (
                <button type="button" className={f.fulfilment === 'courier' ? 'on' : ''} disabled={!courierable} style={!courierable ? { opacity: 0.5 } : null} onClick={() => setF((x) => ({ ...x, fulfilment: 'courier', slotId: null }))}>
                  <Icon name="truck" /><b>Courier</b><span>{courierable ? 'Charges extra · confirmed by us' : 'Only brownies, blondies, cookie boxes & ragi puffs'}</span>
                </button>
              )}
              {s.home_delivery_enabled && (
                <button type="button" className={f.fulfilment === 'delivery' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, fulfilment: 'delivery', slotId: null }))}>
                  <Icon name="truck" /><b>Home delivery</b><span>Charges by area</span>
                </button>
              )}
            </div>
            {f.fulfilment === 'courier' && <div className="notice info small" style={{ marginTop: 12 }}><Icon name="truck" size={18} /><div>{s.courier_note} Pick the date you’d like it dispatched.</div></div>}
            {f.fulfilment === 'pickup' ? (
              <div className="stack" style={{ marginTop: 12 }}>
                <LocationCard compact />
                {s.pickup_instructions && <p className="small muted" style={{ margin: 0 }}>{s.pickup_instructions}</p>}
              </div>
            ) : (
              <div className="stack" style={{ marginTop: 14 }}>
                <div data-err="line"><Field label="House / flat, street" error={errors.line}><input className={'input' + (errors.line ? ' err' : '')} autoComplete="street-address" value={f.address.line} onChange={(e) => setAddr('line')(e.target.value)} /></Field></div>
                <div className="grid-2">
                  <Field label="Area / locality"><input className="input" value={f.address.area} onChange={(e) => setAddr('area')(e.target.value)} /></Field>
                  <Field label="City"><input className="input" autoComplete="address-level2" value={f.address.city} onChange={(e) => setAddr('city')(e.target.value)} /></Field>
                  <div data-err="pincode"><Field label="PIN code" error={errors.pincode}><input className={'input' + (errors.pincode ? ' err' : '')} inputMode="numeric" maxLength={6} autoComplete="postal-code" value={f.address.pincode} onChange={(e) => setAddr('pincode')(e.target.value.replace(/\D/g, ''))} /></Field></div>
                  <Field label="Landmark"><input className="input" value={f.address.landmark} onChange={(e) => setAddr('landmark')(e.target.value)} /></Field>
                </div>
                <Field label={f.fulfilment === 'courier' ? 'Notes for the courier' : 'Delivery instructions'} hint="optional"><input className="input" value={f.address.instructions} onChange={(e) => setAddr('instructions')(e.target.value)} placeholder="Gate code, call on arrival…" /></Field>
                {zone && <div className="notice info small"><Icon name="check" size={18} /> We deliver to {zone.name}: {q.delivery_charge ? inr(q.delivery_charge) : 'free delivery'}{zone.free_above && q.delivery_charge ? ` (free above ${inr(zone.free_above)})` : ''}.</div>}
                {outOfZone && (
                  <div className="notice warn small"><Icon name="map" size={18} /><div>Sorry, {f.address.pincode} is outside our delivery area.
                    {s.allow_out_of_zone_requests && <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={f.request_out_of_zone} onChange={(e) => set('request_out_of_zone')(e.target.checked)} /> Send my order anyway — the baker will confirm if delivery is possible and the charge.</label>}
                  </div></div>
                )}
              </div>
            )}
          </section>

          {/* 2. when */}
          <section className="card" data-err="slot">
            <div className="card-title">2 · Choose date & time</div>
            <Calendar productIds={productIds} mode={f.fulfilment} date={f.date} slotId={f.slotId} tz={tz}
              onChange={({ date, slotId, slotLabel }) => setF((x) => ({ ...x, date, slotId, slotLabel }))} />
            {errors.slot && <p className="err-text">{errors.slot}</p>}
            <details style={{ marginTop: 14 }}>
              <summary className="small" style={{ cursor: 'pointer', color: 'var(--forest)' }}>Add an alternative date/time (optional)</summary>
              <div className="grid-2" style={{ marginTop: 10 }}>
                <Field label="Alternative date"><input type="date" className="input" min={f.date || undefined} value={f.alt_date} onChange={(e) => set('alt_date')(e.target.value)} /></Field>
                <Field label="Alternative time">
                  <select className="input" value={f.alt_slot_label} onChange={(e) => set('alt_slot_label')(e.target.value)}>
                    <option value="">Any time</option>
                    {data.slots.filter((x) => x.active !== false).map((x) => <option key={x.id}>{x.label}</option>)}
                  </select>
                </Field>
              </div>
            </details>
            {tentative && (
              <div className="card flat" style={{ marginTop: 14, background: 'var(--ivory)' }}>
                <div className="row between"><b className="small">Tentative schedule</b><span className="badge t-butter">Not yet confirmed</span></div>
                <ul className="timeline" style={{ marginTop: 10 }}>
                  {tentative.map(([t, d, c]) => <li key={t} className={c}><span><b>{t}</b><br /><span className="muted tiny">{d}</span></span></li>)}
                </ul>
                <div className="tiny muted">The final schedule is shown once the baker confirms your order.</div>
              </div>
            )}
          </section>

          {/* 3. who */}
          <section className="card">
            <div className="row between"><div className="card-title">3 · Your details</div></div>
            <div className="grid-2">
              <div data-err="name"><Field label="Full name" error={errors.name}><input className={'input' + (errors.name ? ' err' : '')} autoComplete="name" value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field></div>
              <div data-err="phone"><Field label="Mobile number" error={errors.phone}><PhoneInput invalid={!!errors.phone} value={f.phone} onChange={set('phone')} /></Field></div>
            </div>
            <div data-err="city" style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Where are you ordering from?</div>
              <PlaceSelect state={f.state} city={f.city} error={errors.city} onChange={({ state, city }) => setF((x) => ({ ...x, state, city }))} />
            </div>
            <label className="check" style={{ margin: '12px 0' }}><input type="checkbox" checked={f.sameWa} onChange={(e) => set('sameWa')(e.target.checked)} /> Use the same number for WhatsApp updates</label>
            <div className="grid-2">
              {!f.sameWa && <div data-err="whatsapp"><Field label="WhatsApp number" error={errors.whatsapp}><PhoneInput invalid={!!errors.whatsapp} value={f.whatsapp} onChange={set('whatsapp')} /></Field></div>}
              <div data-err="email"><Field label="E-mail" hint="optional" error={errors.email}><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email')(e.target.value)} /></Field></div>
            </div>
            <hr className="soft" />
            <div className="grid-2">
              <Field label="What’s the occasion?" hint="optional">
                <select className="input" value={f.occasion} onChange={(e) => set('occasion')(e.target.value)}>
                  <option value="">Craving 😋</option>{OCCASIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <div data-err="occasion_date"><Field label="Occasion date" hint="optional" error={errors.occasion_date}><input type="date" className="input" value={f.occasion_date} onChange={(e) => set('occasion_date')(e.target.value)} /></Field></div>
            </div>
            {f.occasion && (
              <div className="stack" style={{ marginTop: 10 }}>
                <Field label="Whose celebration?" hint="optional"><input className="input" value={f.occasion_person} onChange={(e) => set('occasion_person')(e.target.value)} placeholder="e.g. Anu (daughter)" /></Field>
                <label className="check"><input type="checkbox" checked={f.remember_occasion} onChange={(e) => set('remember_occasion')(e.target.checked)} /> Remember this date so you can remind me next year</label>
              </div>
            )}
            <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={f.marketing_consent} onChange={(e) => set('marketing_consent')(e.target.checked)} /> Send me occasional offers and reminders on WhatsApp (you can opt out anytime)</label>
            <Field label="Notes for the baker" hint="optional"><textarea className="input" value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
          </section>

          {/* 4. pay */}
          <section className="card">
            <div className="card-title">4 · Payment</div>
            <div className="seg" style={{ gridTemplateColumns: methods.length === 1 ? '1fr' : '1fr 1fr' }}>
              {methods.map((m) => (
                <button key={m.id} type="button" className={f.payment_method === m.id ? 'on' : ''} onClick={() => set('payment_method')(m.id)}><b>{m.t}</b><span>{m.d}</span></button>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              {f.payment_method === 'cash' ? 'The baker will confirm your order before preparing it. Cash is recorded when you pay.'
                : payFirst ? `Next, you’ll pay the ${inr(q.advance_due)} advance by UPI. Your order is placed right after you pay.`
                : `Pay the ${s.advance_mode === 'fixed' ? inr(s.advance_value) : (s.advance_value ?? 50) + '%'} advance after placing the order.`}
              {cashBalanceOk && f.payment_method !== 'cash' && ` The balance can be paid in cash or UPI ${f.fulfilment === 'pickup' ? 'at pickup' : 'before dispatch'}.`}
            </p>
            {isCustom && <div className="notice warn small"><Icon name="sparkle" size={18} /> Your cart has a custom design. Please wait for the baker’s quote before paying the advance.</div>}
            <div data-err="policies" style={{ marginTop: 12 }}>
              <label className="check"><input type="checkbox" checked={f.accepted_policies} onChange={(e) => set('accepted_policies')(e.target.checked)} />
                <span>I’ve read the <button type="button" className="link-btn" onClick={() => setPolicyOpen(true)}>ordering, cancellation & refund policy</button>. I understand my order is confirmed only after the baker reviews it{f.payment_method !== 'cash' ? ' and the advance is received' : ''}.</span></label>
              {errors.policies && <p className="err-text">{errors.policies}</p>}
            </div>
          </section>

          {payFirst && payStep && (
            <section className="card pay-now" id="pay-now">
              <div className="row between" style={{ alignItems: 'baseline' }}>
                <div className="card-title">5 · Pay the advance: {inr(q.advance_due)}</div>
                <button type="button" className="link-btn small" onClick={() => setPayStep(false)}>Edit order</button>
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>Scan or tap to pay. Your order and Order ID are created as soon as you confirm below.</p>
              <UpiPayBox amount={q.advance_due} note={`Pastel Treats advance - ${f.name.trim()}`.slice(0, 50)} />
              <hr className="soft" />
              <div id="pay-proof" className="stack">
                <b className="small">After paying, tell us:</b>
                <Field label="UPI transaction ID / UTR" hint="12 digits, from your UPI app"><input className="input" value={utr} onChange={(e) => setUtr(e.target.value)} inputMode="numeric" /></Field>
                <label className="dropzone small">
                  <input type="file" accept={ACCEPT_IMG} hidden onChange={(e) => setProof(e.target.files[0] || null)} />
                  <Icon name="upload" size={18} /> {proof ? proof.name : 'Or attach the payment screenshot'}
                </label>
                <button className="btn btn-primary btn-block" disabled={busy || s.orders_paused} onClick={submit}>{busy ? 'Placing your order…' : 'I’ve paid — place my order'}</button>
                <p className="tiny muted" style={{ margin: 0 }}>The baker checks the payment in her UPI app before confirming your order.</p>
              </div>
            </section>
          )}
        </div>

        {/* summary */}
        <aside className="summary">
          <div className="card">
            <div className="card-title">Order summary</div>
            {q.items?.map((i, idx) => (
              <div className="line-item" key={idx}>
                <div className="th"><ProductImage product={data.products.find((p) => p.id === i.product_id)} /></div>
                <div className="grow">
                  <div className="row between"><b className="small">{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</b><b className="small">{inr(i.line_total)}</b></div>
                  <div className="tiny muted">{itemSummary(i)}</div>
                  {i.message && <div className="tiny">“{i.message}”</div>}
                  {i.addons.length > 0 && <div className="tiny muted">+ {i.addons.map((a) => a.name).join(', ')}</div>}
                </div>
              </div>
            ))}
            {q.err && <p className="err-text">{q.err} — <Link to="/cart">fix in cart</Link></p>}
            {!q.err && (
              <div className="breakdown" style={{ marginTop: 6 }}>
                <div className="ln"><span>Cakes & treats</span><span>{inr(q.items.reduce((a, i) => a + i.weight_price * i.qty, 0))}</span></div>
                {q.items.some((i) => i.option_charges) && <div className="ln"><span>Customisation</span><span>+{inr(q.items.reduce((a, i) => a + i.option_charges * i.qty, 0))}</span></div>}
                {q.items.some((i) => i.addon_total) && <div className="ln"><span>Add-ons</span><span>+{inr(q.items.reduce((a, i) => a + i.addon_total, 0))}</span></div>}
                <div className="ln"><span>{f.fulfilment === 'courier' ? 'Courier' : 'Collection'}</span><span>{f.fulfilment === 'pickup' ? 'Self pickup — free' : f.fulfilment === 'courier' ? 'Charge confirmed by us' : zone ? (q.delivery_charge ? inr(q.delivery_charge) : 'Free') : outOfZone ? 'To be confirmed' : 'Enter PIN code'}</span></div>
                <div className="ln total"><span>Total</span><span>{inr(q.total)}</span></div>
                {f.payment_method !== 'cash' && <>
                  <div className="ln" style={{ color: 'var(--forest)', fontWeight: 600 }}><span>Advance to pay now</span><span>{inr(q.advance_due)}</span></div>
                  <div className="ln muted"><span>Balance {f.fulfilment === 'pickup' ? 'at pickup' : 'later'}</span><span>{inr(q.balance)}</span></div>
                </>}
                {f.date && <div className="ln muted" style={{ marginTop: 6 }}><span>{modeLabel}</span><span>{fmtDate(f.date, { weekday: true })}{f.slotLabel ? `, ${f.slotLabel}` : ''}</span></div>}
                {isCustom && <div className="tiny" style={{ color: 'var(--rose-deep)' }}>Custom-design price is an estimate until the baker approves it.</div>}
              </div>
            )}
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={busy || !!q.err || s.orders_paused} onClick={submit}>
              {busy ? 'Placing your order…' : payFirst ? (payStep ? 'I’ve paid — place my order' : 'Continue to payment') : isCustom || f.payment_method === 'cash' ? 'Send order request' : 'Place order & pay advance'}
            </button>
            {s.orders_paused && <p className="err-text center">{s.orders_paused_message || 'We are not taking new orders right now.'}</p>}
            <p className="tiny muted center" style={{ marginTop: 8 }}>Prices are re-checked by the bakery when you submit{isDemo ? ' · demo mode' : ''}.</p>
          </div>
        </aside>
      </div>
      {policyOpen && <Modal title="Ordering policy" onClose={() => setPolicyOpen(false)}><PolicyText keys={['ordering', 'advance', 'cancellation', 'refund', 'custom', 'delivery', 'pickup', 'missed_pickup', 'changes', 'allergens']} />
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => { set('accepted_policies')(true); setPolicyOpen(false) }}>I accept</button></Modal>}
    </div>
  )
}
