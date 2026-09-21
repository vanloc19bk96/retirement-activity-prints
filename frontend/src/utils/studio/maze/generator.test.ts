import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildMaze,
  carveMaze,
  countDeadEnds,
  hasWall,
  isPerfectMaze,
  solveMaze,
  type MazeGrid,
} from './generator'

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

/** Walks the solution and asserts every step crosses an opening, not a wall. */
function pathIsWalkable(g: MazeGrid, path: { r: number; c: number }[]): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const dr = b.r - a.r
    const dc = b.c - a.c
    if (Math.abs(dr) + Math.abs(dc) !== 1) return false
    const dir = dr === -1 ? 0 : dr === 1 ? 2 : dc === 1 ? 1 : 3
    if (hasWall(g, a, dir)) return false
  }
  return true
}

describe('maze generator', () => {
  it('carves a perfect maze (one route between any two cells)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = carveMaze(12, 10, 0.5, createRng(seed))
      expect(isPerfectMaze(g)).toBe(true)
    }
  })

  it('keeps the outer border closed apart from the two openings', () => {
    const puzzle = buildMaze(14, 10, 'medium', createRng(9))
    const openTop = puzzle.hWalls[0]!.filter((w) => !w).length
    const openBottom = puzzle.hWalls[puzzle.rows]!.filter((w) => !w).length
    expect(openTop).toBe(1)
    expect(openBottom).toBe(1)
    expect(puzzle.vWalls.every((row) => row[0] === true)).toBe(true)
    expect(puzzle.vWalls.every((row) => row[puzzle.cols] === true)).toBe(true)
  })

  it('stays perfect after the entrance and exit are opened', () => {
    const puzzle = buildMaze(16, 12, 'hard', createRng(3))
    expect(isPerfectMaze(puzzle)).toBe(true)
  })

  it('solves start to finish through open corridors only', () => {
    for (const difficulty of DIFFICULTIES) {
      const puzzle = buildMaze(14, 11, difficulty, createRng(77))
      const first = puzzle.solution[0]!
      const last = puzzle.solution[puzzle.solution.length - 1]!
      expect(first).toEqual(puzzle.start)
      expect(last).toEqual(puzzle.finish)
      expect(pathIsWalkable(puzzle, puzzle.solution)).toBe(true)
    }
  })

  it('re-solving reproduces the same route (the solution is unique)', () => {
    const puzzle = buildMaze(15, 12, 'medium', createRng(21))
    expect(solveMaze(puzzle, puzzle.start, puzzle.finish)).toEqual(puzzle.solution)
  })

  it('is deterministic for a given seed', () => {
    const a = buildMaze(14, 10, 'medium', createRng(101))
    const b = buildMaze(14, 10, 'medium', createRng(101))
    expect(a).toEqual(b)
  })

  it('different seeds give different mazes', () => {
    const a = JSON.stringify(buildMaze(14, 10, 'medium', createRng(1)))
    const b = JSON.stringify(buildMaze(14, 10, 'medium', createRng(2)))
    expect(a).not.toEqual(b)
  })

  // Reachable path lengths shrink as the grid grows, so difficulty is ranked
  // within a batch of candidates — it has to order the same way at every size.
  it.each([
    [12, 8],
    [20, 14],
    [43, 26],
  ])('difficulty orders the solution length on %ix%i', (rows, cols) => {
    const ratio = (difficulty: (typeof DIFFICULTIES)[number]) => {
      let total = 0
      for (let seed = 1; seed <= 8; seed++) {
        const puzzle = buildMaze(rows, cols, difficulty, createRng(seed * 31))
        total += puzzle.solution.length / (puzzle.rows * puzzle.cols)
      }
      return total / 8
    }
    const easy = ratio('easy')
    const medium = ratio('medium')
    const hard = ratio('hard')
    expect(easy).toBeLessThan(medium)
    expect(medium).toBeLessThan(hard)
  })

  it('easy mazes have fewer dead ends than hard ones', () => {
    const deadEnds = (difficulty: (typeof DIFFICULTIES)[number]) => {
      let total = 0
      for (let seed = 1; seed <= 10; seed++) {
        total += countDeadEnds(buildMaze(20, 14, difficulty, createRng(seed * 17)))
      }
      return total / 10
    }
    expect(deadEnds('easy')).toBeLessThan(deadEnds('hard'))
  })

  it('handles the smallest and largest shipped grids', () => {
    for (const [rows, cols] of [
      [4, 4],
      [10, 12],
      [52, 26],
    ] as const) {
      const puzzle = buildMaze(rows, cols, 'hard', createRng(5))
      expect(isPerfectMaze(puzzle)).toBe(true)
      expect(pathIsWalkable(puzzle, puzzle.solution)).toBe(true)
    }
  })
})
