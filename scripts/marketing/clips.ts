// Short gameplay clips for X + WhatsApp Status: the real app recorded frame by frame under
// virtual time (even 30fps), the game's own sounds laid in sync, composited into a phone on linen.
// Needs the dev server: bunx vite --port 5301 --strictPort
// Run: bun scripts/marketing/clips.ts [clip ...] [--compose-only]   (clips: drop win thinking match theme)
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Page } from 'puppeteer-core'
import type { Player } from '../../shared/game'
import { PALETTE } from '../../src/render/palette'
import { drawStitches, rng, type Ctx } from '../../src/render/thread'

process.env.APP_URL ??= 'http://localhost:5301'
const { click, launch, openApp, OUT, ROOT, Recorder, sleep, tapCol } = await import('./lib/browser')
const { renderDecor } = await import('./lib/decor')
const { POS } = await import('./lib/positions')
type Theme = 'light' | 'dark'

const FPS = 30
const DPR = 2
const RAW = join(OUT, 'clips-raw')
const DEST = join(OUT, 'clips')
const WORK = join(OUT, 'clips-raw/_comp')
for (const d of [RAW, DEST, WORK]) mkdirSync(d, { recursive: true })
const FF = '/usr/local/bin/ffmpeg'

const args = process.argv.slice(2)
const composeOnly = args.includes('--compose-only')
const ALL = ['drop', 'win', 'thinking', 'match', 'theme'] as const
type Clip = (typeof ALL)[number]
const want = (args.filter((a) => !a.startsWith('--')) as Clip[]).filter((a) => ALL.includes(a))
const clips: Clip[] = want.length ? want : [...ALL]

// ---------------------------------------------------------------- recording

type Rec = InstanceType<typeof Recorder>
/** Record frames until pred() holds (checked each frame), then `after` more seconds. */
async function holdUntil(rec: Rec, pred: () => Promise<boolean>, maxSec: number, realWaitMs = 0) {
  for (let i = 0; i < maxSec * FPS; i++) {
    if (await pred()) return true
    if (realWaitMs) await sleep(realWaitMs) // let network replies land between frames
    await rec.hold(1 / FPS)
  }
  return false
}
const has = (page: Page, text: string) => () => page.evaluate((t) => !!document.body.textContent?.includes(t), text)

const RECORD: Record<Clip, (b: Awaited<ReturnType<typeof launch>>) => Promise<void>> = {
  async drop(b) {
    const p = await openApp(b, { theme: 'light', vt: true, dpr: DPR, query: 'moves=3,3,2,4,4,2&mode=local' })
    const r = new Recorder(p, join(RAW, 'drop'), FPS)
    await r.freeze()
    await r.hold(0.8)
    for (const col of [3, 5, 1]) {
      await tapCol(p, col)
      await r.hold(0.95)
    }
    await r.hold(0.6)
    await r.finish()
  },
  async win(b) {
    const p = await openApp(b, { theme: 'light', vt: true, dpr: DPR, query: `moves=${POS.diag}` })
    const r = new Recorder(p, join(RAW, 'win'), FPS)
    await r.freeze()
    await r.hold(0.8)
    await tapCol(p, POS.diagWin)
    await r.hold(4.4)
    await r.finish()
  },
  async thinking(b) {
    const p = await openApp(b, { theme: 'dark', vt: true, dpr: DPR, query: `moves=${POS.idle}&botDelay=2100` })
    const r = new Recorder(p, join(RAW, 'thinking'), FPS)
    await r.freeze()
    await r.hold(0.6)
    await tapCol(p, 5)
    await r.hold(3.6)
    await r.finish()
  },
  async match(b) {
    const a = await openApp(b, { theme: 'light', vt: true, dpr: DPR })
    const r = new Recorder(a, join(RAW, 'match'), FPS)
    await r.freeze()
    await r.hold(0.5)
    await click(a, 'css:.mode-chip')
    await r.hold(0.6)
    await click(a, 'Online')
    await r.hold(0.9)
    await click(a, 'Find a player')
    await r.hold(1.2)
    // a second player looks too (real time, own context); the lobby pairs them
    const f = await openApp(b, { theme: 'light', dpr: 1, name: 'quiet-wren' })
    await click(f, 'css:.mode-chip')
    await sleep(500)
    await click(f, 'Online')
    await sleep(500)
    await click(f, 'Find a player')
    // wait in real time without frames: the search screen just keeps sewing
    for (let i = 0; i < 100 && !(await has(a, 'Found a player')()); i++) await sleep(100)
    if (!(await has(a, 'Found a player')())) throw new Error('no match')
    const found = r.time
    await r.hold(0.2)
    const matched = () => a.evaluate(() => !!document.body.textContent?.includes('Online · Matched') && !document.querySelector('.board-overlay'))
    if (!(await holdUntil(r, matched, 6, 40))) throw new Error('matched board never showed')
    await r.hold(0.7)
    // first move: whoever's seat starts drops in the middle (the opponent's move arrives over the wire)
    const nSounds = () => a.evaluate(() => (window as any).__vt.sounds.length as number)
    const before = await nSounds()
    const mine = await has(a, 'Your turn')()
    await tapCol(mine ? a : f, 3)
    if (!(await holdUntil(r, async () => (await nSounds()) > before, 3, mine ? 0 : 40))) throw new Error('first move never landed')
    await r.hold(1.3)
    await r.finish({ found })
  },
  async theme(b) {
    for (const theme of ['light', 'dark'] as Theme[]) {
      const p = await openApp(b, { theme, vt: true, dpr: DPR, query: `moves=${POS.idle}&mode=local` })
      const r = new Recorder(p, join(RAW, `theme-${theme}`), FPS)
      await r.freeze()
      await r.hold(2.0)
      await r.finish()
    }
  },
}

// ---------------------------------------------------------------- framing

const fonts = join(ROOT, 'node_modules/@fontsource/lora/files')
GlobalFonts.registerFromPath(join(fonts, 'lora-latin-500-italic.woff2'), 'Lora Italic')
GlobalFonts.registerFromPath(join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'Inter')

const CAPTION: Record<Clip, string> = {
  drop: 'A soft little drop.',
  win: 'Four in a row, sewn in.',
  thinking: 'The computer thinks it over.',
  match: 'Find a player. Stay anonymous.',
  theme: 'Light and dark.',
}
const CLIP_THEME: Record<Exclude<Clip, 'theme'>, Theme> = { drop: 'light', win: 'light', thinking: 'dark', match: 'light' }
const INK = { light: '#2a2723', dark: '#ece8df' }
const INK3 = { light: '#6f695f', dark: '#9aa0b3' }

interface Layout {
  name: string
  w: number
  h: number
  /** screen rect (video goes here) */
  sx: number
  sy: number
  sw: number
  sh: number
  /** text block: centre x, caption top y, max width, caption size */
  tx: number
  ty: number
  tw: number
  ts: number
  /** url baseline when it sits apart from the caption (story) */
  uy?: number
  loose: { x: number; y: number; p: Player; size: number; rot?: number }[]
}
const screen = (sh: number) => ({ sh, sw: Math.round((sh * 390) / 844 / 2) * 2 })
const LAYOUTS: Layout[] = (() => {
  const st = screen(1100)
  const wd = screen(900)
  const sq = screen(890)
  return [
    {
      name: '9x16', w: 1080, h: 1920, ...st, sx: (1080 - st.sw) / 2, sy: 420, tx: 540, ty: 290, tw: 900, ts: 56, uy: 1612,
      loose: [{ x: 120, y: 1720, p: 1, size: 70, rot: 10 }, { x: 965, y: 175, p: 2, size: 58, rot: -20 }],
    },
    {
      name: '16x9', w: 1920, h: 1080, ...wd, sx: 1290 - wd.sw / 2, sy: 90, tx: 600, ty: 430, tw: 720, ts: 66,
      loose: [{ x: 1700, y: 880, p: 1, size: 74, rot: 12 }, { x: 205, y: 190, p: 2, size: 60, rot: -16 }],
    },
    {
      name: '1x1', w: 1080, h: 1080, ...sq, sx: 330 - sq.sw / 2, sy: 95, tx: 790, ty: 440, tw: 470, ts: 50,
      loose: [{ x: 930, y: 900, p: 1, size: 62, rot: 12 }, { x: 905, y: 170, p: 2, size: 50, rot: -16 }],
    },
  ]
})()
const bezel = (L: Layout) => Math.round(L.sw * 0.04)
const radius = (L: Layout) => L.sw * 0.13

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: Ctx, text: string, max: number) {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(' ')) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > max && cur) {
      lines.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) lines.push(cur)
  // prefer breaking after a full stop when the caption has two sentences
  if (lines.length === 2 && /\. /.test(text)) return text.split(/(?<=\.) /)
  const punct = text.match(/^(.+?[,.]) (.+)$/)
  if (lines.length === 2 && punct) return [punct[1], punct[2]]
  if (lines.length === 2) {
    // balance two lines so no word is left alone
    const ws = text.split(' ')
    let best = lines, bw = Infinity
    for (let i = 1; i < ws.length; i++) {
      const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' ')
      const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width)
      if (m < bw) { bw = m; best = [a, b] }
    }
    return best
  }
  return lines
}

/** Background (linen, hem, loose pieces, phone shadow, caption, url) for one layout + theme. */
async function background(L: Layout, theme: Theme, caption: string) {
  const file = join(WORK, `bg-${L.name}-${theme}-${caption.replace(/\W+/g, '_')}.png`)
  if (existsSync(file)) return file
  const base = await renderDecor({ w: L.w, h: L.h, theme, pieces: L.loose })
  const S = 2
  const c = createCanvas(L.w * S, L.h * S)
  const ctx = c.getContext('2d') as unknown as Ctx
  ctx.drawImage((await loadImage(base)) as unknown as CanvasImageSource, 0, 0, L.w * S, L.h * S)
  ctx.scale(S, S)
  const pal = PALETTE[theme]
  // phone contact shadow
  const b = bezel(L)
  ctx.save()
  ctx.shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(60,40,20,0.30)'
  ctx.shadowBlur = 46
  ctx.shadowOffsetY = 16
  ctx.fillStyle = '#222'
  rrect(ctx, L.sx - b, L.sy - b, L.sw + 2 * b, L.sh + 2 * b, radius(L) + b)
  ctx.fill()
  ctx.restore()
  // caption
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK[theme]
  ctx.font = `${L.ts}px "Lora Italic"`
  const lines = wrap(ctx, caption, L.tw)
  const lh = L.ts * 1.28
  let y = L.ty + L.ts
  for (const ln of lines) {
    ctx.fillText(ln, L.tx, y)
    y += lh
  }
  // a short running stitch, then the url
  const us = Math.round(L.ts * 0.5)
  let uy = L.uy ?? y + L.ts * 0.55 + us
  if (!L.uy) {
    const sy = y - lh + L.ts * 0.75
    const n = 5
    const st: [number, number, number, number][] = []
    const len = L.ts * 1.9
    for (let i = 0; i < n; i++) {
      const x0 = L.tx - len / 2 + (i * len) / n
      st.push([x0, sy, x0 + (len / n) * 0.62, sy])
    }
    drawStitches(ctx, st, { color: pal.p1, width: 3.2, pal, rand: rng(7), tone: 0.03, shadow: 1, light: 0.8, edge: 0.6 })
    uy = sy + L.ts * 0.55 + us
  }
  ctx.fillStyle = INK3[theme]
  ctx.font = `500 ${us}px Inter`
  ;(ctx as any).letterSpacing = `${(us * 0.04).toFixed(1)}px`
  ctx.fillText('stitchfour.pasoma.ai', L.tx, uy)
  await sharp(c.toBuffer('image/png')).resize(L.w, L.h, { kernel: 'lanczos3' }).png().toFile(file)
  return file
}

/** Phone body with the screen cut out: laid over the video so the screen corners round off. */
async function phone(L: Layout, theme: Theme) {
  const file = join(WORK, `phone-${L.name}-${theme}.png`)
  if (existsSync(file)) return file
  const c = createCanvas(L.w, L.h)
  const ctx = c.getContext('2d') as unknown as Ctx
  const b = bezel(L)
  const r = radius(L)
  const bx = L.sx - b, by = L.sy - b, bw = L.sw + 2 * b, bh = L.sh + 2 * b
  const body = theme === 'dark' ? ['#2b2d36', '#15161c'] : ['#3a3531', '#1d1a18']
  const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh)
  g.addColorStop(0, body[0])
  g.addColorStop(1, body[1])
  ctx.fillStyle = g
  rrect(ctx, bx, by, bw, bh, r + b)
  ctx.fill()
  // thin lit rim
  ctx.strokeStyle = theme === 'dark' ? 'rgba(200,205,225,0.22)' : 'rgba(255,240,220,0.22)'
  ctx.lineWidth = 2
  rrect(ctx, bx + 1, by + 1, bw - 2, bh - 2, r + b - 1)
  ctx.stroke()
  // side buttons
  ctx.fillStyle = body[1]
  rrect(ctx, bx + bw - 1, by + bh * 0.22, 5, bh * 0.1, 2)
  ctx.fill()
  rrect(ctx, bx - 4, by + bh * 0.18, 5, bh * 0.06, 2)
  ctx.fill()
  rrect(ctx, bx - 4, by + bh * 0.27, 5, bh * 0.06, 2)
  ctx.fill()
  // screen hole
  ctx.globalCompositeOperation = 'destination-out'
  rrect(ctx, L.sx, L.sy, L.sw, L.sh, r)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  // soft inner edge so the glass sits in the body
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1.5
  rrect(ctx, L.sx, L.sy, L.sw, L.sh, r)
  ctx.stroke()
  // a small camera pill, like most phones (drawn over the app's top bar area)
  ctx.fillStyle = '#0d0d10'
  const pw = L.sw * 0.27, ph = L.sw * 0.075
  rrect(ctx, L.sx + (L.sw - pw) / 2, L.sy + L.sw * 0.03, pw, ph, ph / 2)
  ctx.fill()
  writeFileSync(file, c.toBuffer('image/png'))
  return file
}

// ---------------------------------------------------------------- audio + encode

interface Meta { fps: number; frames: number; sounds: { t: number; url: string; rate: number; vol: number }[] }
const meta = (name: string): Meta => JSON.parse(readFileSync(join(RAW, name, 'meta.json'), 'utf8'))

const GAIN = 0.6
/** ffmpeg inputs + filter chains for the sounds, starting at input index `first`. */
function audio(sounds: Meta['sounds'], first: number, dur: number, shift = 0) {
  const inputs: string[] = []
  const chains: string[] = []
  const labels: string[] = []
  sounds.forEach((s, i) => {
    const file = join(ROOT, 'public', new URL(s.url, 'http://x').pathname)
    const t = s.t + shift - 1 / FPS // frame k shows time (k+1)/fps
    if (!existsSync(file) || t < 0 || t > dur - 0.05) return
    inputs.push('-i', file)
    const idx = first + inputs.length / 2 - 1
    const ms = Math.round(t * 1000)
    const rate = s.rate && Math.abs(s.rate - 1) > 0.001 ? `asetrate=${Math.round(44100 * s.rate)},aresample=44100,` : ''
    chains.push(`[${idx}:a]${rate}volume=${(s.vol * GAIN).toFixed(3)},adelay=${ms}:all=1[s${i}]`)
    labels.push(`[s${i}]`)
  })
  const mix = labels.length
    ? `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=0:${dur.toFixed(3)},afade=t=out:st=${(dur - 0.3).toFixed(3)}:d=0.3,aformat=channel_layouts=stereo[aout]`
    : `anullsrc=r=44100:cl=stereo,atrim=0:${dur.toFixed(3)}[aout]`
  return { inputs, chains, mix }
}

/** Run ffmpeg; one encode takes well under a minute, so a run past 3 min is a rare wedge: kill + retry. */
async function ff(argv: string[], tries = 2): Promise<void> {
  const p = Bun.spawn([FF, '-y', '-nostdin', '-hide_banner', '-loglevel', 'error', ...argv], { stderr: 'pipe', stdin: 'ignore' })
  const kill = setTimeout(() => p.kill(9), 180_000)
  const err = await new Response(p.stderr).text()
  const code = await p.exited
  clearTimeout(kill)
  if (code === 0) return
  if (p.signalCode && tries > 1) return ff(argv, tries - 1)
  throw new Error(`ffmpeg failed (${code ?? p.signalCode}): ${err}`)
}

const TV = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p'
const ENC = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart']

/** Layers for one recording: [bg][video][phone] → label. Returns its three inputs. */
function layer(L: Layout, bg: string, frames: string, ph: string, base: number, out: string) {
  return {
    inputs: ['-loop', '1', '-framerate', String(FPS), '-i', bg, '-framerate', String(FPS), '-i', join(frames, 'f%05d.jpg'), '-loop', '1', '-framerate', String(FPS), '-i', ph],
    chain:
      `[${base + 1}:v]scale=${L.sw}:${L.sh}:flags=lanczos,setsar=1[v${base}];` +
      `[${base}:v][v${base}]overlay=${L.sx}:${L.sy}:shortest=1:format=rgb[a${base}];` +
      `[a${base}][${base + 2}:v]overlay=0:0:shortest=1:format=rgb,${TV},setsar=1${out}`,
  }
}

async function compose(clip: Clip) {
  for (const L of LAYOUTS) {
    const out = join(DEST, `${clip}-${L.name}.mp4`)
    if (clip === 'theme') {
      const ma = meta('theme-light'), mb = meta('theme-dark')
      const XD = 0.8, OFF = ma.frames / FPS - XD - 0.1
      const dur = OFF + mb.frames / FPS
      const A = layer(L, await background(L, 'light', CAPTION.theme), join(RAW, 'theme-light'), await phone(L, 'light'), 0, '[la]')
      const B = layer(L, await background(L, 'dark', CAPTION.theme), join(RAW, 'theme-dark'), await phone(L, 'dark'), 3, '[lb]')
      // a soft tap as the switch begins
      const au = audio([{ t: OFF + 1 / FPS, url: '/sounds/tap.mp3', rate: 1, vol: 0.9 }], 6, dur)
      const fc = [A.chain, B.chain, `[la][lb]xfade=transition=fade:duration=${XD}:offset=${OFF.toFixed(3)},format=yuv420p[v]`, ...au.chains, au.mix].join(';')
      await ff([...A.inputs, ...B.inputs, ...au.inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[aout]', '-t', dur.toFixed(3), ...ENC, out])
    } else {
      const m = meta(clip)
      const theme = CLIP_THEME[clip]
      const dur = m.frames / FPS
      const V = layer(L, await background(L, theme, CAPTION[clip]), join(RAW, clip), await phone(L, theme), 0, '[v]')
      // the app is quiet when a match lands; a soft "react" marks the moment in the clip
      const extra = (m as any).found ? [{ t: (m as any).found + 1 / FPS, url: '/sounds/react.mp3', rate: 1, vol: 0.8 }] : []
      const au = audio([...m.sounds, ...extra], 3, dur)
      const fc = [V.chain, ...au.chains, au.mix].join(';')
      await ff([...V.inputs, ...au.inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[aout]', '-t', dur.toFixed(3), ...ENC, out])
    }
    console.log('  ', out.replace(ROOT + '/', ''), `${(statSync(out).size / 1e6).toFixed(2)} MB`)
  }
  if (clip === 'drop' || clip === 'win') await gif(clip)
}

/** Looping 720px GIF from the square cut, no audio, kept under 8 MB. */
async function gif(clip: Clip) {
  const src = join(DEST, `${clip}-1x1.mp4`)
  const out = join(DEST, `${clip}.gif`)
  for (const fps of [20, 15, 12]) {
    await ff([
      '-i', src, '-filter_complex',
      `[0:v]fps=${fps},scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
      '-loop', '0', out,
    ])
    const mb = statSync(out).size / 1e6
    console.log('  ', out.replace(ROOT + '/', ''), `${mb.toFixed(2)} MB @${fps}fps`)
    if (mb <= 8) return
  }
}

// ---------------------------------------------------------------- main

if (!composeOnly) {
  const browser = await launch()
  try {
    for (const c of clips) {
      console.log('record', c)
      await RECORD[c](browser)
      for (const ctx of browser.browserContexts()) if (ctx !== browser.defaultBrowserContext()) await ctx.close()
    }
  } finally {
    await browser.close()
  }
}
for (const c of clips) {
  console.log('compose', c)
  await compose(c)
}
