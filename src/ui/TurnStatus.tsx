// Centre of the control row: turn text, coloured by player. The active label's thread does the rest.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Player } from '../../shared/game'

interface Props {
  player: Player | null
  text: string
}

export function TurnStatus({ player, text }: Props) {
  const reduce = useReducedMotion() ?? false
  const tone = player === 1 ? 'is-p1' : player === 2 ? 'is-p2' : 'is-none'

  return (
    <div className="status" role="status" aria-live="polite">
      <span className="status-text-wrap">
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
    </div>
  )
}
