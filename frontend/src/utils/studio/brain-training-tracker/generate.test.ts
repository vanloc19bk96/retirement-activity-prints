import { describe, it, expect } from 'vitest'
import type { StudioFabricObject, StudioPageOutput } from '@/types/studio-template.types'
import { brainTrainingTrackerTemplate } from './generate'
import { PUZZLE_LOG_DEFAULT_TITLE } from './config'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  runGeneratorContractTests,
  assertObjectsInSafeMargin,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import {
  COL_HEADER_SIZE,
  FIELD_EDGE_CLEARANCE,
  MAX_ROWS,
  MIN_TICK,
  computePuzzleLogLayout,
} from './layout'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
} from '../studio-layout'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'

runGeneratorContractTests(brainTrainingTrackerTemplate, {
  expectSeedVariance: false,
  configOverrides: { rowsPerPage: 10 },
})

const base = {
  ...buildDefaultConfig(brainTrainingTrackerTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  rowsPerPage: 10,
  showTimeTaken: false,
  showEnjoyment: true,
  notesWidth: 'wide',
  title: 'My Puzzle Log',
}

const CTX_SHORT = {
  ...STUDIO_TEST_CTX,
  pageHeight: 420,
}

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

function columnHeaders(page: StudioPageOutput): string[] {
  return flatten(page.objects)
    .filter((o) => o.type === 'textbox' && o.studioRole === 'decoration')
    .map((o) => String(o.text ?? '').replace(/\u00a0/g, ' '))
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

function scaleCircles(page: StudioPageOutput): StudioFabricObject[] {
  return flatten(page.objects).filter(
    (o) =>
      o.type === 'circle' &&
      o.studioRole === 'structure' &&
      typeof o.radius === 'number' &&
      (o.radius ?? 0) * 2 >= MIN_TICK - 0.5,
  )
}

function diffs(xs: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < xs.length; i++) out.push(Math.round((xs[i]! - xs[i - 1]!) * 100) / 100)
  return out
}

function layoutFor(config: Record<string, unknown>, ctx = STUDIO_TEST_CTX) {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    { ...config, title: String(config.title ?? 'My Puzzle Log'), showInstructions: false },
    {
      templateKey: 'brain-training-tracker',
      instanceId: ctx.instanceId,
      pageRole: 'single',
    },
    '',
  )
  return computePuzzleLogLayout({
    area: header.body,
    requestedRows: Number(config.rowsPerPage ?? 10),
    showTime: config.showTimeTaken === true,
    showEnjoy: config.showEnjoyment !== false,
    wideNotes: config.notesWidth !== 'standard',
  })
}

describe('brain-training-tracker', () => {
  it('marks seed-invariant so book runs can repeat blank log pages', () => {
    expect(brainTrainingTrackerTemplate.seedInvariant).toBe(true)
  })

  it('produces NO answer objects', () => {
    resetObjectCounter()
    const pages = brainTrainingTrackerTemplate.generate(base, STUDIO_TEST_CTX)
    for (const p of pages) {
      expect(p.objects.filter((o) => o.studioRole === 'answer').length).toBe(0)
    }
  })

  it('emits exactly one log page per generate', () => {
    resetObjectCounter()
    const pages = brainTrainingTrackerTemplate.generate(base, STUDIO_TEST_CTX)
    expect(pages.length).toBe(1)
    expect(allText(pages[0]!)).toContain('My Puzzle Log')
    expect(allText(pages[0]!).toLowerCase()).not.toContain('about this puzzle log')
  })

  // ── §2 COMPLIANCE GATE ───────────────────────────────────────────────────
  it('COMPLIANCE: no disclaimer or scale-hint footer on the page', () => {
    resetObjectCounter()
    const pages = brainTrainingTrackerTemplate.generate(
      { ...base, showEnjoyment: true },
      STUDIO_TEST_CTX,
    )
    const text = allText(pages[0]!)
    expect(text).not.toContain('It is not a test')
    expect(text).not.toContain('Mark one:')
    expect(text.toLowerCase()).not.toContain('loved it')
  })

  it('COMPLIANCE: no forbidden claim words appear on log pages', () => {
    const FORBIDDEN =
      /\b(improve|improvement|progress|performance|score|results?|sharper?|decline|dementia|alzheimer|memory loss|brain health)\b/i
    resetObjectCounter()
    const pages = brainTrainingTrackerTemplate.generate(base, STUDIO_TEST_CTX)
    for (const p of pages) {
      expect(allText(p)).not.toMatch(FORBIDDEN)
    }
  })

  it('COMPLIANCE: there is no score column and no chart geometry', () => {
    resetObjectCounter()
    const [page] = brainTrainingTrackerTemplate.generate(base, STUDIO_TEST_CTX)
    const headers = columnHeaders(page!).join(' ')
    expect(headers.toLowerCase()).not.toContain('score')
    expect(flatten(page!.objects).some((o) => String(o.type) === 'polyline')).toBe(false)
  })

  // ── LAYOUT GATE (§5) ─────────────────────────────────────────────────────
  it('LAYOUT: tick boxes never fall below the minimum, at any rowsPerPage', () => {
    for (const rowsPerPage of [5, 8, 12, MAX_ROWS]) {
      resetObjectCounter()
      const pages = brainTrainingTrackerTemplate.generate(
        { ...base, rowsPerPage },
        STUDIO_TEST_CTX,
      )
      const boxes = tickBoxes(pages[0]!)
      expect(boxes.length).toBe(rowsPerPage)
      for (const b of boxes) {
        expect(b.width).toBeGreaterThanOrEqual(MIN_TICK - 0.01)
      }
    }
  })

  it('LAYOUT: rowsPerPage matches canvas rows on 6×9 and letter', () => {
    for (const label of ['6 x 9 in', '8.5 x 11 in'] as const) {
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
        instanceId: `rows-${label}`,
      }
      for (let rowsPerPage = 5; rowsPerPage <= MAX_ROWS; rowsPerPage++) {
        const layout = layoutFor({ ...base, rowsPerPage, showTimeTaken: true }, ctx)
        expect(layout.rows, `${label} rowsPerPage=${rowsPerPage}`).toBe(rowsPerPage)
      }
    }
  })

  it('LAYOUT: enjoyment circles never fall below the 7 mm minimum', () => {
    resetObjectCounter()
    const [page] = brainTrainingTrackerTemplate.generate(
      { ...base, showEnjoyment: true },
      STUDIO_TEST_CTX,
    )
    const circles = scaleCircles(page!)
    expect(circles.length).toBeGreaterThan(0)
    for (const c of circles) {
      expect((c.radius ?? 0) * 2).toBeGreaterThanOrEqual(MIN_TICK - 0.01)
    }
  })

  it('LAYOUT: too many rows clamps the row count, never the field size', () => {
    resetObjectCounter()
    const pages = brainTrainingTrackerTemplate.generate(
      { ...base, rowsPerPage: MAX_ROWS },
      CTX_SHORT,
    )
    const boxes = tickBoxes(pages[0]!)
    expect(boxes.length).toBeLessThan(MAX_ROWS)
    expect(Math.min(...boxes.map((b) => b.width ?? 0))).toBeGreaterThanOrEqual(MIN_TICK - 0.01)
    assertObjectsInSafeMargin(pages[0]!.objects, CTX_SHORT)
  })

  it('LAYOUT: densest options with page title stay clear of the safe area', () => {
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
      const [page] = brainTrainingTrackerTemplate.generate(
        {
          ...base,
          title: 'My Puzzle Log',
          showTitle: true,
          rowsPerPage: 6,
          showTimeTaken: true,
          showEnjoyment: true,
          notesWidth: 'wide',
        },
        ctx,
      )
      assertObjectsInSafeMargin(page!.objects, ctx)
      const group = page!.objects.find((o) => o.type === 'group')
      expect(group, label).toBeTruthy()
      const left = group!.left ?? 0
      const right = left + (group!.width ?? 0)
      const top = group!.top ?? 0
      const bottom = top + (group!.height ?? 0)
      const safeLeft = ctx.margin.left
      const safeRight = ctx.pageWidth - ctx.margin.right
      const safeTop = ctx.margin.top
      const safeBottom = ctx.pageHeight - ctx.margin.bottom
      expect(left, label).toBeGreaterThanOrEqual(safeLeft - 1)
      expect(right, label).toBeLessThanOrEqual(safeRight + 1)
      expect(top, label).toBeGreaterThanOrEqual(safeTop + FIELD_EDGE_CLEARANCE - 1)
      expect(bottom, label).toBeLessThanOrEqual(safeBottom - FIELD_EDGE_CLEARANCE + 1)
    }
  })

  it('LAYOUT: Notes is the widest column', () => {
    for (const notesWidth of ['wide', 'standard'] as const) {
      for (const showTime of [false, true]) {
        const layout = layoutFor({
          ...base,
          notesWidth,
          showTimeTaken: showTime,
          showEnjoyment: true,
        })
        const notes = layout.columns.find((c) => c.key === 'notes')!
        for (const col of layout.columns) {
          if (col.key === 'notes') continue
          expect(notes.width).toBeGreaterThan(col.width)
        }
      }
    }
  })

  it('LAYOUT: wide Notes is clearly wider than standard', () => {
    const letterCtx = { ...STUDIO_TEST_CTX, pageWidth: 816, pageHeight: 1056 }
    const wide = layoutFor({ ...base, notesWidth: 'wide', showTimeTaken: true }, letterCtx)
    const standard = layoutFor(
      { ...base, notesWidth: 'standard', showTimeTaken: true },
      letterCtx,
    )
    const wideNotes = wide.columns.find((c) => c.key === 'notes')!.width
    const standardNotes = standard.columns.find((c) => c.key === 'notes')!.width
    const widePuzzle = wide.columns.find((c) => c.key === 'puzzle')!.width
    const standardPuzzle = standard.columns.find((c) => c.key === 'puzzle')!.width
    expect(wideNotes - standardNotes).toBeGreaterThanOrEqual(40)
    expect(standardPuzzle).toBeGreaterThan(widePuzzle)
  })

  it('LAYOUT: Puzzle / page header stays on one line when Notes is wide', () => {
    resetObjectCounter()
    const [page] = brainTrainingTrackerTemplate.generate(
      { ...base, notesWidth: 'wide', showTimeTaken: true },
      { ...STUDIO_TEST_CTX, pageWidth: 816, pageHeight: 1056 },
    )
    const puzzleHeader = flatten(page!.objects).find(
      (o) =>
        o.type === 'textbox' &&
        String(o.text ?? '').replace(/\u00a0/g, ' ') === 'Puzzle / page',
    )
    expect(puzzleHeader).toBeTruthy()
    expect(String(puzzleHeader!.text ?? '').includes('\n')).toBe(false)
    expect(String(puzzleHeader!.text ?? '')).toContain('\u00a0')
  })

  it('LAYOUT: Enjoyed circles are numbered 1–3', () => {
    resetObjectCounter()
    const [page] = brainTrainingTrackerTemplate.generate(
      { ...base, showEnjoyment: true },
      STUDIO_TEST_CTX,
    )
    const marks = flatten(page!.objects).filter(
      (o) => o.type === 'textbox' && ['1', '2', '3'].includes(String(o.text ?? '')),
    )
    expect(marks.length).toBeGreaterThanOrEqual(3)
  })

  it('LAYOUT: all column headers share the same font size', () => {
    resetObjectCounter()
    const [page] = brainTrainingTrackerTemplate.generate(
      { ...base, showTimeTaken: true },
      STUDIO_TEST_CTX,
    )
    const labels = new Set([
      'Date',
      'Puzzle\u00a0/\u00a0page',
      'Time\u00a0taken',
      'Done',
      'Enjoyed?',
      'Notes',
    ])
    const headers = flatten(page!.objects).filter(
      (o) =>
        o.type === 'textbox' &&
        o.studioRole === 'decoration' &&
        labels.has(String(o.text ?? '')),
    )
    expect(headers.length).toBeGreaterThanOrEqual(5)
    const sizes = [...new Set(headers.map((h) => Number(h.fontSize ?? 0)))]
    expect(sizes).toEqual([COL_HEADER_SIZE])
  })

  it('LAYOUT: all rows equal height', () => {
    resetObjectCounter()
    const [page] = brainTrainingTrackerTemplate.generate(base, STUDIO_TEST_CTX)
    const boxes = tickBoxes(page!)
    const tops = [...new Set(boxes.map((b) => Math.round(b.top * 10) / 10))].sort(
      (a, b) => a - b,
    )
    const rowGaps = diffs(tops)
    expect(rowGaps.length).toBeGreaterThan(0)
    expect(new Set(rowGaps.map((g) => Math.round(g * 10) / 10)).size).toBe(1)
  })

  it('user-facing label is Puzzle Log, not a progress claim', () => {
    expect(brainTrainingTrackerTemplate.label).toBe('Puzzle Log')
    expect(brainTrainingTrackerTemplate.label.toLowerCase()).not.toMatch(/progress|tracker/)
  })

  it('defaults Page title text to My Puzzle Log (not Game N)', () => {
    expect(brainTrainingTrackerTemplate.defaultPageTitle).toBe(PUZZLE_LOG_DEFAULT_TITLE)
  })

  it('prints a custom title when the user overrides the default', () => {
    resetObjectCounter()
    const pages = brainTrainingTrackerTemplate.generate(
      { ...base, title: 'Weekly Puzzle Notes', showTitle: true },
      STUDIO_TEST_CTX,
    )
    const text = allText(pages[0]!)
    expect(text).toContain('Weekly Puzzle Notes')
    expect(text).not.toContain(PUZZLE_LOG_DEFAULT_TITLE)
  })
})
