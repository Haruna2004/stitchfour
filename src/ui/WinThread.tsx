// Winning belt: a running stitch sewn around the winning pieces, stitch by stitch.
// Pure SVG strokes (no filters); depth faked with an offset shadow stroke. Animated with CSS.
import type { CSSProperties } from 'react'
import type { Pos } from '../../shared/game'
import { cellCenter, type Layout } from '../render/hoop'
import type { Palette } from '../render/palette'
import { css, lightNormal, mix } from '../render/thread'
import { winBelt } from '../render/winpath'

interface Props {
  layout: Layout
  line: Pos[]
  pal: Palette
  reduce: boolean
}

const START = 0.08
const DRAW = 1.05
/** Seconds until the belt is fully sewn. */
export const WIN_SEW = START + DRAW

const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

export function WinThread({ layout, line, pal, reduce }: Props) {
  const { stitches, width: w } = winBelt(line.map((p) => cellCenter(layout, p.col, p.row)), layout.cell)
  const base = css(pal.win)
  const edge = css(mix(pal.win, pal.shadeMix, 0.45), 0.7)
  const hi = css(mix(pal.win, pal.lightMix, 0.65), 0.85)
  const shadow = css(pal.shadowInk, Math.min(0.8, pal.shadowAlpha * 1.7))
  const hole = css(pal.shadowInk, 0.32)
  const n = stitches.length

  return (
    <svg
      className={`win-thread${reduce ? ' is-reduced' : ''}`}
      width={layout.width}
      height={layout.height}
      strokeLinecap="round"
      fill="none"
      aria-hidden
    >
      {stitches.map((s, i) => {
        const { nx, ny, len } = lightNormal(s.x1, s.y1, s.x2, s.y2)
        const d = (ox: number, oy: number, trim = 0) => {
          const tx = ((s.x2 - s.x1) / len) * trim
          const ty = ((s.y2 - s.y1) / len) * trim
          return `M${s.x1 + ox + tx} ${s.y1 + oy + ty}L${s.x2 + ox - tx} ${s.y2 + oy - ty}`
        }
        const t0 = START + DRAW * easeOut(i / n)
        const t1 = START + DRAW * easeOut((i + 1) / n)
        const style = { '--t': `${t0.toFixed(3)}s`, '--d': `${Math.max(0.05, (t1 - t0) * 1.15).toFixed(3)}s` } as CSSProperties
        return (
          <g key={i} style={style}>
            <circle className="wh" cx={s.x1} cy={s.y1} r={w * 0.4} fill={hole} />
            <circle className="wh is-end" cx={s.x2} cy={s.y2} r={w * 0.4} fill={hole} />
            <path className="ws" pathLength={1} d={d(w * 0.28, w * 0.42)} stroke={shadow} strokeWidth={w * 1.2} />
            <path className="ws" pathLength={1} d={d(0, 0)} stroke={base} strokeWidth={w} />
            <path className="ws" pathLength={1} d={d(-nx * w * 0.32, -ny * w * 0.32)} stroke={edge} strokeWidth={w * 0.3} />
            <path
              className="ws"
              pathLength={1}
              d={d(nx * w * 0.2, ny * w * 0.2, Math.min(len * 0.3, w * 0.45))}
              stroke={hi}
              strokeWidth={w * 0.3}
            />
          </g>
        )
      })}
    </svg>
  )
}
