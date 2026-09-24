import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MAX_ANSWER_CHARS,
  MAX_SETUP_CHARS,
  RJ_ALIASES,
  RJ_BLOCKED_TERMS,
  RJ_BRAND_TERMS,
  RJ_LIMITS,
  RJ_QUALIFIER_WORDS,
  normalizeRjItem,
  normalizeSetup,
} from './content'

/**
 * The browser re-runs the service's gates on purpose, so its word lists and
 * limits must be the service's own. This reads the data file the service
 * loads, so a list edited on one side only fails here instead of the two sides
 * quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/riddles-and-jokes/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  example: Record<'riddle' | 'joke', { setup: string; answer: string }>
}

describe('riddles-and-jokes lists mirror the service', () => {
  it.each([
    ['blockedTerms', RJ_BLOCKED_TERMS],
    ['brandTerms', RJ_BRAND_TERMS],
    ['qualifierWords', RJ_QUALIFIER_WORDS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('folds the same synonyms', () => {
    expect(RJ_ALIASES).toEqual(config.aliases)
  })

  it('keeps the page budgets inside the service limits', () => {
    for (const [key, value] of Object.entries(RJ_LIMITS)) expect(value, key).toBe(config.limits[key])
    expect(MAX_SETUP_CHARS).toBeLessThanOrEqual(config.limits.maxSetupChars!)
    expect(MAX_ANSWER_CHARS).toBeLessThanOrEqual(config.limits.maxAnswerChars!)
  })

  it('never prints the prompt examples the service shows the writer', () => {
    for (const kind of ['riddle', 'joke'] as const) {
      const example = config.example[kind]
      // Well-formed on its own, so it is the example rule that refuses it.
      expect(normalizeSetup(example.setup)).toBe(example.setup)
      expect(normalizeRjItem({ kind, ...example, verified: true })).toBeNull()
    }
  })
})
