import {
  arcPoints,
  ellipseRing,
  pt,
  ringBounds,
  smoothLine,
  smoothRing,
  type Bounds,
  type Pt,
  type Ring,
} from './geometry'

/**
 * How a stained-glass subject is drawn.
 *
 * A subject is a stack of closed shapes, bottom first, like pieces of glass
 * laid on a light table: a later shape covers whatever it overlaps, so a mug's
 * rim ellipse sits on its body and a wheel's hub on its tyre without either
 * shape needing a hole. What prints is every shape's visible outline — heavy
 * where the subject meets the background, lighter where two of its own pieces
 * meet — so the silhouette always reads first and the mosaic never swallows it.
 *
 * Authoring rules, and why:
 *
 * * **Closed shapes only.** A coloring region has to be bounded on every side.
 *   The only open lines are `stroke`s (a fishing line, a swing chain), and
 *   both their ends must land on a shape, so they divide space rather than
 *   dangle into it.
 * * **Chunky parts.** Every visible piece stays at least ~7 design units
 *   across at the drawing's ~100-unit scale. At the smallest page this prints
 *   around a sixth of an inch — wide enough for a colored-pencil tip. The tests
 *   render every version of every subject alone and refuse narrower pieces.
 * * **No text, logos or characters.** Generic objects only: the idea of an
 *   RV, not a maker's RV. Nothing here is traced from a photo, a product or
 *   another coloring book.
 * * **One unmistakable cue per subject**, drawn big: the rockers on a rocking
 *   chair, the steam over a mug, the handle and rose on a watering can.
 */

export interface SubjectPiece {
  ring: Ring
  /** Never cut into smaller mosaic cells (faces, flower centres, small parts). */
  whole?: boolean
}

export interface SubjectStroke {
  pts: Pt[]
  /** Pieces added after the stroke cover it. */
  under: number
}

export interface SubjectDrawing {
  pieces: SubjectPiece[]
  strokes: SubjectStroke[]
}

/** Collects a drawing's shapes in painting order. */
export class Sketch {
  readonly pieces: SubjectPiece[] = []
  readonly strokes: SubjectStroke[] = []

  add(ring: Ring, options: { whole?: boolean } = {}): this {
    this.pieces.push({ ring, ...(options.whole ? { whole: true } : {}) })
    return this
  }

  /** A small piece that is never subdivided. */
  part(ring: Ring): this {
    return this.add(ring, { whole: true })
  }

  stroke(points: readonly Pt[]): this {
    this.strokes.push({ pts: [...points], under: this.pieces.length })
    return this
  }

  done(): SubjectDrawing {
    return { pieces: this.pieces, strokes: this.strokes }
  }
}

export const sketch = (build: (s: Sketch) => void): SubjectDrawing => {
  const s = new Sketch()
  build(s)
  return s.done()
}

type XY = readonly [number, number]
const P = (p: XY) => pt(p[0], p[1])

export const poly = (...points: XY[]): Ring => points.map(P)

/** A rectangle; `r` rounds every corner, or `[top, bottom]` rounds the two pairs separately. */
export function rect(x: number, y: number, w: number, h: number, r: number | readonly [number, number] = 0): Ring {
  const [top, bottom] = typeof r === 'number' ? [r, r] : r
  const rt = Math.max(0, Math.min(top, w / 2, h / 2))
  const rb = Math.max(0, Math.min(bottom, w / 2, h / 2))
  const corner = (cx: number, cy: number, rr: number, from: number, px: number, py: number) =>
    rr === 0 ? [pt(px, py)] : arcPoints(cx, cy, rr, from, from + 90, 6)
  return [
    ...corner(x + w - rt, y + rt, rt, 270, x + w, y),
    ...corner(x + w - rb, y + h - rb, rb, 0, x + w, y + h),
    ...corner(x + rb, y + h - rb, rb, 90, x, y + h),
    ...corner(x + rt, y + rt, rt, 180, x, y),
  ]
}

export const ellipse = (cx: number, cy: number, rx: number, ry: number, rotateDeg = 0, steps = 48): Ring =>
  ellipseRing(cx, cy, rx, ry, steps, rotateDeg)

export const circle = (cx: number, cy: number, r: number, steps = 40): Ring => ellipseRing(cx, cy, r, r, steps)

/** A closed smooth curve through the control points. */
export const blob = (...points: XY[]): Ring => smoothRing(points.map(P))

/** A smooth open curve through the control points (for strokes and bands). */
export const curve = (...points: XY[]): Pt[] => smoothLine(points.map(P))

/** Straight polyline (for strokes and bands). */
export const path = (...points: XY[]): Pt[] => points.map(P)

/** Part of an annulus between two radii; degrees clockwise from 3 o'clock. */
export function arcBand(cx: number, cy: number, rOuter: number, rInner: number, fromDeg: number, toDeg: number): Ring {
  return [...arcPoints(cx, cy, rOuter, fromDeg, toDeg), ...arcPoints(cx, cy, rInner, toDeg, fromDeg)]
}

/** A pie slice. */
export function wedge(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): Ring {
  return [pt(cx, cy), ...arcPoints(cx, cy, r, fromDeg, toDeg)]
}

/**
 * A thick line: the polyline offset `width / 2` to each side, ends cut square
 * (or rounded with `round`). Handles, rockers, rods, legs, straps.
 */
export function band(input: readonly Pt[], width: number, round = false): Ring {
  // Points closer than a unit apart give a meaningless direction and fold
  // the outline into a spike; keep the first of each cluster and the last point.
  const line = input.filter((p, i) => i === 0 || i === input.length - 1 || Math.hypot(p.x - input[i - 1]!.x, p.y - input[i - 1]!.y) >= 1)
  if (line.length > 2 && Math.hypot(line[line.length - 1]!.x - line[line.length - 2]!.x, line[line.length - 1]!.y - line[line.length - 2]!.y) < 1) line.splice(line.length - 2, 1)
  const n = line.length
  const half = width / 2
  const normals = line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]!
    const b = line[Math.min(n - 1, i + 1)]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    return pt(-dy / len, dx / len)
  })
  // On the inside of a tight bend an offset point can land behind its
  // neighbour and fold the outline over itself; such points are dropped.
  const offset = (sign: number) => {
    const pts = line.map((p, i) => pt(p.x + sign * normals[i]!.x * half, p.y + sign * normals[i]!.y * half))
    const kept: Pt[] = [pts[0]!]
    for (let i = 1; i < pts.length; i++) {
      const prev = kept[kept.length - 1]!
      const along = (pts[i]!.x - prev.x) * (line[i]!.x - line[i - 1]!.x) + (pts[i]!.y - prev.y) * (line[i]!.y - line[i - 1]!.y)
      if (along > 0 || i === pts.length - 1) kept.push(pts[i]!)
    }
    return kept
  }
  const left = offset(1)
  const right = offset(-1)
  if (!round) return [...left, ...right.reverse()]
  const cap = (p: Pt, nrm: Pt, forward: boolean): Pt[] => {
    const base = (Math.atan2(nrm.y, nrm.x) * 180) / Math.PI
    // Sweep from the left offset round the end to the right offset.
    return forward ? arcPoints(p.x, p.y, half, base, base - 180, 8).slice(1, -1) : arcPoints(p.x, p.y, half, base + 180, base, 8).slice(1, -1)
  }
  return [...left, ...cap(line[n - 1]!, normals[n - 1]!, true), ...right.reverse(), ...cap(line[0]!, normals[0]!, false)]
}

/** A rod between two points, round ends. */
export const rod = (x1: number, y1: number, x2: number, y2: number, width: number): Ring =>
  band([pt(x1, y1), pt(x2, y2)], width, true)

/** Rotate a ring (or line) about a point, degrees clockwise on the page. */
export function rotate(points: readonly Pt[], deg: number, cx: number, cy: number): Pt[] {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return points.map((p) => pt(cx + (p.x - cx) * cos - (p.y - cy) * sin, cy + (p.x - cx) * sin + (p.y - cy) * cos))
}

export const move = (points: readonly Pt[], dx: number, dy: number): Pt[] => points.map((p) => pt(p.x + dx, p.y + dy))

/** Reflect a ring left to right about x = cx. */
export const flipX = (points: readonly Pt[], cx: number): Pt[] => points.map((p) => pt(2 * cx - p.x, p.y)).reverse()

/** Evenly spaced values from `start`, `count` of them, `step` apart. */
export const steps = (count: number, start: number, step: number): number[] =>
  Array.from({ length: count }, (_, i) => start + i * step)

/** Bounds of everything a drawing prints. */
export function drawingBounds(drawing: SubjectDrawing): Bounds {
  const all = [...drawing.pieces.map((p) => p.ring), ...drawing.strokes.map((s) => s.pts)]
  const list = all.map((ring) => ringBounds(ring))
  return {
    minX: Math.min(...list.map((b) => b.minX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  }
}

/** The drawing mirrored left to right. */
export function mirrorDrawing(drawing: SubjectDrawing): SubjectDrawing {
  const b = drawingBounds(drawing)
  const cx = (b.minX + b.maxX) / 2
  return {
    pieces: drawing.pieces.map((p) => ({ ...p, ring: flipX(p.ring, cx) })),
    strokes: drawing.strokes.map((s) => ({ ...s, pts: s.pts.map((q) => pt(2 * cx - q.x, q.y)) })),
  }
}

/** The drawing scaled by `k` and moved so its bounds' top-left lands on (x, y). */
export function placeDrawing(drawing: SubjectDrawing, k: number, x: number, y: number): SubjectDrawing {
  const b = drawingBounds(drawing)
  const map = (p: Pt) => pt(x + (p.x - b.minX) * k, y + (p.y - b.minY) * k)
  return {
    pieces: drawing.pieces.map((p) => ({ ...p, ring: p.ring.map(map) })),
    strokes: drawing.strokes.map((s) => ({ ...s, pts: s.pts.map(map) })),
  }
}
