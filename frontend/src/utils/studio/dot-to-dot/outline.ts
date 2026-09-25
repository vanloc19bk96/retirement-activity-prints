import {
  chainSegments,
  cutSegments,
  distToRing,
  pt,
  ringArea,
  ringSegments,
  polylineSegments,
  toRegion,
  inRegion,
  type Bounds,
  type Pt,
  type Seg,
} from '../stained-glass/geometry'
import { drawingBounds, type SubjectDrawing } from '../stained-glass/subject-kit'

/**
 * A drawing → the outline a reader traces, and the few details already drawn.
 *
 * The subject library draws each subject as a stack of closed shapes. Its
 * silhouette — the edge of everything stacked together — is the one line a
 * dot-to-dot hides: the picture only appears once the reader draws it. The
 * silhouette is found on a grid (robust where two shapes share an edge or
 * graze each other), then traced back to a smooth vector outline.
 *
 * Details are what stays pre-drawn: lines that float inside the picture
 * without touching its edge (a window, the coffee in a mug, the hole in a
 * mug's handle), and at most a small separate part (a bobber below a rod).
 * None of them runs along the silhouette, so the outline itself is only ever
 * revealed by the dots.
 */

export interface DtdOutline {
  /** The silhouette, design units, clockwise on a y-down page, no repeated last point. */
  contour: Pt[]
  /** Pre-drawn lines, design units. */
  details: Pt[][]
  bounds: Bounds
  /** Share of all the drawing's ink area inside the silhouette (1 = a single shape). */
  mainShare: number
}

/** Grid cells across the drawing's longer side. */
const GRID = 420
const PAD = 3

/** Fill every ring (even-odd per ring) into a grid over the drawing. */
function rasterise(drawing: SubjectDrawing, b: Bounds, s: number, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h)
  for (const piece of drawing.pieces) {
    const ring = piece.ring
    const xs: number[] = []
    const rb = { minY: Infinity, maxY: -Infinity }
    for (const p of ring) {
      rb.minY = Math.min(rb.minY, p.y)
      rb.maxY = Math.max(rb.maxY, p.y)
    }
    const j0 = Math.max(0, Math.floor((rb.minY - b.minY) * s + PAD - 0.5))
    const j1 = Math.min(h - 1, Math.ceil((rb.maxY - b.minY) * s + PAD + 0.5))
    for (let j = j0; j <= j1; j++) {
      const y = b.minY + (j + 0.5 - PAD) / s
      xs.length = 0
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const a = ring[i]!
        const c = ring[k]!
        if (a.y > y !== c.y > y) xs.push(a.x + ((y - a.y) * (c.x - a.x)) / (c.y - a.y))
      }
      xs.sort((p, q) => p - q)
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil((xs[n]! - b.minX) * s + PAD - 0.5))
        const i1 = Math.min(w - 1, Math.floor((xs[n + 1]! - b.minX) * s + PAD - 0.5))
        for (let i = i0; i <= i1; i++) mask[j * w + i] = 1
      }
    }
  }
  return mask
}

/** 4-connected components of set cells; returns labels (0 = empty) and each label's size. */
function components(mask: Uint8Array, w: number, h: number): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(w * h)
  const sizes = [0]
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue
    const id = sizes.length
    let size = 0
    label[start] = id
    stack.push(start)
    while (stack.length) {
      const c = stack.pop()!
      size++
      const x = c % w
      const y = (c - x) / w
      if (x > 0 && mask[c - 1] && !label[c - 1]) (label[c - 1] = id), stack.push(c - 1)
      if (x < w - 1 && mask[c + 1] && !label[c + 1]) (label[c + 1] = id), stack.push(c + 1)
      if (y > 0 && mask[c - w] && !label[c - w]) (label[c - w] = id), stack.push(c - w)
      if (y < h - 1 && mask[c + w] && !label[c + w]) (label[c + w] = id), stack.push(c + w)
    }
    sizes.push(size)
  }
  return { label, sizes }
}

/** Set every cell the outside cannot reach (4-connected) — the region's holes. */
function fillHoles(region: Uint8Array, w: number, h: number): void {
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const seed = (c: number) => {
    if (!region[c] && !outside[c]) (outside[c] = 1), stack.push(c)
  }
  for (let x = 0; x < w; x++) seed(x), seed((h - 1) * w + x)
  for (let y = 0; y < h; y++) seed(y * w), seed(y * w + w - 1)
  while (stack.length) {
    const c = stack.pop()!
    const x = c % w
    if (x > 0) seed(c - 1)
    if (x < w - 1) seed(c + 1)
    if (c >= w) seed(c - w)
    if (c < w * (h - 1)) seed(c + w)
  }
  for (let c = 0; c < region.length; c++) if (!outside[c]) region[c] = 1
}

/** Close diagonal pinches (two cells meeting at a corner only), so the edge never touches itself. */
function closePinches(region: Uint8Array, w: number, h: number): boolean {
  let changed = false
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = region[y * w + x]
      const b = region[y * w + x + 1]
      const c = region[(y + 1) * w + x]
      const d = region[(y + 1) * w + x + 1]
      if (a && d && !b && !c) (region[y * w + x + 1] = 1), (changed = true)
      else if (b && c && !a && !d) (region[y * w + x] = 1), (changed = true)
    }
  }
  return changed
}

/**
 * The region's boundary as one loop of cell-edge midpoints, clockwise on a
 * y-down page. The region is 4-connected, hole-free and pinch-free, so its
 * boundary is a single simple loop.
 */
function traceBoundary(region: Uint8Array, w: number, h: number): Pt[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1
  let start = -1
  for (let c = 0; c < region.length && start < 0; c++) if (region[c]) start = c
  if (start < 0) return []
  // Walk the corners of the grid with the region on the right: direction 0 = +x, 1 = +y, 2 = -x, 3 = -y.
  const sx = start % w
  const sy = (start - sx) / w
  let x = sx
  let y = sy
  let dir = 0
  const out: Pt[] = []
  const dx = [1, 0, -1, 0]
  const dy = [0, 1, 0, -1]
  // Cell to the right of the edge leaving (x, y) in direction d, and the one ahead-left.
  const rightCell = (px: number, py: number, d: number): [number, number] =>
    d === 0 ? [px, py] : d === 1 ? [px - 1, py] : d === 2 ? [px - 1, py - 1] : [px, py - 1]
  const leftCell = (px: number, py: number, d: number): [number, number] =>
    d === 0 ? [px, py - 1] : d === 1 ? [px, py] : d === 2 ? [px - 1, py] : [px - 1, py - 1]
  const limit = region.length * 4
  for (let guard = 0; guard < limit; guard++) {
    out.push(pt(x + dx[dir]! / 2, y + dy[dir]! / 2))
    x += dx[dir]!
    y += dy[dir]!
    if (x === sx && y === sy && dir === 3) break
    // Prefer turning left (hugging the region), then straight, then right.
    for (const turn of [3, 0, 1]) {
      const d = (dir + turn) % 4
      const [rx, ry] = rightCell(x, y, d)
      const [lx, ly] = leftCell(x, y, d)
      if (at(rx, ry) && !at(lx, ly)) {
        dir = d
        break
      }
    }
    if (x === sx && y === sy && dir === 0) break
  }
  return out
}

/** Relax a closed loop toward its neighbours, taking the grid's stair-steps out. */
function smoothLoop(loop: Pt[], passes: number): Pt[] {
  let cur = loop
  for (let p = 0; p < passes; p++) {
    const n = cur.length
    cur = cur.map((q, i) => {
      const a = cur[(i - 1 + n) % n]!
      const b = cur[(i + 1) % n]!
      return pt((a.x + 2 * q.x + b.x) / 4, (a.y + 2 * q.y + b.y) / 4)
    })
  }
  return cur
}

/** Douglas-Peucker on a closed loop: the indices it keeps, in order. */
export function simplifyLoopIndices(loop: readonly Pt[], tolerance: number): number[] {
  const n = loop.length
  if (n < 4) return loop.map((_, i) => i)
  // Anchor on two far-apart points so the loop splits into two open runs.
  let a = 0
  let far = 0
  let best = -1
  for (let i = 0; i < n; i++) {
    const d = (loop[i]!.x - loop[0]!.x) ** 2 + (loop[i]!.y - loop[0]!.y) ** 2
    if (d > best) (best = d), (far = i)
  }
  best = -1
  for (let i = 0; i < n; i++) {
    const d = (loop[i]!.x - loop[far]!.x) ** 2 + (loop[i]!.y - loop[far]!.y) ** 2
    if (d > best) (best = d), (a = i)
  }
  const keep = new Uint8Array(n)
  keep[a] = 1
  keep[far] = 1
  const run = (from: number, to: number) => {
    const stack: [number, number][] = [[from, to]]
    while (stack.length) {
      const [s, e] = stack.pop()!
      const len = (e - s + n) % n
      if (len < 2) continue
      const p = loop[s]!
      const q = loop[e]!
      const dxq = q.x - p.x
      const dyq = q.y - p.y
      const l2 = dxq * dxq + dyq * dyq
      let worst = -1
      let at = -1
      for (let k = 1; k < len; k++) {
        const i = (s + k) % n
        const r = loop[i]!
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((r.x - p.x) * dxq + (r.y - p.y) * dyq) / l2))
        const d = Math.hypot(r.x - (p.x + t * dxq), r.y - (p.y + t * dyq))
        if (d > worst) (worst = d), (at = i)
      }
      if (worst > tolerance) {
        keep[at] = 1
        stack.push([s, at], [at, e])
      }
    }
  }
  run(a, far)
  run(far, a)
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i)
  return out
}

/** Every line the drawing visibly prints: each shape's edge where no later shape covers it, and the uncovered strokes. */
function visibleLines(drawing: SubjectDrawing): Seg[] {
  const regions = drawing.pieces.map((p) => toRegion(p.ring))
  const out: Seg[] = []
  drawing.pieces.forEach((piece, i) => {
    const later = regions.slice(i + 1)
    out.push(...cutSegments(ringSegments(piece.ring), later, (mid) => !later.some((r) => inRegion(mid, r))))
  })
  for (const stroke of drawing.strokes) {
    const later = regions.slice(stroke.under)
    out.push(...cutSegments(polylineSegments(stroke.pts), later, (mid) => !later.some((r) => inRegion(mid, r))))
  }
  return out
}

const lineLength = (line: readonly Pt[]) => {
  let sum = 0
  for (let i = 1; i < line.length; i++) sum += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y)
  return sum
}

/**
 * The drawing's outline and pre-drawn details, or null when it has no single
 * main shape. Pure and deterministic: the same drawing always gives the same
 * outline.
 */
export function traceOutline(drawing: SubjectDrawing): DtdOutline | null {
  const b = drawingBounds(drawing)
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY)
  if (!(size > 0)) return null
  const s = GRID / size
  const w = Math.ceil((b.maxX - b.minX) * s) + PAD * 2
  const h = Math.ceil((b.maxY - b.minY) * s) + PAD * 2
  const mask = rasterise(drawing, b, s, w, h)
  const { label, sizes } = components(mask, w, h)
  let main = 0
  let total = 0
  for (let id = 1; id < sizes.length; id++) {
    total += sizes[id]!
    if (!main || sizes[id]! > sizes[main]!) main = id
  }
  if (!main) return null
  const region = new Uint8Array(w * h)
  for (let c = 0; c < region.length; c++) if (label[c] === main) region[c] = 1
  const solid = () => {
    fillHoles(region, w, h)
    for (let pass = 0; pass < 4 && closePinches(region, w, h); pass++) fillHoles(region, w, h)
  }
  solid()
  let inside = 0
  for (let c = 0; c < region.length; c++) if (region[c] && mask[c]) inside++

  const toDesign = (p: Pt) => pt(b.minX + (p.x - PAD) / s, b.minY + (p.y - PAD) / s)
  const traceLoop = (cells: Uint8Array) => {
    const loop = smoothLoop(traceBoundary(cells, w, h), 3).map(toDesign)
    if (loop.length < 8) return null
    const ring = simplifyLoopIndices(loop, 0.12 / s).map((i) => loop[i]!)
    return ringArea(ring) < 0 ? ring.reverse() : ring
  }
  const contour = traceLoop(region)
  if (!contour) return null

  // Holes: paper the silhouette encloses (inside a mug's handle, between a
  // chair's legs), each printed as one closed line. Specks and slivers where
  // two shapes nearly meet are not holes.
  const paper = new Uint8Array(w * h)
  for (let c = 0; c < paper.length; c++) if (region[c] && !mask[c]) paper[c] = 1
  const { label: holeLabel, sizes: holeSizes } = components(paper, w, h)
  const holes: Pt[][] = []
  for (let id = 1; id < holeSizes.length; id++) {
    if (holeSizes[id]! < (GRID * 0.05) ** 2) continue
    const cells = new Uint8Array(w * h)
    for (let c = 0; c < cells.length; c++) if (holeLabel[c] === id) cells[c] = 1
    fillHoles(cells, w, h)
    closePinches(cells, w, h)
    const ring = traceLoop(cells)
    if (!ring) continue
    const area = Math.abs(ringArea(ring))
    let perimeter = 0
    for (let i = 0; i < ring.length; i++) perimeter += Math.hypot(ring[i]!.x - ring[(i + 1) % ring.length]!.x, ring[i]!.y - ring[(i + 1) % ring.length]!.y)
    // Mean width (2 × area / perimeter) under ~4% of the drawing is a sliver.
    if ((2 * area) / perimeter < size * 0.04) continue
    holes.push([...ring, ring[0]!])
  }

  // Details: visible lines well clear of the silhouette and of every hole
  // (those are drawn whole, above), plus any small separate part, each long
  // enough to read as drawing.
  // A closed shape (a window, a wheel) reads as drawing at any size; an open
  // line only when it is long — a short one looks like a stray mark.
  const clearance = size * 0.03
  const clear = (p: Pt) => distToRing(p, contour) > clearance && holes.every((hole) => distToRing(p, hole) > clearance * 0.6)
  const closed = (line: readonly Pt[]) => line.length > 3 && Math.hypot(line[0]!.x - line[line.length - 1]!.x, line[0]!.y - line[line.length - 1]!.y) < size * 0.005
  const lines = chainSegments(visibleLines(drawing)).filter(
    (line) => lineLength(line) >= size * (closed(line) ? 0.06 : 0.15) && line.every(clear),
  )

  return {
    contour,
    details: [...holes, ...lines],
    bounds: b,
    mainShare: total > 0 ? inside / total : 0,
  }
}
