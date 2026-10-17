// Web Worker entry: runs the bot search off the main thread.

import { chooseMove } from './search'
import type { Level } from './search'

export interface BotRequest {
  id: number
  moves: number[]
  level: Level
}

export interface BotReply {
  id: number
  col: number
  error?: string
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<BotRequest>) => void) | null
  postMessage: (msg: BotReply) => void
}

ctx.onmessage = (e) => {
  const { id, moves, level } = e.data
  try {
    ctx.postMessage({ id, col: chooseMove(moves, level) })
  } catch (err) {
    ctx.postMessage({ id, col: -1, error: err instanceof Error ? err.message : String(err) })
  }
}
