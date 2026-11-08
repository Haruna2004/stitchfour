// Canvas-drawn background layer for marketing frames: linen, a stitched hem and a few loose
// pieces / a loose thread, all with the game's own renderers so they match the app.
import { createCanvas, loadImage } from '@napi-rs/canvas'
import sharp from 'sharp'
import { join } from 'node:path'
import type { Player } from '../../../shared/game'
import { PALETTE, type Theme } from '../../../src/render/palette'
import { drawPiece } from '../../../src/render/pieces'
import { drawStitches, rng, type Ctx, type Stitch } from '../../../src/render/thread'
import { ROOT } from './browser'

export interface Loose {
  x: number
  y: number
  p: Player
  size: number
  rot?: number
}
export interface Decor {
  w: number
  h: number
  theme: Theme
  pieces?: Loose[]
  /** loose thread as a cubic bezier [x0,y0, c1x,c1y, c2x,c2y, x1,y1] */
  thread?: { pts: number[]; p: Player }
  hem?: boolean
}

/** Sample a closed rounded rect into running stitches. */
export function frameStitches(x: number, y: number, w: number, h: number, r: number, period: number, duty: number): Stitch[] {
  const pts: [number, number][] = []
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (i / 24) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  arc(x + w - r, y + r, -Math.PI / 2)
  arc(x + w - r, y + h - r, 0)
  arc(x + r, y + h - r, Math.PI / 2)
  arc(x + r, y + r, Math.PI)
  pts.push(pts[0])
  return alongPolyline(pts, period, duty, true)
}

function alongPolyline(pts: [number, number][], period: number, duty: number, exact: boolean): Stitch[] {
  const segs: { a: [number, number]; b: [number, number]; s: number; len: number }[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    segs.push({ a: pts[i - 1], b: pts[i], s: total, len })
    total += len
  }
  const at = (d: number): [number, number] => {
    const g = segs.find((q) => d <= q.s + q.len) ?? segs[segs.length - 1]
    const t = g.len ? (d - g.s) / g.len : 0
    return [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t]
  }
  const n = Math.max(1, Math.round(total / period))
  const step = exact ? total / n : period
  const out: Stitch[] = []
  for (let i = 0; i < n; i++) {
    const p = at(i * step)
    const q = at(Math.min(total, i * step + step * duty))
    out.push([p[0], p[1], q[0], q[1]])
  }
  return out
}

function bezier(p: number[], steps = 80): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6]
    const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]
    out.push([x, y])
  }
  return out
}

const linenCache = new Map<Theme, Awaited<ReturnType<typeof loadImage>>>()
async function linen(theme: Theme) {
  if (!linenCache.has(theme)) {
    // a touch softer than the app: full weave detail turns to noise once the image is scaled down
    const buf = await sharp(join(ROOT, `public/textures/linen-${theme}.webp`)).blur(0.4).png().toBuffer()
    linenCache.set(theme, await loadImage(buf))
  }
  return linenCache.get(theme)!
}

/** Render the background to a PNG buffer at 1x (the frame size). */
export async function renderDecor(d: Decor): Promise<Buffer> {
  const S = 2 // draw at 2x, downscale for crisp threads
  const canvas = createCanvas(d.w * S, d.h * S)
  const ctx = canvas.getContext('2d') as unknown as Ctx
  const pal = PALETTE[d.theme]
  const tile = await linen(d.theme)
  ctx.save()
  // linen tile at 1.25x of the app's 192px so the weave reads at social sizes
  ctx.scale(S * 1.25, S * 1.25)
  ctx.fillStyle = ctx.createPattern(tile as unknown as CanvasImageSource, 'repeat')!
  ctx.fillRect(0, 0, d.w, d.h)
  ctx.restore()
  // soft vignette for depth
  const g = ctx.createRadialGradient((d.w * S) / 2, (d.h * S) / 2, Math.min(d.w, d.h) * S * 0.3, (d.w * S) / 2, (d.h * S) / 2, Math.max(d.w, d.h) * S * 0.75)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, d.theme === 'dark' ? 'rgba(12,8,4,0.32)' : 'rgba(80,60,30,0.12)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, d.w * S, d.h * S)
  ctx.scale(S, S)

  if (d.hem !== false) {
    const m = Math.round(Math.min(d.w, d.h) * 0.026)
    drawStitches(ctx, frameStitches(m, m, d.w - 2 * m, d.h - 2 * m, m * 1.2, 17, 0.62), {
      color: pal.ring, width: 2.6, pal, rand: rng(3), tone: 0.08, shadow: 0.8, light: 0.7,
    })
  }

  if (d.thread) {
    const pts = bezier(d.thread.pts)
    const color = d.thread.p === 1 ? pal.p1 : pal.p2
    drawStitches(ctx, alongPolyline(pts, 9, 1.02, true), { color, width: 3.2, pal, rand: rng(11), tone: 0.03, shadow: 1, light: 0.8, edge: 0.6 })
  }

  for (const lp of d.pieces ?? []) {
    const px = Math.round(lp.size * S * 1.5)
    const sc = createCanvas(px, px)
    drawPiece(sc.getContext('2d') as unknown as Ctx, lp.p, pal, px)
    ctx.save()
    ctx.translate(lp.x, lp.y)
    ctx.rotate(((lp.rot ?? 0) * Math.PI) / 180)
    // a soft contact shadow under the loose piece
    ctx.shadowColor = d.theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(60,40,20,0.28)'
    ctx.shadowBlur = lp.size * 0.12 * S
    ctx.shadowOffsetY = lp.size * 0.04 * S
    ctx.drawImage(sc as unknown as CanvasImageSource, -lp.size / 2, -lp.size / 2, lp.size, lp.size)
    ctx.restore()
  }

  return sharp(canvas.toBuffer('image/png')).resize(d.w, d.h, { kernel: 'lanczos3' }).png().toBuffer()
}
