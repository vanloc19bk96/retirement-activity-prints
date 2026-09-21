import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import {
  buildCrossword,
  maxGridForPlaceCount,
  numberEntries,
  readEntry,
  allCrossingsConsistent,
  whiteConnected,
  numberingValid,
  type CrosswordPair,
} from './construct'
import { resolveWordsAndClues } from './words'

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

describe('crossword construction', () => {
  it('every placed entry reads its intended word', () => {
    let builtCount = 0
    for (let seed = 1; seed <= 100; seed++) {
      const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(seed))
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
      const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(seed))
      if (!b) continue
      expect(allCrossingsConsistent(b.grid, b.entries)).toBe(true)
    }
  })

  it('the white region is connected', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(seed))
      if (!b) continue
      expect(whiteConnected(b.grid, b.size)).toBe(true)
    }
  })

  it('numbering is correct and every entry has a clue', () => {
    const b = buildCrossword(SAMPLE_PAIRS, 15, createRng(1))
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

  it('scales max grid with place count', () => {
    expect(maxGridForPlaceCount(14)).toBe(15)
    expect(maxGridForPlaceCount(16)).toBe(17)
    expect(maxGridForPlaceCount(20)).toBe(19)
    expect(maxGridForPlaceCount(24)).toBe(21)
  })

  it('hits placeCount 15 on a scaled hard-theme pack', () => {
    const config = {
      theme: 'animals',
      wordCount: 15,
      difficulty: 'hard',
      source: 'theme',
    }
    for (let seed = 1; seed <= 8; seed++) {
      const pairs = resolveWordsAndClues(config, createRng(seed))
      const b = buildCrossword(
        pairs,
        maxGridForPlaceCount(15),
        createRng(seed ^ 0x9e3779b9),
        15,
      )
      expect(b, `seed ${seed}`).not.toBeNull()
      expect(b!.entries.length).toBe(15)
    }
  }, 60_000)
})
