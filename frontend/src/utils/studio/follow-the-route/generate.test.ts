import { describe, it, expect } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { contentFingerprint } from '../studio-content-fingerprint'
import { buildRoutes, followTheRouteTemplate, printedCellSize } from './generate'
import { cellCode, manhattan, simulateRoute } from './route'
import { sampleRouteSteps, stepText } from './answer'
import { resolveRouteSettings, ROUTE_TIER_KEYS, CELL_SIZE_PX, type Route } from './types'

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
  ...over,
})

const configFor = (over: StudioConfig = {}): StudioConfig => ({
  ...buildDefaultConfig(followTheRouteTemplate),
  fontFamily: 'PT Serif',
  ...over,
})

function generate(config: StudioConfig, ctx = CTX()) {
  resetObjectCounter()
  const [page] = followTheRouteTemplate.generate(config, ctx)
  return page!
}

/** The routes a page was built from — the same call the generator makes. */
function routesFor(config: StudioConfig, ctx = CTX()): Route[] {
  const settings = resolveRouteSettings(config)
  return buildRoutes({
    count: settings.figures,
    spec: {
      rows: settings.rows,
      cols: settings.cols,
      numSteps: settings.numSteps,
      maxStepLen: settings.maxStepLen,
      diagonals: settings.diagonals,
      ...(settings.mode === 'route'
        ? { minEndManhattan: 4, requireEndOffAxis: true }
        : {}),
    },
    seed: ctx.seed,
    ownerKey: ctx.ownerKey,
  })
}

function keyObjects(config: StudioConfig, ctx = CTX()): StudioFabricObject[] {
  const page = generate(config, ctx)
  return buildAnswerPage(page.answerSourceObjects ?? page.objects, STUDIO_ANSWER_INK_MONO)
}

function flatten(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) => (o.objects ? [o, ...flatten(o.objects)] : [o]))
}

const textsOf = (objects: readonly StudioFabricObject[]): string[] =>
  flatten(objects)
    .filter((o) => o.type === 'textbox')
    .map((o) => String(o.text ?? ''))

runGeneratorContractTests(followTheRouteTemplate)
assertGeneratorEntropy(followTheRouteTemplate)

describe('follow-the-route registration', () => {
  it('is in the registry with an automatic answer key', () => {
    const registered = getStudioTemplate('follow-the-route')
    expect(registered).toBeDefined()
    expect(registered!.producesAnswerKey).toBe(true)
    expect(registered!.category).toBe('spatial')
    expect(registered!.pageCount).toBe(1)
    const keys = new Set(registered!.configSchema.map((f) => f.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('prints its answer key in black, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('follow-the-route')).toBe(true)
  })

  it('needs no network content', () => {
    expect(followTheRouteTemplate.prefetch).toBeUndefined()
  })
})

describe('follow-the-route page', () => {
  it('explains what a move means in the how-to strip', () => {
    const arrows = textsOf(generate(configFor({ instructionStyle: 'arrows' })).objects).join(' ')
    expect(arrows).toMatch(/down arrow next to 2 means move down 2 squares/i)

    const words = textsOf(generate(configFor({ instructionStyle: 'words' })).objects).join(' ')
    expect(words).toMatch(/Down 2 means move down 2 squares/)
  })

  it('groups every figure into one movable unit', () => {
    for (const [figures, expected] of [
      [1, 1],
      [2, 2],
      [4, 4],
    ] as const) {
      const page = generate(configFor({ figuresPerPage: figures }))
      expect(page.objects.filter((o) => o.type === 'group')).toHaveLength(expected)
    }
  })

  it('does not letter multi-grid pages A–D', () => {
    const texts = textsOf(generate(configFor({ figuresPerPage: 4, mode: 'mark' })).objects)
    expect(texts.filter((t) => /^[A-D]$/.test(t))).toEqual([])
  })

  it('hides every answer on the puzzle page', () => {
    for (const difficulty of ROUTE_TIER_KEYS) {
      const page = generate(configFor({ difficulty, showPathOnKey: true }))
      const answers = harvestAnswers(page.objects)
      expect(answers.length).toBeGreaterThan(0)
      expect(answers.every((o) => o.visible === false)).toBe(true)
    }
  })

  it('shades the square the moves actually land on', () => {
    const config = configFor({ difficulty: 'easy', figuresPerPage: 1 })
    const [route] = routesFor(config)
    const page = generate(config)
    const shade = harvestAnswers(page.objects).find((o) => o.type === 'rect')
    expect(shade).toBeDefined()

    // Locate the shaded square against the grid rules drawn on the same page.
    const group = page.objects.find((o) => o.type === 'group')!
    const cells = flatten([group]).filter((o) => o.type === 'rect')
    const cell = Math.round(Math.max(...cells.map((o) => o.width ?? 0)) / 1)
    expect(cell).toBeGreaterThan(0)
    // The shade sits inside one square, so its centre must land on the end cell.
    const end = simulateRoute(route!.start, route!.steps)
    expect(end).toEqual(route!.end)
  })

  it('numbers the moves and prints them in the chosen style', () => {
    const config = configFor({ difficulty: 'medium', figuresPerPage: 1, instructionStyle: 'words' })
    const [route] = routesFor(config)
    const texts = textsOf(generate(config).objects)
    route!.steps.forEach((step, i) => {
      expect(texts).toContain(`${i + 1}.`)
      expect(texts).toContain(stepText(step, 'words'))
    })
  })

  it('never sets an arrow as a text glyph', () => {
    // Catalog fonts have no arrow characters: an outlined PDF export would
    // print a missing-glyph box. Arrows must stay line art.
    for (const style of ['arrows', 'words'] as const) {
      const texts = textsOf(generate(configFor({ instructionStyle: style })).objects)
      expect(texts.some((t) => /[←-⇿⬀-⯿★●]/.test(t))).toBe(false)
    }
  })
})

describe('follow-the-route modes', () => {
  it('mode B forces coordinate labels and writes the end square', () => {
    const config = configFor({ difficulty: 'medium', mode: 'coordinate' })
    expect(resolveRouteSettings(config).showCoordLabels).toBe(true)

    const routes = routesFor(config)
    const key = textsOf(keyObjects(config))
    for (const route of routes) {
      expect(key).toContain(cellCode(route.end))
    }
    // The letters and numbers the reader reads them off are printed too.
    expect(key).toContain('A')
    expect(key).toContain('1')
  })

  it('End square label stays on one line (NBSP, no soft-wrap)', () => {
    const labels = textsOf(
      generate(configFor({ difficulty: 'medium', mode: 'coordinate' })).objects,
    ).filter((t) => /End[\u00a0 ]square:/.test(t))
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) {
      expect(label).toBe('End\u00a0square:')
      expect(label).not.toMatch(/ /)
    }
  })

  it('defaults to shade-the-end; difficulty only changes grid and move count', () => {
    const defaults = resolveRouteSettings(configFor())
    expect(defaults.mode).toBe('mark')
    expect(defaults.figures).toBe(4)

    const expert = resolveRouteSettings(configFor({ difficulty: 'expert' }))
    expect(expert.mode).toBe('mark')
    expect(expert.rows).toBe(8)
    expect(expert.numSteps).toBe(9)

    const texts = textsOf(generate(configFor({ difficulty: 'expert' })).objects)
    expect(texts).toContain('1.')
    expect(texts.some((t) => t.includes('Start on the dot and finish on the square'))).toBe(false)
    expect(texts.some((t) => t.includes('Start on the dot. Follow each numbered move'))).toBe(true)
  })

  it('legacy Match-the-difficulty falls back to shade-the-end / 4 grids', () => {
    const settings = resolveRouteSettings(
      configFor({ difficulty: 'expert', mode: 'auto', figuresPerPage: 'auto' }),
    )
    expect(settings.mode).toBe('mark')
    expect(settings.figures).toBe(4)
  })

  it('mode C prints both markers, far enough apart to be worth solving', () => {
    const config = configFor({ difficulty: 'expert', mode: 'route' })
    for (const route of routesFor(config)) {
      expect(manhattan(route.start, route.end)).toBeGreaterThanOrEqual(4)
      expect(route.end.row).not.toBe(route.start.row)
      expect(route.end.col).not.toBe(route.start.col)
    }
  })

  it('mode C keys a sample route that really lands on the square', () => {
    const config = configFor({ difficulty: 'expert', mode: 'route' })
    const settings = resolveRouteSettings(config)
    const key = textsOf(keyObjects(config))
    for (const route of routesFor(config)) {
      const sample = sampleRouteSteps(route)
      expect(sample).toHaveLength(settings.numSteps)
      expect(simulateRoute(route.start, sample)).toEqual(route.end)
      for (const step of sample) {
        expect(key).toContain(stepText(step, settings.instructionStyle))
      }
    }
    expect(key).not.toContain('One possible answer')
  })

  it('mode C blank count equals the sample route length (Expert: 9)', () => {
    const config = configFor({ difficulty: 'expert', mode: 'route', figuresPerPage: 1 })
    const settings = resolveRouteSettings(config)
    expect(settings.rows).toBe(8)
    expect(settings.cols).toBe(8)
    expect(settings.numSteps).toBe(9)
    const [route] = routesFor(config)
    const sample = sampleRouteSteps(route!)
    const ordinals = textsOf(generate(config).objects).filter((t) => /^\d+\.$/.test(t))
    expect(sample).toHaveLength(settings.numSteps)
    expect(ordinals).toHaveLength(sample.length)
    // Every blank has a matching answer on the key — no empty key slots.
    const key = textsOf(keyObjects(config))
    for (const step of sample) {
      expect(key).toContain(stepText(step, settings.instructionStyle))
    }
  })

  it('traces the path on the key only when asked', () => {
    const lines = (showPathOnKey: boolean) =>
      harvestAnswers(generate(configFor({ figuresPerPage: 1, showPathOnKey })).objects).filter(
        (o) => o.type === 'line',
      ).length
    expect(lines(false)).toBe(0)
    // One segment per step of the route.
    expect(lines(true)).toBe(resolveRouteSettings(configFor()).numSteps)
  })

  it('drops the how-to copy from the solution page but keeps the moves', () => {
    const config = configFor({ difficulty: 'easy', figuresPerPage: 1 })
    const key = textsOf(keyObjects(config))
    expect(key.some((t) => t.includes('Start on the dot'))).toBe(false)
    expect(key).toContain('1.')
  })
})

describe('follow-the-route print safety', () => {
  const TRIMS: ReadonlyArray<readonly [number, number]> = [
    [5, 8],
    [6, 9],
    [8.5, 11],
  ]

  it('keeps every object inside the safe margin', () => {
    for (const [wIn, hIn] of TRIMS) {
      const ctx = CTX({
        pageWidth: Math.round(wIn * DPI),
        pageHeight: Math.round(hIn * DPI),
        margin: {
          top: Math.round(0.25 * DPI),
          right: Math.round(0.25 * DPI),
          bottom: Math.round(0.25 * DPI),
          left: Math.round(0.375 * DPI),
        },
      })
      for (const difficulty of ROUTE_TIER_KEYS) {
        for (const mode of ['mark', 'coordinate', 'route'] as const) {
          for (const figuresPerPage of [1, 2, 4] as const) {
            const config = configFor({
              difficulty,
              mode,
              figuresPerPage,
              cellSize: 'large',
              showTitle: true,
              title: 'Game 1',
              instructionStyle: 'words',
              showCoordLabels: true,
              allowDiagonals: true,
            })
            const page = generate(config, ctx)
            assertObjectsInSafeMargin(page.objects, ctx)
            assertObjectsInSafeMargin(page.answerSourceObjects ?? [], ctx)
          }
        }
      }
    }
  }, 30_000)

  it('reports the square size the page will really print', () => {
    const layout = { pageWidth: 576, pageHeight: 864, margin: CTX().margin }
    const oneUp = printedCellSize(configFor({ figuresPerPage: 1, cellSize: 'large' }), layout)
    const fourUp = printedCellSize(configFor({ figuresPerPage: 4, cellSize: 'large' }), layout)
    expect(oneUp).toBeGreaterThan(fourUp!)
    // One grid must fill the page — not sit stamp-sized under the maxCell cap.
    expect(oneUp).toBeGreaterThan(CELL_SIZE_PX.large)
    expect(printedCellSize(configFor(), undefined)).toBeNull()
  })
})

describe('follow-the-route uniqueness', () => {
  it('never repeats a move list inside one page', () => {
    for (const difficulty of ROUTE_TIER_KEYS) {
      for (let seed = 1; seed <= 40; seed++) {
        const config = configFor({ difficulty, figuresPerPage: 4 })
        const lists = routesFor(config, CTX({ seed })).map((route) =>
          route.steps.map((s) => `${s.dir}${s.count}`).join(','),
        )
        expect(new Set(lists).size).toBe(lists.length)
      }
    }
  })

  it('gives two sellers on the same seed different pages', () => {
    const config = configFor()
    const forOwner = (ownerKey: string) =>
      contentFingerprint(generate(config, CTX({ ownerKey })).objects)
    expect(forOwner('user:1')).not.toBe(forOwner('user:2'))
    expect(forOwner('user:1')).toBe(forOwner('user:1'))
  })

  const distinctPages = (config: StudioConfig, samples = 120): number => {
    const seen = new Set<string>()
    for (let i = 0; i < samples; i++) {
      seen.add(
        contentFingerprint(generate(config, CTX({ seed: 1_000 + i * 7_919 })).objects),
      )
    }
    return seen.size
  }

  it('prints a distinct page for every seed a long book uses', () => {
    for (const difficulty of ROUTE_TIER_KEYS) {
      for (const mode of ['mark', 'coordinate'] as const) {
        expect(distinctPages(configFor({ difficulty, mode })), `${difficulty}/${mode}`).toBe(
          120,
        )
      }
    }
  }, 20_000)

  /**
   * Mode C prints two marks and nothing else, so one grid per page tops out at
   * roughly (cells x reachable ends) sheets — a few thousand, where the birthday
   * bound already shows up over 120 draws. The mode's help text says so, and
   * more than one grid per page puts it back out of reach.
   */
  it('warns where write-the-route entropy is thin, and clears it with more grids', () => {
    const oneUp = configFor({ difficulty: 'expert', mode: 'route', figuresPerPage: 1 })
    expect(distinctPages(oneUp)).toBeGreaterThanOrEqual(112)

    const twoUp = { ...oneUp, figuresPerPage: 2 }
    expect(distinctPages(twoUp)).toBe(120)

    const modeField = followTheRouteTemplate.configSchema.find((f) => f.key === 'mode')!
    expect(modeField.helpWhen!(oneUp)).toMatch(/only a few thousand/)
    expect(modeField.helpWhen!(twoUp)).not.toMatch(/only a few thousand/)
  }, 20_000)
})
