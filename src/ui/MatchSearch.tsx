// "Find a player" search: two threads sewing round a little hoop while the lobby looks.
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Player } from '../../shared/game'
import type { Theme } from '../lib/theme'
import type { Matchmaking } from '../net/lobby'
import { getPieceSprite } from '../render/pieces'
import { Offline } from './OnlineSheet'
import './MatchSearch.css'

interface Props {
  match: Matchmaking
  theme: Theme
  /** Seconds before offering the computer. */
  fallbackAfter: number
  keepLooking: boolean
  onKeepLooking: () => void
  onCancel: () => void
  onComputer: () => void
  onRetry: () => void
}

export function MatchSearch({ match, theme, fallbackAfter, keepLooking, onKeepLooking, onCancel, onComputer, onRetry }: Props) {
  const reduce = useReducedMotion() ?? false
  const { status, waitedSec } = match

  if (status === 'offline') {
    return (
      <>
        <Offline />
        <div className="btn-row">
          <button type="button" className="btn" onClick={onCancel}>
            OK
          </button>
          <button type="button" className="btn is-primary" onClick={onRetry} data-autofocus>
            Try again
          </button>
        </div>
      </>
    )
  }

  if (status === 'error') {
    const timeout = match.error === 'timeout'
    return (
      <div className="match">
        <SewingHoop theme={theme} still />
        <div className="match-text">
          <h3 className="match-title">{timeout ? 'No one turned up' : "Couldn't find a game"}</h3>
          <p className="match-line">
            {timeout ? 'We looked for five minutes. Try again in a bit, or play the computer.' : 'Something snagged. Give it another go.'}
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onComputer}>
            Play Computer
          </button>
          <button type="button" className="btn is-primary" onClick={onRetry} data-autofocus>
            Try again
          </button>
        </div>
      </div>
    )
  }

  const found = status === 'matched'
  const others = Math.max(0, match.seeking - 1)
  const line = found
    ? 'Threading you in…'
    : status === 'connecting'
      ? 'Threading the needle…'
      : others === 0
        ? "You're first in line"
        : others === 1
          ? '1 other player looking'
          : `${others} others looking`
  const prompt = !found && !keepLooking && waitedSec >= fallbackAfter

  return (
    <div className="match">
      <SewingHoop theme={theme} still={reduce} done={found} />
      <div className="match-text" aria-live="polite">
        <h3 className="match-title">{found ? 'Found a player!' : 'Looking for a player…'}</h3>
        <p className="match-line">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={line}
              initial={{ opacity: 0, y: reduce ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -4 }}
              transition={{ duration: 0.18 }}
            >
              {line}
            </motion.span>
          </AnimatePresence>
        </p>
        {!found && (
          <p className="match-time" aria-label={`Waited ${waitedSec} seconds`}>
            {Math.floor(waitedSec / 60)}:{String(waitedSec % 60).padStart(2, '0')}
          </p>
        )}
      </div>

      <AnimatePresence initial={false}>
        {prompt && (
          <motion.div
            key="prompt"
            className="match-prompt"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="status"
          >
            <p className="match-prompt-text">No one's around right now. Play the computer instead?</p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={onKeepLooking}>
                Keep looking
              </button>
              <button type="button" className="btn is-primary" onClick={onComputer}>
                Play Computer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!prompt && !found && (
        <button type="button" className="btn is-wide" onClick={onCancel} data-autofocus>
          Cancel
        </button>
      )}
    </div>
  )
}

/** Board overlay in a matched room until the other player's socket arrives. */
export function MatchedWaiting({ onFindAnother }: { onFindAnother: () => void }) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 20_000)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      <p className="overlay-kicker">Matched</p>
      <h3 className="overlay-title is-soft">{late ? 'Still waiting…' : 'Waiting for your opponent…'}</h3>
      {late && <p className="overlay-hint">They may have wandered off. You can look for someone else.</p>}
      <button type="button" className={late ? 'btn is-primary' : 'link-btn'} onClick={onFindAnother}>
        Find someone else
      </button>
    </>
  )
}

const R_OUT = 44
const R_IN = 33

/** A small wooden hoop; a red and a gold running stitch sew round it in opposite directions. */
function SewingHoop({ theme, still = false, done = false }: { theme: Theme; still?: boolean; done?: boolean }) {
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const pieces = useMemo(() => ([1, 2] as Player[]).map((p) => getPieceSprite(p, theme, 26, dpr)), [theme, dpr])
  return (
    <div className={`hoop-mini${still ? ' is-still' : ''}${done ? ' is-done' : ''}`} aria-hidden>
      <span className="hm-cloth" />
      <svg viewBox="0 0 140 140" width="140" height="140">
        <defs>
          <mask id="sew-out" maskUnits="userSpaceOnUse">
            <circle className="sew-mask is-out" cx="70" cy="70" r={R_OUT} pathLength={100} />
          </mask>
          <mask id="sew-in" maskUnits="userSpaceOnUse">
            <circle className="sew-mask is-in" cx="70" cy="70" r={R_IN} pathLength={100} />
          </mask>
        </defs>
        {/* hoop + its little brass screw */}
        <circle className="hm-wood" cx="70" cy="70" r="63" />
        <circle className="hm-wood-hi" cx="70" cy="70" r="63" />
        <rect className="hm-lug" x="62" y="-3" width="7" height="12" rx="1.8" />
        <rect className="hm-lug" x="71" y="-3" width="7" height="12" rx="1.8" />
        <path className="hm-screw" d="M57 3 H82" />
        <circle className="hm-screw-head" cx="83.5" cy="3" r="3" />
        {/* pricked guide holes */}
        <circle className="hm-guide" cx="70" cy="70" r={R_OUT} />
        <circle className="hm-guide" cx="70" cy="70" r={R_IN} />
        {/* threads */}
        <g mask="url(#sew-out)">
          <circle className="hm-shadow" cx="70.6" cy="71" r={R_OUT} />
          <circle className="hm-thread is-red" cx="70" cy="70" r={R_OUT} />
        </g>
        <g mask="url(#sew-in)">
          <circle className="hm-shadow is-in" cx="70.6" cy="71" r={R_IN} />
          <circle className="hm-thread is-gold" cx="70" cy="70" r={R_IN} />
        </g>
        {/* loose thread ends following each stitch line */}
        <g className="hm-tip is-out">
          <path className="hm-tail is-red" d={`M70 ${70 - R_OUT} q -7 -3 -11 -9`} />
        </g>
        <g className="hm-tip is-in">
          <path className="hm-tail is-gold" d={`M70 ${70 - R_IN} q 7 -3 10 -8`} />
        </g>
      </svg>
      <span className="hm-pieces">
        <img src={pieces[0]} width={26} height={26} alt="" />
        <img src={pieces[1]} width={26} height={26} alt="" />
      </span>
    </div>
  )
}
