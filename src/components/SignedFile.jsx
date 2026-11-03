import React, { useEffect, useState } from 'react'
import { api } from '../api/index.js'
import { Spinner } from './ui.jsx'
export const isAudioPath = (p) => /^data:audio/.test(p || '') || /\.(webm|mp4|m4a|ogg|oga|mp3|aac|wav)$/i.test(p || '')

// A private upload (photo or voice note) shown to the baker through a short-lived link
export default function SignedFile({ path, label }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let live = true; api.fileUrl(path).then((u) => live && setUrl(u)).catch(() => {}); return () => { live = false } }, [path])
  if (isAudioPath(path)) return (
    <div className="voice-note" style={{ width: '100%' }}>
      <span aria-hidden="true">🎤</span>
      <span className="grow stack" style={{ gap: 4 }}><span className="small"><b>{label || 'Voice note'}</b></span>
        {url ? <audio controls src={url} preload="metadata" style={{ width: '100%', height: 36 }} /> : <span className="tiny muted">Loading…</span>}</span>
    </div>
  )
  if (!url) return <div className="u" style={{ display: 'grid', placeItems: 'center', background: 'var(--mint-wash)' }}><Spinner /></div>
  return <a className="u" href={url} target="_blank" rel="noreferrer" title={label}><img src={url} alt={label || 'Upload'} /></a>
}
