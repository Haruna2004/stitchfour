// Shared puppeteer helpers for marketing captures: launch Chrome, open the app with a seeded
// profile, tap columns, and record frame-exact sequences with virtual time.
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VTIME_SHIM } from './vtime'

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const APP = process.env.APP_URL ?? 'http://localhost:5199'
export const ROOT = join(import.meta.dir, '../../..')
export const OUT = join(ROOT, 'marketing/out')
export const VIEW = { width: 390, height: 844 }

export type Theme = 'light' | 'dark'

export async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--force-color-profile=srgb'],
  })
}

export interface OpenOpts {
  theme: Theme
  dpr?: number
  /** query string for the app, e.g. "moves=3,3,4&mode=local" */
  query?: string
  name?: string
  level?: 'easy' | 'medium' | 'hard'
  /** install the virtual-time shim (needed for record()) */
  vt?: boolean
  fresh?: boolean
}

/** Open the app in a page with a fixed name/theme so captures repeat. */
export async function openApp(browser: Browser, o: OpenOpts): Promise<Page> {
  const ctx = o.fresh === false ? browser.defaultBrowserContext() : await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ ...VIEW, deviceScaleFactor: o.dpr ?? 3, isMobile: true, hasTouch: true })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: o.theme }])
  const seed = { name: o.name ?? 'mossy-fern', theme: o.theme, level: o.level ?? 'medium', sound: true, haptics: false, analytics: false }
  await page.evaluateOnNewDocument((seed) => {
    try {
      const k = 'stitchfour:settings'
      const cur = JSON.parse(localStorage.getItem(k) || '{}')
      localStorage.setItem(k, JSON.stringify({ ...cur, ...seed }))
    } catch {}
  }, seed)
  if (o.vt) await page.evaluateOnNewDocument(VTIME_SHIM)
  page.on('pageerror', (e) => console.log('pageerror:', e))
  const url = `${APP}/${o.query ? `?${o.query}` : ''}`
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  // warm the audio cache (the app loads samples on the first gesture) without touching any button
  await page.touchscreen.tap(195, 30)
  await sleep(600)
  return page
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Centre of a column on the board input, in CSS px. */
export async function colPoint(page: Page, col: number) {
  return page.$eval(
    '.board-input',
    (el, col) => {
      const r = el.getBoundingClientRect()
      const pad = r.width * (0.24 / 7.48)
      const cw = (r.width - 2 * pad) / 7
      return { x: r.left + pad + cw * (col + 0.5), y: r.top + r.height * 0.5 }
    },
    col,
  )
}
/** Drop in a column with synthetic pointer events (real touch input stalls under frozen time). */
export async function tapCol(page: Page, col: number) {
  const p = await colPoint(page, col)
  await page.$eval(
    '.board-input',
    (el, p) => {
      const o = { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, isPrimary: true }
      el.dispatchEvent(new PointerEvent('pointerdown', o))
      el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
      el.dispatchEvent(new PointerEvent('pointercancel', { ...o, buttons: 0 })) // hide the aim ghost, as on a phone
    },
    p,
  )
}
/** Click a button by its visible text (or a CSS selector starting with "css:"). */
export async function click(page: Page, what: string) {
  if (what.startsWith('css:')) return page.$eval(what.slice(4), (el) => (el as HTMLElement).click())
  const ok = await page.$$eval('button', (bs, t) => {
    const b =
      bs.find((b) => b.textContent?.trim() === t) ??
      bs.find((b) => b.querySelector('.choice-label')?.textContent?.trim() === t)
    b?.click()
    return !!b
  }, what)
  if (!ok) throw new Error(`no button "${what}"`)
}

/**
 * Frame-exact recorder. Call freeze() once the page is ready, then hold()/act() to build the
 * sequence. Frames are JPEGs in dir; sounds are logged relative to the first frame.
 */
export class Recorder {
  frame = 0
  t0 = 0
  constructor(public page: Page, public dir: string, public fps = 30) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  }
  async freeze() {
    this.t0 = await this.page.evaluate(() => (window as any).__vt.freeze())
  }
  async shot() {
    const p = join(this.dir, `f${String(this.frame++).padStart(5, '0')}.jpg`)
    await this.page.screenshot({ path: p as `${string}.jpg`, type: 'jpeg', quality: 93, optimizeForSpeed: true })
  }
  /** Record `sec` seconds of frames. */
  async hold(sec: number) {
    const n = Math.round(sec * this.fps)
    for (let i = 0; i < n; i++) {
      await this.page.evaluate((ms) => (window as any).__vt.step(ms), 1000 / this.fps)
      await this.shot()
    }
  }
  /** Seconds since the first frame. */
  get time() {
    return this.frame / this.fps
  }
  async finish(extra: Record<string, unknown> = {}) {
    const sounds = (await this.page.evaluate(() => (window as any).__vt.sounds)) as { t: number; url: string; rate: number; vol: number }[]
    const meta = {
      fps: this.fps,
      frames: this.frame,
      sounds: sounds.filter((s) => s.t >= this.t0).map((s) => ({ ...s, t: (s.t - this.t0) / 1000 })),
      ...extra,
    }
    writeFileSync(join(this.dir, 'meta.json'), JSON.stringify(meta, null, 2))
    return meta
  }
}
