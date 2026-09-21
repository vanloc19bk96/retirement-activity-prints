import { describe, it, expect } from 'vitest'
import { NUMERIC_FAMILIES, isForced, solveMasked } from './families'

function nextOf(shown: number[]): number | null {
  return solveMasked([...shown, null], shown.length).value
}

function fitsOf(shown: number[]): string[] {
  return solveMasked([...shown, null], shown.length).fits
}

describe('pattern families', () => {
  it('continues the classic sequences', () => {
    expect(nextOf([2, 4, 6, 8])).toBe(10)
    expect(nextOf([30, 25, 20, 15])).toBe(10)
    expect(nextOf([2, 4, 8, 16])).toBe(32)
    expect(nextOf([80, 40, 20, 10])).toBe(5)
    expect(nextOf([1, 4, 9, 16])).toBe(25)
    expect(nextOf([1, 3, 6, 10, 15])).toBe(21)
    expect(nextOf([1, 8, 27, 64, 125])).toBe(216)
    expect(nextOf([2, 3, 5, 8, 13])).toBe(21)
    expect(nextOf([3, 7, 15, 31])).toBe(63)
    expect(nextOf([1, 2, 6, 24])).toBe(120)
    expect(nextOf([2, 3, 5, 7, 11])).toBe(13)
    expect(nextOf([1, 10, 3, 12, 5, 14])).toBe(7)
    expect(nextOf([3, 6, 9, 18, 21, 42])).toBe(45)
  })

  /**
   * Regression: "two interleaved series" matched any 4-term sequence, because
   * two points always sit on a line. That competing match silently rejected
   * every geometric, Fibonacci and square puzzle before it reached paper.
   */
  it('needs real evidence before a family competes', () => {
    expect(fitsOf([2, 4, 8, 16])).not.toContain('interleavedLinear')
    expect(fitsOf([2, 4, 8, 16])).toContain('affine')
    expect(fitsOf([1, 4, 9, 16])).toEqual(['polynomial2'])
    // A cubic through four points fits anything, so it must wait for a fifth.
    expect(fitsOf([1, 8, 27, 64])).not.toContain('polynomial3')
  })

  it('reports no answer when the shown terms allow more than one', () => {
    // Four terms of n³ are not pinned down by any simple rule.
    expect(nextOf([1, 8, 27, 64])).toBeNull()
    // Two terms pin nothing.
    expect(nextOf([4, 8])).toBeNull()
  })

  it('agrees between overlapping families', () => {
    // Linear runs are fit by the linear, quadratic, cubic and affine families;
    // all four must land on the same continuation.
    const fits = fitsOf([5, 10, 15, 20, 25])
    expect(fits.length).toBeGreaterThanOrEqual(3)
    expect(nextOf([5, 10, 15, 20, 25])).toBe(30)
  })

  it('solves an interior blank the same way as an end blank', () => {
    expect(solveMasked([3, 6, null, 12, 15], 2).value).toBe(9)
    expect(solveMasked([1, null, 9, 16, 25], 1).value).toBe(4)
    expect(solveMasked([2, 4, null, 16, 32], 2).value).toBe(8)
    expect(isForced([3, 6, 9, 12, 15], 2)).toBe(true)
  })

  it('every family declares an anti-overfit minimum', () => {
    for (const family of NUMERIC_FAMILIES) {
      expect(family.minKnown, family.id).toBeGreaterThanOrEqual(3)
      // Two known terms are never enough for any family here.
      expect(family.fit([1, null, 3]), family.id).toBeNull()
    }
  })
})
