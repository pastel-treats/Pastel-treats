import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Menu from './pages/Menu.jsx'
import Product from './pages/Product.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import OrderView from './pages/OrderView.jsx'
import Track from './pages/Track.jsx'
import { Contact, Policies } from './pages/Info.jsx'
import GetApp from './pages/GetApp.jsx'
import OrderLink from './pages/OrderLink.jsx'
import { Spinner, Empty } from './components/ui.jsx'
import { useStore } from './store.jsx'

const Admin = lazy(() => import('./admin/AdminApp.jsx'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  const { data, error, reload } = useStore()
  const { pathname } = useLocation()
  if (pathname.startsWith('/admin'))
    return (
      <Suspense fallback={<Spinner />}>
        <ScrollTop />
        <Routes><Route path="/admin/*" element={<Admin />} /></Routes>
      </Suspense>
    )
  if (error) return <Empty title="We couldn’t load the menu">Please check your connection. <button className="btn btn-soft btn-sm" onClick={reload}>Try again</button></Empty>
  if (!data) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--mint)' }}><img src="logo.svg" alt="Pastel Treats" style={{ width: 240 }} /></div>
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="menu" element={<Menu />} />
          <Route path="menu/:cat" element={<Menu />} />
          <Route path="cake/:id" element={<Product />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="order/:number" element={<OrderView />} />
          <Route path="o/:token" element={<OrderLink />} />
          <Route path="track" element={<Track />} />
          <Route path="account" element={<Navigate to="/track" replace />} />
          <Route path="contact" element={<Contact />} />
          <Route path="policies" element={<Policies />} />
          <Route path="app" element={<GetApp />} />
          <Route path="*" element={<Empty title="Page not found">That page has been eaten. <a href="#/">Go home</a></Empty>} />
        </Route>
      </Routes>
    </>
  )
}
