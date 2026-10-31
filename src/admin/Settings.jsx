import { calcAdvance } from '../lib/pricing.js'
import React, { useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { SimpleTable } from './MenuAdmin.jsx'
import { api, isDemo } from '../api/index.js'
import { cleanError, inr } from '../lib/format.js'
import { fmtDate } from '../lib/dates.js'
import { POLICY_TITLES } from '../pages/Info.jsx'
import { Field, Switch, Icon, compressImage, ACCEPT_IMG } from '../components/ui.jsx'

const TABS = [['business', 'Business & contact'], ['home', 'Home page'], ['ordering', 'Ordering & schedule'], ['delivery', 'Pickup & courier'], ['payments', 'Payments'], ['policies', 'Policies'], ['reminders', 'Reminders & segments']]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Zones() {
  const { db, reload, toast } = useAdmin()
  const [rows, setRows] = useState(() => db.delivery_zones.map((z) => ({ ...z, pins: (z.pincodes || []).join(', ') })))
  const upd = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  async function save(r) {
    const row = { name: r.name, pincodes: r.pins.split(/[\s,]+/).filter((p) => /^\d{6}$/.test(p)), charge: +r.charge || 0, free_above: r.free_above === '' || r.free_above == null ? null : +r.free_above, active: r.active !== false, sort: +r.sort || 0 }
    if (!row.name) return toast('Name the zone', true)
    try { r.id ? await api.update('delivery_zones', r.id, row) : await api.insert('delivery_zones', row); await reload(); toast('Zone saved') } catch (e) { toast(cleanError(e), true) }
  }
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div className="card flat stack" key={r.id || 'n' + i}>
          <div className="grid-2">
            <Field label="Zone name"><input className="input" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Charge ₹"><input type="number" className="input" value={r.charge} onChange={(e) => upd(i, { charge: e.target.value })} /></Field>
              <Field label="Free above ₹" hint="blank = never"><input type="number" className="input" value={r.free_above ?? ''} onChange={(e) => upd(i, { free_above: e.target.value })} /></Field>
            </div>
          </div>
          <Field label="PIN codes served" hint="comma separated"><textarea className="input" value={r.pins} onChange={(e) => upd(i, { pins: e.target.value })} /></Field>
          <div className="row"><Switch checked={r.active !== false} onChange={(v) => upd(i, { active: v })} label="Active" /><span className="grow" />
            {r.id && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Delete zone?')) { await api.remove('delivery_zones', r.id); setRows(rows.filter((_, j) => j !== i)); reload() } }}>Delete</button>}
            <button className="btn btn-primary btn-sm" onClick={() => save(r)}>Save zone</button></div>
        </div>
      ))}
      <button className="btn btn-soft" onClick={() => setRows([...rows, { name: '', pins: '', charge: 80, free_above: '', active: true, sort: rows.length + 1 }])}><Icon name="plus" size={16} /> Add zone</button>
      <p className="tiny muted">Addresses outside these PIN codes are refused at checkout — unless “allow out-of-area requests” is on (Ordering tab), in which case the order comes to you for approval first.</p>
    </div>
  )
}

function Blackouts() {
  const { db, reload, toast } = useAdmin()
  const [d, setD] = useState('')
  const [r, setR] = useState('')
  return (
    <div className="card flat stack">
      <b>Blackout dates (holidays, fully booked)</b>
      {db.blackout_dates.map((b) => <div className="list-row small" key={b.day}><span className="grow">{fmtDate(b.day, { weekday: true, year: true })} · {b.reason}</span><button className="btn btn-white btn-sm" onClick={async () => { await api.remove('blackout_dates', b.day); reload() }}><Icon name="trash" size={14} /></button></div>)}
      <div className="row wrap"><input type="date" className="input" style={{ maxWidth: 180 }} value={d} onChange={(e) => setD(e.target.value)} /><input className="input" style={{ maxWidth: 240 }} placeholder="Reason (shown to customers)" value={r} onChange={(e) => setR(e.target.value)} />
        <button className="btn btn-soft btn-sm" disabled={!d} onClick={async () => { try { await api.insert('blackout_dates', { day: d, reason: r || 'Closed' }); setD(''); setR(''); reload() } catch (e) { toast(cleanError(e), true) } }}>Block date</button></div>
    </div>
  )
}

export default function Settings() {
  const { settings, reload, toast, db } = useAdmin()
  const [tab, setTab] = useState('business')
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(settings)))
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'number' ? +v.target.value : v.target.value) : v }))
  const setPol = (k) => (e) => setS((x) => ({ ...x, policies: { ...(x.policies || {}), [k]: e.target.value } }))
  const setSeg = (k) => (e) => setS((x) => ({ ...x, segments: { ...(x.segments || {}), [k]: +e.target.value } }))
  const dirty = JSON.stringify(s) !== JSON.stringify(settings)
  async function save() {
    setBusy(true)
    try { await api.saveSettings(s); await reload(); toast('Settings saved') } catch (e) { toast(cleanError(e), true) } finally { setBusy(false) }
  }
  const T = (k, label, hint, type = 'text') => <Field label={label} hint={hint}><input className="input" type={type} value={s[k] ?? ''} onChange={set(k)} /></Field>
  return (
    <>
      <PageHead title="Business settings" sub="Everything customers see — no code needed.">
        <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
      </PageHead>
      <div className="pill-tabs" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="card stack">
        {tab === 'business' && <>
          <div className="grid-2">{T('business_name', 'Bakery name')}{T('brand_line', 'Shown as', 'e.g. Premium home baker')}{T('tagline', 'Tagline')}{T('whatsapp', 'WhatsApp number', 'with country code, e.g. 919876543210')}{T('phone', 'Phone number')}{T('phone2', 'Second phone', 'optional')}{T('email', 'E-mail')}{T('instagram', 'Instagram link')}{T('business_hours', 'Business hours')}</div>
          {T('pickup_address', 'Pickup address')}
          {T('maps_link', 'Google Maps link', 'open the place in Google Maps → Share → copy link')}
          <Field label="Pickup instructions"><textarea className="input" value={s.pickup_instructions || ''} onChange={set('pickup_instructions')} /></Field>
        </>}
        {tab === 'home' && <>
          {T('hero_headline', 'Headline', 'text after the comma is shown in italics')}
          <Field label="Introduction"><textarea className="input" value={s.hero_intro || ''} onChange={set('hero_intro')} /></Field>
          {T('promo_banner', 'Promotional banner', 'leave blank to hide')}
          <div className="grid-2">{T('baker_name', 'Baker’s name', 'shown under her picture')}{T('baker_title', 'Baker’s title', 'e.g. Certified pastry chef')}</div>
          <Field label="Meet the baker — introduction"><textarea className="input" value={s.baker_intro || ''} onChange={set('baker_intro')} /></Field>
          <p className="tiny muted">Featured cakes are chosen in Menu & pricing (★ Featured).</p>
        </>}
        {tab === 'ordering' && <>
          <div className="grid-2">
            {T('lead_time_hours', 'Minimum notice (hours)', 'default 48', 'number')}
            {T('max_orders_per_day', 'Max orders per day', 'blank = no limit', 'number')}
            {T('max_deliveries_per_day', 'Max deliveries per day', 'blank = no limit', 'number')}
            {T('timezone', 'Timezone', 'Asia/Kolkata')}
          </div>
          <div><div className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Weekly closed days</div>
            <div className="chips">{DAYS.map((d, i) => { const on = (s.closed_weekdays || []).includes(i); return <button key={d} className={'chip' + (on ? ' on' : '')} onClick={() => set('closed_weekdays')(on ? s.closed_weekdays.filter((x) => x !== i) : [...(s.closed_weekdays || []), i])}>{d}</button> })}</div></div>
          <div><div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>No phone calls on (app & WhatsApp only)</div><div className="chips">{DAYS.map((d, i) => { const on = (s.no_call_weekdays || []).includes(i); return <button key={d} className={'chip' + (on ? ' on' : '')} onClick={() => set('no_call_weekdays')(on ? s.no_call_weekdays.filter((x) => x !== i) : [...(s.no_call_weekdays || []), i])}>{d}</button> })}</div></div>
          <Switch checked={s.allow_out_of_zone_requests} onChange={set('allow_out_of_zone_requests')} label="Allow delivery requests outside my zones (I approve each one)" />
          <p className="tiny muted">Save the settings above, then edit time slots & blackout dates below (they save on their own).</p>
          <b>Time slots & capacity</b>
          <SimpleTable table="time_slots" rows={db.time_slots} newRow={{ label: '', start_time: '10:00', end_time: '12:00', capacity: 3, for_pickup: true, for_delivery: true, active: true, sort: db.time_slots.length + 1 }}
            fields={[['label', 'Label'], ['start_time', 'Starts', 'time'], ['end_time', 'Ends', 'time'], ['capacity', 'Max orders', 'number'], ['weekdays', 'Days', 'days'], ['for_pickup', 'Pickup', 'bool'], ['for_delivery', 'Delivery', 'bool'], ['active', 'On', 'bool']]} />
          <Blackouts />
        </>}
        {tab === 'delivery' && <>
          <p className="small muted" style={{ margin: 0 }}>Self pickup from your location is always available. Pickup address, map link and instructions are under “Business & contact”.</p>
          <Switch checked={s.courier_enabled} onChange={set('courier_enabled')} label="Offer courier for items marked “Can be sent by courier” (you confirm the charge on each order)" />
          <Field label="Courier note shown at checkout"><textarea className="input" value={s.courier_note || ''} onChange={set('courier_note')} /></Field>
          <hr className="soft" />
          <Switch checked={s.home_delivery_enabled} onChange={set('home_delivery_enabled')} label="Offer home delivery (by PIN code zones below)" />
          {s.home_delivery_enabled && <><p className="tiny muted">Save the switch above, then set up zones:</p><Zones /></>}
        </>}
        {tab === 'payments' && <>
          <div className="grid-2">
            <Field label={s.advance_tier_enabled ? 'Smaller orders: advance type' : 'Advance type'}><select className="input" value={s.advance_mode} onChange={set('advance_mode')}><option value="percent">Percentage of total</option><option value="fixed">Fixed amount</option></select></Field>
            <Field label={(s.advance_mode === 'fixed' ? 'Advance amount ₹' : 'Advance %') + (s.advance_mode === 'fixed' ? '' : ' (100 = full payment)')}><input className="input" type="number" value={s.advance_value} onChange={set('advance_value')} /></Field>
          </div>
          <div className="tier-box stack">
            <Switch checked={!!s.advance_tier_enabled} onChange={set('advance_tier_enabled')} label="Different advance for bigger orders (e.g. full payment below ₹1,000, 50% from ₹1,000)" />
            {s.advance_tier_enabled && <>
              <Field label="For orders of ₹ … and above"><input className="input" type="number" min={0} value={s.advance_tier_above ?? 1000} onChange={set('advance_tier_above')} /></Field>
              <div className="grid-2">
                <Field label="Advance type"><select className="input" value={s.advance_tier_mode || 'percent'} onChange={set('advance_tier_mode')}><option value="percent">Percentage of total</option><option value="fixed">Fixed amount</option></select></Field>
                <Field label={(s.advance_tier_mode || 'percent') === 'fixed' ? 'Advance amount ₹' : 'Advance %'}><input className="input" type="number" min={0} value={s.advance_tier_value ?? 50} onChange={set('advance_tier_value')} /></Field>
              </div>
            </>}
          </div>
          <p className="tiny muted">Examples: {[500, 1000, 1500, 3000].map((t) => `${inr(t)} order → ${inr(calcAdvance(t, { ...s, advance_value: +s.advance_value, advance_tier_above: +(s.advance_tier_above ?? 1000), advance_tier_value: +(s.advance_tier_value ?? 50) }))} advance`).join(' · ')}</p>
          <div className="grid-2">{T('upi_id', 'UPI ID', 'e.g. pasteltreats@okaxis')}{T('upi_name', 'Payee name shown in UPI apps')}</div>
          <div className="row wrap">
            {s.upi_qr_url && <img src={s.upi_qr_url} alt="UPI QR" style={{ width: 120, borderRadius: 12 }} />}
            <label className="btn btn-soft btn-sm"><input type="file" hidden accept={ACCEPT_IMG} onChange={async (e) => { const f = e.target.files[0]; if (!f) return; try { set('upi_qr_url')(await api.uploadProductImage(await compressImage(f, 900, 0.92))) } catch (er) { toast(cleanError(er), true) } }} />Upload your GPay/UPI QR (optional)</label>
            {s.upi_qr_url && <button className="btn btn-white btn-sm" onClick={() => set('upi_qr_url')('')}>Remove</button>}
          </div>
          <p className="tiny muted">With a UPI ID, the app makes a QR with the exact amount for each order. The uploaded QR is used only if no UPI ID is set.</p>
          <hr className="soft" />
          <Switch checked={s.cash_pickup} onChange={set('cash_pickup')} label="Accept cash for pickup orders" />
          <Switch checked={s.cash_delivery} onChange={set('cash_delivery')} label="Accept cash on delivery" />
          <Field label="Cash can be used for"><select className="input" value={s.cash_for || 'balance'} onChange={set('cash_for')}><option value="balance">Balance only (advance by UPI)</option><option value="advance">Whole order incl. advance</option><option value="both">Both advance and balance</option></select></Field>
          <hr className="soft" />
          <Switch checked={s.gateway_enabled} onChange={set('gateway_enabled')} label="Online payment gateway (Razorpay)" />
          {s.gateway_enabled && <div className="notice warn small">Only switch this on after the Razorpay keys and the “razorpay” function are set up in Supabase (see SETUP.md). {isDemo && 'Not available in demo mode.'}</div>}
        </>}
        {tab === 'policies' && Object.entries(POLICY_TITLES).map(([k, t]) => <Field key={k} label={t}><textarea className="input" value={(s.policies || {})[k] || ''} onChange={setPol(k)} /></Field>)}
        {tab === 'reminders' && <>
          <Field label="Reminder schedule (days before the occasion)" hint="three numbers, e.g. 30, 14, 7">
            <input className="input" value={(s.reminder_days || []).join(', ')} onChange={(e) => set('reminder_days')(e.target.value.split(/[\s,]+/).map(Number).filter((n) => n > 0).slice(0, 3))} /></Field>
          <div className="grid-2">
            <Field label="“Frequent” = at least … orders"><input type="number" className="input" value={(s.segments || {}).frequent_orders || 4} onChange={setSeg('frequent_orders')} /></Field>
            <Field label="“High-spend” = lifetime spend ₹"><input type="number" className="input" value={(s.segments || {}).high_spend || 5000} onChange={setSeg('high_spend')} /></Field>
            <Field label="“Inactive” after … days"><input type="number" className="input" value={(s.segments || {}).inactive_days || 120} onChange={setSeg('inactive_days')} /></Field>
          </div>
        </>}
      </div>
      {dirty && <div className="price-bar" style={{ bottom: 16 }}><span className="grow small">You have unsaved changes</span><button className="btn btn-primary" disabled={busy} onClick={save}>Save changes</button></div>}
    </>
  )
}
