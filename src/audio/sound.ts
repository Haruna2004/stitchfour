// Sample-based sound effects via Web Audio. Files live in public/sounds/ and are
// precached by the service worker. Missing files are skipped silently, so the
// game works before the final recordings exist.
import { getSettings } from '../lib/settings'

export type SoundName = 'drop' | 'tick' | 'win' | 'lose' | 'draw' | 'snip' | 'undo' | 'tap' | 'react'

const FILES: Record<SoundName, string[]> = {
  drop: ['/sounds/drop-1.mp3', '/sounds/drop-2.mp3', '/sounds/drop-3.mp3'],
  tick: ['/sounds/tick.mp3'],
  win: ['/sounds/win.mp3'],
  lose: ['/sounds/lose.mp3'],
  draw: ['/sounds/draw.mp3'],
  snip: ['/sounds/snip.mp3'],
  undo: ['/sounds/undo.mp3'],
  tap: ['/sounds/tap.mp3'],
  react: ['/sounds/react.mp3'],
}

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer | null>()

function context() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

async function load(url: string) {
  if (buffers.has(url)) return buffers.get(url) ?? null
  buffers.set(url, null)
  const c = context()
  if (!c) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await c.decodeAudioData(await res.arrayBuffer())
    buffers.set(url, buf)
    return buf
  } catch {
    return null
  }
}

/** Call from the first user gesture: unlocks audio on iOS and warms the cache. */
export function unlockAudio() {
  if (!context()) return
  for (const list of Object.values(FILES)) list.forEach((u) => void load(u))
}

/** opts.rate shifts pitch (e.g. by drop height); opts.volume 0..1. */
export function playSound(name: SoundName, opts: { rate?: number; volume?: number } = {}) {
  if (!getSettings().sound) return
  const c = context()
  if (!c) return
  const list = FILES[name]
  const url = list[Math.floor(Math.random() * list.length)]
  const buf = buffers.get(url)
  if (!buf) {
    void load(url)
    return
  }
  const src = c.createBufferSource()
  src.buffer = buf
  // Small random detune so repeated sounds don't feel mechanical.
  src.playbackRate.value = (opts.rate ?? 1) * (0.97 + Math.random() * 0.06)
  const gain = c.createGain()
  gain.gain.value = opts.volume ?? 1
  src.connect(gain).connect(c.destination)
  src.start()
}

export function haptic(pattern: number | number[] = 12) {
  if (!getSettings().haptics) return
  navigator.vibrate?.(pattern)
}
