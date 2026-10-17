// Embroidery hoop + stitched cell rings. Drawn once per size/theme/dpr.
import { COLS, ROWS } from '../../shared/game'
import type { Palette } from './palette'
import { css, drawStitches, mix, ringStitches, rng, shadow, type Ctx } from './thread'

// Proportions in units of one cell pitch
const U = {
  wood: 0.4,
  pad: 0.24,
  lane: 1.0, // aim lane above the grid (ghost piece lives here)
  top: 0.42, // room above the hoop for the brass screw
  side: 0.14,
  bottom: 0.24,
  radius: 1.05,
}
export const UNITS_W = COLS + 2 * U.pad + 2 * U.wood + 2 * U.side
export const UNITS_H = U.top + ROWS + 2 * U.pad + 2 * U.wood + U.lane + U.bottom

export interface Layout {
  cell: number
  width: number
  height: number
  hoop: { x: number; y: number; w: number; h: number; r: number }
  inner: { x: number; y: number; w: number; h: number; r: number }
  wood: number
  gridX: number
  gridY: number
  laneY: number // centre y of the aim lane
  holeR: number
  ringR: number
  pieceSize: number // css box of a piece sprite
}

/** Geometry for a given cell pitch (css px). */
export function layoutFor(cell: number): Layout {
  const c = cell
  const hx = U.side * c
  const hy = U.top * c
  const hw = (COLS + 2 * U.pad + 2 * U.wood) * c
  const hh = (ROWS + 2 * U.pad + 2 * U.wood + U.lane) * c
  const wood = U.wood * c
  const gridX = hx + wood + U.pad * c
  const gridY = hy + wood + U.pad * c + U.lane * c
  return {
    cell: c,
    width: UNITS_W * c,
    height: UNITS_H * c,
    hoop: { x: hx, y: hy, w: hw, h: hh, r: U.radius * c },
    inner: { x: hx + wood, y: hy + wood, w: hw - 2 * wood, h: hh - 2 * wood, r: U.radius * c - wood },
    wood,
    gridX,
    gridY,
    laneY: gridY - c * 0.56,
    holeR: c * 0.385,
    ringR: c * 0.445,
    pieceSize: c * 0.94,
  }
}

/** Largest layout that fits a box. */
export function fitLayout(w: number, h: number): Layout {
  return layoutFor(Math.max(8, Math.min(w / UNITS_W, h / UNITS_H)))
}

export const cellCenter = (l: Layout, col: number, row: number) => ({
  x: l.gridX + (col + 0.5) * l.cell,
  y: l.gridY + (ROWS - 1 - row + 0.5) * l.cell,
})

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
const inset = (b: Layout['hoop'], d: number) => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d, r: Math.max(0, b.r - d) })
const rr = (ctx: Ctx, b: Layout['hoop']) => rrect(ctx, b.x, b.y, b.w, b.h, b.r)

/** Draw fabric tint, holes, ring stitches, wooden hoop and screw. ctx is in css px. */
export function drawBoard(ctx: Ctx, l: Layout, pal: Palette, seed = 7) {
  const c = l.cell
  const rand = rng(seed)
  const { hoop, inner } = l

  // --- taut fabric inside the hoop
  ctx.save()
  ctx.beginPath()
  rr(ctx, inner)
  ctx.fillStyle = pal.tautTint
  ctx.fill()
  ctx.clip()
  // soft centre glow (fabric pulled tight catches light)
  const g = ctx.createRadialGradient(
    inner.x + inner.w * 0.42, inner.y + inner.h * 0.4, c,
    inner.x + inner.w / 2, inner.y + inner.h / 2, Math.max(inner.w, inner.h) * 0.75,
  )
  g.addColorStop(0, css(pal.lightMix, 0.07))
  g.addColorStop(1, css(pal.shadowInk, 0.06))
  ctx.fillStyle = g
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h)
  ctx.restore()

  // --- holes: recessed with inner shadow
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const { x, y } = cellCenter(l, col, row)
      drawHole(ctx, x, y, l.holeR, pal)
    }
  }

  // --- ring stitches (running stitch, muted thread)
  const w = Math.max(1, c * 0.058)
  const ringsAll = []
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const { x, y } = cellCenter(l, col, row)
      ringsAll.push(...ringStitches(x, y, l.ringR, 13, 0.64, rand, c * 0.008))
    }
  }
  drawStitches(ctx, ringsAll, { color: pal.ring, width: w, pal, rand, tone: 0.08, shadow: 0.8, light: 0.65 })

  // --- shadow cast by the frame onto the fabric inside
  ctx.save()
  ctx.beginPath()
  rr(ctx, inner)
  ctx.clip()
  ctx.beginPath()
  ctx.rect(hoop.x - c * 2, hoop.y - c * 2, hoop.w + c * 4, hoop.h + c * 4)
  rr(ctx, inner)
  shadow(ctx, pal.rimShadow, c * 0.32, c * 0.06, c * 0.09)
  ctx.fillStyle = '#000'
  ctx.fill('evenodd')
  ctx.restore()

  drawHoop(ctx, l, pal, rand)
  drawScrew(ctx, l, pal)
}

function drawHole(ctx: Ctx, x: number, y: number, r: number, pal: Palette) {
  ctx.save()
  // bright lip on the lit (bottom-right) side, just outside the hole
  ctx.beginPath()
  ctx.arc(x, y, r + r * 0.03, Math.PI * -0.1, Math.PI * 0.75)
  ctx.strokeStyle = pal.holeRim
  ctx.lineWidth = Math.max(0.8, r * 0.05)
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = pal.holeShade
  ctx.fill()
  ctx.clip()
  // inner shadow from the top-left wall
  ctx.beginPath()
  ctx.rect(x - r * 3, y - r * 3, r * 6, r * 6)
  ctx.arc(x, y, r, 0, Math.PI * 2, true)
  shadow(ctx, pal.holeShadow, r * 0.45, r * 0.16, r * 0.22)
  ctx.fillStyle = '#000'
  ctx.fill()
  ctx.restore()
}

function drawHoop(ctx: Ctx, l: Layout, pal: Palette, rand: () => number) {
  const { hoop, wood } = l
  const c = l.cell
  const ring = () => {
    ctx.beginPath()
    rr(ctx, hoop)
    rr(ctx, inset(hoop, wood))
  }

  // drop shadow on the fabric (outside + inside)
  ctx.save()
  ring()
  shadow(ctx, css(pal.shadowInk, pal.shadowAlpha * 1.25), c * 0.28, c * 0.07, c * 0.12)
  ctx.fillStyle = css(pal.woodDark)
  ctx.fill('evenodd')
  ctx.restore()

  ctx.save()
  ring()
  ctx.clip('evenodd')

  // two nested rings: outer band (higher), inner band (lower, darker)
  const split = 0.6
  const lx = -0.45 / 0.71
  const ly = -0.55 / 0.71
  const step = 0.5
  const n = Math.ceil(wood / step)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const band = t < split ? t / split : (t - split) / (1 - split)
    const low = t >= split
    // cylinder cross-section: a=-90..90deg across the band
    const a = (band - 0.5) * Math.PI
    const outward = -Math.sin(a) // + = facing outward from hoop centre
    const up = Math.cos(a)
    const amb = low ? 0.62 : 0.7
    const lit = (o: number) => amb + 0.36 * up * 0.75 + 0.42 * o * outward
    const b = inset(hoop, t * wood)
    const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h)
    const k1 = lit(Math.hypot(lx, ly) * 0.9)
    const k2 = lit(0)
    const k3 = lit(-0.9)
    const shade = (k: number) =>
      css(k > 1 ? mix(pal.wood, pal.woodLight, Math.min(1, (k - 1) * 2.4)) : mix(pal.wood, pal.woodDark, Math.min(1, (1 - k) * 1.6)))
    grad.addColorStop(0, shade(k1))
    grad.addColorStop(0.5, shade(k2))
    grad.addColorStop(1, shade(k3))
    ctx.strokeStyle = grad
    ctx.lineWidth = step * 2.2
    ctx.beginPath()
    rr(ctx, b)
    ctx.stroke()
  }

  // grain: long broken streaks following the bend
  for (let i = 0; i < Math.round(wood * 3); i++) {
    const t = rand()
    const b = inset(hoop, t * wood)
    const dash: number[] = []
    for (let d = 0; d < 14; d++) dash.push(c * (0.3 + rand() * 2.4), c * (0.1 + rand() * 1.4))
    ctx.setLineDash(dash)
    ctx.lineDashOffset = rand() * 100
    const dark = rand() < 0.75
    ctx.strokeStyle = dark ? css(pal.grain, 0.1 + rand() * 0.22) : css(pal.woodLight, 0.12 + rand() * 0.2)
    ctx.lineWidth = 0.4 + rand() * Math.max(0.6, c * 0.025)
    ctx.beginPath()
    rr(ctx, b)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // groove between the two rings + specular highlights
  const groove = inset(hoop, split * wood)
  ctx.lineWidth = Math.max(1, c * 0.03)
  ctx.strokeStyle = css(pal.woodDark, 0.85)
  ctx.beginPath()
  rr(ctx, groove)
  ctx.stroke()
  ctx.lineWidth = Math.max(0.6, c * 0.012)
  ctx.strokeStyle = css(pal.woodLight, 0.45)
  ctx.beginPath()
  rr(ctx, inset(hoop, split * wood + c * 0.025))
  ctx.stroke()

  const spec = (d: number, alpha: number, lw: number) => {
    const b = inset(hoop, d)
    const sg = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.8, b.y + b.h * 0.8)
    sg.addColorStop(0, css(pal.lightMix, alpha))
    sg.addColorStop(0.45, css(pal.lightMix, alpha * 0.25))
    sg.addColorStop(0.7, css(pal.lightMix, 0))
    ctx.strokeStyle = sg
    ctx.lineWidth = lw
    ctx.beginPath()
    rr(ctx, b)
    ctx.stroke()
  }
  spec(wood * split * 0.32, 0.5, Math.max(1, c * 0.04))
  spec(wood * (split + (1 - split) * 0.4), 0.22, Math.max(0.8, c * 0.025))

  // crisp outer + inner edges
  ctx.lineWidth = Math.max(1, c * 0.02)
  ctx.strokeStyle = css(pal.woodDark, 0.9)
  ctx.beginPath()
  rr(ctx, inset(hoop, 0.5))
  ctx.stroke()
  ctx.beginPath()
  rr(ctx, inset(hoop, wood - 0.5))
  ctx.stroke()
  ctx.restore()
}

function drawScrew(ctx: Ctx, l: Layout, pal: Palette) {
  const c = l.cell * 1.25
  const cx = l.hoop.x + l.hoop.w / 2
  const top = l.hoop.y
  const tabW = c * 0.3
  const tabH = c * 0.5
  const gap = c * 0.14
  const ty = top - c * 0.3
  const sy = top - c * 0.1 // screw axis

  const brassGrad = (x: number, y: number, w: number, h: number, vertical = true) => {
    const g = vertical ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y)
    g.addColorStop(0, css(pal.brassLight))
    g.addColorStop(0.35, css(pal.brass))
    g.addColorStop(0.8, css(pal.brassDark))
    g.addColorStop(1, css(mix(pal.brassDark, pal.shadeMix, 0.3)))
    return g
  }
  const withShadow = (fn: () => void) => {
    ctx.save()
    shadow(ctx, css(pal.shadowInk, pal.shadowAlpha * 1.4), c * 0.12, c * 0.04, c * 0.07)
    fn()
    ctx.restore()
  }

  // wooden lugs where the outer ring splits
  for (const s of [-1, 1]) {
    const x = s < 0 ? cx - gap / 2 - tabW : cx + gap / 2
    withShadow(() => {
      ctx.beginPath()
      rrect(ctx, x, ty, tabW, tabH, c * 0.07)
      const g = ctx.createLinearGradient(x, ty, x + tabW, ty + tabH)
      g.addColorStop(0, css(mix(pal.wood, pal.woodLight, 0.55)))
      g.addColorStop(1, css(mix(pal.wood, pal.woodDark, 0.45)))
      ctx.fillStyle = g
      ctx.fill()
    })
    ctx.strokeStyle = css(pal.woodDark, 0.8)
    ctx.lineWidth = Math.max(0.8, c * 0.015)
    ctx.beginPath()
    rrect(ctx, x, ty, tabW, tabH, c * 0.07)
    ctx.stroke()
    // brass ferrule plate
    const px = x + tabW * 0.18
    const pw = tabW * 0.64
    ctx.beginPath()
    rrect(ctx, px, sy - c * 0.11, pw, c * 0.22, c * 0.04)
    ctx.fillStyle = brassGrad(px, sy - c * 0.11, pw, c * 0.22)
    ctx.fill()
  }

  // threaded shaft through both lugs
  const shL = cx - gap / 2 - tabW * 1.2
  const shR = cx + gap / 2 + tabW * 1.15
  const shH = c * 0.085
  ctx.beginPath()
  rrect(ctx, shL, sy - shH / 2, shR - shL, shH, shH / 2)
  ctx.fillStyle = brassGrad(shL, sy - shH / 2, shR - shL, shH)
  ctx.fill()
  ctx.strokeStyle = css(pal.brassDark, 0.7)
  ctx.lineWidth = Math.max(0.5, c * 0.01)
  ctx.beginPath()
  for (let x = cx - gap / 2 + c * 0.01; x < cx + gap / 2; x += c * 0.028) {
    ctx.moveTo(x, sy - shH / 2)
    ctx.lineTo(x + c * 0.015, sy + shH / 2)
  }
  ctx.stroke()

  // knurled thumb nut on the right + round head on the left
  const nx = shR - c * 0.02
  const nw = c * 0.2
  const nh = c * 0.36
  withShadow(() => {
    ctx.beginPath()
    rrect(ctx, nx, sy - nh / 2, nw, nh, c * 0.05)
    ctx.fillStyle = brassGrad(nx, sy - nh / 2, nw, nh)
    ctx.fill()
  })
  ctx.strokeStyle = css(pal.brassDark, 0.55)
  ctx.lineWidth = Math.max(0.5, c * 0.012)
  ctx.beginPath()
  for (let x = nx + c * 0.03; x < nx + nw - c * 0.02; x += c * 0.035) {
    ctx.moveTo(x, sy - nh / 2 + c * 0.03)
    ctx.lineTo(x, sy + nh / 2 - c * 0.03)
  }
  ctx.stroke()
  ctx.beginPath()
  rrect(ctx, nx, sy - nh / 2, nw, nh, c * 0.05)
  ctx.strokeStyle = css(mix(pal.brassDark, pal.shadeMix, 0.4), 0.8)
  ctx.stroke()

  const hx = shL + c * 0.02
  const hr = c * 0.1
  withShadow(() => {
    ctx.beginPath()
    ctx.arc(hx, sy, hr, 0, Math.PI * 2)
    const g = ctx.createRadialGradient(hx - hr * 0.4, sy - hr * 0.4, hr * 0.1, hx, sy, hr)
    g.addColorStop(0, css(pal.brassLight))
    g.addColorStop(0.6, css(pal.brass))
    g.addColorStop(1, css(pal.brassDark))
    ctx.fillStyle = g
    ctx.fill()
  })
  ctx.strokeStyle = css(pal.brassDark, 0.9)
  ctx.lineWidth = Math.max(0.8, c * 0.02)
  ctx.beginPath()
  ctx.moveTo(hx - hr * 0.55, sy)
  ctx.lineTo(hx + hr * 0.55, sy)
  ctx.stroke()
}
