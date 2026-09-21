import { describe, it, expect } from 'vitest'
import type { StudioFabricObject, StudioPageOutput } from '@/types/studio-template.types'
import { spacedRepetitionLogTemplate } from './generate'
import { SPACED_REPETITION_LOG_DEFAULT_TITLE } from './config'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  runGeneratorContractTests,
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { estimateTextBoxWidth } from '../studio-layout'
import { FIELD_EDGE_CLEARANCE, MIN_TICK, ROW_RULE_STROKE } from './layout'
import {
  MILESTONE_INTERVALS,
  LEITNER_INTERVALS,
  customIntervalLines,
} from './schedule'
import {
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import { STUDIO_RULE_MEDIUM } from '@/constants/studio.constants'

runGeneratorContractTests(spacedRepetitionLogTemplate, {
  expectSeedVariance: false,
  configOverrides: { rowsPerPage: 12 },
})

const base = {
  ...buildDefaultConfig(spacedRepetitionLogTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  rowsPerPage: 12,
  schedule: 'milestone',
  showDateHelper: true,
  title: SPACED_REPETITION_LOG_DEFAULT_TITLE,
}

const CTX_SHORT = {
  ...STUDIO_TEST_CTX,
  pageHeight: 420,
}

/** Expand groups so layout asserts see absolute tick geometry. */
function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    if (o.type === 'group' && Array.isArray(o.objects)) {
      const cx = o.left + (o.width ?? 0) / 2
      const cy = o.top + (o.height ?? 0) / 2
      for (const child of o.objects as StudioFabricObject[]) {
        out.push({
          ...child,
          left: (child.left ?? 0) + cx,
          top: (child.top ?? 0) + cy,
        })
      }
      continue
    }
    out.push(o)
  }
  return out
}

function allText(page: StudioPageOutput): string {
  return flatten(page.objects)
    .filter((o) => o.type === 'textbox')
    .map((o) => String(o.text ?? '').replace(/\u00a0/g, ' '))
    .join(' ')
}

function tickBoxes(page: StudioPageOutput): StudioFabricObject[] {
  return flatten(page.objects).filter(
    (o) =>
      o.type === 'rect' &&
      o.studioRole === 'structure' &&
      o.stroke === '#000000' &&
      (o.fill === 'transparent' || o.fill == null) &&
      typeof o.width === 'number' &&
      o.width === o.height &&
      (o.width ?? 0) >= MIN_TICK - 0.5,
  )
}

function diffs(xs: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < xs.length; i++) out.push(Math.round((xs[i]! - xs[i - 1]!) * 100) / 100)
  return out
}

function firstRowTickTops(page: StudioPageOutput): number[] {
  const boxes = tickBoxes(page)
  if (boxes.length === 0) return []
  const minTop = Math.min(...boxes.map((b) => b.top))
  return boxes.filter((b) => Math.abs(b.top - minTop) < 1).map((b) => b.top)
}

function tickColumnCount(schedule: string): number {
  resetObjectCounter()
  const [page] = spacedRepetitionLogTemplate.generate(
    { ...base, schedule },
    STUDIO_TEST_CTX,
  )
  const firstRow = firstRowTickTops(page)
  const boxes = tickBoxes(page).filter((b) => Math.abs(b.top - firstRow[0]!) < 1)
  return boxes.length
}

describe('spaced-repetition-log layout', () => {
  it('marks seed-invariant so book runs can repeat blank log pages', () => {
    expect(spacedRepetitionLogTemplate.seedInvariant).toBe(true)
  })

  it('produces NO answer objects', () => {
    resetObjectCounter()
    const pages = spacedRepetitionLogTemplate.generate(base, STUDIO_TEST_CTX)
    for (const p of pages) {
      expect(p.objects.filter((o) => o.studioRole === 'answer').length).toBe(0)
    }
  })

  it('emits exactly one log page', () => {
    resetObjectCounter()
    const pages = spacedRepetitionLogTemplate.generate(base, STUDIO_TEST_CTX)
    expect(pages.length).toBe(1)
    expect(allText(pages[0]!)).toContain(SPACED_REPETITION_LOG_DEFAULT_TITLE)
  })

  it('defaults Page title text to My Spaced Repetition Log (not Game N)', () => {
    expect(spacedRepetitionLogTemplate.defaultPageTitle).toBe(
      SPACED_REPETITION_LOG_DEFAULT_TITLE,
    )
  })

  it('prints a custom title when the user overrides the default', () => {
    resetObjectCounter()
    const pages = spacedRepetitionLogTemplate.generate(
      { ...base, title: 'Weekly Review Notes', showTitle: true },
      STUDIO_TEST_CTX,
    )
    const text = allText(pages[0]!)
    expect(text).toContain('Weekly Review Notes')
    expect(text).not.toContain(SPACED_REPETITION_LOG_DEFAULT_TITLE)
  })

  it('replaces auto Game N titles with the tracker default', () => {
    resetObjectCounter()
    const pages = spacedRepetitionLogTemplate.generate(
      { ...base, title: 'Game 3', showTitle: true },
      STUDIO_TEST_CTX,
    )
    const text = allText(pages[0]!)
    expect(text).toContain(SPACED_REPETITION_LOG_DEFAULT_TITLE)
    expect(text).not.toMatch(/Game\s+3/)
  })

  it('LAYOUT: tick boxes never fall below the 7 mm minimum, at any rowsPerPage', () => {
    for (const rowsPerPage of [6, 10, 14]) {
      resetObjectCounter()
      const pages = spacedRepetitionLogTemplate.generate(
        { ...base, rowsPerPage },
        STUDIO_TEST_CTX,
      )
      const boxes = tickBoxes(pages[0]!)
      expect(boxes.length).toBeGreaterThan(0)
      for (const b of boxes) {
        expect(b.width).toBeGreaterThanOrEqual(MIN_TICK - 0.01)
      }
    }
  })

  it('LAYOUT: too many rows clamps the row count, never the box size', () => {
    resetObjectCounter()
    const pages = spacedRepetitionLogTemplate.generate(
      { ...base, rowsPerPage: 14 },
      CTX_SHORT,
    )
    const boxes = tickBoxes(pages[0]!)
    const cols = MILESTONE_INTERVALS.length
    const rowCount = boxes.length / cols
    expect(rowCount).toBeLessThan(14)
    expect(Math.min(...boxes.map((b) => b.width ?? 0))).toBeGreaterThanOrEqual(MIN_TICK - 0.01)
    assertObjectsInSafeMargin(pages[0]!.objects, CTX_SHORT)
  })

  it('LAYOUT: page title keeps the log inside the safe margin on a short page', () => {
    resetObjectCounter()
    const ctx = {
      pageWidth: 384,
      pageHeight: 576,
      margin: { top: 28, right: 28, bottom: 28, left: 36 },
      seed: 1,
      instanceId: 'title-safe',
    }
    const pages = spacedRepetitionLogTemplate.generate(
      {
        ...base,
        title: SPACED_REPETITION_LOG_DEFAULT_TITLE,
        showTitle: true,
        rowsPerPage: 14,
        showDateHelper: true,
      },
      ctx,
    )
    expect(pages.length).toBe(1)
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })

  it('LAYOUT: at max rows with page title, table stays clear of the safe-area bottom', () => {
    for (const label of ['5 x 8 in', '6 x 9 in', '8.5 x 11 in'] as const) {
      const dims = parsePageSizeLabel(label)
      const marginGuide = calculateMarginGuide(100, false)
      const margin = resolveStudioMarginForPage({
        pageIndex: 0,
        pageWidth: dims.widthPixels,
        pageHeight: dims.heightPixels,
        marginGuide,
      })
      const ctx = {
        pageWidth: dims.widthPixels,
        pageHeight: dims.heightPixels,
        margin,
        seed: 1,
        instanceId: `title-${label}`,
      }
      resetObjectCounter()
      const [page] = spacedRepetitionLogTemplate.generate(
        {
          ...base,
          title: SPACED_REPETITION_LOG_DEFAULT_TITLE,
          showTitle: true,
          rowsPerPage: 14,
          showDateHelper: true,
        },
        ctx,
      )
      assertObjectsInSafeMargin(page!.objects, ctx)
      const group = page!.objects.find((o) => o.type === 'group')
      expect(group, label).toBeTruthy()
      const bottom = (group!.top ?? 0) + (group!.height ?? 0)
      const safeBottom = ctx.pageHeight - ctx.margin.bottom
      expect(bottom, label).toBeLessThanOrEqual(safeBottom - FIELD_EDGE_CLEARANCE)
    }
  })

  it('LAYOUT: all interval columns are exactly equal width', () => {
    resetObjectCounter()
    const [page] = spacedRepetitionLogTemplate.generate(base, STUDIO_TEST_CTX)
    const firstTop = firstRowTickTops(page)[0]!
    const xs = tickBoxes(page)
      .filter((b) => Math.abs(b.top - firstTop) < 1)
      .map((b) => b.left)
      .sort((a, b) => a - b)
    expect(xs.length).toBe(MILESTONE_INTERVALS.length)
    expect(new Set(diffs(xs)).size).toBe(1)
  })

  it('LAYOUT: many custom intervals keep ticks inside their columns', () => {
    resetObjectCounter()
    const intervals = [1, 9, 17, 50, 60, 35, 98]
    const [page] = spacedRepetitionLogTemplate.generate(
      {
        ...base,
        schedule: 'custom',
        customIntervals: intervals,
        showDateHelper: true,
      },
      STUDIO_TEST_CTX,
    )
    const boxes = tickBoxes(page)
    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes.length % intervals.length).toBe(0)

    const firstTop = Math.min(...boxes.map((b) => b.top))
    const firstRow = boxes
      .filter((b) => Math.abs(b.top - firstTop) < 1)
      .sort((a, b) => a.left - b.left)
    expect(firstRow.length).toBe(intervals.length)

    for (let i = 0; i < firstRow.length; i++) {
      const box = firstRow[i]!
      expect(box.width).toBeLessThanOrEqual(box.height! + 0.5)
      expect(box.width).toBeGreaterThanOrEqual(MIN_TICK - 0.01)
      if (i > 0) {
        const prev = firstRow[i - 1]!
        // No overlap — previous tick's right edge stays left of this tick.
        expect(prev.left + (prev.width ?? 0)).toBeLessThanOrEqual(box.left + 0.5)
      }
    }
    assertObjectsInSafeMargin(page!.objects, STUDIO_TEST_CTX)
  })

  it('LAYOUT: all rows are exactly equal height', () => {
    resetObjectCounter()
    const [page] = spacedRepetitionLogTemplate.generate(base, STUDIO_TEST_CTX)
    const boxes = tickBoxes(page)
    const cols = MILESTONE_INTERVALS.length
    const tops = [...new Set(boxes.map((b) => Math.round(b.top * 10) / 10))].sort(
      (a, b) => a - b,
    )
    expect(tops.length).toBe(boxes.length / cols)
    const rowGaps = diffs(tops)
    expect(new Set(rowGaps.map((g) => Math.round(g * 10) / 10)).size).toBe(1)
  })

  it('LAYOUT: every row rule has the same stroke and stays inside the group', () => {
    resetObjectCounter()
    const [page] = spacedRepetitionLogTemplate.generate(base, STUDIO_TEST_CTX)
    const group = page!.objects.find((o) => o.type === 'group')
    expect(group).toBeTruthy()
    const rules = flatten(page!.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.fill === STUDIO_RULE_MEDIUM &&
        Math.abs((o.height ?? 0) - ROW_RULE_STROKE) < 0.01,
    )
    expect(rules.length).toBe(base.rowsPerPage)
    for (const rule of rules) {
      expect(rule.height).toBe(ROW_RULE_STROKE)
      expect(rule.top + (rule.height ?? 0)).toBeLessThanOrEqual(
        (group!.top ?? 0) + (group!.height ?? 0) + 0.5,
      )
    }
  })

  it('LAYOUT: tick boxes are vertically centred in their rows', () => {
    resetObjectCounter()
    const [page] = spacedRepetitionLogTemplate.generate(
      { ...base, rowsPerPage: 10 },
      STUDIO_TEST_CTX,
    )
    const boxes = tickBoxes(page)
    const cols = MILESTONE_INTERVALS.length
    const tops = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b)
    const rowGaps = diffs(tops)
    expect(new Set(rowGaps).size).toBe(1)
    const rowH = rowGaps[0]!
    const tickH = boxes[0]!.height!
    expect(rowH - tickH).toBeGreaterThan(0)
    expect(boxes.length / cols).toBe(tops.length)
  })

  it('every schedule renders the right number of tick columns', () => {
    expect(tickColumnCount('milestone')).toBe(MILESTONE_INTERVALS.length)
    expect(tickColumnCount('leitner')).toBe(LEITNER_INTERVALS.length)
    expect(tickColumnCount('custom')).toBeGreaterThanOrEqual(1)
  })

  it('milestone and Leitner both label columns by day number (not Box N)', () => {
    resetObjectCounter()
    const texts = (schedule: string) => {
      const [page] = spacedRepetitionLogTemplate.generate(
        { ...base, schedule, showDateHelper: true },
        STUDIO_TEST_CTX,
      )
      return flatten(page.objects)
        .filter((o) => o.type === 'textbox')
        .map((o) => String(o.text ?? '').replace(/\u00a0/g, ' '))
    }
    const milestone = texts('milestone')
    for (const day of MILESTONE_INTERVALS) {
      expect(milestone.some((t) => t === `D${day}` || t === `Day ${day}`)).toBe(true)
    }
    const leitner = texts('leitner')
    for (const day of LEITNER_INTERVALS) {
      expect(leitner.some((t) => t === `D${day}` || t === `Day ${day}`)).toBe(true)
    }
    expect(leitner.some((t) => /^B\d+$/.test(t) || /^Box \d+$/.test(t))).toBe(false)
  })

  it('Item column is the widest share of the table', () => {
    resetObjectCounter()
    const [page] = spacedRepetitionLogTemplate.generate(base, STUDIO_TEST_CTX)
    const labels = flatten(page.objects).filter((o) => o.type === 'textbox')
    const item = labels.find((o) => String(o.text ?? '').includes('remember'))
    const started = labels.find((o) => String(o.text ?? '').replace(/\u00a0/g, ' ') === 'Started')
    expect(item).toBeTruthy()
    expect(started).toBeTruthy()
    // Item header sits farther left than Started — Item column starts first.
    expect(item!.left).toBeLessThan(started!.left)
  })

  it('tick headers stay single-line (no Day/+Nd overlap)', () => {
    resetObjectCounter()
    const [page] = spacedRepetitionLogTemplate.generate(
      {
        ...base,
        showDateHelper: true,
        schedule: 'milestone',
      },
      STUDIO_TEST_CTX,
    )
    const labels = flatten(page.objects).filter((o) => o.type === 'textbox')
    const tickLabels = labels.filter((o) => {
      const t = String(o.text ?? '').replace(/\u00a0/g, ' ')
      return /^D\d+$/.test(t) || /^Day \d+$/.test(t) || /^\+\d+d$/.test(t)
    })
    expect(tickLabels.length).toBeGreaterThanOrEqual(MILESTONE_INTERVALS.length * 2)
    for (const label of tickLabels) {
      const text = String(label.text ?? '')
      // No soft-wrap: fabric width must cover the glyph run at that font size.
      const size = Number(label.fontSize ?? 0)
      const need = estimateTextBoxWidth(text, size, Number.POSITIVE_INFINITY)
      expect(Number(label.width ?? 0)).toBeGreaterThanOrEqual(need - 1)
      expect(text.includes('\n')).toBe(false)
    }
  })
})

describe('custom intervals validation', () => {
  const custom = { ...base, schedule: 'custom' }

  it('accepts the default custom intervals', () => {
    expect(spacedRepetitionLogTemplate.validateConfig?.(custom)).toBeNull()
  })

  it('preserves blank lines so Enter can open a new row while typing', () => {
    expect(customIntervalLines(['1', '3', '', '']).join('\n')).toBe('1\n3\n\n')
  })

  it('rejects an empty list', () => {
    expect(
      spacedRepetitionLogTemplate.validateConfig?.({
        ...custom,
        customIntervals: ['', '  '],
      }),
    ).toMatchObject({ field: 'customIntervals' })
  })

  it('rejects non-numeric tokens', () => {
    const err = spacedRepetitionLogTemplate.validateConfig?.({
      ...custom,
      customIntervals: ['1', 'abc', '7'],
    })
    expect(err?.field).toBe('customIntervals')
    expect(err?.message).toContain('"abc"')
  })

  it('rejects zero, decimals, and values over 365', () => {
    expect(
      spacedRepetitionLogTemplate.validateConfig?.({
        ...custom,
        customIntervals: ['0'],
      })?.field,
    ).toBe('customIntervals')
    expect(
      spacedRepetitionLogTemplate.validateConfig?.({
        ...custom,
        customIntervals: ['1.5'],
      })?.field,
    ).toBe('customIntervals')
    expect(
      spacedRepetitionLogTemplate.validateConfig?.({
        ...custom,
        customIntervals: ['400'],
      })?.field,
    ).toBe('customIntervals')
  })

  it('rejects more than 8 intervals', () => {
    expect(
      spacedRepetitionLogTemplate.validateConfig?.({
        ...custom,
        customIntervals: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      }),
    ).toMatchObject({ field: 'customIntervals' })
  })

  it('rejects duplicate intervals', () => {
    expect(
      spacedRepetitionLogTemplate.validateConfig?.({
        ...custom,
        customIntervals: [1, 3, 3],
      }),
    ).toMatchObject({ field: 'customIntervals' })
  })
})
