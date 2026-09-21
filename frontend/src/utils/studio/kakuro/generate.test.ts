import { describe, it, expect } from 'vitest'
import { kakuroTemplate, KAKURO_INSTRUCTION_GRID_LIFT } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioGenerateContext } from '@/types/studio-template.types'
import type { StudioTag } from '../studio-fabric-builders'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(kakuroTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

runGeneratorContractTests(kakuroTemplate)

describe('kakuro', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = kakuroTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = kakuroTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(kakuroTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      kakuroTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(kakuroTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('kakuro')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('every white cell has a hidden answer digit', () => {
    resetObjectCounter()
    const [page] = kakuroTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('groups the grid into a single object', () => {
    resetObjectCounter()
    const [page] = kakuroTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(1)
  })

  it('uses Grid Copy mid-gray hairline rules', () => {
    resetObjectCounter()
    const [page] = kakuroTemplate.generate(base, CTX())
    const grid = page!.objects.find((o) => o.type === 'group')!
    const rules = (grid.objects ?? []).filter(
      (o) => o.studioRole === 'structure' && o.type === 'rect' && o.fill === STUDIO_RULE_MEDIUM,
    )
    expect(rules.length).toBeGreaterThan(0)
    expect(
      rules.every(
        (o) =>
          (o.width === STUDIO_STROKE_HAIRLINE || o.height === STUDIO_STROKE_HAIRLINE) &&
          o.strokeWidth === 0,
      ),
    ).toBe(true)
  })

  it('centers the grid in the page content area (including hard)', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      resetObjectCounter()
      const ctx = CTX()
      const config = { ...base, difficulty }
      const [page] = kakuroTemplate.generate(config, ctx)
      const grid = page!.objects.find((o) => o.type === 'group')!

      const tag: StudioTag = {
        templateKey: 'kakuro',
        instanceId: 'test-run',
        pageRole: 'single',
      }
      // Same instruction length as generate() so header.body matches.
      const instruction =
        'Fill the white cells with digits 1–9 so each run adds up to its clue. ' +
        'The number in the top-right of a clue cell is the sum going across; ' +
        'the number in the bottom-left is the sum going down. No digit repeats within a run. ' +
        'Some puzzles include a few starter digits'
      resetObjectCounter()
      const body = drawHeader(
        insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
        config,
        tag,
        instruction,
      ).body
      // Puzzle page trims bottom so the grid sits slightly nearer the instruction.
      const field = {
        ...body,
        height: body.height - KAKURO_INSTRUCTION_GRID_LIFT,
      }

      const gridCenterX = grid.left! + grid.width! / 2
      const gridCenterY = grid.top! + grid.height! / 2
      expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
      expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
    }
  })

  it('centers the solution grid in the taller key body (no instruction)', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      resetObjectCounter()
      const ctx = CTX()
      const config = { ...base, difficulty }
      const [page] = kakuroTemplate.generate(config, ctx)
      expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

      const keyObjects = buildAnswerPage(
        page!.answerSourceObjects ?? page!.objects,
        STUDIO_ANSWER_INK_MONO,
      )
      const grid = keyObjects.find((o) => o.type === 'group')!

      const tag: StudioTag = {
        templateKey: 'kakuro',
        instanceId: 'test-run',
        pageRole: 'single',
      }
      // Solution layout omits instruction — match that taller body.
      resetObjectCounter()
      const field = drawHeader(
        insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
        config,
        tag,
        '',
      ).body

      const gridCenterX = grid.left! + grid.width! / 2
      const gridCenterY = grid.top! + grid.height! / 2
      expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
      expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
    }
  })

  it('all difficulties generate without throwing', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      resetObjectCounter()
      expect(() =>
        kakuroTemplate.generate({ ...base, difficulty }, CTX()),
      ).not.toThrow()
    }
  }, 120_000)

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('kakuro')).toBe(true)
    resetObjectCounter()
    const [page] = kakuroTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })
})
