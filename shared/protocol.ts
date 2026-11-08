// Messages between the browser and the online room (party/room.ts).
import type { Player } from './game'

export const PARTY = 'stitch-room' // kebab-case of the StitchRoom binding
export const TURN_MS = 120_000
export const RECONNECT_MS = 60_000
export const NAME_MAX = 20

// Matchmaking lobby (party/lobby.ts): one global instance.
export const LOBBY_PARTY = 'lobby' // kebab-case of the Lobby binding
export const LOBBY_ROOM = 'main'
export const SEEK_TIMEOUT_MS = 5 * 60_000 // seekers are dropped after this
export const REPAIR_MS = 2 * 60_000 // don't re-pair the same two players within this...
export const REPAIR_WAIT_MS = 15_000 // ...unless both have waited this long

// Room codes avoid look-alike characters (0/O, 1/I/L).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export const REACTIONS = [
  'Hurry up',
  'Nice trick',
  'Cool',
  'Good game',
  'Oops',
  '❤️',
  '😂',
  '😮',
  '🔥',
  '🙄',
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
  anonymous: boolean // matched game: server-assigned names, no renames
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

export type LobbyClientMsg = { t: 'seek'; clientId: string } | { t: 'cancel' }

export type LobbyServerMsg =
  | { t: 'count'; seeking: number } // players looking right now, you included
  | { t: 'matched'; code: string }
  | { t: 'error'; code: 'timeout' | 'bad-msg' | 'busy'; message: string }

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
