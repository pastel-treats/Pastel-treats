import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../store.jsx'
import { upiLink } from '../lib/contact.js'
import { inr } from '../lib/format.js'
import { Icon, Spinner } from './ui.jsx'

// Links that open a specific UPI app with the amount and note filled in
const isIOS = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
export function upiAppLinks(link) {
  const q = link.slice(link.indexOf('?'))
  return [
    ['GPay', (isIOS() ? 'gpay://upi/pay' : 'tez://upi/pay') + q, '#1a73e8'],
    ['PhonePe', 'phonepe://pay' + q, '#5f259f'],
    ['Paytm', 'paytmmp://pay' + q, '#00baf2'],
    ['Other UPI app', link, '#20543f'],
  ]
}

// UPI QR + "open UPI app" buttons + copy ID + help, for a given amount.
// onOpen: called when the customer leaves for their UPI app (so we can welcome them back).
export default function UpiPayBox({ amount, note, onOpen }) {
  const { settings: s, toast } = useStore()
  const [qr, setQr] = useState(null)
  const payee = s.upi_name || s.business_name
  const link = s.upi_id ? upiLink({ upiId: s.upi_id, name: payee, amount, note }) : null
  useEffect(() => { setQr(null); if (link) QRCode.toDataURL(link, { width: 440, margin: 1, color: { dark: '#20543f', light: '#ffffff' } }).then(setQr) }, [link])

  if (!link && !s.upi_qr_url) return <div className="notice warn small"><Icon name="wallet" size={18} /> Online payment details aren’t set up yet — please contact us on WhatsApp to pay.</div>
  return (
    <div className="stack">
      <div className="qr-box">
        {link ? (qr ? <img src={qr} alt="UPI QR code" /> : <Spinner />) : <img src={s.upi_qr_url} alt="Bakery UPI QR code" />}
        <div className="small center"><b>{payee}</b>{link ? ` · ${inr(amount)}` : ''}<br /><span className="muted tiny">Check the payee name shows “{payee}” before you pay.</span></div>
      </div>
      {link && (
        <div className="upi-apps hide-lg">
          {upiAppLinks(link).map(([n, href, c]) => (
            <a key={n} href={href} className="upi-app" style={{ '--c': c }} onClick={() => onOpen?.(n)}>
              <span className="dot" aria-hidden="true">{n === 'Other UPI app' ? '₹' : n[0]}</span>{n === 'Other UPI app' ? 'Other UPI app' : `Pay with ${n}`}
            </a>
          ))}
        </div>
      )}
      {s.upi_id && (
        <div className="copy"><span className="grow">{s.upi_id}</span>
          <button type="button" className="btn btn-white btn-sm" onClick={() => { navigator.clipboard?.writeText(s.upi_id); toast('UPI ID copied') }}><Icon name="copy" size={16} /> Copy</button></div>
      )}
      {s.upi_id && (
        <details className="pay-help">
          <summary className="small">UPI app says “couldn’t verify” or won’t open?</summary>
          <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Tap <b>Copy</b> above to copy the UPI ID.</li>
            <li>Open GPay / PhonePe / Paytm yourself → <b>Pay UPI ID</b> (or “To UPI ID”) → paste it.</li>
            <li>Check the name shows <b>{payee}</b>, enter <b>{inr(amount)}</b> and pay.</li>
            <li>Or scan the QR code from another phone.</li>
          </ol>
        </details>
      )}
    </div>
  )
}
