import type { StudioRng } from '../studio-rng'
import {
  canonicalGridForm,
  canonicalHash,
  composeCanonicalForm,
} from '../_shared/uniqueness'
import {
  allCellPositions,
  carvePuzzle,
  countSolutions,
  generateSolvedGrid,
  givensMatchSolution,
  type SudokuSize,
} from './solver'
import {
  DIFFICULTY_RANK,
  isSolvableWith,
  ratePuzzle,
  type SudokuDifficulty,
} from './rate'
import type { SudokuLevel, SudokuLevelId } from './levels'

export interface RetirementSudokuPuzzle {
  puzzle: number[][]
  solved: number[][]
  size: SudokuSize
  level: SudokuLevelId
  /** Hardest technique this puzzle actually needs — equals the level ceiling. */
  rating: SudokuDifficulty
  clues: number
  puzzleHash: string
  solutionHash: string
}

const MAX_GRID_ATTEMPTS = 64

export function clueCount(puzzle: number[][], size: number): number {
  let n = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (puzzle[r][c] !== 0) n++
    }
  }
  return n
}

/**
 * A level's promise, stated once.
 *
 * The rating must land *on* the ceiling, not merely under it. Matching "at
 * most" was what let Medium and Challenging ship the same puzzle with a
 * different word on the cover: carved grids are overwhelmingly singles-only,
 * so only the clue count ever differed. Requiring the technique the label
 * names is what makes the ladder real — and the clue band on top of it is
 * what keeps two pages of one level looking like siblings.
 */
export function matchesLevel(options: {
  rating: SudokuDifficulty | null
  level: SudokuLevel
  clues: number
}): boolean {
  const { rating, level, clues } = options
  if (rating !== level.ceiling) return false
  return clues >= level.minClues && clues <= level.maxClues
}

export function sudokuPuzzleForm(grid: number[][]): string {
  return canonicalGridForm(grid, (n) => String(n))
}

export function hashSudokuGrid(grid: number[][]): string {
  return canonicalHash(sudokuPuzzleForm(grid))
}

export function sudokuCanonicalKey(puzzle: RetirementSudokuPuzzle): string {
  return composeCanonicalForm('sudoku', puzzle.puzzleHash, puzzle.solutionHash)
}

function shuffledCells(
  puzzle: number[][],
  size: SudokuSize,
  filled: boolean,
  rng: StudioRng,
): { r: number; c: number }[] {
  return rng.shuffle(
    allCellPositions(size).filter(({ r, c }) => (puzzle[r][c] !== 0) === filled),
  )
}

/** Reveal one more answer, ignoring what it does to the rating. */
function addRandomClue(
  puzzle: number[][],
  solved: number[][],
  size: SudokuSize,
  rng: StudioRng,
): boolean {
  const empties = shuffledCells(puzzle, size, false, rng)
  const cell = empties[0]
  if (!cell) return false
  puzzle[cell.r][cell.c] = solved[cell.r][cell.c]
  return true
}

/**
 * Strip every clue the ceiling can still do without.
 *
 * This is what *raises* a puzzle to its label: a grid that solves on singles
 * alone stops doing so once the redundant givens are gone, and the pairs and
 * pointing work the level promises is what is left. Stops at `minClues` so
 * hardening can never undercut the comfort band.
 */
function hardenToCeiling(
  puzzle: number[][],
  size: SudokuSize,
  ceiling: SudokuDifficulty,
  minClues: number,
  rng: StudioRng,
): void {
  let clues = clueCount(puzzle, size)
  for (const { r, c } of shuffledCells(puzzle, size, true, rng)) {
    if (clues <= minClues) return
    const backup = puzzle[r][c]
    puzzle[r][c] = 0
    if (countSolutions(puzzle, size, 2) !== 1 || !isSolvableWith(puzzle, size, ceiling)) {
      puzzle[r][c] = backup
      continue
    }
    clues--
  }
}

/**
 * Fill back up to the band floor without softening the puzzle.
 *
 * A clue added blindly can collapse the solve back to singles, which would
 * quietly demote the page; only clues the rating survives are kept.
 */
function padToBandFloor(
  puzzle: number[][],
  solved: number[][],
  size: SudokuSize,
  ceiling: SudokuDifficulty,
  minClues: number,
  rng: StudioRng,
): void {
  while (clueCount(puzzle, size) < minClues) {
    let placed = false
    for (const { r, c } of shuffledCells(puzzle, size, false, rng)) {
      puzzle[r][c] = solved[r][c]
      if (ratePuzzle(puzzle, size) === ceiling) {
        placed = true
        break
      }
      puzzle[r][c] = 0
    }
    if (!placed) return
  }
}

/** Carve one solved grid down to a puzzle that keeps the level's promise. */
function tuneToLevel(
  solved: number[][],
  level: SudokuLevel,
  rng: StudioRng,
): number[][] | null {
  const { size, ceiling } = level
  const puzzle = carvePuzzle(solved, level.targetClues, size, rng)
  if (countSolutions(puzzle, size, 2) !== 1) return null

  // Never ship guessing, and never ship deduction past the level's ceiling:
  // reveal answers until the rater can finish it within that budget.
  let rating = ratePuzzle(puzzle, size)
  while (rating === null || DIFFICULTY_RANK[rating] > DIFFICULTY_RANK[ceiling]) {
    if (!addRandomClue(puzzle, solved, size, rng)) return null
    rating = ratePuzzle(puzzle, size)
  }

  if (rating !== ceiling || clueCount(puzzle, size) > level.maxClues) {
    hardenToCeiling(puzzle, size, ceiling, level.minClues, rng)
  }
  padToBandFloor(puzzle, solved, size, ceiling, level.minClues, rng)

  const clues = clueCount(puzzle, size)
  if (!matchesLevel({ rating: ratePuzzle(puzzle, size), level, clues })) return null
  if (countSolutions(puzzle, size, 2) !== 1) return null
  if (!givensMatchSolution(puzzle, solved, size)) return null
  return puzzle
}

function isFullyFilled(grid: number[][], size: number): boolean {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const n = grid[r][c]
      if (n < 1 || n > size) return false
    }
  }
  return true
}

/** Last gate before a puzzle reaches the page. Returns a reason, or null. */
export function preflightSudoku(
  puzzle: RetirementSudokuPuzzle,
  level: SudokuLevel,
): string | null {
  if (puzzle.size !== level.size) return 'grid size does not match the level'
  if (!isFullyFilled(puzzle.solved, puzzle.size)) return 'solution incomplete'
  if (!givensMatchSolution(puzzle.puzzle, puzzle.solved, puzzle.size)) {
    return 'givens conflict with solution'
  }
  if (countSolutions(puzzle.puzzle, puzzle.size, 2) !== 1) return 'not exactly one solution'
  if (
    !matchesLevel({
      rating: ratePuzzle(puzzle.puzzle, puzzle.size),
      level,
      clues: clueCount(puzzle.puzzle, puzzle.size),
    })
  ) {
    return 'difficulty does not match the level'
  }
  return null
}

/**
 * One puzzle for one page.
 *
 * Repeats across a book are not this function's job: the Studio stamps the
 * canonical key below on the grid group and the book-scoped ledger reruns any
 * sheet whose fingerprint the book has already printed.
 */
export function generateLevelPuzzle(
  level: SudokuLevel,
  rng: StudioRng,
): RetirementSudokuPuzzle {
  const { size } = level
  for (let attempt = 0; attempt < MAX_GRID_ATTEMPTS; attempt++) {
    const solved = generateSolvedGrid(size, rng)
    const puzzle = tuneToLevel(solved, level, rng)
    if (!puzzle) continue

    const built: RetirementSudokuPuzzle = {
      puzzle,
      solved,
      size,
      level: level.id,
      rating: level.ceiling,
      clues: clueCount(puzzle, size),
      puzzleHash: hashSudokuGrid(puzzle),
      solutionHash: hashSudokuGrid(solved),
    }
    if (preflightSudoku(built, level)) continue
    return built
  }
  throw new Error(
    `Could not build a ${level.id} ${size}×${size} Sudoku in ${MAX_GRID_ATTEMPTS} attempts`,
  )
}
