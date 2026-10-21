// Render the animated title cards to MP4 (H.264 yuv420p 30fps, no audio, +faststart).
// Usage: bun scripts/marketing/titlecards.ts [--only <slug-substring>]
// Frames are exact: all CSS animations are paused and seeked to t = i/fps, then screenshotted.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, OUT } from './lib/browser'

const FPS = 30
const DUR = 3 // seconds, matches the CSS timeline in titlecard.html
const DIR = join(OUT, 'titlecards')
const HTML = join(import.meta.dir, 'titlecard.html')

export interface Card {
  slug: string
  text: string
  theme: 'light' | 'dark'
  size?: number // px at 1080 short edge
  accent?: boolean
}
export const CARDS: Card[] = [
  { slug: 'four-in-a-row', text: 'Four in a row.', theme: 'light', size: 170 },
  { slug: 'embroidered', text: 'Embroidered.', theme: 'light', size: 170 },
  { slug: 'play-anyone', text: 'Play the computer, a friend, or someone new.', theme: 'light', size: 100 },
  { slug: 'offline', text: 'Works offline. No app store.', theme: 'light', size: 112 },
  { slug: 'url', text: 'stitchfour.pasoma.ai', theme: 'light', size: 112 },
  { slug: 'url', text: 'stitchfour.pasoma.ai', theme: 'dark', size: 112 },
]
export const SIZES = [
  { name: '1080x1920', w: 1080, h: 1920, maxw: 0.8 },
  { name: '1920x1080', w: 1920, h: 1080, maxw: 0.68 },
]

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : ''
mkdirSync(DIR, { recursive: true })
const browser = await launch()
try {
  for (const c of CARDS) {
    if (only && !c.slug.includes(only)) continue
    for (const sz of SIZES) {
      const out = join(DIR, `${c.slug}-${c.theme}-${sz.name}.mp4`)
      const page = await browser.newPage()
      await page.setViewport({ width: sz.w, height: sz.h, deviceScaleFactor: 1 })
      const qs = new URLSearchParams({
        text: c.text, w: String(sz.w), h: String(sz.h), theme: c.theme,
        size: String(c.size ?? 124), maxw: String(sz.maxw), accent: c.accent === false ? '0' : '1',
      })
      await page.goto(`file://${HTML}?${qs}`)
      await page.waitForFunction('window.CARD_READY === true')
      await page.evaluate(() => { for (const a of document.getAnimations()) a.pause() })
      const ff = Bun.spawn(
        ['/usr/local/bin/ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
          '-an', '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', String(FPS),
          '-color_range', 'tv', '-movflags', '+faststart', out],
        { stdin: 'pipe', stderr: 'inherit' },
      )
      const n = FPS * DUR
      for (let i = 0; i < n; i++) {
        await page.evaluate((ms) => { for (const a of document.getAnimations()) a.currentTime = ms }, (i * 1000) / FPS)
        ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 96 }))
      }
      await ff.stdin.end()
      await ff.exited
      await page.close()
      console.log('wrote', out)
    }
  }
} finally {
  await browser.close()
}
