import { describe, it, expect } from 'vitest'
import { symbolDigitCodingTemplate } from './generate'
import { buildCodingSymbol, selectCodingSymbols } from './symbols'
import { CODING_SYMBOL_IDS, codingSymbolParts } from './symbol-parts'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(symbolDigitCodingTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(symbolDigitCodingTemplate)

describe('symbol-digit-coding', () => {
  it('auto-adds a solution page (no form toggles)', () => {
    expect(symbolDigitCodingTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('symbol-digit-coding')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('aligns key strip width with the fill grid', () => {
    resetObjectCounter()
    const [page] = symbolDigitCodingTemplate.generate(
      { ...base, symbolCount: 9, cellCount: 8 },
      CTX(),
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
    const [keyGroup, gridGroup] = groups
    expect(keyGroup!.width).toBe(gridGroup!.width)
    expect(keyGroup!.left).toBe(gridGroup!.left)
  })

  it('keeps dense layout clear of the safe-area bottom', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = symbolDigitCodingTemplate.generate(
      { ...base, symbolCount: 9, cellCount: 80 },
      ctx,
    )
    const grid = page!.objects.filter((o) => o.type === 'group').at(-1)!
    const gridBottom = grid.top! + grid.height!
    expect(gridBottom).toBeLessThanOrEqual(ctx.pageHeight - ctx.margin.bottom - 8)
  })

  it('hides fill digits except the first two worked examples', () => {
    resetObjectCounter()
    const [page] = symbolDigitCodingTemplate.generate(
      { ...base, symbolCount: 6, cellCount: 16 },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(14)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('symbol-digit-coding')).toBe(true)
    resetObjectCounter()
    const [page] = symbolDigitCodingTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('solution page shows the filled grid only — no key table', () => {
    resetObjectCounter()
    const [page] = symbolDigitCodingTemplate.generate(
      { ...base, symbolCount: 9, cellCount: 8 },
      CTX(),
    )
    expect(page!.objects.filter((o) => o.type === 'group')).toHaveLength(2)

    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const groups = keyObjects.filter((o) => o.type === 'group')
    expect(groups).toHaveLength(1)
    expect(harvestAnswers(groups).length).toBeGreaterThan(0)
    expect(keyObjects.some((o) => o.studioRole === 'key')).toBe(false)
  })

  it('keeps a large unique geometric pool for multi-page books', () => {
    expect(CODING_SYMBOL_IDS).toHaveLength(50)
    expect(new Set(CODING_SYMBOL_IDS).size).toBe(50)
  })

  it('builds every coding symbol without empty output', () => {
    const tag = {
      templateKey: 'symbol-digit-coding',
      instanceId: 'sym',
      pageRole: 'single' as const,
    }
    for (const id of CODING_SYMBOL_IDS) {
      const objects = buildCodingSymbol(id, { left: 0, top: 0 }, 22, tag, 'prompt')
      expect(objects.length, id).toBeGreaterThan(0)
      expect(objects.length, id).toBeLessThanOrEqual(4)
    }
  })

  it('keeps multi-path glyphs at most 4 adjacent parts', () => {
    for (const id of CODING_SYMBOL_IDS) {
      const parts = codingSymbolParts(id, 11)
      expect(parts.length, id).toBeGreaterThan(0)
      expect(parts.length, id).toBeLessThanOrEqual(4)
    }
  })

  it('samples unique symbols within a page and varies across seeds', () => {
    const one = selectCodingSymbols(createRng(42), 9)
    expect(one).toHaveLength(9)
    expect(new Set(one).size).toBe(9)

    const keys = new Set<string>()
    for (let seed = 1; seed <= 120; seed++) {
      keys.add(selectCodingSymbols(createRng(seed), 6).join(','))
    }
    // Large pool → many distinct 6-symbol keys across book-sized page counts.
    expect(keys.size).toBeGreaterThan(80)
  })
})
