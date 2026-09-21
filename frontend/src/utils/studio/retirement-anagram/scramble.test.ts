import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  scrambleWord,
  sortLetters,
  buildAnagramIndexForTests,
  loadAnagramIndex,
} from './scramble'

const TEST_INDEX = buildAnagramIndexForTests([
  'LISTEN',
  'SILENT',
  'ENLIST',
  'GARDEN',
  'TIGER',
  'EAGLE',
])

describe('anagram scramble', () => {
  it('a scramble is a true permutation of the answer', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { scrambled } = scrambleWord('LISTEN', TEST_INDEX, createRng(seed))
      expect(sortLetters(scrambled)).toBe(sortLetters('LISTEN'))
    }
  })

  it('the scramble never equals the original word', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { scrambled } = scrambleWord('GARDEN', TEST_INDEX, createRng(seed))
      expect(scrambled).not.toBe('GARDEN')
    }
  })

  it('the ambiguity guard finds common alternates', () => {
    const { alternates } = scrambleWord('LISTEN', loadAnagramIndex(), createRng(1))
    expect(alternates).toContain('SILENT')
  })
})
