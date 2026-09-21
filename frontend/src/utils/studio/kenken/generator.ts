import type { StudioRng } from '../studio-rng'
import { generateLatinSquare } from '../futoshiki/latin'
import { countSolutions, applyOp } from './solver'
import type {
  CalcudokuPuzzle,
  Cage,
  Cell,
  KenkenDifficulty,
  KenkenOperations,
  KenkenSize,
  Op,
} from './types'

export { applyOp, countSolutions, enumerateCombos } from './solver'
export { generateLatinSquare, isLatinSquare } from '../futoshiki/latin'
export type {
  CalcudokuPuzzle,
  Cage,
  Cell,
  KenkenDifficulty,
  KenkenOperations,
  KenkenSize,
  Op,
} from './types'

interface DifficultyParams {
  maxCageSize: number
  /** Probability a new cage stops at a single freebie cell. */
  freebieChance: number
}

const DIFFICULTY_PARAMS: Record<KenkenDifficulty, DifficultyParams> = {
  easy: { maxCageSize: 2, freebieChance: 0.28 },
  medium: { maxCageSize: 3, freebieChance: 0.1 },
  hard: { maxCageSize: 4, freebieChance: 0.03 },
}

const MAX_BUILD_ATTEMPTS = 64

function allCells(n: number): Cell[] {
  const cells: Cell[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) cells.push({ r, c })
  }
  return cells
}

function orthogonalNeighbors(cell: Cell, n: number): Cell[] {
  const out: Cell[] = []
  if (cell.r > 0) out.push({ r: cell.r - 1, c: cell.c })
  if (cell.r + 1 < n) out.push({ r: cell.r + 1, c: cell.c })
  if (cell.c > 0) out.push({ r: cell.r, c: cell.c - 1 })
  if (cell.c + 1 < n) out.push({ r: cell.r, c: cell.c + 1 })
  return out
}

/**
 * Flood-grow contiguous cages over every cell.
 * Smaller cages / more freebies on easy; larger on hard.
 */
export function partitionCages(
  n: number,
  difficulty: KenkenDifficulty,
  rng: StudioRng,
): Cell[][] {
  const { maxCageSize, freebieChance } = DIFFICULTY_PARAMS[difficulty]
  const assigned = Array.from({ length: n }, () => Array.from({ length: n }, () => false))
  const cages: Cell[][] = []
  const order = rng.shuffle(allCells(n))

  for (const start of order) {
    if (assigned[start.r]![start.c]) continue

    const targetSize = rng.chance(freebieChance)
      ? 1
      : rng.int(1, maxCageSize)
    const cage: Cell[] = [start]
    assigned[start.r]![start.c] = true

    while (cage.length < targetSize) {
      const frontier: Cell[] = []
      const seen = new Set(cage.map((c) => `${c.r},${c.c}`))
      for (const cell of cage) {
        for (const nb of orthogonalNeighbors(cell, n)) {
          const key = `${nb.r},${nb.c}`
          if (seen.has(key) || assigned[nb.r]![nb.c]) continue
          seen.add(key)
          frontier.push(nb)
        }
      }
      if (frontier.length === 0) break
      const next = rng.pick(frontier)
      cage.push(next)
      assigned[next.r]![next.c] = true
    }

    cages.push(cage)
  }

  return cages
}

function sortDesc(digits: number[]): number[] {
  return [...digits].sort((a, b) => b - a)
}

export function assignOperation(
  cellDigits: number[],
  rng: StudioRng,
  operations: KenkenOperations,
  difficulty: KenkenDifficulty,
): { op: Op; target: number } {
  if (cellDigits.length === 1) {
    return { op: 'none', target: cellDigits[0]! }
  }

  const candidates: { op: Op; target: number }[] = [
    { op: 'add', target: cellDigits.reduce((sum, d) => sum + d, 0) },
    { op: 'mul', target: cellDigits.reduce((product, d) => product * d, 1) },
  ]

  if (cellDigits.length === 2 && operations === 'all') {
    const [a, b] = sortDesc(cellDigits)
    candidates.push({ op: 'sub', target: a! - b! })
    if (a! % b! === 0) candidates.push({ op: 'div', target: a! / b! })
  }

  if (difficulty === 'easy') {
    const soft = candidates.filter((c) => c.op === 'add' || c.op === 'mul')
    if (soft.length > 0 && rng.chance(0.8)) return rng.pick(soft)
  } else if (difficulty === 'hard' && operations === 'all') {
    const hardOps = candidates.filter((c) => c.op === 'sub' || c.op === 'div')
    if (hardOps.length > 0 && rng.chance(0.55)) return rng.pick(hardOps)
  }

  return rng.pick(candidates)
}

function buildCageOf(n: number, cages: Cage[]): number[][] {
  const cageOf = Array.from({ length: n }, () => Array.from({ length: n }, () => -1))
  for (let i = 0; i < cages.length; i++) {
    for (const { r, c } of cages[i]!.cells) cageOf[r]![c] = i
  }
  return cageOf
}

export function buildCalcudokuPuzzle(
  size: KenkenSize,
  difficulty: KenkenDifficulty,
  operations: KenkenOperations,
  rng: StudioRng,
): CalcudokuPuzzle {
  for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
    const solution = generateLatinSquare(size, rng)
    const cellGroups = partitionCages(size, difficulty, rng)
    const cages: Cage[] = cellGroups.map((cells) => {
      const digits = cells.map(({ r, c }) => solution[r]![c]!)
      const { op, target } = assignOperation(digits, rng, operations, difficulty)
      return { cells, op, target }
    })

    if (countSolutions(size, cages, 2) !== 1) continue

    return {
      size,
      cages,
      solution,
      cageOf: buildCageOf(size, cages),
    }
  }

  throw new Error(
    `Could not build a uniquely-solvable Calcudoku (${size}×${size}, ${difficulty}, ${operations})`,
  )
}

/** Verify a cage's solution digits match its published target (tests). */
export function cageMatchesSolution(cage: Cage, solution: number[][]): boolean {
  const digits = cage.cells.map(({ r, c }) => solution[r]![c]!)
  return applyOp(cage.op, digits) === cage.target
}
