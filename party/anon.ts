// Anonymous (matched) rooms: the server picks both names, clients can't change them.
import type { Player } from '../shared/game'
import { cleanName } from '../shared/protocol'

export type AssignedNames = [string, string] | null // seat 1, seat 2; null = normal room

/** The name a seat gets on hello. Matched rooms ignore what the client sent. */
export function helloName(assigned: AssignedNames, seat: Player, requested: string): string {
  if (assigned) return assigned[seat - 1]
  return cleanName(requested) || 'Player'
}

/** A rename to apply, or null to ignore it. */
export function renameTo(assigned: AssignedNames, requested: string): string | null {
  if (assigned) return null
  return cleanName(requested) || null
}

/** Valid server-made name pair (guards the RPC input). */
export const validPair = (v: unknown): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'string' && n.length > 0 && cleanName(n) === n) && v[0] !== v[1]
