import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import {
  interleavedCandidateStarts,
  meetsMix,
  mixTargets,
  preferredDiagonalFamily,
} from './mix'

const SE = { dr: 1, dc: 1, name: 'SE' }
const SW = { dr: 1, dc: -1, name: 'SW' }
const E = { dr: 0, dc: 1, name: 'E' }
const S = { dr: 1, dc: 0, name: 'S' }

describe('word-search mix', () => {
  it('splits the diagonal quota across both slash families', () => {
    const hard = mixTargets({
      wordCount: 20,
      hasDiagonal: true,
      allowReverse: true,
    })
    expect(hard.minDiagonal).toBe(6)
    expect(hard.minSlash).toBe(3)
    expect(hard.minBackslash).toBe(3)

    const medium = mixTargets({
      wordCount: 15,
      hasDiagonal: true,
      allowReverse: false,
    })
    expect(medium.minDiagonal).toBe(4)
    expect(medium.minSlash).toBe(2)
    expect(medium.minBackslash).toBe(2)
  })

  it('rejects a mix that only uses one diagonal slant', () => {
    const targets = mixTargets({
      wordCount: 20,
      hasDiagonal: true,
      allowReverse: true,
    })
    expect(
      meetsMix(
        { diagonal: 6, backwards: 5, slash: 0, backslash: 6 },
        targets,
      ),
    ).toBe(false)
    expect(
      meetsMix(
        { diagonal: 6, backwards: 5, slash: 3, backslash: 3 },
        targets,
      ),
    ).toBe(true)
  })

  it('prefers the missing slash family first, then backslash', () => {
    const targets = mixTargets({
      wordCount: 20,
      hasDiagonal: true,
      allowReverse: true,
    })
    const even = preferredDiagonalFamily({
      wordLength: 6,
      gridSize: 14,
      remaining: 10,
      targets,
      diagonalCount: 0,
      slashCount: 0,
      backslashCount: 0,
    })
    expect(even.preferFamily).toBe('slash')

    const afterSlash = preferredDiagonalFamily({
      wordLength: 6,
      gridSize: 14,
      remaining: 9,
      targets,
      diagonalCount: 1,
      slashCount: 1,
      backslashCount: 0,
    })
    expect(afterSlash.preferFamily).toBe('backslash')
  })

  it('tries slash starts before backslash when that family is preferred', () => {
    const rng = createRng(1)
    const starts = interleavedCandidateStarts(
      'GARDEN',
      12,
      [E, S, SE, SW],
      rng,
      true,
      'slash',
    )
    expect(starts[0]?.dir.name).toBe('SW')
    const firstBackslash = starts.findIndex((start) => start.dir.name === 'SE')
    const firstOrthogonal = starts.findIndex((start) => start.dir.name === 'E' || start.dir.name === 'S')
    expect(firstBackslash).toBeGreaterThan(0)
    expect(firstOrthogonal).toBeGreaterThan(firstBackslash)
  })
})
