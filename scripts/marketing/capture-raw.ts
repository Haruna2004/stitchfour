// A. Clean, high-DPI captures of the real app (390x844 @3x), light + dark.
// Needs the dev server: bunx vite --port 5199
// Run: bun scripts/marketing/capture-raw.ts [shot-name ...]   (no names = all)
import type { Browser, Page } from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { click, launch, openApp, OUT, sleep, tapCol, type Theme } from './lib/browser'
import { POS } from './lib/positions'

const dir = join(OUT, 'raw')
mkdirSync(dir, { recursive: true })
const only = process.argv.slice(2)

const vt = (page: Page) => ({
  freeze: () => page.evaluate(() => (window as any).__vt.freeze()),
  step: (ms: number) => page.evaluate((ms) => (window as any).__vt.step(ms), ms),
})
const shot = (page: Page, name: string, theme: Theme) => page.screenshot({ path: join(dir, `${name}-${theme}.png`) as `${string}.png` })
const code = () => 'WARP' + [0, 0].map(() => '23456789'[Math.floor(Math.random() * 8)]).join('')

/** Step virtual time in frame-sized chunks so springs settle like they would live. */
async function run(page: Page, ms: number) {
  const v = vt(page)
  for (let t = 0; t < ms; t += 50) await v.step(50)
}

type Shot = (b: Browser, theme: Theme) => Promise<void>
const SHOTS: Record<string, Shot> = {
  async idle(b, theme) {
    const p = await openApp(b, { theme, query: `moves=${POS.idle}` })
    await sleep(1200)
    await shot(p, 'idle', theme)
  },
  async thinking(b, theme) {
    const p = await openApp(b, { theme, vt: true, query: `moves=${POS.idle}&botDelay=60000` })
    await vt(p).freeze()
    await tapCol(p, 5)
    await run(p, 1600)
    await shot(p, 'thinking', theme)
  },
  async 'win-horizontal'(b, theme) {
    const p = await openApp(b, { theme, vt: true, query: `moves=${POS.horiz}` })
    await vt(p).freeze()
    await tapCol(p, POS.horizWin)
    await run(p, 1500)
    await shot(p, 'win-horizontal-belt', theme)
    await run(p, 1200)
    await shot(p, 'win-horizontal', theme)
  },
  async 'win-diagonal'(b, theme) {
    const p = await openApp(b, { theme, vt: true, query: `moves=${POS.diag}` })
    await vt(p).freeze()
    await tapCol(p, POS.diagWin)
    await run(p, 1500)
    await shot(p, 'win-diagonal-belt', theme)
    await run(p, 1200)
    await shot(p, 'win-diagonal', theme)
  },
  async menu(b, theme) {
    const p = await openApp(b, { theme, query: `moves=${POS.idle}` })
    await click(p, 'css:.is-spool')
    await sleep(1200)
    await shot(p, 'menu', theme)
  },
  async online(b, theme) {
    // a friend room: A makes it, B joins with the link; A's turn thread shown part-used
    const c = code()
    const a = await openApp(b, { theme, vt: true, query: `room=${c}`, name: 'mossy-fern' })
    await sleep(800)
    const f = await openApp(b, { theme, query: `room=${c}`, name: 'quiet-wren' })
    await sleep(1500)
    for (const [who, col] of [[a, 3], [f, 3], [a, 4], [f, 2], [a, 2], [f, 4]] as const) {
      await tapCol(who, col)
      await sleep(900)
    }
    await sleep(600)
    await vt(a).freeze()
    await vt(a).step(46_000) // the turn clock runs on Date.now, which is virtual here
    await run(a, 300)
    await shot(a, 'online-timer', theme)
  },
  async matchmaking(b, theme) {
    const a = await openApp(b, { theme, vt: true })
    await click(a, 'css:.mode-chip')
    await sleep(700)
    await click(a, 'Online')
    await sleep(700)
    await shot(a, 'online-sheet', theme)
    await click(a, 'Find a player')
    await vt(a).freeze()
    await run(a, 3000)
    await shot(a, 'find-player', theme)
    // a second player looks too: the lobby pairs them
    const f = await openApp(b, { theme })
    await click(f, 'css:.mode-chip')
    await sleep(500)
    await click(f, 'Online')
    await sleep(500)
    await click(f, 'Find a player')
    for (let i = 0; i < 40; i++) {
      await run(a, 100)
      if (await a.evaluate(() => document.body.textContent?.includes('Found a player'))) break
    }
    await run(a, 400)
    await shot(a, 'found-player', theme)
    for (let i = 0; i < 60; i++) {
      await run(a, 100)
      if (await a.evaluate(() => document.body.textContent?.includes('Online · Matched') && !document.querySelector('.board-overlay'))) break
    }
    await run(a, 800)
    // a few moves so the board looks lived in; seat order decides who starts
    const me = await a.evaluate(() => document.body.textContent?.includes('Your turn'))
    const seq: [Page, number][] = me ? [[a, 3], [f, 2], [a, 3], [f, 4]] : [[f, 3], [a, 2], [f, 4], [a, 3]]
    for (const [who, col] of seq) {
      await tapCol(who, col)
      if (who === a) await run(a, 1200)
      else for (let i = 0; i < 12; i++) await run(a, 100)
    }
    await run(a, 1000)
    await shot(a, 'matched', theme)
  },
}

const browser = await launch()
try {
  for (const [name, fn] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(name)) continue
    for (const theme of ['light', 'dark'] as Theme[]) {
      console.log('shot', name, theme)
      await fn(browser, theme)
    }
    // fresh contexts per shot; close the pages we made
    for (const pg of await browser.pages()) if (pg.url() !== 'about:blank') await pg.close()
  }
} finally {
  await browser.close()
}
