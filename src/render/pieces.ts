// Piece sprites: P1 = red satin-stitch disc, P2 = gold cross-stitch disc.
// Drawn once per (player, theme, size, dpr) and cached as a data URL.
import type { Player } from '../../shared/game'
import { PALETTE, type Palette, type Theme } from './palette'
import { css, drawStitches, mix, rng, shadow, type Ctx, type Stitch } from './thread'

/** Disc radius as a fraction of the sprite box. */
export const DISC = 0.44

/** Draw a piece into a size x size (device px) square at the origin. */
export function drawPiece(ctx: Ctx, player: Player, pal: Palette, size: number) {
  const R = size * DISC
  const cx = size / 2 - size * 0.015
  const cy = size / 2 - size * 0.02
  const base = player === 1 ? pal.p1 : pal.p2
  const rand = rng(player === 1 ? 101 : 202)

  // padded body + soft shadow on the fabric
  ctx.save()
  shadow(ctx, css(pal.shadowInk, Math.min(0.7, pal.shadowAlpha * 1.5)), R * 0.16, R * 0.05, R * 0.09)
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = css(mix(base, pal.shadeMix, player === 1 ? 0.3 : 0.45))
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R * 0.97, 0, Math.PI * 2)
  ctx.clip()
  if (player === 1) satin(ctx, cx, cy, R, base, pal, rand)
  else crossStitch(ctx, cx, cy, R, base, pal, rand)

  // dome shading: padded stitches catch light top-left
  const g = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R * 1.02)
  g.addColorStop(0, css(pal.lightMix, 0.3))
  g.addColorStop(0.35, css(pal.lightMix, 0.06))
  g.addColorStop(0.7, css(pal.shadeMix, 0.04))
  g.addColorStop(1, css(pal.shadeMix, 0.32))
  ctx.fillStyle = g
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  ctx.restore()

  outline(ctx, cx, cy, R, base, pal, rand, player)
}

function satin(ctx: Ctx, cx: number, cy: number, R: number, base: Palette['p1'], pal: Palette, rand: () => number) {
  const w = Math.max(1.4, R * 0.13)
  const ang = (-32 * Math.PI) / 180
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const nx = -dy
  const ny = dx
  const sp = w * 0.6
  const out: Stitch[] = []
  for (let o = -R + sp * 0.3; o <= R; o += sp) {
    const half = Math.sqrt(Math.max(0, R * R - o * o)) + w * 0.4
    const j = () => (rand() - 0.5) * w * 0.35
    const px = cx + nx * o
    const py = cy + ny * o
    const a = (rand() - 0.5) * 0.04 // slight angle wobble
    const ddx = dx + -dy * a
    const ddy = dy + dx * a
    out.push([px - ddx * half + j(), py - ddy * half + j(), px + ddx * half + j(), py + ddy * half + j()])
  }
  drawStitches(ctx, out, { color: base, width: w, pal, rand, tone: 0.08, holes: false, shadow: 0.55, light: 0.7, edge: 0.95 })
}

function crossStitch(ctx: Ctx, cx: number, cy: number, R: number, base: Palette['p2'], pal: Palette, rand: () => number) {
  const n = R > 30 ? 7 : 6
  const s = (R * 2) / n
  const w = Math.max(1.1, s * 0.33)
  const p = s * 0.17
  const under: Stitch[] = []
  const over: Stitch[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = cx - R + i * s
      const y = cy - R + j * s
      if (Math.hypot(x + s / 2 - cx, y + s / 2 - cy) > R * 0.98) continue
      const k = () => (rand() - 0.5) * s * 0.08
      under.push([x + p + k(), y + s - p + k(), x + s - p + k(), y + p + k()]) // '/'
      over.push([x + p + k(), y + p + k(), x + s - p + k(), y + s - p + k()]) // '\' on top
    }
  }
  const o = { color: base, width: w, pal, rand, tone: 0.08, holes: w > 2, shadow: 1, twist: w > 2.2, light: 0.85 }
  drawStitches(ctx, under, { ...o, color: mix(base, pal.shadeMix, 0.16), light: 0.5 })
  drawStitches(ctx, over, o)
}

function outline(
  ctx: Ctx, cx: number, cy: number, R: number, base: Palette['p1'], pal: Palette, rand: () => number, player: Player,
) {
  const color = mix(base, pal.shadeMix, player === 1 ? 0.34 : 0.42)
  const w = Math.max(1.1, R * 0.1)
  const r = R * 0.94
  const out: Stitch[] = []
  if (player === 1) {
    // stem stitch: overlapping, slightly slanted
    const count = Math.max(12, Math.round((2 * Math.PI * r) / (w * 1.9)))
    for (let i = 0; i < count; i++) {
      const a1 = (i / count) * Math.PI * 2
      const a2 = a1 + (Math.PI * 2 * 1.7) / count
      const r1 = r + w * 0.2
      const r2 = r - w * 0.2
      out.push([cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2])
    }
  } else {
    // back stitch: end to end
    const count = Math.max(10, Math.round((2 * Math.PI * r) / (w * 3.2)))
    for (let i = 0; i < count; i++) {
      const a1 = (i / count) * Math.PI * 2 + 0.02
      const a2 = ((i + 1) / count) * Math.PI * 2 - 0.02
      out.push([cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r])
    }
  }
  drawStitches(ctx, out, { color, width: w, pal, rand, tone: 0.05, holes: player === 2, shadow: 0.8, twist: w > 2.5 })
}

const cache = new Map<string, string>()

/** Cached sprite URL for a piece (browser only). Box is cssSize square; disc fills DISC*2 of it. */
export function getPieceSprite(player: Player, theme: Theme, cssSize: number, dpr: number): string {
  const px = Math.max(8, Math.round(cssSize * dpr))
  const key = `${player}|${theme}|${px}`
  let url = cache.get(key)
  if (!url) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    drawPiece(ctx, player, PALETTE[theme], px)
    url = canvas.toDataURL('image/png')
    cache.set(key, url)
    if (cache.size > 32) cache.delete(cache.keys().next().value!)
  }
  return url
}
