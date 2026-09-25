import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MAX_MEANING_CHARS,
  MAX_PHRASE_CHARS,
  WL_BLOCKED_TERMS,
  WL_BRAND_TERMS,
  WL_LEVELS,
  WL_LIMITS,
  WL_QUALIFIER_WORDS,
} from './content'
import { wlRequestCount } from './prefetch'

/**
 * The browser re-runs the service's gates on purpose, so its word lists and
 * limits must be the service's own. This reads the data file the service
 * loads, so a list edited on one side only fails here instead of the two sides
 * quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/work-lingo-match/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  levels: Record<string, unknown>
}

describe('work-lingo-match lists mirror the service', () => {
  it.each([
    ['blockedTerms', WL_BLOCKED_TERMS],
    ['brandTerms', WL_BRAND_TERMS],
    ['qualifierWords', WL_QUALIFIER_WORDS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('keeps the page budgets inside the service limits', () => {
    for (const [key, value] of Object.entries(WL_LIMITS)) expect(value, key).toBe(config.limits[key])
    expect(MAX_PHRASE_CHARS).toBeLessThanOrEqual(config.limits.maxPhraseChars!)
    expect(MAX_MEANING_CHARS).toBeLessThanOrEqual(config.limits.maxMeaningChars!)
  })

  it('offers exactly the levels the service knows, and never asks for more than it returns', () => {
    expect(WL_LEVELS.map((level) => level.value).sort()).toEqual(Object.keys(config.levels).sort())
    for (const level of WL_LEVELS) {
      expect(wlRequestCount(level.maxPairs)).toBeLessThanOrEqual(config.limits.poolSize!)
    }
  })
})
