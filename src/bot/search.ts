// Computer opponent search. Pure: no DOM, no worker APIs.
//
// Board layout: "line bitboards". For each player we keep one small int per line
// (7 columns, 6 rows, 11 diagonals, 12 anti-diagonals). Each int has one bit per
// cell along that line, so a win test is 4 lookups in a 128-entry table (has 4 in a
// row). Evaluation is a lookup per line too. Everything fits in 32-bit ints.
//
// Search: negamax + alpha-beta, center-first ordering, transposition table,
// forced-block pruning, iterative deepening with a time budget (hard).

import { COLS, ROWS } from '../../shared/game'

export type Level = 'easy' | 'medium' | 'hard'

export interface ChooseOpts {
  rng?: () => number
  /** unused now (fixed depth); kept for callers */
  timeMs?: number
}

const NCELLS = COLS * ROWS
const INF = 1_000_000_000
const WIN = 100_000
const MATE = WIN - 1000 // |score| above this is a forced result
const ORDER = [3, 2, 4, 1, 5, 0, 6]

// ---- line layout (per player block) ----
const ROW_OFF = COLS
const DG_OFF = COLS + ROWS // diagonal index: c - r + ROWS - 1
const AD_OFF = DG_OFF + COLS + ROWS - 1 // anti-diagonal index: c + r
const PL = AD_OFF + COLS + ROWS - 1 // ints per player

const lines = new Int32Array(PL * 2)
const heights = new Int8Array(COLS)
let nMoves = 0

// Position key: 7 bits per column (sentinel bit at height + first player's stones).
// Columns 0-3 in keyLo, 4-6 in keyHi. Unique per position (side to move follows from count).
const LO0 = 1 | (1 << 7) | (1 << 14) | (1 << 21)
const HI0 = 1 | (1 << 7) | (1 << 14)
let keyLo = LO0
let keyHi = HI0

// ---- tables ----
const HAS4 = new Uint8Array(1 << COLS)
for (let x = 0; x < HAS4.length; x++) HAS4[x] = x & (x >> 1) & (x >> 2) & (x >> 3) ? 1 : 0

const WSCORE = [0, 0, 3, 12, 0] // window with k own stones and no enemy stones
const CENTER = Array.from({ length: COLS }, (_, c) => Math.max(0, 3 - Math.abs(c - 3)))
const popcount = (x: number) => {
  let n = 0
  for (; x; x &= x - 1) n++
  return n
}

// span of bit positions used by each line
const lo = new Array<number>(PL).fill(99)
const hi = new Array<number>(PL).fill(-1)
const touch = (i: number, b: number) => {
  if (b < lo[i]) lo[i] = b
  if (b > hi[i]) hi[i] = b
}
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < ROWS; r++) {
    touch(c, r)
    touch(ROW_OFF + r, c)
    touch(DG_OFF + c - r + ROWS - 1, c)
    touch(AD_OFF + c + r, c)
  }
}

// score(mine, theirs) table for a line spanning bits a..b. Antisymmetric.
function buildTable(a: number, b: number, center: boolean): Int16Array {
  const size = 1 << COLS
  const t = new Int16Array(size * size)
  for (let m = 0; m < size; m++) {
    for (let o = 0; o < size; o++) {
      if (m & o) continue
      let s = 0
      for (let w = a; w + 3 <= b; w++) {
        const mask = 15 << w
        const cm = popcount(m & mask)
        const co = popcount(o & mask)
        if (co === 0) s += WSCORE[cm]
        else if (cm === 0) s -= WSCORE[co]
      }
      if (center) for (let c = 0; c < COLS; c++) s += ((m >> c) & 1) * CENTER[c] - ((o >> c) & 1) * CENTER[c]
      t[(m << COLS) | o] = s
    }
  }
  return t
}

const tableCache = new Map<string, Int16Array>()
const ACTIVE: number[] = []
const ACTIVE_TBL: Int16Array[] = []
for (let i = 0; i < PL; i++) {
  if (hi[i] - lo[i] + 1 < 4) continue
  const center = i >= ROW_OFF && i < DG_OFF
  const k = `${lo[i]}-${hi[i]}-${center}`
  let t = tableCache.get(k)
  if (!t) {
    t = buildTable(lo[i], hi[i], center)
    tableCache.set(k, t)
  }
  ACTIVE.push(i)
  ACTIVE_TBL.push(t)
}

// ---- transposition table (lazy, shared) ----
const TT_SIZE = 1 << 20
const TT_MASK = TT_SIZE - 1
const EXACT = 0
const LOWER = 1
const UPPER = 2
let ttLo: Int32Array
let ttHi: Int32Array
let ttVal: Int32Array
let ttDepth: Int8Array
let ttMeta: Uint8Array // flag | move << 2
let ttOwner: Level | null = null

function prepareTT(owner: Level) {
  if (!ttLo) {
    ttLo = new Int32Array(TT_SIZE)
    ttHi = new Int32Array(TT_SIZE)
    ttVal = new Int32Array(TT_SIZE)
    ttDepth = new Int8Array(TT_SIZE)
    ttMeta = new Uint8Array(TT_SIZE)
  } else if (ttOwner !== owner) {
    ttLo.fill(0) // keyLo is never 0 for a real position
  }
  ttOwner = owner
}

const slot = () => {
  let h = Math.imul(keyLo, 0x9e3779b1) ^ Math.imul(keyHi + 0x7f4a7c15, 0x85ebca6b)
  h ^= h >>> 15
  return h & TT_MASK
}

// ---- position ----
function make(c: number) {
  const h = heights[c]
  const p = nMoves & 1
  const b = p * PL
  lines[b + c] |= 1 << h
  lines[b + ROW_OFF + h] |= 1 << c
  lines[b + DG_OFF + c - h + ROWS - 1] |= 1 << c
  lines[b + AD_OFF + c + h] |= 1 << c
  const d = (1 << h) * (p === 0 ? 2 : 1)
  if (c < 4) keyLo += d << (7 * c)
  else keyHi += d << (7 * (c - 4))
  heights[c] = h + 1
  nMoves++
}

function unmake(c: number) {
  const h = heights[c] - 1
  nMoves--
  const p = nMoves & 1
  const b = p * PL
  lines[b + c] &= ~(1 << h)
  lines[b + ROW_OFF + h] &= ~(1 << c)
  lines[b + DG_OFF + c - h + ROWS - 1] &= ~(1 << c)
  lines[b + AD_OFF + c + h] &= ~(1 << c)
  const d = (1 << h) * (p === 0 ? 2 : 1)
  if (c < 4) keyLo -= d << (7 * c)
  else keyHi -= d << (7 * (c - 4))
  heights[c] = h
}

/** Would the player with line block `b` win by dropping in column c (landing at row h)? */
const isWin = (b: number, c: number, h: number) =>
  HAS4[lines[b + c] | (1 << h)] !== 0 ||
  HAS4[lines[b + ROW_OFF + h] | (1 << c)] !== 0 ||
  HAS4[lines[b + DG_OFF + c - h + ROWS - 1] | (1 << c)] !== 0 ||
  HAS4[lines[b + AD_OFF + c + h] | (1 << c)] !== 0

let thCol = -1

/** Any immediate win for player p? Sets thCol to it. */
function canWin(p: number): boolean {
  const b = p * PL
  for (let c = 0; c < COLS; c++) {
    const h = heights[c]
    if (h < ROWS && isWin(b, c, h)) {
      thCol = c
      return true
    }
  }
  return false
}

/** Number of columns where p wins immediately. Sets thCol to the last one. */
function threats(p: number): number {
  const b = p * PL
  let n = 0
  for (let c = 0; c < COLS; c++) {
    const h = heights[c]
    if (h < ROWS && isWin(b, c, h)) {
      n++
      thCol = c
    }
  }
  return n
}

function evaluate(p: number): number {
  const a = p * PL
  const b = (p ^ 1) * PL
  let s = 0
  for (let k = 0; k < ACTIVE.length; k++) {
    const i = ACTIVE[k]
    s += ACTIVE_TBL[k][(lines[a + i] << COLS) | lines[b + i]]
  }
  return s
}

// ---- search ----
let nodes = 0
let deadline = Infinity
let aborted = false
let useTT = false

function negamax(depth: number, alpha: number, beta: number, ply: number): number {
  if ((++nodes & 2047) === 0 && performance.now() > deadline) aborted = true
  if (aborted) return 0
  const p = nMoves & 1
  if (canWin(p)) return WIN - ply - 1
  if (nMoves >= NCELLS - 1) return 0
  const n = threats(p ^ 1)
  if (n > 1) return ply + 2 - WIN
  if (depth <= 0) return evaluate(p)
  const forced = n === 1 ? thCol : -1

  const alphaOrig = alpha
  let ttMove = -1
  let idx = 0
  if (useTT) {
    idx = slot()
    if (ttLo[idx] === keyLo && ttHi[idx] === keyHi) {
      const m = ttMeta[idx]
      ttMove = m >> 2
      if (ttDepth[idx] >= depth) {
        let v = ttVal[idx]
        if (v > MATE) v -= ply
        else if (v < -MATE) v += ply
        const flag = m & 3
        if (flag === EXACT) return v
        if (flag === LOWER) {
          if (v > alpha) alpha = v
        } else if (v < beta) beta = v
        if (alpha >= beta) return v
      }
    }
  }

  const betaOrig = beta
  let best = -INF
  let bestMove = -1
  for (let k = -1; k < COLS; k++) {
    let c: number
    if (k < 0) {
      if (ttMove < 0) continue
      c = ttMove
    } else {
      c = ORDER[k]
      if (c === ttMove) continue
    }
    if (heights[c] >= ROWS || (forced >= 0 && c !== forced)) continue
    make(c)
    // a forced block is free (no depth used): keeps threat sequences honest
    const s = -negamax(forced >= 0 ? depth : depth - 1, -beta, -alpha, ply + 1)
    unmake(c)
    if (aborted) return 0
    if (s > best) {
      best = s
      bestMove = c
      if (s > alpha) {
        alpha = s
        if (alpha >= beta) break
      }
    }
  }

  if (useTT && bestMove >= 0) {
    let v = best
    if (v > MATE) v += ply
    else if (v < -MATE) v -= ply
    const flag = best <= alphaOrig ? UPPER : best >= betaOrig ? LOWER : EXACT
    ttLo[idx] = keyLo
    ttHi[idx] = keyHi
    ttVal[idx] = v
    ttDepth[idx] = depth
    ttMeta[idx] = flag | (bestMove << 2)
  }
  return best
}

// top two root moves (exact scores), filled by rootSearch
let rBest = -1
let rBestS = -INF
let rSecond = -1
let rSecondS = -INF

/** Search candidate moves to `depth`. Returns false if the time budget ran out. */
function rootSearch(cands: number[], depth: number): boolean {
  let best = -1
  let bestS = -INF
  let second = -1
  let secondS = -INF
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]
    make(c)
    // window (secondS, INF): anything at or below secondS cannot be top two
    const s = -negamax(depth - 1, -INF, -secondS, 1)
    unmake(c)
    if (aborted) return false
    if (s > secondS) {
      if (s > bestS) {
        second = best
        secondS = bestS
        best = c
        bestS = s
      } else {
        second = c
        secondS = s
      }
    }
  }
  rBest = best
  rBestS = bestS
  rSecond = second
  rSecondS = secondS
  return true
}

function setup(moves: number[]) {
  lines.fill(0)
  heights.fill(0)
  nMoves = 0
  keyLo = LO0
  keyHi = HI0
  for (const c of moves) {
    if (!Number.isInteger(c) || c < 0 || c >= COLS || heights[c] >= ROWS) throw new Error(`Illegal move: column ${c}`)
    make(c)
  }
}

function legalCols(): number[] {
  const out: number[] = []
  for (const c of ORDER) if (heights[c] < ROWS) out.push(c)
  return out
}

export interface BotConfig {
  /** fixed search depth */
  depth: number
  /** easy: chance of a random move */
  randomP?: number
  /** easy: chance of seeing its own win */
  seeWinP?: number
  /** chance of playing a non-best (but safe) move */
  slipP?: number
  /** slip candidates: top N moves by score (excluding best) */
  slipTop?: number
  /** slip only if within this many points of best (Infinity = any) */
  slipMargin?: number
  /** use transposition table */
  tt?: boolean
}

// Tuned by src/bot/calibrate.ts
export const CONFIGS: Record<Level, BotConfig> = {
  easy: { depth: 2, randomP: 0.35, seeWinP: 0.6 },
  medium: { depth: 3, slipP: 0.2, slipTop: 3, slipMargin: Infinity },
  hard: { depth: 6, slipP: 0.1, slipTop: 1, slipMargin: 30, tt: true },
}

/** Score every candidate to `depth` (full window). Sorted best first. */
function scoreAll(cands: number[], depth: number): { c: number; s: number }[] {
  const out: { c: number; s: number }[] = []
  for (const c of cands) {
    make(c)
    const s = -negamax(depth - 1, -INF, INF, 1)
    unmake(c)
    out.push({ c, s })
  }
  return out.sort((x, y) => y.s - x.s)
}

/** Does playing c hand the opponent an immediate win? */
function givesWin(c: number): boolean {
  make(c)
  const r = canWin(nMoves & 1)
  unmake(c)
  return r
}

/**
 * Pick a column for the side to move. `moves` is the full move list.
 * Throws if the game is already full.
 */
export function chooseMove(moves: number[], level: Level, opts: ChooseOpts = {}): number {
  return chooseMoveWith(moves, CONFIGS[level], opts)
}

export function chooseMoveWith(moves: number[], cfg: BotConfig, opts: ChooseOpts = {}): number {
  const rng = opts.rng ?? Math.random
  setup(moves)
  const legal = legalCols()
  if (legal.length === 0) throw new Error('No legal moves')
  if (legal.length === 1) return legal[0]
  const p = nMoves & 1
  const easy = cfg.randomP !== undefined
  let cands = legal

  if (canWin(p)) {
    const w = thCol
    if (!easy || rng() < (cfg.seeWinP ?? 1)) return w
    cands = cands.filter((c) => c !== w)
  }
  // always block a single immediate threat (two threats: nothing to do, search picks)
  if (threats(p ^ 1) === 1) return thCol

  if (cfg.randomP && rng() < cfg.randomP) return cands[Math.floor(rng() * cands.length) % cands.length]

  useTT = !!cfg.tt
  if (useTT) prepareTT('hard')
  nodes = 0
  aborted = false
  deadline = Infinity // fixed depth; timeMs is ignored

  if (!cfg.slipP) {
    rootSearch(cands, cfg.depth)
    return rBest
  }
  if (!rootSearch(cands, cfg.depth)) return cands[0]
  if (rng() >= cfg.slipP) return rBest
  if (cfg.slipTop === 1) {
    if (rSecond >= 0 && rBestS < MATE && rSecondS > -MATE && rBestS - rSecondS <= (cfg.slipMargin ?? 0) && !givesWin(rSecond)) return rSecond
    return rBest
  }
  const ranked = scoreAll(cands, cfg.depth)
  const margin = cfg.slipMargin ?? Infinity
  const alts = ranked
    .slice(1, 1 + (cfg.slipTop ?? 2))
    .filter((x) => x.s > -MATE && ranked[0].s - x.s <= margin && !givesWin(x.c))
  if (ranked[0].s >= MATE || alts.length === 0) return ranked[0].c
  return alts[Math.floor(rng() * alts.length) % alts.length].c
}
