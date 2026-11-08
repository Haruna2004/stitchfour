// Embroidered Connect Four board: canvas hoop (drawn once) + DOM piece sprites + motion.
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type JSX, type KeyboardEvent, type PointerEvent,
} from 'react'
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react'
import { COLS, ROWS, canPlay, type GameState, type Player, type Pos } from '../../shared/game'
import { cellCenter, drawBoard, fitLayout, type Layout } from '../render/hoop'
import { PALETTE } from '../render/palette'
import { getPieceSprite } from '../render/pieces'
import { WIN_SEW, WinThread } from './WinThread'
import './Board.css'

export type Theme = 'light' | 'dark'
export interface BoardProps {
  state: GameState
  theme: Theme
  interactive: boolean
  onColumn: (col: number) => void
  onLand?: (col: number, row: number, player: Player) => void
}

interface PieceInfo {
  key: string
  index: number
  col: number
  row: number
  player: Player
}

function piecesOf(state: GameState): PieceInfo[] {
  const heights = Array<number>(COLS).fill(0)
  return state.moves.map((col, index) => {
    const row = heights[col]++
    const player: Player = index % 2 === 0 ? state.starter : state.starter === 1 ? 2 : 1
    return { key: `${index}:${col}`, index, col, row, player }
  })
}

const capDpr = () => Math.min(3, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))

export function Board({ state, theme, interactive, onColumn, onLand }: BoardProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [dpr, setDpr] = useState(capDpr)
  const reduce = useReducedMotion() ?? false
  const pal = PALETTE[theme]

  // size to parent
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setBox((b) => (Math.abs(b.w - width) < 0.5 && Math.abs(b.h - height) < 0.5 ? b : { w: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // DPR changes (zoom, moving between screens)
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    const on = () => setDpr(capDpr())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [dpr])

  const layout = useMemo(() => (box.w > 0 && box.h > 0 ? fitLayout(box.w, box.h) : null), [box])

  // draw hoop + rings once per size / theme / dpr
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !layout) return
    cv.width = Math.round(layout.width * dpr)
    cv.height = Math.round(layout.height * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, layout.width, layout.height)
    drawBoard(ctx, layout, pal)
  }, [layout, pal, dpr])

  const pieceCss = layout ? Math.round(layout.pieceSize) : 0
  const sprites = useMemo(
    () => (pieceCss ? { 1: getPieceSprite(1, theme, pieceCss, dpr), 2: getPieceSprite(2, theme, pieceCss, dpr) } : null),
    [pieceCss, theme, dpr],
  )

  const pieces = useMemo(() => piecesOf(state), [state])
  const n = state.moves.length

  // pieces that existed before this render shouldn't drop on first mount
  const seen = useRef(n)
  const dropFrom = seen.current
  useEffect(() => {
    seen.current = n
  }, [n])

  // number of moves whose drop has landed (gates win effects + ghost)
  const [settled, setSettled] = useState(n)
  if (settled > n) setSettled(n)
  const ready = settled >= n

  // board stays rigid: only the piece reacts on landing
  const landed = useCallback(
    (p: PieceInfo) => {
      setSettled((s) => Math.max(s, p.index + 1))
      onLand?.(p.col, p.row, p.player)
    },
    [onLand],
  )

  // aim / input
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ id: number; type: string } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const colAt = (clientX: number) => {
    if (!layout || !overlayRef.current) return 0
    const r = overlayRef.current.getBoundingClientRect()
    const x = clientX - r.left + layout.inner.x - layout.gridX
    return Math.max(0, Math.min(COLS - 1, Math.floor(x / layout.cell)))
  }
  const inBounds = (clientX: number, clientY: number) => {
    if (!layout || !overlayRef.current) return false
    const r = overlayRef.current.getBoundingClientRect()
    const m = layout.cell * 0.8
    return clientX > r.left - m && clientX < r.right + m && clientY > r.top - m * 2 && clientY < r.bottom + m
  }
  const tryDrop = (col: number) => {
    if (interactive && ready && canPlay(state, col)) onColumn(col)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id: e.pointerId, type: e.pointerType }
    if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture(e.pointerId)
    setHover(colAt(e.clientX))
  }
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || drag.current?.id === e.pointerId) setHover(colAt(e.clientX))
  }
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (inBounds(e.clientX, e.clientY)) tryDrop(colAt(e.clientX))
    if (e.pointerType !== 'mouse') setHover(null)
  }
  const onPointerCancel = () => {
    drag.current = null
    setHover(null)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const cur = hover ?? 3
    if (e.key === 'ArrowLeft') setHover(Math.max(0, cur - 1))
    else if (e.key === 'ArrowRight') setHover(Math.min(COLS - 1, cur + 1))
    else if (e.key === 'Enter' || e.key === ' ') tryDrop(cur)
    else return
    e.preventDefault()
  }

  const winKeys = useMemo(() => new Set((state.winLine ?? []).map((p) => `${p.col},${p.row}`)), [state.winLine])
  const showWin = state.winner !== 0 && !!state.winLine && ready
  const exitMode: ExitMode = n === 0 ? 'reset' : 'undo'
  const ghostOn = interactive && ready && hover !== null && canPlay(state, hover)

  return (
    <div ref={rootRef} className="board-root">
      {layout && sprites && (
        <div
          className="board-stage"
          style={{
            width: layout.width,
            height: layout.height,
            left: (box.w - layout.width) / 2,
            top: (box.h - layout.height) / 2,
          }}
        >
          <canvas ref={canvasRef} className="board-canvas" style={{ width: layout.width, height: layout.height }} />

          <AnimatePresence custom={exitMode}>
            {pieces.map((p) => (
              <Piece
                key={p.key}
                p={p}
                layout={layout}
                src={sprites[p.player]}
                drop={p.index >= dropFrom}
                dim={showWin && !winKeys.has(`${p.col},${p.row}`) ? pal.dimAlpha : 1}
                pulse={showWin && winKeys.has(`${p.col},${p.row}`)}
                reduce={reduce}
                onLanded={landed}
              />
            ))}
          </AnimatePresence>

          <Ghost layout={layout} col={hover} on={ghostOn} src={sprites[state.turn]} reduce={reduce} />

          {showWin && <WinThread layout={layout} line={state.winLine as Pos[]} pal={pal} reduce={reduce} />}

          <div
            ref={overlayRef}
            className={`board-input${interactive ? ' is-live' : ''}`}
            style={{
              left: layout.inner.x,
              top: layout.inner.y,
              width: layout.inner.w,
              height: layout.inner.h,
            }}
            tabIndex={0}
            role="grid"
            aria-label="Connect Four board. Use arrow keys and Enter to drop a piece."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setHover(null)}
          />
        </div>
      )}
    </div>
  )
}

type ExitMode = 'undo' | 'reset'

const exitVariants = {
  gone: (mode: ExitMode) =>
    mode === 'reset'
      ? { y: 40, opacity: 0, rotate: 8, transition: { duration: 0.42, ease: 'easeIn' as const, delay: Math.random() * 0.18 } }
      : { y: -36, opacity: 0, scale: 1.08, transition: { duration: 0.3, ease: 'easeOut' as const } },
}
const exitReduced = { gone: { opacity: 0, transition: { duration: 0.15 } } }

interface PieceProps {
  p: PieceInfo
  layout: Layout
  src: string
  drop: boolean
  dim: number // opacity (1 = not dimmed)
  pulse: boolean
  reduce: boolean
  onLanded: (p: PieceInfo) => void
}

function Piece({ p, layout, src, drop, dim, pulse, reduce, onLanded }: PieceProps) {
  const { x, y } = cellCenter(layout, p.col, p.row)
  const size = layout.pieceSize
  const fromY = layout.laneY - y
  const [startDrop] = useState(drop)
  const [scope, animate] = useAnimate<HTMLImageElement>()
  const landedRef = useRef(onLanded)
  landedRef.current = onLanded

  useEffect(() => {
    if (!startDrop) return
    let live = true
    const el = scope.current
    const rows = ROWS - p.row
    const run = async () => {
      if (reduce) {
        await animate(el, { y: 0, opacity: [0, 1] }, { duration: 0.12 })
        if (live) landedRef.current(p)
        return
      }
      await animate(el, { y: 0 }, { duration: 0.18 + 0.05 * rows, ease: [0.55, 0, 1, 0.45] })
      if (!live) return
      landedRef.current(p)
      // weighty landing: firm squash, one small hop, a tiny settle
      const b = size * 0.06
      await animate(
        el,
        {
          y: [0, 0, -b, 0, -b * 0.22, 0],
          scaleY: [1, 0.84, 1.03, 0.96, 1.005, 1],
          scaleX: [1, 1.12, 0.98, 1.03, 1, 1],
        },
        { duration: 0.42, times: [0, 0.1, 0.36, 0.62, 0.82, 1], ease: 'easeOut' },
      )
    }
    run()
    return () => {
      live = false
    }
    // run once per mount
  }, [])

  useEffect(() => {
    if (!pulse || !scope.current) return
    animate(
      scope.current,
      { scale: reduce ? 1 : [1, 1.07, 1] },
      { duration: 0.6, delay: reduce ? 0 : WIN_SEW + 0.1, ease: 'easeInOut' },
    )
  }, [pulse, reduce, animate, scope])

  return (
    <motion.div
      className="piece"
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
      animate={{ opacity: dim }}
      transition={{ duration: reduce ? 0.1 : 0.4 }}
      variants={reduce ? exitReduced : exitVariants}
      exit="gone"
    >
      <motion.img
        ref={scope}
        src={src}
        alt=""
        draggable={false}
        width={size}
        height={size}
        initial={startDrop ? { y: fromY } : false}
        style={{ originY: 1 }}
      />
    </motion.div>
  )
}

function Ghost({ layout, col, on, src, reduce }: { layout: Layout; col: number | null; on: boolean; src: string; reduce: boolean }) {
  const size = layout.pieceSize
  const lastCol = useRef(3)
  if (col !== null) lastCol.current = col
  const x = cellCenter(layout, lastCol.current, 0).x - size / 2
  return (
    <motion.img
      className="ghost"
      src={src}
      alt=""
      draggable={false}
      width={size}
      height={size}
      style={{ top: layout.laneY - size / 2, left: 0 }}
      initial={false}
      animate={{ x, opacity: on ? 0.72 : 0, scale: on ? 1 : 0.9 }}
      transition={
        reduce
          ? { duration: 0.1 }
          : { x: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }, opacity: { duration: 0.15 }, scale: { duration: 0.15 } }
      }
    />
  )
}
