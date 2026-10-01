import { beforeEach, describe, expect, it } from 'vitest'
import {
  STUDIO_AVOID_LIMIT,
  STUDIO_MEMORY_MAX_PER_KEY,
  clearStudioRecentContent,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from './studio-variety'

beforeEach(() => {
  clearStudioRecentContent()
})

describe('studioVarietyKey', () => {
  it('buckets by template and the fields that decide the content', () => {
    expect(studioVarietyKey('crossword', 'Kitchen', 'easy')).toBe(
      'crossword|kitchen|easy',
    )
  })

  it('drops empty parts instead of leaving gaps in the key', () => {
    expect(studioVarietyKey('crossword', '', undefined, 'easy')).toBe('crossword|easy')
    expect(studioVarietyKey('word-search')).toBe('word-search|default')
  })
})

describe('rememberStudioContent', () => {
  it('returns nothing for a key that has never generated', () => {
    expect(studioAvoidList(studioVarietyKey('word-search', 'picnic'))).toEqual([])
  })

  it('hands back what was printed, newest first', () => {
    const key = studioVarietyKey('word-search', 'picnic')
    rememberStudioContent(key, ['Milk', 'Bread'])
    rememberStudioContent(key, ['Apples'])
    expect(studioAvoidList(key)).toEqual(['Apples', 'Bread', 'Milk'])
  })

  it('keeps buckets apart so one theme does not starve another', () => {
    const picnic = studioVarietyKey('word-search', 'picnic')
    const camping = studioVarietyKey('word-search', 'camping')
    rememberStudioContent(picnic, ['Milk'])
    expect(studioAvoidList(camping)).toEqual([])
  })

  it('treats the same label in another case as already known', () => {
    const key = studioVarietyKey('word-search', 'picnic')
    rememberStudioContent(key, ['Milk', 'milk', '  MILK '])
    expect(studioAvoidList(key)).toEqual(['Milk'])
  })

  it('trims surrounding punctuation and collapsed whitespace', () => {
    const key = studioVarietyKey('word-search', 'picnic')
    rememberStudioContent(key, ['  Whole   milk , ', '', '   '])
    expect(studioAvoidList(key)).toEqual(['Whole milk'])
  })

  it('caps what one request sends', () => {
    const key = studioVarietyKey('word-search', 'kitchen')
    rememberStudioContent(
      key,
      Array.from({ length: STUDIO_AVOID_LIMIT + 20 }, (_, i) => `Word ${i}`),
    )
    const avoid = studioAvoidList(key)
    expect(avoid).toHaveLength(STUDIO_AVOID_LIMIT)
    // Newest first: the words from the sheet just printed.
    expect(avoid[0]).toBe(`Word ${STUDIO_AVOID_LIMIT + 19}`)
  })

  it('keeps a theme in active use when older buckets are evicted', () => {
    const favourite = studioVarietyKey('word-search', 'garden')
    rememberStudioContent(favourite, ['Rose'])
    for (let i = 0; i < 199; i++) {
      rememberStudioContent(studioVarietyKey('word-search', `theme ${i}`), ['Word'])
    }
    // Printing the favourite again makes it the newest bucket, not the oldest.
    rememberStudioContent(favourite, ['Tulip'])
    rememberStudioContent(studioVarietyKey('word-search', 'one more'), ['Word'])
    expect(studioAvoidList(favourite)).toEqual(['Tulip', 'Rose'])
    expect(studioAvoidList(studioVarietyKey('word-search', 'theme 0'))).toEqual([])
  })

  it('moves a label printed again to the newest end, keeping its first spelling', () => {
    const key = studioVarietyKey('office-relics', 'objects')
    rememberStudioContent(key, ['Typewriter', 'Safe', 'Fan'])
    rememberStudioContent(key, ['typewriter'])
    expect(studioAvoidList(key)).toEqual(['Typewriter', 'Fan', 'Safe'])
    // A window of the newest labels follows what was printed lately, even for a fixed catalog.
    expect(studioAvoidList(key, 1)).toEqual(['Typewriter'])
  })

  it('keeps a larger bucket when asked, up to the ceiling, and never trims it back', () => {
    const key = studioVarietyKey('office-relics', 'art')
    const labels = (from: number, n: number) => Array.from({ length: n }, (_, i) => `Pic ${from + i}`)
    rememberStudioContent(key, labels(0, 600), { keep: 600 })
    expect(studioAvoidList(key, 5000)).toHaveLength(600)
    // A caller with no `keep` does not shrink a bucket another kept larger.
    rememberStudioContent(key, labels(600, 1))
    expect(studioAvoidList(key, 5000)).toHaveLength(600)
    rememberStudioContent(key, labels(1000, 5000), { keep: 5000 })
    expect(studioAvoidList(key, 5000)).toHaveLength(STUDIO_MEMORY_MAX_PER_KEY)
  })

  it('honours a caller-supplied limit', () => {
    const key = studioVarietyKey('word-search', 'kitchen')
    rememberStudioContent(key, ['A', 'B', 'C'])
    expect(studioAvoidList(key, 2)).toEqual(['C', 'B'])
  })
})
