import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { api } from '../api/index.js'
import { cleanError } from '../lib/format.js'
import { Spinner, Empty } from '../components/ui.jsx'

// Opened from the private order link (e.g. tapped in WhatsApp) → straight to the order, nothing to type
export default function OrderLink() {
  const { token } = useParams()
  const { rememberOrder } = useStore()
  const nav = useNavigate()
  const [err, setErr] = useState(null)
  useEffect(() => {
    api.getOrderByLink(token)
      .then((r) => {
        rememberOrder({ number: r.order_number, phone: r.phone, at: r.created_at, link_token: token, status: r.status, total: r.total,
          date: r.confirmed_date || r.requested_date, fulfilment: r.fulfilment, items: (r.items || []).map((i) => `${i.qty > 1 ? i.qty + ' × ' : ''}${i.name}`).join(', ') })
        nav(`/order/${r.order_number}`, { replace: true })
      })
      .catch((e) => setErr(cleanError(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  if (err) return <div className="wrap"><Empty title="This order link didn’t work">{err}. <Link to="/track">Find your order another way</Link>.</Empty></div>
  return <Spinner />
}
