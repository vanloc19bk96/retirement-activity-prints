import type { StudioRng } from '../studio-rng'
import {
  emptyBitmap,
  fillDisk,
  fillRect,
  mirrorHorizontal,
  mirrorVertical,
  setCell,
  transpose,
} from './bitmap-draw'
import { filledCount } from './clues'
import { maxClueEntries } from './difficulty'
import type { Bitmap, NonogramStyle } from './types'

export type NonogramStyleId = Exclude<NonogramStyle, 'mixed'>

export interface NonogramFamily {
  id: string
  /** Styles this family belongs to. `mixed` draws from every family. */
  styles: readonly NonogramStyleId[]
  /**
   * Smallest grid this family is allowed on. Some constructions have plenty of
   * room to vary at 10×10 but collapse to a handful of grids at 5×5 — and a
   * family that keeps returning the same grid is worse than one that is absent,
   * because it puts the repeat straight onto the page.
   */
  minSize?: number
  /**
   * Draw one candidate grid. `density` is a target fill ratio hint in roughly
   * [0.25, 0.7]; families that own their fill ratio (checker, stripes) treat it
   * as a bias rather than a target.
   */
  draw(size: number, density: number, rng: StudioRng): Bitmap
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function noiseBitmap(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) bitmap[r]![c] = rng.chance(density)
  }
  return bitmap
}

/**
 * Cell size for scattered fill, scaled to the grid.
 *
 * Single-cell noise on a 20×20 grid needs eight or nine numbers per line, which
 * the print gate rejects outright — that is what silently emptied the symmetric
 * styles at large sizes. Coarser cells keep the same free-form character with
 * clue lists a printed page can hold.
 */
function tileScale(size: number, rng: StudioRng): number {
  if (size <= 7) return 1
  if (size <= 12) return rng.pick([1, 2, 2])
  if (size <= 16) return rng.pick([2, 2, 3])
  return rng.pick([2, 3, 3, 4])
}

/** Noise at grid-appropriate granularity, on an off-grid offset. */
function coarseNoise(size: number, density: number, rng: StudioRng): Bitmap {
  const k = tileScale(size, rng)
  if (k === 1) return noiseBitmap(size, density, rng)
  const offsetR = rng.int(0, k - 1)
  const offsetC = rng.int(0, k - 1)
  const bitmap = emptyBitmap(size)
  for (let r = -offsetR; r < size; r += k) {
    for (let c = -offsetC; c < size; c += k) {
      if (rng.chance(density)) fillRect(bitmap, r, c, k, k)
    }
  }
  return bitmap
}

/** Union random rectangles until the fill target is met. */
function drawBlocks(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const target = density * size * size
  const maxSide = Math.max(2, Math.round(size / 3))
  for (let guard = 0; guard < 80 && filledCount(bitmap) < target; guard++) {
    const h = rng.int(1, maxSide)
    const w = rng.int(1, maxSide)
    fillRect(bitmap, rng.int(0, size - h), rng.int(0, size - w), h, w)
  }
  return bitmap
}

/** Coarse tiles blown up to full cells — chunky, very readable clues. */
function drawMosaic(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const k = size >= 12 ? rng.pick([2, 3, 3]) : size >= 8 ? rng.pick([2, 2, 3]) : 2
  // Independent row/column offsets: a tiling always flush with the top-left
  // corner throws away most of what this family could draw.
  const offsetR = rng.int(0, k - 1)
  const offsetC = rng.int(0, k - 1)
  for (let r = -offsetR; r < size; r += k) {
    for (let c = -offsetC; c < size; c += k) {
      if (rng.chance(density)) fillRect(bitmap, r, c, k, k)
    }
  }
  return bitmap
}

/** Full-width bands with a few punched gaps; transposed half the time. */
function drawBands(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const onChance = clamp(density + 0.1, 0.3, 0.8)
  let pos = 0
  while (pos < size) {
    const on = rng.chance(onChance)
    const thickness = rng.int(1, on ? 3 : 2)
    if (on) {
      for (let r = pos; r < Math.min(size, pos + thickness); r++) {
        for (let c = 0; c < size; c++) setCell(bitmap, r, c, true)
        const gaps = rng.int(0, 2)
        for (let g = 0; g < gaps; g++) {
          const start = rng.int(0, size - 1)
          const len = rng.int(1, 2)
          for (let c = start; c < Math.min(size, start + len); c++) {
            setCell(bitmap, r, c, false)
          }
        }
      }
    }
    pos += thickness
  }
  return rng.chance(0.5) ? transpose(bitmap) : bitmap
}

/** Diagonal stripes, or chevrons when the fold is on. */
function drawDiagonalStripes(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  // Period grows with the grid: a short period on a wide grid means a dozen
  // stripes per line and a clue list nothing can print.
  const period = rng.int(3, clamp(Math.round(size / 2.5), 4, 8))
  const width = clamp(Math.round(period * density), 1, period - 1)
  const phase = rng.int(0, period - 1)
  const anti = rng.chance(0.5)
  const fold = rng.chance(0.35)
  const mid = (size - 1) / 2
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const axis = fold
        ? r + Math.round(Math.abs(c - mid))
        : anti
          ? r - c
          : r + c
      const t = (((axis + phase) % period) + period) % period
      bitmap[r]![c] = t < width
    }
  }

  // An unbroken stripe field has many solutions — shift the whole pattern one
  // step along the diagonal and every row and column clue is unchanged. Solid
  // and cleared bites pin it down and read as deliberate blocks in the weave.
  const bites = rng.int(1, 3)
  for (let i = 0; i < bites; i++) {
    const h = rng.int(2, Math.max(2, Math.round(size / 2)))
    const w = rng.int(2, Math.max(2, Math.round(size / 2)))
    fillRect(bitmap, rng.int(0, size - h), rng.int(0, size - w), h, w, rng.chance(0.5))
  }
  return bitmap
}

/**
 * Nested rectangular frames.
 *
 * Every side steps inward by its own gap rather than a shared one, so the
 * frames are nested without being concentric. Strictly centred rings looked
 * good but had almost no entropy — the same handful of grids came back over and
 * over, which is exactly the repeat a reader notices across a book.
 */
function drawRings(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  // A line across the middle crosses every frame twice, so it needs two numbers
  // per frame — cap the count against what the clue gutter can hold.
  const maxFrames = Math.max(1, Math.floor(maxClueEntries(size) / 2))
  const slack = Math.max(1, Math.round(size / 5))
  let top = rng.int(0, slack)
  let left = rng.int(0, slack)
  let bottom = size - 1 - rng.int(0, slack)
  let right = size - 1 - rng.int(0, slack)

  for (let frame = 0; frame < maxFrames; frame++) {
    const h = bottom - top + 1
    const w = right - left + 1
    if (h < 2 || w < 2) break
    const thickness = size >= 12 && rng.chance(0.4) ? 2 : 1
    if (h <= thickness * 2 || w <= thickness * 2) {
      fillRect(bitmap, top, left, h, w)
      break
    }
    fillRect(bitmap, top, left, thickness, w)
    fillRect(bitmap, bottom - thickness + 1, left, thickness, w)
    fillRect(bitmap, top, left, h, thickness)
    fillRect(bitmap, top, right - thickness + 1, h, thickness)

    // A gap in one side reads as a deliberate opening and is where most of this
    // family's variety comes from — closed frames are nearly interchangeable.
    if (rng.chance(0.55)) {
      const gap = rng.int(1, Math.max(1, Math.round(Math.min(h, w) / 3)))
      const alongTop = () => left + rng.int(1, Math.max(1, w - gap - 1))
      const alongSide = () => top + rng.int(1, Math.max(1, h - gap - 1))
      switch (rng.int(0, 3)) {
        case 0:
          fillRect(bitmap, top, alongTop(), thickness, gap, false)
          break
        case 1:
          fillRect(bitmap, bottom - thickness + 1, alongTop(), thickness, gap, false)
          break
        case 2:
          fillRect(bitmap, alongSide(), left, gap, thickness, false)
          break
        default:
          fillRect(bitmap, alongSide(), right - thickness + 1, gap, thickness, false)
      }
    }

    if (rng.chance(clamp(1 - density, 0.2, 0.5))) break
    top += thickness + rng.int(1, 2)
    bottom -= thickness + rng.int(1, 2)
    left += thickness + rng.int(1, 2)
    right -= thickness + rng.int(1, 2)
  }
  return bitmap
}

/** One to three disks, sometimes hollowed into rings. */
function drawRadial(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const count = rng.int(1, 3)
  for (let i = 0; i < count; i++) {
    const cr = rng.next() * size
    const cc = rng.next() * size
    const radius = size * (0.15 + rng.next() * 0.28) * (0.75 + density * 0.5)
    fillDisk(bitmap, cr, cc, radius)
    if (rng.chance(0.35)) {
      fillDisk(bitmap, cr, cc, radius * (0.3 + rng.next() * 0.35), false)
    }
  }
  return bitmap
}

/** Majority-rule smoothing turns noise into rounded organic masses. */
function drawBlobs(size: number, density: number, rng: StudioRng): Bitmap {
  let bitmap = noiseBitmap(size, clamp(density + 0.04, 0.3, 0.7), rng)
  const steps = rng.int(2, 3)
  for (let step = 0; step < steps; step++) {
    const next = emptyBitmap(size)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let neighbours = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            // Clamp at the border rather than treating outside as empty —
            // erosion at the edges would starve every 5×5 candidate.
            const rr = clamp(r + dr, 0, size - 1)
            const cc = clamp(c + dc, 0, size - 1)
            if (bitmap[rr]![cc]) neighbours++
          }
        }
        next[r]![c] = neighbours >= 5
      }
    }
    bitmap = next
  }
  return bitmap
}

/** A drunken walk, sometimes thickened — long connected trails. */
function drawPath(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const steps: readonly (readonly [number, number])[] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]
  const target = density * size * size
  const thick = size >= 10 && rng.chance(0.4)
  let r = rng.int(0, size - 1)
  let c = rng.int(0, size - 1)
  let dir = rng.pick(steps)
  let filled = 0
  for (let guard = 0; guard < size * size * 10 && filled < target; guard++) {
    if (!bitmap[r]![c]) {
      bitmap[r]![c] = true
      filled++
    }
    if (thick && rng.chance(0.5) && c + 1 < size && !bitmap[r]![c + 1]) {
      bitmap[r]![c + 1] = true
      filled++
    }
    if (rng.chance(0.3)) dir = rng.pick(steps)
    const nr = r + dir[0]
    const nc = c + dir[1]
    if (nr < 0 || nc < 0 || nr >= size || nc >= size) {
      dir = rng.pick(steps)
      continue
    }
    r = nr
    c = nc
  }
  return bitmap
}

/**
 * Checkerboard of rectangular tiles with whole tiles flipped out of phase.
 *
 * Tile height, tile width and both phase offsets vary independently — a fixed
 * square tiling produces only a few dozen distinct grids no matter the seed.
 */
function drawChecker(size: number, _density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const base = clamp(Math.round(size / 5), 2, 4)
  const kr = clamp(base + rng.int(-1, 1), 2, 5)
  const kc = clamp(base + rng.int(-1, 1), 2, 5)
  const offsetR = rng.int(0, kr - 1)
  const offsetC = rng.int(0, kc - 1)
  const invert = rng.chance(0.5)

  const tileOf = (r: number, c: number): [number, number] => [
    Math.floor((r + offsetR) / kr),
    Math.floor((c + offsetC) / kc),
  ]
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const [tr, tc] = tileOf(r, c)
      bitmap[r]![c] = ((tr + tc) % 2 === 0) !== invert
    }
  }

  // Flip whole tiles, not single cells: a punched hole splits a run in two and
  // adds a number to both its row and its column clue.
  const rows = Math.ceil((size + offsetR) / kr)
  const cols = Math.ceil((size + offsetC) / kc)
  const flips = rng.int(1, Math.max(1, Math.round(rows * cols * 0.15)))
  for (let i = 0; i < flips; i++) {
    const tr = rng.int(0, rows - 1)
    const tc = rng.int(0, cols - 1)
    fillRect(
      bitmap,
      tr * kr - offsetR,
      tc * kc - offsetC,
      kr,
      kc,
      ((tr + tc) % 2 === 0) === invert,
    )
  }
  return bitmap
}

/** One or two drifting horizontal runs — one block per row, easy to read. */
function drawStaircase(size: number, density: number, rng: StudioRng): Bitmap {
  const bitmap = emptyBitmap(size)
  const bands = size >= 10 && rng.chance(0.45) ? 2 : 1
  const wedge = rng.chance(0.4)
  for (let band = 0; band < bands; band++) {
    let start = rng.int(0, Math.max(0, size - 2))
    let len = clamp(
      Math.round(size * density * (bands === 2 ? 0.6 : 1)),
      1,
      Math.max(1, size - start),
    )
    for (let r = 0; r < size; r++) {
      fillRect(bitmap, r, start, 1, Math.min(len, size - start))
      start = clamp(start + rng.int(-1, 1), 0, size - 1)
      len = clamp(len + (wedge ? rng.int(0, 1) : rng.int(-1, 1)), 1, size - start)
    }
  }
  return bitmap
}

function symmetric(
  id: string,
  apply: (bitmap: Bitmap, size: number, rng: StudioRng) => Bitmap,
): NonogramFamily {
  return {
    id,
    styles: ['symmetric'],
    draw: (size, density, rng) => apply(coarseNoise(size, density, rng), size, rng),
  }
}

/**
 * Structural families. Each draws a different *kind* of grid, so consecutive
 * pages of a book differ in character and not just in which cells landed —
 * the thing a buyer notices when 60 puzzles all look like the same static.
 */
export const NONOGRAM_FAMILIES: readonly NonogramFamily[] = [
  { id: 'speckle', styles: ['organic'], draw: coarseNoise },
  symmetric('mirror-h', (bitmap) => {
    mirrorHorizontal(bitmap)
    return bitmap
  }),
  symmetric('mirror-v', (bitmap) => {
    mirrorVertical(bitmap)
    return bitmap
  }),
  symmetric('quad', (bitmap) => {
    mirrorHorizontal(bitmap)
    mirrorVertical(bitmap)
    return bitmap
  }),
  {
    id: 'rotational',
    styles: ['symmetric'],
    draw: (size, density, rng) => {
      const bitmap = coarseNoise(size, density, rng)
      const half = (size * size - 1) / 2
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (r * size + c <= half) continue
          bitmap[r]![c] = bitmap[size - 1 - r]![size - 1 - c]!
        }
      }
      return bitmap
    },
  },
  {
    id: 'diagonal-symmetry',
    styles: ['symmetric'],
    draw: (size, density, rng) => {
      const bitmap = coarseNoise(size, density, rng)
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < r; c++) bitmap[r]![c] = bitmap[c]![r]!
      }
      return bitmap
    },
  },
  { id: 'rings', styles: ['symmetric', 'geometric'], minSize: 8, draw: drawRings },
  { id: 'radial', styles: ['symmetric', 'organic'], draw: drawRadial },
  { id: 'blocks', styles: ['geometric', 'organic'], draw: drawBlocks },
  { id: 'mosaic', styles: ['geometric'], draw: drawMosaic },
  { id: 'bands', styles: ['geometric'], draw: drawBands },
  { id: 'diagonal-stripes', styles: ['geometric'], draw: drawDiagonalStripes },
  { id: 'checker', styles: ['geometric'], minSize: 8, draw: drawChecker },
  { id: 'staircase', styles: ['geometric', 'organic'], draw: drawStaircase },
  { id: 'blobs', styles: ['organic'], draw: drawBlobs },
  { id: 'path', styles: ['organic'], draw: drawPath },
] as const

export function familiesForStyle(
  style: NonogramStyle,
  size: number,
): readonly NonogramFamily[] {
  return NONOGRAM_FAMILIES.filter(
    (f) =>
      (f.minSize ?? 0) <= size && (style === 'mixed' || f.styles.includes(style)),
  )
}

/**
 * Last-resort construction: rows are left-anchored runs of n, n-1, … 1.
 * Line logic always cracks it (the length-1 column pins the corner, and each
 * row then falls in turn), so the generator can never fail to return a puzzle.
 */
export function descendingStaircase(size: number): Bitmap {
  const bitmap = emptyBitmap(size)
  for (let r = 0; r < size; r++) fillRect(bitmap, r, 0, 1, size - r)
  return bitmap
}
