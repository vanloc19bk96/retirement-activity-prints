import { describe, it, expect } from 'vitest'
import { whereWasItTemplate, buildPlacements } from './generate'
import { WHERE_WAS_IT_ICONS } from './icons'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { runGeneratorContractTests } from '../studio-generator-test'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'

function isGroup(o: StudioFabricObject): boolean {
  return String(o.type ?? '').toLowerCase() === 'group'
}

function countPromptIcons(pageObjects: StudioFabricObject[]): number {
  return pageObjects
    .filter(isGroup)
    .flatMap((group) => group.objects ?? [])
    .filter((o) => o.studioRole === 'prompt').length
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(whereWasItTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(whereWasItTemplate)

describe('where-was-it', () => {
  it('study then recall pages', () => {
    resetObjectCounter()
    const pages = whereWasItTemplate.generate(base, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('does not offer an answer-key page (study page is the key)', () => {
    expect(whereWasItTemplate.producesAnswerKey).toBe(false)
  })

  it('recall grid is empty (no prompt icons in cells)', () => {
    resetObjectCounter()
    const [, recall] = whereWasItTemplate.generate(base, CTX())
    expect(countPromptIcons(recall.objects)).toBe(0)
  })

  it('study page has no item bank — grid with icons only', () => {
    resetObjectCounter()
    const [study] = whereWasItTemplate.generate(base, CTX())
    expect(study.objects.filter(isGroup)).toHaveLength(1)
    const texts = study.objects
      .flatMap((o) => (isGroup(o) ? (o.objects ?? []) : [o]))
      .filter((o) => String(o.type ?? '').toLowerCase() === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(texts.some((t) => /^Items?:/i.test(t) || /item bank/i.test(t))).toBe(
      false,
    )
  })

  it('numbers each item in the recall bank for write-in answers', () => {
    resetObjectCounter()
    const pages = whereWasItTemplate.generate(
      { ...base, itemCount: 5 },
      CTX(),
    )
    const [, recall] = pages
    const bankGroup = recall.objects.filter(isGroup).toSorted((a, b) => a.top - b.top)[1]
    const bankTexts = (bankGroup.objects ?? [])
      .filter((o) => String(o.type ?? '').toLowerCase() === 'textbox')
      .map((o) => String(o.text ?? ''))

    expect(bankTexts).toContain('Item bank:')
    expect(bankTexts.filter((t) => /^\d+$/.test(t)).toSorted()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
    expect(recall.objects.some((o) => String(o.text ?? '').includes('number'))).toBe(
      true,
    )
  })

  it('clamps itemCount to grid capacity', () => {
    resetObjectCounter()
    const [study] = whereWasItTemplate.generate(
      { ...base, gridSize: 4, itemCount: 20 },
      CTX(),
    )
    expect(countPromptIcons(study.objects)).toBeLessThanOrEqual(16)
  })

  it('groups grid only on study; grid + item bank on recall', () => {
    resetObjectCounter()
    const [study, recall] = whereWasItTemplate.generate(base, CTX())
    expect(study.objects.filter(isGroup)).toHaveLength(1)
    expect(recall.objects.filter(isGroup)).toHaveLength(2)
  })

  it('buildPlacements uses distinct cells and icons', () => {
    const rng = createRng(42)
    const placements = buildPlacements(WHERE_WAS_IT_ICONS, 5, 6, rng)
    expect(placements).toHaveLength(6)

    const cells = new Set(placements.map((p) => `${p.row},${p.col}`))
    expect(cells.size).toBe(6)

    const icons = new Set(placements.map((p) => p.iconName))
    expect(icons.size).toBe(6)

    for (const p of placements) {
      expect(p.row).toBeGreaterThanOrEqual(0)
      expect(p.row).toBeLessThan(5)
      expect(p.col).toBeGreaterThanOrEqual(0)
      expect(p.col).toBeLessThan(5)
    }
  })

  it('buildPlacements is deterministic per seed', () => {
    const a = buildPlacements(WHERE_WAS_IT_ICONS, 5, 6, createRng(99))
    const b = buildPlacements(WHERE_WAS_IT_ICONS, 5, 6, createRng(99))
    expect(a).toEqual(b)
  })

  it('uses phosphor duotone icons like Symbol Hunt', () => {
    expect(WHERE_WAS_IT_ICONS.length).toBeGreaterThanOrEqual(1000)

    resetObjectCounter()
    const [study] = whereWasItTemplate.generate(base, CTX())
    const promptIcons = study.objects
      .filter(isGroup)
      .flatMap((group) => group.objects ?? [])
      .filter((o) => o.studioRole === 'prompt')
    expect(promptIcons.length).toBeGreaterThan(0)
    for (const icon of promptIcons) {
      expect(icon.data?.source).toBe('phosphor-icon')
      expect(icon.data?.phosphorWeight).toBe('duotone')
    }
  })

  it('does not expose an item-theme config control', () => {
    expect(whereWasItTemplate.configSchema.some((field) => field.key === 'theme')).toBe(
      false,
    )
  })

  it('keeps recall item-bank group inside content for max grid and item count', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [, recall] = whereWasItTemplate.generate(
      { ...base, gridSize: 6, itemCount: 10 },
      ctx,
    )
    const minLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X - 1
    const maxRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X + 1

    const bankGroup = recall.objects.filter(isGroup).toSorted((a, b) => a.top - b.top)[1]
    expect(bankGroup.left).toBeGreaterThanOrEqual(minLeft)
    expect(bankGroup.left + (bankGroup.width ?? 0)).toBeLessThanOrEqual(maxRight)
  })
})
