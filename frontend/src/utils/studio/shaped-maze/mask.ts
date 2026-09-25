import { pointInRing, ringBounds, type Bounds, type Pt } from '../stained-glass/geometry'
import type { SubjectDrawing } from '../stained-glass/subject-kit'

/**
 * The shape, as the maze sees it: which cells of the grid are corridor.
 *
 * A silhouette is the union of the drawing's closed pieces (its open strokes
 * are thin detail and left out). It is laid over a grid of corridor-wide cells
 * and each cell is kept when the shape covers most of it. The outer wall of
 * the maze is then the edge of the kept cells, so the shape *is* the maze's
 * border — not a picture the maze was clipped against — and every corridor is
 * a whole cell, as wide as any other.
 *
 * The raw threshold is then tidied the way a person drawing the maze by hand
 * would: a lone cell poking out of the outline is shaved off (it reads as a
 * printing fault, not as a feature), a lone notch is filled, two cells that
 * touch only at a corner are joined or parted so no wall ever meets another
 * at a point, only the largest connected piece is kept, and a speck of a hole
 * smaller than a few cells is filled.
 *
 * What comes out is measured (`MaskQuality`), because a tidy mask is not
 * necessarily a recognisable one: the page refuses a mask that has drifted
 * from the drawing, lost a chunk of it, or turned into a plain rectangle.
 */

export interface ShapeMask {
  rows: number
  cols: number
  /** 1 where the cell is part of the maze. Row-major. */
  inside: Uint8Array
  /** 1 where an outside cell is open paper connected to the page — not an enclosed hole. */
  exterior: Uint8Array
  /** Cells in the maze. */
  count: number
}

export interface MaskQuality {
  /** Overlap of the kept cells with the true silhouette, 0..1 (intersection over union). */
  iou: number
  /** Share of the silhouette's area that landed in the kept piece, 0..1. */
  keptShare: number
  /** Share of the mask's bounding box that is maze, 0..1. Near 1 is a rectangle. */
  fill: number
  /** Share of cells with at most one neighbour in the maze — spurs of the outline. */
  tipShare: number
}

/** Coverage sampled on an N × N lattice inside each cell. */
const SAMPLES = 4
/** Share of a cell the shape must cover for it to become corridor. */
const KEEP_AT = 0.5
/** An empty cell boxed in on three sides is filled from this much coverage. */
const FILL_NOTCH_AT = 0.25
/** A corridor cell hanging on by one side is shaved below this much coverage. */
const SHAVE_TIP_BELOW = 0.75
/** Enclosed holes smaller than this many cells are filled. */
const MIN_HOLE_CELLS = 3

const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]

interface PieceIndex {
  ring: readonly Pt[]
  bounds: Bounds
}

/** Bounds of the drawing's closed pieces — what the silhouette is made of. */
export function silhouetteBounds(drawing: SubjectDrawing): Bounds {
  const list = drawing.pieces.map((p) => ringBounds(p.ring))
  return {
    minX: Math.min(...list.map((b) => b.minX)),
    minY: Math.min(...list.map((b) => b.minY)),
    maxX: Math.max(...list.map((b) => b.maxX)),
    maxY: Math.max(...list.map((b) => b.maxY)),
  }
}

function neighbours(inside: Uint8Array, rows: number, cols: number, r: number, c: number): number {
  let n = 0
  for (let d = 0; d < 4; d++) {
    const rr = r + DR[d]!
    const cc = c + DC[d]!
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && inside[rr * cols + cc]) n++
  }
  return n
}

/** 4-connected components of cells matching `want`; returns a label per cell (-1 for others) and sizes. */
function components(
  cells: Uint8Array,
  rows: number,
  cols: number,
  want: number,
): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(rows * cols).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let i = 0; i < rows * cols; i++) {
    if (cells[i] !== want || label[i] !== -1) continue
    const id = sizes.length
    let size = 0
    label[i] = id
    stack.push(i)
    while (stack.length > 0) {
      const at = stack.pop()!
      size++
      const r = Math.floor(at / cols)
      const c = at % cols
      for (let d = 0; d < 4; d++) {
        const rr = r + DR[d]!
        const cc = c + DC[d]!
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
        const j = rr * cols + cc
        if (cells[j] !== want || label[j] !== -1) continue
        label[j] = id
        stack.push(j)
      }
    }
    sizes.push(size)
  }
  return { label, sizes }
}

/** Outside cells reachable from the edge of the grid (the page), 4-connected. */
export function exteriorCells(inside: Uint8Array, rows: number, cols: number): Uint8Array {
  const exterior = new Uint8Array(rows * cols)
  const stack: number[] = []
  const seed = (r: number, c: number) => {
    const i = r * cols + c
    if (inside[i] || exterior[i]) return
    exterior[i] = 1
    stack.push(i)
  }
  for (let c = 0; c < cols; c++) {
    seed(0, c)
    seed(rows - 1, c)
  }
  for (let r = 0; r < rows; r++) {
    seed(r, 0)
    seed(r, cols - 1)
  }
  while (stack.length > 0) {
    const at = stack.pop()!
    const r = Math.floor(at / cols)
    const c = at % cols
    for (let d = 0; d < 4; d++) {
      const rr = r + DR[d]!
      const cc = c + DC[d]!
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) seed(rr, cc)
    }
  }
  return exterior
}

/**
 * Cells that touch only at a corner are a wall pinch: two walls meeting at a
 * point, which on paper looks like a gap a pencil could slip through. The
 * better-covered of the two empty cells is filled, which joins them properly.
 */
function fixPinches(inside: Uint8Array, coverage: Float32Array, rows: number, cols: number): boolean {
  let changed = false
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      if (inside[a] && inside[e] && !inside[b] && !inside[d]) {
        inside[coverage[b]! >= coverage[d]! ? b : d] = 1
        changed = true
      } else if (inside[b] && inside[d] && !inside[a] && !inside[e]) {
        inside[coverage[a]! >= coverage[e]! ? a : e] = 1
        changed = true
      }
    }
  }
  return changed
}

function keepLargest(inside: Uint8Array, rows: number, cols: number): void {
  const { label, sizes } = components(inside, rows, cols, 1)
  if (sizes.length <= 1) return
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i
  for (let i = 0; i < inside.length; i++) if (inside[i] && label[i] !== best) inside[i] = 0
}

function fillSpecks(inside: Uint8Array, rows: number, cols: number): void {
  const exterior = exteriorCells(inside, rows, cols)
  const holes = new Uint8Array(rows * cols)
  for (let i = 0; i < holes.length; i++) holes[i] = !inside[i] && !exterior[i] ? 1 : 0
  const { label, sizes } = components(holes, rows, cols, 1)
  for (let i = 0; i < inside.length; i++) {
    if (label[i]! >= 0 && sizes[label[i]!]! < MIN_HOLE_CELLS) inside[i] = 1
  }
}

/**
 * Lay the drawing's silhouette over a grid of `cell`-px corridors inside a
 * `width` × `height` px box, centred and as large as the box allows, then
 * tidy it (see the module note) and crop to the cells it uses.
 */
export function buildShapeMask(options: {
  drawing: SubjectDrawing
  width: number
  height: number
  cell: number
}): { mask: ShapeMask; quality: MaskQuality } | null {
  const { drawing, width, height, cell } = options
  const maxCols = Math.floor(width / cell)
  const maxRows = Math.floor(height / cell)
  if (maxCols < 3 || maxRows < 3 || drawing.pieces.length === 0) return null

  const b = silhouetteBounds(drawing)
  const dw = b.maxX - b.minX
  const dh = b.maxY - b.minY
  if (dw <= 0 || dh <= 0) return null
  // Design units per cell, so the silhouette fits the grid on its tighter side.
  const unit = Math.max(dw / maxCols, dh / maxRows)
  const offX = (maxCols - dw / unit) / 2
  const offY = (maxRows - dh / unit) / 2

  const pieces: PieceIndex[] = drawing.pieces.map((p) => ({ ring: p.ring, bounds: ringBounds(p.ring) }))
  const covered = (x: number, y: number) =>
    pieces.some(
      (p) =>
        x >= p.bounds.minX && x <= p.bounds.maxX && y >= p.bounds.minY && y <= p.bounds.maxY && pointInRing({ x, y }, p.ring),
    )

  const rows = maxRows
  const cols = maxCols
  const coverage = new Float32Array(rows * cols)
  let silhouette = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hit = 0
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const x = b.minX + (c + (i + 0.5) / SAMPLES - offX) * unit
          const y = b.minY + (r + (j + 0.5) / SAMPLES - offY) * unit
          if (covered(x, y)) hit++
        }
      }
      const share = hit / (SAMPLES * SAMPLES)
      coverage[r * cols + c] = share
      silhouette += share
    }
  }
  if (silhouette <= 0) return null

  const inside = new Uint8Array(rows * cols)
  for (let i = 0; i < inside.length; i++) inside[i] = coverage[i]! >= KEEP_AT ? 1 : 0

  // Notches first, then tips, reading the grid as it stood before either pass,
  // so a tidy on one side of the outline never decides the other.
  const before = inside.slice()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const n = neighbours(before, rows, cols, r, c)
      if (!before[i] && n >= 3 && coverage[i]! >= FILL_NOTCH_AT) inside[i] = 1
      if (before[i] && n <= 1 && coverage[i]! < SHAVE_TIP_BELOW) inside[i] = 0
    }
  }
  for (let pass = 0; pass < 4 && fixPinches(inside, coverage, rows, cols); pass++);
  keepLargest(inside, rows, cols)
  fillSpecks(inside, rows, cols)
  for (let pass = 0; pass < 4 && fixPinches(inside, coverage, rows, cols); pass++);
  keepLargest(inside, rows, cols)

  // Crop to the cells in use.
  let r0 = rows
  let r1 = -1
  let c0 = cols
  let c1 = -1
  let count = 0
  let kept = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!inside[r * cols + c]) continue
      count++
      kept += coverage[r * cols + c]!
      r0 = Math.min(r0, r)
      r1 = Math.max(r1, r)
      c0 = Math.min(c0, c)
      c1 = Math.max(c1, c)
    }
  }
  if (count === 0) return null

  const outRows = r1 - r0 + 1
  const outCols = c1 - c0 + 1
  const cropped = new Uint8Array(outRows * outCols)
  let tips = 0
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) cropped[r * outCols + c] = inside[(r + r0) * cols + (c + c0)]!
  }
  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      if (cropped[r * outCols + c] && neighbours(cropped, outRows, outCols, r, c) <= 1) tips++
    }
  }

  return {
    mask: {
      rows: outRows,
      cols: outCols,
      inside: cropped,
      exterior: exteriorCells(cropped, outRows, outCols),
      count,
    },
    quality: {
      iou: kept / (count + silhouette - kept),
      keptShare: kept / silhouette,
      fill: count / (outRows * outCols),
      tipShare: tips / count,
    },
  }
}

/** True when cells that touch only at a corner remain anywhere in the mask. */
export function hasPinch(mask: ShapeMask): boolean {
  const { rows, cols, inside } = mask
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = inside[r * cols + c]
      const b = inside[r * cols + c + 1]
      const d = inside[(r + 1) * cols + c]
      const e = inside[(r + 1) * cols + c + 1]
      if ((a && e && !b && !d) || (b && d && !a && !e)) return true
    }
  }
  return false
}

/** True when every maze cell is reachable from every other, 4-connected. */
export function isSinglePiece(mask: ShapeMask): boolean {
  return components(mask.inside, mask.rows, mask.cols, 1).sizes.length === 1
}

export const isInside = (mask: ShapeMask, r: number, c: number): boolean =>
  r >= 0 && r < mask.rows && c >= 0 && c < mask.cols && mask.inside[r * mask.cols + c] === 1

/** Outside the grid counts as exterior: the page runs on past the mask. */
export const isExterior = (mask: ShapeMask, r: number, c: number): boolean =>
  r < 0 || r >= mask.rows || c < 0 || c >= mask.cols || mask.exterior[r * mask.cols + c] === 1
