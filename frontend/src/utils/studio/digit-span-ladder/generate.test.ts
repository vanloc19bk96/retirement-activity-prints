import { describe, it, expect } from 'vitest'
import { digitSpanLadderTemplate, buildLadder } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { clampStudioConfigToSchema } from '../studio-config-fields'
import { runGeneratorContractTests } from '../studio-generator-test'
import { STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flattenObjects(obj.objects ?? [])])
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: StudioConfig = {
  ...buildDefaultConfig(digitSpanLadderTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(digitSpanLadderTemplate)

describe('digit-span-ladder', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = digitSpanLadderTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = digitSpanLadderTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different digit strings', () => {
    resetObjectCounter()
    const a = JSON.stringify(digitSpanLadderTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      digitSpanLadderTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('does not offer an answer-key page', () => {
    expect(digitSpanLadderTemplate.producesAnswerKey).toBe(false)
  })

  it('emits no hidden answer objects', () => {
    resetObjectCounter()
    const pages = digitSpanLadderTemplate.generate(base, CTX())
    const answers = pages.flatMap((p) => p.objects.filter((o) => o.studioRole === 'answer'))
    expect(answers).toHaveLength(0)
  })

  it('backward answers are the reverse of the shown sequence', () => {
    const rng = createRng(42)
    const rungs = buildLadder(3, 5, 2, 'backward', rng)
    for (const rung of rungs) {
      expect(rung.answer).toEqual([...rung.digits].reverse())
      expect(rung.digits).toHaveLength(rung.length)
      expect(rung.digits.every((d) => d >= 0 && d <= 9)).toBe(true)
    }
  })

  it('buildLadder climbs start→end with trialsPerLength rows each', () => {
    const rungs = buildLadder(3, 5, 2, 'forward', createRng(1))
    expect(rungs.map((r) => r.length)).toEqual([3, 3, 4, 4, 5, 5])
    for (const rung of rungs) {
      expect(rung.answer).toEqual(rung.digits)
    }
  })

  it('both mode produces two pages', () => {
    resetObjectCounter()
    const pages = digitSpanLadderTemplate.generate({ ...base, direction: 'both' }, CTX())
    expect(pages.length).toBe(2)
  })

  it('spread mode produces study then recall', () => {
    resetObjectCounter()
    const pages = digitSpanLadderTemplate.generate({ ...base, mode: 'spread' }, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('handles endLength < startLength by clamping', () => {
    resetObjectCounter()
    expect(() =>
      digitSpanLadderTemplate.generate({ ...base, startLength: 6, endLength: 4 }, CTX()),
    ).not.toThrow()
    const [page] = digitSpanLadderTemplate.generate(
      { ...base, startLength: 6, endLength: 4 },
      CTX(),
    )
    // Clamped end = start (6), so only length-6 rungs remain (2 tries each).
    const prompts = flattenObjects(page.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBe(2)
  })

  it('form schema keeps Start length ≤ End length', () => {
    const raisedStart = clampStudioConfigToSchema(digitSpanLadderTemplate.configSchema, {
      ...base,
      startLength: 6,
      endLength: 4,
    })
    expect(Number(raisedStart.startLength)).toBeLessThanOrEqual(Number(raisedStart.endLength))

    const loweredEnd = clampStudioConfigToSchema(digitSpanLadderTemplate.configSchema, {
      ...base,
      startLength: 5,
      endLength: 3,
    })
    expect(Number(loweredEnd.startLength)).toBeLessThanOrEqual(Number(loweredEnd.endLength))
    expect(Number(loweredEnd.endLength)).toBeGreaterThanOrEqual(4)
  })

  it('does not render Len labels or length numbers on the canvas', () => {
    resetObjectCounter()
    const pages = digitSpanLadderTemplate.generate(
      { ...base, mode: 'spread', direction: 'both' },
      CTX(),
    )
    const texts = pages.flatMap((page) =>
      page.objects.flatMap((obj) => {
        const nested = obj.objects ?? []
        return [obj, ...nested]
          .map((o) => o.text)
          .filter((t): t is string => typeof t === 'string')
      }),
    )
    expect(texts.some((t) => t === 'Len')).toBe(false)
    // Length column used to show single-digit rung lengths like "3"/"4".
    expect(texts.some((t) => /^\d$/.test(t))).toBe(false)
  })

  it('keeps direction banner on one line', () => {
    resetObjectCounter()
    const [page] = digitSpanLadderTemplate.generate(base, CTX())
    const banner = page.objects.find(
      (o) =>
        o.studioRole === 'decoration' &&
        typeof o.text === 'string' &&
        o.text.includes('FORWARD'),
    )
    expect(banner).toBeDefined()
    const text = String(banner?.text ?? '')
    expect(text.includes('\n')).toBe(false)
    expect(text.includes(' ')).toBe(false)
    expect(text.includes('\u00a0')).toBe(true)
  })

  it('keeps digit prompts on one line inside the content width', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = digitSpanLadderTemplate.generate(
      { ...base, startLength: 3, endLength: 9 },
      ctx,
    )
    const maxRight = ctx.pageWidth - ctx.margin.right
    const prompts = flattenObjects(page.objects).filter((o) => o.studioRole === 'prompt')
    expect(prompts.length).toBeGreaterThan(0)
    for (const prompt of prompts) {
      const text = String(prompt.text ?? '')
      expect(text.includes('\n')).toBe(false)
      expect(prompt.left + (prompt.width ?? 0)).toBeLessThanOrEqual(maxRight + 1)
      // Fitted size must keep the spaced glyph run inside the assigned textbox width.
      const fontSize = prompt.fontSize ?? 0
      let units = 0
      for (const ch of text) {
        units += ch === ' ' || ch === '\u00a0' ? 0.3 : 0.62
      }
      const needed = Math.ceil(units * fontSize + 4)
      expect(needed).toBeLessThanOrEqual((prompt.width ?? 0) + 1)
    }
  })

  it('cover page uses a 2-col grid-copy style table inside the safe area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = digitSpanLadderTemplate.generate(base, ctx)
    const groups = page.objects.filter((o) => String(o.type).toLowerCase() === 'group')
    expect(groups.length).toBe(1)
    const nested = groups[0].objects ?? []
    const bars = nested.filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.fill === STUDIO_RULE_MEDIUM &&
        (o.strokeWidth === 0 || o.stroke === 'transparent'),
    )
    // Outer + internal grid bars (2 cols → 3 vertical; n+1 rows → n+2 horizontal) + writing lines.
    expect(bars.length).toBeGreaterThan(5)
    expect(bars.some((b) => (b.height ?? 0) <= STUDIO_STROKE_HAIRLINE + 0.1)).toBe(true)

    const safeLeft = ctx.margin.left
    const safeRight = ctx.pageWidth - ctx.margin.right
    const safeTop = ctx.margin.top
    const safeBottom = ctx.pageHeight - ctx.margin.bottom
    const table = groups[0]
    expect(table.left).toBeGreaterThanOrEqual(safeLeft)
    expect(table.left + (table.width ?? 0)).toBeLessThanOrEqual(safeRight)
    expect(table.top).toBeGreaterThanOrEqual(safeTop)
    expect(table.top + (table.height ?? 0)).toBeLessThanOrEqual(safeBottom)

    const headers = nested
      .filter((o) => o.studioRole === 'decoration')
      .map((o) => String(o.text ?? ''))
    expect(headers).toContain('Sequence')
    expect(headers).toContain('Your answer')
  })

  it('spread study page lays rungs in a 2-col bordered table group', () => {
    resetObjectCounter()
    const ctx = CTX()
    const pages = digitSpanLadderTemplate.generate({ ...base, mode: 'spread' }, ctx)
    const study = pages[0]
    const groups = study.objects.filter((o) => String(o.type).toLowerCase() === 'group')
    expect(groups.length).toBe(1)
    const nested = groups[0].objects ?? []
    const bars = nested.filter(
      (o) => o.type === 'rect' && o.fill === STUDIO_RULE_MEDIUM,
    )
    expect(bars.length).toBeGreaterThan(4)
    const prompts = nested.filter((o) => o.studioRole === 'prompt')
    const rungs = (Number(base.endLength) - Number(base.startLength) + 1) * 2
    expect(prompts.length).toBe(rungs)

    // Table block is centered in the content area.
    const contentLeft = ctx.margin.left
    const contentRight = ctx.pageWidth - ctx.margin.right
    const contentMid = (contentLeft + contentRight) / 2
    const tableMid = groups[0].left + (groups[0].width ?? 0) / 2
    expect(Math.abs(tableMid - contentMid)).toBeLessThan(2)
  })

  it('spread with one length uses two tries and fills both columns', () => {
    resetObjectCounter()
    const pages = digitSpanLadderTemplate.generate(
      { ...base, mode: 'spread', startLength: 6, endLength: 6 },
      CTX(),
    )
    const studyNested =
      pages[0].objects.find((o) => String(o.type).toLowerCase() === 'group')?.objects ?? []
    const recallNested =
      pages[1].objects.find((o) => String(o.type).toLowerCase() === 'group')?.objects ?? []
    expect(studyNested.filter((o) => o.text === 'Sequence')).toHaveLength(2)
    expect(recallNested.filter((o) => o.text === 'Your answer')).toHaveLength(2)
    expect(studyNested.filter((o) => o.studioRole === 'prompt')).toHaveLength(2)
  })

  it('spread recall page matches study cols, rows, and table size', () => {
    resetObjectCounter()
    const pages = digitSpanLadderTemplate.generate({ ...base, mode: 'spread' }, CTX())
    const studyGroup = pages[0].objects.find((o) => String(o.type).toLowerCase() === 'group')
    const recallGroup = pages[1].objects.find((o) => String(o.type).toLowerCase() === 'group')
    expect(studyGroup).toBeDefined()
    expect(recallGroup).toBeDefined()
    expect(recallGroup?.width).toBe(studyGroup?.width)
    expect(recallGroup?.height).toBe(studyGroup?.height)

    const studyNested = studyGroup?.objects ?? []
    const recallNested = recallGroup?.objects ?? []
    expect(studyNested.filter((o) => o.text === 'Sequence')).toHaveLength(2)
    expect(recallNested.filter((o) => o.text === 'Your answer')).toHaveLength(2)

    const rungs = (Number(base.endLength) - Number(base.startLength) + 1) * 2
    // Writing lines are inset cell-width bars (not full-width horizontal grid rules).
    const tableW = recallGroup?.width ?? 0
    const writingLines = recallNested.filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.fill === STUDIO_RULE_MEDIUM &&
        (o.height ?? 0) <= STUDIO_STROKE_HAIRLINE + 0.1 &&
        (o.width ?? 0) > STUDIO_STROKE_HAIRLINE + 1 &&
        (o.width ?? 0) < tableW * 0.6,
    )
    expect(writingLines.length).toBe(rungs)
    expect(studyNested.filter((o) => o.studioRole === 'prompt')).toHaveLength(rungs)
  })
})
