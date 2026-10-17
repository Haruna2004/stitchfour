import { describe, expect, it } from 'vitest'
import { COLS, fromMoves, newGame, play, validMoves } from '../../shared/game'
import type { GameState } from '../../shared/game'
import { chooseMove } from './search'
import type { Level } from './search'

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
  for (const level of ['medium', 'hard'] as const) {
    it(`${level} blocks horizontal threat`, () => {
      expect(chooseMove(horizontal, level, fast)).toBe(3)
    })
    it(`${level} blocks vertical threat`, () => {
      expect(chooseMove(vertical, level, fast)).toBe(4)
    })
  }
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
        const col = chooseMove(moves, level, { rng: mulberry32(moves.length), timeMs: 100 })
        expect(unsafe.has(col), `${moves.join('')} -> ${col}`).toBe(false)
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
  it('hard beats a random player 20/20', () => {
    const r = tournament(
      (i) => [botPlayer('hard', mulberry32(100 + i), 30), randomPlayer(mulberry32(900 + i))],
      20,
    )
    expect(r.aWins).toBe(20)
  })

  it('hard beats easy at least 18/20', () => {
    const r = tournament(
      (i) => [botPlayer('hard', mulberry32(200 + i), 30), botPlayer('easy', mulberry32(800 + i))],
      20,
    )
    expect(r.aWins).toBeGreaterThanOrEqual(18)
  })

  it('medium beats easy more often than not', () => {
    const r = tournament(
      (i) => [botPlayer('medium', mulberry32(300 + i)), botPlayer('easy', mulberry32(700 + i))],
      20,
    )
    expect(r.aWins).toBeGreaterThan(r.bWins)
    expect(r.aWins).toBeGreaterThan(10)
  })
})

describe('timing', () => {
  it('hard on the empty board is under 1200ms', () => {
    const t = performance.now()
    chooseMove([], 'hard', { rng: calm })
    expect(performance.now() - t).toBeLessThan(1200)
  })
  it('hard mid-game is under 1200ms', () => {
    const moves = [4, 2, 2, 4, 1, 0, 1, 3]
    const s = fromMoves(moves)
    expect(s.winner).toBe(0)
    const t = performance.now()
    chooseMove(moves, 'hard', { rng: calm })
    expect(performance.now() - t).toBeLessThan(1200)
  })
  it('exports sane column range', () => {
    expect(COLS).toBe(7)
  })
})
