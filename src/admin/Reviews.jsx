import React, { useState } from 'react'
import { useAdmin, PageHead } from './AdminApp.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { fmtDate } from '../lib/dates.js'
import { Badge, Empty } from '../components/ui.jsx'

// Customers write reviews from their order link. Nothing shows on the home page until you approve it.
export default function Reviews() {
  const { db, reload, toast } = useAdmin()
  const [busy, setBusy] = useState(null)
  const [tab, setTab] = useState('new')
  const orders = new Map(db.orders.map((o) => [o.id, o]))
  const all = [...(db.reviews || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const list = all.filter((r) => (tab === 'new' ? !r.approved : r.approved))
  const act = async (r, fn, msg) => {
    setBusy(r.id)
    try { await fn(); await reload(); toast(msg) } catch (e) { toast(cleanError(e), true) } finally { setBusy(null) }
  }
  return (
    <>
      <PageHead title="Reviews" sub="Only customers with a real order can write a review. Approve the ones you want on the home page." />
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className={'chip' + (tab === 'new' ? ' on' : '')} onClick={() => setTab('new')}>Waiting for approval ({all.filter((r) => !r.approved).length})</button>
        <button className={'chip' + (tab === 'live' ? ' on' : '')} onClick={() => setTab('live')}>On the home page ({all.filter((r) => r.approved).length})</button>
      </div>
      {!list.length ? <Empty title={tab === 'new' ? 'No new reviews' : 'No reviews on the home page yet'}>{tab === 'new' ? 'When a customer reviews an order, it appears here for you to approve.' : 'Approve a review to show it to everyone.'}</Empty> : (
        <div className="stack">
          {list.map((r) => {
            const o = orders.get(r.order_id)
            return (
              <div key={r.id} className="card stack" style={{ gap: 8 }}>
                <div className="row between wrap">
                  <div className="stars" aria-label={`${r.rating} stars`}>{'★'.repeat(r.rating)}<span className="off">{'★'.repeat(5 - r.rating)}</span></div>
                  {r.approved ? <Badge tone="mint">On home page</Badge> : <Badge tone="butter">Waiting</Badge>}
                </div>
                <p style={{ margin: 0 }}>“{r.body}”</p>
                <div className="tiny muted">{o ? `${o.customer_name} · ${o.order_number}` : r.display_name} · {fmtDate(r.created_at.slice(0, 10), { year: true })} · shown as “{r.display_name}”</div>
                <div className="row" style={{ gap: 8 }}>
                  {r.approved
                    ? <button className="btn btn-white btn-sm" disabled={busy === r.id} onClick={() => act(r, () => api.update('reviews', r.id, { approved: false, approved_at: null }), 'Hidden from the home page')}>Hide</button>
                    : <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => act(r, () => api.update('reviews', r.id, { approved: true, approved_at: new Date().toISOString() }), 'Review is now on the home page')}>Approve & show</button>}
                  <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => { if (confirm('Delete this review for good?')) act(r, () => api.remove('reviews', r.id), 'Review deleted') }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
