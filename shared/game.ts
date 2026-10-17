// Pure Connect Four rules. Shared by the UI, the bot worker and the online room.
// Board is column-major: board[col][row], row 0 = bottom.

export const COLS = 7
export const ROWS = 6

export type Player = 1 | 2
export type Cell = 0 | Player
export type Pos = { col: number; row: number }

export interface GameState {
  board: Cell[][]
  moves: number[] // columns played, in order
  starter: Player
  turn: Player
  winner: Player | 0
  winLine: Pos[] | null
  draw: boolean
}

export const other = (p: Player): Player => (p === 1 ? 2 : 1)

export function newGame(starter: Player = 1): GameState {
  return {
    board: Array.from({ length: COLS }, () => Array<Cell>(ROWS).fill(0)),
    moves: [],
    starter,
    turn: starter,
    winner: 0,
    winLine: null,
    draw: false,
  }
}

export const isOver = (s: GameState) => s.winner !== 0 || s.draw

/** Row a piece would land on, or -1 if the column is full. */
export function landingRow(s: GameState, col: number): number {
  const c = s.board[col]
  if (!c) return -1
  const row = c.indexOf(0)
  return row
}

export function canPlay(s: GameState, col: number): boolean {
  return !isOver(s) && Number.isInteger(col) && col >= 0 && col < COLS && landingRow(s, col) !== -1
}

export function validMoves(s: GameState): number[] {
  const out: number[] = []
  for (let c = 0; c < COLS; c++) if (canPlay(s, c)) out.push(c)
  return out
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

/** Winning line through (col,row) for the piece placed there, or null. */
export function findWin(board: Cell[][], col: number, row: number): Pos[] | null {
  const p = board[col][row]
  if (!p) return null
  for (const [dc, dr] of DIRS) {
    const line: Pos[] = [{ col, row }]
    for (const sign of [1, -1]) {
      let c = col + dc * sign
      let r = row + dr * sign
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[c][r] === p) {
        line.push({ col: c, row: r })
        c += dc * sign
        r += dr * sign
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a.col - b.col || a.row - b.row)
  }
  return null
}

/** Returns a new state with the move applied. Throws on illegal moves. */
export function play(s: GameState, col: number): GameState {
  if (!canPlay(s, col)) throw new Error(`Illegal move: column ${col}`)
  const row = landingRow(s, col)
  const board = s.board.map((c, i) => (i === col ? c.slice() : c))
  board[col][row] = s.turn
  const moves = [...s.moves, col]
  const winLine = findWin(board, col, row)
  return {
    board,
    moves,
    starter: s.starter,
    turn: other(s.turn),
    winner: winLine ? s.turn : 0,
    winLine,
    draw: !winLine && moves.length === COLS * ROWS,
  }
}

export function fromMoves(moves: number[], starter: Player = 1): GameState {
  return moves.reduce(play, newGame(starter))
}

/** Undo the last `n` moves by replaying the rest. */
export function undo(s: GameState, n = 1): GameState {
  return fromMoves(s.moves.slice(0, Math.max(0, s.moves.length - n)), s.starter)
}

/** Position of the most recent piece, if any. */
export function lastMove(s: GameState): Pos | null {
  const col = s.moves[s.moves.length - 1]
  if (col === undefined) return null
  return { col, row: landingRow(s, col) === -1 ? ROWS - 1 : landingRow(s, col) - 1 }
}
