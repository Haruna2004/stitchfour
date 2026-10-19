// Pure abuse limits and message validation for the room server.
import { COLS, ROWS } from '../shared/game'
import { REACTIONS, type ClientMsg, type LobbyClientMsg } from '../shared/protocol'

export const MAX_MSG_BYTES = 1024
export const MAX_CONNECTIONS = 6 // 2 players plus a few reconnecting sockets
export const MAX_STRING = 64 // name / clientId, before cleaning
export const MAX_LOBBY_MSG_BYTES = 256
export const MAX_LOBBY_CONNECTIONS = 2000

export const BUCKET_BURST = 10
export const BUCKET_REFILL_PER_S = 4
export const ABUSE_WINDOW_MS = 10_000
export const ABUSE_MAX_MSGS = 60
export const TYPE_COOLDOWN_MS: Partial<Record<ClientMsg['t'], number>> = { react: 1200, rename: 2000 }

export interface Limiter {
  tokens: number
  refilledAt: number
  windowStart: number
  windowCount: number
  lastByType: Partial<Record<string, number>>
}

export type Verdict = 'ok' | 'drop' | 'abuse'

export function createLimiter(now: number): Limiter {
  return { tokens: BUCKET_BURST, refilledAt: now, windowStart: now, windowCount: 0, lastByType: {} }
}

// Call once per incoming message. 'drop' = ignore silently, 'abuse' = disconnect.
export function check(l: Limiter, type: string, now: number): Verdict {
  if (now - l.windowStart >= ABUSE_WINDOW_MS) {
    l.windowStart = now
    l.windowCount = 0
  }
  if (++l.windowCount > ABUSE_MAX_MSGS) return 'abuse'

  l.tokens = Math.min(BUCKET_BURST, l.tokens + ((now - l.refilledAt) / 1000) * BUCKET_REFILL_PER_S)
  l.refilledAt = now

  const cooldown = TYPE_COOLDOWN_MS[type as ClientMsg['t']]
  const last = l.lastByType[type]
  if (cooldown && last !== undefined && now - last < cooldown) return 'drop'
  if (l.tokens < 1) return 'drop'
  l.tokens -= 1
  if (cooldown) l.lastByType[type] = now
  return 'ok'
}

export function byteSize(raw: string | ArrayBuffer | ArrayBufferView): number {
  if (typeof raw === 'string') {
    // Each UTF-16 unit is at most 3 UTF-8 bytes; avoid encoding huge strings.
    return raw.length > MAX_MSG_BYTES ? raw.length : new TextEncoder().encode(raw).length
  }
  return raw.byteLength
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

const isStr = (v: unknown, min: number): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= MAX_STRING

// Strictly validates a decoded message; returns null when malformed.
export function parseClientMsg(text: string): ClientMsg | null {
  let m: unknown
  try {
    m = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return null
  const o = m as Record<string, unknown>
  switch (o.t) {
    case 'hello':
      return isStr(o.clientId, 1) && isStr(o.name, 0) ? { t: 'hello', clientId: o.clientId, name: o.name } : null
    case 'move':
      return isInt(o.col, 0, COLS - 1) && isInt(o.ply, 0, COLS * ROWS) ? { t: 'move', col: o.col, ply: o.ply } : null
    case 'react':
      return isInt(o.id, 0, REACTIONS.length - 1) ? { t: 'react', id: o.id } : null
    case 'rename':
      return isStr(o.name, 0) ? { t: 'rename', name: o.name } : null
    case 'rematch':
      return { t: 'rematch' }
    case 'leave':
      return { t: 'leave' }
    default:
      return null
  }
}

// Lobby messages (party/lobby.ts).
export function parseLobbyMsg(text: string): LobbyClientMsg | null {
  let m: unknown
  try {
    m = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return null
  const o = m as Record<string, unknown>
  if (o.t === 'seek') return isStr(o.clientId, 1) ? { t: 'seek', clientId: o.clientId } : null
  if (o.t === 'cancel') return { t: 'cancel' }
  return null
}
