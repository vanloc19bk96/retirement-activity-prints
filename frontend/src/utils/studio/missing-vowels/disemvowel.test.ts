import { describe, it, expect } from 'vitest'
import {
  disemvowel,
  consonantsMatch,
  skeletonAlternates,
  buildSkeletonIndexForTests,
  promptWithBlanks,
} from './disemvowel'

describe('disemvowel', () => {
  it('removes exactly the vowels, keeps consonants and spaces', () => {
    expect(disemvowel('THE QUICK', false)).toBe('TH QCK')
    expect(disemvowel('ELEPHANT', false)).toBe('LPHNT')
    expect(disemvowel('RHYTHM', false)).toBe('RHYTHM')
    expect(disemvowel('RHYTHM', true)).toBe('RHTHM')
  })

  it('promptWithBlanks keeps consonants and puts __ in vowel slots', () => {
    expect(promptWithBlanks('DOLPHIN', false)).toBe('D __ L P H __ N')
    expect(promptWithBlanks('ELEPHANT', false)).toBe('__ L __ P H __ N T')
    expect(promptWithBlanks('RHYTHM', false)).toBe('R H Y T H M')
    expect(promptWithBlanks('RHYTHM', true)).toBe('R H __ T H M')
  })

  it('restoring the answer over the skeleton is consistent', () => {
    for (const word of ['GARDEN', 'ELEPHANT', 'MOUNTAIN']) {
      const sk = disemvowel(word, false)
      expect(consonantsMatch(word, sk)).toBe(true)
    }
  })

  it('word gaps are preserved for phrases', () => {
    const sk = disemvowel('THE EARLY BIRD', false)
    expect(sk.split(' ').length).toBe(3)
    // Phrases stay dense (no per-letter gaps) so long sayings remain legible.
    expect(promptWithBlanks('THE EARLY BIRD', false)).toBe('TH__   ____RLY   B__RD')
  })

  it('skeletonAlternates finds co-skeleton words', () => {
    const index = buildSkeletonIndexForTests(
      ['CAT', 'COT', 'CUT', 'DOG', 'TIGER'],
      false,
    )
    const alts = skeletonAlternates('CAT', false, index)
    expect(alts).toEqual(expect.arrayContaining(['COT', 'CUT']))
    expect(alts).not.toContain('CAT')
  })
})
