import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FIF_ARTICLE_WORDS,
  FIF_BLANK_KINDS,
  FIF_BLOCKED_TERMS,
  FIF_BRAND_TERMS,
  FIF_DETERMINER_WORDS,
  FIF_LIMITS,
  FIF_MAX_BLANKS,
  FIF_MAX_WORDS,
  FIF_MIN_BLANKS,
  FIF_NAME_KINDS,
  FIF_NO_ARTICLE_KINDS,
  FIF_QUALIFIER_WORDS,
} from './content'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * printed labels and budgets must be the service's own. This reads the data
 * file the service loads, so a list edited on one side only fails here instead
 * of the word list printing a label the writer was never told about.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/fill-in-funnies/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  blankKinds: Record<string, { label: string; hint: string; classes: string[] }>
}

describe('fill-in-funnies lists mirror the service', () => {
  it.each([
    ['blockedTerms', FIF_BLOCKED_TERMS],
    ['brandTerms', FIF_BRAND_TERMS],
    ['qualifierWords', FIF_QUALIFIER_WORDS],
    ['nameKinds', FIF_NAME_KINDS],
    ['noArticleKinds', FIF_NO_ARTICLE_KINDS],
    ['articleWords', FIF_ARTICLE_WORDS],
    ['determinerWords', FIF_DETERMINER_WORDS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('prints every blank kind exactly as the writer is told it', () => {
    const printed = Object.fromEntries(
      Object.entries(config.blankKinds).map(([kind, spec]) => [kind, { label: spec.label, hint: spec.hint }]),
    )
    expect(FIF_BLANK_KINDS).toEqual(printed)
  })

  it('keeps the page budgets inside the service limits', () => {
    for (const [key, value] of Object.entries(FIF_LIMITS)) expect(value, key).toBe(config.limits[key])
    expect(FIF_MIN_BLANKS).toBeGreaterThanOrEqual(config.limits.minBlanks!)
    expect(FIF_MAX_BLANKS).toBeLessThanOrEqual(config.limits.maxBlanks!)
    expect(FIF_MAX_WORDS).toBeLessThanOrEqual(config.limits.maxWords!)
  })
})
