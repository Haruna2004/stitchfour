// Render board previews to PNG (dev only). Run: bun scripts/preview-board.ts [outDir]
import { createCanvas, loadImage } from '@napi-rs/canvas'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PALETTE, type Theme } from '../src/render/palette'
import { cellCenter, drawBoard, layoutFor } from '../src/render/hoop'
import { DISC, drawPiece } from '../src/render/pieces'
import { drawStitches, type Ctx, type Stitch } from '../src/render/thread'
import { winStitches } from '../src/render/winpath'
import type { Player } from '../shared/game'

const root = join(import.meta.dir, '..')
const out = process.argv[2] ?? join(root, '.preview')
mkdirSync(out, { recursive: true })
const DPR = 2
const CELL = Number(process.env.CELL ?? 42)

async function fabric(theme: Theme) {
  const png = await sharp(join(root, `public/textures/linen-${theme}.webp`)).png().toBuffer()
  return loadImage(png)
}

// a mid-game position with a diagonal win for player 2
const pieces: [number, number, Player][] = [
  [2, 0, 2], [3, 0, 1], [3, 1, 2], [4, 0, 1], [4, 1, 1], [4, 2, 2], [5, 0, 1], [5, 1, 2],
  [5, 2, 1], [5, 3, 2], [6, 0, 2], [1, 0, 1], [3, 2, 1], [0, 0, 1], [6, 1, 2],
]
const win = [0, 1, 2, 3].map((i) => ({ col: 2 + i, row: i }))

for (const theme of ['light', 'dark'] as Theme[]) {
  const pal = PALETTE[theme]
  const l = layoutFor(CELL)
  const W = Math.ceil(l.width * DPR)
  const H = Math.ceil(l.height * DPR)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d') as unknown as Ctx
  ctx.fillStyle = ctx.createPattern((await fabric(theme)) as unknown as CanvasImageSource, 'repeat')!
  ctx.fillRect(0, 0, W, H)
  ctx.scale(DPR, DPR)
  drawBoard(ctx, l, pal)

  // pieces (as the DOM would place sprites)
  const px = Math.round(l.pieceSize * DPR)
  const sprites = new Map<Player, ReturnType<typeof createCanvas>>()
  for (const p of [1, 2] as Player[]) {
    const sc = createCanvas(px, px)
    drawPiece(sc.getContext('2d') as unknown as Ctx, p, pal, px)
    sprites.set(p, sc)
  }
  const isWin = (c: number, r: number) => win.some((w) => w.col === c && w.row === r)
  for (const [col, row, p] of pieces) {
    const { x, y } = cellCenter(l, col, row)
    ctx.globalAlpha = isWin(col, row) ? 1 : 0.45
    ctx.drawImage(sprites.get(p)! as unknown as CanvasImageSource, x - l.pieceSize / 2, y - l.pieceSize / 2, l.pieceSize, l.pieceSize)
  }
  ctx.globalAlpha = 1
  // ghost in the aim lane
  ctx.globalAlpha = 0.6
  const g = cellCenter(l, 1, 0)
  ctx.drawImage(sprites.get(1)! as unknown as CanvasImageSource, g.x - l.pieceSize / 2, l.laneY - l.pieceSize / 2, l.pieceSize, l.pieceSize)
  ctx.globalAlpha = 1

  // win thread (the app draws this as SVG with the same geometry)
  const pts = win.map((w) => cellCenter(l, w.col, w.row))
  const ws = winStitches(pts, l.cell)
  drawStitches(ctx, ws.stitches.map((s) => [s.x1, s.y1, s.x2, s.y2] as Stitch), {
    color: pal.win, width: ws.width, pal, tone: 0.04, shadow: 1.2,
  })

  writeFileSync(join(out, `board-${theme}.png`), canvas.toBuffer('image/png'))

  // piece strip: large + small sizes
  const sizes = [160, 80, 48, 40]
  const strip = createCanvas(sizes.reduce((a, s) => a + s * 2 + 30, 20), 200)
  const sx = strip.getContext('2d') as unknown as Ctx
  sx.fillStyle = sx.createPattern((await fabric(theme)) as unknown as CanvasImageSource, 'repeat')!
  sx.fillRect(0, 0, strip.width, strip.height)
  let x = 10
  for (const s of sizes) {
    for (const p of [1, 2] as Player[]) {
      const pc = createCanvas(s, s)
      drawPiece(pc.getContext('2d') as unknown as Ctx, p, pal, s)
      sx.drawImage(pc as unknown as CanvasImageSource, x, 20)
      x += s + 15
    }
  }
  writeFileSync(join(out, `pieces-${theme}.png`), strip.toBuffer('image/png'))
  console.log(theme, 'ok', W, H, 'disc', DISC)
}
