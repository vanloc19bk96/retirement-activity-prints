import { beforeEach, describe, expect, it } from 'vitest'
import {
  STUDIO_AVOID_LIMIT,
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

  it('honours a caller-supplied limit', () => {
    const key = studioVarietyKey('word-search', 'kitchen')
    rememberStudioContent(key, ['A', 'B', 'C'])
    expect(studioAvoidList(key, 2)).toEqual(['C', 'B'])
  })
})
