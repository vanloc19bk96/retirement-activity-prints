import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MAX_ANSWER_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_QUESTION_CHARS,
  RQ_ASSUMPTION_TERMS,
  RQ_BLOCKED_TERMS,
  RQ_BRAND_TERMS,
  RQ_DESCRIPTION_BANNED_TERMS,
  RQ_PUT_DOWN_TERMS,
  RQ_QUALIFIER_WORDS,
  RQ_REVEAL_TERMS,
} from './content'

/**
 * The browser re-runs the service's gates on purpose, so its word lists and
 * budgets must be the service's own. This reads the data file the service
 * loads, so a list edited on one side only fails here instead of letting the
 * two sides quietly disagree about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/what-kind-of-retiree/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
}

describe('what-kind-of-retiree lists mirror the service', () => {
  it.each([
    ['blockedTerms', RQ_BLOCKED_TERMS],
    ['assumptionTerms', RQ_ASSUMPTION_TERMS],
    ['putDownTerms', RQ_PUT_DOWN_TERMS],
    ['revealTerms', RQ_REVEAL_TERMS],
    ['descriptionBannedTerms', RQ_DESCRIPTION_BANNED_TERMS],
    ['brandTerms', RQ_BRAND_TERMS],
    ['qualifierWords', RQ_QUALIFIER_WORDS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('budgets never exceed the service limits', () => {
    expect(MAX_QUESTION_CHARS).toBe(config.limits.maxQuestionChars)
    expect(MAX_ANSWER_CHARS).toBe(config.limits.maxAnswerChars)
    expect(MAX_DESCRIPTION_CHARS).toBe(config.limits.maxDescriptionChars)
  })
})
