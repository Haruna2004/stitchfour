// Centre of the control row: small piece + turn text, with the online timer
// (a stitched ring that unwinds) or the computer's swirling thread around it.
import { useEffect, useId, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Player } from '../../shared/game'
import type { Theme } from '../lib/theme'
import { getPieceSprite } from '../render/pieces'

interface Props {
  player: Player | null
  text: string
  theme: Theme
  thinking?: boolean
  /** Local epoch ms when the turn runs out (online only). */
  deadline?: number | null
  total?: number
}

const PIECE = 26
const dpr = () => Math.min(3, window.devicePixelRatio || 1)

export function TurnStatus({ player, text, theme, thinking = false, deadline = null, total = 60_000 }: Props) {
  const reduce = useReducedMotion() ?? false
  const src = useMemo(() => (player ? getPieceSprite(player, theme, PIECE, dpr()) : null), [player, theme])
  return (
    <div className="status" role="status" aria-live="polite">
      <span className="status-piece">
        <AnimatePresence initial={false} mode="popLayout">
          {src ? (
            <motion.img
              key={`${player}-${theme}`}
              src={src}
              width={PIECE}
              height={PIECE}
              alt=""
              initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0, y: -6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            />
          ) : (
            <motion.span key="empty" className="status-hole" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {thinking && (
            <motion.span
              key="swirl"
              className="status-overlay"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.25 }}
            >
              <ThreadSwirl />
            </motion.span>
          )}
        </AnimatePresence>
        {deadline !== null && (
          <span className="status-overlay">
            <TimerRing deadline={deadline} total={total} />
          </span>
        )}
      </span>
      <span className="status-text-wrap">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={text}
            className="status-text"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}

const BOX = 44
const R = 18.5
const C = 2 * Math.PI * R

/** Stitched thread that unwinds as the turn clock runs down. Updated per frame without re-rendering. */
function TimerRing({ deadline, total }: { deadline: number; total: number }) {
  const id = useId()
  const maskRef = useRef<SVGCircleElement>(null)
  const rootRef = useRef<SVGSVGElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    let lastSec = -1
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      const f = Math.min(1, left / total)
      maskRef.current?.setAttribute('stroke-dasharray', `${(f * C).toFixed(2)} ${C.toFixed(2)}`)
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
  }, [deadline, total])

  return (
    <>
      <svg ref={rootRef} className="timer-ring" width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden>
        <defs>
          <mask id={`${id}m`}>
            <circle
              ref={maskRef}
              cx={BOX / 2}
              cy={BOX / 2}
              r={R}
              fill="none"
              stroke="#fff"
              strokeWidth="6"
              transform={`rotate(-90 ${BOX / 2} ${BOX / 2})`}
            />
          </mask>
        </defs>
        {/* needle holes left behind */}
        <circle className="timer-holes" cx={BOX / 2} cy={BOX / 2} r={R} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeDasharray={`0.01 ${C / 36}`} />
        <g mask={`url(#${id}m)`}>
          <circle className="timer-shadow" cx={BOX / 2 + 0.5} cy={BOX / 2 + 0.7} r={R} fill="none" strokeWidth="3.2" strokeDasharray={`${C / 36 - 1.4} 1.4`} />
          <circle className="timer-thread" cx={BOX / 2} cy={BOX / 2} r={R} fill="none" strokeWidth="3.2" strokeDasharray={`${C / 36 - 1.4} 1.4`} />
          <circle className="timer-twist" cx={BOX / 2} cy={BOX / 2} r={R} fill="none" strokeWidth="0.9" strokeDasharray={`1.2 ${C / 36 - 1.2}`} strokeDashoffset="-0.6" />
        </g>
      </svg>
      <span ref={label} className="sr-only" />
    </>
  )
}

// A wobbly three-lobed loop, like loose thread being wound around the piece.
const SWIRL_PATH = (() => {
  const pts: string[] = []
  const n = 96
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const r = 18.2 + 2.4 * Math.sin(3 * t + 0.6) + 0.8 * Math.sin(5 * t)
    pts.push(`${(BOX / 2 + r * Math.cos(t)).toFixed(2)} ${(BOX / 2 + r * Math.sin(t)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
})()

function ThreadSwirl() {
  return (
    <svg className="swirl" width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden>
      <g className="swirl-spin">
        <path className="swirl-shadow" d={SWIRL_PATH} pathLength={100} />
        <path className="swirl-thread" d={SWIRL_PATH} pathLength={100} />
        <path className="swirl-twist" d={SWIRL_PATH} pathLength={100} />
      </g>
    </svg>
  )
}
