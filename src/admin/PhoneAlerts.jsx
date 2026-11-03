import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api, isDemo } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { Switch, Icon, Spinner } from '../components/ui.jsx'

// Loud phone alerts for new orders that work even when the dashboard / app is closed.
// The bakery database sends them through the free "ntfy" app to a private channel only the baker knows.
const newTopic = () => 'pastel-' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
const PLAY = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy'
const APPLE = 'https://apps.apple.com/app/ntfy/id1625396347'

export default function PhoneAlerts() {
  const { toast } = useAdmin()
  const [a, setA] = useState(null)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState(null)
  const [os, setOs] = useState(() => (/iPhone|iPad|Macintosh/i.test(navigator.userAgent) ? 'iphone' : 'android'))
  const [ask, setAsk] = useState(false)
  const [tips, setTips] = useState(false)
  useEffect(() => {
    api.getAlerts().then(async (x) => {
      if (!x.ntfy_topic) x = await api.saveAlerts({ ntfy_topic: newTopic(), enabled: false, site_url: location.origin + location.pathname.replace(/\/$/, '') })
      setA(x)
    }).catch((e) => { toast(cleanError(e), true); setA({ enabled: false, ntfy_topic: null, error: true }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const link = a?.ntfy_topic ? `https://ntfy.sh/${a.ntfy_topic}` : ''
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 300, margin: 1, color: { dark: '#20543f' } }).then(setQr) }, [link])
  const save = async (patch, msg) => {
    setBusy(true)
    try { setA(await api.saveAlerts(patch)); msg && toast(msg) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true)
    try { const ok = await api.testAlert(); toast(ok ? 'Test alert sent — your phone should ring now' : 'Alerts are switched off — turn them on first', !ok) } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }

  if (!a) return <Spinner />
  if (a.error) return (
    <>
      <PageHead title="Phone alerts" sub="New-order alerts that ring even when the app is closed." />
      <div className="notice warn">Phone alerts need the latest database update. Run the update file in Supabase, then come back here.</div>
    </>
  )
  return (
    <>
      <PageHead title="Phone alerts" sub="A loud alert on your phone for every new order — even when this app is closed or the phone is locked." />
      {isDemo && <div className="notice info small" style={{ marginBottom: 12 }}>Demo mode: alerts are only sent on the real website.</div>}
      <div className={'shop-state ' + (a.enabled ? 'open' : 'closed')} style={{ marginBottom: 14 }}>
        <div className="big" style={{ fontSize: '1.4rem' }}>{a.enabled ? '🔔 Phone alerts are ON' : '🔕 Phone alerts are OFF'}</div>
        <Switch checked={!!a.enabled} onChange={(v) => save({ enabled: v }, v ? 'Phone alerts turned on' : 'Phone alerts turned off')} label="Send a loud phone alert for every new order" />
      </div>

      <div className="card stack" style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ margin: 0 }}>How it works — like a Swiggy / Zomato restaurant phone</div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Every new website order pops up on your phone <b>even when this site is closed</b> and the phone is locked.</li>
          <li><b>Sound on</b> → it rings. <b>Silent mode</b> → it pops up and <b>vibrates only</b>.</li>
          <li>Not opened yet? It <b>alerts again every 3 minutes</b> (up to 3 more times) until you open the order in this dashboard.</li>
          <li>Orders you enter yourself don’t ring.</li>
        </ul>
      </div>

      <div className="card stack">
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="card-title" style={{ margin: 0 }}>One-time setup (3 minutes)</div>
          <div className="pill-tabs" style={{ margin: 0 }}>{[['android', 'Android'], ['iphone', 'iPhone']].map(([k, l]) => <button key={k} className={os === k ? 'on' : ''} onClick={() => setOs(k)}>{l}</button>)}</div>
        </div>
        <ol className="pay-steps">
          <li><b className="n">1</b><span>Install the free <b>ntfy</b> app: <a href={os === 'iphone' ? APPLE : PLAY} target="_blank" rel="noreferrer">{os === 'iphone' ? 'App Store' : 'Play Store'}</a></span></li>
          <li><b className="n">2</b><span>Open ntfy → tap <b>+</b> → type this private channel name exactly{os === 'iphone' ? ' (server: ntfy.sh)' : ''} → <b>Subscribe</b>. Allow notifications when asked.</span></li>
        </ol>
        <div className="copy"><span className="grow" style={{ fontFamily: 'monospace', fontSize: '1.05rem' }}>{a.ntfy_topic}</span>
          <button className="btn btn-white btn-sm" onClick={() => { navigator.clipboard?.writeText(a.ntfy_topic); toast('Copied') }}><Icon name="copy" size={16} /> Copy</button></div>
        {qr && <div className="row" style={{ gap: 14, alignItems: 'center' }}><img src={qr} alt="QR code with the alert channel" width="120" height="120" style={{ borderRadius: 10 }} /><span className="tiny muted">On a computer? Scan this with your phone to open the channel, then tap “Subscribe”.</span></div>}
        {os === 'android' ? (
          <ol className="pay-steps" start="3">
            <li><b className="n">3</b><span>In ntfy: <b>⋮ → Settings</b> → turn on <b>Keep alerting for highest priority</b>. The phone keeps ringing until you tap the alert — just like a restaurant tablet.</span></li>
            <li><b className="n">4</b><span>Phone <b>Settings → Apps → ntfy → Battery → Unrestricted</b> (on Samsung: <i>Battery → Unrestricted</i>; on Xiaomi/Redmi: <i>No restrictions</i> and turn on <i>Autostart</i>). Without this the phone may “sleep” the alerts.</span></li>
            <li><b className="n">5</b><span><b>Settings → Apps → ntfy → Notifications</b>: allow, and turn on <b>Pop on screen</b> and <b>Sound</b>. Optional: allow it to <b>override Do Not Disturb</b>.</span></li>
          </ol>
        ) : (
          <ol className="pay-steps" start="3">
            <li><b className="n">3</b><span>iPhone <b>Settings → Notifications → ntfy</b>: Allow Notifications, <b>Sounds</b> on, Banner style <b>Persistent</b>, and <b>Time Sensitive</b> on (so it shows even in Focus / Sleep).</span></li>
            <li><b className="n">4</b><span><b>Settings → Sounds &amp; Haptics</b> → turn on <b>Play Haptics in Silent Mode</b>. Now in silent mode the alert vibrates without sound.</span></li>
            <li><b className="n">5</b><span>Don’t swipe ntfy away from the app switcher too often — alerts still arrive, but opening it once a day keeps it fresh. (iPhones can’t ring non-stop; that’s why we re-alert every 3 minutes.)</span></li>
          </ol>
        )}
        <ol className="pay-steps" start="6">
          <li><b className="n">6</b><span>Switch alerts <b>ON</b> at the top, lock your phone, then tap <b>Send test alert</b>.</span></li>
        </ol>
        <button className="btn btn-primary" disabled={busy || !a.enabled} onClick={async () => { await test(); setAsk(true) }}>🔔 Send test alert</button>
        {ask && (
          <div className="notice info small stack" style={{ gap: 8 }}>
            <b>Did your phone pop up and ring / vibrate?</b>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setAsk(false); toast('Great — you’re all set for new orders 🎉') }}>Yes, it did</button>
              <button className="btn btn-white btn-sm" onClick={() => setTips(true)}>No</button>
            </div>
            {tips && (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Check the channel name in ntfy matches <b>{a.ntfy_topic}</b> exactly (copy-paste it).</li>
                <li>Make sure the switch at the top says <b>Phone alerts are ON</b>.</li>
                <li>{os === 'android' ? 'Set ntfy battery to Unrestricted (step 4) and allow notifications (step 5).' : 'In iPhone Settings → Notifications → ntfy, make sure notifications are allowed.'}</li>
                <li>Open the ntfy app once — if the test message is there but didn’t pop up, it’s a notification setting on the phone.</li>
                <li>Still stuck? Tap “Make a new private channel name” below and subscribe again.</li>
              </ul>
            )}
          </div>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>Each alert shows the order number, amount, first name, date and items — tap it to open that order. Keep the channel name private: anyone who knows it could see order alerts.</p>
        <button className="link-btn small" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => { if (confirm('Make a new private channel? You will need to subscribe to the new name in the ntfy app again.')) save({ ntfy_topic: newTopic() }, 'New channel made — subscribe to it in ntfy') }}>Make a new private channel name</button>
      </div>
    </>
  )
}
