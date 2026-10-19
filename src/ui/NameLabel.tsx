// Sewn-on fabric clothing label for each player. The active one gets a loose wavy thread
// beneath it; online that thread is also the turn timer (it shortens as time runs out).
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Player } from '../../shared/game'
import type { Theme } from '../lib/theme'
import { getPieceSprite } from '../render/pieces'

interface Props {
  tag: string
  name: string
  player: Player
  theme: Theme
  active: boolean
  /** Livelier thread (the computer is thinking). */
  lively?: boolean
  /** Local epoch ms when this player's turn runs out (online). */
  deadline?: number | null
  total?: number
  offline?: boolean
  side: 'left' | 'right'
  onClick?: () => void
  ariaLabel: string
  bubble?: ReactNode
}

const SIZE = 22

export function NameLabel({ tag, name, player, theme, active, lively = false, deadline = null, total = 1, offline, side, onClick, ariaLabel, bubble }: Props) {
  const reduce = useReducedMotion() ?? false
  const src = useMemo(() => getPieceSprite(player, theme, SIZE, Math.min(3, window.devicePixelRatio || 1)), [player, theme])
  return (
    <div className={`label-slot is-${side}`}>
      <motion.button
        type="button"
        className={`label${active ? ' is-active' : ''}`}
        data-player={player}
        onClick={onClick}
        disabled={!onClick}
        aria-label={ariaLabel}
        animate={{ y: active && !reduce ? -3 : 0, rotate: reduce ? 0 : side === 'left' ? -0.8 : 0.8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        whileTap={reduce || !onClick ? undefined : { scale: 0.97 }}
      >
        <span className="label-piece">
          <img src={src} width={SIZE} height={SIZE} alt="" />
          {offline && <span className="label-offline" title="Disconnected" />}
        </span>
        <span className="label-text">
          <span className="label-tag">{tag}</span>
          <span className="label-name">{name}</span>
        </span>
        <AnimatePresence>
          {active && (
            <motion.span
              key="thread"
              className="lt"
              aria-hidden
              initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: 'inset(0 50% 0 50%)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: reduce ? 0.2 : 0.5, ease: 'easeOut' }}
            >
              <LooseThread lively={lively} deadline={deadline} total={total} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>{bubble}</AnimatePresence>
    </div>
  )
}

const H = 10
const LONG = 260 // drawn wide, centred and clipped to the label
const WAVE = 28 // wavelength = one travel cycle

// Soft sine thread, a wavelength longer each side so it can travel.
const wavePath = (amp: number) => {
  const pts: string[] = []
  for (let x = -WAVE; x <= LONG + WAVE; x += 2) pts.push(`${x} ${(H / 2 + amp * Math.sin((x / WAVE) * Math.PI * 2)).toFixed(2)}`)
  return `M${pts.join('L')}`
}
const CALM = wavePath(1.4)
const LIVELY = wavePath(2)

const LOW = 10_000
const LOW_W = 0.3
/** Thread length 1 → 0. The last 10s get the final 30%, so they stay visible and feel urgent. */
const threadLeft = (left: number, total: number) =>
  left <= LOW ? LOW_W * (left / LOW) : LOW_W + (1 - LOW_W) * Math.min(1, (left - LOW) / Math.max(1, total - LOW))

/** A loose thread drifting along a gentle wave. With a deadline it shortens toward the centre. */
function LooseThread({ lively, deadline, total }: { lively: boolean; deadline: number | null; total: number }) {
  const clip = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = clip.current
    if (!el) return
    if (deadline === null) {
      el.style.width = ''
      el.classList.remove('is-low')
      return
    }
    let raf = 0
    const tick = () => {
      const left = Math.max(0, deadline - Date.now())
      el.style.width = `${(threadLeft(left, total) * 100).toFixed(2)}%`
      el.classList.toggle('is-low', left <= LOW)
      if (left > 0) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [deadline, total])

  const d = lively ? LIVELY : CALM
  return (
    <span ref={clip} className={`lt-clip${lively ? ' is-lively' : ''}`}>
      <svg className="lt-svg" width={LONG} height={H}>
        <g className="lt-wave">
          <path className="lt-shadow" d={d} transform="translate(0.5 0.8)" />
          <path className="lt-thread" d={d} />
          <path className="lt-twist" d={d} transform="translate(0 -0.4)" />
        </g>
      </svg>
    </span>
  )
}

/** Little speech patch that pops above a label. */
export function ReactionBubble({ text }: { text: string }) {
  const reduce = useReducedMotion() ?? false
  const emoji = !/[a-z]/i.test(text)
  return (
    <motion.div
      className={`bubble${emoji ? ' is-emoji' : ''}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: -6 }}
      transition={{ type: 'spring', stiffness: 560, damping: 22 }}
      role="status"
    >
      {text}
    </motion.div>
  )
}
