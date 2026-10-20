// Anonymous usage events. No ids, names or room codes: see shared/events.ts and party/events.ts.
// Events queue in memory + localStorage and go out in small batches. Failures are silent.
import type { EventMap, EventName } from '../../shared/events'
import { MAX_EVENTS } from '../../shared/events'
import { getSettings } from './settings'

const KEY = 'stitchfour:events'
const ENDPOINT = '/api/event'
const CAP = 200 // queued events; oldest dropped
const MAX_AGE = 7 * 86_400_000
const BATCH = 20 // well under the server's 25 events / 4 KB
const DEBOUNCE_MS = 5000

interface Queued {
  t: number // queued at (ms); stays local, never sent
  e: EventName
  [prop: string]: unknown
}

// Game events are off unless VITE_GAME_EVENTS=1 at build time (needs Analytics Engine
// enabled + the EVENTS binding in wrangler.jsonc). Dev: log only, unless ?analytics=1.
const enabled = import.meta.env.VITE_GAME_EVENTS === '1'
const send = !import.meta.env.DEV || new URLSearchParams(location.search).has('analytics')

let mem: Queued[] = []

function read(): Queued[] {
  try {
    // storage is the truth (other tabs share it); memory is the fallback when it's blocked
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    mem = Array.isArray(raw) ? raw : []
  } catch {
    // blocked or corrupt: keep the in-memory queue
  }
  const min = Date.now() - MAX_AGE
  return mem.filter((q) => q && typeof q.e === 'string' && q.t > min)
}

function write(q: Queued[]) {
  mem = q.slice(-CAP)
  try {
    if (mem.length) localStorage.setItem(KEY, JSON.stringify(mem))
    else localStorage.removeItem(KEY)
  } catch {
    // storage full / blocked: memory queue still works
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

type Args<E extends EventName> = Record<never, never> extends EventMap[E] ? [props?: EventMap[E]] : [props: EventMap[E]]

export function track<E extends EventName>(e: E, ...args: Args<E>) {
  try {
    if (!enabled || !getSettings().analytics) return
    const props = args[0] ?? {}
    if (!send) return console.debug('[analytics]', e, props)
    write([...read(), { ...props, t: Date.now(), e }])
    if (read().length >= BATCH) void flush()
    else if (timer === undefined) timer = setTimeout(() => void flush(), DEBOUNCE_MS)
  } catch {
    // analytics never breaks the game
  }
}

/** Sends queued events. `beacon` = page is going away: use sendBeacon (survives unload). */
export async function flush(beacon = false) {
  clearTimeout(timer)
  timer = undefined
  try {
    if (!send || !navigator.onLine) return
    if (!getSettings().analytics) return discardQueued()
    // up to 4 batches per call; a batch is taken out of the queue first so other tabs don't resend it
    for (let i = 0; i < 4; i++) {
      const all = read()
      const batch = all.slice(0, Math.min(BATCH, MAX_EVENTS))
      if (!batch.length) return write([])
      write(all.slice(batch.length))
      const body = JSON.stringify({ events: batch.map(({ t: _t, ...rest }) => rest) })
      let ok = false
      try {
        if (beacon && navigator.sendBeacon) ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
        else {
          const res = await fetch(ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true })
          ok = res.status < 500 // a 4xx batch will never be accepted: drop it
        }
      } catch {
        // offline or blocked
      }
      if (!ok) {
        write([...batch, ...read()]) // retry later
        return
      }
    }
  } catch {
    // silent
  }
}

/** Opt-out: forget anything not yet sent. */
export function discardQueued() {
  write([])
}

export function initAnalytics() {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush(true))
  window.addEventListener('pagehide', () => void flush(true)) // iOS Safari
  window.addEventListener('online', () => void flush())
  setTimeout(() => void flush(), DEBOUNCE_MS) // leftovers from the last session
}

// --- environment (coarse, for app_open)
export function detectPlatform(): EventMap['app_open']['platform'] {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

export function detectDisplay(): EventMap['app_open']['display'] {
  const ios = (navigator as unknown as { standalone?: boolean }).standalone === true
  return ios || matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
}
