import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  scrambleWord,
  sortLetters,
  buildAnagramIndexForTests,
  loadAnagramIndex,
} from './scramble'
import { resolveWords, sampleUniqueWords, themeSelectOptions } from './words'
import { listThemeMeta, loadThemeWords } from '../word-search/wordlists'
import { FAMILIAR_ANIMAL_SET } from './familiar-animals'

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

  it('theme sampling prefers unique letter-sets when possible', () => {
    const words = resolveWords(
      {
        source: 'theme',
        theme: 'animals',
        itemCount: 10,
        difficulty: 'medium',
      },
      10,
      createRng(1),
    )
    expect(words.length).toBe(10)
    expect(new Set(words.map((w) => w.word)).size).toBe(10)
  })

  it('exposes every shared wordlist theme in the config', () => {
    const options = themeSelectOptions()
    const meta = listThemeMeta()
    expect(options.length).toBe(meta.length)
    expect(options.map((o) => o.value).toSorted()).toEqual(
      meta.map((m) => m.key).toSorted(),
    )
  })

  it('every bundled theme has a large unique pool for medium length', () => {
    for (const entry of listThemeMeta()) {
      expect(loadThemeWords(entry.key).length).toBeGreaterThanOrEqual(150)
      const words = resolveWords(
        {
          source: 'theme',
          theme: entry.key,
          itemCount: 24,
          difficulty: 'medium',
        },
        24,
        createRng(42),
      )
      expect(words.length, entry.key).toBe(24)
    }
  })

  it('animals theme prefers familiar everyday names', () => {
    const words = resolveWords(
      {
        source: 'theme',
        theme: 'animals',
        itemCount: 12,
        difficulty: 'medium',
      },
      12,
      createRng(42),
    )
    expect(words.length).toBe(12)
    const familiarCount = words.filter((w) => FAMILIAR_ANIMAL_SET.has(w.word)).length
    expect(familiarCount).toBeGreaterThanOrEqual(10)
    expect(words.map((w) => w.word)).not.toContain('GERMAIN')
    expect(words.map((w) => w.word)).not.toContain('SILVER')
    expect(words.map((w) => w.word)).not.toContain('DINMONT')
  })

  it('sampleUniqueWords fills from ambiguous pool when needed', () => {
    const pool = ['LISTEN', 'SILENT', 'TIGER', 'EAGLE', 'LION', 'BEAR']
    const picked = sampleUniqueWords(pool, 4, createRng(3))
    expect(picked.length).toBe(4)
  })
})
