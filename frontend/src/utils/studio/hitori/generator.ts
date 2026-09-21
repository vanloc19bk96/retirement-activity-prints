import type { StudioRng } from '../studio-rng'
import { generateLatinSquare } from '../futoshiki/latin'
import {
  ORTHO,
  isValidHitoriSolution,
  wouldShadeDisconnect,
} from './rules'
import { countHitoriSolutions, isForcedSolution } from './solver'
import type {
  HitoriDifficulty,
  HitoriPuzzle,
  HitoriSize,
  Shading,
} from './types'

export type { HitoriDifficulty, HitoriPuzzle, HitoriSize, Shading }
export {
  countHitoriSolutions,
  isForcedOnlySolvable,
  isForcedSolution,
} from './solver'
export {
  noWhiteDuplicates,
  noAdjacentShaded,
  whiteCellsConnected,
  isValidHitoriSolution,
} from './rules'

interface DifficultyParams {
  shadeRatioMin: number
  shadeRatioMax: number
  requireForcedOnly: boolean
}

/**
 * Density is the difficulty knob, and denser is *easier*: every shaded cell adds
 * an XYX foothold, so the forced-deduction chain starts sooner. Sparse boards
 * (below ~0.2) rarely force out at all — 8×8 "easy" used to be unbuildable.
 */
const DIFFICULTY_PARAMS: Record<HitoriDifficulty, DifficultyParams> = {
  easy: { shadeRatioMin: 0.26, shadeRatioMax: 0.34, requireForcedOnly: true },
  medium: { shadeRatioMin: 0.22, shadeRatioMax: 0.3, requireForcedOnly: true },
  hard: { shadeRatioMin: 0.22, shadeRatioMax: 0.28, requireForcedOnly: true },
}

/** Late attempts drift toward this density so no size/difficulty pair can fail. */
const FALLBACK_SHADE_RATIO = 0.34
const FALLBACK_SHADE_BAND = 0.04

const MAX_BUILD_ATTEMPTS = 200
const FILL_TRIES = 32

function emptyShading(n: number): Shading {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => false))
}

function allCells(n: number): Array<{ r: number; c: number }> {
  const cells: Array<{ r: number; c: number }> = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) cells.push({ r, c })
  }
  return cells
}

function touchesShaded(shading: Shading, n: number, r: number, c: number): boolean {
  for (const [dr, dc] of ORTHO) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
    if (shading[nr]![nc]) return true
  }
  return false
}

/**
 * Independent set with connected white complement (rules 2 & 3).
 * Uniqueness comes from forced-only number fills, not from maximality.
 */
export function generateShadingPattern(
  n: number,
  targetShadeRatio: number,
  rng: StudioRng,
): Shading {
  const shading = emptyShading(n)
  const target = Math.max(1, Math.round(n * n * targetShadeRatio))
  let shaded = 0

  for (const { r, c } of rng.shuffle(allCells(n))) {
    if (shaded >= target) break
    if (touchesShaded(shading, n, r, c)) continue
    if (wouldShadeDisconnect(shading, n, r, c)) continue
    shading[r]![c] = true
    shaded++
  }

  if (shaded < 1) return emptyShading(n)
  return shading
}

/** Latin square ⇒ white cells stay duplicate-free in every row/col. */
export function fillWhiteCells(
  shading: Shading,
  n: number,
  rng: StudioRng,
): number[][] {
  void shading
  return generateLatinSquare(n, rng)
}

function otherShadedTouchCount(
  shading: Shading,
  n: number,
  r: number,
  c: number,
  exceptR: number,
  exceptC: number,
): number {
  let count = 0
  for (const [dr, dc] of ORTHO) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
    if (nr === exceptR && nc === exceptC) continue
    if (shading[nr]![nc]) count++
  }
  return count
}

/**
 * Each shaded cell copies a white value. Prefer distance-2 copies that form
 * an XYX sandwich (forces the middle white → cascades into a forced solution).
 */
export function fillShadedCells(
  shading: Shading,
  grid: number[][],
  n: number,
  rng: StudioRng,
): boolean {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (shading[r]![c]) grid[r]![c] = 0
    }
  }

  const shadedCells = rng.shuffle(
    allCells(n).filter(({ r, c }) => shading[r]![c]),
  )

  for (const { r, c } of shadedCells) {
    const xyx: number[] = []
    // Distance-2 in row/col with a white middle → XYX foothold
    for (const [dr, dc] of [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ] as const) {
      const er = r + dr
      const ec = c + dc
      const mr = r + dr / 2
      const mc = c + dc / 2
      if (er < 0 || er >= n || ec < 0 || ec >= n) continue
      if (shading[er]![ec]) continue
      if (shading[mr]![mc]) continue
      const v = grid[er]![ec]!
      if (v > 0) xyx.push(v)
    }

    const locked: number[] = []
    const unlocked: number[] = []
    for (const [dr, dc] of ORTHO) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue
      const v = grid[nr]![nc]!
      if (v <= 0) continue
      if (otherShadedTouchCount(shading, n, nr, nc, r, c) > 0) locked.push(v)
      else unlocked.push(v)
    }

    const pool =
      xyx.length > 0 ? xyx : locked.length > 0 ? locked : unlocked
    if (pool.length > 0) {
      grid[r]![c] = rng.pick(pool)
      continue
    }

    const fallback = new Set<number>()
    for (let cc = 0; cc < n; cc++) {
      const v = grid[r]![cc]!
      if (v > 0) fallback.add(v)
    }
    for (let rr = 0; rr < n; rr++) {
      const v = grid[rr]![c]!
      if (v > 0) fallback.add(v)
    }
    if (fallback.size === 0) return false
    grid[r]![c] = rng.pick([...fallback])
  }

  return true
}

/** Every shaded cell must be necessary — removing any one breaks validity. */
export function allShadesNecessary(
  grid: number[][],
  shading: Shading,
  n: number,
): boolean {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!shading[r]![c]) continue
      shading[r]![c] = false
      const stillValid = isValidHitoriSolution(grid, shading, n)
      shading[r]![c] = true
      if (stillValid) return false
    }
  }
  return true
}

/**
 * No single swap of one shaded cell for one white cell yields another solution.
 * Combined with dominating + necessity this catches common alternate shadings.
 */
export function noValidSingleSwap(
  grid: number[][],
  shading: Shading,
  n: number,
): boolean {
  const shaded = allCells(n).filter(({ r, c }) => shading[r]![c])
  const whites = allCells(n).filter(({ r, c }) => !shading[r]![c])

  for (const s of shaded) {
    for (const w of whites) {
      if (grid[s.r]![s.c] !== grid[w.r]![w.c]) continue
      shading[s.r]![s.c] = false
      shading[w.r]![w.c] = true
      const ok = isValidHitoriSolution(grid, shading, n)
      shading[s.r]![s.c] = true
      shading[w.r]![w.c] = false
      if (ok) return false
    }
  }
  return true
}

function cloneGrid(grid: number[][]): number[][] {
  return grid.map((row) => row.slice())
}

function isAcceptablePuzzle(
  grid: number[][],
  shading: Shading,
  n: number,
  requireForcedOnly: boolean,
): boolean {
  if (!isValidHitoriSolution(grid, shading, n)) return false
  // Forced completion matching our shading ⇒ unique by construction.
  if (isForcedSolution(grid, shading, n)) return true
  if (requireForcedOnly) return false
  if (!allShadesNecessary(grid, shading, n)) return false
  if (!noValidSingleSwap(grid, shading, n)) return false
  return countHitoriSolutions(grid, n, 2) === 1
}

/**
 * Sparse draws are the slow ones, so the band drifts toward the fallback density
 * as attempts are used up — square root so the rescue arrives early, not last.
 */
function shadeRatioFor(
  params: DifficultyParams,
  progress: number,
  rng: StudioRng,
): number {
  const drift = Math.sqrt(progress)
  const lerp = (from: number, to: number) => from + drift * Math.max(0, to - from)
  const min = lerp(params.shadeRatioMin, FALLBACK_SHADE_RATIO - FALLBACK_SHADE_BAND)
  const max = lerp(params.shadeRatioMax, FALLBACK_SHADE_RATIO)
  return min + rng.next() * (max - min)
}

export function buildHitoriPuzzle(
  size: HitoriSize,
  difficulty: HitoriDifficulty,
  rng: StudioRng,
): HitoriPuzzle {
  const params = DIFFICULTY_PARAMS[difficulty]
  const attempts = size >= 10 ? MAX_BUILD_ATTEMPTS * 2 : MAX_BUILD_ATTEMPTS
  const fillTries = size >= 10 ? Math.max(12, FILL_TRIES) : FILL_TRIES

  for (let attempt = 0; attempt < attempts; attempt++) {
    const ratio = shadeRatioFor(params, attempt / attempts, rng)
    const shading = generateShadingPattern(size, ratio, rng)
    const shadedCount = shading.flat().filter(Boolean).length
    if (shadedCount < 1) continue

    const baseGrid = fillWhiteCells(shading, size, rng)

    for (let fill = 0; fill < fillTries; fill++) {
      const grid = cloneGrid(baseGrid)
      if (!fillShadedCells(shading, grid, size, rng)) continue
      if (!isAcceptablePuzzle(grid, shading, size, params.requireForcedOnly)) {
        continue
      }
      return { size, grid, shading }
    }
  }

  throw new Error(
    `Could not build a uniquely-solvable Hitori (${size}×${size}, ${difficulty})`,
  )
}
