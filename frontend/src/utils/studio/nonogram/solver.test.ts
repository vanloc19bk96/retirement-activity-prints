import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { cluesFromBitmap, lineClue } from './clues'
import { emptyBitmap } from './bitmap-draw'
import {
  eachLinePlacement,
  enumerateLinePlacements,
  forcedLineCells,
  solveAndCount,
  solveForcedOnly,
  traceLineSolve,
} from './solver'
import type { Bitmap } from './types'

/** Reference implementation: intersect every placement, no early exit. */
function forcedByBruteForce(
  length: number,
  clue: number[],
  known: readonly (boolean | null)[],
): (boolean | null)[] | null {
  const placements = enumerateLinePlacements(length, clue, known)
  if (placements.length === 0) return null
  return Array.from({ length }, (_, i) => {
    if (known[i] !== null) return known[i]!
    const first = placements[0]![i]!
    return placements.every((p) => p[i] === first) ? first : null
  })
}

function randomBitmap(size: number, seed: number): Bitmap {
  const rng = createRng(seed)
  const bitmap = emptyBitmap(size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) bitmap[r]![c] = rng.chance(0.5)
  }
  return bitmap
}

describe('line placement enumeration', () => {
  it('emits only placements that reproduce the clue', () => {
    const rng = createRng(11)
    for (let trial = 0; trial < 200; trial++) {
      const length = rng.int(1, 9)
      const line = Array.from({ length }, () => rng.chance(0.5))
      const clue = lineClue(line)
      const placements = enumerateLinePlacements(length, clue)
      expect(placements.length).toBeGreaterThan(0)
      for (const placement of placements) {
        expect(lineClue(placement)).toEqual(clue)
      }
      // The line it came from must be one of them.
      expect(placements.some((p) => p.every((v, i) => v === line[i]))).toBe(true)
    }
  })

  it('respects known cells', () => {
    const known = [true, null, null, false, null]
    for (const placement of enumerateLinePlacements(5, [2, 1], known)) {
      expect(placement[0]).toBe(true)
      expect(placement[3]).toBe(false)
    }
  })

  it('stops early when the visitor returns false', () => {
    let seen = 0
    eachLinePlacement(10, [1], Array.from({ length: 10 }, () => null), () => {
      seen++
      return seen < 3
    })
    expect(seen).toBe(3)
  })

  it('treats clue [0] as an empty line', () => {
    expect(enumerateLinePlacements(4, [0])).toEqual([[false, false, false, false]])
  })
})

describe('forcedLineCells', () => {
  it('matches a full intersection of every placement', () => {
    const rng = createRng(23)
    for (let trial = 0; trial < 400; trial++) {
      const length = rng.int(3, 10)
      const line = Array.from({ length }, () => rng.chance(0.5))
      const clue = lineClue(line)
      const known = Array.from({ length }, (_, i) =>
        rng.chance(0.25) ? line[i]! : null,
      )
      expect(forcedLineCells(length, clue, known)).toEqual(
        forcedByBruteForce(length, clue, known),
      )
    }
  })

  it('reports a contradiction as null', () => {
    expect(forcedLineCells(3, [3], [false, null, null])).toBeNull()
  })

  it('fills a line the clue determines completely', () => {
    expect(forcedLineCells(3, [3], [null, null, null])).toEqual([true, true, true])
  })
})

describe('traceLineSolve', () => {
  it('agrees with the counting solver about uniqueness', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const bitmap = randomBitmap(6, seed)
      const { rowClues, colClues } = cluesFromBitmap(bitmap)
      const trace = traceLineSolve(rowClues, colClues, 6)
      const { count, forcedOnly } = solveAndCount(rowClues, colClues, 6, 2)
      expect(trace.solved).toBe(forcedOnly)
      // Line logic completing the grid is proof of a single solution.
      if (trace.solved) expect(count).toBe(1)
    }
  })

  it('recovers the original grid when it solves', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const bitmap = randomBitmap(6, seed)
      const { rowClues, colClues } = cluesFromBitmap(bitmap)
      if (!traceLineSolve(rowClues, colClues, 6).solved) continue
      expect(solveForcedOnly(rowClues, colClues, 6)).toEqual(bitmap)
    }
  })

  it('counts at least one round and a non-negative opening', () => {
    const bitmap = randomBitmap(5, 3)
    const { rowClues, colClues } = cluesFromBitmap(bitmap)
    const trace = traceLineSolve(rowClues, colClues, 5)
    expect(trace.rounds).toBeGreaterThanOrEqual(1)
    expect(trace.openingCells).toBeGreaterThanOrEqual(0)
    expect(trace.openingCells).toBeLessThanOrEqual(25)
  })
})
