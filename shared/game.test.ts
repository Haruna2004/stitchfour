import { describe, expect, it } from 'vitest'
import { canPlay, findWin, fromMoves, lastMove, newGame, play, undo, validMoves } from './game'

describe('game', () => {
  it('stacks pieces from the bottom', () => {
    const s = fromMoves([3, 3])
    expect(s.board[3][0]).toBe(1)
    expect(s.board[3][1]).toBe(2)
    expect(s.turn).toBe(1)
    expect(lastMove(s)).toEqual({ col: 3, row: 1 })
  })

  it('detects horizontal, vertical and diagonal wins', () => {
    expect(fromMoves([0, 0, 1, 1, 2, 2, 3]).winner).toBe(1)
    expect(fromMoves([0, 1, 0, 1, 0, 1, 0]).winner).toBe(1)
  })

  it('detects diagonal wins in both directions', () => {
    const up = newGame()
    for (let i = 0; i < 4; i++) up.board[i][i] = 1
    expect(findWin(up.board, 2, 2)).toHaveLength(4)
    const down = newGame()
    for (let i = 0; i < 4; i++) down.board[2 + i][3 - i] = 2
    expect(findWin(down.board, 5, 0)).toEqual([
      { col: 2, row: 3 },
      { col: 3, row: 2 },
      { col: 4, row: 1 },
      { col: 5, row: 0 },
    ])
  })

  it('blocks moves after a win and in full columns', () => {
    const won = fromMoves([0, 0, 1, 1, 2, 2, 3])
    expect(canPlay(won, 4)).toBe(false)
    expect(() => play(won, 4)).toThrow()
    const full = fromMoves([0, 0, 0, 0, 0, 0])
    expect(canPlay(full, 0)).toBe(false)
    expect(validMoves(full)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('detects a draw on a full board', () => {
    // Columns alternate 121212 / 212121 in a pattern with no four-in-a-row.
    const flip = [false, true, true, false, true, true, false]
    const almost = newGame()
    almost.board = flip.map((f) => Array.from({ length: 6 }, (_, r) => (((r + (f ? 1 : 0)) % 2) + 1) as 1 | 2))
    almost.board[6][5] = 0
    almost.turn = 2
    almost.moves = Array(41).fill(0)
    const s = play(almost, 6)
    expect(s.moves).toHaveLength(42)
    expect(s.winner).toBe(0)
    expect(s.draw).toBe(true)
  })

  it('undoes by replay and keeps the starter', () => {
    const s = fromMoves([3, 4, 5], 2)
    const u = undo(s, 2)
    expect(u.moves).toEqual([3])
    expect(u.starter).toBe(2)
    expect(u.turn).toBe(1)
    expect(undo(newGame(), 3).moves).toEqual([])
  })
})
