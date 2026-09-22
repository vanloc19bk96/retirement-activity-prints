import { describe, it, expect } from 'vitest'
import { sudokuTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import {
  AMAZON_KDP_PAGE_SIZES,
  DPI,
  PDF_POINTS_PER_INCH,
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioGenerateContext, StudioConfig } from '@/types/studio-template.types'
import { instructionFor, sudokuPrintNote } from './config'
import { DEFAULT_SUDOKU_LEVEL_ID, SUDOKU_LEVELS, parseSudokuLevel } from './levels'
import { sudokuContentBox, sudokuGridField } from './layout'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: StudioConfig = {
  ...buildDefaultConfig(sudokuTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

/** The geometry the editor hands a generator for one KDP trim. */
function kdpContext(label: (typeof AMAZON_KDP_PAGE_SIZES)[number]): StudioGenerateContext {
  const page = parsePageSizeLabel(label)
  return {
    pageWidth: page.widthPixels,
    pageHeight: page.heightPixels,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: page.widthPixels,
      pageHeight: page.heightPixels,
      marginGuide: calculateMarginGuide(120, false),
    }),
    seed: 4242,
    instanceId: 'kdp-run',
  }
}

runGeneratorContractTests(sudokuTemplate)
assertGeneratorEntropy(sudokuTemplate, { seeds: 30 })

describe('sudoku form', () => {
  it('asks one question — the puzzle level', () => {
    expect(sudokuTemplate.configSchema.map((f) => f.key)).toEqual(['level'])
  })

  it('defaults to Medium: a 9×9 the whole audience can finish', () => {
    expect(base.level).toBe(DEFAULT_SUDOKU_LEVEL_ID)
    const level = parseSudokuLevel(base)
    expect(level.id).toBe('medium')
    expect(level.size).toBe(9)
  })

  it('exposes no grid-size, print-style or puzzles-per-page controls', () => {
    const registered = getStudioTemplate('sudoku')!
    const keys = new Set(registered.configSchema.map((f) => f.key))
    for (const removed of ['size', 'difficulty', 'printStyle', 'puzzlesPerPage']) {
      expect(keys.has(removed)).toBe(false)
    }
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(sudokuTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('sudoku')!
    const keys = new Set(registered.configSchema.map((f) => f.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('still generates from a sheet saved with the old size/difficulty fields', () => {
    expect(parseSudokuLevel({ size: '6x6', difficulty: 'classic' }).id).toBe('gentle')
    expect(parseSudokuLevel({ size: '9x9', difficulty: 'relaxed' }).id).toBe('easy')
    expect(parseSudokuLevel({ size: '9x9', difficulty: 'classic' }).id).toBe('medium')
    expect(parseSudokuLevel({ size: '9x9', difficulty: 'challenge' }).id).toBe('challenging')
    resetObjectCounter()
    expect(() =>
      sudokuTemplate.generate({ ...base, level: undefined, size: '6x6' }, CTX()),
    ).not.toThrow()
  }, 20_000)

  it('tells the seller what will print on their page size', () => {
    const level = parseSudokuLevel(base)
    const page = parsePageSizeLabel('7.5 x 9.25 in')
    const layout = {
      pageWidth: page.widthPixels,
      pageHeight: page.heightPixels,
      margin: resolveStudioMarginForPage({
        pageIndex: 0,
        pageWidth: page.widthPixels,
        pageHeight: page.heightPixels,
        marginGuide: calculateMarginGuide(120, false),
      }),
    }
    const note = sudokuPrintNote(level, layout, base)
    expect(note).toMatch(/9×9 grid/)
    expect(note).toMatch(/in wide with \d+ pt numbers/)
    expect(note).toMatch(/answer page/)
    // No page geometry yet (a book-builder row before a trim is known).
    expect(sudokuPrintNote(level, undefined, base)).toMatch(/one solution/)
  })

  it('uses plain-language instructions naming the box shape', () => {
    expect(instructionFor(9)).toBe('Fill every row, column and 3×3 box with the numbers 1 to 9.')
    expect(instructionFor(6)).toBe('Fill every row, column and 2×3 box with the numbers 1 to 6.')
  })
})

describe('sudoku page', () => {
  it('prints exactly one puzzle per page', () => {
    for (const level of SUDOKU_LEVELS) {
      resetObjectCounter()
      const [page] = sudokuTemplate.generate({ ...base, level: level.id }, CTX())
      const groups = page!.objects.filter((o) => o.type === 'group')
      expect(groups.length).toBe(1)
      expect(groups[0]!.data?.[STUDIO_CANONICAL_KEY]).toEqual(expect.any(String))
    }
  }, 60_000)

  it('hides an answer digit behind every cell', () => {
    for (const level of SUDOKU_LEVELS) {
      resetObjectCounter()
      const [page] = sudokuTemplate.generate({ ...base, level: level.id }, CTX())
      const answers = harvestAnswers(page!.objects)
      expect(answers.length).toBe(level.size * level.size)
      expect(answers.every((o) => o.visible === false)).toBe(true)
      expect(answers.every((o) => o.fontWeight === 'normal')).toBe(true)
    }
  }, 60_000)

  it('centers the grid in the page content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = sudokuTemplate.generate(base, ctx)
    const grid = page!.objects.find((o) => o.type === 'group')!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  }, 20_000)

  it('answer key uses black ink and omits given prompts', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('sudoku')).toBe(true)
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBe(81)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
    expect(answers.every((o) => o.visible !== false)).toBe(true)
  }, 20_000)
})

describe('sudoku print fit on every KDP trim', () => {
  for (const label of AMAZON_KDP_PAGE_SIZES) {
    for (const level of SUDOKU_LEVELS) {
      it(`${label} · ${level.id} stays readable and inside the safe area`, () => {
        const ctx = kdpContext(label)
        const instruction = instructionFor(level.size)
        resetObjectCounter()
        const [page] = sudokuTemplate.generate({ ...base, level: level.id }, ctx)
        assertObjectsInSafeMargin(page!.objects, ctx)

        const grid = page!.objects.find((o) => o.type === 'group')!
        const content = sudokuContentBox(ctx)

        // Square, and never wider than the column it prints in.
        expect(Math.abs(grid.width! - grid.height!)).toBeLessThanOrEqual(2)
        expect(grid.width!).toBeLessThanOrEqual(content.width + 1)
        expect(grid.left!).toBeGreaterThanOrEqual(content.left - 1)
        expect(grid.left! + grid.width!).toBeLessThanOrEqual(content.left + content.width + 1)

        // Big enough to be worth printing, small enough not to read as a
        // poster — the same share of the sheet on every trim and level.
        expect(grid.width! / ctx.pageWidth).toBeGreaterThan(0.6)
        expect(grid.width! / ctx.pageWidth).toBeLessThan(0.8)

        // Centred in what the header left of the column — equal air above and
        // below, so no page prints top-heavy or with the grid on the margin.
        const body = sudokuGridField({ ...ctx }, { ...base, level: level.id }, instruction)
        const above = grid.top! - body.top
        const below = body.top + body.height - (grid.top! + grid.height!)
        expect(above).toBeGreaterThanOrEqual(0)
        expect(Math.abs(above - below)).toBeLessThanOrEqual(2)

        const digits = harvestAnswers(page!.objects)
        const fontSize = digits[0]!.fontSize!
        expect(digits.every((d) => d.fontSize === fontSize)).toBe(true)
        const cell = grid.width! / level.size
        // Large print, and never close enough to a rule to smudge into it.
        expect((fontSize * PDF_POINTS_PER_INCH) / DPI).toBeGreaterThanOrEqual(14)
        expect(fontSize).toBeLessThanOrEqual(cell * 0.75)
      }, 30_000)
    }
  }
})
