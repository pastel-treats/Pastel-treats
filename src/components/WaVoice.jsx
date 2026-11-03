import React from 'react'
import { useStore } from '../store.jsx'
import { waLink } from '../lib/contact.js'
import { Icon } from './ui.jsx'

// "Send a voice note" = open the baker's WhatsApp chat with the details typed in;
// the customer holds WhatsApp's own mic button. The note lands straight in her WhatsApp — nothing stored here.
export default function WaVoice({ text, label = 'Send a voice note on WhatsApp', hint = 'Opens WhatsApp with your cake details — then hold the 🎤 mic to record. Tamil or English is fine.' }) {
  const { settings: s } = useStore()
  if (!s.whatsapp) return null
  return (
    <div className="voice-note">
      <a className="btn btn-white btn-sm vn-btn" href={waLink(s.whatsapp, text)} target="_blank" rel="noreferrer"><Icon name="mic" size={18} /> {label}</a>
      <span className="tiny muted" style={{ flexBasis: "100%" }}>{hint}</span>
    </div>
  )
}
