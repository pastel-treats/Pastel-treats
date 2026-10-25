import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import PhoneInput from '../components/PhoneInput.jsx'
import { useStore } from '../store.jsx'
import { api } from '../api/index.js'
import { inr, cleanError, itemSummary, statusLabel, STATUS_FLOW } from '../lib/format.js'
import { upiLink, waLink, normalizePhone, telLink, prettyPhone, callsToday, NO_CALL_NOTE } from '../lib/contact.js'
import { cancellationTerms } from '../lib/cancellation.js'
import { fmtDate, fmtDateTime } from '../lib/dates.js'
import { Icon, Spinner, Field, StatusBadge, PayBadge, compressImage, ACCEPT_IMG, WaIcon } from '../components/ui.jsx'

function loadRazorpay() {
  return new Promise((res, rej) => {
    if (window.Razorpay) return res()
    const sc = document.createElement('script')
    sc.src = 'https://checkout.razorpay.com/v1/checkout.js'
    sc.onload = res
    sc.onerror = () => rej(new Error('Could not load the payment window'))
    document.body.appendChild(sc)
  })
}

export function PaymentPanel({ o, phone, onPaid }) {
  const { settings: s, toast } = useStore()
  const [qr, setQr] = useState(null)
  const [big, setBig] = useState(false)
  const [ref, setRef] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const dueAdvance = Math.max(o.advance_due - o.amount_paid, 0)
  const due = dueAdvance > 0 ? dueAdvance : Math.max(o.total - o.amount_paid, 0)
  const link = s.upi_id ? upiLink({ upiId: s.upi_id, name: s.upi_name || s.business_name, amount: due, note: `Order ${o.order_number}` }) : null
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 440, margin: 1, color: { dark: '#20543f', light: '#ffffff' } }).then(setQr) }, [link])
  const pendingProof = o.payments?.some((p) => p.status === 'pending' && p.kind !== 'refund')

  if (o.quote_status === 'pending') return <div className="notice warn"><Icon name="sparkle" size={20} /><div><b>We’re reviewing your custom design.</b> You’ll get the final price on WhatsApp — please pay the advance only after that.</div></div>
  if (o.needs_delivery_approval && !['confirmed', 'advance_received'].includes(o.status)) return <div className="notice warn"><Icon name="map" size={20} /><div><b>{o.fulfilment === 'courier' ? 'We’re working out your courier charge.' : 'Checking delivery to your address.'}</b> We’ll confirm on WhatsApp before you pay.</div></div>
  if (['cancelled', 'refunded', 'refund_pending', 'completed'].includes(o.status) || due <= 0) return null
  if (pendingProof) return <div className="notice info"><Icon name="clock" size={20} /><div><b>Payment details received.</b> The baker is checking your payment in her UPI app and will confirm your order. You don’t need to pay again.</div></div>
  if (o.payment_method === 'cash' && o.amount_paid === 0) return <div className="notice info"><Icon name="wallet" size={20} /><div>You chose <b>cash</b>. Please pay {inr(o.total)} at {o.fulfilment === 'pickup' ? 'pickup' : 'delivery'}. We’ll confirm your order on WhatsApp.</div></div>

  async function sendProof() {
    if (!ref.trim() && !file) return toast('Enter the UPI transaction ID (UTR) or attach a screenshot', true)
    setBusy(true)
    try {
      let path = null
      if (file) path = await api.uploadFile('proof', await compressImage(file, 1200))
      await api.submitProof(o.order_number, phone, ref.trim(), path, due)
      toast('Thank you! We’ll verify your payment shortly.')
      setRef(''); setFile(null); onPaid()
    } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  async function payOnline() {
    setBusy(true)
    try {
      await loadRazorpay()
      const r = await api.gateway({ action: 'create', order_number: o.order_number, phone })
      const rz = new window.Razorpay({
        key: r.key_id, order_id: r.razorpay_order_id, amount: r.amount, currency: 'INR', name: s.business_name, description: `Order ${o.order_number}`,
        prefill: { name: o.customer_name, contact: phone }, theme: { color: '#20543f' },
        handler: async (resp) => {
          try { await api.gateway({ action: 'verify', order_number: o.order_number, phone, ...resp }); toast('Payment received — thank you!'); onPaid() }
          catch (e) { toast(cleanError(e), true) }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      rz.on('payment.failed', () => toast('Payment failed or was cancelled. You can try again.', true))
      rz.open()
    } catch (e) { toast(cleanError(e), true); setBusy(false) }
  }

  return (
    <div className="card" id="pay">
      <div className="card-title">{dueAdvance > 0 ? `Pay your advance: ${inr(due)}` : `Pay the balance: ${inr(due)}`}</div>
      {pendingProof && <div className="notice info small" style={{ marginBottom: 12 }}><Icon name="clock" size={18} /> We’ve received your payment details and are verifying them. You don’t need to pay again.</div>}
      {s.gateway_enabled && o.payment_method === 'gateway' && (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={payOnline} style={{ marginBottom: 14 }}>Pay {inr(due)} online</button>
      )}
      {(link || s.upi_qr_url) ? (
        <div className="stack">
          <div className="qr-box">
            {link ? (qr ? <img src={qr} alt="UPI QR code" onClick={() => setBig(true)} style={{ cursor: 'zoom-in' }} /> : <Spinner />) : <img src={s.upi_qr_url} alt="Bakery UPI QR code" onClick={() => setBig(true)} />}
            <div className="small center"><b>{s.upi_name || s.business_name}</b>{link ? ` · ${inr(due)}` : ''}<br /><span className="muted tiny">Check the payee name shows “{s.upi_name || s.business_name}” before you pay.</span></div>
            <button className="btn btn-soft btn-sm" onClick={() => setBig(true)}>Show larger</button>
          </div>
          {link && <a href={link} className="btn btn-primary btn-block hide-lg">Open GPay / PhonePe / Paytm</a>}
          {s.upi_id && (
            <div className="copy"><span className="grow">{s.upi_id}</span>
              <button className="btn btn-white btn-sm" onClick={() => { navigator.clipboard?.writeText(s.upi_id); toast('UPI ID copied') }}><Icon name="copy" size={16} /> Copy</button></div>
          )}
          <div className="tiny muted">Add <b>{o.order_number}</b> in the payment note.</div>
          {s.upi_id && (
            <details className="pay-help">
              <summary className="small">UPI app says “couldn’t verify” or won’t open?</summary>
              <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
                <li>Tap <b>Copy</b> above to copy the UPI ID.</li>
                <li>Open GPay / PhonePe / Paytm yourself → <b>Pay UPI ID</b> (or “To UPI ID”) → paste it.</li>
                <li>Check the name shows <b>{s.upi_name || s.business_name}</b>, enter <b>{inr(due)}</b> and pay.</li>
                <li>Or scan the QR code from another phone.</li>
              </ol>
            </details>
          )}
          <hr className="soft" />
          <b className="small">After paying, tell us:</b>
          <Field label="UPI transaction ID / UTR" hint="12 digits, from your UPI app"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} inputMode="numeric" /></Field>
          <label className="dropzone small">
            <input type="file" accept={ACCEPT_IMG} hidden onChange={(e) => setFile(e.target.files[0] || null)} />
            <Icon name="upload" size={18} /> {file ? file.name : 'Or attach the payment screenshot'}
          </label>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={sendProof}>{busy ? 'Sending…' : 'I’ve paid — notify the baker'}</button>
          <p className="tiny muted">Your order is marked paid only after the baker checks the payment in the bank/UPI app.</p>
        </div>
      ) : (
        <div className="notice warn small">The bakery hasn’t added its UPI details yet. Please contact us on WhatsApp to pay.</div>
      )}
      {big && (
        <div className="modal-bg" onClick={() => setBig(false)} style={{ alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: 18, borderRadius: 24 }}><img src={qr || s.upi_qr_url} alt="UPI QR code" style={{ width: 'min(86vw, 420px)' }} /><p className="center small">Tap anywhere to close</p></div>
        </div>
      )}
    </div>
  )
}

export function OrderDetails({ o }) {
  return (
    <div className="card">
      <div className="card-title">Order details</div>
      {o.items.map((i, k) => (
        <div className="line-item" key={k}>
          <div className="th">{i.image ? <img src={i.image} alt="" /> : null}</div>
          <div className="grow">
            <div className="row between"><b>{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</b><b>{inr(i.line_total)}</b></div>
            <div className="tiny muted">{itemSummary(i)}</div>
            {i.message && <div className="tiny">Message: “{i.message}”</div>}
            {i.name_on_cake && <div className="tiny">Name: {i.name_on_cake}{i.age ? ` · ${i.age}` : ''}</div>}
            {i.addons?.length > 0 && <div className="tiny muted">+ {i.addons.map((a) => a.name).join(', ')}</div>}
            {i.custom_request && <div className="tiny" style={{ color: 'var(--rose-deep)' }}>Custom design: {i.custom_description}</div>}
          </div>
        </div>
      ))}
      <div className="breakdown" style={{ marginTop: 8 }}>
        <div className="ln"><span>Items</span><span>{inr(o.subtotal)}</span></div>
        <div className="ln"><span>{o.fulfilment === 'courier' ? 'Courier' : 'Collection'}</span><span>{o.fulfilment === 'pickup' ? 'Self pickup' : inr(o.delivery_charge)}</span></div>
        {o.discount > 0 && <div className="ln"><span>Discount</span><span>−{inr(o.discount)}</span></div>}
        <div className="ln total"><span>Total</span><span>{inr(o.total)}</span></div>
        <div className="ln"><span>Advance required</span><span>{inr(o.advance_due)}</span></div>
        <div className="ln"><span>Paid (verified)</span><span>{inr(o.amount_paid)}</span></div>
        <div className="ln" style={{ fontWeight: 600 }}><span>Balance due</span><span>{inr(o.total - o.amount_paid)}</span></div>
      </div>
    </div>
  )
}

// The full order as a WhatsApp message to the baker
function orderMessage(o, phone) {
  const when = `${fmtDate(o.confirmed_date || o.requested_date, { weekday: true })}, ${o.confirmed_slot_label || o.slot_label}`
  return [
    `Hi Pastel Treats! I've placed an order.`,
    `Order ID: ${o.order_number}`,
    `Name: ${o.customer_name}`,
    `Mobile: ${prettyPhone(phone)}`,
    `${o.fulfilment === 'pickup' ? 'Pickup' : 'Courier dispatch'}: ${when}`,
    ...o.items.map((i) => `• ${i.qty > 1 ? i.qty + ' × ' : ''}${i.name}${itemSummary(i) ? ' (' + itemSummary(i) + ')' : ''}${i.message ? ' — message: "' + i.message + '"' : ''}`),
    `Total: ${inr(o.total)} · Advance: ${inr(o.advance_due)}`,
  ].join('\n')
}

export default function OrderView() {
  const { number } = useParams()
  const [sp] = useSearchParams()
  const { myOrders, rememberOrder, settings: s, data } = useStore()
  const known = myOrders.find((x) => x.number === number)
  const [phone, setPhone] = useState(known?.phone || '')
  const [o, setO] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(!!known)
  const isNew = sp.get('new') === '1'

  const load = useCallback(async (ph = phone) => {
    setLoading(true)
    try {
      const r = await api.getOrder(number, ph)
      setO(r); setErr(null)
      rememberOrder({
        number, phone: normalizePhone(ph), at: known?.at || r.created_at || new Date().toISOString(),
        items: (r.items || []).map((i) => `${i.qty > 1 ? i.qty + ' × ' : ''}${i.name}`).join(', '),
        total: r.total, date: r.confirmed_date || r.requested_date, status: r.status, fulfilment: r.fulfilment,
      })
    } catch (e) { setErr(cleanError(e)) } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, phone])
  useEffect(() => { if (known) load(known.phone) /* eslint-disable-next-line */ }, [number])

  if (!o)
    return (
      <div className="wrap section" style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: '2.2rem' }}>Order {number}</h1>
        {loading ? <Spinner /> : (
          <div className="card stack" style={{ marginTop: 14 }}>
            <p className="small muted">For your privacy, enter the mobile number used for this order.</p>
            <Field label="Mobile number"><PhoneInput value={phone} onChange={setPhone} /></Field>
            {err && <p className="err-text">{err}</p>}
            <button className="btn btn-primary" onClick={() => load()}>View order</button>
          </div>
        )}
      </div>
    )

  const date = o.confirmed_date || o.requested_date
  const slot = o.confirmed_slot_label || o.slot_label
  const confirmed = !!o.confirmed_date || ['confirmed', 'in_preparation', 'ready', 'out_for_delivery', 'completed'].includes(o.status)
  const flow = STATUS_FLOW.filter((x) => !(o.fulfilment === 'pickup' && x === 'out_for_delivery'))
  const curIdx = flow.indexOf(o.status)
  const waMsg = `Hi ${s.business_name}! About my order ${o.order_number} (mobile ${prettyPhone(phone || known?.phone)}): `
  const terms = cancellationTerms(o, data?.slots, s)

  return (
    <div className="wrap" style={{ paddingTop: 20, paddingBottom: 30, maxWidth: 980 }}>
      {isNew && (
        <div className="card center fade-in" style={{ background: 'var(--mint)', marginBottom: 16 }}>
          <svg className="success-art" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="44" fill="#fff" /><path d="m30 49 12 12 25-26" stroke="#20543f" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h2 style={{ marginTop: 10 }}>Thank you, {o.customer_name.split(' ')[0]}!</h2>
          <p style={{ margin: '6px 0 0' }}>Your order request has been received.</p>
          <div className="card flat" style={{ margin: '12px auto 0', maxWidth: 360, background: '#fff' }}>
            <div className="tiny muted">Order ID</div>
            <div className="serif" style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--forest)', letterSpacing: '0.02em' }}>{o.order_number}</div>
            <div className="small muted">Mobile {prettyPhone(phone || known?.phone)} · save this to track your order</div>
          </div>
          {s.whatsapp && <a className="btn btn-primary" style={{ marginTop: 12 }} href={waLink(s.whatsapp, orderMessage(o, phone || known?.phone))} target="_blank" rel="noreferrer"><WaIcon size={18} /> Send my order details on WhatsApp</a>}
          <p className="small" style={{ margin: '4px 0 0' }}>{o.status === 'awaiting_payment' ? 'Pay the advance below to secure your slot.' : 'The baker will review it and message you on WhatsApp.'}</p>
        </div>
      )}
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <div><div className="eyebrow">Order ID</div><h1 style={{ fontSize: '2.2rem' }}>{o.order_number}</h1><div className="small muted">Mobile {prettyPhone(phone || known?.phone)}</div></div>
        <div className="row"><StatusBadge s={o.status} short={false} /><PayBadge s={o.payment_status} /></div>
      </div>
      <div className="co" style={{ paddingTop: 0 }}>
        <div className="stack">
          <PaymentPanel o={o} phone={phone || known?.phone} onPaid={() => load(phone || known?.phone)} />
          <div className="card">
            <div className="row between"><div className="card-title">{confirmed ? 'Confirmed schedule' : 'Requested schedule'}</div>{!confirmed && <span className="badge t-butter">Tentative</span>}</div>
            <dl className="kv">
              <dt>{o.fulfilment === 'pickup' ? 'Pickup' : o.fulfilment === 'courier' ? 'Courier dispatch' : 'Delivery'}</dt><dd>{fmtDate(date, { weekday: true, year: true })}, {slot}</dd>
              {o.fulfilment === 'pickup' ? <><dt>Where</dt><dd>{s.pickup_address}{s.maps_link && <> · <a href={s.maps_link} target="_blank" rel="noreferrer">Map</a></>}</dd></>
                : <><dt>Address</dt><dd>{[o.address?.line, o.address?.area, o.address?.city, o.address?.pincode].filter(Boolean).join(', ')}</dd></>}
              <dt>Placed</dt><dd>{fmtDateTime(o.created_at)}</dd>
            </dl>
            {o.quote_note && <div className="notice info small" style={{ marginTop: 10 }}>Note from the baker: {o.quote_note}</div>}
          </div>
          <OrderDetails o={o} />
        </div>
        <aside className="stack summary">
          <div className="card">
            <div className="card-title">Progress</div>
            {['cancelled', 'refund_pending', 'refunded'].includes(o.status) ? <StatusBadge s={o.status} short={false} /> : (
              <ul className="timeline">
                {flow.map((st, i) => {
                  const h = o.history?.find((x) => x.to === st)
                  if (i < curIdx && !h && ['payment_verification', 'submitted'].includes(st)) return null
                  return <li key={st} className={i <= curIdx ? 'done' : 'future'}><span><b className={i <= curIdx ? '' : 'muted'}>{statusLabel(st)}</b>{h && <><br /><span className="tiny muted">{fmtDateTime(h.at)}</span></>}</span></li>
                })}
              </ul>
            )}
          </div>
          <div className="card stack">
            <b>Questions?</b>
            {s.whatsapp && <a className="btn btn-soft btn-block" href={waLink(s.whatsapp, waMsg)} target="_blank" rel="noreferrer"><WaIcon size={18} /> WhatsApp the baker</a>}
            {s.phone && (callsToday(s) ? <a className="btn btn-ghost btn-block" href={telLink(s.phone)}><Icon name="phone" size={18} /> Call {s.phone}</a> : <p className="tiny muted center" style={{ margin: 0 }}>{NO_CALL_NOTE}</p>)}
            <button className="btn btn-white btn-block" onClick={() => load(phone || known?.phone)}>Refresh status</button>
          </div>
          {!terms.closed && (
            <div className="card stack">
              <b>Need to cancel?</b>
              <p className="small" style={{ margin: 0 }}>{terms.summary}</p>
              {terms.paid > 0 && <p className="tiny muted" style={{ margin: 0 }}>{terms.fullRefund ? `Refund of ${inr(terms.refund)} goes back to your UPI account within 5–7 working days.` : `Cancel at least ${terms.windowHrs} hrs before your slot to get the advance back.`}</p>}
              {s.whatsapp && <a className="btn btn-rose btn-block" href={waLink(s.whatsapp, `Hi Pastel Treats, I'd like to cancel my order.\nOrder ID: ${o.order_number}\nMobile: ${prettyPhone(phone || known?.phone)}\nReason: `)} target="_blank" rel="noreferrer">Request cancellation on WhatsApp</a>}
              <Link to="/policies#cancellation" className="tiny center">Read the cancellation & refund policy</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
