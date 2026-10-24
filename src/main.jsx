import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import './styles.css'

// Password reset e-mail link → open the "set a new password" page (the code in the URL is read by the database client)
if (new URLSearchParams(location.search).has('pt-confirm') && !location.hash.startsWith('#/admin')) location.hash = '#/admin'
if (new URLSearchParams(location.search).has('pt-reset') && !location.hash.startsWith('#/admin/reset')) location.hash = '#/admin/reset'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
)

// Offline support & "Add to Home Screen" (only on real hosting, not inside the native shell's file://)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}))
}
