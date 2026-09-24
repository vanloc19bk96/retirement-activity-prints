import type { StudioRng } from '../studio-rng'
import {
  canonicalGridForm,
  canonicalHash,
  composeCanonicalForm,
} from '../_shared/uniqueness'
import {
  allCellPositions,
  completeGrid,
  countSolutions,
  emptyGrid,
  givensMatchSolution,
  isFullyValid,
  range,
} from '../sudoku/solver'
import { isSolvableWith, ratePuzzle, type SudokuDifficulty } from '../sudoku/rate'
import { clueCount } from '../sudoku/puzzle'
import { wordokuTargetFaults, type WordokuTarget } from './content'
import { WORDOKU_SIZE, type WordokuLevel, type WordokuLevelId } from './levels'

/**
 * One Word-oku: a Sudoku whose nine symbols are the letters of a word, built so
 * the main diagonal spells that word top-left to bottom-right.
 *
 * Everything is solved in numbers and only turned into letters at the edge.
 * Symbol `d` (1–9) is the word's `d`-th letter, and the grid is built with the
 * diagonal pinned to 1, 2, … 9 — so the diagonal *is* the word by construction,
 * not by luck. That keeps every piece of Sudoku machinery this app already
 * trusts (the uniqueness counter, the technique rater, the validity checks)
 * working unchanged, because relabelling symbols never changes a Sudoku's logic.
 *
 * The alternative — generate any Sudoku and hope its diagonal has nine distinct
 * digits to relabel — works a few percent of the time and says nothing about
 * which order they come in. Pinning first is what makes "the diagonal spells
 * the word" a guarantee.
 */
export interface WordokuPuzzle {
  target: WordokuTarget
  /** Numeric givens, 0 for a blank. Symbol d prints as target.word[d - 1]. */
  puzzle: number[][]
  /** Numeric solution; `solved[i][i] === i + 1` on every row. */
  solved: number[][]
  level: WordokuLevelId
  /** Hardest technique this puzzle needs — equals the level ceiling. */
  rating: SudokuDifficulty
  clues: number
  puzzleHash: string
  solutionHash: string
}

const MAX_GRID_ATTEMPTS = 48

/** The letter a numeric symbol prints as. */
export function wordokuLetter(target: WordokuTarget, symbol: number): string {
  return target.word[symbol - 1] ?? ''
}

/** Letters of the grid alphabet in the order the letter bank prints them. */
export function wordokuLetterBank(target: WordokuTarget): string[] {
  // Alphabetical, never word order: a bank that read BIRDHOUSE would give the
  // hidden word away before the first cell was filled.
  return [...target.word].sort()
}

/** The diagonal of a numeric grid, read as letters. */
export function wordokuDiagonal(target: WordokuTarget, grid: number[][]): string {
  return range(0, WORDOKU_SIZE - 1)
    .map((i) => wordokuLetter(target, grid[i]![i]!))
    .join('')
}

/** Diagonal cells that print a letter on the puzzle page. */
export function diagonalGivenCount(puzzle: number[][]): number {
  let n = 0
  for (let i = 0; i < WORDOKU_SIZE; i++) if (puzzle[i]![i] !== 0) n++
  return n
}

/**
 * A complete grid with `grid[i][i] === i + 1`.
 *
 * The three boxes the diagonal runs through share no row or column, so each is
 * filled on its own: its three diagonal cells are pinned and the other six take
 * the remaining symbols in a random order. Three independently filled diagonal
 * boxes always complete to a full Sudoku; the backtracker does the rest with
 * randomised candidates, which is where the variety between pages comes from.
 */
export function buildDiagonalGrid(rng: StudioRng): number[][] | null {
  const grid = emptyGrid(WORDOKU_SIZE)
  for (let box = 0; box < 3; box++) {
    const start = box * 3
    const pinned = [start + 1, start + 2, start + 3]
    const rest = rng.shuffle(range(1, WORDOKU_SIZE).filter((n) => !pinned.includes(n)))
    let next = 0
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        grid[start + r]![start + c] = r === c ? start + r + 1 : rest[next++]!
      }
    }
  }
  if (!completeGrid(grid, WORDOKU_SIZE, rng)) return null
  return grid
}

/**
 * Blank `cell` if the puzzle stays unique and within the level's ceiling.
 *
 * The ceiling check is what keeps guessing out of the book: a cell whose removal
 * leaves a puzzle the rater cannot finish by deduction stays printed. It runs
 * first because it is the cheaper test and fails more often near the floor.
 */
function tryBlank(
  puzzle: number[][],
  r: number,
  c: number,
  ceiling: SudokuDifficulty,
): boolean {
  const backup = puzzle[r]![c]!
  puzzle[r]![c] = 0
  if (isSolvableWith(puzzle, WORDOKU_SIZE, ceiling) && countSolutions(puzzle, WORDOKU_SIZE, 2) === 1) {
    return true
  }
  puzzle[r]![c] = backup
  return false
}

/**
 * Carve one solved grid down to a puzzle that keeps the level's promise.
 *
 * Order matters. The diagonal goes first, down to exactly the level's number of
 * given letters — a full grid minus some of one diagonal leaves one blank per
 * row at most, so that step can never break uniqueness. Diagonal cells are then
 * off-limits, which is what keeps the word's giveaway identical on every page of
 * a level. The rest is carved to the target, and a level whose ceiling is above
 * singles keeps carving toward its floor until the solve actually needs the
 * technique its label names — otherwise "Challenging" would quietly ship pages
 * no harder than "Classic".
 */
export function carveWordoku(
  solved: number[][],
  level: WordokuLevel,
  rng: StudioRng,
): number[][] {
  const puzzle = solved.map((row) => [...row])
  const diagonal = range(0, WORDOKU_SIZE - 1)
  const kept = new Set(rng.sample(diagonal, level.diagonalGivens))
  for (const i of diagonal) if (!kept.has(i)) puzzle[i]![i] = 0

  let clues = clueCount(puzzle, WORDOKU_SIZE)
  const offDiagonal = rng.shuffle(allCellPositions(WORDOKU_SIZE).filter(({ r, c }) => r !== c))
  for (const { r, c } of offDiagonal) {
    if (clues <= level.targetClues) break
    if (tryBlank(puzzle, r, c, level.ceiling)) clues--
  }

  if (ratePuzzle(puzzle, WORDOKU_SIZE) !== level.ceiling) {
    const givens = rng.shuffle(
      offDiagonal.filter(({ r, c }) => puzzle[r]![c] !== 0),
    )
    for (const { r, c } of givens) {
      if (clues <= level.minClues) break
      if (!tryBlank(puzzle, r, c, level.ceiling)) continue
      clues--
      if (ratePuzzle(puzzle, WORDOKU_SIZE) === level.ceiling) break
    }
  }

  // Not validated here: the caller runs the full fault check on the built
  // puzzle, word included, and throws away anything that misses its level.
  return puzzle
}

/**
 * Everything about the grid that has to be true before it reaches a page.
 *
 * Checked on the finished numbers rather than trusted from the carve, because
 * every fault here is silent: a second solution, a diagonal that spells nothing,
 * or a page harder than its label all look exactly like a correct puzzle until
 * a reader has spent an afternoon on it.
 */
export function wordokuGridFaults(options: {
  puzzle: number[][]
  solved: number[][]
  level: WordokuLevel
}): string[] {
  const { puzzle, solved, level } = options
  const faults: string[] = []
  const n = WORDOKU_SIZE
  if (solved.length !== n || solved.some((row) => row.length !== n)) {
    return ['The grid is not 9×9.']
  }
  if (puzzle.length !== n || puzzle.some((row) => row.length !== n)) {
    return ['The puzzle grid is not 9×9.']
  }
  if (!isFullyValid(solved, n)) {
    faults.push('The solution breaks a row, column or box rule.')
  }
  for (let i = 0; i < n; i++) {
    if (solved[i]![i] !== i + 1) {
      faults.push('The diagonal does not spell the hidden word in order.')
      break
    }
  }
  if (!givensMatchSolution(puzzle, solved, n)) {
    faults.push('A printed letter disagrees with the solution.')
  }
  if (countSolutions(puzzle, n, 2) !== 1) {
    faults.push('The puzzle does not have exactly one solution.')
  }
  if (ratePuzzle(puzzle, n) !== level.ceiling) {
    faults.push('The puzzle is not the difficulty its level promises.')
  }
  const clues = clueCount(puzzle, n)
  if (clues < level.minClues || clues > level.maxClues) {
    faults.push('The puzzle prints the wrong number of letters for its level.')
  }
  if (diagonalGivenCount(puzzle) !== level.diagonalGivens) {
    faults.push('The diagonal gives away the wrong number of letters.')
  }
  return faults
}

/** Everything about a built puzzle that must hold, word and grid together. */
export function wordokuFaults(puzzle: WordokuPuzzle, level: WordokuLevel): string[] {
  const faults = [...wordokuTargetFaults(puzzle.target)]
  if (puzzle.level !== level.id) faults.push('The puzzle was built for another level.')
  faults.push(...wordokuGridFaults({ puzzle: puzzle.puzzle, solved: puzzle.solved, level }))
  if (wordokuDiagonal(puzzle.target, puzzle.solved) !== puzzle.target.word) {
    faults.push('The shaded diagonal does not spell the hidden word.')
  }
  return faults
}

function letterGrid(target: WordokuTarget, grid: number[][]): string[][] {
  return grid.map((row) => row.map((n) => (n === 0 ? '.' : wordokuLetter(target, n))))
}

export function wordokuCanonicalKey(puzzle: WordokuPuzzle): string {
  return composeCanonicalForm('wordoku', puzzle.puzzleHash, puzzle.solutionHash)
}

/**
 * One Word-oku for one page, or null when this word would not carve.
 *
 * Repeats across a book are handled twice over: the target word rotates through
 * the variety ledger, and the grid group carries the canonical key the Studio's
 * book ledger checks before a page is kept.
 */
export function buildWordokuPuzzle(options: {
  target: WordokuTarget
  level: WordokuLevel
  rng: StudioRng
  attempts?: number
}): WordokuPuzzle | null {
  const { target, level, rng } = options
  if (wordokuTargetFaults(target).length > 0) return null
  const attempts = options.attempts ?? MAX_GRID_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt++) {
    const solved = buildDiagonalGrid(rng)
    if (!solved) continue
    const puzzle = carveWordoku(solved, level, rng)
    const built: WordokuPuzzle = {
      target,
      puzzle,
      solved,
      level: level.id,
      rating: level.ceiling,
      clues: clueCount(puzzle, WORDOKU_SIZE),
      puzzleHash: canonicalHash(canonicalGridForm(letterGrid(target, puzzle), (s) => s)),
      solutionHash: canonicalHash(canonicalGridForm(letterGrid(target, solved), (s) => s)),
    }
    if (wordokuFaults(built, level).length > 0) continue
    return built
  }
  return null
}
