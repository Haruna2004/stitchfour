// Modal panel: bottom sheet on phones (drag down to dismiss), centred card on
// larger screens. Esc / backdrop close, focus trapped, page locked behind.
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react'
import { useMedia } from '../lib/hooks'
import { CloseIcon } from './icons'
import './Sheet.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Narrow dialogs (confirm, rename). */
  compact?: boolean
  hideTitle?: boolean
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

let locks = 0

export function Sheet({ title, onClose, children, compact, hideTitle }: Props) {
  const card = useMedia('(min-width: 680px) and (min-height: 560px)')
  const reduce = useReducedMotion() ?? false
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const drag = useDragControls()

  // lock scroll + remember focus
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    if (locks++ === 0) document.body.classList.add('is-locked')
    const el = panel.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    // focus after the enter animation starts so iOS doesn't jump
    const t = setTimeout(() => (first && first.tagName === 'INPUT' ? first : el)?.focus({ preventScroll: true }), 30)
    return () => {
      clearTimeout(t)
      if (--locks === 0) document.body.classList.remove('is-locked')
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 600) onClose()
  }

  const variants = card
    ? { hidden: { opacity: 0, scale: reduce ? 1 : 0.96, y: reduce ? 0 : 12 }, shown: { opacity: 1, scale: 1, y: 0 } }
    : { hidden: reduce ? { opacity: 0 } : { y: '105%' }, shown: reduce ? { opacity: 1 } : { y: 0 } }

  return (
    <div className={`sheet-layer${card ? ' is-card' : ''}`} onKeyDown={onKeyDown}>
      <motion.div
        className="sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        className={`sheet linen-panel${compact ? ' is-compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        variants={variants}
        initial="hidden"
        animate="shown"
        exit="hidden"
        transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }}
        drag={card ? false : 'y'}
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.7 }}
        onDragEnd={onDragEnd}
      >
        <div className="sheet-head" onPointerDown={(e) => !card && !(e.target as HTMLElement).closest('button') && drag.start(e)}>
          {!card && <span className="sheet-grip" aria-hidden />}
          <h2 id={titleId} className={hideTitle ? 'sr-only' : 'sheet-title'}>
            {title}
          </h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </motion.div>
    </div>
  )
}
