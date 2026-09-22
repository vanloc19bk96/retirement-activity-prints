import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  generateSolvedGrid,
  carvePuzzle,
  countSolutions,
  isFullyValid,
  givensMatchSolution,
} from './solver'
import {
  clueCount,
  generateLevelPuzzle,
  hashSudokuGrid,
  matchesLevel,
  preflightSudoku,
} from './puzzle'
import { SUDOKU_LEVELS } from './levels'
import { ratePuzzle } from './rate'

describe('sudoku uniqueness guarantee', () => {
  it('every generated puzzle has EXACTLY one solution', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed)
      const solved = generateSolvedGrid(9, rng)
      const puzzle = carvePuzzle(solved, 30, 9, rng)
      expect(countSolutions(puzzle, 9, 2)).toBe(1)
    }
  })

  it('the given clues in the puzzle match the solved grid exactly', () => {
    const rng = createRng(42)
    const solved = generateSolvedGrid(9, rng)
    const puzzle = carvePuzzle(solved, 30, 9, rng)
    expect(givensMatchSolution(puzzle, solved, 9)).toBe(true)
  })

  it('generateSolvedGrid always produces a fully valid 9×9', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const grid = generateSolvedGrid(9, createRng(seed))
      expect(isFullyValid(grid, 9)).toBe(true)
    }
  })

  it('6×6 produces unique valid puzzles', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed)
      const solved = generateSolvedGrid(6, rng)
      expect(isFullyValid(solved, 6)).toBe(true)
      const puzzle = carvePuzzle(solved, 16, 6, rng)
      expect(countSolutions(puzzle, 6, 2)).toBe(1)
      expect(givensMatchSolution(puzzle, solved, 6)).toBe(true)
    }
  })
})

describe('sudoku levels', () => {
  it('every level builds a puzzle that keeps its promise', () => {
    for (const level of SUDOKU_LEVELS) {
      for (const seed of [11, 99, 7919]) {
        const built = generateLevelPuzzle(level, createRng(seed))
        expect(preflightSudoku(built, level)).toBeNull()
        expect(built.size).toBe(level.size)
        expect(isFullyValid(built.solved, level.size)).toBe(true)
        expect(countSolutions(built.puzzle, level.size, 2)).toBe(1)
        expect(givensMatchSolution(built.puzzle, built.solved, level.size)).toBe(true)
      }
    }
  }, 120_000)

  it('needs exactly the technique its label names — never guessing', () => {
    for (const level of SUDOKU_LEVELS) {
      const built = generateLevelPuzzle(level, createRng(2024))
      expect(ratePuzzle(built.puzzle, level.size)).toBe(level.ceiling)
      expect(built.rating).toBe(level.ceiling)
    }
  }, 60_000)

  it('never asks for expert deduction (naked triples, X-wing)', () => {
    for (const level of SUDOKU_LEVELS) {
      expect(level.ceiling).not.toBe('challenge')
    }
  })

  it('keeps clue counts inside the level band', () => {
    for (const level of SUDOKU_LEVELS) {
      const built = generateLevelPuzzle(level, createRng(31))
      expect(built.clues).toBe(clueCount(built.puzzle, level.size))
      expect(built.clues).toBeGreaterThanOrEqual(level.minClues)
      expect(built.clues).toBeLessThanOrEqual(level.maxClues)
    }
  }, 60_000)

  it('rejects a rating below the level ceiling', () => {
    const challenging = SUDOKU_LEVELS.find((l) => l.ceiling === 'classic')!
    expect(
      matchesLevel({ rating: 'relaxed', level: challenging, clues: challenging.targetClues }),
    ).toBe(false)
    expect(
      matchesLevel({ rating: 'classic', level: challenging, clues: challenging.targetClues }),
    ).toBe(true)
    expect(matchesLevel({ rating: null, level: challenging, clues: challenging.targetClues })).toBe(
      false,
    )
  })

  it('hashes the grids it ships', () => {
    const level = SUDOKU_LEVELS[0]!
    const built = generateLevelPuzzle(level, createRng(3))
    expect(hashSudokuGrid(built.puzzle)).toBe(built.puzzleHash)
    expect(hashSudokuGrid(built.solved)).toBe(built.solutionHash)
  })

  it('a harder level leaves fewer numbers on the page', () => {
    const easy = generateLevelPuzzle(SUDOKU_LEVELS.find((l) => l.id === 'easy')!, createRng(5))
    const medium = generateLevelPuzzle(SUDOKU_LEVELS.find((l) => l.id === 'medium')!, createRng(5))
    const hard = generateLevelPuzzle(
      SUDOKU_LEVELS.find((l) => l.id === 'challenging')!,
      createRng(5),
    )
    expect(easy.clues).toBeGreaterThan(medium.clues)
    expect(medium.clues).toBeGreaterThan(hard.clues)
  }, 60_000)
})
