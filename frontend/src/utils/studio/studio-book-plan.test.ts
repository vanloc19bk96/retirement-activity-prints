import { describe, expect, it } from 'vitest'
import {
  STUDIO_BOOK_MAX_GAMES,
  buildChosenBookPlan,
  buildRandomBookPlan,
  getEligibleBookTemplates,
} from './studio-book-plan'
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
    for (const seed of [1, 42, 1337, 90210, 555]) {
      const keys = keysOf(
        buildRandomBookPlan({ gameCount: POOL_SIZE * 2, seed, categories: [] }),
      )
      const backToBack = keys.filter((key, i) => i > 0 && key === keys[i - 1])
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
