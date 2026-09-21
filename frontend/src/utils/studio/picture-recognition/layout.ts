import type { Box } from '../studio-layout'

/** ≈32 mm at 72 dpi editor units — outline detail stays readable in print. */
export const MIN_CELL = 91
/**
 * Breathing room from safe edges (esp. bottom) + hairline stroke clearance.
 * Matches grid-copy FIELD_INSET so the outer bars never sit flush on the margin.
 */
export const STROKE_INSET = 16
/**
 * Fit inside the cell with pad for corner numbers + hairline stroke.
 * Contiguous stroke grids leave less free margin than the old gapped layout.
 */
export const IMAGE_FIT_RATIO = 0.82
/** Fallback when prefetch could not probe the PNG. */
export const DEFAULT_NATURAL_SIZE = 600

/** Study-page square packs (2×2 … 4×4). */
export const STUDY_SQUARE_COUNTS = [4, 9, 16] as const
/** Recall totals one step above each study size (3×3 / 4×4 / 5×5). */
export const RECALL_SQUARE_TOTALS = [9, 16, 25] as const

export interface ImageGrid {
  cell: number
  cols: number
  rows: number
  bounds: Box
  cellBox: (index: number) => Box
}

function isPerfectSquare(n: number): boolean {
  if (n < 1) return false
  const side = Math.round(Math.sqrt(n))
  return side * side === n
}

/** Snap a legacy/free count onto the nearest allowed study square. */
export function snapTargetCount(count: number): number {
  const n = Math.max(1, Math.round(count))
  let best: number = STUDY_SQUARE_COUNTS[0]
  let bestDist = Math.abs(n - best)
  for (const value of STUDY_SQUARE_COUNTS) {
    const dist = Math.abs(n - value)
    if (dist < bestDist) {
      best = value
      bestDist = dist
    }
  }
  return best
}

/**
 * Auto extras for page 2: next larger square total minus targets.
 * 4→5 (3×3), 9→7 (4×4), 16→9 (5×5). Not a user-facing control.
 */
export function autoDistractorCount(targetCount: number): number {
  const target = snapTargetCount(targetCount)
  for (const total of RECALL_SQUARE_TOTALS) {
    if (total > target) return total - target
  }
  return RECALL_SQUARE_TOTALS[RECALL_SQUARE_TOTALS.length - 1] - target
}

/**
 * Choose cols/rows that maximize square cell size inside `field`.
 * Only exact divisors of `count` — every cell gets an image (no empty tail cells).
 * Contiguous cells so grid-copy-style stroke bars sit on shared edges.
 * Perfect-square counts always pack as N×N.
 */
export function resolveBestGrid(
  field: Box,
  count: number,
): { cols: number; rows: number; cell: number } {
  const n = Math.max(1, count)
  if (isPerfectSquare(n)) {
    const side = Math.round(Math.sqrt(n))
    const cell = Math.floor(Math.min(field.width / side, field.height / side))
    return { cols: side, rows: side, cell: Math.max(1, cell) }
  }

  let best = { cols: 1, rows: n, cell: 0 }
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols !== 0) continue
    const rows = n / cols
    const cellW = field.width / cols
    const cellH = field.height / rows
    const cell = Math.floor(Math.min(cellW, cellH))
    if (cell > best.cell) {
      best = { cols, rows, cell }
      continue
    }
    if (cell < best.cell) continue
    if (Math.abs(cols - rows) < Math.abs(best.cols - best.rows)) {
      best = { cols, rows, cell }
    }
  }

  // Never inflate past what fits — overflow would leave the safe area.
  return { ...best, cell: Math.max(1, best.cell) }
}

/**
 * Largest perfect-square count ≤ requested that still fits at MIN_CELL.
 * Falls back to any MIN_CELL fit for legacy non-square remotes.
 */
export function maxFittingCount(field: Box, requested: number): number {
  for (let side = Math.floor(Math.sqrt(Math.max(1, requested))); side >= 2; side -= 1) {
    const count = side * side
    if (resolveBestGrid(field, count).cell >= MIN_CELL) return count
  }

  let count = Math.max(1, requested)
  while (count > 1) {
    if (resolveBestGrid(field, count).cell >= MIN_CELL) return count
    count -= 1
  }
  return 1
}

/** @deprecated Prefer resolveBestGrid — kept for call-site compatibility. */
export function resolveCellSize(field: Box, imageCount: number): number {
  return resolveBestGrid(field, imageCount).cell
}

/**
 * Pack `count` images into the largest contiguous square cells that fit in
 * `field`, then center the grid. Integer snap + re-center for crisp bars.
 */
export function layoutImageGrid(field: Box, count: number): ImageGrid {
  const n = Math.max(1, count)
  const { cols, rows, cell } = resolveBestGrid(field, n)

  const gridW = cell * cols
  const gridH = cell * rows
  const originX = Math.round(field.left + (field.width - gridW) / 2)
  const originY = Math.round(field.top + (field.height - gridH) / 2)

  return {
    cell,
    cols,
    rows,
    bounds: { left: originX, top: originY, width: gridW, height: gridH },
    cellBox: (index: number): Box => {
      const r = Math.floor(index / cols)
      const c = index % cols
      return {
        left: originX + c * cell,
        top: originY + r * cell,
        width: cell,
        height: cell,
      }
    },
  }
}
