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

export interface RetirementSudokuPuzzle {
  puzzle: number[][]
  solved: number[][]
  size: SudokuSize
  difficulty: SudokuDifficulty
  puzzleHash: string
  solutionHash: string
}

/** Starting unique-carve depth — rating, not clue count, decides accept/reject. */
const CLUE_TARGETS: Record<SudokuSize, Record<SudokuDifficulty, number>> = {
  9: { relaxed: 40, classic: 32, challenge: 24 },
  6: { relaxed: 18, classic: 14, challenge: 11 },
}

/** 6×6 rarely needs pairs; these bands separate Relaxed / Classic / Challenge there. */
const CLUE_BANDS: Record<SudokuSize, Record<SudokuDifficulty, { min: number; max: number }>> = {
  9: { relaxed: { min: 36, max: 46 }, classic: { min: 28, max: 35 }, challenge: { min: 22, max: 27 } },
  6: { relaxed: { min: 16, max: 22 }, classic: { min: 13, max: 15 }, challenge: { min: 10, max: 12 } },
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
 * Technique rating is the ceiling (never ship guessing, never ship a harder
 * puzzle than the label). Clue bands separate the three labels when 6×6 or
 * sparse 9×9 still solve with the same techniques.
 */
export function matchesRequestedDifficulty(options: {
  rating: SudokuDifficulty | null
  difficulty: SudokuDifficulty
  size: SudokuSize
  clues: number
}): boolean {
  const { rating, difficulty, size, clues } = options
  if (rating === null) return false
  if (DIFFICULTY_RANK[rating] > DIFFICULTY_RANK[difficulty]) return false
  const band = CLUE_BANDS[size][difficulty]
  if (clues < band.min || clues > band.max) return false
  if (difficulty === 'relaxed') return rating === 'relaxed'
  return true
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

function addRandomClue(
  puzzle: number[][],
  solved: number[][],
  size: number,
  rng: StudioRng,
): boolean {
  const empties = allCellPositions(size).filter(({ r, c }) => puzzle[r][c] === 0)
  if (empties.length === 0) return false
  const { r, c } = rng.pick(empties)
  puzzle[r][c] = solved[r][c]
  return true
}

function hardenPuzzle(
  puzzle: number[][],
  size: SudokuSize,
  difficulty: SudokuDifficulty,
  rng: StudioRng,
): void {
  const cells = rng.shuffle(allCellPositions(size).filter(({ r, c }) => puzzle[r][c] !== 0))
  for (const { r, c } of cells) {
    const backup = puzzle[r][c]
    puzzle[r][c] = 0
    if (countSolutions(puzzle, size, 2) !== 1 || !isSolvableWith(puzzle, size, difficulty)) {
      puzzle[r][c] = backup
    }
  }
}

function tuneToDifficulty(
  solved: number[][],
  size: SudokuSize,
  difficulty: SudokuDifficulty,
  rng: StudioRng,
): number[][] | null {
  const target = CLUE_TARGETS[size][difficulty]
  const puzzle = carvePuzzle(solved, target, size, rng)
  if (countSolutions(puzzle, size, 2) !== 1) return null

  let rating = ratePuzzle(puzzle, size)
  while (rating === null || DIFFICULTY_RANK[rating] > DIFFICULTY_RANK[difficulty]) {
    if (!addRandomClue(puzzle, solved, size, rng)) return null
    rating = ratePuzzle(puzzle, size)
  }

  fitClueBand(puzzle, solved, size, difficulty, rng)

  rating = ratePuzzle(puzzle, size)
  if (
    !matchesRequestedDifficulty({
      rating,
      difficulty,
      size,
      clues: clueCount(puzzle, size),
    })
  ) {
    return null
  }
  if (countSolutions(puzzle, size, 2) !== 1) return null
  if (!givensMatchSolution(puzzle, solved, size)) return null
  return puzzle
}

function fitClueBand(
  puzzle: number[][],
  solved: number[][],
  size: SudokuSize,
  difficulty: SudokuDifficulty,
  rng: StudioRng,
): void {
  const band = CLUE_BANDS[size][difficulty]
  if (clueCount(puzzle, size) > band.max) {
    hardenPuzzle(puzzle, size, difficulty, rng)
  }
  while (clueCount(puzzle, size) < band.min) {
    if (!addRandomClue(puzzle, solved, size, rng)) break
  }
}

export function preflightSudoku(puzzle: RetirementSudokuPuzzle): string | null {
  if (puzzle.size !== 6 && puzzle.size !== 9) return 'invalid grid size'
  if (!isFullyFilled(puzzle.solved, puzzle.size)) return 'solution incomplete'
  if (!givensMatchSolution(puzzle.puzzle, puzzle.solved, puzzle.size)) {
    return 'givens conflict with solution'
  }
  if (countSolutions(puzzle.puzzle, puzzle.size, 2) !== 1) return 'not exactly one solution'
  if (
    !matchesRequestedDifficulty({
      rating: ratePuzzle(puzzle.puzzle, puzzle.size),
      difficulty: puzzle.difficulty,
      size: puzzle.size,
      clues: clueCount(puzzle.puzzle, puzzle.size),
    })
  ) {
    return 'difficulty mismatch'
  }
  return null
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

export function generateRatedPuzzle(
  size: SudokuSize,
  difficulty: SudokuDifficulty,
  rng: StudioRng,
  usedPuzzleHashes?: Set<string>,
  usedSolutionHashes?: Set<string>,
): RetirementSudokuPuzzle {
  for (let attempt = 0; attempt < MAX_GRID_ATTEMPTS; attempt++) {
    const solved = generateSolvedGrid(size, rng)
    const solutionHash = hashSudokuGrid(solved)
    if (usedSolutionHashes?.has(solutionHash)) continue

    const puzzle = tuneToDifficulty(solved, size, difficulty, rng)
    if (!puzzle) continue

    const puzzleHash = hashSudokuGrid(puzzle)
    if (usedPuzzleHashes?.has(puzzleHash)) continue

    const built: RetirementSudokuPuzzle = {
      puzzle,
      solved,
      size,
      difficulty,
      puzzleHash,
      solutionHash,
    }
    if (preflightSudoku(built)) continue
    usedPuzzleHashes?.add(puzzleHash)
    usedSolutionHashes?.add(solutionHash)
    return built
  }
  throw new Error(
    `Could not build a unique ${difficulty} ${size}×${size} Sudoku in ${MAX_GRID_ATTEMPTS} attempts`,
  )
}

export function generateRatedPuzzles(
  count: number,
  size: SudokuSize,
  difficulty: SudokuDifficulty,
  rng: StudioRng,
): RetirementSudokuPuzzle[] {
  const usedPuzzleHashes = new Set<string>()
  const usedSolutionHashes = new Set<string>()
  const out: RetirementSudokuPuzzle[] = []
  for (let i = 0; i < count; i++) {
    out.push(generateRatedPuzzle(size, difficulty, rng, usedPuzzleHashes, usedSolutionHashes))
  }
  return out
}
