import { describe, expect, it } from 'vitest'
import { getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_BOOK_MAX_GAMES,
  buildChosenBookPlan,
  STUDIO_BOOK_TEMPLATES,
  buildRandomBookPlan,
  countBookRowsTotal,
  getEligibleBookTemplates,
} from './studio-book-plan'
import { WF_TEMPLATE_KEY } from './weeks-of-firsts/content'
import type { StudioBookGameRow } from '@/types/studio-template.types'

const POOL_SIZE = getEligibleBookTemplates({ categories: [] }).length

function keysOf(plan: { templateKey: string }[]): string[] {
  return plan.map((item) => item.templateKey)
}

describe('buildRandomBookPlan', () => {
  it('uses every game once before reusing any', () => {
    const keys = keysOf(buildRandomBookPlan({ gameCount: POOL_SIZE, seed: 7, categories: [] }))
    expect(new Set(keys).size).toBe(POOL_SIZE)
  })

  it('never prints the same game twice in a row', () => {
    // Two full passes is where a naive shuffle-per-pass repeats at the seam.
    // Certificates are exempt: every copy closes the book, side by side.
    for (const seed of [1, 42, 1337, 90210, 555]) {
      const keys = keysOf(
        buildRandomBookPlan({ gameCount: POOL_SIZE * 2, seed, categories: [] }),
      )
      const backToBack = keys.filter(
        (key, i) => i > 0 && key === keys[i - 1] && key !== 'retirement-certificate',
      )
      expect(backToBack).toEqual([])
    }
  })

  it('spreads a short book across distinct games', () => {
    const gameCount = Math.min(12, POOL_SIZE)
    const keys = keysOf(buildRandomBookPlan({ gameCount, seed: 3, categories: [] }))
    expect(keys).toHaveLength(gameCount)
    expect(new Set(keys).size).toBe(gameCount)
  })

  it('stays deterministic for a seed', () => {
    const options = { gameCount: 9, seed: 24, categories: [] }
    expect(keysOf(buildRandomBookPlan(options))).toEqual(
      keysOf(buildRandomBookPlan(options)),
    )
  })

  it('honours a category filter', () => {
    const plan = buildRandomBookPlan({ gameCount: 6, seed: 5, categories: ['word'] })
    const allowed = new Set(
      getEligibleBookTemplates({ categories: ['word'] }).map((def) => def.key),
    )
    expect(plan.length).toBe(6)
    for (const item of plan) expect(allowed.has(item.templateKey)).toBe(true)
  })
})

describe('keepsakes in a book', () => {
  const isKeepsake = (key: string) => getStudioTemplate(key)?.category === 'keepsake'

  it('closes a random mix with its keepsakes, after every game', () => {
    for (const seed of [1, 42, 1337, 90210, 555]) {
      const keys = keysOf(buildRandomBookPlan({ gameCount: 64, seed, categories: [] }))
      const firstKeepsake = keys.findIndex(isKeepsake)
      expect(firstKeepsake).toBeGreaterThan(0)
      expect(keys.slice(firstKeepsake).every(isKeepsake)).toBe(true)
    }
  })

  it('ends a random mix on the certificate, after the other keepsakes', () => {
    for (const seed of [1, 2, 3, 42, 1337, 90210, 555]) {
      const keys = keysOf(buildRandomBookPlan({ gameCount: 64, seed, categories: [] }))
      const firstCertificate = keys.indexOf('retirement-certificate')
      expect(firstCertificate).toBeGreaterThan(0)
      expect(keys.slice(firstCertificate).every((key) => key === 'retirement-certificate')).toBe(true)
    }
  })

  it('ends a shuffled chosen book on its keepsakes, but keeps a sequential order as chosen', () => {
    const game = getEligibleBookTemplates({ categories: [] }).find((def) => def.category !== 'keepsake')!
    const rows: StudioBookGameRow[] = [
      { id: 'cert', templateKey: 'retirement-certificate', quantity: 1, config: {} },
      { id: 'wishes', templateKey: 'well-wishes-signatures', quantity: 1, config: {} },
      { id: 'game', templateKey: game.key, quantity: 5, config: {} },
    ]
    for (const seed of [1, 2, 3]) {
      const keys = keysOf(buildChosenBookPlan({ rows, order: 'shuffle', seed }))
      expect(keys.at(-1)).toBe('retirement-certificate')
    }
    expect(keysOf(buildChosenBookPlan({ rows, order: 'sequential', seed: 1 }))[0]).toBe(
      'retirement-certificate',
    )
  })
})

describe('buildChosenBookPlan', () => {
  const row = (id: string, templateKey: string, quantity: number): StudioBookGameRow => ({
    id,
    templateKey,
    quantity,
    config: {},
  })

  it('caps a shuffled plan at the run limit, like a sequential one', () => {
    const templateKey = getEligibleBookTemplates({ categories: [] })[0]!.key
    // Quantity is clamped per row, so it takes several rows to exceed the cap.
    const rows = [1, 2, 3].map((n) => row(`row-${n}`, templateKey, 50))
    expect(buildChosenBookPlan({ rows, order: 'shuffle', seed: 1 })).toHaveLength(
      STUDIO_BOOK_MAX_GAMES,
    )
  })
})

describe('standalone books (52 Weeks of Firsts)', () => {
  const wfRow: StudioBookGameRow = { id: 'wf', templateKey: WF_TEMPLATE_KEY, quantity: 2, config: {} }

  it('is never offered to the book builder', () => {
    expect(STUDIO_BOOK_TEMPLATES.some((def) => def.key === WF_TEMPLATE_KEY)).toBe(false)
    expect(
      getEligibleBookTemplates({ categories: [] }).some((def) => def.key === WF_TEMPLATE_KEY),
    ).toBe(false)
  })

  it('is never drawn into a random book', () => {
    for (const seed of [1, 42, 1337]) {
      const keys = keysOf(buildRandomBookPlan({ gameCount: POOL_SIZE * 2, seed, categories: [] }))
      expect(keys).not.toContain(WF_TEMPLATE_KEY)
    }
  })

  it('is dropped from chosen rows and the game count', () => {
    const other = { ...wfRow, id: 'other', templateKey: STUDIO_BOOK_TEMPLATES[0]!.key, quantity: 1 }
    const plan = buildChosenBookPlan({ rows: [wfRow, other], order: 'sequential', seed: 1 })
    expect(keysOf(plan)).toEqual([other.templateKey])
    expect(countBookRowsTotal([wfRow, other])).toBe(1)
  })
})
