// Sewn-on fabric clothing label for each player.
import { useMemo, type ReactNode } from 'react'
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
  tone?: 'easy' | 'medium' | 'hard' | null
  emoji?: string
  offline?: boolean
  side: 'left' | 'right'
  onClick?: () => void
  ariaLabel: string
  bubble?: ReactNode
}

const SIZE = 22

export function NameLabel({ tag, name, player, theme, active, tone, emoji, offline, side, onClick, ariaLabel, bubble }: Props) {
  const reduce = useReducedMotion() ?? false
  const src = useMemo(() => getPieceSprite(player, theme, SIZE, Math.min(3, window.devicePixelRatio || 1)), [player, theme])
  return (
    <div className={`label-slot is-${side}`}>
      <motion.button
        type="button"
        className={`label${active ? ' is-active' : ''}${tone ? ` tone-${tone}` : ''}`}
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
          <span className="label-name">
            {emoji && <span className="label-emoji">{emoji}</span>}
            {name}
          </span>
        </span>
        <motion.svg
          className="label-underline"
          viewBox="0 0 100 4"
          preserveAspectRatio="none"
          aria-hidden
          initial={false}
          animate={{ clipPath: active ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)', opacity: active ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.45, ease: 'easeOut' }}
        >
          <path d="M1 2 H99" vectorEffect="non-scaling-stroke" />
        </motion.svg>
      </motion.button>
      <AnimatePresence>{bubble}</AnimatePresence>
    </div>
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
