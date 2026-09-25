/**
 * Plane geometry for the stained-glass page: rings, segments, Voronoi cells.
 *
 * Everything the page draws is a set of straight segments. Curves are
 * flattened by the shapes that make them, so this module never has to know
 * about arcs, and every test below is exact for what is actually printed.
 *
 * Rings are closed polygons without a repeated last point. Inside tests use
 * the even-odd rule; the authoring rules in `subjects.ts` keep every ring
 * simple, so even-odd and non-zero agree.
 */

export interface Pt {
  x: number
  y: number
}

export type Ring = Pt[]

export interface Seg {
  a: Pt
  b: Pt
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const pt = (x: number, y: number): Pt => ({ x, y })

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

export function ringBounds(ring: readonly Pt[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function unionBounds(list: readonly Bounds[]): Bounds {
  return {
    minX: Math.min(...list.map((b) => b.minX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  }
}

/** Signed area; positive when the ring runs clockwise on a y-down page. */
export function ringArea(ring: readonly Pt[]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y)
  }
  return sum / 2
}

export function ringCentroid(ring: readonly Pt[]): Pt {
  const a = ringArea(ring)
  if (Math.abs(a) < 1e-9) {
    const n = ring.length || 1
    return pt(ring.reduce((s, p) => s + p.x, 0) / n, ring.reduce((s, p) => s + p.y, 0) / n)
  }
  let cx = 0
  let cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y
    cx += (ring[j]!.x + ring[i]!.x) * f
    cy += (ring[j]!.y + ring[i]!.y) * f
  }
  return pt(cx / (6 * a), cy / (6 * a))
}

export function pointInRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function distToRing(p: Pt, ring: readonly Pt[]): number {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, distToSegment(p, ring[j]!, ring[i]!))
  }
  return best
}

/** Ring edges as segments. */
export function ringSegments(ring: readonly Pt[]): Seg[] {
  return ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }))
}

/** Open polyline as segments. */
export function polylineSegments(line: readonly Pt[]): Seg[] {
  const out: Seg[] = []
  for (let i = 1; i < line.length; i++) out.push({ a: line[i - 1]!, b: line[i]! })
  return out
}

/** A ring with its bounds cached, for the many tests one page runs against it. */
export interface Region {
  ring: Ring
  bounds: Bounds
}

export const toRegion = (ring: Ring): Region => ({ ring, bounds: ringBounds(ring) })

export const inRegion = (p: Pt, r: Region) =>
  p.x >= r.bounds.minX && p.x <= r.bounds.maxX && p.y >= r.bounds.minY && p.y <= r.bounds.maxY && pointInRing(p, r.ring)

/** Parameter along ab where it properly crosses cd, or null. */
function crossParam(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const qx = c.x - a.x
  const qy = c.y - a.y
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  if (t <= 1e-9 || t >= 1 - 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return t
}

/**
 * Cut every segment wherever it crosses a cutter's edge, and keep the pieces
 * `keep` accepts (judged at each piece's midpoint).
 *
 * Between two consecutive crossings a piece lies wholly inside or wholly
 * outside every cutter, so a midpoint test decides the whole piece.
 */
export function cutSegments(
  segs: readonly Seg[],
  cutters: readonly Region[],
  keep: (mid: Pt, piece: Seg) => boolean,
): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    const sMinX = Math.min(s.a.x, s.b.x)
    const sMaxX = Math.max(s.a.x, s.b.x)
    const sMinY = Math.min(s.a.y, s.b.y)
    const sMaxY = Math.max(s.a.y, s.b.y)
    const ts: number[] = [0, 1]
    for (const cutter of cutters) {
      const cb = cutter.bounds
      if (sMaxX < cb.minX || sMinX > cb.maxX || sMaxY < cb.minY || sMinY > cb.maxY) continue
      const ring = cutter.ring
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const t = crossParam(s.a, s.b, ring[j]!, ring[i]!)
        if (t !== null) ts.push(t)
      }
    }
    ts.sort((p, q) => p - q)
    for (let k = 1; k < ts.length; k++) {
      const t0 = ts[k - 1]!
      const t1 = ts[k]!
      if (t1 - t0 < 1e-7) continue
      const a = lerp(s.a, s.b, t0)
      const b = lerp(s.a, s.b, t1)
      const piece = { a, b }
      if (keep(lerp(a, b, 0.5), piece)) out.push(piece)
    }
  }
  return out
}

export const lerp = (a: Pt, b: Pt, t: number): Pt => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

/* ------------------------------------------------------------------ *
 * Voronoi
 * ------------------------------------------------------------------ */

interface TaggedRing {
  pts: Pt[]
  /** tags[i] names what made the edge pts[i] → pts[i+1]: a neighbour seed, or -1 for the box. */
  tags: number[]
}

/** Keep the part of the ring where n·p <= c. Edges made by the cut take `tag`. */
function clipHalfPlane(ring: TaggedRing, nx: number, ny: number, c: number, tag: number): TaggedRing {
  const { pts, tags } = ring
  const out: Pt[] = []
  const outTags: number[] = []
  const side = (p: Pt) => nx * p.x + ny * p.y - c
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const q = pts[(i + 1) % pts.length]!
    const sp = side(p)
    const sq = side(q)
    if (sp <= 0) {
      out.push(p)
      if (sq <= 0) outTags.push(tags[i]!)
      else {
        const x = lerp(p, q, sp / (sp - sq))
        outTags.push(tags[i]!)
        out.push(x)
        outTags.push(tag)
      }
    } else if (sq <= 0) {
      const x = lerp(p, q, sp / (sp - sq))
      out.push(x)
      outTags.push(tags[i]!)
    }
  }
  return { pts: out, tags: outTags }
}

export interface VoronoiCell {
  ring: Ring
  /** Neighbour seed across each edge (ring[i] → ring[i+1]); -1 on the box. */
  neighbours: number[]
}

/**
 * Voronoi cells of `seeds`, each clipped to `box`, by half-plane clipping.
 *
 * Quadratic, which at a few hundred seeds is a few milliseconds, and exact
 * enough that neighbouring cells agree on the edge they share. Neighbours are
 * tried nearest first, and a cell stops as soon as no farther seed could cut
 * it (its farthest corner is closer than half the next seed's distance).
 */
export function voronoiCells(seeds: readonly Pt[], box: Bounds): VoronoiCell[] {
  return seeds.map((s, i) => {
    let ring: TaggedRing = {
      pts: [pt(box.minX, box.minY), pt(box.maxX, box.minY), pt(box.maxX, box.maxY), pt(box.minX, box.maxY)],
      tags: [-1, -1, -1, -1],
    }
    const order = seeds
      .map((o, j) => ({ j, d: (o.x - s.x) ** 2 + (o.y - s.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
    for (const { j, d } of order) {
      let reach = 0
      for (const p of ring.pts) reach = Math.max(reach, (p.x - s.x) ** 2 + (p.y - s.y) ** 2)
      if (d > 4 * reach) break
      const o = seeds[j]!
      if (d < 1e-12) continue
      const nx = o.x - s.x
      const ny = o.y - s.y
      const c = (nx * (o.x + s.x) + ny * (o.y + s.y)) / 2
      ring = clipHalfPlane(ring, nx, ny, c, j)
      if (ring.pts.length < 3) break
    }
    return { ring: ring.pts, neighbours: ring.tags }
  })
}

export interface VoronoiEdge extends Seg {
  /** The two seeds the edge separates, i < j. */
  i: number
  j: number
}

/** Every edge two seeds share, once. Box edges are left to whoever frames the cells. */
export function voronoiEdges(seeds: readonly Pt[], box: Bounds): VoronoiEdge[] {
  if (seeds.length < 2) return []
  const out: VoronoiEdge[] = []
  voronoiCells(seeds, box).forEach(({ ring, neighbours }, i) => {
    ring.forEach((a, k) => {
      const j = neighbours[k]!
      if (j > i) out.push({ a, b: ring[(k + 1) % ring.length]!, i, j })
    })
  })
  return out
}

/* ------------------------------------------------------------------ *
 * Polylines from segments
 * ------------------------------------------------------------------ */

const keyOf = (p: Pt) => `${Math.round(p.x * 20)},${Math.round(p.y * 20)}`

/**
 * Join segments that meet end to end into polylines, so a page prints a few
 * hundred strokes rather than a few thousand, and round joins (not caps) sit
 * at every bend.
 */
export function chainSegments(segs: readonly Seg[]): Pt[][] {
  const ends = new Map<string, number[]>()
  const used = new Array<boolean>(segs.length).fill(false)
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = keyOf(p)
      const list = ends.get(k)
      if (list) list.push(i)
      else ends.set(k, [i])
    }
  })
  const other = (i: number, p: Pt) => (keyOf(segs[i]!.a) === keyOf(p) ? segs[i]!.b : segs[i]!.a)
  const next = (p: Pt): number | null => {
    for (const j of ends.get(keyOf(p)) ?? []) if (!used[j]) return j
    return null
  }
  const lines: Pt[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = true
    const line = [segs[i]!.a, segs[i]!.b]
    for (let j = next(line[line.length - 1]!); j !== null; j = next(line[line.length - 1]!)) {
      used[j] = true
      line.push(other(j, line[line.length - 1]!))
    }
    for (let j = next(line[0]!); j !== null; j = next(line[0]!)) {
      used[j] = true
      line.unshift(other(j, line[0]!))
    }
    lines.push(line)
  }
  return lines
}

/* ------------------------------------------------------------------ *
 * Flattened curves
 * ------------------------------------------------------------------ */

/** Points on an ellipse, clockwise on a y-down page, starting at 3 o'clock. */
export function ellipseRing(cx: number, cy: number, rx: number, ry: number, steps = 48, rotateDeg = 0): Ring {
  const rot = (rotateDeg * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    const x = rx * Math.cos(a)
    const y = ry * Math.sin(a)
    return pt(cx + x * cos - y * sin, cy + x * sin + y * cos)
  })
}

/** Points along a circular arc; degrees clockwise from 3 o'clock, inclusive of both ends. */
export function arcPoints(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, steps?: number): Pt[] {
  const span = toDeg - fromDeg
  const n = steps ?? Math.max(2, Math.ceil(Math.abs(span) / 7.5))
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((fromDeg + (span * i) / n) * Math.PI) / 180
    return pt(cx + r * Math.cos(a), cy + r * Math.sin(a))
  })
}

/**
 * A closed Catmull-Rom curve through the points, flattened. Organic outlines
 * (leaves, hats, clouds) are authored as a handful of control points.
 */
export function smoothRing(points: readonly Pt[], stepsPerSpan = 8): Ring {
  const n = points.length
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!
    const p1 = points[i]!
    const p2 = points[(i + 1) % n]!
    const p3 = points[(i + 2) % n]!
    for (let s = 0; s < stepsPerSpan; s++) {
      const t = s / stepsPerSpan
      const t2 = t * t
      const t3 = t2 * t
      out.push(
        pt(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        ),
      )
    }
  }
  return out
}

/** An open Catmull-Rom curve through the points (ends clamped), flattened. */
export function smoothLine(points: readonly Pt[], stepsPerSpan = 8): Pt[] {
  const n = points.length
  if (n < 3) return [...points]
  const out: Pt[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(n - 1, i + 2)]!
    for (let s = 0; s < stepsPerSpan; s++) {
      const t = s / stepsPerSpan
      const t2 = t * t
      const t3 = t2 * t
      out.push(
        pt(
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        ),
      )
    }
  }
  out.push(points[n - 1]!)
  return out
}
