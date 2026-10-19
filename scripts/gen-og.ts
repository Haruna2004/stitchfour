// Render the Open Graph share image (1200x630) to public/og-image.png.
// Run: bun scripts/gen-og.ts [out.png]
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PALETTE } from '../src/render/palette'
import { cellCenter, drawBoard, layoutFor } from '../src/render/hoop'
import { drawPiece } from '../src/render/pieces'
import { drawStitches, rng, type Ctx, type Stitch } from '../src/render/thread'
import { winBelt } from '../src/render/winpath'
import type { Player } from '../shared/game'

const root = join(import.meta.dir, '..')
const out = process.argv[2] ?? join(root, 'public/og-image.png')
const fonts = join(root, 'node_modules/@fontsource/lora/files')
GlobalFonts.registerFromPath(join(fonts, 'lora-latin-700-normal.woff2'), 'Lora')
GlobalFonts.registerFromPath(join(fonts, 'lora-latin-500-italic.woff2'), 'Lora Italic')

const W = 1200
const H = 630
const S = 2 // render at 2x, downscale for crisp threads
const pal = PALETTE.light
const INK = '#2a2723'
const INK2 = '#5a534b'

const canvas = createCanvas(W * S, H * S)
const ctx = canvas.getContext('2d') as unknown as Ctx
// weave softened a touch: full detail is noise at thumbnail size and bloats the PNG
const linen = await loadImage(
  await sharp(join(root, 'public/textures/linen-light.webp')).blur(0.6).linear(0.8, 232 * 0.2).png().toBuffer(),
)
ctx.fillStyle = ctx.createPattern(linen as unknown as CanvasImageSource, 'repeat')!
ctx.fillRect(0, 0, W * S, H * S)
ctx.scale(S, S)

/** Running stitches along a rounded rect. */
function frameStitches(x: number, y: number, w: number, h: number, r: number, period: number, duty: number): Stitch[] {
  // perimeter as a list of sampled points
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
  const n = Math.round(total / period)
  const step = total / n
  const out: Stitch[] = []
  for (let i = 0; i < n; i++) {
    const p = at(i * step)
    const q = at(i * step + step * duty)
    out.push([p[0], p[1], q[0], q[1]])
  }
  return out
}

// --- stitched hem around the whole card
drawStitches(ctx, frameStitches(22, 22, W - 44, H - 44, 28, 17, 0.62), {
  color: pal.ring, width: 2.6, pal, rand: rng(3), tone: 0.08, shadow: 0.8, light: 0.7,
})

// --- the hoop, tilted, bleeding off the bottom right
const l = layoutFor(70)
ctx.save()
ctx.translate(W - l.width * 0.5 + 2, H * 0.5 + 36)
ctx.rotate((5 * Math.PI) / 180)
ctx.translate(-l.width / 2, -l.height / 2)
drawBoard(ctx, l, pal)

// a mid-game position with a diagonal gold win
const pieces: [number, number, Player][] = [
  [2, 0, 2], [3, 0, 1], [3, 1, 2], [4, 0, 1], [4, 1, 1], [4, 2, 2], [5, 0, 1], [5, 1, 2],
  [5, 2, 1], [5, 3, 2], [6, 0, 2], [1, 0, 1], [3, 2, 1], [0, 0, 1], [6, 1, 2], [1, 1, 1],
]
const win = [0, 1, 2, 3].map((i) => ({ col: 2 + i, row: i }))
const px = Math.round(l.pieceSize * S * 1.4)
const sprite = (p: Player) => {
  const c = createCanvas(px, px)
  drawPiece(c.getContext('2d') as unknown as Ctx, p, pal, px)
  return c as unknown as CanvasImageSource
}
const sprites = { 1: sprite(1), 2: sprite(2) }
for (const [col, row, p] of pieces) {
  const { x, y } = cellCenter(l, col, row)
  ctx.drawImage(sprites[p], x - l.pieceSize / 2, y - l.pieceSize / 2, l.pieceSize, l.pieceSize)
}
// red's next piece waiting in the aim lane
const g = cellCenter(l, 1, 0)
ctx.globalAlpha = 0.9
ctx.drawImage(sprites[1], g.x - l.pieceSize / 2, l.laneY - l.pieceSize / 2, l.pieceSize, l.pieceSize)
ctx.globalAlpha = 1

const belt = winBelt(win.map((w) => cellCenter(l, w.col, w.row)), l.cell)
drawStitches(ctx, belt.stitches.map((s) => [s.x1, s.y1, s.x2, s.y2] as Stitch), {
  color: pal.win, width: belt.width, pal, tone: 0.04, shadow: 1.2,
})
ctx.restore()

// --- title block
const TX = 84
ctx.fillStyle = INK
ctx.textBaseline = 'alphabetic'
ctx.font = '700 132px Lora'
ctx.fillText('Stitch', TX, 250)
ctx.fillText('Four', TX, 382)

// red running stitch under the title
const under: Stitch[] = []
for (let i = 0; i < 9; i++) {
  const x = TX + 6 + i * 34
  under.push([x, 422 + Math.sin(i * 0.9) * 1.5, x + 22, 422 + Math.sin(i * 0.9 + 0.6) * 1.5])
}
drawStitches(ctx, under, { color: pal.p1, width: 6, pal, rand: rng(9), tone: 0.06 })

ctx.fillStyle = INK2
ctx.font = '37px "Lora Italic"'
ctx.fillText('Four in a row, embroidered.', TX, 498)

const png = canvas.toBuffer('image/png')
const final = await sharp(png)
  .resize(W, H, { kernel: 'lanczos3' })
  .png({ palette: true, quality: 60, effort: 10 }) // keeps it under ~300 KB for WhatsApp
  .toBuffer()
writeFileSync(out, final)
console.log(out, `${(final.length / 1024).toFixed(0)} KB`)

// small preview to judge thumbnail legibility
const small = process.env.SMALL
if (small) writeFileSync(small, await sharp(final).resize(400, 210).png().toBuffer())
