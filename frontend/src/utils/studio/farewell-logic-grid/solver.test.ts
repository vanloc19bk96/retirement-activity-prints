import { describe, it, expect } from 'vitest'
import { LG_LEVELS, lgRequirements } from './levels'
import { buildLgPuzzle, validateLgPuzzle } from './puzzle'
import {
  clueHolds,
  countSolutions,
  solveByDeduction,
  type LgClue,
  type LgShape,
  type LgSolution,
} from './solver'

function permutations(n: number): number[][] {
  if (n === 1) return [[0]]
  return permutations(n - 1).flatMap((p) =>
    Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]),
  )
}

/** Every complete answer, checked clue by clue — shares no code with the solver's search. */
function bruteForceCount(clues: readonly LgClue[], shape: LgShape): number {
  const perms = permutations(shape.n)
  const people = Array.from({ length: shape.n }, (_, p) => p)
  let count = 0
  const walk = (solution: LgSolution) => {
    if (solution.length === shape.K + 1) {
      if (clues.every((c) => clueHolds(c, solution))) count++
      return
    }
    for (const perm of perms) walk([...solution, perm])
  }
  walk([people])
  return count
}

describe('farewell-logic-grid solver', () => {
  it('counts one answer exactly when brute force does (four people)', () => {
    for (const level of LG_LEVELS) {
      for (const shape of level.shapes.filter((s) => s.n === 4)) {
        for (let i = 0; i < 6; i++) {
          const puzzle = buildLgPuzzle({ level, shape, seed: 500 + i * 104_729 })
          expect(puzzle).not.toBeNull()
          expect(bruteForceCount(puzzle!.clues, shape)).toBe(1)
          // Remove a clue and the brute force must agree with the solver's count.
          const fewer = puzzle!.clues.slice(1)
          expect(Math.min(2, bruteForceCount(fewer, shape))).toBe(countSolutions(fewer, shape))
        }
      }
    }
  }, 120_000)

  it('builds only puzzles a reader finishes by deduction, with every clue needed', () => {
    for (const level of LG_LEVELS) {
      for (const shape of level.shapes) {
        for (let i = 0; i < 12; i++) {
          const puzzle = buildLgPuzzle({ level, shape, seed: 9_000 + i * 7_919 })
          expect(puzzle).not.toBeNull()
          const p = puzzle!
          expect(validateLgPuzzle(p, level)).toEqual([])
          expect(solveByDeduction(p.clues, shape).solved).toBe(true)
          expect(countSolutions(p.clues, shape)).toBe(1)
          expect(p.clues.every((c) => clueHolds(c, p.solution))).toBe(true)
          // Minimal: dropping any one clue leaves the reader stuck.
          p.clues.forEach((_, drop) => {
            expect(solveByDeduction(p.clues.filter((__, j) => j !== drop), shape).solved).toBe(false)
          })
          const needs = lgRequirements(level, shape)
          expect(new Set(p.clues.map((c) => c.kind)).size).toBeGreaterThanOrEqual(needs.minKinds)
          expect(p.rounds).toBeGreaterThanOrEqual(needs.minRounds)
        }
      }
    }
  }, 120_000)

  it('rejects a clue set with two answers and one with none', () => {
    const shape: LgShape = { n: 4, K: 2 }
    const ambiguous: LgClue[] = [{ kind: 'same', a: { g: 0, v: 0 }, b: { g: 1, v: 0 } }]
    expect(countSolutions(ambiguous, shape)).toBe(2)
    expect(solveByDeduction(ambiguous, shape).solved).toBe(false)
    const contradictory: LgClue[] = [
      { kind: 'same', a: { g: 0, v: 0 }, b: { g: 1, v: 0 } },
      { kind: 'diff', a: { g: 0, v: 0 }, b: { g: 1, v: 0 } },
    ]
    expect(countSolutions(contradictory, shape)).toBe(0)
  })

  it('reads either/or, pairs and exact order the way the sentences say', () => {
    const solution: LgSolution = [
      [0, 1, 2, 3],
      [2, 0, 3, 1],
      [0, 1, 2, 3],
    ]
    const holds = (clue: LgClue) => clueHolds(clue, solution)
    // Person 0 holds value 2 of group 1.
    expect(holds({ kind: 'either', a: { g: 0, v: 0 }, b: { g: 1, v: 2 }, c: { g: 1, v: 3 } })).toBe(true)
    expect(holds({ kind: 'either', a: { g: 0, v: 0 }, b: { g: 1, v: 1 }, c: { g: 1, v: 3 } })).toBe(false)
    expect(holds({ kind: 'pair', a: { g: 0, v: 0 }, b: { g: 0, v: 1 }, c: { g: 1, v: 0 }, d: { g: 1, v: 2 } })).toBe(true)
    expect(holds({ kind: 'pair', a: { g: 0, v: 0 }, b: { g: 0, v: 1 }, c: { g: 1, v: 0 }, d: { g: 1, v: 3 } })).toBe(false)
    // Group 2 is the order: person 1 (value 1) is two places before person 3 (value 3).
    const order = { kind: 'order', a: { g: 0, v: 1 }, b: { g: 0, v: 3 }, k: 2, flip: false } as const
    expect(holds({ ...order, gap: 2 })).toBe(true)
    expect(holds({ ...order, gap: 1 })).toBe(false)
    expect(holds({ ...order, gap: 0 })).toBe(true)
    expect(holds({ ...order, a: order.b, b: order.a, gap: 0 })).toBe(false)
  })
})
