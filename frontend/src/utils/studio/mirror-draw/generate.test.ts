import { describe, it, expect } from 'vitest'
import { mirrorDrawTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: Record<string, unknown> = {
  ...buildDefaultConfig(mirrorDrawTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    out.push(o)
    if (o.type === 'group' && o.objects) out.push(...flatten(o.objects))
  }
  return out
}

runGeneratorContractTests(mirrorDrawTemplate)

describe('mirror-draw', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = mirrorDrawTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = mirrorDrawTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different pages', () => {
    resetObjectCounter()
    const a = JSON.stringify(mirrorDrawTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      mirrorDrawTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('given cells are prompts, mirrored cells are hidden answers', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate(
      { ...base, style: 'pixel', axis: 'vertical', gridSize: 10 },
      CTX(),
    )
    const flat = flatten(page!.objects)
    const prompts = flat.filter((o) => o.studioRole === 'prompt' && o.type === 'rect')
    const answers = flat.filter((o) => o.studioRole === 'answer' && o.type === 'rect')
    expect(prompts.length).toBe(answers.length)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(prompts.length).toBeGreaterThan(0)
  })

  it('all axes and both styles generate', () => {
    for (const axis of ['vertical', 'horizontal', 'both'] as const) {
      for (const style of ['pixel', 'line'] as const) {
        resetObjectCounter()
        expect(() =>
          mirrorDrawTemplate.generate({ ...base, axis, style, gridSize: 10 }, CTX()),
        ).not.toThrow()
      }
    }
  })

  it('has no picture source or theme control', () => {
    const keys = new Set(mirrorDrawTemplate.configSchema.map((f) => f.key))
    expect(keys.has('source')).toBe(false)
    expect(keys.has('theme')).toBe(false)
  })

  it('abstract patterns vary across many seeds', () => {
    const pages = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      resetObjectCounter()
      const out = mirrorDrawTemplate.generate(
        { ...base, style: 'pixel', gridSize: 10, seed },
        { ...CTX(), seed },
      )
      pages.add(JSON.stringify(out))
    }
    expect(pages.size).toBeGreaterThanOrEqual(30)
  })

  it('every config leaves the solver something to draw', () => {
    // A page whose mirrored side is empty prints as a puzzle with no puzzle in
    // it, and harvestAnswers finds nothing so the solution page is dropped too.
    for (const gridSize of [8, 10, 12, 16] as const) {
      for (const axis of ['vertical', 'horizontal', 'both'] as const) {
        for (const style of ['pixel', 'line'] as const) {
          for (let seed = 1; seed <= 60; seed++) {
            resetObjectCounter()
            const [page] = mirrorDrawTemplate.generate(
              { ...base, gridSize, axis, style, seed },
              { ...CTX(), seed },
            )
            const flat = flatten(page!.objects)
            const answers = flat.filter((o) => o.studioRole === 'answer')
            expect(
              answers.length,
              `${gridSize} ${axis} ${style} seed ${seed} has no answer marks`,
            ).toBeGreaterThanOrEqual(3)
          }
        }
      }
    }
  })

  it('pixel pages stay under the ink cap', () => {
    for (const gridSize of [8, 10, 12, 16] as const) {
      for (const axis of ['vertical', 'horizontal', 'both'] as const) {
        for (let seed = 1; seed <= 60; seed++) {
          resetObjectCounter()
          const [page] = mirrorDrawTemplate.generate(
            { ...base, gridSize, axis, style: 'pixel', seed },
            { ...CTX(), seed },
          )
          const flat = flatten(page!.objects)
          const inked = flat.filter(
            (o) => o.type === 'rect' && (o.studioRole === 'prompt' || o.studioRole === 'answer'),
          ).length
          const ratio = inked / (gridSize * gridSize)
          expect(ratio, `${gridSize} ${axis} seed ${seed} inked ${ratio}`).toBeLessThanOrEqual(0.7)
          expect(ratio).toBeGreaterThan(0.05)
        }
      }
    }
  })

  it('two sellers on the same seed get different pages', () => {
    // KDP: same template, same settings, same seed must not publish the same art.
    let shared = 0
    for (let seed = 1; seed <= 50; seed++) {
      resetObjectCounter()
      const a = JSON.stringify(
        mirrorDrawTemplate.generate({ ...base, seed }, { ...CTX(), seed, ownerKey: 'user:a' }),
      )
      resetObjectCounter()
      const b = JSON.stringify(
        mirrorDrawTemplate.generate({ ...base, seed }, { ...CTX(), seed, ownerKey: 'user:b' }),
      )
      if (a === b) shared++
    }
    expect(shared).toBe(0)
  })

  it('same seller and seed still reproduces exactly', () => {
    resetObjectCounter()
    const a = mirrorDrawTemplate.generate(base, { ...CTX(), ownerKey: 'user:a' })
    resetObjectCounter()
    const b = mirrorDrawTemplate.generate(base, { ...CTX(), ownerKey: 'user:a' })
    expect(a).toEqual(b)
  })

  it('line style inks filled bars, not stroked lines', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate(
      { ...base, style: 'line', axis: 'vertical', gridSize: 10 },
      CTX(),
    )
    const flat = flatten(page!.objects)
    const ink = flat.filter(
      (o) =>
        (o.studioRole === 'prompt' || o.studioRole === 'answer') && o.fill === STUDIO_INK,
    )
    expect(ink.length).toBeGreaterThan(0)
    expect(ink.every((o) => o.type === 'rect')).toBe(true)
    expect(flat.some((o) => o.type === 'line' && o.studioRole !== 'structure')).toBe(false)
  })

  it('grid lines use the same medium rule color as Grid Copy', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate(
      { ...base, style: 'pixel', axis: 'vertical', gridSize: 10 },
      CTX(),
    )
    const flat = flatten(page!.objects)
    const rules = flat.filter(
      (o) => o.type === 'rect' && o.studioRole === 'structure' && o.fill === STUDIO_RULE_MEDIUM,
    )
    expect(rules.length).toBeGreaterThan(0)
  })

  it('line style with 2 puzzles per page yields distinct puzzles', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate(
      {
        ...base,
        style: 'line',
        puzzlesPerPage: 2,
        gridSize: 10,
      },
      CTX(),
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
    const a = JSON.stringify(groups[0]!.objects)
    const b = JSON.stringify(groups[1]!.objects)
    expect(a).not.toEqual(b)
  })

  it('max density still fits inside the safe margin', () => {
    resetObjectCounter()
    const pages = mirrorDrawTemplate.generate(
      {
        ...base,
        gridSize: 16,
        puzzlesPerPage: 2,
        showCoordinates: true,
        axis: 'both',
      },
      CTX(),
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, CTX())
    }
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(mirrorDrawTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('mirror-draw')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('mirror-draw')).toBe(true)
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate({ ...base, style: 'pixel' }, CTX())
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === true)).toBe(true)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('line style answer key reveals both halves', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate(
      { ...base, style: 'line', axis: 'vertical', gridSize: 10 },
      CTX(),
    )
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!
    const prompts = (grid.objects ?? []).filter((o) => o.studioRole === 'prompt')
    const answerInk = (grid.objects ?? []).filter((o) => o.studioRole === 'answer')
    expect(prompts.length).toBeGreaterThan(0)
    expect(answerInk.length).toBeGreaterThan(0)
    expect(answerInk.every((o) => o.visible === true)).toBe(true)
  })

  it('centers the solution grid in the answer-key body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, puzzlesPerPage: 1, showTitle: true, title: 'Game 1' }
    const [page] = mirrorDrawTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const puzzleGrid = page!.objects.find((o) => o.type === 'group')!
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find((o) => o.type === 'group')!
    assertObjectsInSafeMargin(keyObjects, ctx)

    // Same footprint as the puzzle page — only recentered in the taller key body.
    expect(grid.width).toBe(puzzleGrid.width)
    expect(grid.height).toBe(puzzleGrid.height)

    const tag: StudioTag = {
      templateKey: 'mirror-draw',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      '',
    ).body
    const gridCenterX = grid.left! + grid.width! / 2
    const gridCenterY = grid.top! + grid.height! / 2
    expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThan(30)
  })

  it('registers under spatial category', () => {
    expect(mirrorDrawTemplate.category).toBe('spatial')
    expect(getStudioTemplate('mirror-draw')?.category).toBe('spatial')
  })

  it('groups each puzzle as one object', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate({ ...base, puzzlesPerPage: 2 }, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
  })

  it('emits a bold dashed axis centered on the mid grid rule', () => {
    resetObjectCounter()
    const [page] = mirrorDrawTemplate.generate(
      { ...base, axis: 'vertical', gridSize: 10 },
      CTX(),
    )
    const flat = flatten(page!.objects)
    const structureRects = flat.filter(
      (o) => o.type === 'rect' && o.studioRole === 'structure',
    )
    const axisDashes = structureRects.filter(
      (o) =>
        o.fill === STUDIO_INK &&
        typeof o.width === 'number' &&
        o.width === STUDIO_STROKE_BOLD &&
        typeof o.height === 'number' &&
        o.height > 0 &&
        o.height <= 8,
    )
    expect(axisDashes.length).toBeGreaterThan(2)

    const midRules = structureRects.filter(
      (o) =>
        o.fill === STUDIO_RULE_MEDIUM &&
        typeof o.width === 'number' &&
        o.width === STUDIO_STROKE_HAIRLINE &&
        typeof o.height === 'number' &&
        o.height! > 100,
    )
    expect(midRules.length).toBeGreaterThan(0)
    // Mid vertical rule nearest the axis dashes (same column).
    const dashLeft = Math.min(...axisDashes.map((d) => d.left!))
    const mid = midRules.reduce((best, r) =>
      Math.abs(r.left! - dashLeft) < Math.abs(best.left! - dashLeft) ? r : best,
    )
    const dashCenter = dashLeft + STUDIO_STROKE_BOLD / 2
    const ruleCenter = mid.left! + STUDIO_STROKE_HAIRLINE / 2
    expect(Math.abs(dashCenter - ruleCenter)).toBeLessThanOrEqual(1)

    // Dashes stay inside the outer grid bounds (no stroke spill).
    const gridLeft = Math.min(...structureRects.map((r) => r.left!))
    const gridRight = Math.max(...structureRects.map((r) => r.left! + (r.width ?? 0)))
    const gridTop = Math.min(...structureRects.map((r) => r.top!))
    const gridBottom = Math.max(...structureRects.map((r) => r.top! + (r.height ?? 0)))
    for (const dash of axisDashes) {
      expect(dash.left!).toBeGreaterThanOrEqual(gridLeft)
      expect(dash.left! + dash.width!).toBeLessThanOrEqual(gridRight)
      expect(dash.top!).toBeGreaterThanOrEqual(gridTop)
      expect(dash.top! + dash.height!).toBeLessThanOrEqual(gridBottom)
    }
  })
})
