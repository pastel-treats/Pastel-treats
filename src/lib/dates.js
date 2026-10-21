// Date helpers. All business dates are 'YYYY-MM-DD' strings in the bakery's timezone.
export const TZ_DEFAULT = 'Asia/Kolkata'

// Wall-clock "now" in the bakery timezone, encoded as a UTC millisecond value
export function wallNow(tz = TZ_DEFAULT, base = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(base).filter((p) => p.type !== 'literal').map((p) => [p.type, +p.value]),
  )
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}
export const todayISO = (tz) => isoFromWall(wallNow(tz))
export const isoFromWall = (ms) => new Date(ms).toISOString().slice(0, 10)
export const wallAt = (iso, hhmm = '00:00') => {
  const [y, m, d] = iso.split('-').map(Number)
  const [h, mi] = String(hhmm).split(':').map(Number)
  return Date.UTC(y, m - 1, d, h || 0, mi || 0)
}
export const addDaysISO = (iso, n) => isoFromWall(wallAt(iso) + n * 864e5)
export const dowISO = (iso) => new Date(wallAt(iso)).getUTCDay()
export const diffDays = (a, b) => Math.round((wallAt(b) - wallAt(a)) / 864e5)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export function fmtDate(iso, opts = {}) {
  if (!iso) return '—'
  const d = new Date(wallAt(String(iso).slice(0, 10)))
  const s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return (opts.weekday ? DAYS[d.getUTCDay()] + ', ' : '') + s + (opts.year ? ` ${d.getUTCFullYear()}` : '')
}
export function fmtDateTime(ts, tz = TZ_DEFAULT) {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ts))
}
// accepts wall-clock ms OR a server timestamp string without zone ("2026-10-12T09:00:00.12")
export const toWallMs = (v) => (typeof v === 'number' ? v : Date.parse(String(v).replace(' ', 'T').slice(0, 19) + 'Z'))
export const fmtWall = (v) => {
  const d = new Date(toWallMs(v))
  const h = d.getUTCHours(), m = d.getUTCMinutes()
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// Next occurrence (on/after today) of a yearly date, e.g. a birthday
export function nextOccurrence(iso, today) {
  const [, m, d] = iso.split('-').map(Number)
  const y = +today.slice(0, 4)
  const fix = (yy) => {
    const dd = m === 2 && d === 29 && !((yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0) ? 28 : d
    return `${yy}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }
  const thisYear = fix(y)
  return thisYear >= today ? thisYear : fix(y + 1)
}
