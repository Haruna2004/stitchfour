// Pure pairing logic for the matchmaking lobby (party/lobby.ts).
import { REPAIR_MS, REPAIR_WAIT_MS, SEEK_TIMEOUT_MS } from '../shared/protocol'

export interface Seeker {
  id: string // connection id
  clientId: string
  since: number // epoch ms when they started looking
}

export type RecentPairs = Map<string, number> // pairKey -> epoch ms they were paired

export interface Plan {
  pairs: [Seeker, Seeker][]
  timedOut: Seeker[]
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Two seekers may pair unless they are the same player, or played each other recently and haven't both waited a while. */
export function canPair(a: Seeker, b: Seeker, recent: RecentPairs, now: number): boolean {
  if (a.clientId === b.clientId) return false
  const at = recent.get(pairKey(a.clientId, b.clientId))
  if (at === undefined || now - at >= REPAIR_MS) return true
  return now - a.since >= REPAIR_WAIT_MS && now - b.since >= REPAIR_WAIT_MS
}

/** FIFO by `since`: the longest waiter gets the next longest waiter they can pair with. */
export function planMatches(seekers: Seeker[], recent: RecentPairs, now: number): Plan {
  const timedOut: Seeker[] = []
  const live: Seeker[] = []
  for (const s of seekers) (now - s.since >= SEEK_TIMEOUT_MS ? timedOut : live).push(s)
  live.sort((a, b) => a.since - b.since || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const used = new Set<string>()
  const pairs: [Seeker, Seeker][] = []
  for (let i = 0; i < live.length; i++) {
    const a = live[i]
    if (used.has(a.id)) continue
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j]
      if (used.has(b.id) || !canPair(a, b, recent, now)) continue
      used.add(a.id)
      used.add(b.id)
      pairs.push([a, b])
      break
    }
  }
  return { pairs, timedOut }
}

/** Forget pairs older than the re-pair window. */
export function pruneRecent(recent: RecentPairs, now: number) {
  for (const [k, at] of recent) if (now - at >= REPAIR_MS) recent.delete(k)
}

/** Players looking right now; two tabs of one player count once. */
export const seekingCount = (seekers: Seeker[]) => new Set(seekers.map((s) => s.clientId)).size
