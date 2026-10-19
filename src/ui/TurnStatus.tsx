// Centre of the control row: turn text coloured by player, with a stitched underline.
// Online it doubles as the turn timer (stitches unpick from the right); while the
// computer thinks it becomes a loose, gently waving thread.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Player } from '../../shared/game'

interface Props {
  player: Player | null
  text: string
  thinking?: boolean
  /** Local epoch ms when the turn runs out (online only). */
  deadline?: number | null
  total?: number
}

const PERIOD = 9 // px per stitch + gap
const H = 8

export function TurnStatus({ player, text, thinking = false, deadline = null, total = 60_000 }: Props) {
  const reduce = useReducedMotion() ?? false
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [w, setW] = useState(0)

  // underline follows the current text width (exiting text is popped out of flow)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tone = player === 1 ? 'is-p1' : player === 2 ? 'is-p2' : 'is-none'
  const kind = thinking ? 'think' : deadline !== null ? 'timer' : player ? 'stitch' : 'none'
  // whole stitches, centred under the text
  const lineW = Math.max(PERIOD * 3, Math.round(w / PERIOD) * PERIOD)

  return (
    <div className={`status ${tone}`} role="status" aria-live="polite">
      <span ref={wrapRef} className="status-text-wrap">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={text}
            className={`status-text ${tone}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="status-line" style={{ width: lineW }} aria-hidden>
        <AnimatePresence initial={false}>
          {kind !== 'none' && (
            <motion.span
              key={kind}
              className="status-line-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {kind === 'think' ? (
                <LooseThread />
              ) : kind === 'timer' ? (
                <TimerStitch deadline={deadline as number} total={total} width={lineW} />
              ) : (
                <Stitches width={lineW} />
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </div>
  )
}

const LONG = 320 // drawn wide, clipped to the line width

/** Running stitch with shadow + twist highlight. */
function Stitches({ width }: { width: number }) {
  const y = H / 2
  const dash = `${PERIOD - 3} 3`
  return (
    <svg className="ul-stitch" width={width} height={H} aria-hidden>
      <line className="ul-shadow" x1={1.8} y1={y + 0.8} x2={LONG} y2={y + 0.8} strokeDasharray={dash} />
      <line className="ul-thread" x1={1.3} y1={y} x2={LONG} y2={y} strokeDasharray={dash} />
      <line className="ul-twist" x1={2.2} y1={y - 0.45} x2={LONG} y2={y - 0.45} strokeDasharray={`1.4 ${PERIOD - 1.4}`} />
    </svg>
  )
}

/** Timer: stitches unpick one by one from the right, leaving needle holes. Per-frame, no re-render. */
function TimerStitch({ deadline, total, width }: { deadline: number; total: number; width: number }) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const clipRef = useRef<HTMLSpanElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const count = Math.max(1, Math.round(width / PERIOD))

  useEffect(() => {
    let raf = 0
    let lastSec = -1
    let lastN = -1
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      const n = Math.ceil(Math.min(1, left / total) * count)
      if (n !== lastN && clipRef.current) {
        lastN = n
        clipRef.current.style.width = `${n * PERIOD}px`
      }
      const sec = Math.ceil(left / 1000)
      if (sec !== lastSec) {
        lastSec = sec
        rootRef.current?.classList.toggle('is-low', left <= 10_000)
        if (label.current) label.current.textContent = `${sec} seconds left`
      }
      if (left > 0) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [deadline, total, count])

  return (
    <span ref={rootRef} className="ul-timer">
      <svg className="ul-holes" width={width} height={H} aria-hidden>
        <line x1={1.3} y1={H / 2} x2={LONG} y2={H / 2} strokeDasharray={`0 ${PERIOD - 3} 0 3`} />
      </svg>
      <span ref={clipRef} className="ul-clip">
        <Stitches width={width} />
      </span>
      <span ref={label} className="sr-only" />
    </span>
  )
}

// Soft sine thread, two wavelengths longer than needed so it can travel.
const WAVE = 28
const WAVE_PATH = (() => {
  const pts: string[] = []
  for (let x = -WAVE; x <= LONG + WAVE; x += 2) pts.push(`${x} ${(H / 2 + 1.5 * Math.sin((x / WAVE) * Math.PI * 2)).toFixed(2)}`)
  return `M${pts.join('L')}`
})()

/** Computer thinking: a loose thread that waves and flows along. */
function LooseThread() {
  return (
    <svg className="ul-loose" width="100%" height={H} aria-hidden>
      <g className="ul-wave">
        <path className="ul-shadow" d={WAVE_PATH} transform="translate(0.5 0.8)" />
        <path className="ul-thread" d={WAVE_PATH} />
        <path className="ul-twist" d={WAVE_PATH} transform="translate(0 -0.4)" />
      </g>
    </svg>
  )
}
