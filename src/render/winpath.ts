// Geometry for the winning belt: a running stitch around a capsule that hugs the winning pieces.
export interface Pt { x: number; y: number }
export interface WinStitch { x1: number; y1: number; x2: number; y2: number }

/** Point on a capsule loop (axis a→b, radius r) at arc length s, starting behind a. */
function capsule(a: Pt, b: Pt, r: number) {
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = L ? (b.x - a.x) / L : 1
  const uy = L ? (b.y - a.y) / L : 0
  // left normal (screen coords)
  const nx = uy
  const ny = -ux
  const arc = Math.PI * r
  const q = arc / 2 // quarter cap
  const total = 2 * L + 2 * arc
  const at = (s: number): Pt => {
    s = ((s % total) + total) % total
    // 1) quarter cap at a, from the back tip round to the left side
    if (s < q) return round(a, -1, s / r)
    s -= q
    // 2) left side a→b
    if (s < L) return { x: a.x + nx * r + ux * s, y: a.y + ny * r + uy * s }
    s -= L
    // 3) full cap at b, left → right
    if (s < arc) return round(b, 1, s / r)
    s -= arc
    // 4) right side b→a
    if (s < L) return { x: b.x - nx * r - ux * s, y: b.y - ny * r - uy * s }
    s -= L
    // 5) remaining quarter cap at a, back to the tip
    return round(a, -1, 1.5 * Math.PI + s / r)
  }
  // angle t measured from the cap's starting point
  function round(c: Pt, end: 1 | -1, t: number): Pt {
    // at a: start at the back tip (-u) and sweep toward +n; at b: start at +n and sweep toward +u, -n
    const sx = end === -1 ? -ux : nx
    const sy = end === -1 ? -uy : ny
    const ex = end === -1 ? nx : ux
    const ey = end === -1 ? ny : uy
    return { x: c.x + r * (sx * Math.cos(t) + ex * Math.sin(t)), y: c.y + r * (sy * Math.cos(t) + ey * Math.sin(t)) }
  }
  return { at, total }
}

export function winBelt(pts: Pt[], cell: number) {
  // endpoints = extreme projections along the line
  const a0 = pts[0]
  const b0 = pts[pts.length - 1]
  const dx = b0.x - a0.x
  const dy = b0.y - a0.y
  let a = a0
  let b = b0
  for (const p of pts) {
    const t = (p.x - a0.x) * dx + (p.y - a0.y) * dy
    if (t < (a.x - a0.x) * dx + (a.y - a0.y) * dy) a = p
    if (t > (b.x - a0.x) * dx + (b.y - a0.y) * dy) b = p
  }
  const r = cell * 0.53
  const { at, total } = capsule(a, b, r)
  // whole number of stitches so the loop closes evenly
  const period = cell * 0.36
  const count = Math.max(8, Math.round(total / period))
  const step = total / count
  const len = step * 0.7
  const stitches: WinStitch[] = []
  for (let i = 0; i < count; i++) {
    const s0 = i * step + (step - len) / 2
    const p = at(s0)
    const q = at(s0 + len)
    stitches.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y })
  }
  return { stitches, width: Math.max(2, cell * 0.105) }
}
