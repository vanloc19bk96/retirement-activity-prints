import type { Cell } from './types'

/**
 * Complete polyomino catalogue for the shape pool.
 *
 * Shapes are enumerated exhaustively rather than drawn from a hand-written preset
 * list, so the pool is the full mathematical space for each size instead of ~20
 * footprints. Geometry is not copyrightable and nothing is bundled — every shape
 * is derived at runtime and cached.
 *
 * Legible one-sided shapes per size (after the print filter below):
 *   5 → 17,  6 → 50,  7 → 90,  8 → 451,  9 → ~1 000,  10 → ~3 600
 * Paired with an accent cell that keeps the figure asymmetric and chiral, that is
 * tens of thousands of distinct stimuli across the range.
 */

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
]

/** Below 5 cells the space is too small to avoid repeats; above 10 print cells get tiny. */
export const MIN_CELLS = 5
export const MAX_CELLS = 10

export function clampCellCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_CELLS
  return Math.min(MAX_CELLS, Math.max(MIN_CELLS, Math.round(n)))
}

/**
 * Enumeration packs each cell into one byte (row << 4 | col) so a whole polyomino
 * is a short string key. Coordinates stay in 0..15, which holds for every size here.
 */
type PackedPoly = number[]

const packCell = (r: number, c: number): number => (r << 4) | c
const unpackRow = (code: number): number => code >> 4
const unpackCol = (code: number): number => code & 15

function packedKey(codes: readonly number[]): string {
  return String.fromCharCode(...codes)
}

function toCells(codes: readonly number[]): Cell[] {
  return codes.map((code) => ({ r: unpackRow(code), c: unpackCol(code) }))
}

/** Translate so the bounding box starts at (0,0), then sort row-major. */
export function normalizeCells(cells: readonly Cell[]): Cell[] {
  let minR = Infinity
  let minC = Infinity
  for (const { r, c } of cells) {
    if (r < minR) minR = r
    if (c < minC) minC = c
  }
  return cells
    .map(({ r, c }) => ({ r: r - minR, c: c - minC }))
    .sort((a, b) => (a.r === b.r ? a.c - b.c : a.r - b.r))
}

export function cellsKey(cells: readonly Cell[]): string {
  return cells.map(({ r, c }) => `${r},${c}`).join('|')
}

/** Quarter turn clockwise on screen (row grows downward). */
export function rotateCells(cells: readonly Cell[]): Cell[] {
  return normalizeCells(cells.map(({ r, c }) => ({ r: c, c: -r })))
}

export function mirrorCells(cells: readonly Cell[]): Cell[] {
  return normalizeCells(cells.map(({ r, c }) => ({ r, c: -c })))
}

/** Smallest key over the four rotations — identifies a one-sided polyomino. */
function rotationCanonical(cells: readonly Cell[]): string {
  let current = normalizeCells(cells)
  let best = cellsKey(current)
  for (let i = 1; i < 4; i++) {
    current = rotateCells(current)
    const k = cellsKey(current)
    if (k < best) best = k
  }
  return best
}

export function extentOf(cells: readonly Cell[]): { rows: number; cols: number } {
  let maxR = 0
  let maxC = 0
  for (const { r, c } of cells) {
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  return { rows: maxR + 1, cols: maxC + 1 }
}

export function spanOf(cells: readonly Cell[]): number {
  const { rows, cols } = extentOf(cells)
  return Math.max(rows, cols)
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`
}

/**
 * True when an empty cell is boxed in on all four sides. The outline tracer draws
 * that hole as a white square, so a 10-cell ring reads as 11 blocks.
 */
function hasEnclosedHole(cells: readonly Cell[]): boolean {
  const { rows, cols } = extentOf(cells)
  const filled = new Set(cells.map(({ r, c }) => cellKey(r, c)))
  const seen = new Set<string>()
  const stack: Array<[number, number]> = [[-1, -1]]
  while (stack.length > 0) {
    const [r, c] = stack.pop()!
    const key = cellKey(r, c)
    if (seen.has(key)) continue
    if (r < -1 || c < -1 || r > rows || c > cols) continue
    if (filled.has(key)) continue
    seen.add(key)
    stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled.has(cellKey(r, c)) && !seen.has(cellKey(r, c))) return true
    }
  }
  return false
}

/**
 * Print legibility gate — the rule that removes the shapes users called unreadable.
 * Rejects single-file bars, long thin snakes and sprawling spidery arms: all three
 * force the fit-to-box scaler to shrink every cell to a speck.
 */
export function isLegibleShape(cells: readonly Cell[]): boolean {
  const { rows, cols } = extentOf(cells)
  const shortSide = Math.min(rows, cols)
  const longSide = Math.max(rows, cols)
  if (shortSide < 2) return false
  if (longSide / shortSide > 2) return false
  // Pick-the-matches on a 6" KDP trim has ~70px per figure. A 6-wide block
  // floors to 11px cells, under the 13px print floor.
  if (longSide > 5) return false
  if (cells.length / (rows * cols) < 0.5) return false
  if (hasEnclosedHole(cells)) return false
  return true
}

/** Membership lookup reused across polyominoes via a generation stamp (no clearing). */
const occupancy = new Uint16Array(256)
let occupancyStamp = 0

/** All fixed (translation-only) polyominoes of size `n + 1`, grown from size `n`. */
function growLevel(level: readonly PackedPoly[]): PackedPoly[] {
  const seen = new Set<string>()
  const out: PackedPoly[] = []

  for (const poly of level) {
    const stamp = ++occupancyStamp
    for (const code of poly) occupancy[code] = stamp

    for (const code of poly) {
      const r = unpackRow(code)
      const c = unpackCol(code)
      for (const [dr, dc] of NEIGHBORS) {
        const nr = r + dr
        const nc = c + dc
        // Negative coordinates are always empty; the shift below re-normalizes.
        if (nr >= 0 && nc >= 0 && occupancy[packCell(nr, nc)] === stamp) continue

        const shiftR = nr < 0 ? 1 : 0
        const shiftC = nc < 0 ? 1 : 0
        const grown: PackedPoly = new Array(poly.length + 1)
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i]!
          grown[i] = packCell(unpackRow(p) + shiftR, unpackCol(p) + shiftC)
        }
        grown[poly.length] = packCell(nr + shiftR, nc + shiftC)
        grown.sort((a, b) => a - b)

        const k = packedKey(grown)
        if (seen.has(k)) continue
        seen.add(k)
        out.push(grown)
      }
    }
  }

  return out
}

const shapeCache = new Map<number, readonly (readonly Cell[])[]>()
/** Last fully grown level, kept so a later, larger request resumes instead of restarting. */
let frontier: { size: number; polys: PackedPoly[] } = {
  size: 1,
  polys: [[packCell(0, 0)]],
}

function catalogueFor(n: number): readonly (readonly Cell[])[] {
  const cached = shapeCache.get(n)
  if (cached) return cached

  while (frontier.size < n) {
    frontier = { size: frontier.size + 1, polys: growLevel(frontier.polys) }
    if (frontier.size >= MIN_CELLS && !shapeCache.has(frontier.size)) {
      shapeCache.set(frontier.size, filterLevel(frontier.polys))
    }
  }

  return shapeCache.get(n) ?? []
}

function filterLevel(polys: readonly PackedPoly[]): readonly (readonly Cell[])[] {
  const seen = new Set<string>()
  const shapes: Cell[][] = []
  for (const poly of polys) {
    const cells = toCells(poly)
    if (!isLegibleShape(cells)) continue
    // One-sided: rotations collapse, mirrors stay distinct — mirrors are the puzzle.
    const canonical = rotationCanonical(cells)
    if (seen.has(canonical)) continue
    seen.add(canonical)
    shapes.push(cells)
  }
  return shapes
}

/**
 * Legible one-sided polyominoes of exactly `n` cells.
 * Built on first use for that size and cached; growing to 8 cells costs a few ms,
 * the full range to 10 costs roughly 250ms once per session.
 */
export function legibleShapes(n: number): readonly (readonly Cell[])[] {
  return catalogueFor(clampCellCount(n))
}

/** Prefer compact silhouettes so a dense pick-the-matches page still prints at MIN_CELL_PX. */
export function legibleShapesUpToSpan(
  n: number,
  maxSpan: number,
): readonly (readonly Cell[])[] {
  const all = legibleShapes(n)
  const fitting = all.filter((shape) => spanOf(shape) <= maxSpan)
  return fitting.length > 0 ? fitting : all
}

const spanCache = new Map<number, number>()

/**
 * Longest bounding-box side any catalogued shape of this size can take.
 * Layout uses it to reserve enough row height for the worst case a page can draw —
 * sizing for the average shape is what let single figures print unreadably small.
 */
export function maxShapeSpan(n: number): number {
  const size = clampCellCount(n)
  const cached = spanCache.get(size)
  if (cached != null) return cached

  let longest = 1
  for (const shape of legibleShapes(size)) {
    const { rows, cols } = extentOf(shape)
    longest = Math.max(longest, rows, cols)
  }
  spanCache.set(size, longest)
  return longest
}
