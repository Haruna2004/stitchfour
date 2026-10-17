// Messages between the browser and the online room (party/room.ts).
import type { Player } from './game'

export const PARTY = 'stitch-room' // kebab-case of the StitchRoom binding
export const TURN_MS = 60_000
export const RECONNECT_MS = 60_000
export const NAME_MAX = 20

// Room codes avoid look-alike characters (0/O, 1/I/L).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export const REACTIONS = [
  'Hurry up',
  'Nice trick',
  'Cool',
  'Good game',
  'Oops',
  '😂',
  '😮',
  '🔥',
  '😤',
  '👏',
] as const
export type ReactionId = number // index into REACTIONS

export type EndReason = 'four' | 'draw' | 'timeout' | 'forfeit'

export interface Seat {
  name: string
  connected: boolean
}

export interface RoomState {
  code: string
  seats: { 1: Seat | null; 2: Seat | null }
  moves: number[]
  starter: Player
  status: 'waiting' | 'playing' | 'over'
  result: { winner: Player | 0; reason: EndReason } | null
  turnDeadline: number | null // epoch ms when the current turn times out
  rematch: { 1: boolean; 2: boolean }
  round: number
}

export type ClientMsg =
  | { t: 'hello'; clientId: string; name: string }
  | { t: 'move'; col: number; ply: number } // ply = moves.length the client saw, guards double taps
  | { t: 'react'; id: ReactionId }
  | { t: 'rename'; name: string }
  | { t: 'rematch' }
  | { t: 'leave' }

export type ServerMsg =
  | { t: 'state'; room: RoomState; you: Player | null; now: number }
  | { t: 'react'; from: Player; id: ReactionId }
  | { t: 'error'; code: 'full' | 'bad-move' | 'bad-msg'; message: string }

export function randomCode(rand: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)]
  return s
}

export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== CODE_LENGTH) return null
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null
  return s
}

export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
