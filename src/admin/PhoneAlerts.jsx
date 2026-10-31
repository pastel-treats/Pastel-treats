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

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>One-time setup on your phone (2 minutes)</div>
        <ol className="pay-steps">
          <li><b className="n">1</b><span>Install the free <b>ntfy</b> app: <a href={PLAY} target="_blank" rel="noreferrer">Android</a> · <a href={APPLE} target="_blank" rel="noreferrer">iPhone</a></span></li>
          <li><b className="n">2</b><span>Open ntfy → tap <b>+</b> (Subscribe to topic) → type this private name exactly:</span></li>
        </ol>
        <div className="copy"><span className="grow" style={{ fontFamily: 'monospace', fontSize: '1.05rem' }}>{a.ntfy_topic}</span>
          <button className="btn btn-white btn-sm" onClick={() => { navigator.clipboard?.writeText(a.ntfy_topic); toast('Copied') }}><Icon name="copy" size={16} /> Copy</button></div>
        {qr && <div className="row" style={{ gap: 14, alignItems: 'center' }}><img src={qr} alt="QR code with the alert channel" width="120" height="120" style={{ borderRadius: 10 }} /><span className="tiny muted">On a computer? Scan this with your phone to open the channel, then tap “Subscribe”.</span></div>}
        <ol className="pay-steps" start="3">
          <li><b className="n">3</b><span>In ntfy, open the channel → <b>⋮ → Notification settings</b> → set <b>Minimum priority: any</b>, and turn on <b>Keep alerting / Instant delivery</b> (Android). On iPhone, allow notifications and sounds for ntfy.</span></li>
          <li><b className="n">4</b><span>Switch alerts <b>ON</b> above, then tap <b>Send test alert</b>. Your phone should ring with a pop-up, even with this app closed.</span></li>
        </ol>
        <button className="btn btn-primary" disabled={busy || !a.enabled} onClick={test}>🔔 Send test alert</button>
        <p className="tiny muted" style={{ margin: 0 }}>Each alert shows the order number, amount, first name, date and items — tap it to open the order. Keep the channel name private: anyone who knows it could see order alerts. </p>
        <button className="link-btn small" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => { if (confirm('Make a new private channel? You will need to subscribe to the new name in the ntfy app again.')) save({ ntfy_topic: newTopic() }, 'New channel made — subscribe to it in ntfy') }}>Make a new private channel name</button>
      </div>
    </>
  )
}
