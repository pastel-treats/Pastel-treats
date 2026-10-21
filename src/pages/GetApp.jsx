import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useInstall, bannerDismissed, dismissBanner, inAppBrowser, chromeIntent } from '../lib/install.js'
import { Icon } from '../components/ui.jsx'

const shareIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-3px' }}>
    <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)
const dots = <b style={{ letterSpacing: 1 }}>⋮</b>

function Steps({ items }) {
  return <ol className="install-steps">{items.map((t, i) => <li key={i}><span className="n">{i + 1}</span><span>{t}</span></li>)}</ol>
}

const IOS = [<>Open this page in <b>Safari</b> (not inside WhatsApp or Instagram).</>, <>Tap the <b>Share</b> button {shareIcon} at the bottom of the screen.</>, <>Scroll down and tap <b>Add to Home Screen</b>.</>, <>Tap <b>Add</b>. The Pastel Treats icon appears on your home screen.</>]
const ANDROID = [<>Open this page in <b>Chrome</b> (not inside WhatsApp or Instagram).</>, <>Tap the menu {dots} at the top right.</>, <>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</>, <>Tap <b>Install</b>. The Pastel Treats icon appears with your other apps.</>]

export default function GetApp() {
  const ins = useInstall()
  const [qr, setQr] = useState('')
  const [tab, setTab] = useState(ins.platform.startsWith('ios') ? 'ios' : 'android')
  const url = typeof location !== 'undefined' ? location.href.split('#')[0] : ''
  useEffect(() => { if (ins.platform === 'desktop') QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#3b2a2f' } }).then(setQr).catch(() => {}) }, [url, ins.platform])

  return (
    <div className="wrap section" style={{ maxWidth: 680, paddingTop: 24 }}>
      <div className="app-hero card">
        <img src="icons/icon-192.png" alt="" width="84" height="84" className="app-icon" />
        <div>
          <div className="eyebrow">Free · Android & iPhone</div>
          <h1 style={{ fontSize: 'clamp(1.9rem,6vw,2.5rem)', margin: '4px 0 6px' }}>Get the Pastel Treats app</h1>
          <p className="muted" style={{ margin: 0 }}>Order in a few taps, get your order ID instantly and track every order. No app store needed, and it takes almost no space on your phone.</p>
        </div>
      </div>

      {ins.installed ? (
        <div className="notice info" style={{ marginTop: 16 }}><Icon name="check" size={20} /><div>You’re using the app. <Link to="/menu">Start an order</Link></div></div>
      ) : (
        <>
          {ins.canPrompt && (
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={ins.prompt}><Icon name="download" size={18} /> Install the app</button>
          )}
          {!ins.canPrompt && ins.platform !== 'desktop' && (
            <div className="notice warn" style={{ marginTop: 16 }}>
              <Icon name="sparkle" size={20} />
              <div>
                <b>{inAppBrowser() ? 'You opened this inside another app.' : 'Opened this from WhatsApp or Instagram?'}</b> Apps can’t be installed from there. First open this page in {ins.platform === 'android' ? <b>Chrome</b> : <b>Safari</b>}:
                {ins.platform === 'android'
                  ? <> tap <b>⋮</b> (top right) → <b>Open in Chrome</b>, or use the button below.</>
                  : <> tap the <b>Safari / compass icon</b> at the bottom, or copy the link and paste it in Safari.</>}
                <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                  {ins.platform === 'android' && <a className="btn btn-primary btn-sm" href={chromeIntent()}>Open in Chrome</a>}
                  <button className="btn btn-white btn-sm" onClick={() => { navigator.clipboard?.writeText(location.origin + '/#/app').then(() => alert('Link copied — paste it in ' + (ins.platform === 'android' ? 'Chrome' : 'Safari'))).catch(() => {}) }}><Icon name="copy" size={16} /> Copy link</button>
                </div>
              </div>
            </div>
          )}
          {ins.platform === 'ios-other' && (
            <div className="notice warn" style={{ marginTop: 16 }}><Icon name="sparkle" size={20} /><div>On iPhone, apps can only be added from <b>Safari</b>. Copy this link and open it in Safari.</div></div>
          )}
          {ins.platform === 'desktop' && qr && (
            <div className="card row" style={{ marginTop: 16, gap: 18, alignItems: 'center' }}>
              <img src={qr} alt="QR code to open Pastel Treats on your phone" width="140" height="140" style={{ borderRadius: 12 }} />
              <div><b>On a computer?</b><p className="muted small" style={{ margin: '4px 0 0' }}>Scan this with your phone’s camera to open Pastel Treats there, then follow the steps below.</p></div>
            </div>
          )}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'android'} className={tab === 'android' ? 'on' : ''} onClick={() => setTab('android')}>Android</button>
              <button role="tab" aria-selected={tab === 'ios'} className={tab === 'ios' ? 'on' : ''} onClick={() => setTab('ios')}>iPhone / iPad</button>
            </div>
            <Steps items={tab === 'ios' ? IOS : ANDROID} />
          </div>
        </>
      )}

      <div className="grid-3 app-perks">
        {[['receipt', 'Order ID & tracking', 'See every order and its status with just your mobile number.'], ['calendar', 'Book your slot', 'Pick a date and pickup time. We confirm it in the app.'], ['bell', 'Always up to date', 'Latest menu, prices and announcements every time you open it.']].map(([i, t, d]) => (
          <div key={t} className="card"><Icon name={i} size={22} /><div className="card-title" style={{ marginTop: 6 }}>{t}</div><p className="small muted" style={{ margin: 0 }}>{d}</p></div>
        ))}
      </div>
    </div>
  )
}

// Small banner on the home page; hidden once installed or dismissed.
export function InstallBanner() {
  const ins = useInstall()
  const [hidden, setHidden] = useState(bannerDismissed())
  if (ins.installed || hidden) return null
  return (
    <div className="wrap" style={{ paddingTop: 16 }}>
      <div className="install-banner">
        <img src="icons/icon-192.png" alt="" width="44" height="44" />
        <div className="grow"><b>Get the Pastel Treats app</b><div className="tiny muted">Free for Android & iPhone · order and track in a tap</div></div>
        {ins.canPrompt
          ? <button className="btn btn-primary btn-sm" onClick={ins.prompt}>Install</button>
          : <Link className="btn btn-primary btn-sm" to="/app">Get app</Link>}
        <button className="icon-btn" aria-label="Not now" onClick={() => { dismissBanner(); setHidden(true) }}><Icon name="x" size={18} /></button>
      </div>
    </div>
  )
}
