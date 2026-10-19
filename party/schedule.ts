// Pure alarm scheduling for a room. One Durable Object alarm serves the turn
// clock, the reconnect forfeit and idle cleanup, so it is the min of all due times.
import type { Player } from '../shared/game'
import { RECONNECT_MS, type RoomState } from '../shared/protocol'

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // idle rooms are deleted after this

export interface ClockState {
  status: RoomState['status']
  turnDeadline: number | null
  goneSince: { 1: number | null; 2: number | null } // when each seat disconnected
  lastActive: number
  live: number // open sockets right now
}

export interface Due {
  forfeit: Player | null // seat that stayed away too long (the other side wins)
  timeout: boolean
  cleanup: boolean
}

// Cleanup applies in any status, so a lone waiting host is covered too.
export const cleanupAt = (s: ClockState): number | null => (s.live === 0 ? s.lastActive + ROOM_TTL_MS : null)

function forfeitTimes(s: ClockState): [Player, number][] {
  if (s.status !== 'playing') return []
  const out: [Player, number][] = []
  for (const p of [1, 2] as Player[]) {
    const gone = s.goneSince[p]
    if (gone) out.push([p, gone + RECONNECT_MS])
  }
  return out
}

export function dueActions(s: ClockState, now: number): Due {
  const forfeit = forfeitTimes(s).find(([, at]) => now >= at)?.[0] ?? null
  const timeout = s.status === 'playing' && !!s.turnDeadline && now >= s.turnDeadline
  const c = cleanupAt(s)
  return { forfeit, timeout, cleanup: c !== null && now >= c }
}

export function nextAlarm(s: ClockState): number | null {
  const times = forfeitTimes(s).map(([, at]) => at)
  if (s.status === 'playing' && s.turnDeadline) times.push(s.turnDeadline)
  const c = cleanupAt(s)
  if (c !== null) times.push(c)
  return times.length ? Math.min(...times) : null
}
