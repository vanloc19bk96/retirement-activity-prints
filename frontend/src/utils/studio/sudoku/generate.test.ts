import { describe, it, expect } from 'vitest'
import { sudokuTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioGenerateContext, StudioConfig } from '@/types/studio-template.types'
import { instructionFor, parseDifficulty, parsePuzzlesPerPage, parseSize } from './config'
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

runGeneratorContractTests(sudokuTemplate)

describe('sudoku', () => {
  it('defaults to 9×9 classic large-print, one puzzle', () => {
    expect(parseSize(base.size)).toBe(9)
    expect(parseDifficulty(base.difficulty)).toBe('classic')
    expect(base.printStyle).toBe('large-print')
    expect(parsePuzzlesPerPage(base.puzzlesPerPage, 9, 'large-print')).toBe(1)
  })

  it('is deterministic', () => {
    resetObjectCounter()
    const a = sudokuTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = sudokuTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  }, 20_000)

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(sudokuTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      sudokuTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  }, 20_000)

  it('auto-adds a solution page (no form toggles)', () => {
    expect(sudokuTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('sudoku')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('every cell has a hidden answer digit', () => {
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(81)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  }, 20_000)

  it('groups the grid into a single object', () => {
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
    expect(groups[0]!.data?.[STUDIO_CANONICAL_KEY]).toEqual(expect.any(String))
  }, 20_000)

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

  it('uses config-based instructions', () => {
    expect(instructionFor(9)).toContain('3×3')
    expect(instructionFor(9)).toContain('1–9')
    expect(instructionFor(6)).toContain('2×3')
    expect(instructionFor(6)).toContain('1–6')
  })

  it('all sizes and difficulties generate without throwing', () => {
    for (const size of ['6x6', '9x9']) {
      for (const difficulty of ['relaxed', 'classic', 'challenge']) {
        resetObjectCounter()
        expect(() =>
          sudokuTemplate.generate({ ...base, size, difficulty }, CTX()),
        ).not.toThrow()
      }
    }
  }, 90_000)

  it('lays out two 6×6 puzzles per page', () => {
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(
      { ...base, size: '6x6', puzzlesPerPage: 2, printStyle: 'large-print' },
      CTX(),
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
    expect(harvestAnswers(page!.objects).length).toBe(72)
    const keys = groups.map((g) => String(g.data?.[STUDIO_CANONICAL_KEY]))
    expect(new Set(keys).size).toBe(2)
  }, 30_000)

  it('lays out two standard-print 9×9 puzzles per page', () => {
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(
      { ...base, size: '9x9', puzzlesPerPage: 2, printStyle: 'standard' },
      CTX(),
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
    expect(harvestAnswers(page!.objects).length).toBe(162)
  }, 30_000)

  it('forces one puzzle for large-print 9×9 even if two is requested', () => {
    expect(parsePuzzlesPerPage(2, 9, 'large-print')).toBe(1)
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(
      { ...base, size: '9x9', puzzlesPerPage: 2, printStyle: 'large-print' },
      CTX(),
    )
    expect(page!.objects.filter((o) => o.type === 'group').length).toBe(1)
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
