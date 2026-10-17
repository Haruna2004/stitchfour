// Thread rendering helpers (StitchCraft-style layered strokes) + seeded rng.
// Works with any CanvasRenderingContext2D-compatible context.
import type { Palette, RGB } from './palette'

export type Ctx = CanvasRenderingContext2D

/** Seeded PRNG (mulberry32), returns [0,1). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
export const css = (c: RGB, alpha = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`
export const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]

/** Set a shadow in user-space units (canvas shadows ignore the transform). */
export function shadow(ctx: Ctx, color: string, blur: number, ox: number, oy: number) {
  const k = ctx.getTransform().a || 1
  ctx.shadowColor = color
  ctx.shadowBlur = blur * k
  ctx.shadowOffsetX = ox * k
  ctx.shadowOffsetY = oy * k
}

/** One stitch: a straight thread segment. */
export type Stitch = readonly [number, number, number, number]

export interface ThreadOpts {
  color: RGB
  width: number
  pal: Palette
  rand?: () => number
  tone?: number // per-stitch tone jitter (fraction)
  twist?: boolean
  holes?: boolean
  shadow?: number // shadow alpha multiplier
  light?: number // highlight strength multiplier
  edge?: number // dark edge alpha multiplier
}

// light comes from top-left
const LX = -0.45 / Math.hypot(0.45, 0.55)
const LY = -0.55 / Math.hypot(0.45, 0.55)

/** Unit normal of a segment pointing toward the light, plus facing level 0..2. */
export function lightNormal(x1: number, y1: number, x2: number, y2: number) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  let nx = -(y2 - y1) / len
  let ny = (x2 - x1) / len
  if (nx * LX + ny * LY < 0) {
    nx = -nx
    ny = -ny
  }
  const face = nx * LX + ny * LY
  return { nx, ny, len, lv: face > 0.66 ? 2 : face > 0.33 ? 1 : 0 }
}

/** Draw stitches with layered strokes: shadow, base, twist, edge, highlight, needle holes. */
export function drawStitches(ctx: Ctx, stitches: readonly Stitch[], o: ThreadOpts) {
  const { color, width: w, pal } = o
  const rand = o.rand ?? rng(1)
  const tone = o.tone ?? 0.06
  const lightK = o.light ?? 1
  if (!stitches.length) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 1. offset shadow on the fabric
  ctx.strokeStyle = css(pal.shadowInk, pal.shadowAlpha * (o.shadow ?? 1))
  ctx.lineWidth = w * 1.18
  ctx.beginPath()
  for (const [x1, y1, x2, y2] of stitches) {
    ctx.moveTo(x1 + w * 0.3, y1 + w * 0.4)
    ctx.lineTo(x2 + w * 0.3, y2 + w * 0.4)
  }
  ctx.stroke()

  // 2. base colour, per-stitch tone jitter
  const tones = stitches.map(() => 1 + (rand() - 0.5) * 2 * tone)
  ctx.lineWidth = w
  stitches.forEach(([x1, y1, x2, y2], i) => {
    const k = tones[i]
    ctx.strokeStyle = css(k >= 1 ? mix(color, pal.lightMix, (k - 1) * 1.6) : mix(color, pal.shadeMix, (1 - k) * 1.4))
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  })

  // 3. twist: short dark diagonal ticks along the thread
  if (o.twist !== false) {
    ctx.lineCap = 'butt'
    ctx.strokeStyle = css(mix(color, pal.shadeMix, 0.55), 0.32)
    ctx.lineWidth = Math.max(0.5, w * 0.16)
    ctx.beginPath()
    const step = w * 0.95
    for (const [x1, y1, x2, y2] of stitches) {
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len < w * 0.8) continue
      const dx = (x2 - x1) / len
      const dy = (y2 - y1) / len
      const nx = -dy
      const ny = dx
      const off = rand() * step
      // tick slanted ~35deg across the thread
      for (let s = off + w * 0.3; s < len - w * 0.3; s += step) {
        const cx = x1 + dx * s
        const cy = y1 + dy * s
        const h = w * 0.42
        ctx.moveTo(cx - nx * h - dx * h * 0.7, cy - ny * h - dy * h * 0.7)
        ctx.lineTo(cx + nx * h + dx * h * 0.7, cy + ny * h + dy * h * 0.7)
      }
    }
    ctx.stroke()
    ctx.lineCap = 'round'
  }

  // 4 + 5. dark edge away from light, highlight toward it (3 levels by facing)
  const norms = stitches.map(([x1, y1, x2, y2]) => lightNormal(x1, y1, x2, y2))
  ctx.strokeStyle = css(mix(color, pal.shadeMix, 0.5), 0.55 * (o.edge ?? 1))
  ctx.lineWidth = w * 0.3
  ctx.beginPath()
  stitches.forEach(([x1, y1, x2, y2], i) => {
    const { nx, ny } = norms[i]
    ctx.moveTo(x1 - nx * w * 0.33, y1 - ny * w * 0.33)
    ctx.lineTo(x2 - nx * w * 0.33, y2 - ny * w * 0.33)
  })
  ctx.stroke()

  const strength = [0.35, 0.55, 0.8]
  ctx.lineWidth = w * 0.32
  for (let lv = 0; lv < 3; lv++) {
    ctx.strokeStyle = css(mix(color, pal.lightMix, Math.min(1, strength[lv] * 0.75 * lightK)), (0.5 + 0.18 * lv) * Math.min(1, lightK))
    ctx.beginPath()
    stitches.forEach(([x1, y1, x2, y2], i) => {
      const { nx, ny, len, lv: l } = norms[i]
      if (l !== lv) return
      // shorten so the highlight sits inside the rounded caps
      const sh = Math.min(len * 0.35, w * 0.45)
      const dx = ((x2 - x1) / len) * sh
      const dy = ((y2 - y1) / len) * sh
      ctx.moveTo(x1 + dx + nx * w * 0.2, y1 + dy + ny * w * 0.2)
      ctx.lineTo(x2 - dx + nx * w * 0.2, y2 - dy + ny * w * 0.2)
    })
    ctx.stroke()
  }

  // 6. needle holes at stitch ends
  if (o.holes !== false) {
    ctx.fillStyle = css(mix(pal.shadowInk, pal.shadeMix, 0.4), 0.22)
    ctx.beginPath()
    const r = w * 0.5
    for (const [x1, y1, x2, y2] of stitches) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1
      const dx = ((x2 - x1) / len) * w * 0.55
      const dy = ((y2 - y1) / len) * w * 0.55
      ctx.moveTo(x1 - dx + r, y1 - dy)
      ctx.arc(x1 - dx, y1 - dy, r, 0, Math.PI * 2)
      ctx.moveTo(x2 + dx + r, y2 + dy)
      ctx.arc(x2 + dx, y2 + dy, r, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.restore()
}

/** Running stitch around a circle (gaps between stitches). */
export function ringStitches(
  cx: number, cy: number, r: number, count: number, fill: number, rand: () => number, jitter = 0,
): Stitch[] {
  const out: Stitch[] = []
  const start = rand() * Math.PI * 2
  const step = (Math.PI * 2) / count
  for (let i = 0; i < count; i++) {
    const a1 = start + i * step + (rand() - 0.5) * step * 0.08
    const a2 = a1 + step * fill
    const j = () => (rand() - 0.5) * jitter
    out.push([
      cx + Math.cos(a1) * r + j(), cy + Math.sin(a1) * r + j(),
      cx + Math.cos(a2) * r + j(), cy + Math.sin(a2) * r + j(),
    ])
  }
  return out
}
