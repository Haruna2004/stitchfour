// B. Framed marketing stills: linen + stitched hem (lib/decor), a CSS phone holding a raw
// capture, Lora headline + Inter subline. Needs marketing/out/raw (capture-raw.ts) first.
// Run: bun scripts/marketing/stills.ts [slide-name ...]   (no names = all)
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { launch, OUT, ROOT, type Theme } from './lib/browser'
import { renderDecor, type Loose } from './lib/decor'

const RAW = join(OUT, 'raw')
const URL_TEXT = 'stitchfour.harunafaruk.com'
const only = process.argv.slice(2)

// ---------- sizes + layouts ----------
type Size = 'x-16x9' | 'x-1x1' | 'status-9x16'
interface Layout {
  w: number
  h: number
  /** text block box */
  text: { x: number; y: number; w: number; h: number; align: 'left' | 'center' }
  /** phone area: centre + total phone height (one phone / two phones) */
  phone: { cx: number; cy: number; h: number; h2: number; gap2: number }
  footer: { x: number; y: number; align: 'left' | 'center' }
  type: { eyebrow: number; head: number; sub: number; foot: number }
  /** loose pieces + thread, in px */
  pieces: Loose[]
  thread: number[]
}
const LAYOUT: Record<Size, Layout> = {
  'x-16x9': {
    w: 1600, h: 900,
    text: { x: 140, y: 120, w: 610, h: 600, align: 'left' },
    phone: { cx: 1160, cy: 450, h: 770, h2: 640, gap2: 360 },
    footer: { x: 140, y: 790, align: 'left' },
    type: { eyebrow: 22, head: 80, sub: 34, foot: 24 },
    pieces: [
      { x: 1490, y: 150, p: 1, size: 70, rot: 10 },
      { x: 1530, y: 235, p: 2, size: 54, rot: -14 },
      { x: 470, y: 830, p: 2, size: 46, rot: 20 },
    ],
    thread: [470, 830, 540, 860, 600, 790, 690, 818],
  },
  'x-1x1': {
    w: 1200, h: 1200,
    text: { x: 100, y: 78, w: 1000, h: 310, align: 'center' },
    phone: { cx: 600, cy: 768, h: 700, h2: 650, gap2: 370 },
    footer: { x: 600, y: 1136, align: 'center' },
    type: { eyebrow: 22, head: 70, sub: 32, foot: 24 },
    pieces: [
      { x: 1040, y: 760, p: 1, size: 76, rot: 10 },
      { x: 1100, y: 850, p: 2, size: 58, rot: -12 },
      { x: 150, y: 1000, p: 2, size: 64, rot: 24 },
    ],
    thread: [150, 1000, 90, 940, 140, 860, 80, 790],
  },
  'status-9x16': {
    w: 1080, h: 1920,
    text: { x: 90, y: 255, w: 900, h: 365, align: 'center' },
    phone: { cx: 540, cy: 1102, h: 870, h2: 800, gap2: 420 },
    footer: { x: 540, y: 1585, align: 'center' },
    type: { eyebrow: 28, head: 88, sub: 40, foot: 32 },
    pieces: [
      { x: 900, y: 150, p: 1, size: 84, rot: 10 },
      { x: 975, y: 240, p: 2, size: 62, rot: -14 },
      { x: 150, y: 1760, p: 2, size: 70, rot: 22 },
      { x: 930, y: 1790, p: 1, size: 56, rot: -8 },
    ],
    thread: [80, 180, 200, 90, 260, 250, 380, 150],
  },
}

// ---------- slides ----------
interface Slide {
  name: string
  eyebrow: string
  head: string
  sub?: string
  /** raw capture names (without -theme); two = two phones */
  shots: [string] | [string, string]
  /** per-phone theme override (themes slide) */
  themes?: [Theme, Theme]
  /** render light + dark variants, or one fixed */
  variants: Theme[]
}
const SLIDES: Slide[] = [
  { name: '1-hero', eyebrow: 'Stitch Four', head: 'Four in a row, embroidered.', sub: 'Free to play in your browser.', shots: ['win-horizontal-belt'], variants: ['light', 'dark'] },
  { name: '2-computer', eyebrow: 'Play solo', head: 'Play the computer.', sub: 'Three levels, from gentle to stubborn.', shots: ['thinking'], variants: ['light', 'dark'] },
  { name: '3-online', eyebrow: 'Play together', head: 'Invite a friend, or find a player.', sub: 'Strangers stay anonymous.', shots: ['find-player', 'matched'], variants: ['light', 'dark'] },
  { name: '4-offline', eyebrow: 'Anywhere', head: 'Works offline.', sub: 'Add it to your home screen. No app store.', shots: ['idle'], variants: ['light', 'dark'] },
  { name: '5-themes', eyebrow: 'Stitch Four', head: 'Light and dark.', sub: 'Cream linen by day, navy denim by night.', shots: ['win-diagonal', 'win-diagonal'], themes: ['light', 'dark'], variants: ['light', 'dark'] },
]

// ---------- colours (src/styles/theme.css) ----------
const INK = {
  light: { ink: '#2a2723', ink2: '#4d4842', ink3: '#6f695f', red: '#b3342e', glow: 'rgba(253,252,250,0.55)' },
  dark: { ink: '#ece8df', ink2: '#c6c1b7', ink3: '#9ea3b4', red: '#f06a5f', glow: 'rgba(20,24,40,0.45)' },
}

// ---------- assets ----------
const font = (p: string) => `data:font/woff2;base64,${readFileSync(join(ROOT, 'node_modules', p)).toString('base64')}`
const FONTS = `
@font-face{font-family:Lora;font-weight:600;src:url(${font('@fontsource/lora/files/lora-latin-600-normal.woff2')}) format('woff2')}
@font-face{font-family:Lora;font-weight:700;src:url(${font('@fontsource/lora/files/lora-latin-700-normal.woff2')}) format('woff2')}
@font-face{font-family:Inter;font-weight:100 900;src:url(${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}) format('woff2-variations')}`

/** Raw capture downscaled (lanczos) to exactly the on-screen pixel size, so Chrome draws it 1:1. */
async function screenImg(shot: string, theme: Theme, w: number, h: number) {
  const src = sharp(join(RAW, `${shot}-${theme}.png`))
  const m = await src.metadata()
  const top = Math.round(m.height! * CROP.top)
  const height = Math.round(m.height! * (1 - CROP.top - CROP.bottom))
  const buf = await src.extract({ left: 0, top, width: m.width!, height }).resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

// phone geometry from total height: screen 390:844, bezel ~4.6% of screen width
// the captures have a band of plain linen top + bottom; trim a little so the board reads bigger
const CROP = { top: 0.05, bottom: 0.07 }
const SCREEN_AR = 390 / (844 * (1 - CROP.top - CROP.bottom))
const BEZEL = 0.046
function phoneDims(total: number) {
  const sh = Math.round(total / (1 + 2 * BEZEL * SCREEN_AR))
  const sw = Math.round(sh * SCREEN_AR)
  const b = Math.round(sw * BEZEL)
  return { sw, sh, b, w: sw + 2 * b, h: sh + 2 * b }
}

async function phoneHtml(shot: string, theme: Theme, total: number, cx: number, cy: number, rot: number, z: number, pageTheme: Theme) {
  const d = phoneDims(total)
  const img = await screenImg(shot, theme, d.sw, d.sh)
  const shadow = pageTheme === 'dark'
    ? `0 ${d.h * 0.03}px ${d.h * 0.07}px rgba(2,4,12,0.55), 0 ${d.h * 0.008}px ${d.h * 0.015}px rgba(2,4,12,0.45)`
    : `0 ${d.h * 0.035}px ${d.h * 0.075}px rgba(74,48,22,0.30), 0 ${d.h * 0.008}px ${d.h * 0.016}px rgba(74,48,22,0.22)`
  const r = d.w * 0.15
  return `<div class="phone" style="left:${cx - d.w / 2}px;top:${cy - d.h / 2}px;width:${d.w}px;height:${d.h}px;border-radius:${r}px;padding:${d.b}px;transform:rotate(${rot}deg);z-index:${z};box-shadow:${shadow}, inset 0 0 0 ${Math.max(1, d.b * 0.12)}px rgba(255,240,220,0.10), inset 0 ${d.b * 0.15}px ${d.b * 0.3}px rgba(255,245,230,0.10)">
    <div class="screen" style="width:${d.sw}px;height:${d.sh}px;border-radius:${r - d.b}px"><img src="${img}" width="${d.sw}" height="${d.sh}">
      <div class="cam" style="top:${d.sh * 0.012}px;width:${d.sw * 0.27}px;height:${d.sw * 0.075}px;margin-left:${-d.sw * 0.135}px"></div>
    </div>
  </div>`
}

/** A short red running stitch under the headline (like the OG image). */
function stitchRule(color: string, scale: number, align: 'left' | 'center') {
  const n = 7, len = 26 * scale, gap = 10 * scale, h = 7 * scale
  const w = n * len + (n - 1) * gap
  const dashes = Array.from({ length: n }, (_, i) =>
    `<rect x="${i * (len + gap)}" y="0" width="${len}" height="${h}" rx="${h / 2}" fill="${color}"/><rect x="${i * (len + gap) + h * 0.5}" y="${h * 0.18}" width="${len - h}" height="${h * 0.22}" rx="${h * 0.11}" fill="rgba(255,255,255,0.35)"/>`,
  ).join('')
  return `<svg class="rule" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="${align === 'center' ? 'margin:0 auto' : ''}">${dashes}</svg>`
}

async function slideHtml(s: Slide, size: Size, theme: Theme) {
  const L = LAYOUT[size]
  const c = INK[theme]
  // drop loose pieces that would sit under a phone (rotation + shadow margin)
  const P0 = L.phone
  const two = s.shots.length === 2
  const pd = phoneDims(two ? P0.h2 : P0.h)
  const rects = (two ? [P0.cx - P0.gap2 / 2, P0.cx + P0.gap2 / 2] : [P0.cx]).map((cx) => ({ x0: cx - pd.w / 2 - 50, x1: cx + pd.w / 2 + 50, y0: P0.cy - pd.h / 2 - 40, y1: P0.cy + pd.h / 2 + 40 }))
  const pieces = L.pieces.filter((lp) => !rects.some((r) => lp.x + lp.size / 2 > r.x0 && lp.x - lp.size / 2 < r.x1 && lp.y + lp.size / 2 > r.y0 && lp.y - lp.size / 2 < r.y1))
  const bg = await renderDecor({ w: L.w, h: L.h, theme, pieces, thread: { pts: L.thread, p: 1 } })
  const bgUri = `data:image/png;base64,${bg.toString('base64')}`
  const P = L.phone
  let phones = ''
  if (s.shots.length === 1) {
    phones = await phoneHtml(s.shots[0], theme, P.h, P.cx, P.cy, 0, 2, theme)
  } else {
    const [t0, t1] = s.themes ?? [theme, theme]
    phones =
      (await phoneHtml(s.shots[0], t0, P.h2, P.cx - P.gap2 / 2, P.cy + P.h2 * 0.015, -4, 1, theme)) +
      (await phoneHtml(s.shots[1], t1, P.h2, P.cx + P.gap2 / 2, P.cy - P.h2 * 0.015, 4, 2, theme))
  }
  const T = L.text
  const ty = L.type
  const scale = ty.head / 80
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${L.w}px;height:${L.h}px;overflow:hidden}
body{position:relative;background:url(${bgUri}) 0 0/${L.w}px ${L.h}px no-repeat;color:${c.ink};-webkit-font-smoothing:antialiased}
.text{position:absolute;left:${T.x}px;top:${T.y}px;width:${T.w}px;height:${T.h}px;display:flex;flex-direction:column;justify-content:center;text-align:${T.align};gap:${ty.head * 0.28}px}
.eyebrow{font:600 ${ty.eyebrow}px/1 Inter;letter-spacing:.16em;text-transform:uppercase;color:${c.red}}
h1{font:600 ${ty.head}px/1.08 Lora;letter-spacing:-.01em;text-wrap:balance;text-shadow:0 0 ${ty.head * 0.4}px ${c.glow}}
.sub{font:450 ${ty.sub}px/1.35 Inter;color:${c.ink2};text-wrap:balance;text-shadow:0 0 ${ty.sub * 0.5}px ${c.glow}}
.rule{display:block}
.text>*{flex-shrink:0}
.foot{position:absolute;top:${L.footer.y}px;font:550 ${ty.foot}px/1 Inter;letter-spacing:.04em;color:${c.ink3};white-space:nowrap;${L.footer.align === 'center' ? `left:${L.footer.x}px;transform:translateX(-50%)` : `left:${L.footer.x}px`}}
.phone{position:absolute;background:linear-gradient(160deg,#3a332d,#1d1916 45%,#28221e);}
.screen{position:relative;overflow:hidden;background:#000}
.screen img{display:block}
.cam{position:absolute;left:50%;border-radius:999px;background:#0d0b0a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
</style></head><body>
<div class="text"><div class="eyebrow">${s.eyebrow}</div><h1>${s.head}</h1>${stitchRule(c.red, scale, T.align)}${s.sub ? `<p class="sub">${s.sub}</p>` : ''}</div>
${phones}
<div class="foot">${URL_TEXT}</div>
</body></html>`
}

// ---------- render ----------
const browser = await launch()
try {
  const page = await browser.newPage()
  for (const size of Object.keys(LAYOUT) as Size[]) {
    const L = LAYOUT[size]
    const dir = join(OUT, 'stills', size)
    mkdirSync(dir, { recursive: true })
    await page.setViewport({ width: L.w, height: L.h, deviceScaleFactor: 1 })
    for (const s of SLIDES) {
      if (only.length && !only.includes(s.name)) continue
      for (const theme of s.variants) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
        await page.setContent(await slideHtml(s, size, theme), { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        const path = join(dir, `${s.name}-${theme}.png`)
        await page.screenshot({ path: path as `${string}.png` })
        console.log('wrote', path.replace(ROOT + '/', ''))
      }
    }
  }
} finally {
  await browser.close()
}
