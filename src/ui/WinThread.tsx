// Winning thread: running stitch sewn through the 4 winning pieces, stitch by stitch.
// Pure SVG strokes (no filters); depth faked with an offset shadow stroke.
import { motion } from 'motion/react'
import type { Pos } from '../../shared/game'
import { cellCenter, type Layout } from '../render/hoop'
import type { Palette } from '../render/palette'
import { css, lightNormal, mix } from '../render/thread'
import { winStitches } from '../render/winpath'

interface Props {
  layout: Layout
  line: Pos[]
  pal: Palette
  reduce: boolean
}

export function WinThread({ layout, line, pal, reduce }: Props) {
  const { stitches, width: w } = winStitches(line.map((p) => cellCenter(layout, p.col, p.row)), layout.cell)
  const base = css(pal.win)
  const edge = css(mix(pal.win, pal.shadeMix, 0.5), 0.6)
  const hi = css(mix(pal.win, pal.lightMix, 0.6), 0.8)
  const shadow = css(pal.shadowInk, Math.min(0.75, pal.shadowAlpha * 1.5))
  const hole = css(pal.shadowInk, 0.3)
  const per = 0.075

  return (
    <svg className="win-thread" width={layout.width} height={layout.height} aria-hidden>
      {stitches.map((s, i) => {
        const { nx, ny, len } = lightNormal(s.x1, s.y1, s.x2, s.y2)
        const d = (ox: number, oy: number, trim = 0) => {
          const tx = ((s.x2 - s.x1) / len) * trim
          const ty = ((s.y2 - s.y1) / len) * trim
          return `M${s.x1 + ox + tx} ${s.y1 + oy + ty}L${s.x2 + ox - tx} ${s.y2 + oy - ty}`
        }
        const t = reduce
          ? { duration: 0.2, delay: 0 }
          : { duration: per * 1.1, delay: 0.1 + i * per, ease: 'linear' as const }
        const draw = reduce
          ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
          : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } }
        return (
          <g key={i} strokeLinecap="round" fill="none">
            <motion.circle
              cx={s.x1} cy={s.y1} r={w * 0.42} fill={hole} stroke="none"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...t, duration: 0.15 }}
            />
            <motion.circle
              cx={s.x2} cy={s.y2} r={w * 0.42} fill={hole} stroke="none"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...t, delay: t.delay + per * 0.9, duration: 0.15 }}
            />
            <motion.path d={d(w * 0.3, w * 0.4)} stroke={shadow} strokeWidth={w * 1.18} {...draw} transition={t} />
            <motion.path d={d(0, 0)} stroke={base} strokeWidth={w} {...draw} transition={t} />
            <motion.path d={d(-nx * w * 0.33, -ny * w * 0.33)} stroke={edge} strokeWidth={w * 0.3} {...draw} transition={t} />
            <motion.path
              d={d(nx * w * 0.2, ny * w * 0.2, Math.min(len * 0.3, w * 0.45))}
              stroke={hi} strokeWidth={w * 0.32} {...draw} transition={t}
            />
          </g>
        )
      })}
    </svg>
  )
}
