// Virtual time for frame-perfect capture. Injected into a page before any app code runs.
// While running, time flows normally. After __vt.freeze(), performance.now / Date / timers /
// requestAnimationFrame / Web Animations (CSS animations + transitions + Motion WAAPI) only move
// when __vt.step(ms) is called, so every screenshot is one exact frame, however slow the capture.
// Also logs every Web Audio sample start (url, rate, volume, time) to __vt.sounds for the mix.

export const VTIME_SHIM = String.raw`(() => {
  if (window.__vt) return
  const W = window
  const realNow = performance.now.bind(performance)
  const RealDate = Date
  const realST = W.setTimeout.bind(W)
  const realCT = W.clearTimeout.bind(W)
  const realRAF = W.requestAnimationFrame.bind(W)
  let frozen = false
  let vNow = 0
  const perfNow = () => (frozen ? vNow : realNow())
  const dateDelta = RealDate.now() - realNow()
  performance.now = perfNow
  const vDateNow = () => Math.floor(dateDelta + perfNow())
  function VDate(...a) {
    if (!(this instanceof VDate)) return new RealDate(vDateNow()).toString()
    return a.length ? new RealDate(...a) : new RealDate(vDateNow())
  }
  VDate.prototype = RealDate.prototype
  VDate.now = vDateNow
  VDate.parse = RealDate.parse
  VDate.UTC = RealDate.UTC
  W.Date = VDate

  // --- timers: one queue, pumped by real timers while running, by step() when frozen
  let seq = 1
  const timers = new Map()
  let pumpH = null
  const nextTimer = () => {
    let best = null
    for (const t of timers.values()) if (!best || t.at < best.at || (t.at === best.at && t.id < best.id)) best = t
    return best
  }
  const fire = (t) => {
    if (t.iv) t.at += t.iv
    else timers.delete(t.id)
    try { t.fn(...t.args) } catch (e) { console.error(e) }
  }
  const schedulePump = () => {
    if (frozen) return
    if (pumpH !== null) realCT(pumpH)
    const t = nextTimer()
    pumpH = t ? realST(pump, Math.max(0, t.at - realNow())) : null
  }
  function pump() {
    pumpH = null
    let n = 0
    for (let t = nextTimer(); t && t.at <= realNow() && n < 500; t = nextTimer(), n++) fire(t)
    schedulePump()
  }
  const add = (fn, d, args, rep) => {
    if (typeof fn !== 'function') return 0
    const id = seq++
    const delay = Math.max(0, Number(d) || 0)
    timers.set(id, { id, at: perfNow() + delay, fn, args, iv: rep ? Math.max(4, delay) : 0 })
    schedulePump()
    return id
  }
  W.setTimeout = (fn, d, ...args) => add(fn, d, args, false)
  W.setInterval = (fn, d, ...args) => add(fn, d, args, true)
  W.clearTimeout = W.clearInterval = (id) => { timers.delete(id) }

  // --- rAF
  let rafSeq = 1
  const rafs = new Map()
  let realPending = false
  const flushRaf = (ts) => {
    const list = [...rafs.values()]
    rafs.clear()
    for (const cb of list) try { cb(ts) } catch (e) { console.error(e) }
  }
  W.requestAnimationFrame = (cb) => {
    const id = rafSeq++
    rafs.set(id, cb)
    if (!frozen && !realPending) {
      realPending = true
      realRAF(() => { realPending = false; if (!frozen) flushRaf(perfNow()) })
    }
    return id
  }
  W.cancelAnimationFrame = (id) => { rafs.delete(id) }

  // --- Web Animations: pause each one and drive currentTime from virtual time
  const seen = new WeakMap()
  // script-made animations (Motion) can finish against the real timeline before we ever see them,
  // and finished ones drop out of getAnimations(), so catch them at birth
  const created = new Set()
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function (...a) {
    const anim = realAnimate.apply(this, a)
    if (frozen) {
      created.add(anim)
      anim.pause()
      anim.currentTime = 0
    }
    return anim
  }
  // Motion pins startTime to its own (virtual) clock; under freeze that would be seconds in the past
  const stDesc = Object.getOwnPropertyDescriptor(Animation.prototype, 'startTime')
  Object.defineProperty(Animation.prototype, 'startTime', {
    configurable: true,
    get() { return stDesc.get.call(this) },
    set(v) { if (frozen && created.has(this)) return; stDesc.set.call(this, v) },
  })
  const syncAnims = (initial = false) => {
    const all = new Set(document.getAnimations())
    for (const a of created) all.add(a)
    for (const a of all) {
      if (seen.get(a)?.done) { created.delete(a); continue }
      let s = seen.get(a)
      if (!s) {
        if (!created.has(a) && (a.playState === 'paused' || a.playState === 'idle')) continue // paused by the app itself
        if (initial) {
          // already running when we froze: carry on from where it is
          s = { t0: vNow, c0: Number(a.currentTime) || 0, rate: a.playbackRate || 1, done: a.playState === 'finished' }
        } else {
          // created after the freeze: its start time came from the real timeline, so restart it at 0
          s = { t0: vNow, c0: 0, rate: a.playbackRate || 1, done: false }
        }
        seen.set(a, s)
      }
      if (s.done) continue
      if (a.playState === 'idle') { s.done = true; continue }
      const t = s.c0 + (vNow - s.t0) * s.rate
      const end = a.effect && a.effect.getComputedTiming().endTime
      if (Number.isFinite(end) && t >= end) {
        s.done = true
        try { a.finish() } catch (e) {}
      } else {
        if (a.playState !== 'paused') a.pause()
        a.currentTime = t
      }
    }
  }

  // --- sound log
  const sounds = []
  const abUrl = new WeakMap()
  const bufUrl = new WeakMap()
  const gainOf = new WeakMap()
  const rf = W.fetch.bind(W)
  W.fetch = async (...a) => {
    const res = await rf(...a)
    const url = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || ''
    if (url.includes('/sounds/')) {
      const ab0 = res.arrayBuffer.bind(res)
      res.arrayBuffer = async () => { const ab = await ab0(); abUrl.set(ab, url); return ab }
    }
    return res
  }
  const BAC = W.BaseAudioContext || W.AudioContext
  if (BAC) {
    const dad = BAC.prototype.decodeAudioData
    BAC.prototype.decodeAudioData = function (ab, ...r) {
      const url = abUrl.get(ab)
      const p = dad.call(this, ab, ...r)
      p.then((b) => url && bufUrl.set(b, url), () => {})
      return p
    }
    const conn = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (dest, ...r) {
      if (this instanceof AudioBufferSourceNode && dest instanceof GainNode) gainOf.set(this, dest)
      return conn.call(this, dest, ...r)
    }
    const st = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...a) {
      const g = gainOf.get(this)
      sounds.push({ t: perfNow(), url: bufUrl.get(this.buffer) || '', rate: this.playbackRate.value, vol: g ? g.gain.value : 1 })
      return st.apply(this, a)
    }
  }

  // --- seeded Math.random so runs repeat
  let seed = 0x5eed
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const settle = () => new Promise((r) => realST(r, 0))
  W.__vt = {
    sounds,
    now: perfNow,
    get frozen() { return frozen },
    freeze() {
      if (frozen) return perfNow()
      vNow = realNow()
      frozen = true
      if (pumpH !== null) realCT(pumpH)
      pumpH = null
      syncAnims(true)
      return vNow
    },
    resume() {
      if (!frozen) return
      // keep virtual time continuous: shift all pending timers to real time
      const d = realNow() - vNow
      for (const t of timers.values()) t.at += d
      frozen = false
      for (const a of document.getAnimations()) { const s = seen.get(a); if (s && !s.done) { s.done = true; try { a.play() } catch (e) {} } }
      schedulePump()
      if (rafs.size) W.requestAnimationFrame(() => {})
    },
    async step(ms) {
      const target = vNow + ms
      let n = 0
      for (let t = nextTimer(); t && t.at <= target && n < 2000; t = nextTimer(), n++) {
        vNow = Math.max(vNow, t.at)
        fire(t)
      }
      vNow = target
      flushRaf(vNow)
      await settle()
      await settle()
      syncAnims()
      await settle()
      // make Chrome paint this state before the screenshot
      await new Promise((r) => realRAF(() => realRAF(() => r())))
      return vNow
    },
  }
})()`
