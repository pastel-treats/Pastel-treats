// "Install the app" support for Android (Chrome's install prompt) and iPhone (Add to Home Screen).
import { useEffect, useState } from 'react'

let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('pt-installed', '1') } catch {} notify() })
}

export function platform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
  const iPadOS = /Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios'
  // Only Google Chrome installs the app as a Google-signed package. Samsung Internet & other Android browsers
  // build their own package, which Google Play Protect blocks as "Unsafe app" — so we send those to Chrome.
  if (/Android/.test(ua)) return /SamsungBrowser|OPR\/|Opera|EdgA|Firefox|MiuiBrowser|HeyTapBrowser|VivoBrowser|UCBrowser|YaBrowser|DuckDuckGo|; wv\)/.test(ua) || !/Chrome\/\d/.test(ua) ? 'android-other' : 'android'
  return 'desktop'
}

// Links tapped inside WhatsApp / Instagram / Facebook open in their built-in browser, where apps can't be installed.
export function inAppBrowser() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|; wv\)/.test(ua)
}

// Android: open the current page in Chrome
export function chromeIntent() {
  const u = new URL(location.href)
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;end`
}

export function isInstalled() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => { const fn = () => force((n) => n + 1); listeners.add(fn); return () => listeners.delete(fn) }, [])
  return {
    canPrompt: !!deferred && ['android', 'desktop'].includes(platform()),
    installed: isInstalled(),
    platform: platform(),
    async prompt() {
      if (!deferred) return false
      deferred.prompt()
      const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }))
      deferred = null; notify()
      return outcome === 'accepted'
    },
  }
}

export function bannerDismissed() { try { return +localStorage.getItem('pt-install-dismissed') > Date.now() } catch { return false } }
export function dismissBanner(days = 14) { try { localStorage.setItem('pt-install-dismissed', String(Date.now() + days * 864e5)) } catch {} }
