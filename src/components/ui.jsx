import React, { useEffect } from 'react'
import { ORDER_STATUS, PAYMENT_STATUS } from '../lib/format.js'

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
const paths = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>,
  cake: <><path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" /><path d="M4 15c2 1.3 4 1.3 6 0s4-1.3 6 0 3 1 4 0" /><path d="M12 11V7" /><path d="M12 4.5c.8.7.8 1.6 0 2.3-.8-.7-.8-1.6 0-2.3z" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  insta: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" /></>,
  map: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  left: <path d="m15 5-7 7 7 7" />,
  right: <path d="m9 5 7 7-7 7" />,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  gift: <><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M3 13h18M12 9v12" /><path d="M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6 0 6-1.5S14 5 12 9z" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  truck: <><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  store: <><path d="M4 9h16l-1-5H5z" /><path d="M5 9v11h14V9" /><path d="M10 20v-6h4v6" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="15" r="1" fill="currentColor" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a7 7 0 0 1 4 6" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15 9a3 3 0 0 1 0 6" /><path d="M18 6a7 7 0 0 1 0 12" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
}
export const Icon = ({ name, size = 22, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...P} aria-hidden="true" {...rest}>{paths[name]}</svg>
)
export const WaIcon = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.1c1.9 1 4 1.6 6.1 1.6 7 0 12.7-5.7 12.7-12.6C28.7 8.6 23 3 16 3zm0 23.2c-2 0-3.9-.6-5.5-1.6l-.4-.2-4.1 1.2 1.3-4-.3-.4a10.4 10.4 0 0 1-1.7-5.6C5.3 9.8 10.1 5.1 16 5.1s10.6 4.7 10.6 10.5S21.9 26.2 16 26.2zm5.8-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.2 1.4 3.4c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z" /></svg>
)

const TINTS = [['#ffebf4', '#ffdac1'], ['#bfebef', '#d9efe6'], ['#ffec9d', '#ffebf4'], ['#eafeb4', '#bfebef'], ['#ffdac1', '#ffec9d']]
// Pastel placeholder used when a product has no photograph yet (admin can upload one any time)
export function ProductArt({ name = '', seed = 0 }) {
  const [a, b] = TINTS[Math.abs(seed) % TINTS.length]
  return (
    <div className="art" style={{ background: `linear-gradient(140deg, ${a}, ${b})` }} aria-label={name}>
      <span className="blob" style={{ width: '55%', height: '55%', background: 'rgba(255,255,255,.45)', top: '-12%', right: '-12%' }} />
      <span className="blob" style={{ width: '22%', height: '22%', background: '#a1d7c2', bottom: '14%', left: '12%', opacity: 0.55 }} />
      <span className="blob" style={{ width: '12%', height: '12%', background: '#fff', bottom: '30%', left: '30%', opacity: 0.7 }} />
      <span className="mono">{name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')}</span>
    </div>
  )
}
export const hashStr = (s = '') => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
export const isAiImage = (src) => /(^|\/)ai-[^/]*$/.test(src || '')
// Small corner label: is this a real photo of her bake, or an AI illustration?
export const ImageKind = ({ src }) => src ? <span className={'img-kind' + (isAiImage(src) ? ' ai' : '')}>{isAiImage(src) ? 'AI illustration' : 'Real photo'}</span> : null
export function ProductImage({ product, index = 0, label = true }) {
  const src = product?.images?.[index]
  if (src) return <>{<img src={src} alt={product.name} loading="lazy" />}{label && <ImageKind src={src} />}</>
  return <ProductArt name={product?.name} seed={hashStr(product?.name)} />
}

export const Badge = ({ tone = 'mint', children }) => <span className={`badge t-${tone}`}>{children}</span>
export const StatusBadge = ({ s, short = true }) => <Badge tone={ORDER_STATUS[s]?.tone}>{(short && ORDER_STATUS[s]?.short) || ORDER_STATUS[s]?.label || s}</Badge>
export const PayBadge = ({ s }) => <Badge tone={PAYMENT_STATUS[s]?.tone}>{PAYMENT_STATUS[s]?.label || s}</Badge>
export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />

export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span>{label} {hint && <em className="hint" style={{ fontStyle: 'normal' }}>· {hint}</em>}</span>
      {children}
      {error && <span className="err-text">{error}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in" role="dialog" aria-label={title} style={wide ? { maxWidth: 980 } : null}>
        <div className="modal-head"><h2 style={{ fontSize: '1.6rem' }}>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="empty fade-in">
      <svg className="art-sm" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="64" r="44" fill="#eef8f3" />
        <rect x="32" y="62" width="56" height="30" rx="8" fill="#ffebf4" />
        <path d="M32 72c6 5 12 5 18 0s12-5 18 0 12 5 20 0" stroke="#d98a9e" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="40" y="46" width="40" height="18" rx="6" fill="#ffdac1" />
        <rect x="58" y="32" width="4" height="14" rx="2" fill="#a1d7c2" />
        <circle cx="60" cy="28" r="4" fill="#ffec9d" />
      </svg>
      <h3>{title}</h3>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

export const Switch = ({ checked, onChange, label }) => (
  <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
    <span className="switch"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span /></span>
    {label && <span className="small">{label}</span>}
  </label>
)

// Compress a photo in the browser before upload (keeps uploads small on mobile data)
export async function compressImage(file, max = 1400, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/heic') return file
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality))
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
}
export const ACCEPT_IMG = 'image/jpeg,image/png,image/webp,image/heic'
export const MAX_UPLOAD_MB = 5
