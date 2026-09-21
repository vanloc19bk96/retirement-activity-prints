import { describe, it, expect } from 'vitest'
import { mazeTemplate, rowsForField } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import {
  runGeneratorContractTests,
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
})

const base = {
  ...buildDefaultConfig(mazeTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

const SIZES = ['small', 'medium', 'large', 'xlarge'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

runGeneratorContractTests(mazeTemplate)
assertGeneratorEntropy(mazeTemplate)

describe('maze', () => {
  it('is registered and skips manual answer-key fields', () => {
    const registered = getStudioTemplate('maze')
    expect(registered).toBeDefined()
    expect(registered!.producesAnswerKey).toBe(true)
    const keys = new Set(registered!.configSchema.map((f) => f.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('groups the maze into one movable unit', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate(base, CTX())
    expect(page!.objects.filter((o) => o.type === 'group').length).toBe(1)
  })

  it('hides the solution route on the puzzle page', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'line')).toBe(true)
  })

  it('answer key traces the route in black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('maze')).toBe(true)
    resetObjectCounter()
    const [page] = mazeTemplate.generate(base, CTX())
    const revealed = harvestAnswers(buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO))
    expect(revealed.length).toBeGreaterThan(0)
    expect(revealed.every((o) => o.visible === true)).toBe(true)
    expect(revealed.every((o) => o.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(revealed.every((o) => o.stroke !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('keeps Start / Finish captions on the answer key', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate(base, CTX())
    const key = buildAnswerPage(page!.objects, STUDIO_ANSWER_INK_MONO)
    const texts = key
      .flatMap((o) => o.objects ?? [])
      .map((o) => String(o.text ?? '').trim())
    expect(texts).toContain('Start')
    expect(texts).toContain('Finish')
  })

  it('drops the captions when the toggle is off', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate({ ...base, showLabels: false }, CTX())
    const texts = page!.objects
      .flatMap((o) => o.objects ?? [])
      .map((o) => String(o.text ?? '').trim())
    expect(texts).not.toContain('Start')
    expect(texts).not.toContain('Finish')
  })

  it('centers the maze in the content column', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = mazeTemplate.generate(base, ctx)
    const maze = page!.objects.find((o) => o.type === 'group')!
    const left = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const right = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const center = (left + right) / 2
    expect(Math.abs(maze.left! + maze.width! / 2 - center)).toBeLessThanOrEqual(2)
  })

  it('uses Grid Copy mid-gray hairlines for wall bars', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate(base, CTX())
    const maze = page!.objects.find((o) => o.type === 'group')!
    const bars = (maze.objects ?? []).filter(
      (o) => o.studioRole === 'structure' && o.type === 'rect',
    )
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.every((o) => o.fill === STUDIO_RULE_MEDIUM)).toBe(true)
  })

  it('draws a thinner solution route without start/finish arrows', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate(base, CTX())
    const maze = page!.objects.find((o) => o.type === 'group')!
    expect((maze.objects ?? []).every((o) => o.type !== 'polygon')).toBe(true)
    const routes = harvestAnswers(page!.objects)
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((o) => (o.strokeWidth ?? 0) <= STUDIO_STROKE_NORMAL)).toBe(true)
  })

  it('centers the solution maze at the same size as the puzzle page', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, showTitle: true, title: 'Game 1' }
    const [page] = mazeTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const puzzleMaze = page!.objects.find((o) => o.type === 'group')!
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const maze = keyObjects.find((o) => o.type === 'group')!
    assertObjectsInSafeMargin(keyObjects, ctx)

    expect(maze.width).toBe(puzzleMaze.width)
    expect(maze.height).toBe(puzzleMaze.height)

    const tag: StudioTag = {
      templateKey: 'maze',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      '',
    ).body
    const mazeCenterX = maze.left! + maze.width! / 2
    const mazeCenterY = maze.top! + maze.height! / 2
    expect(Math.abs(mazeCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(mazeCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('every size and difficulty stays inside the safe margin', () => {
    const ctx = CTX()
    for (const size of SIZES) {
      for (const difficulty of DIFFICULTIES) {
        for (const showLabels of [true, false]) {
          for (const showTitle of [true, false]) {
            resetObjectCounter()
            const [page] = mazeTemplate.generate(
              {
                ...base,
                size,
                difficulty,
                showLabels,
                showTitle,
                title: 'Game 1',
              },
              ctx,
            )
            assertObjectsInSafeMargin(page!.objects, ctx)
            if (page!.answerSourceObjects) {
              assertObjectsInSafeMargin(page!.answerSourceObjects, ctx)
            }
          }
        }
      }
    }
  })

  it('keeps a bottom gap inside the safe area when title is on and labels are off', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = {
      ...base,
      showTitle: true,
      title: 'Game 1',
      size: 'large',
      difficulty: 'medium',
      showLabels: false,
    }
    const [page] = mazeTemplate.generate(config, ctx)
    assertObjectsInSafeMargin(page!.objects, ctx)
    if (page!.answerSourceObjects) {
      assertObjectsInSafeMargin(page!.answerSourceObjects, ctx)
    }

    const maze = page!.objects.find((o) => o.type === 'group')!
    const tag: StudioTag = {
      templateKey: 'maze',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    resetObjectCounter()
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      'Find your way from Start to Finish. Draw a line through the open paths. ' +
        'Do not cross any walls. There is exactly one way through',
    ).body

    // FIELD_INSET (16) breathing room — same as Grid Copy.
    expect(maze.top! + maze.height!).toBeLessThanOrEqual(field.top + field.height - 8)
  })

  it('merges straight wall runs instead of emitting one bar per edge', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate({ ...base, size: 'xlarge' }, CTX())
    const maze = page!.objects.find((o) => o.type === 'group')!
    const bars = (maze.objects ?? []).filter((o) => o.type === 'rect')
    // Un-merged, a 26-column maze would need well over a thousand bars.
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.length).toBeLessThan(700)
  })

  it('scales row count to the page shape, keeping cells square', () => {
    expect(rowsForField(16, 400, 600)).toBe(24)
    expect(rowsForField(16, 400, 400)).toBe(16)
    // Extreme aspect ratios clamp instead of degenerating.
    expect(rowsForField(16, 400, 4000)).toBe(32)
    expect(rowsForField(16, 400, 40)).toBe(13)
  })

  it('instructions state the one-route promise', () => {
    resetObjectCounter()
    const [page] = mazeTemplate.generate({ ...base, showInstructions: true }, CTX())
    const texts = page!.objects.map((o) => String(o.text ?? ''))
    expect(texts.some((t) => t.includes('exactly one way through'))).toBe(true)
  })
})
