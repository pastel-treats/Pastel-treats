import React from 'react'
import { PLACES, STATES } from '../data/places.js'
import { Field } from './ui.jsx'

const OTHER = '__other'

// State + district/city picker. value = { state, city }. A city not in the list can be typed.
export default function PlaceSelect({ state, city, onChange, error }) {
  const cities = PLACES[state] || []
  const typed = !!city && !cities.includes(city)
  const [custom, setCustom] = React.useState(typed || (!!state && !cities.length))
  React.useEffect(() => { setCustom((c) => c || (!!state && !(PLACES[state] || []).length)) }, [state])
  return (
    <div className="grid-2">
      <Field label="State">
        <select className="input" value={state || ''} onChange={(e) => { const s = e.target.value; setCustom(!(PLACES[s] || []).length); onChange({ state: s, city: '' }) }}>
          <option value="">Choose state…</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label={state === 'Tamil Nadu' ? 'District' : 'City'} error={error}>
        {custom ? (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input className={'input' + (error ? ' err' : '')} value={city || ''} maxLength={60} placeholder={state === 'Outside India' ? 'City, country' : 'Type your city / town'} onChange={(e) => onChange({ state, city: e.target.value })} />
            {!!cities.length && <button type="button" className="link-btn small" onClick={() => { setCustom(false); onChange({ state, city: '' }) }}>List</button>}
          </div>
        ) : (
          <select className={'input' + (error ? ' err' : '')} value={cities.includes(city) ? city : ''} disabled={!state}
            onChange={(e) => { if (e.target.value === OTHER) { setCustom(true); onChange({ state, city: '' }) } else onChange({ state, city: e.target.value }) }}>
            <option value="">{state ? 'Choose…' : 'Choose state first'}</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            {!!state && <option value={OTHER}>Other (type it)</option>}
          </select>
        )}
      </Field>
    </div>
  )
}
