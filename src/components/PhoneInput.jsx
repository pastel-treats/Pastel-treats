import React from 'react'

// Country codes customers can pick; India first and default.
export const COUNTRIES = [
  ['IN', '🇮🇳', 'India', '91'],
  ['AE', '🇦🇪', 'UAE', '971'],
  ['SA', '🇸🇦', 'Saudi Arabia', '966'],
  ['QA', '🇶🇦', 'Qatar', '974'],
  ['KW', '🇰🇼', 'Kuwait', '965'],
  ['OM', '🇴🇲', 'Oman', '968'],
  ['BH', '🇧🇭', 'Bahrain', '973'],
  ['SG', '🇸🇬', 'Singapore', '65'],
  ['MY', '🇲🇾', 'Malaysia', '60'],
  ['LK', '🇱🇰', 'Sri Lanka', '94'],
  ['NP', '🇳🇵', 'Nepal', '977'],
  ['BD', '🇧🇩', 'Bangladesh', '880'],
  ['US', '🇺🇸', 'USA / Canada', '1'],
  ['GB', '🇬🇧', 'United Kingdom', '44'],
  ['AU', '🇦🇺', 'Australia', '61'],
  ['NZ', '🇳🇿', 'New Zealand', '64'],
  ['DE', '🇩🇪', 'Germany', '49'],
  ['FR', '🇫🇷', 'France', '33'],
  ['IE', '🇮🇪', 'Ireland', '353'],
  ['NL', '🇳🇱', 'Netherlands', '31'],
]
const BY_LONGEST = [...COUNTRIES].sort((a, b) => b[3].length - a[3].length)

// "+971 50 123 4567" → { cc: '971', num: '501234567' }; plain numbers default to India.
export function splitPhone(v) {
  const s = String(v || '').trim()
  if (s.startsWith('+')) {
    const d = s.replace(/\D/g, '')
    const c = BY_LONGEST.find((x) => d.startsWith(x[3]))
    if (c) return { cc: c[3], num: d.slice(c[3].length) }
    return { cc: '91', num: d }
  }
  let d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  return { cc: '91', num: d }
}

export const joinPhone = (cc, num) => (num ? `+${cc} ${num}` : '')

// Valid when India: 10 digits starting 6–9; elsewhere 6–14 digits.
export function validPhone(v) {
  const { cc, num } = splitPhone(v)
  if (cc === '91') return /^[6-9]\d{9}$/.test(num)
  return /^\d{6,14}$/.test(num)
}

export default function PhoneInput({ value, onChange, invalid, id, required }) {
  const { cc, num } = splitPhone(value)
  const country = COUNTRIES.find((c) => c[3] === cc) || COUNTRIES[0]
  return (
    <div className={'phone-input' + (invalid ? ' err' : '')}>
      <label className="cc" title={country[2]}>
        <span aria-hidden="true">{country[1]} +{cc}</span>
        <select aria-label="Country code" value={cc} onChange={(e) => onChange(joinPhone(e.target.value, num))}>
          {COUNTRIES.map((c) => <option key={c[0]} value={c[3]}>{c[1]} {c[2]} (+{c[3]})</option>)}
        </select>
      </label>
      <input id={id} required={required} type="tel" inputMode="tel" autoComplete="tel-national" placeholder={cc === '91' ? '98765 43210' : 'Mobile number'}
        value={num} onChange={(e) => onChange(joinPhone(cc, e.target.value.replace(/[^\d]/g, '').slice(0, 14)))} />
    </div>
  )
}
