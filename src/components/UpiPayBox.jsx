import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../store.jsx'
import { upiLink } from '../lib/contact.js'
import { inr } from '../lib/format.js'
import { Icon, Spinner } from './ui.jsx'

// UPI QR + "open UPI app" + copy ID + help, for a given amount.
export default function UpiPayBox({ amount, note }) {
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
      {link && <a href={link} className="btn btn-primary btn-block hide-lg">Open GPay / PhonePe / Paytm</a>}
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
