import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildMaze,
  carveMaze,
  countDeadEnds,
  countTurns,
  hasWall,
  isPerfectMaze,
  solveMaze,
  type MazeCell,
  type MazeGrid,
  type MazePuzzle,
} from './generator'
import { MAZE_LEVELS } from './levels'

/** Walks the solution and asserts every step crosses an opening, not a wall. */
function pathIsWalkable(g: MazeGrid, path: readonly MazeCell[]): boolean {
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

const maze = (seed: number, levelIndex = 1, rows = 16, cols = 14): MazePuzzle =>
  buildMaze({
    rows,
    cols,
    profile: MAZE_LEVELS[levelIndex]!.profile,
    rng: createRng(seed),
  })

describe('maze carving', () => {
  it('carves a perfect maze — one route between any two cells', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(isPerfectMaze(carveMaze(12, 10, 0.5, createRng(seed)))).toBe(true)
    }
  })

  it('stays perfect at every straightness a level asks for', () => {
    for (const level of MAZE_LEVELS) {
      const g = carveMaze(14, 12, level.profile.straightness, createRng(7))
      expect(isPerfectMaze(g), level.id).toBe(true)
    }
  })

  it('finds the one path between two cells, and it is walkable', () => {
    const g = carveMaze(12, 10, 0.5, createRng(3))
    const path = solveMaze(g, { r: 0, c: 0 }, { r: 11, c: 9 })
    expect(path.length).toBeGreaterThan(0)
    expect(path[0]).toEqual({ r: 0, c: 0 })
    expect(path[path.length - 1]).toEqual({ r: 11, c: 9 })
    expect(pathIsWalkable(g, path)).toBe(true)
    // A tree has no second route, so no cell can be visited twice.
    expect(new Set(path.map((cell) => `${cell.r},${cell.c}`)).size).toBe(path.length)
  })
})

describe('maze puzzles', () => {
  it('is the same maze every time for one seed', () => {
    expect(maze(2024)).toEqual(maze(2024))
  })

  it('keeps exactly one way through, at every level', () => {
    for (const [index, level] of MAZE_LEVELS.entries()) {
      for (let seed = 1; seed <= 8; seed++) {
        const puzzle = maze(seed * 31, index)
        expect(isPerfectMaze(puzzle), level.id).toBe(true)
        expect(pathIsWalkable(puzzle, puzzle.solution), level.id).toBe(true)
        expect(puzzle.solution[0]).toEqual(puzzle.start)
        expect(puzzle.solution[puzzle.solution.length - 1]).toEqual(puzzle.finish)
      }
    }
  })

  it('opens the border once at the top and once at the bottom, nowhere else', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const puzzle = maze(seed)
      expect(puzzle.hWalls[0]!.filter((wall) => !wall)).toHaveLength(1)
      expect(puzzle.hWalls[puzzle.rows]!.filter((wall) => !wall)).toHaveLength(1)
      for (let r = 0; r < puzzle.rows; r++) {
        expect(puzzle.vWalls[r]![0]).toBe(true)
        expect(puzzle.vWalls[r]![puzzle.cols]).toBe(true)
      }
    }
  })

  it('sets the two openings a third of the width apart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const puzzle = maze(seed)
      expect(Math.abs(puzzle.start.c - puzzle.finish.c)).toBeGreaterThanOrEqual(
        Math.floor(puzzle.cols / 3),
      )
    }
  })

  it('moves the openings around, so a book does not open at the same spot twice', () => {
    const pairs = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) {
      const puzzle = maze(seed)
      pairs.add(`${puzzle.start.c}-${puzzle.finish.c}`)
    }
    expect(pairs.size).toBeGreaterThan(10)
  })

  it('never prints a route a reader could solve by looking at it', () => {
    for (const [index] of MAZE_LEVELS.entries()) {
      for (let seed = 1; seed <= 10; seed++) {
        const puzzle = maze(seed * 17, index)
        // A straight drop plus the sideways travel the openings force is the
        // shortest route the grid can physically hold.
        const shortest = puzzle.rows + Math.floor(puzzle.cols / 3)
        expect(puzzle.solution.length).toBeGreaterThan(shortest)
      }
    }
  })

  it('reaches the route length each level aims for', () => {
    for (const [index, level] of MAZE_LEVELS.entries()) {
      for (let seed = 1; seed <= 6; seed++) {
        const puzzle = maze(seed * 13, index, 20, 16)
        expect(
          puzzle.solution.length,
          `${level.id} seed ${seed}`,
        ).toBeGreaterThanOrEqual(level.profile.minRouteFactor * (puzzle.rows + puzzle.cols))
      }
    }
  })

  it('gets longer and busier as the level goes up', () => {
    const measure = (index: number) => {
      let route = 0
      let deadEnds = 0
      for (let seed = 1; seed <= 12; seed++) {
        const puzzle = maze(seed * 7, index, 20, 16)
        route += puzzle.solution.length
        deadEnds += puzzle.deadEnds
      }
      return { route, deadEnds }
    }
    const gentle = measure(0)
    const classic = measure(1)
    const challenging = measure(2)

    expect(gentle.route).toBeLessThan(classic.route)
    expect(classic.route).toBeLessThan(challenging.route)
    // Fewer places to go wrong is what "gentle" means to a solver.
    expect(gentle.deadEnds).toBeLessThan(challenging.deadEnds)
  })

  it('carries straight on more often at the gentler levels', () => {
    const turnShare = (index: number) => {
      let turns = 0
      let steps = 0
      for (let seed = 1; seed <= 12; seed++) {
        const puzzle = maze(seed * 5, index, 20, 16)
        turns += countTurns(puzzle.solution)
        steps += puzzle.solution.length
      }
      return turns / steps
    }
    expect(turnShare(0)).toBeLessThan(turnShare(2))
  })

  it('counts a dead end as a cell with one way out', () => {
    const g = carveMaze(8, 8, 0.5, createRng(11))
    const dead = countDeadEnds(g)
    expect(dead).toBeGreaterThan(0)
    expect(dead).toBeLessThan(8 * 8)
  })

  it('counts a straight run as one corner, not many', () => {
    expect(
      countTurns([
        { r: 0, c: 0 },
        { r: 1, c: 0 },
        { r: 2, c: 0 },
        { r: 3, c: 0 },
        { r: 3, c: 1 },
        { r: 3, c: 2 },
      ]),
    ).toBe(1)
  })
})
