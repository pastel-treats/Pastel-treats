import React, { useCallback, useEffect, useRef, useState } from 'react'

// Simple photo editor for menu photos: crop, rotate / straighten, flip, light & colour, sharpen.
// Works on phones (touch) and computers. Everything happens on the device — the edited photo is then uploaded.
const ASPECTS = [['Free', 0], ['Square', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['4:3', 4 / 3], ['16:9', 16 / 9]]
const ADJ = [
  ['brightness', 'Brightness', -50, 50], ['contrast', 'Contrast', -50, 50], ['saturation', 'Colour', -60, 60],
  ['warmth', 'Warmth', -40, 40], ['highlights', 'Highlights', -50, 50], ['shadows', 'Shadows', -50, 50], ['sharpness', 'Sharpness', 0, 100],
]
const ZERO = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, highlights: 0, shadows: 0, sharpness: 0 }
const PREVIEW_MAX = 900
const OUT_MAX = 1600

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    if (!/^(data:|blob:)/.test(src)) img.crossOrigin = 'anonymous'
    img.onload = () => res(img); img.onerror = () => rej(new Error('Could not open this photo'))
    img.src = src
  })
}

// Draw the photo turned by quarter-turns + a small straighten angle, optionally flipped.
function drawRotated(img, { rot, angle, flipH, flipV }, max) {
  const quarter = ((rot % 360) + 360) % 360
  const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height
  const scale = Math.min(1, max / Math.max(sw, sh))
  const w = sw * scale, h = sh * scale
  const rad = ((quarter + angle) * Math.PI) / 180
  const W = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)))
  const H = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)))
  // straightening: zoom in a little so no empty corners show
  const a = Math.abs((angle * Math.PI) / 180)
  const zoom = angle ? Math.max((w * Math.cos(a) + h * Math.sin(a)) / w, (w * Math.sin(a) + h * Math.cos(a)) / h) : 1
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H)
  g.translate(W / 2, H / 2); g.rotate(rad); g.scale((flipH ? -1 : 1) * zoom, (flipV ? -1 : 1) * zoom)
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, -w / 2, -h / 2, w, h)
  return c
}

// Light & colour adjustments + optional sharpening, done pixel by pixel (works in every browser)
function applyAdjust(canvas, v) {
  const g = canvas.getContext('2d')
  const { width: W, height: H } = canvas
  const id = g.getImageData(0, 0, W, H), d = id.data
  const br = v.brightness * 1.6, ct = (100 + v.contrast * 1.4) / 100, sat = 1 + v.saturation / 50, warm = v.warmth * 0.8
  const hi = v.highlights / 100, sh = v.shadows / 100
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    let x = i / 255
    if (sh) x += sh * Math.max(0, 0.5 - x) * 1.2 * (1 - x)
    if (hi) x += hi * Math.max(0, x - 0.5) * 1.2 * x
    x = (x - 0.5) * ct + 0.5 + br / 255
    lut[i] = Math.round(x * 255)
  }
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]], gg = lut[d[i + 1]], b = lut[d[i + 2]]
    if (sat !== 1) { const l = 0.299 * r + 0.587 * gg + 0.114 * b; r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat }
    if (warm) { r += warm; b -= warm }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b
  }
  if (v.sharpness > 0) {
    const amt = v.sharpness / 100 * 0.9, src = new Uint8ClampedArray(d), w4 = W * 4
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * w4 + x * 4
      for (let k = 0; k < 3; k++) {
        const c = src[i + k], blur = (src[i + k - 4] + src[i + k + 4] + src[i + k - w4] + src[i + k + w4]) / 4
        d[i + k] = c + (c - blur) * amt * 2
      }
    }
  }
  g.putImageData(id, 0, 0)
}

// Rough "auto fix": stretch the light levels and add a touch of colour
function autoValues(canvas) {
  const g = canvas.getContext('2d'), d = g.getImageData(0, 0, canvas.width, canvas.height).data
  const hist = new Array(256).fill(0); let n = 0
  for (let i = 0; i < d.length; i += 16) { hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; n++ }
  let acc = 0, lo = 0, hi = 255, sum = 0
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc < n * 0.01) lo = i; sum += i * hist[i] }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc < n * 0.01) hi = i }
  const mean = sum / n, range = Math.max(40, hi - lo)
  return { ...ZERO, contrast: Math.max(-10, Math.min(30, Math.round((255 / range - 1) * 40))), brightness: Math.max(-20, Math.min(25, Math.round((128 - mean) / 4))), saturation: 10, sharpness: 25, shadows: mean < 110 ? 15 : 0 }
}

export default function ImageEditor({ src, onCancel, onSave, saveLabel = 'Save photo' }) {
  const [img, setImg] = useState(null)
  const [err, setErr] = useState(null)
  const [geo, setGeo] = useState({ rot: 0, angle: 0, flipH: false, flipV: false })
  const [adj, setAdj] = useState(ZERO)
  const [aspect, setAspect] = useState(0)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 1, h: 1 }) // fractions of the turned photo
  const [tab, setTab] = useState('crop')
  const [busy, setBusy] = useState(false)
  const [compare, setCompare] = useState(false)
  const view = useRef(null), box = useRef(null), drag = useRef(null), raf = useRef(0), base = useRef(null)

  useEffect(() => { loadImage(src).then(setImg).catch((e) => setErr(e.message)) }, [src])

  // preview: turned photo (cached) + adjustments
  useEffect(() => { if (img) base.current = drawRotated(img, geo, PREVIEW_MAX) }, [img, geo])
  useEffect(() => {
    if (!img || !base.current) return
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const c = view.current; if (!c) return
      const b = base.current
      c.width = b.width; c.height = b.height
      c.getContext('2d').drawImage(b, 0, 0)
      if (!compare) applyAdjust(c, { ...adj, sharpness: adj.sharpness * 0.6 })
    })
  }, [img, geo, adj, compare])

  const ratio = () => (base.current ? base.current.width / base.current.height : 1)
  const fitCrop = useCallback((a) => {
    if (!a) return setCrop({ x: 0, y: 0, w: 1, h: 1 })
    const r = ratio()
    let w = 1, h = r / a
    if (h > 1) { h = 1; w = a / r }
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
  }, [])
  useEffect(() => { fitCrop(aspect) }, [geo.rot, img, aspect, fitCrop])

  function down(e, mode) {
    e.preventDefault(); e.stopPropagation()
    const r = box.current.getBoundingClientRect()
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: crop, W: r.width, H: r.height }
    e.target.setPointerCapture?.(e.pointerId)
  }
  function move(e) {
    const dg = drag.current; if (!dg) return
    const dx = (e.clientX - dg.sx) / dg.W, dy = (e.clientY - dg.sy) / dg.H
    let { x, y, w, h } = dg.start
    const MIN = 0.08
    if (dg.mode === 'move') { x = Math.min(1 - w, Math.max(0, x + dx)); y = Math.min(1 - h, Math.max(0, y + dy)) }
    else {
      const left = dg.mode.includes('w'), top = dg.mode.includes('n')
      let nw = Math.max(MIN, w + (left ? -dx : dx)), nh = Math.max(MIN, h + (top ? -dy : dy))
      if (aspect) { const r = ratio(); nh = nw * r / aspect; if (nh < MIN) { nh = MIN; nw = nh * aspect / r } }
      let nx = left ? x + w - nw : x, ny = top ? y + h - nh : y
      if (nx < 0) { nw += nx; nx = 0; if (aspect) nh = nw * ratio() / aspect; if (top) ny = y + h - nh }
      if (ny < 0) { nh += ny; ny = 0; if (aspect) nw = nh * aspect / ratio(); if (left) nx = x + w - nw }
      if (nx + nw > 1) { nw = 1 - nx; if (aspect) { nh = nw * ratio() / aspect; if (top) ny = y + h - nh } }
      if (ny + nh > 1) { nh = 1 - ny; if (aspect) { nw = nh * aspect / ratio(); if (left) nx = x + w - nw } }
      x = nx; y = ny; w = nw; h = nh
    }
    setCrop({ x, y, w, h })
  }
  const up = () => { drag.current = null }

  async function save() {
    setBusy(true)
    try {
      await new Promise((r) => setTimeout(r, 30))
      const full = drawRotated(img, geo, 4000)
      const sx = Math.round(crop.x * full.width), sy = Math.round(crop.y * full.height)
      const sw = Math.max(1, Math.round(crop.w * full.width)), sh = Math.max(1, Math.round(crop.h * full.height))
      const scale = Math.min(1, OUT_MAX / Math.max(sw, sh))
      const out = document.createElement('canvas'); out.width = Math.round(sw * scale); out.height = Math.round(sh * scale)
      const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'
      g.drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height)
      applyAdjust(out, adj)
      const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.86))
      if (!blob) throw new Error('Could not save this photo')
      await onSave(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
    } catch (e) { setErr(e.message || String(e)); setBusy(false) }
  }

  const reset = () => { setGeo({ rot: 0, angle: 0, flipH: false, flipV: false }); setAdj(ZERO); setAspect(0); fitCrop(0) }
  const pct = (v) => `${v * 100}%`

  return (
    <div className="ie-back" role="dialog" aria-modal="true" aria-label="Edit photo">
      <div className="ie">
        <div className="ie-top">
          <button className="btn btn-white btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
          <b>Edit photo</b>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !img}>{busy ? 'Saving…' : saveLabel}</button>
        </div>
        <div className="ie-stage">
          {err && <div className="notice warn small">{err}</div>}
          {!img && !err && <div className="muted small">Opening photo…</div>}
          {img && (
            <div className="ie-box" ref={box} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <canvas ref={view} className="ie-canvas" />
              {tab === 'crop' && (
                <>
                  <div className="ie-shade" style={{ left: 0, top: 0, width: '100%', height: pct(crop.y) }} />
                  <div className="ie-shade" style={{ left: 0, top: pct(crop.y + crop.h), width: '100%', bottom: 0 }} />
                  <div className="ie-shade" style={{ left: 0, top: pct(crop.y), width: pct(crop.x), height: pct(crop.h) }} />
                  <div className="ie-shade" style={{ left: pct(crop.x + crop.w), top: pct(crop.y), right: 0, height: pct(crop.h) }} />
                  <div className="ie-crop" style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }} onPointerDown={(e) => down(e, 'move')}>
                    <i className="g1" /><i className="g2" /><i className="g3" /><i className="g4" />
                    {['nw', 'ne', 'sw', 'se'].map((m) => <span key={m} className={'h ' + m} onPointerDown={(e) => down(e, m)} />)}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="ie-tools">
          <div className="seg ie-tabs" role="tablist">
            {[['crop', 'Crop & turn'], ['light', 'Light & colour']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === 'crop' ? (
            <div className="stack" style={{ gap: 10 }}>
              <div className="chips">{ASPECTS.map(([l, a]) => <button key={l} type="button" className={'chip' + (aspect === a ? ' on' : '')} onClick={() => setAspect(a)}>{l}</button>)}</div>
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn btn-white btn-sm" onClick={() => setGeo((g) => ({ ...g, rot: g.rot - 90 }))}>⟲ Turn left</button>
                <button className="btn btn-white btn-sm" onClick={() => setGeo((g) => ({ ...g, rot: g.rot + 90 }))}>⟳ Turn right</button>
                <button className="btn btn-white btn-sm" onClick={() => setGeo((g) => ({ ...g, flipH: !g.flipH }))}>⇋ Flip</button>
                <button className="btn btn-white btn-sm" onClick={() => setGeo((g) => ({ ...g, flipV: !g.flipV }))}>⇵ Flip up/down</button>
              </div>
              <label className="ie-slider"><span>Straighten <b>{geo.angle}°</b></span>
                <input type="range" min={-15} max={15} step={0.5} value={geo.angle} onChange={(e) => setGeo((g) => ({ ...g, angle: +e.target.value }))} /></label>
              <p className="tiny muted" style={{ margin: 0 }}>Drag the box to move it, drag the corners to resize.</p>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <button className="btn btn-soft btn-sm" onClick={() => base.current && setAdj(autoValues(base.current))}>✨ Auto fix</button>
                <button className="btn btn-white btn-sm" onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)}>Hold to see original</button>
                <button className="btn btn-white btn-sm" onClick={() => setAdj(ZERO)}>Clear</button>
              </div>
              {ADJ.map(([k, l, min, max]) => (
                <label key={k} className="ie-slider"><span>{l} <b>{adj[k] > 0 ? '+' : ''}{adj[k]}</b></span>
                  <input type="range" min={min} max={max} value={adj[k]} onChange={(e) => setAdj((a) => ({ ...a, [k]: +e.target.value }))} onDoubleClick={() => setAdj((a) => ({ ...a, [k]: 0 }))} /></label>
              ))}
            </div>
          )}
          <button className="link-btn small" style={{ marginTop: 6 }} onClick={reset}>Start over</button>
        </div>
      </div>
    </div>
  )
}
