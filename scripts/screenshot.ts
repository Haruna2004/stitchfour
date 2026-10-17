// Dev-only: screenshot the running dev server with headless Chrome.
// bun scripts/screenshot.ts <outDir> <url> <w> <h> [steps]
// env THEME=dark|light emulates prefers-color-scheme.
// steps (comma list):
//   shot:name | wait:ms | col:n (tap a column) | hover:n
//   click:button-text | sel:css-selector (click) | type:text | key:Name
//   open:url (new page in a fresh context = separate localStorage) | page:n (switch active page, 0-based)
//   eval:js (run in page)
import puppeteer, { type Page } from 'puppeteer-core'
import { join } from 'node:path'

const [outDir, url, w = '360', h = '740', steps = 'wait:1500,shot:page'] = process.argv.slice(2)
const theme = process.env.THEME
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars'],
})
const mobile = Number(w) < 700 || Number(h) < 500

async function openPage(target: string, fresh: boolean): Promise<Page> {
  const ctx = fresh ? await browser.createBrowserContext() : browser.defaultBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile })
  if (theme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()))
  page.on('pageerror', (e) => console.log('pageerror:', e))
  await page.goto(target, { waitUntil: 'networkidle0' })
  return page
}

try {
  const pages = [await openPage(url, false)]
  let page = pages[0]
  const colPoint = async (col: number) =>
    page.$eval('.board-input', (el, col) => {
      const r = el.getBoundingClientRect()
      // inner area spans padding + 7 columns; approximate centre of column
      const pad = r.width * (0.24 / 7.48)
      const cw = (r.width - 2 * pad) / 7
      return { x: r.left + pad + cw * (col + 0.5), y: r.top + r.height * 0.5 }
    }, col)
  for (const step of steps.split(',')) {
    const i = step.indexOf(':')
    const k = i < 0 ? step : step.slice(0, i)
    const v = i < 0 ? '' : step.slice(i + 1)
    if (k === 'wait') await new Promise((r) => setTimeout(r, +v))
    else if (k === 'shot') await page.screenshot({ path: join(outDir, `${v}.png`) })
    else if (k === 'col') {
      const p = await colPoint(+v)
      if (mobile) await page.touchscreen.tap(p.x, p.y)
      else await page.mouse.click(p.x, p.y)
    } else if (k === 'hover') {
      const p = await colPoint(+v)
      await page.mouse.move(p.x, p.y, { steps: 4 })
    } else if (k === 'click') {
      await page.$$eval('button', (bs, t) => bs.find((b) => b.textContent?.trim() === t)?.click(), v)
    } else if (k === 'sel') {
      await page.$eval(v, (el) => (el as HTMLElement).click())
    } else if (k === 'type') {
      await page.keyboard.type(v)
    } else if (k === 'key') {
      await page.keyboard.press(v as Parameters<Page['keyboard']['press']>[0])
    } else if (k === 'open') {
      page = await openPage(v.startsWith('http') ? v : new URL(v, url).href, true)
      pages.push(page)
    } else if (k === 'page') {
      page = pages[+v]
      await page.bringToFront()
    } else if (k === 'eval') {
      console.log('eval:', await page.evaluate(v))
    }
  }
} finally {
  await browser.close()
}
