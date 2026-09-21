import { describe, it, expect } from 'vitest'
import {
  countingStreamsTemplate,
  buildField,
  buildInstruction,
  pickDistractors,
  clampTargetCount,
} from './generate'
import { SYMBOL_SETS } from './field'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { runGeneratorContractTests } from '../studio-generator-test'
import { harvestAnswers } from '../studio-answer-key'
import { estimateWrappedLines } from '../studio-layout'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'

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
  ...buildDefaultConfig(countingStreamsTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(countingStreamsTemplate)

describe('counting-streams', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = countingStreamsTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = countingStreamsTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different sheets', () => {
    resetObjectCounter()
    const a = JSON.stringify(countingStreamsTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      countingStreamsTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('one hidden answer per target', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate({ ...base, targetCount: 2 }, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(2)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('all difficulties and densities generate', () => {
    for (const discrimination of ['easy', 'standard', 'hard'] as const) {
      for (const density of ['light', 'medium', 'dense'] as const) {
        resetObjectCounter()
        expect(() =>
          countingStreamsTemplate.generate({ ...base, discrimination, density }, CTX()),
        ).not.toThrow()
      }
    }
  })

  it('all symbol types generate', () => {
    for (const symbolType of ['digits', 'letters', 'shapes', 'arrows'] as const) {
      resetObjectCounter()
      expect(() =>
        countingStreamsTemplate.generate({ ...base, symbolType }, CTX()),
      ).not.toThrow()
    }
  })

  it('arrow and shape pools use Phosphor icon ids (PDF/SVG-safe)', () => {
    expect(SYMBOL_SETS.arrows).toEqual([
      'arrow-up',
      'arrow-down',
      'arrow-left',
      'arrow-right',
      'arrow-up-left',
      'arrow-up-right',
      'arrow-down-right',
      'arrow-down-left',
    ])
    for (const name of ['circle', 'square', 'diamond', 'parallelogram', 'heart', 'hexagon']) {
      expect(SYMBOL_SETS.shapes).toContain(name)
    }
    // No Unicode dingbats — those become "?" in outline export.
    expect(SYMBOL_SETS.arrows.join('')).not.toMatch(/[⬆⬇⬅➡⬉⬈⬊⬋↑↓←→]/)
    expect(SYMBOL_SETS.shapes.join('')).not.toMatch(/[●■▲◆★]/)
  })

  it('shapes and arrows render as phosphor icon groups, not unicode text', () => {
    for (const symbolType of ['shapes', 'arrows'] as const) {
      resetObjectCounter()
      const [page] = countingStreamsTemplate.generate({ ...base, symbolType }, CTX())
      const flat = flattenObjects(page!.objects)
      const icons = flat.filter((o) => o.data?.source === 'phosphor-icon')
      expect(icons.length, symbolType).toBeGreaterThan(10)
      expect(icons.every((o) => o.data?.phosphorWeight === 'duotone')).toBe(true)
      const unicodeGlyphText = flat.filter(
        (o) =>
          typeof o.text === 'string' &&
          /[⬆⬇⬅➡●■▲◆★♥]/.test(o.text),
      )
      expect(unicodeGlyphText.length, symbolType).toBe(0)
    }
  })

  it('Targets banner draws label and arrow icons as separate objects', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate(
      { ...base, symbolType: 'arrows', targetCount: 3 },
      CTX(),
    )
    const flat = flattenObjects(page!.objects)
    const label = flat.find(
      (o) => o.studioRole === 'prompt' && o.text === 'Targets:',
    )
    expect(label).toBeDefined()
    expect(label!.fontWeight).toBe(700)
    const bannerIcons = flat.filter(
      (o) =>
        o.studioRole === 'prompt' &&
        o.data?.source === 'phosphor-icon' &&
        typeof o.data?.iconName === 'string' &&
        SYMBOL_SETS.arrows.includes(String(o.data.iconName)),
    )
    expect(bannerIcons.length).toBeGreaterThanOrEqual(3)
  })

  it('uses NO color — all ink is monochrome', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate(base, CTX())
    const allowed = new Set([
      '#000000',
      'transparent',
      undefined,
      '#6B7280',
      '#111827',
      '#D1D5DB',
      '#9CA3AF', // STUDIO_RULE_MEDIUM — grid-copy stream rules
    ])
    const colored = flattenObjects(page!.objects).filter(
      (o) => o.fill != null && !allowed.has(o.fill as string),
    )
    expect(colored.length).toBe(0)
  })

  it('answer counts match cells exactly', () => {
    const rng = createRng(42)
    const field = buildField({
      symbolType: 'digits',
      targetCount: 2,
      totalCells: 120,
      cols: 15,
      rows: 8,
      discrimination: 'standard',
      rng,
    })
    for (const t of field.targets) {
      const recounted = field.cells.filter((c) => c === t).length
      expect(field.counts[t]).toBe(recounted)
      expect(recounted).toBeGreaterThanOrEqual(1)
    }
    expect(new Set(field.targets).size).toBe(field.targets.length)
  })

  it('single-target totals span sparse-to-dense across seeds', () => {
    const totals: number[] = []
    for (let i = 0; i < 40; i++) {
      const field = buildField({
        symbolType: 'digits',
        targetCount: 1,
        totalCells: 126,
        cols: 18,
        rows: 7,
        discrimination: 'standard',
        rng: createRng(3_000 + i * 97),
      })
      const target = field.targets[0]!
      totals.push(field.counts[target]!)
    }
    const unique = new Set(totals)
    const lo = Math.min(...totals)
    const hi = Math.max(...totals)
    // Light field (~126): must not cluster only in the 20s–30s.
    expect(unique.size).toBeGreaterThan(5)
    expect(lo).toBeLessThanOrEqual(15)
    expect(hi).toBeGreaterThanOrEqual(45)
    expect(hi - lo).toBeGreaterThanOrEqual(30)
  })

  it('distractors never include targets', () => {
    const rng = createRng(99)
    for (const discrimination of ['easy', 'standard', 'hard'] as const) {
      const targets = rng.sample(SYMBOL_SETS.digits, 2)
      const distractors = pickDistractors('digits', targets, discrimination, rng)
      for (const t of targets) {
        expect(distractors.includes(t)).toBe(false)
      }
      expect(distractors.length).toBeGreaterThan(0)
    }
  })

  it('easy discrimination uses a different category', () => {
    const rng = createRng(7)
    const targets = rng.sample(SYMBOL_SETS.digits, 1)
    const distractors = pickDistractors('digits', targets, 'easy', rng)
    const digitSet = new Set(SYMBOL_SETS.digits)
    expect(distractors.every((d) => !digitSet.has(d))).toBe(true)
  })

  it('clampTargetCount stays in 1–3', () => {
    expect(clampTargetCount(0)).toBe(1)
    expect(clampTargetCount(2.4)).toBe(2)
    expect(clampTargetCount(9)).toBe(3)
  })

  it('instruction is stream-scan count copy — never cancel', () => {
    expect(buildInstruction(1)).toContain('Scan each stream')
    expect(buildInstruction(1)).toContain('Count')
    expect(buildInstruction(1)).not.toContain('Cross out')
    expect(buildInstruction(2)).toContain('EACH target')
    expect(buildInstruction(2)).not.toContain('Cross out')

    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate(base, CTX())
    const text = JSON.stringify(page)
    expect(text).toContain('Scan each stream')
    expect(text).not.toContain('Cross out')
  })

  it('How many label stays on one line (NBSP, no soft-wrap)', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate({ ...base, targetCount: 1 }, CTX())
    const label = flattenObjects(page!.objects).find(
      (o) =>
        o.studioRole === 'prompt' &&
        typeof o.text === 'string' &&
        /How[\u00A0 ]many/.test(o.text),
    )
    expect(label).toBeDefined()
    // NBSP (\u00A0) — Fabric wraps at regular spaces, which shoved "?" onto line 2.
    expect(String(label!.text)).toMatch(/How\u00A0many\u00A0.\u00A0\?/)
    expect(String(label!.text)).not.toMatch(/ /)
  })

  it('has no cancel answer rings', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate({ ...base, targetCount: 2 }, CTX())
    const circles = flattenObjects(page!.objects).filter((o) => o.type === 'circle')
    expect(circles.length).toBe(0)
  })

  it('config has no layout or markWhileCounting fields', () => {
    const keys = countingStreamsTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('layout')
    expect(keys).not.toContain('markWhileCounting')
    expect(keys).not.toContain('task')
  })

  it('draws stream hairlines under each row like grid-copy', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate(base, CTX())
    const hairlines = flattenObjects(page!.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.fill === '#9CA3AF' &&
        o.strokeWidth === 0 &&
        typeof o.height === 'number' &&
        o.height <= 2,
    )
    expect(hairlines.length).toBeGreaterThanOrEqual(2)
  })

  it('Targets banner sits below a wrapped instruction', () => {
    resetObjectCounter()
    const [page] = countingStreamsTemplate.generate(
      { ...base, showInstructions: true },
      CTX(),
    )
    const flat = flattenObjects(page!.objects)
    const instruction = flat.find(
      (o) =>
        o.studioRole === 'decoration' &&
        typeof o.text === 'string' &&
        o.text.includes('Scan each stream'),
    )
    const targets = flat.find(
      (o) => o.studioRole === 'prompt' && typeof o.text === 'string' && o.text.startsWith('Targets:'),
    )
    expect(instruction).toBeDefined()
    expect(targets).toBeDefined()
    const instBottom =
      (instruction!.top ?? 0) +
      Math.ceil(estimateWrappedLines(
        String(instruction!.text),
        Number(instruction!.fontSize ?? 20),
        Number(instruction!.width ?? 1),
      ) * Number(instruction!.fontSize ?? 20) * 1.35)
    const targetsTop =
      (targets!.originY === 'center'
        ? (targets!.top ?? 0) - Number(targets!.fontSize ?? 0) / 2
        : (targets!.top ?? 0))
    expect(targetsTop).toBeGreaterThanOrEqual(instBottom - 2)
  })
})
