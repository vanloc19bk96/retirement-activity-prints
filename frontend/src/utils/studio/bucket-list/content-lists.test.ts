import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  BL_BLOCKED_TERMS,
  BL_BRAND_TERMS,
  BL_CLICHE_PHRASES,
  BL_FOCUSES,
  BL_GENERIC_WORDS,
  BL_LEAD_VERBS,
  BL_LIMITS,
  BL_NON_VERB_STARTERS,
  BL_PHRASES,
  BL_QUALIFIER_WORDS,
  BL_SYNONYMS,
  blSectionCount,
  cleanBlSections,
} from './content'
import { BL_FIXTURE_SECTIONS } from './fixture'

/**
 * The browser re-runs the service's gates on purpose, so its word lists,
 * limits and focuses must be the service's own. This reads the data file the
 * service loads, so a list edited on one side only fails here instead of the
 * two sides quietly disagreeing about what may print.
 */
const PROMPT = fileURLToPath(
  new URL('../../../../../backend/app/data/studio/bucket-list/prompt.json', import.meta.url),
)
const config = JSON.parse(readFileSync(PROMPT, 'utf-8')) as Record<string, unknown> & {
  limits: Record<string, number>
  focuses: Record<string, unknown>
  themes: { key: string; title: string; group: string; facets: string[] }[]
}

describe('bucket-list lists mirror the service', () => {
  it.each([
    ['qualifierWords', BL_QUALIFIER_WORDS],
    ['genericWords', BL_GENERIC_WORDS],
    ['nonVerbStarters', BL_NON_VERB_STARTERS],
    ['leadVerbs', BL_LEAD_VERBS],
    ['clichePhrases', BL_CLICHE_PHRASES],
    ['blockedTerms', BL_BLOCKED_TERMS],
    ['brandTerms', BL_BRAND_TERMS],
  ] as const)('%s', (key, list) => {
    expect([...list]).toEqual(config[key])
  })

  it('folds the same phrases and synonyms', () => {
    expect(BL_PHRASES).toEqual(config.phrases)
    expect(BL_SYNONYMS).toEqual(config.synonyms)
  })

  it('keeps the same limits', () => {
    for (const [key, value] of Object.entries(BL_LIMITS)) expect(value, key).toBe(config.limits[key])
  })

  it('offers exactly the focuses the service weights', () => {
    expect(BL_FOCUSES.map((f) => f.value).sort()).toEqual(Object.keys(config.focuses).sort())
  })

  it('prints every heading the service can send', () => {
    for (const theme of config.themes) {
      const [section] = cleanBlSections([
        { key: theme.key, title: theme.title, target: 5, items: [{ idea: 'Bake a loaf of sourdough bread' }] },
      ])
      expect(section?.title, theme.key).toBe(theme.title)
    }
  })

  it('builds its fixture from the service’s own headings', () => {
    const titles = new Map(config.themes.map((t) => [t.key, t.title]))
    for (const section of BL_FIXTURE_SECTIONS) expect(section.title).toBe(titles.get(section.key))
    expect(BL_FIXTURE_SECTIONS).toHaveLength(blSectionCount(100))
  })
})
