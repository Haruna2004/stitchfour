// Geometry for the winning thread: a gently curved running stitch through the 4 centres.
export interface Pt { x: number; y: number }
export interface WinStitch { x1: number; y1: number; x2: number; y2: number }

export function winStitches(pts: Pt[], cell: number) {
  const a = pts[0]
  const b = pts[pts.length - 1]
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const ext = cell * 0.42
  const p0 = { x: a.x - ux * ext, y: a.y - uy * ext }
  const p2 = { x: b.x + ux * ext, y: b.y + uy * ext }
  // tiny natural sag, perpendicular to the line
  const bow = cell * 0.14
  const p1 = { x: (p0.x + p2.x) / 2 - uy * bow, y: (p0.y + p2.y) / 2 + ux * bow }
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  })
  // arc-length table
  const N = 120
  const table: { t: number; s: number }[] = [{ t: 0, s: 0 }]
  let prev = at(0)
  let total = 0
  for (let i = 1; i <= N; i++) {
    const p = at(i / N)
    total += Math.hypot(p.x - prev.x, p.y - prev.y)
    table.push({ t: i / N, s: total })
    prev = p
  }
  const tAt = (s: number) => {
    const i = table.findIndex((e) => e.s >= s)
    if (i <= 0) return i === 0 ? 0 : 1
    const e0 = table[i - 1]
    const e1 = table[i]
    return e0.t + ((s - e0.s) / (e1.s - e0.s || 1)) * (e1.t - e0.t)
  }
  const stitchLen = cell * 0.34
  const gapLen = cell * 0.16
  const count = Math.max(1, Math.floor((total + gapLen) / (stitchLen + gapLen)))
  const pad = (total - (count * stitchLen + (count - 1) * gapLen)) / 2
  const stitches: WinStitch[] = []
  for (let i = 0; i < count; i++) {
    const s0 = pad + i * (stitchLen + gapLen)
    const q0 = at(tAt(s0))
    const q1 = at(tAt(s0 + stitchLen))
    stitches.push({ x1: q0.x, y1: q0.y, x2: q1.x, y2: q1.y })
  }
  return { stitches, width: Math.max(2, cell * 0.11) }
}
