import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api/index.js'
import { notYetOpen } from './lib/announcements.js'

const Ctx = createContext(null)
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }

export function StoreProvider({ children }) {
  // last menu is kept on the phone: the shop opens instantly and still shows the menu if the network is slow
  const [data, setData] = useState(() => read('pt-menu-cache', null))
  const [error, setError] = useState(null)
  const [cart, setCart] = useState(() => read('pt-cart-v2', []))
  const [toasts, setToasts] = useState([])
  const [myOrders, setMyOrders] = useState(() => read('pt-my-orders', []))

  const reload = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const d = await api.loadStore()
        setData(d); setError(null); write('pt-menu-cache', d)
        return
      } catch (e) {
        if (attempt === 2) { setError(e.message); return }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    }
  }, [])
  useEffect(() => { reload() }, [reload])
  // The bakery cleared all test orders ("fresh start"): forget old orders, cart and half-filled checkout on this phone too.
  useEffect(() => {
    const resetAt = data?.settings?.data_reset_at
    if (!resetAt) return
    let seen = null
    try { seen = localStorage.getItem('pt-reset-seen') } catch { /* private mode */ }
    if (seen === resetAt) return
    const cut = Date.parse(resetAt)
    setMyOrders((m) => m.filter((o) => o.at && Date.parse(o.at) > cut))
    setCart([])
    try {
      ['pt-checkout-draft', 'pt-idem', 'pt-pay-pending'].forEach((k) => sessionStorage.removeItem(k))
      localStorage.setItem('pt-reset-seen', resetAt)
    } catch { /* ignore */ }
  }, [data?.settings?.data_reset_at])
  useEffect(() => write('pt-cart-v2', cart), [cart])
  // Before the opening time, tick every second so every screen (checkout too) switches on by itself at that moment
  const [clock, setClock] = useState(0)
  const waiting = notYetOpen(data?.settings)
  useEffect(() => { if (!waiting) return; const t = setInterval(() => setClock((n) => n + 1), 1000); return () => clearInterval(t) }, [waiting])
  useEffect(() => write('pt-my-orders', myOrders), [myOrders])

  const toast = useCallback((msg, isErr = false) => {
    const id = Math.random()
    setToasts((t) => [...t, { id, msg, isErr }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), isErr ? 5200 : 3200)
  }, [])

  const value = useMemo(() => ({
    data, error, reload, toast,
    settings: data?.settings || {},
    cart,
    addToCart: (line) => setCart((c) => [...c, { ...line, key: Math.random().toString(36).slice(2) }]),
    updateLine: (key, patch) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l))),
    removeLine: (key) => setCart((c) => c.filter((l) => l.key !== key)),
    clearCart: () => setCart([]),
    myOrders,
    forgetOrder: (number) => setMyOrders((m) => m.filter((x) => x.number !== number)),
    rememberOrder: (o) => setMyOrders((m) => [{ ...(m.find((x) => x.number === o.number) || {}), ...o }, ...m.filter((x) => x.number !== o.number)].slice(0, 30)),
    clock,
  }), [data, error, reload, toast, cart, myOrders, clock])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast' + (t.isErr ? ' err' : '')}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  )
}
export const useStore = () => useContext(Ctx)
