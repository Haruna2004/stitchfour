// Service worker + app updates. A new version waits until no game is in progress,
// then the screen fades softly and reloads. Mid-game, App shows an "Update ready" patch.
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import type { EventMap } from '../shared/events'
import { flush, track } from './lib/analytics'

export type UpdateStatus = 'none' | 'ready' | 'applying'

const CHECK_EVERY = 30 * 60_000
const MIN_GAP = 60_000 // never check more than once a minute
const FADE_MS = 420 // matches the veil fade in App
const TRIED_KEY = 'stitchfour:update-tried'
const DONE_KEY = 'stitchfour:updated'

let status: UpdateStatus = 'none'
let busy = false // a game is in progress (set by App)
let activate: (() => Promise<void>) | null = null
let activated = false // new worker already controls this tab (another tab applied it)
const subs = new Set<() => void>()

function set(s: UpdateStatus) {
  status = s
  subs.forEach((f) => f())
}

export function useUpdateStatus(): UpdateStatus {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => status,
  )
}

const session = {
  get(k: string) {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) sessionStorage.removeItem(k)
      else sessionStorage.setItem(k, v)
    } catch {
      // storage blocked: fine
    }
  },
}

/** True once, right after an update reload: App fades the screen back in. */
export const justUpdated = session.get(DONE_KEY) === '1'
session.set(DONE_KEY, null)

// a failed apply (worker never took over) shouldn't loop: back off for a bit
const recentlyTried = () => Date.now() - Number(session.get(TRIED_KEY) || 0) < 30_000

function reload() {
  session.set(DONE_KEY, '1')
  location.reload()
}

/** Fade, activate the waiting worker, reload. Safe to call any time an update is ready. */
export function applyUpdate(when: EventMap['update_applied']['when'] = 'idle') {
  if (status !== 'ready') return
  track('update_applied', { when })
  void flush(true) // the page reloads right away
  set('applying')
  session.set(TRIED_KEY, String(Date.now()))
  setTimeout(() => {
    if (activated || !activate) return reload()
    activate()
    // the 'controlling' event reloads us; if the worker never takes over, reload anyway
    setTimeout(reload, 4000)
  }, FADE_MS)
}

/** App reports whether a game is in progress. Never reloads mid-game. */
export function setGameInProgress(v: boolean) {
  busy = v
}

/** A fresh game is starting (new game, Play again, Rematch, mode switch): good moment to update. */
export function freshGame() {
  if (status === 'ready') applyUpdate('fresh')
}

function onReady() {
  if (status !== 'none') return
  set('ready')
  if (!busy && !recentlyTried()) applyUpdate()
}

function watchForUpdates(reg: ServiceWorkerRegistration) {
  let last = Date.now() // registering just checked
  const check = () => {
    if (!navigator.onLine || Date.now() - last < MIN_GAP || status !== 'none') return
    last = Date.now()
    reg.update().catch(() => {})
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
  setInterval(() => document.visibilityState === 'visible' && check(), CHECK_EVERY)
}

export function setupPWA() {
  if (import.meta.env.DEV) {
    // ?fakeUpdate=1 shows the "Update ready" flow without a service worker
    if (new URLSearchParams(location.search).has('fakeUpdate')) setTimeout(onReady, 600)
    return
  }
  if (!('serviceWorker' in navigator)) return
  try {
    activate = registerSW({
      immediate: true,
      onNeedRefresh: onReady,
      onNeedReload() {
        // new worker took over. If we asked for it (or nothing is at stake) reload; else wait.
        activated = true
        if (status === 'applying') reload()
        else if (!busy) applyUpdate()
      },
      onRegisteredSW(_url, reg) {
        if (reg) watchForUpdates(reg)
      },
    })
  } catch {
    // no worker: the app still works online
  }
}

// Install prompt (Android/desktop Chrome). iOS has no event; we show a hint instead.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
})

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const canPromptInstall = () => deferred !== null

export async function promptInstall() {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  track('install', { outcome })
  deferred = null
  return outcome === 'accepted'
}
