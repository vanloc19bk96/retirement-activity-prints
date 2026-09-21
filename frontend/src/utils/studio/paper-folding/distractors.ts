import type { StudioRng } from '../studio-rng'
import {
  cellKey,
  cellsInRegion,
  cellsKey,
  dedupeCells,
  isInsideGrid,
  sortCells,
  unfoldHoles,
  type Cell,
  type FoldPuzzle,
} from './fold'

const NEIGHBOUR_OFFSETS: ReadonlyArray<Cell> = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
]

const MAX_TOP_UP_ATTEMPTS = 60
const SIBLING_ATTEMPTS = 40

function emptyCells(holes: readonly Cell[], gridSize: number): Cell[] {
  const taken = new Set(holes.map(cellKey))
  const out: Cell[] = []
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!taken.has(cellKey({ r, c }))) out.push({ r, c })
    }
  }
  return out
}

/** Right pattern, wrong orientation. */
function mirrored(holes: readonly Cell[], gridSize: number, axis: 'v' | 'h'): Cell[] {
  return sortCells(
    holes.map((hole) =>
      axis === 'v'
        ? { r: hole.r, c: gridSize - 1 - hole.c }
        : { r: gridSize - 1 - hole.r, c: hole.c },
    ),
  )
}

function rotatedQuarter(holes: readonly Cell[], gridSize: number): Cell[] {
  return sortCells(holes.map((hole) => ({ r: hole.c, c: gridSize - 1 - hole.r })))
}

function withoutOne(holes: readonly Cell[], rng: StudioRng): Cell[] {
  if (holes.length <= 1) return []
  const drop = rng.int(0, holes.length - 1)
  return sortCells(holes.filter((_, i) => i !== drop))
}

function withExtraOne(holes: readonly Cell[], gridSize: number, rng: StudioRng): Cell[] {
  const free = emptyCells(holes, gridSize)
  if (free.length === 0) return []
  return sortCells([...holes, rng.pick(free)])
}

function withShiftedOne(
  holes: readonly Cell[],
  gridSize: number,
  rng: StudioRng,
): Cell[] {
  if (holes.length === 0) return []
  const taken = new Set(holes.map(cellKey))
  const moveIndex = rng.int(0, holes.length - 1)
  const source = holes[moveIndex]!
  for (const offset of rng.shuffle(NEIGHBOUR_OFFSETS)) {
    const target = { r: source.r + offset.r, c: source.c + offset.c }
    if (!isInsideGrid(target, gridSize)) continue
    if (taken.has(cellKey(target))) continue
    return sortCells([...holes.filter((_, i) => i !== moveIndex), target])
  }
  return []
}

/**
 * The strongest foil there is: punch a *different* set of cells on the same
 * folded sheet and open it the same way. The result carries the identical
 * symmetry and (when `sameSize`) the identical hole count as the answer, so no
 * counting or symmetry shortcut can separate it — only tracing the folds can.
 */
function siblingUnfolds(
  puzzle: FoldPuzzle,
  rng: StudioRng,
  want: number,
  sameSize: boolean,
): Cell[][] {
  const region = puzzle.stages[puzzle.stages.length - 1]
  if (!region) return []
  const available = cellsInRegion(region)
  if (available.length <= puzzle.punches.length) return []

  const out: Cell[][] = []
  const seen = new Set<string>([cellsKey(puzzle.solution)])
  for (let attempt = 0; attempt < SIBLING_ATTEMPTS && out.length < want; attempt++) {
    const alt = rng.sample(available, puzzle.punches.length)
    const cells = unfoldHoles(alt, puzzle.folds, puzzle.stages)
    if (sameSize && cells.length !== puzzle.solution.length) continue
    const key = cellsKey(cells)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cells)
  }
  return out
}

/**
 * Foils in descending order of how well they hide. Tiers matter: the earlier
 * ones match the answer's hole count and symmetry, so filling from the top
 * keeps "pick the tidy one" from working. Later tiers only get used when the
 * folded sheet is too small to offer anything better.
 */
function candidateTiers(puzzle: FoldPuzzle, rng: StudioRng): Cell[][][] {
  const { solution, punches, folds, stages, gridSize } = puzzle
  return [
    siblingUnfolds(puzzle, rng, 3, true),
    [
      mirrored(solution, gridSize, 'v'),
      mirrored(solution, gridSize, 'h'),
      rotatedQuarter(solution, gridSize),
      withShiftedOne(solution, gridSize, rng),
    ],
    [
      ...siblingUnfolds(puzzle, rng, 3, false),
      unfoldHoles(punches, folds.slice(1), stages.slice(1)),
    ],
    [sortCells(punches), withoutOne(solution, rng), withExtraOne(solution, gridSize, rng)],
  ]
}

/** Last resort when the tiers run dry — still prefers count-preserving edits. */
function topUp(
  chosen: Cell[][],
  seen: Set<string>,
  puzzle: FoldPuzzle,
  rng: StudioRng,
  needed: number,
): void {
  for (let attempt = 0; attempt < MAX_TOP_UP_ATTEMPTS && chosen.length < needed; attempt++) {
    const source = rng.pick([...chosen, puzzle.solution])
    const variant =
      attempt < MAX_TOP_UP_ATTEMPTS / 2 || rng.chance(0.5)
        ? withShiftedOne(source, puzzle.gridSize, rng)
        : withExtraOne(source, puzzle.gridSize, rng)
    if (variant.length === 0) continue
    const key = cellsKey(variant)
    if (seen.has(key)) continue
    seen.add(key)
    chosen.push(variant)
  }
}

export interface FoldItem {
  puzzle: FoldPuzzle
  options: Cell[][]
  correctIndex: number
}

export function buildFoldItem(options: {
  puzzle: FoldPuzzle
  optionCount: number
  rng: StudioRng
}): FoldItem {
  const { puzzle, optionCount, rng } = options
  const seen = new Set<string>([cellsKey(puzzle.solution)])
  const chosen: Cell[][] = []

  for (const tier of candidateTiers(puzzle, rng)) {
    for (const candidate of rng.shuffle(tier)) {
      if (chosen.length >= optionCount - 1) break
      const cells = dedupeCells(candidate).filter((cell) =>
        isInsideGrid(cell, puzzle.gridSize),
      )
      if (cells.length === 0) continue
      const key = cellsKey(cells)
      if (seen.has(key)) continue
      seen.add(key)
      chosen.push(sortCells(cells))
    }
    if (chosen.length >= optionCount - 1) break
  }

  topUp(chosen, seen, puzzle, rng, optionCount - 1)

  const correctIndex = rng.int(0, Math.min(optionCount, chosen.length + 1) - 1)
  const list = [...chosen]
  list.splice(correctIndex, 0, puzzle.solution)

  return { puzzle, options: list.slice(0, optionCount), correctIndex }
}
