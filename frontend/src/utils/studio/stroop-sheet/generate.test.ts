import { describe, it, expect } from 'vitest'
import {
  stroopSheetTemplate,
  buildOne,
  buildItems,
  clampItemCount,
} from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_RULE_MEDIUM } from '@/constants/studio.constants'
import { STROOP_BLANK_SOURCE, STROOP_DIRECTION_ARROW_SOURCE } from './draw'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { runGeneratorContractTests } from '../studio-generator-test'
import type {
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { StroopVariant } from './items'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    out.push(o)
    if (o.type === 'group' && o.objects) {
      out.push(...flattenObjects(o.objects))
    }
  }
  return out
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(stroopSheetTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(stroopSheetTemplate)

describe('stroop-sheet', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = stroopSheetTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = stroopSheetTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different sheets', () => {
    resetObjectCounter()
    const a = JSON.stringify(stroopSheetTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      stroopSheetTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('does not offer an answer-key page', () => {
    expect(stroopSheetTemplate.producesAnswerKey).toBe(false)
  })

  it('emits no hidden answer objects', () => {
    resetObjectCounter()
    const [page] = stroopSheetTemplate.generate(base, CTX())
    const answers = flattenObjects(page!.objects).filter(
      (o) => o.studioRole === 'answer',
    )
    expect(answers).toHaveLength(0)
  })

  it('uses one shared prompt size for every number item', () => {
    resetObjectCounter()
    const [page] = stroopSheetTemplate.generate(
      { ...base, variant: 'number', itemCount: 30 },
      CTX(),
    )
    const gridGroup = page!.objects.find((o) => o.type === 'group')
    const prompts = (gridGroup!.objects ?? []).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(30)
    const sizes = new Set(prompts.map((o) => o.fontSize))
    expect(sizes.size).toBe(1)
  })

  it('count-word prompts stay legibly large at 60 items', () => {
    resetObjectCounter()
    const [page] = stroopSheetTemplate.generate(
      { ...base, variant: 'count-word', itemCount: 60 },
      CTX(),
    )
    const gridGroup = page!.objects.find((o) => o.type === 'group')
    const prompts = (gridGroup!.objects ?? []).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(60)
    const size = prompts[0]!.fontSize ?? 0
    expect(size).toBeGreaterThanOrEqual(32)
    expect(new Set(prompts.map((o) => o.fontSize)).size).toBe(1)
  })

  it('direction uses path arrows (editor/PDF/SVG match — no Unicode glyphs)', () => {
    resetObjectCounter()
    const [page] = stroopSheetTemplate.generate(
      { ...base, variant: 'direction', itemCount: 60 },
      CTX(),
    )
    const flat = flattenObjects(page!.objects)
    const example = flat.find(
      (o) => o.studioRole === 'decoration' && String(o.text ?? '').includes('Example'),
    )
    expect(example).toBeDefined()
    expect(String(example!.text)).toBe('Example: UP')
    expect(
      flat.some(
        (o) => o.studioRole === 'decoration' && String(o.text ?? '') === 'answer is',
      ),
    ).toBe(true)

    const gridGroup = page!.objects.find((o) => o.type === 'group')
    const kids = gridGroup!.objects ?? []
    const prompts = kids.filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
    const arrows = kids.filter((o) => o.data?.source === STROOP_DIRECTION_ARROW_SOURCE)
    expect(prompts.length).toBe(60)
    expect(arrows.length).toBe(60)
    expect(arrows.every((o) => o.type === 'polygon')).toBe(true)
    // No Unicode arrows in any text — those diverge under PDF/SVG outline export.
    for (const obj of flat) {
      const text = String(obj.text ?? '')
      expect(text).not.toMatch(/[\u2190\u2191\u2192\u2193]/)
    }
  })

  it('groups the item grid into one outer group with grid-copy bars', () => {
    resetObjectCounter()
    const [page] = stroopSheetTemplate.generate(base, CTX())
    const gridGroup = page!.objects.find((o) => o.type === 'group')
    expect(gridGroup).toBeDefined()
    const kids = gridGroup!.objects ?? []
    expect(kids.filter((o) => o.studioRole === 'prompt').length).toBe(30)
    expect(kids.filter((o) => o.data?.source === STROOP_BLANK_SOURCE).length).toBe(30)
    // Filled RULE_MEDIUM bars (blanks + cell grid) — same stroke style as grid-copy.
    expect(
      kids.filter((o) => o.type === 'rect' && o.fill === STUDIO_RULE_MEDIUM).length,
    ).toBeGreaterThan(30)
  })

  it('every variant generates without throwing', () => {
    for (const variant of ['number', 'direction', 'count-word'] as const) {
      resetObjectCounter()
      expect(() =>
        stroopSheetTemplate.generate({ ...base, variant }, CTX()),
      ).not.toThrow()
    }
  })

  it('uses NO color — all ink is monochrome', () => {
    resetObjectCounter()
    const [page] = stroopSheetTemplate.generate(base, CTX())
    const allowed = new Set([
      '#000000',
      'transparent',
      undefined,
      '#6B7280',
      STUDIO_RULE_MEDIUM,
    ])
    const colored = flattenObjects(page!.objects).filter(
      (o) => o.fill != null && !allowed.has(o.fill as string),
    )
    expect(colored.length).toBe(0)
  })

  it('clampItemCount snaps to 12–60 by sixes', () => {
    expect(clampItemCount(10)).toBe(12)
    expect(clampItemCount(33)).toBe(36)
    expect(clampItemCount(31)).toBe(30)
    expect(clampItemCount(99)).toBe(60)
  })

  it('number incongruent: digit never equals count; answer is count', () => {
    const rng = createRng(99)
    for (let i = 0; i < 40; i++) {
      const item = buildOne('number', 'incongruent', rng)
      const glyphs = item.display.split(' ')
      const k = glyphs.length
      expect(item.answer).toBe(String(k))
      expect(glyphs.every((g) => g !== String(k))).toBe(true)
      expect(glyphs.every((g) => g === glyphs[0])).toBe(true)
    }
  })

  it('direction incongruent: word ≠ arrow answer', () => {
    const rng = createRng(22)
    const dirs = new Set(['up', 'down', 'left', 'right'])
    for (let i = 0; i < 30; i++) {
      const item = buildOne('direction', 'incongruent', rng)
      expect(item.display).not.toBe(item.answer)
      expect(dirs.has(item.answer)).toBe(true)
    }
  })

  it('count-word incongruent: word value ≠ repetition count', () => {
    const values: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
    }
    const rng = createRng(33)
    for (let i = 0; i < 30; i++) {
      const item = buildOne('count-word', 'incongruent', rng)
      const parts = item.display.split(' ')
      const k = parts.length
      expect(item.answer).toBe(String(k))
      expect(values[parts[0]!]).not.toBe(k)
    }
  })

  it('always builds all-conflicting items', () => {
    const variants: StroopVariant[] = ['number', 'direction', 'count-word']
    for (const variant of variants) {
      const items = buildItems(variant, 24, createRng(5))
      expect(items).toHaveLength(24)
      expect(items.every((i) => i.condition === 'incongruent')).toBe(true)
    }
  })

  it('config schema has no conflict-level control', () => {
    expect(stroopSheetTemplate.configSchema.some((f) => f.key === 'condition')).toBe(
      false,
    )
  })
})
