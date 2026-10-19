// Cloudflare Web Analytics (cookie-less page views). Production only, and only when
// VITE_CF_BEACON_TOKEN was set at build time. Loads late and never blocks the game.
import { getSettings } from './settings'

const SRC = 'https://static.cloudflareinsights.com/beacon.min.js'

export function setupBeacon() {
  const token = import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined
  if (!import.meta.env.PROD || !token || !getSettings().analytics) return

  const inject = () => {
    if (document.querySelector(`script[src="${SRC}"]`)) return
    const s = document.createElement('script')
    s.defer = true
    s.src = SRC
    s.dataset.cfBeacon = JSON.stringify({ token, spa: false })
    document.head.append(s)
  }
  // offline at load: wait for the network
  if (navigator.onLine) inject()
  else window.addEventListener('online', inject, { once: true })
}
