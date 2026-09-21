import type { StudioRng } from '../studio-rng'

export type FoldAxis = 'v' | 'h'

/** A hole position on the unfolded sheet, in grid cells. */
export interface Cell {
  r: number
  c: number
}

/** Rectangle of the sheet still visible after a fold, in grid cells. */
export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export interface Fold {
  axis: FoldAxis
  /** Grid line the sheet folds over, in cell units. Need not be the mid-line. */
  line: number
  /** Half that stays put; the other half folds onto it. */
  keep: 'low' | 'high'
}

export interface FoldPuzzle {
  gridSize: number
  folds: Fold[]
  /** Sheet outline before each fold, plus the fully folded region last. */
  stages: Region[]
  /** Punched cells on the folded sheet. */
  punches: Cell[]
  /** Holes on the reopened sheet. */
  solution: Cell[]
}

/**
 * Holes may cover at most this share of the sheet. Past it the opened pattern
 * reads as texture rather than a shape and the item stops being a puzzle.
 */
export const MAX_HOLE_COVERAGE = 0.4

export const cellKey = (cell: Cell): string => `${cell.r},${cell.c}`

export function cellsKey(cells: readonly Cell[]): string {
  return sortCells(cells).map(cellKey).join(' ')
}

export function sortCells(cells: readonly Cell[]): Cell[] {
  return [...cells].sort((a, b) => (a.r === b.r ? a.c - b.c : a.r - b.r))
}

export function dedupeCells(cells: readonly Cell[]): Cell[] {
  const seen = new Set<string>()
  const out: Cell[] = []
  for (const cell of cells) {
    const key = cellKey(cell)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cell)
  }
  return out
}

export function cellsInRegion(region: Region): Cell[] {
  const out: Cell[] = []
  for (let r = region.y; r < region.y + region.h; r++) {
    for (let c = region.x; c < region.x + region.w; c++) {
      out.push({ r, c })
    }
  }
  return out
}

export function isInsideGrid(cell: Cell, gridSize: number): boolean {
  return cell.r >= 0 && cell.r < gridSize && cell.c >= 0 && cell.c < gridSize
}

export function isInRegion(cell: Cell, region: Region): boolean {
  return (
    cell.c >= region.x &&
    cell.c < region.x + region.w &&
    cell.r >= region.y &&
    cell.r < region.y + region.h
  )
}

export function foldRegion(region: Region, fold: Fold): Region {
  if (fold.axis === 'v') {
    const hi = region.x + region.w
    return fold.keep === 'low'
      ? { ...region, w: fold.line - region.x }
      : { ...region, x: fold.line, w: hi - fold.line }
  }
  const hi = region.y + region.h
  return fold.keep === 'low'
    ? { ...region, h: fold.line - region.y }
    : { ...region, y: fold.line, h: hi - fold.line }
}

/** Reflection across the crease: cell c maps to 2*line - 1 - c. */
export function mirrorCell(cell: Cell, fold: Fold): Cell {
  return fold.axis === 'v'
    ? { r: cell.r, c: 2 * fold.line - 1 - cell.c }
    : { r: 2 * fold.line - 1 - cell.r, c: cell.c }
}

/**
 * Creases that produce a physically foldable flap on the span `[lo, hi)`.
 *
 * The flap must land inside the half that stays, which forces the crease past
 * the mid-line — so the kept half is never smaller than half the span, and the
 * sheet cannot collapse to a sliver. Off-centre creases are what give this
 * template its content space: they also stop the opened pattern from being
 * symmetric about the sheet centre, which would let a solver skip the reasoning.
 */
function creasesOn(lo: number, hi: number): Array<Omit<Fold, 'axis'>> {
  const out: Array<Omit<Fold, 'axis'>> = []
  const mid = (lo + hi) / 2
  for (let line = lo + 1; line < hi; line++) {
    if (line >= mid) out.push({ line, keep: 'low' })
    if (line <= mid) out.push({ line, keep: 'high' })
  }
  return out
}

export function foldChoicesFor(region: Region): Fold[] {
  const out: Fold[] = []
  for (const crease of creasesOn(region.x, region.x + region.w)) {
    out.push({ axis: 'v', ...crease })
  }
  for (const crease of creasesOn(region.y, region.y + region.h)) {
    out.push({ axis: 'h', ...crease })
  }
  return out
}

/**
 * Reopens the sheet, mirroring the holes back across each crease in reverse.
 *
 * A mirrored hole only exists where the flap actually covered the punch, so each
 * reflection is clipped to the sheet outline *before* that fold — with off-centre
 * creases part of the kept half carries a single layer and does not duplicate.
 */
export function unfoldHoles(
  punches: readonly Cell[],
  folds: readonly Fold[],
  stages: readonly Region[],
): Cell[] {
  let holes = dedupeCells(punches)
  for (let i = folds.length - 1; i >= 0; i--) {
    const fold = folds[i]!
    const before = stages[i]
    if (!before) continue
    const reflected = holes
      .map((hole) => mirrorCell(hole, fold))
      .filter((hole) => isInRegion(hole, before))
    holes = dedupeCells([...holes, ...reflected])
  }
  return sortCells(holes)
}

/** Most holes the opened sheet can carry before it breaches the coverage cap. */
export function coverageCapFor(gridSize: number): number {
  return Math.max(1, Math.floor(gridSize * gridSize * MAX_HOLE_COVERAGE))
}

/**
 * Punch ceiling offered to the UI. Every fold can double a punch when it opens,
 * so the budget shrinks with the fold count — but off-centre creases duplicate
 * less than that worst case, hence the one-fold discount.
 */
export function maxHolesFor(gridSize: number, foldCount: number): number {
  const divisor = 2 ** Math.max(0, foldCount - 1)
  return Math.max(1, Math.floor(coverageCapFor(gridSize) / divisor))
}

/** Re-rolls folds when a greedy punch pass undershoots the requested count. */
const MAX_FOLD_ATTEMPTS = 16

function buildFolds(
  gridSize: number,
  foldCount: number,
  rng: StudioRng,
): { folds: Fold[]; stages: Region[]; region: Region } {
  let region: Region = { x: 0, y: 0, w: gridSize, h: gridSize }
  const stages: Region[] = [region]
  const folds: Fold[] = []

  for (let i = 0; i < foldCount; i++) {
    const choices = foldChoicesFor(region)
    if (choices.length === 0) break
    const fold = rng.pick(choices)
    folds.push(fold)
    region = foldRegion(region, fold)
    stages.push(region)
  }

  return { folds, stages, region }
}

function greedyPunches(
  candidates: readonly Cell[],
  folds: readonly Fold[],
  stages: readonly Region[],
  budget: number,
  cap: number,
): { punches: Cell[]; solution: Cell[] } {
  const punches: Cell[] = []
  let solution: Cell[] = []
  for (const cell of candidates) {
    if (punches.length >= budget) break
    const next = unfoldHoles([...punches, cell], folds, stages)
    if (next.length > cap) continue
    punches.push(cell)
    solution = next
  }
  return { punches, solution }
}

function fewestHoleFallback(
  candidates: readonly Cell[],
  folds: readonly Fold[],
  stages: readonly Region[],
): { punches: Cell[]; solution: Cell[] } {
  // A small sheet under many folds can breach the cap on its very first punch:
  // three folds of a 4x4 open every hole eightfold. Take the punch that opens to
  // the fewest holes rather than shipping an item with none.
  const punches: Cell[] = []
  let solution: Cell[] = []
  for (const cell of candidates) {
    const opened = unfoldHoles([cell], folds, stages)
    if (solution.length > 0 && opened.length >= solution.length) continue
    punches.length = 0
    punches.push(cell)
    solution = opened
  }
  return { punches, solution }
}

/**
 * Picks punches under the opened-sheet coverage cap.
 *
 * Try a random order first (keeps answer variety). If that undershoots — common
 * when early high-expansion punches spend the coverage budget — retry the same
 * cells ordered by how few holes they open to, so "Holes punched = 4" lands as 4.
 */
function pickPunches(options: {
  region: Region
  folds: readonly Fold[]
  stages: readonly Region[]
  budget: number
  cap: number
  rng: StudioRng
}): { punches: Cell[]; solution: Cell[] } {
  const { region, folds, stages, budget, cap, rng } = options
  const candidates = rng.shuffle(cellsInRegion(region))
  let best = greedyPunches(candidates, folds, stages, budget, cap)

  if (best.punches.length < budget) {
    const compact = [...candidates].sort(
      (a, b) =>
        unfoldHoles([a], folds, stages).length - unfoldHoles([b], folds, stages).length,
    )
    const rescued = greedyPunches(compact, folds, stages, budget, cap)
    if (rescued.punches.length > best.punches.length) best = rescued
  }

  if (best.punches.length === 0) {
    return fewestHoleFallback(candidates, folds, stages)
  }
  return best
}

export function buildFoldPuzzle(options: {
  gridSize: number
  foldCount: number
  holeCount: number
  rng: StudioRng
}): FoldPuzzle {
  const { gridSize, foldCount, holeCount, rng } = options
  const budget = Math.min(holeCount, maxHolesFor(gridSize, foldCount))
  const cap = coverageCapFor(gridSize)

  let best: FoldPuzzle | null = null

  for (let attempt = 0; attempt < MAX_FOLD_ATTEMPTS; attempt++) {
    const { folds, stages, region } = buildFolds(gridSize, foldCount, rng)
    const punchBudget = Math.min(budget, maxHolesFor(gridSize, folds.length))
    const { punches, solution } = pickPunches({
      region,
      folds,
      stages,
      budget: punchBudget,
      cap,
      rng,
    })
    const puzzle: FoldPuzzle = {
      gridSize,
      folds,
      stages,
      punches: sortCells(punches),
      solution,
    }
    if (!best || puzzle.punches.length > best.punches.length) best = puzzle
    if (puzzle.punches.length >= punchBudget) return puzzle
  }

  return best!
}
