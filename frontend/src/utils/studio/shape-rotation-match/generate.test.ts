import { describe, it, expect } from 'vitest'
import { shapeRotationMatchTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import type { StudioFabricObject } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { MIN_CELL_PX } from './draw'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type { StudioGenerateContext } from '@/types/studio-template.types'

/** Must match draw.ts — solution centering is measured against this shortened body. */
const STACK_EDGE_RESERVE = 24

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: Record<string, unknown> = {
  ...buildDefaultConfig(shapeRotationMatchTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

/** Accent tile is the square ink fill; edge bars are thin black rects. */
function isAccentTile(o: StudioFabricObject): boolean {
  return (
    o.type === 'rect' &&
    o.fill === '#000000' &&
    (o.width ?? 0) === (o.height ?? 0) &&
    (o.width ?? 0) > STUDIO_STROKE_NORMAL
  )
}

function inkBarThickness(o: StudioFabricObject): number | null {
  if (o.type !== 'rect' || o.fill !== '#000000') return null
  const w = o.width ?? 0
  const h = o.height ?? 0
  if (w === h) return null
  return Math.min(w, h)
}

/** Parent group wrapping every item row (answers nested inside). */
function stackGroup(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.type === 'group' && o.studioRole === 'structure')
}

/** Per-figure silhouette groups inside the stack. */
function figureGroups(objects: StudioFabricObject[]): StudioFabricObject[] {
  const pool = stackGroup(objects)?.objects ?? objects
  return pool.filter(
    (o) =>
      o.type === 'group' &&
      o.data?.source !== 'studio-check-mark' &&
      o.studioRole !== 'answer',
  )
}

/** KDP interior trims this template must stay printable on. */
const KDP_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [6, 9],
  [7, 10],
  [8, 10],
  [8.5, 11],
]

/** A real KDP interior page: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed: 2026,
  instanceId: 'kdp-run',
})

runGeneratorContractTests(shapeRotationMatchTemplate)

describe('shape-rotation-match', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = shapeRotationMatchTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = shapeRotationMatchTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different pages', () => {
    resetObjectCounter()
    const a = JSON.stringify(shapeRotationMatchTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      shapeRotationMatchTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('emits one hidden answer oval per same-different item, sized to the label', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'same-different', itemCount: 8 },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(8)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'rect')).toBe(true)
    // MIRROR is longer than SAME — ovals must be wide enough for the word.
    for (const o of answers) {
      expect((o.width ?? 0)).toBeGreaterThan(40)
      expect((o.height ?? 0)).toBeGreaterThan(12)
      expect(o.originX).toBe('center')
      expect(o.originY).toBe('center')
    }
  })

  it('emits two hidden ticks per pick-matches item', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'pick-matches', itemCount: 6 },
      CTX(),
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(12)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    expect(answers.every((o) => o.type === 'group' && o.data?.source === 'studio-check-mark')).toBe(
      true,
    )
  })

  it('keeps 8 pick-the-matches items on the default 6×9 trim', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'pick-matches', difficulty: 'hard', itemCount: 8 },
      kdpCtx(6, 9),
    )
    const figures = figureGroups(page!.objects)
    // One reference + four candidates per item.
    expect(figures.length).toBe(40)
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(16)
  })

  it('all formats and difficulties generate without throwing', () => {
    for (const format of ['same-different', 'pick-matches'] as const) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        resetObjectCounter()
        expect(() =>
          shapeRotationMatchTemplate.generate(
            { ...base, format, difficulty, itemCount: 6 },
            CTX(),
          ),
        ).not.toThrow()
      }
    }
  })

  it('max density still fits inside the safe margin', () => {
    for (const format of ['same-different', 'pick-matches'] as const) {
      resetObjectCounter()
      const pages = shapeRotationMatchTemplate.generate(
        { ...base, format, difficulty: 'hard', itemCount: 15 },
        CTX(),
      )
      for (const page of pages) {
        assertObjectsInSafeMargin(page.objects, CTX())
        assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects, CTX())
      }
    }
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(shapeRotationMatchTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('shape-rotation-match')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('shape-rotation-match')).toBe(true)
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'pick-matches', itemCount: 4 },
      CTX(),
    )
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.data?.source === 'studio-check-mark')).toBe(true)
    const strokes = answers.flatMap((o) => (o.objects ?? []).map((c) => c.stroke))
    expect(strokes.length).toBeGreaterThan(0)
    expect(strokes.every((s) => s === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(strokes.every((s) => s !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('groups the item stack and centers it on the solution page', () => {
    resetObjectCounter()
    const config = {
      ...base,
      format: 'pick-matches' as const,
      itemCount: 4,
      showTitle: true,
      title: 'Game 1',
    }
    const [page] = shapeRotationMatchTemplate.generate(config, CTX())
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)

    const keyStack = stackGroup(page!.answerSourceObjects!)
    expect(keyStack).toBeDefined()

    // No how-to on the key → taller body; stack is shrink-wrapped and re-centered.
    const field = drawHeader(
      insetHorizontal(contentBox(CTX()), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      {
        templateKey: 'shape-rotation-match',
        instanceId: CTX().instanceId,
        pageRole: 'single',
      },
      '',
    ).body
    const stackCenterX = (keyStack!.left ?? 0) + (keyStack!.width ?? 0) / 2
    const stackCenterY = (keyStack!.top ?? 0) + (keyStack!.height ?? 0) / 2
    const usableCenterY = field.top + (field.height - STACK_EDGE_RESERVE) / 2
    expect(Math.abs(stackCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(stackCenterY - usableCenterY)).toBeLessThanOrEqual(2)
  })

  it('itemCount maxWhen matches what generate actually packs', () => {
    const field = shapeRotationMatchTemplate.configSchema.find((f) => f.key === 'itemCount')
    expect(field?.maxWhen).toBeTypeOf('function')

    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const format of ['same-different', 'pick-matches'] as const) {
        for (const difficulty of ['easy', 'medium', 'hard'] as const) {
          // A "Game N" heading shortens the body, so the max has to move with it.
          for (const title of ['', 'Game 1']) {
            const ctx = kdpCtx(wIn, hIn)
            const layout = {
              pageWidth: ctx.pageWidth,
              pageHeight: ctx.pageHeight,
              margin: ctx.margin,
            }
            const config = {
              ...base,
              format,
              difficulty,
              itemCount: 12,
              showTitle: title !== '',
              title,
            }
            const max = field!.maxWhen!(config, layout)
            resetObjectCounter()
            const [page] = shapeRotationMatchTemplate.generate(
              { ...config, itemCount: max },
              ctx,
            )
            const answers = harvestAnswers(page!.objects)
            const packed =
              format === 'pick-matches' ? answers.length / 2 : answers.length
            expect(max, `${format}/${difficulty}/${wIn}x${hIn}/title="${title}"`).toBe(
              packed,
            )
            expect(max).toBeGreaterThanOrEqual(4)
            expect(max).toBeLessThanOrEqual(12)
          }
        }
      }
    }
  })

  it('never prints a cell below the legibility floor, on any KDP trim', () => {
    // Rows used to compress freely: 12 items of pick-matches on a 6×9 trim printed
    // 0.8mm cells. The count is now capped by what the page can actually hold.
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const format of ['same-different', 'pick-matches'] as const) {
        for (const itemCount of [4, 8, 12]) {
          const ctx = kdpCtx(wIn, hIn)
          resetObjectCounter()
          const [page] = shapeRotationMatchTemplate.generate(
            { ...base, format, difficulty: 'hard', itemCount },
            ctx,
          )
          assertObjectsInSafeMargin(page!.objects, ctx)

          const figures = figureGroups(page!.objects)
          expect(figures.length).toBeGreaterThan(0)

          for (const fig of figures) {
            // The accent tile is exactly one cell, so it measures the printed cell.
            const accent = (fig.objects ?? []).find(isAccentTile)
            expect(accent).toBeDefined()
            expect(accent!.width ?? 0).toBeGreaterThanOrEqual(MIN_CELL_PX)
          }

          // Every ink bar clears KDP's 0.5pt minimum (0.67px at 96 DPI).
          const thicknesses = figures
            .flatMap((g) => g.objects ?? [])
            .map(inkBarThickness)
            .filter((t): t is number => t !== null)
          expect(thicknesses.length).toBeGreaterThan(0)
          expect(Math.min(...thicknesses)).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('keeps real clearance below the last row on every KDP trim size', () => {
    // The stack used to size itself to the pixel, leaving ~1px under the last row —
    // enough that real Fabric text metrics pushed content past the safe area.
    for (const [wIn, hIn] of KDP_TRIMS) {
      const label = `${wIn}x${hIn}`
      for (const format of ['same-different', 'pick-matches'] as const) {
        for (const showTitle of [false, true]) {
          for (const itemCount of [4, 8, 12]) {
            const ctx = kdpCtx(wIn, hIn)
            resetObjectCounter()
            const [page] = shapeRotationMatchTemplate.generate(
              {
                ...base,
                format,
                difficulty: 'hard',
                itemCount,
                showTitle,
                title: showTitle ? 'Game 12' : '',
              },
              ctx,
            )
            assertObjectsInSafeMargin(page!.objects, ctx)

            const limit = ctx.pageHeight - ctx.margin.bottom
            const bottom = Math.max(
              ...page!.objects.map((o) => {
                const h = o.height ?? o.fontSize ?? 0
                const top = o.originY === 'center' ? o.top - h / 2 : o.top
                return top + h + (o.strokeWidth ?? 0) / 2
              }),
            )
            // One wrapped instruction line is ~27px; clearance must survive that.
            expect(
              `${label}/${format}/title=${showTitle}/n=${itemCount}: ${(limit - bottom).toFixed(1)}`,
            ).toBe(
              `${label}/${format}/title=${showTitle}/n=${itemCount}: ${Math.max(20, limit - bottom).toFixed(1)}`,
            )
          }
        }
      }
    }
  })

  it('draws the whole silhouette at one stroke weight', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'pick-matches', difficulty: 'hard' },
      CTX(),
    )
    const figures = figureGroups(page!.objects)
    expect(figures.length).toBeGreaterThan(0)

    for (const fig of figures) {
      // Outline and cell grid share one bar thickness (filled ink, not stroke).
      const thicknesses = (fig.objects ?? [])
        .map(inkBarThickness)
        .filter((t): t is number => t !== null)
      expect(thicknesses.length).toBeGreaterThan(0)
      expect(new Set(thicknesses).size).toBe(1)
      expect(thicknesses[0]).toBe(STUDIO_STROKE_NORMAL)
    }
  })

  it('registers under spatial category', () => {
    expect(shapeRotationMatchTemplate.category).toBe('spatial')
    expect(getStudioTemplate('shape-rotation-match')?.category).toBe('spatial')
  })

  it('groups the item stack and each figure silhouette', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'same-different', itemCount: 4 },
      CTX(),
    )
    expect(stackGroup(page!.objects)).toBeDefined()
    const figures = figureGroups(page!.objects)
    // 4 items × (ref + candidate) = 8 figure groups inside the stack
    expect(figures.length).toBe(8)
    expect(
      figures.every((g) => Array.isArray(g.objects) && g.objects!.length >= 2),
    ).toBe(true)
  })

  it('draws at least one filled accent tile per figure group', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'same-different', itemCount: 3 },
      CTX(),
    )
    for (const g of figureGroups(page!.objects)) {
      expect((g.objects ?? []).filter(isAccentTile).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('snaps figure cells to equal integer sizes', () => {
    resetObjectCounter()
    const [page] = shapeRotationMatchTemplate.generate(
      { ...base, format: 'pick-matches', difficulty: 'hard', itemCount: 4 },
      CTX(),
    )
    for (const fig of figureGroups(page!.objects)) {
      const accent = (fig.objects ?? []).find(isAccentTile)
      expect(accent).toBeDefined()
      expect(Number.isInteger(accent!.width)).toBe(true)
      expect(Number.isInteger(accent!.height)).toBe(true)
      expect(accent!.width).toBe(accent!.height)
    }
  })
})
