import { describe, it, expect } from 'vitest'
import {
  symbolHuntTemplate,
  buildField,
  pickDistractors,
  pickTargets,
  clampTargetCount,
  clampCellsToFit,
  effectiveTargetCount,
} from './generate'
import { SHAPE_RING_GLYPHS, SYMBOL_SETS } from './field'
import { SHAPE_RING_ICON_NAMES } from './icons'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { studyRecallGridTemplate } from '../study-recall-grid/generate'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { estimateWrappedLines } from '../studio-layout'
import { createRng } from '../studio-rng'
import {
  assertGeneratorEntropy,
  contentFingerprint,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'

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

function allText(page: { objects: StudioFabricObject[] }): string {
  return flattenObjects(page.objects)
    .map((o) => (typeof o.text === 'string' ? o.text : ''))
    .join(' ')
}

function answerBoxes(page: { objects: StudioFabricObject[] }): StudioFabricObject[] {
  return flattenObjects(page.objects).filter(
    (o) => o.studioRole === 'structure' && o.type === 'rect',
  )
}

function symbolId(o: StudioFabricObject): string | null {
  if (typeof o.data?.iconName === 'string') return o.data.iconName
  if (typeof o.text === 'string' && o.text.length > 0 && !o.text.startsWith('Targets')) {
    return o.text
  }
  return null
}

function bannerTargetGlyphs(page: { objects: StudioFabricObject[] }): string[] {
  const flat = flattenObjects(page.objects)
  const label = flat.find(
    (o) =>
      o.studioRole === 'prompt' &&
      typeof o.text === 'string' &&
      String(o.text).replace(/\u00a0/g, ' ').trim() === 'Targets:',
  )
  if (!label) return []
  return flat
    .filter(
      (o) =>
        o.studioRole === 'prompt' &&
        o !== label &&
        o.top === label.top &&
        symbolId(o) !== null,
    )
    .sort((a, b) => (Number(a.left) || 0) - (Number(b.left) || 0))
    .map((o) => symbolId(o)!)
}

function totalTargetOccurrences(page: { objects: StudioFabricObject[] }): number {
  const flat = flattenObjects(page.objects)
  const targets = bannerTargetGlyphs(page)
  const targetSet = new Set(targets)
  const bannerTop = flat.find(
    (o) =>
      o.studioRole === 'prompt' &&
      typeof o.text === 'string' &&
      String(o.text).replace(/\u00a0/g, ' ').trim() === 'Targets:',
  )?.top
  // Answer-strip icons share the "How many" midline — exclude them.
  const answerStripTops = new Set(
    flat
      .filter(
        (o) =>
          typeof o.text === 'string' &&
          (o.text.startsWith('How') || o.text === '?'),
      )
      .map((o) => o.top),
  )
  return flat.filter((o) => {
    if (o.studioRole !== 'prompt' || o.top === bannerTop) return false
    if (answerStripTops.has(o.top)) return false
    const id = symbolId(o)
    return id !== null && targetSet.has(id)
  }).length
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: StudioConfig = {
  ...buildDefaultConfig(symbolHuntTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(symbolHuntTemplate)
// Seeded field layout is the anti-repetition guarantee for bulk books.
assertGeneratorEntropy(symbolHuntTemplate)

describe('symbol-hunt', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = symbolHuntTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = symbolHuntTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different sheets', () => {
    resetObjectCounter()
    const a = JSON.stringify(symbolHuntTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      symbolHuntTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('defaults to icons and cancel task', () => {
    const defaults = buildDefaultConfig(symbolHuntTemplate)
    expect(defaults.symbolType).toBe('icons')
    expect(defaults.task).toBe('cancel')
  })

  it('instruction textbox is at least Study & Recall Grid width', () => {
    resetObjectCounter()
    const [hunt] = symbolHuntTemplate.generate(
      { ...base, showInstructions: true, task: 'cancel' },
      CTX(),
    )
    resetObjectCounter()
    const studyPages = studyRecallGridTemplate.generate(
      { ...buildDefaultConfig(studyRecallGridTemplate), seed: 42, fontFamily: 'Inter' },
      CTX(),
    )
    const huntInst = flattenObjects(hunt!.objects).find(
      (o) =>
        o.studioRole === 'decoration' &&
        typeof o.text === 'string' &&
        o.text.includes('Mark every'),
    )
    const studyInst = flattenObjects(studyPages[0]!.objects).find(
      (o) =>
        o.studioRole === 'decoration' &&
        typeof o.text === 'string' &&
        o.text.includes('Study the grid'),
    )
    expect(huntInst).toBeDefined()
    expect(studyInst).toBeDefined()
    expect(Number(huntInst!.width)).toBeGreaterThanOrEqual(Number(studyInst!.width))
  })

  it('multi-target count instruction stays on two explicit lines', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, showInstructions: true, task: 'count', targetCount: 3 },
      CTX(),
    )
    const instruction = flattenObjects(page!.objects).find(
      (o) =>
        o.studioRole === 'decoration' &&
        typeof o.text === 'string' &&
        o.text.includes('EACH target'),
    )
    expect(instruction).toBeDefined()
    expect(String(instruction!.text).split('\n')).toEqual([
      'Count how many times EACH target appears.',
      'Keep a separate total for each one',
    ])
    expect(
      estimateWrappedLines(
        String(instruction!.text),
        Number(instruction!.fontSize),
        Number(instruction!.width),
      ),
    ).toBe(2)
  })

  it('Targets banner icons share one centered midline', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, task: 'cancel', targetCount: 3 },
      CTX(),
    )
    const flat = flattenObjects(page!.objects)
    const label = flat.find(
      (o) =>
        o.studioRole === 'prompt' &&
        typeof o.text === 'string' &&
        String(o.text).replace(/\u00a0/g, ' ').trim() === 'Targets:',
    )
    expect(label).toBeDefined()
    const glyphs = bannerTargetGlyphs(page!)
    expect(glyphs.length).toBe(3)
    for (const glyph of glyphs) {
      const obj = flat.find(
        (o) =>
          o.studioRole === 'prompt' &&
          symbolId(o) === glyph &&
          o.top === label!.top,
      )
      expect(obj?.originX).toBe('center')
      expect(obj?.originY).toBe('center')
      expect(obj?.top).toBe(label!.top)
    }
    const lefts = glyphs.map((g) => {
      const obj = flat.find(
        (o) => o.studioRole === 'prompt' && symbolId(o) === g && o.top === label!.top,
      )!
      return Number(obj.left)
    })
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b))
  })

  it('answer key keeps Targets legend with revealed rings', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate({ ...base, task: 'cancel' }, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    expect(bannerTargetGlyphs({ objects: keyObjects }).length).toBeGreaterThan(0)
    expect(
      flattenObjects(keyObjects).some(
        (o) =>
          typeof o.text === 'string' &&
          String(o.text).replace(/\u00a0/g, ' ').trim() === 'Targets:',
      ),
    ).toBe(true)
    expect(harvestAnswers(keyObjects).some((o) => o.type === 'circle' && o.visible !== false)).toBe(
      true,
    )
  })

  it('keeps unique Phosphor / text pools per set', () => {
    // Icons are Phosphor duotone ids; digits/letters stay Inter text.
    expect(SYMBOL_SETS.icons.length).toBeGreaterThanOrEqual(1000)
    expect(SYMBOL_SETS.digits.length).toBe(10)
    expect(SYMBOL_SETS.letters.length).toBe(26)
    for (const [name, set] of Object.entries(SYMBOL_SETS)) {
      expect(new Set(set).size, `${name} has duplicates`).toBe(set.length)
    }
    const all = Object.values(SYMBOL_SETS).flat()
    expect(new Set(all).size).toBe(all.length)
  })

  it('excludes ring/disc icons and glyphs so cancel circles do not double up', () => {
    for (const glyph of SHAPE_RING_GLYPHS) {
      expect(SYMBOL_SETS.icons, glyph).not.toContain(glyph)
    }
    for (const name of SHAPE_RING_ICON_NAMES) {
      expect(SYMBOL_SETS.icons, name).not.toContain(name)
    }
  })

  it('renders icons as Phosphor duotone path groups (font-independent)', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, fontFamily: 'Lora', symbolType: 'icons', task: 'cancel' },
      CTX(),
    )
    const cell = flattenObjects(page!.objects).find(
      (o) =>
        o.studioRole === 'prompt' &&
        typeof o.data?.iconName === 'string' &&
        SYMBOL_SETS.icons.includes(String(o.data.iconName)),
    )
    expect(cell).toBeDefined()
    expect(String(cell!.type).toLowerCase()).toBe('group')
    expect(cell!.data?.source).toBe('phosphor-icon')
    expect(cell!.data?.phosphorWeight).toBe('duotone')
  })

  it('count mode: one hidden answer per target', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, task: 'count', symbolType: 'icons', targetCount: 2 },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(2)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('cancel mode marks EVERY target occurrence on the key', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate({ ...base, task: 'cancel' }, CTX())
    const rings = harvestAnswers(page!.objects)
    expect(rings.length).toBe(totalTargetOccurrences(page!))
    expect(rings.length).toBeGreaterThan(0)
    expect(rings.every((o) => o.visible === false)).toBe(true)
    expect(rings.every((o) => o.type === 'circle')).toBe(true)
  })

  it('cancel rings leave a small gap around the symbol', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate({ ...base, task: 'cancel' }, CTX())
    const flat = flattenObjects(page!.objects)
    const icon = flat.find(
      (o) =>
        o.studioRole === 'prompt' &&
        typeof o.data?.iconName === 'string' &&
        o.top !==
          flat.find(
            (x) =>
              typeof x.text === 'string' &&
              String(x.text).replace(/\u00a0/g, ' ').trim() === 'Targets:',
          )?.top,
    )
    expect(icon).toBeDefined()
    const symbolSize = Number(icon!.width) * Number(icon!.scaleX ?? 1)
    const rings = harvestAnswers(page!.objects).filter((o) => o.type === 'circle')
    expect(rings.length).toBeGreaterThan(0)
    const cornerReach = symbolSize * 0.5 * Math.SQRT2
    expect(rings.every((o) => Number(o.radius) > cornerReach + 2)).toBe(true)
  })

  it('cancel mode prints no answer boxes', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate({ ...base, task: 'cancel' }, CTX())
    expect(allText(page!)).not.toMatch(/How many/i)
    expect(answerBoxes(page!).length).toBe(0)
  })

  it('count mode prints one answer box per target', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, task: 'count', symbolType: 'icons', targetCount: 2 },
      CTX(),
    )
    expect(answerBoxes(page!).length).toBe(2)
  })

  it('both mode marks every target and prints count boxes', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, task: 'both', symbolType: 'icons', targetCount: 2 },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    const rings = answers.filter((o) => o.type === 'circle')
    const counts = answers.filter((o) => o.type !== 'circle')
    expect(rings.length).toBe(totalTargetOccurrences(page!))
    expect(rings.length).toBeGreaterThan(0)
    expect(rings.every((o) => o.visible === false)).toBe(true)
    expect(counts.length).toBe(2)
    expect(answerBoxes(page!).length).toBe(2)
  })

  it('How many labels stay on one line and icons stay inside their column', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, task: 'count', symbolType: 'icons', targetCount: 3 },
      CTX(),
    )
    const labels = flattenObjects(page!.objects).filter(
      (o) =>
        o.studioRole === 'prompt' &&
        typeof o.text === 'string' &&
        o.text.startsWith('How\u00a0many'),
    )
    expect(labels.length).toBe(3)
    for (const label of labels) {
      const text = String(label.text)
      expect(text.includes(' ')).toBe(false)
      expect(text.split('\n').length).toBe(1)
      expect(Number(label.fontSize)).toBeGreaterThanOrEqual(10)
      expect(Number(label.fontSize)).toBeLessThanOrEqual(24)
    }

    const targets = bannerTargetGlyphs(page!)
    const stripIcons = flattenObjects(page!.objects).filter(
      (o) =>
        o.studioRole === 'prompt' &&
        typeof o.data?.iconName === 'string' &&
        targets.includes(String(o.data.iconName)),
    )
    // Banner (3) + answer-strip icons (3).
    expect(stripIcons.length).toBeGreaterThanOrEqual(6)

    // Each strip icon must sit to the right of its “How many” prefix (no column spill).
    const sortedLabels = [...labels].sort((a, b) => Number(a.left) - Number(b.left))
    const answerIcons = stripIcons
      .filter((o) => sortedLabels.some((l) => Math.abs(Number(o.top) - Number(l.top)) < 2))
      .sort((a, b) => Number(a.left) - Number(b.left))
    expect(answerIcons.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      const label = sortedLabels[i]!
      const icon = answerIcons[i]!
      expect(Number(icon.left)).toBeGreaterThan(Number(label.left) + Number(label.width) * 0.5)
    }
  })

  it('letter grids are clamped to a single target (§4.1)', () => {
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate(
      { ...base, symbolType: 'letters', targetCount: 3, task: 'count' },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(1)
    expect(effectiveTargetCount('letters', 3)).toBe(1)
  })

  it('all difficulties and tasks generate', () => {
    for (const discrimination of ['easy', 'standard', 'hard'] as const) {
      for (const task of ['cancel', 'count', 'both'] as const) {
        resetObjectCounter()
        expect(() =>
          symbolHuntTemplate.generate({ ...base, discrimination, task }, CTX()),
        ).not.toThrow()
      }
    }
  })

  it('grid is square (cols === rows)', () => {
    for (const density of ['light', 'medium', 'dense'] as const) {
      const { cols, rows, totalCells } = clampCellsToFit(240, 2000, 2000)
      expect(cols).toBe(rows)
      expect(totalCells).toBe(cols * rows)
      resetObjectCounter()
      const [page] = symbolHuntTemplate.generate({ ...base, density }, CTX())
      expect(page).toBeDefined()
    }
  })

  it('answer counts match cells exactly', () => {
    const rng = createRng(42)
    const field = buildField({
      symbolType: 'icons',
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

  it('multi-target icons are unique', () => {
    for (let i = 0; i < 80; i++) {
      const targets = pickTargets('icons', 3, createRng(9_000 + i * 17))
      expect(new Set(targets).size).toBe(targets.length)
    }
  })

  it('maps legacy shapes/arrows configs to icons', () => {
    resetObjectCounter()
    const [fromShapes] = symbolHuntTemplate.generate(
      { ...base, symbolType: 'shapes', task: 'cancel' },
      CTX(),
    )
    resetObjectCounter()
    const [fromIcons] = symbolHuntTemplate.generate(
      { ...base, symbolType: 'icons', task: 'cancel' },
      CTX(),
    )
    expect(contentFingerprint(fromShapes!.objects)).toBe(
      contentFingerprint(fromIcons!.objects),
    )
  })

  it('single-target totals jitter across seeds (not a fixed density)', () => {
    const totals = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const field = buildField({
        symbolType: 'icons',
        targetCount: 1,
        totalCells: 225,
        cols: 15,
        rows: 15,
        discrimination: 'standard',
        rng: createRng(3_000 + i * 97),
      })
      const target = field.targets[0]!
      totals.add(field.counts[target]!)
    }
    // Fixed 0.22 × 225 always yielded 50 — jitter must produce more than one total.
    expect(totals.size).toBeGreaterThan(1)
    expect(totals.has(50) && totals.size === 1).toBe(false)
  })

  it('distractors never include targets', () => {
    const rng = createRng(99)
    for (const discrimination of ['easy', 'standard', 'hard'] as const) {
      const targets = pickTargets('icons', 2, rng)
      const distractors = pickDistractors('icons', targets, discrimination, rng)
      for (const t of targets) {
        expect(distractors.includes(t)).toBe(false)
      }
      expect(distractors.length).toBeGreaterThan(0)
    }
  })

  it('clampTargetCount stays in 1–3', () => {
    expect(clampTargetCount(0)).toBe(1)
    expect(clampTargetCount(2.4)).toBe(2)
    expect(clampTargetCount(9)).toBe(3)
  })

  it('uses monochrome answer ink on the key page', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('symbol-hunt')).toBe(true)
    resetObjectCounter()
    const [page] = symbolHuntTemplate.generate({ ...base, task: 'count' }, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO || o.type === 'circle')).toBe(
      true,
    )
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('dense cancel mode stays inside the safe margin', () => {
    resetObjectCounter()
    expect(() =>
      symbolHuntTemplate.generate(
        { ...base, task: 'cancel', density: 'dense', targetCount: 3 },
        CTX(),
      ),
    ).not.toThrow()
  })

  it('bulk-sized seed batch yields distinct sheets (no duplicates)', () => {
    const bulkTotal = 50
    const seen = new Set<string>()
    for (let i = 0; i < bulkTotal; i++) {
      const seed = 2_000 + i * 11_003
      resetObjectCounter()
      const [page] = symbolHuntTemplate.generate(
        { ...base, seed, task: 'cancel', density: 'medium', targetCount: 2 },
        { ...CTX(), seed },
      )
      seen.add(contentFingerprint(page!.objects))
    }
    expect(seen.size).toBe(bulkTotal)
  })

  it('bulk mark-and-count with one target does not repeat the same answer', () => {
    const answerTotals = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const seed = 5_000 + i * 1_301
      resetObjectCounter()
      const [page] = symbolHuntTemplate.generate(
        { ...base, seed, task: 'both', density: 'medium', targetCount: 1 },
        { ...CTX(), seed },
      )
      const countAnswers = harvestAnswers(page!.objects).filter((o) => o.type !== 'circle')
      answerTotals.add(countAnswers.map((o) => String(o.text)).join('|'))
    }
    expect(answerTotals.size).toBeGreaterThan(1)
  })
})
