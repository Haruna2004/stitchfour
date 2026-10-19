import { useSyncExternalStore } from 'react'
import type { Level } from '../bot/search'
import { randomName } from './names'

export type Mode = 'bot' | 'local' | 'online'
export type ThemePref = 'light' | 'dark' | 'system'

export interface Record3 {
  wins: number
  losses: number
  draws: number
}

export interface Settings {
  mode: Mode
  level: Level
  theme: ThemePref
  sound: boolean
  haptics: boolean
  analytics: boolean // share anonymous usage stats
  name: string
  clientId: string // stable id so the online room can give your seat back after a reconnect
  stats: {
    bot: Record<Level, Record3>
    online: Record3
    streak: number
    best: number
  }
}

const KEY = 'stitchfour:settings'
const empty = (): Record3 => ({ wins: 0, losses: 0, draws: 0 })

function defaults(): Settings {
  return {
    mode: 'bot',
    level: 'medium',
    theme: 'system',
    sound: true,
    haptics: true,
    analytics: true,
    name: randomName(),
    clientId: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    stats: { bot: { easy: empty(), medium: empty(), hard: empty() }, online: empty(), streak: 0, best: 0 },
  }
}

function load(): Settings {
  const d = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved && typeof saved === 'object') {
      return { ...d, ...saved, stats: { ...d.stats, ...saved.stats, bot: { ...d.stats.bot, ...saved.stats?.bot } } }
    }
  } catch {
    // private mode or corrupt data: fall back to defaults
  }
  return d
}

let current = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // storage full / blocked: settings still work for this session
  }
}
persist() // keep generated name + clientId stable from the first visit

export function getSettings() {
  return current
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(current) : patch
  current = { ...current, ...p }
  persist()
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

export type GameOutcome = 'win' | 'loss' | 'draw'

export function recordResult(kind: 'bot' | 'online', outcome: GameOutcome, level?: Level) {
  updateSettings((s) => {
    const stats = structuredClone(s.stats)
    const rec = kind === 'bot' ? stats.bot[level ?? s.level] : stats.online
    if (outcome === 'win') rec.wins++
    else if (outcome === 'loss') rec.losses++
    else rec.draws++
    stats.streak = outcome === 'win' ? stats.streak + 1 : outcome === 'loss' ? 0 : stats.streak
    stats.best = Math.max(stats.best, stats.streak)
    return { stats }
  })
}
