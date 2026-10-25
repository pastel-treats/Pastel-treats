// WhatsApp / phone / UPI helpers
const digits = (n) => String(n || '').replace(/[^0-9]/g, '')
export const waNumber = (n) => {
  const d = digits(n)
  return d.length === 10 ? '91' + d : d
}
export const waLink = (number, text = '') => `https://wa.me/${waNumber(number)}${text ? `?text=${encodeURIComponent(text)}` : ''}`
export const telLink = (n) => `tel:${String(n || '').replace(/[^0-9+]/g, '')}`

// Standard UPI deep link — opens GPay / PhonePe / Paytm with amount pre-filled
export const upiLink = ({ upiId, name, amount, note }) =>
  `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name || '')}&am=${(+amount || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note || '')}`

export const normalizePhone = (p) => {
  if (!p) return null
  let d = String(p).replace(/[^0-9+]/g, '')
  if (d.startsWith('+')) return '+' + d.replace(/[^0-9]/g, '')
  d = d.replace(/[^0-9]/g, '')
  if (d.length === 10) return '+91' + d
  if (d.length === 11 && d.startsWith('0')) return '+91' + d.slice(1)
  if (d.length === 12 && d.startsWith('91')) return '+' + d
  if (d.length >= 8 && d.length <= 15) return '+' + d
  return null
}
export const validIndianMobile = (p) => {
  const n = normalizePhone(p)
  if (!n) return false
  if (n.startsWith('+91')) return /^\+91[6-9]\d{9}$/.test(n)
  return true
}
export const prettyPhone = (n) => (n && n.startsWith('+91') ? `+91 ${n.slice(3, 8)} ${n.slice(8)}` : n || '')

export function toCSV(rows, cols) {
  const esc = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))].join('\n')
}
export function downloadCSV(name, rows, cols) {
  const blob = new Blob(['﻿' + toCSV(rows, cols)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// Days the baker takes no phone calls (app & WhatsApp only). 0 = Sunday.
export function callsToday(s, now = new Date()) {
  const off = s?.no_call_weekdays || []
  const dow = new Date(now.toLocaleString('en-US', { timeZone: s?.timezone || 'Asia/Kolkata' })).getDay()
  return !off.includes(dow)
}
export const NO_CALL_NOTE = 'Sundays are app & WhatsApp only — no calls, please.'

// Private order link (opens the order by tapping — no Order ID or mobile to type)
export const orderLink = (token) => (token ? `${location.origin}${location.pathname}#/o/${token}` : null)
