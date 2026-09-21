import { describe, expect, it } from 'vitest'
import {
  STARTER_STUDIO_TEMPLATE_COUNT,
  STARTER_STUDIO_TEMPLATE_KEYS,
  isStarterStudioTemplate,
} from './studio-plan-access'
import { STUDIO_TEMPLATES } from './studio-templates'
import { STUDIO_CATEGORIES } from './studio-categories'

const STARTER_TEMPLATES = STUDIO_TEMPLATES.filter((t) =>
  isStarterStudioTemplate(t.key),
)

describe('starter studio template selection', () => {
  it('unlocks exactly 9 templates', () => {
    expect(STARTER_STUDIO_TEMPLATE_COUNT).toBe(9)
    expect(STARTER_TEMPLATES).toHaveLength(9)
  })

  it('has no duplicate or unknown keys', () => {
    expect(new Set(STARTER_STUDIO_TEMPLATE_KEYS).size).toBe(
      STARTER_STUDIO_TEMPLATE_KEYS.length,
    )
    const registryKeys = new Set(STUDIO_TEMPLATES.map((t) => t.key))
    for (const key of STARTER_STUDIO_TEMPLATE_KEYS) {
      expect(registryKeys.has(key)).toBe(true)
    }
  })

  it('covers every category so no tab is empty on Starter', () => {
    const covered = new Set(STARTER_TEMPLATES.map((t) => t.category))
    for (const c of STUDIO_CATEGORIES) {
      if (c.value === 'all') continue
      expect(covered.has(c.value)).toBe(true)
    }
  })

  it('lists keys in registry order so the grid stays grouped by category', () => {
    const registryOrder = STUDIO_TEMPLATES.filter((t) =>
      STARTER_STUDIO_TEMPLATE_KEYS.includes(t.key),
    ).map((t) => t.key)
    expect(STARTER_STUDIO_TEMPLATE_KEYS).toEqual(registryOrder)
  })

  it('includes the classics a printable activity book is built on', () => {
    for (const key of ['word-search', 'crossword', 'sudoku', 'maze']) {
      expect(isStarterStudioTemplate(key)).toBe(true)
    }
  })
})
