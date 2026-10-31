import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { notYetOpen, opensAtMs, opensLabel } from '../lib/announcements.js'
import { wallNow } from '../lib/dates.js'

// Big launch countdown on the home page. Ticks every second, disappears by itself at the opening time
// (ordering switches on at that same moment — the server checks the time too).
export default function LaunchCountdown() {
  const { settings: s } = useStore()
  const [, tick] = useState(0)
  const waiting = notYetOpen(s)
  useEffect(() => { if (!waiting) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [waiting])
  if (!waiting) return null
  const left = Math.max(0, opensAtMs(s) - wallNow(s.timezone))
  const parts = [['Days', Math.floor(left / 864e5)], ['Hours', Math.floor(left / 36e5) % 24], ['Minutes', Math.floor(left / 6e4) % 60], ['Seconds', Math.floor(left / 1e3) % 60]]
  const shown = parts[0][1] > 0 ? parts : parts.slice(1)
  return (
    <section className="launch-cd" aria-live="off">
      <div className="wrap">
        <div className="lc-card">
          <div className="lc-eyebrow">✨ Make a wish at 11:11 ✨</div>
          <h2 className="lc-title">Online orders open in</h2>
          <div className="lc-boxes" role="timer" aria-label={`Orders open on ${opensLabel(s)}`}>
            {shown.map(([l, v], i) => (
              <React.Fragment key={l}>
                {i > 0 && <span className="lc-colon" aria-hidden="true">:</span>}
                <div className="lc-box"><b>{String(v).padStart(2, '0')}</b><span>{l}</span></div>
              </React.Fragment>
            ))}
          </div>
          <div className="lc-when">{opensLabel(s)}</div>
          <p className="lc-note">Browse the menu and fill your cart now — ordering switches on the moment the timer ends.</p>
        </div>
      </div>
    </section>
  )
}
