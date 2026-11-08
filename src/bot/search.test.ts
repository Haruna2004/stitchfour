import { describe, expect, it } from 'vitest'
import { COLS, fromMoves, newGame, play, validMoves } from '../../shared/game'
import type { GameState } from '../../shared/game'
import { CONFIGS, chooseMove, chooseMoveWith } from './search'
import type { BotConfig, Level } from './search'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// rng that never triggers the easy bot's random slips and always lets it see wins/blocks
const calm = () => 0.5

type Player = (s: GameState) => number

const randomPlayer =
  (rng: () => number): Player =>
  (s) => {
    const m = validMoves(s)
    return m[Math.floor(rng() * m.length)]
  }

const botPlayer =
  (level: Level, rng: () => number, timeMs?: number): Player =>
  (s) =>
    chooseMove(s.moves, level, { rng, timeMs })

/** Returns 1 if `a` wins, 2 if `b` wins, 0 for a draw. `a` moves first when aFirst. */
function duel(a: Player, b: Player, aFirst: boolean): 0 | 1 | 2 {
  let s = newGame(1)
  while (!s.winner && !s.draw) {
    const aTurn = (s.turn === 1) === aFirst
    s = play(s, (aTurn ? a : b)(s))
  }
  if (!s.winner) return 0
  return (s.winner === 1) === aFirst ? 1 : 2
}

function tournament(mk: (i: number) => [Player, Player], games: number) {
  let aWins = 0
  let bWins = 0
  for (let i = 0; i < games; i++) {
    const [a, b] = mk(i)
    const r = duel(a, b, i % 2 === 0)
    if (r === 1) aWins++
    else if (r === 2) bWins++
  }
  return { aWins, bWins, draws: games - aWins - bWins }
}

const levels: Level[] = ['easy', 'medium', 'hard']
const fast = { rng: calm, timeMs: 100 }
const always0 = () => 0 // worst case rng for easy: random slips + misses
const OLD_MEDIUM: BotConfig = { depth: 6, slipP: 0.12, slipTop: 1, slipMargin: 40, tt: true }

describe('immediate win', () => {
  const cases: [string, number[], number][] = [
    ['horizontal', [0, 0, 1, 1, 2, 2], 3],
    ['vertical', [0, 1, 0, 1, 0, 1], 0],
    ['diagonal', [0, 1, 1, 2, 2, 3, 2, 3, 5, 3], 3],
  ]
  for (const level of levels) {
    for (const [name, moves, col] of cases) {
      it(`${level} takes ${name} win`, () => {
        expect(chooseMove(moves, level, fast)).toBe(col)
      })
    }
  }
})

describe('blocking', () => {
  // p1 has 0,1,2 on the bottom row, p2 to move
  const horizontal = [0, 0, 1, 1, 2]
  // p1 stacked three in col 4, p2 to move
  const vertical = [4, 0, 4, 1, 4]
  for (const level of levels) {
    it(`${level} blocks horizontal threat`, () => {
      expect(chooseMove(horizontal, level, fast)).toBe(3)
    })
    it(`${level} blocks vertical threat`, () => {
      expect(chooseMove(vertical, level, fast)).toBe(4)
    })
  }
})

describe('easy always blocks', () => {
  it('blocks even with unlucky rng', () => {
    expect(chooseMove([0, 0, 1, 1, 2], 'easy', { rng: always0 })).toBe(3)
    expect(chooseMove([4, 0, 4, 1, 4], 'easy', { rng: always0 })).toBe(4)
  })
  it('medium/hard take wins and block with unlucky rng', () => {
    for (const l of ['medium', 'hard'] as const) {
      expect(chooseMove([0, 0, 1, 1, 2, 2], l, { rng: always0 })).toBe(3)
      expect(chooseMove([0, 0, 1, 1, 2], l, { rng: always0 })).toBe(3)
    }
  })
})

describe('does not play under a winning cell', () => {
  // random positions where some moves hand the opponent an immediate win
  const rng = mulberry32(7)
  const cases: { moves: number[]; unsafe: Set<number> }[] = []
  const winsFor = (s: GameState, col: number) => play(s, col).winner !== 0
  let guard = 0
  while (cases.length < 12 && guard++ < 5000) {
    let s = newGame(1)
    const len = 8 + Math.floor(rng() * 16)
    for (let i = 0; i < len && !s.winner; i++) {
      const m = validMoves(s)
      s = play(s, m[Math.floor(rng() * m.length)])
    }
    if (s.winner || s.draw) continue
    const legal = validMoves(s)
    if (legal.some((c) => winsFor(s, c))) continue
    const unsafe = new Set<number>()
    for (const c of legal) {
      const n = play(s, c)
      if (validMoves(n).some((d) => winsFor(n, d))) unsafe.add(c)
    }
    if (unsafe.size === 0 || unsafe.size === legal.length) continue
    cases.push({ moves: s.moves, unsafe })
  }

  it('found sample positions', () => expect(cases.length).toBe(12))
  for (const level of ['medium', 'hard'] as const) {
    it(`${level} avoids unsafe columns`, () => {
      for (const { moves, unsafe } of cases) {
        for (let k = 0; k < 20; k++) {
          // low rng values force the slip branch often
          const col = chooseMove(moves, level, { rng: mulberry32(moves.length * 31 + k) })
          expect(unsafe.has(col), `${moves.join('')} -> ${col}`).toBe(false)
        }
      }
    })
  }
})

describe('legal output', () => {
  it('always returns a playable column', () => {
    const rng = mulberry32(3)
    for (const level of levels) {
      let s = newGame(1)
      while (!s.winner && !s.draw) {
        const col = chooseMove(s.moves, level, { rng, timeMs: 20 })
        expect(validMoves(s)).toContain(col)
        s = play(s, validMoves(s)[Math.floor(rng() * validMoves(s).length)])
      }
    }
  })
  it('returns the only legal column', () => {
    // fill all but column 6 without anyone winning
    let s = newGame(1)
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0]
    for (const c of order) s = play(s, c)
    expect(chooseMove(s.moves, 'hard', fast)).toBeGreaterThanOrEqual(0)
  })
  it('opening move is the centre column for hard', () => {
    expect(chooseMove([], 'hard', { rng: calm, timeMs: 150 })).toBe(3)
  })
})

describe('tournaments', () => {
  const cfg = (l: Level) => CONFIGS[l]
  const bot = (c: BotConfig, seed: number): Player => {
    const rng = mulberry32(seed)
    return (s) => chooseMoveWith(s.moves, c, { rng })
  }
  const N = 60
  const run = (a: BotConfig, b: BotConfig, base: number) =>
    tournament((i) => [bot(a, base + i), bot(b, base + 5000 + i)], N)
  const rate = (r: { aWins: number }) => r.aWins / N

  it('easy beats random most of the time', () => {
    const r = tournament((i) => [bot(cfg('easy'), 10 + i), randomPlayer(mulberry32(900 + i))], N)
    expect(rate(r)).toBeGreaterThan(0.75)
  })
  it('medium beats easy clearly, not always', () => {
    const r = run(cfg('medium'), cfg('easy'), 100)
    expect(rate(r)).toBeGreaterThan(0.6)
    expect(rate(r)).toBeLessThan(0.97)
  })
  it('hard beats medium clearly, not always', () => {
    const r = run(cfg('hard'), cfg('medium'), 200)
    expect(rate(r)).toBeGreaterThan(0.6)
    expect(rate(r)).toBeLessThan(0.97)
  })
  it('hard beats easy', () => {
    expect(rate(run(cfg('hard'), cfg('easy'), 300))).toBeGreaterThan(0.85)
  })
  it('hard is comparable to old medium (not much stronger)', () => {
    const r = run(cfg('hard'), OLD_MEDIUM, 400)
    expect(rate(r)).toBeGreaterThan(0.3)
    expect(rate(r)).toBeLessThan(0.7)
  })
})

describe('timing', () => {
  it('hard on the empty board is under 350ms', () => {
    const t = performance.now()
    chooseMove([], 'hard', { rng: calm })
    expect(performance.now() - t).toBeLessThan(350)
  })
  it('hard mid-game is under 350ms', () => {
    const moves = [4, 2, 2, 4, 1, 0, 1, 3]
    const s = fromMoves(moves)
    expect(s.winner).toBe(0)
    const t = performance.now()
    chooseMove(moves, 'hard', { rng: calm })
    expect(performance.now() - t).toBeLessThan(350)
  })
  it('exports sane column range', () => {
    expect(COLS).toBe(7)
  })
})
