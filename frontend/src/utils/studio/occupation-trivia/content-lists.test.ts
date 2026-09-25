import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MAX_CHOICE_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_QUESTION_CHARS,
  OT_ABSOLUTE_TERMS,
  OT_ALIASES,
  OT_BAD_CHOICE_TERMS,
  OT_BLOCKED_TERMS,
  OT_BRAND_TERMS,
  OT_FRAMING_TERMS,
  OT_HEDGE_TERMS,
  OT_LEVELS,
  OT_LIMITS,
  OT_OCCUPATIONS,
  OT_OCCUPATION_BLOCKED_TERMS,
  OT_PERSONAL_WORDS,
  OT_QUALIFIER_WORDS,
  OT_TIME_TERMS,
  normalizeOtQuestion,
} from './content'
import { OT_REQUEST_COUNT } from './prefetch'
import { OT_FIXTURE_QUESTIONS } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits and occupations must be the service's own. This reads the data file
 * the service loads, so a list edited on one side only fails here instead of
 * the two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/occupation-trivia/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  levels: Record<string, unknown>
  occupations: Record<string, { label: string; blockedTerms: string[] }>
  example: Record<string, unknown>
}

describe('occupation-trivia lists mirror the service', () => {
  it.each([
    ['blockedTerms', OT_BLOCKED_TERMS],
    ['framingTerms', OT_FRAMING_TERMS],
    ['brandTerms', OT_BRAND_TERMS],
    ['timeTerms', OT_TIME_TERMS],
    ['hedgeTerms', OT_HEDGE_TERMS],
    ['absoluteTerms', OT_ABSOLUTE_TERMS],
    ['badChoiceTerms', OT_BAD_CHOICE_TERMS],
    ['personalWords', OT_PERSONAL_WORDS],
    ['qualifierWords', OT_QUALIFIER_WORDS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('folds the same synonyms', () => {
    expect(OT_ALIASES).toEqual(config.aliases)
  })

  it('offers exactly the occupations the service has profiles for, with their care lists', () => {
    expect(OT_OCCUPATIONS.map((o) => o.value)).toEqual(Object.keys(config.occupations))
    for (const o of OT_OCCUPATIONS) {
      expect(o.label).toBe(config.occupations[o.value]!.label)
      expect([...OT_OCCUPATION_BLOCKED_TERMS[o.value]]).toEqual(config.occupations[o.value]!.blockedTerms)
    }
  })

  it('keeps the page budgets inside the service limits', () => {
    for (const [key, value] of Object.entries(OT_LIMITS)) expect(value, key).toBe(config.limits[key])
    expect(MAX_QUESTION_CHARS).toBeLessThanOrEqual(config.limits.maxQuestionChars!)
    expect(MAX_CHOICE_CHARS).toBeLessThanOrEqual(config.limits.maxChoiceChars!)
    expect(MAX_EXPLANATION_CHARS).toBeLessThanOrEqual(config.limits.maxExplanationChars!)
  })

  it('offers exactly the levels the service knows, and never asks for more than it returns', () => {
    expect(OT_LEVELS.map((level) => level.value).sort()).toEqual(Object.keys(config.levels).sort())
    expect(OT_REQUEST_COUNT).toBeLessThanOrEqual(config.limits.poolSize!)
  })

  it('accepts the prompt example, exactly as the service does', () => {
    expect(normalizeOtQuestion({ ...config.example, verified: true }, 'teacher')).not.toBeNull()
  })

  it('shares its fixture with the backend test', () => {
    const backend = readFileSync(
      fileURLToPath(new URL('../../../../../backend/tests/test_studio_occupation_trivia_service.py', import.meta.url)),
      'utf-8',
    )
    for (const q of OT_FIXTURE_QUESTIONS) expect(backend).toContain(q.question)
  })
})
