// Build-time linen texture generator (StitchCraft-style weave).
// Run: bun scripts/gen-fabric.ts [--preview <dir>]
// Writes public/textures/linen-{light,dark}.webp: seamless tiles, 192 css px at SCALE density.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CSS_TILE = 192
const SCALE = 2 // device px per css px (tile = 384px, shown at 192px)
const PERIOD = 4 // css px per thread
const THREADS = CSS_TILE / PERIOD // 48 threads per tile, so jitter wraps cleanly
const SIZE = CSS_TILE * SCALE

type RGB = [number, number, number]
interface FabricStyle {
  warp: RGB // vertical threads
  weft: RGB // horizontal threads
  gain: number // overall brightness
  warmShift: number // G/B shift by height (warm cream look)
  quality: number
}

const STYLES: Record<string, FabricStyle> = {
  light: { warp: [255, 251, 240], weft: [252, 245, 230], gain: 1.06, warmShift: 6, quality: 62 },
  dark: { warp: [62, 74, 112], weft: [40, 47, 74], gain: 0.86, warmShift: -3, quality: 62 },
}

// Seeded integer hash -> [0,1)
function hash(a: number, b: number, seed: number) {
  let h = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const mod = (a: number, n: number) => ((a % n) + n) % n

// Low-frequency blotch: 4x4 wrapping grid, bilinear
const LF = 4
function lowFreq(x: number, y: number, seed: number) {
  const gx = (x / SIZE) * LF
  const gy = (y / SIZE) * LF
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const fx = gx - x0
  const fy = gy - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const v = (i: number, j: number) => hash(mod(i, LF), mod(j, LF), seed)
  const a = v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx
  const b = v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx
  return a * (1 - sy) + b * sy
}

// Slubs: thread thickness varies slowly along its length (wraps every 8 segments)
const SLUB_SEGS = 8
function slub(thread: number, along: number, seed: number) {
  const t = (along / THREADS) * SLUB_SEGS
  const i = Math.floor(t)
  const f = t - i
  const s = f * f * (3 - 2 * f)
  const a = hash(thread, mod(i, SLUB_SEGS), seed)
  const b = hash(thread, mod(i + 1, SLUB_SEGS), seed)
  const v = a * (1 - s) + b * s
  return 0.82 + 0.36 * v * v * v // mostly thin, occasionally thick
}

const L = (() => {
  const v = [-0.45, -0.55, 0.7]
  const n = Math.hypot(v[0], v[1], v[2])
  return v.map((c) => c / n)
})()

function render(style: FabricStyle, seed: number) {
  const buf = Buffer.alloc(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y++) {
    const yf = (y + 0.5) / SCALE / PERIOD
    const row = Math.floor(yf)
    const v = yf - row
    for (let x = 0; x < SIZE; x++) {
      const xf = (x + 0.5) / SCALE / PERIOD
      const col = Math.floor(xf)
      const u = xf - col
      const warpOver = ((col + row) & 1) === 0

      // cross profiles
      const jw = 0.9 + 0.2 * hash(col, 7, seed) // per-thread width jitter
      const jh = 0.9 + 0.2 * hash(row, 13, seed)
      const sw = slub(col, yf, seed + 1)
      const sh = slub(row, xf, seed + 2)
      const pu = Math.pow(Math.sin(Math.PI * u), 0.6) * jw * sw
      const pv = Math.pow(Math.sin(Math.PI * v), 0.6) * jh * sh
      // arch along the thread as it rises over / dips under
      const archV = 0.78 + 0.22 * Math.sin(Math.PI * v)
      const archU = 0.78 + 0.22 * Math.sin(Math.PI * u)
      const hWarp = pu * (warpOver ? archV : 0.74 * (1 - 0.3 * Math.sin(Math.PI * v)))
      const hWeft = pv * (warpOver ? 0.74 * (1 - 0.3 * Math.sin(Math.PI * u)) : archU)

      const isWarp = hWarp >= hWeft
      const h = isWarp ? hWarp : hWeft
      let nx: number, ny: number
      if (isWarp) {
        nx = -Math.cos(Math.PI * u) * 1.5
        ny = warpOver ? -Math.cos(Math.PI * v) * 0.45 : Math.cos(Math.PI * v) * 0.3
      } else {
        ny = -Math.cos(Math.PI * v) * 1.5
        nx = warpOver ? Math.cos(Math.PI * u) * 0.3 : -Math.cos(Math.PI * u) * 0.45
      }
      const nl = Math.hypot(nx, ny, 1)
      const dot = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / nl)
      const shade = 0.76 + 0.27 * dot
      const height = 0.7 + 0.3 * Math.min(1, h / 0.55)

      const tid = isWarp ? col : row
      const tone = 1 + (hash(tid, isWarp ? 31 : 37, seed) - 0.5) * 0.09
      // pixel noise wraps with the tile
      const noise = 1 + (hash(mod(x, SIZE), mod(y, SIZE), seed + 9) - 0.5) * 0.06
      const lf = 0.965 + lowFreq(x, y, seed + 5) * 0.07

      const k = shade * height * tone * noise * lf * style.gain
      const base = isWarp ? style.warp : style.weft
      const warm = (1 - height) * style.warmShift
      const o = (y * SIZE + x) * 3
      buf[o] = clamp(base[0] * k)
      buf[o + 1] = clamp(base[1] * k - warm * 0.6)
      buf[o + 2] = clamp(base[2] * k - warm * 1.4)
    }
  }
  return buf
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

const root = join(import.meta.dir, '..')
const outDir = join(root, 'public/textures')
mkdirSync(outDir, { recursive: true })
const pvIdx = process.argv.indexOf('--preview')
const previewDir = pvIdx > 0 ? process.argv[pvIdx + 1] : null

for (const [name, style] of Object.entries(STYLES)) {
  const raw = render(style, name === 'light' ? 11 : 23)
  const img = () => sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
  const file = join(outDir, `linen-${name}.webp`)
  const info = await img().webp({ quality: style.quality, effort: 6, smartSubsample: true }).toFile(file)
  // mean colour, handy for matching the CSS page colour
  let r = 0, g = 0, b = 0
  for (let i = 0; i < raw.length; i += 3) { r += raw[i]; g += raw[i + 1]; b += raw[i + 2] }
  const n = raw.length / 3
  const hex = [r, g, b].map((c) => Math.round(c / n).toString(16).padStart(2, '0')).join('')
  console.log(`${name}: ${SIZE}px, ${(info.size / 1024).toFixed(1)}KB, mean #${hex}`)
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true })
    const tile = await img().png().toBuffer()
    await sharp({ create: { width: SIZE * 2, height: SIZE * 2, channels: 3, background: '#000' } })
      .composite([0, 1, 2, 3].map((i) => ({ input: tile, left: (i % 2) * SIZE, top: (i >> 1) * SIZE })))
      .png()
      .toFile(join(previewDir, `fabric-${name}-2x2.png`))
  }
}
