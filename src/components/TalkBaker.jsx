import React from 'react'
import { useStore } from '../store.jsx'
import { waLink, telLink, callsToday, NO_CALL_NOTE } from '../lib/contact.js'
import { Icon, WaIcon } from './ui.jsx'

// "Message or call the baker" box — used for custom cake requests
export default function TalkBaker({ title = 'Want to discuss your design first?', sub = 'Send your idea or photos to the baker directly.', message = "Hi Pastel Treats! I'd like to request a custom cake.\nOccasion & date: \nSize / servings: \nMy idea: \nI'll share reference pictures here.", style }) {
  const { settings: s } = useStore()
  if (!s.whatsapp && !s.phone) return null
  return (
    <div className="talk-baker" style={style}>
      <div><b>{title}</b><div className="tiny muted">{sub}</div></div>
      <div className="row wrap" style={{ gap: 8 }}>
        {s.whatsapp && <a className="btn btn-wa btn-sm" target="_blank" rel="noreferrer" href={waLink(s.whatsapp, message)}><WaIcon size={18} /> Message the baker</a>}
        {s.phone && (callsToday(s)
          ? <a className="btn btn-white btn-sm" href={telLink(s.phone)}><Icon name="phone" size={16} /> Call the baker</a>
          : <span className="tiny muted">{NO_CALL_NOTE}</span>)}
      </div>
    </div>
  )
}
