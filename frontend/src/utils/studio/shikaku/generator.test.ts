import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { randomPartition } from './partition'
import {
  clueCandidates,
  countShikakuSolutions,
  isShikakuForcedSolvable,
} from './solver'
import { buildShikakuPuzzle } from './generator'
import type { ShikakuDifficulty, ShikakuPuzzle, ShikakuRect } from './types'

function coverageOf(rows: number, cols: number, rects: ShikakuRect[]): number[] {
  const cover = new Array<number>(rows * cols).fill(0)
  for (const rect of rects) {
    for (let r = rect.r; r < rect.r + rect.h; r++) {
      for (let c = rect.c; c < rect.c + rect.w; c++) cover[r * cols + c]! += 1
    }
  }
  return cover
}

function expectValidTiling(rows: number, cols: number, rects: ShikakuRect[]): void {
  expect(coverageOf(rows, cols, rects).every((n) => n === 1)).toBe(true)
}

/** Every clue sits inside its own rectangle and nothing else's. */
function expectCluesMatchSolution(puzzle: ShikakuPuzzle): void {
  expect(puzzle.clues.length).toBe(puzzle.solution.length)
  puzzle.clues.forEach((clue, i) => {
    const rect = puzzle.solution[i]!
    expect(clue.value).toBe(rect.h * rect.w)
    expect(clue.r).toBeGreaterThanOrEqual(rect.r)
    expect(clue.r).toBeLessThan(rect.r + rect.h)
    expect(clue.c).toBeGreaterThanOrEqual(rect.c)
    expect(clue.c).toBeLessThan(rect.c + rect.w)
  })
  const cells = new Set(puzzle.clues.map((clue) => `${clue.r},${clue.c}`))
  expect(cells.size).toBe(puzzle.clues.length)
}

describe('shikaku partition', () => {
  it('tiles the grid exactly once, respecting the caps', () => {
    for (const seed of [1, 42, 777, 90210]) {
      const rects = randomPartition(10, 10, { maxArea: 9, maxSide: 5 }, createRng(seed))
      expect(rects).not.toBeNull()
      expectValidTiling(10, 10, rects!)
      for (const rect of rects!) {
        expect(rect.h * rect.w).toBeLessThanOrEqual(9)
        expect(Math.max(rect.h, rect.w)).toBeLessThanOrEqual(5)
      }
    }
  })

  it('handles non-square grids', () => {
    const rects = randomPartition(14, 10, { maxArea: 6, maxSide: 4 }, createRng(5))
    expectValidTiling(14, 10, rects!)
  })

  it('prefers blocks over singletons', () => {
    const rects = randomPartition(10, 10, { maxArea: 9, maxSide: 5 }, createRng(3))!
    const singles = rects.filter((r) => r.h * r.w === 1).length
    expect(singles / rects.length).toBeLessThan(0.35)
  })
})

describe('shikaku solver', () => {
  it('only offers rectangles of the clue area that swallow no other clue', () => {
    const clues = [
      { r: 0, c: 0, value: 2 },
      { r: 0, c: 1, value: 2 },
    ]
    const [first] = clueCandidates(2, 2, clues)
    // The 1×2 along the top would swallow the second clue, so only the column is left.
    expect(first).toEqual([{ r: 0, c: 0, h: 2, w: 1 }])
  })

  it('counts a hand-built ambiguous board as more than one solution', () => {
    // 2s on the diagonal: both lie flat, or both stand up. Two valid tilings.
    const solutions = countShikakuSolutions(2, 2, [
      { r: 0, c: 0, value: 2 },
      { r: 1, c: 1, value: 2 },
    ])
    expect(solutions).toBe(2)
  })

  it('rejects clue sets whose areas do not fill the grid', () => {
    expect(countShikakuSolutions(3, 3, [{ r: 0, c: 0, value: 4 }])).toBe(0)
  })

  it('solves an all-singleton board exactly once', () => {
    const clues = [0, 1, 2, 3].map((i) => ({ r: i >> 1, c: i & 1, value: 1 }))
    expect(countShikakuSolutions(2, 2, clues)).toBe(1)
    expect(isShikakuForcedSolvable(2, 2, clues)).toBe(true)
  })
})

describe('buildShikakuPuzzle', () => {
  const cases = [
    { rows: 6, cols: 6 },
    { rows: 8, cols: 8 },
    { rows: 10, cols: 10 },
    { rows: 12, cols: 12 },
    { rows: 14, cols: 10 },
  ] as const

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`builds a uniquely solvable ${difficulty} board at every size`, () => {
      for (const { rows, cols } of cases) {
        for (const seed of [42, 7]) {
          const puzzle = buildShikakuPuzzle(rows, cols, difficulty, createRng(seed))
          expectValidTiling(rows, cols, puzzle.solution)
          expectCluesMatchSolution(puzzle)
          expect(
            countShikakuSolutions(rows, cols, puzzle.clues),
            `${rows}×${cols} ${difficulty} seed ${seed}`,
          ).toBe(1)
        }
      }
    })
  }

  it('is deterministic for a seed', () => {
    const a = buildShikakuPuzzle(10, 10, 'medium', createRng(99))
    const b = buildShikakuPuzzle(10, 10, 'medium', createRng(99))
    expect(a).toEqual(b)
  })

  it('easy boards fall to forced deductions alone', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const puzzle = buildShikakuPuzzle(8, 8, 'easy', createRng(seed))
      expect(isShikakuForcedSolvable(8, 8, puzzle.clues), `seed ${seed}`).toBe(true)
    }
  })

  const meanArea = (rows: number, cols: number, difficulty: ShikakuDifficulty): number => {
    let blocks = 0
    for (let i = 0; i < 20; i++) {
      blocks += buildShikakuPuzzle(rows, cols, difficulty, createRng(1_000 + i * 7_919))
        .clues.length
    }
    return (rows * cols) / (blocks / 20)
  }

  it('keeps the tiers apart at every size', () => {
    for (const { rows, cols } of cases) {
      const easy = meanArea(rows, cols, 'easy')
      const medium = meanArea(rows, cols, 'medium')
      const hard = meanArea(rows, cols, 'hard')
      expect(medium, `${rows}×${cols}`).toBeGreaterThan(easy)
      expect(hard, `${rows}×${cols}`).toBeGreaterThan(medium)
    }
  })

  /**
   * Regression: block caps used to be fixed, so a 12×12 easy board — all 2s and
   * 3s — had so many valid tilings that ~1% of clue placements were unique. The
   * generator kept shrinking blocks looking for one and shipped a grid that was
   * 56% single squares: unique, technically easy, and unsellable.
   */
  it('never degenerates into a field of single squares', () => {
    for (const { rows, cols } of cases) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        let singles = 0
        let total = 0
        for (let i = 0; i < 20; i++) {
          const { clues } = buildShikakuPuzzle(rows, cols, difficulty, createRng(1_000 + i * 7_919))
          total += clues.length
          singles += clues.filter((clue) => clue.value === 1).length
        }
        const label = `${rows}×${cols} ${difficulty}`
        expect(singles / total, label).toBeLessThan(0.25)
        expect(meanArea(rows, cols, difficulty), label).toBeGreaterThanOrEqual(3)
      }
    }
  }, 30_000)
})
