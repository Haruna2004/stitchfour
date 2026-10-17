// Main-thread wrapper around the bot worker.

import type { BotReply, BotRequest } from './bot.worker'
import type { Level } from './search'

export type { Level }

interface Pending {
  resolve: (col: number) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

const abortError = () => new DOMException('Bot request aborted', 'AbortError')

function failAll(err: Error) {
  for (const p of pending.values()) p.reject(err)
  pending.clear()
}

function getWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined') return null
  try {
    const w = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<BotReply>) => {
      const { id, col, error } = e.data
      const p = pending.get(id)
      if (!p) return // aborted or unknown
      pending.delete(id)
      if (error) p.reject(new Error(error))
      else p.resolve(col)
    }
    w.onerror = () => {
      failAll(new Error('Bot worker failed'))
      w.terminate()
      if (worker === w) worker = null
    }
    worker = w
    return w
  } catch {
    return null
  }
}

/** Ask the bot for a column. Never resolves sooner than the min delay (default random 400-800ms). */
export function askBot(
  moves: number[],
  level: Level,
  opts: { minDelayMs?: number; signal?: AbortSignal } = {},
): Promise<number> {
  const { signal } = opts
  const minDelay = opts.minDelayMs ?? 400 + Math.random() * 400
  if (signal?.aborted) return Promise.reject(abortError())

  return new Promise<number>((resolve, reject) => {
    const start = performance.now()
    const id = nextId++
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      done = true
      clearTimeout(timer)
      pending.delete(id)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (done) return
      finish()
      reject(abortError())
    }
    const onReply = (col: number) => {
      if (done) return
      const wait = Math.max(0, minDelay - (performance.now() - start))
      timer = setTimeout(() => {
        if (done) return
        finish()
        resolve(col)
      }, wait)
    }
    const onError = (err: Error) => {
      if (done) return
      finish()
      reject(err)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const w = getWorker()
    if (w) {
      pending.set(id, { resolve: onReply, reject: onError })
      const req: BotRequest = { id, moves: moves.slice(), level }
      w.postMessage(req)
      return
    }

    // No worker support: run on the main thread, yielding first.
    setTimeout(() => {
      if (done) return
      import('./search').then(
        ({ chooseMove }) => {
          if (done) return
          try {
            onReply(chooseMove(moves, level))
          } catch (err) {
            onError(err instanceof Error ? err : new Error(String(err)))
          }
        },
        (err) => onError(err instanceof Error ? err : new Error(String(err))),
      )
    }, 0)
  })
}
