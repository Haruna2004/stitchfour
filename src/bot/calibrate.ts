// Calibration: bun run src/bot/calibrate.ts [games]
import { newGame, play } from '../../shared/game'
import type { GameState } from '../../shared/game'
import { CONFIGS, chooseMoveWith } from './search'
import type { BotConfig } from './search'

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
const OLD_MEDIUM: BotConfig = { depth: 6, slipP: 0.12, slipTop: 1, slipMargin: 40, tt: true }
const N = Number((globalThis as any).Bun?.argv[2] ?? 100)
function run(a: BotConfig, b: BotConfig, n: number, seed = 1) {
  let aw = 0, bw = 0
  for (let i = 0; i < n; i++) {
    const ra = mulberry32(seed * 1000 + i), rb = mulberry32(seed * 7777 + i)
    const aFirst = i % 2 === 0
    let s: GameState = newGame(1)
    while (!s.winner && !s.draw) {
      const aTurn = (s.turn === 1) === aFirst
      s = play(s, chooseMoveWith(s.moves, aTurn ? a : b, { rng: aTurn ? ra : rb }))
    }
    if (s.winner) (s.winner === 1) === aFirst ? aw++ : bw++
  }
  return `${aw}W ${n - aw - bw}D ${bw}L`
}
const t = performance.now()
const { easy, medium, hard } = CONFIGS
const rand: BotConfig = { depth: 1, randomP: 1, seeWinP: 0 }
console.log('hard v medium   ', run(hard, medium, N))
console.log('medium v easy   ', run(medium, easy, N))
console.log('hard v easy     ', run(hard, easy, N))
console.log('easy v random   ', run(easy, rand, N))
console.log('hard v oldmed   ', run(hard, OLD_MEDIUM, N))
console.log('ms', Math.round(performance.now() - t))
