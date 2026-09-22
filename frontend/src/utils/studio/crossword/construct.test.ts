import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildCrossword,
  numberEntries,
  readEntry,
  allCrossingsConsistent,
  whiteConnected,
  numberingValid,
  type CrosswordPair,
} from './construct'
import { GRID_MAX_SIDE } from './layout'
import { FIXTURE_PAIRS } from './fixture'

const SAMPLE_PAIRS: CrosswordPair[] = [
  { word: 'TIGER', clue: 'Big striped cat' },
  { word: 'EAGLE', clue: 'Bird of prey' },
  { word: 'HORSE', clue: 'Farm animal you ride' },
  { word: 'SNAKE', clue: 'Legsless reptile' },
  { word: 'WHALE', clue: 'Huge ocean mammal' },
  { word: 'MOUSE', clue: 'Tiny rodent' },
  { word: 'SHEEP', clue: 'Woolly farm animal' },
  { word: 'GOOSE', clue: 'Honking waterbird' },
  { word: 'BEAR', clue: 'Large forest mammal' },
  { word: 'DEER', clue: 'Antlered woodland animal' },
  { word: 'FROG', clue: 'Jumping amphibian' },
  { word: 'LION', clue: 'King of the jungle' },
  { word: 'WOLF', clue: 'Wild dog relative' },
  { word: 'CRAB', clue: 'Sideways-walking shellfish' },
]

/**
 * What a page actually asks for: ten answers out of a larger pool, so the
 * packer has substitutes. Asking for all fourteen is a request the app never
 * makes and exhausts the backtracker on the seeds where it cannot be met.
 */
const PLACE_COUNT = 10

describe('crossword construction', () => {
  it('every placed entry reads its intended word', () => {
    let builtCount = 0
    for (let seed = 1; seed <= 100; seed++) {
      const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(seed), PLACE_COUNT)
      if (!b) continue
      builtCount += 1
      for (const e of b.entries) {
        expect(readEntry(b.grid, e)).toBe(e.word)
      }
    }
    expect(builtCount).toBeGreaterThan(40)
  })

  it('crossings are letter-consistent', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(seed), PLACE_COUNT)
      if (!b) continue
      expect(allCrossingsConsistent(b.grid, b.entries)).toBe(true)
    }
  })

  it('the white region is connected', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(seed), PLACE_COUNT)
      if (!b) continue
      expect(whiteConnected(b.grid, b.size)).toBe(true)
    }
  })

  it('numbering is correct and every entry has a clue', () => {
    const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(1), PLACE_COUNT)
    expect(b).not.toBeNull()
    const entries = numberEntries(b!.entries, b!.grid, b!.size)
    expect(numberingValid(entries, b!.grid)).toBe(true)
    expect(entries.every((e) => e.clue && e.clue.length > 0)).toBe(true)
    expect(entries.some((e) => e.dir === 'across')).toBe(true)
    expect(entries.some((e) => e.dir === 'down')).toBe(true)
  })

  it('places every word in a 9-word list', () => {
    const pairs = SAMPLE_PAIRS.slice(0, 9)
    for (let seed = 1; seed <= 20; seed++) {
      const b = buildCrossword(pairs, 15, createRng(seed), 9)
      expect(b, `seed ${seed}`).not.toBeNull()
      expect(b!.entries.length).toBe(9)
    }
  })

  it('packs a full retirement grid inside the layout ceiling', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const built = buildCrossword(
        FIXTURE_PAIRS,
        GRID_MAX_SIDE,
        createRng(seed ^ 0x9e3779b9),
        12,
      )
      expect(built, `seed ${seed}`).not.toBeNull()
      expect(built!.size).toBeLessThanOrEqual(GRID_MAX_SIDE)
      expect(built!.entries.length).toBeGreaterThanOrEqual(11)
      const numbered = numberEntries(built!.entries, built!.grid, built!.size)
      expect(numberingValid(numbered, built!.grid)).toBe(true)
    }
  }, 60_000)
})
