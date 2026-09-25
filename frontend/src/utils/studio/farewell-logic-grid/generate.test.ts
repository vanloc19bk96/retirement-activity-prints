import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO, STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { objectExtent } from '../studio-object-bounds'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { farewellLogicGridTemplate } from './generate'
import { instructionFor } from './config'
import {
  LG_CATEGORIES,
  LG_DEFAULT_TITLE,
  LG_MAX_LABEL_CHARS,
  LG_NAMES,
  LG_THEMES,
  lgCategory,
  type LgLevelValue,
} from './content'
import { clueText } from './clues'
import { LG_LEVELS, parseLgLevel } from './levels'
import { CELL_MIN, CLUE_FONT_MIN, lgPrintNote, planLgPage } from './layout'
import { NOTE_CLUES_CONTINUE, NOTE_GRID_NEXT } from './pages'
import { farewellLogicGridPrefetch, parseLgRemoteData } from './prefetch'
import { buildLgPuzzle, lgAvoidFromLabels, lgContentLabel } from './puzzle'

const FONT = 'PT Serif'
const LEVELS: LgLevelValue[] = ['gentle', 'classic', 'challenging']

const base: StudioConfig = {
  ...buildDefaultConfig(farewellLogicGridTemplate),
  showTitle: true,
  title: LG_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42, bookLabels: string[] = []): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'kdp',
  remoteData: { bookLabels },
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8.5, 8.5],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return farewellLogicGridTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const texts = (objects: StudioFabricObject[]) => objects.map((o) => clean(o.text)).filter(Boolean)
const labelsOf = (objects: StudioFabricObject[]) =>
  objects.map((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY]).filter((l): l is string => typeof l === 'string')
const walk = (objects: StudioFabricObject[]): StudioFabricObject[] =>
  objects.flatMap((o) => [o, ...(o.objects ? walk(o.objects) : [])])

// The key is built from `answerSourceObjects`; the puzzle pages carry no answer at all.
runGeneratorContractTests(farewellLogicGridTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: LG_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(farewellLogicGridTemplate, { seeds: 30 })

describe('farewell-logic-grid registry', () => {
  it('is registered once, in the logic tab, with an answer page and monochrome answers', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'farewell-logic-grid')).toHaveLength(1)
    const registered = getStudioTemplate('farewell-logic-grid')!
    expect(registered.category).toBe('logic')
    expect(registered.producesAnswerKey).toBe(true)
    expect(registered.defaultPageTitle).toBe(LG_DEFAULT_TITLE)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('farewell-logic-grid')).toBe(true)
  })

  it('asks only for a level', () => {
    const own = farewellLogicGridTemplate.configSchema.map((f) => f.key)
    expect(own).toEqual(['level'])
    expect(parseLgLevel(undefined).value).toBe('classic')
  })
})

describe('farewell-logic-grid content', () => {
  it('keeps every grid label short and every category complete', () => {
    for (const c of LG_CATEGORIES) {
      expect(c.values.length).toBeGreaterThanOrEqual(5)
      expect(new Set(c.values.map((v) => v.label.toLowerCase())).size).toBe(c.values.length)
      for (const v of c.values) expect(v.label.length).toBeLessThanOrEqual(LG_MAX_LABEL_CHARS)
    }
    for (const name of LG_NAMES) expect(name.length).toBeLessThanOrEqual(LG_MAX_LABEL_CHARS)
    expect(new Set(LG_NAMES).size).toBe(LG_NAMES.length)
  })

  it('gives every theme enough categories and one that runs in order', () => {
    for (const theme of LG_THEMES) {
      const cats = theme.categories.map(lgCategory)
      expect(cats.length).toBeGreaterThanOrEqual(4)
      expect(cats.some((c) => c.ordinal)).toBe(true)
    }
  })

  it('stays clear of topics that do not belong in a retirement book', () => {
    const blocked =
      /\b(old|elderly|senior moment|forget|memory loss|dementia|walker|cane|pill|medic|hospital|illness|sick|death|died|funeral|widow|grandchild|husband|wife|money|rich|poor|debt|lonely|nursing home)\b/i
    const everything = [
      ...LG_THEMES.flatMap((t) => [t.name, ...t.intros]),
      ...LG_CATEGORIES.flatMap((c) => [c.title, c.scenario, c.verb, c.negVerb, ...c.values.flatMap((v) => [v.label, v.phrase])]),
    ]
    for (const text of everything) expect(text).not.toMatch(blocked)
  })

  it('writes clues as short, clean sentences', () => {
    for (const level of LG_LEVELS) {
      for (let i = 0; i < 15; i++) {
        const puzzle = buildLgPuzzle({ level, shape: level.shapes[0]!, seed: 77 + i * 31_337 })!
        puzzle.clueTexts.forEach((text, j) => {
          expect(text).toBe(clueText(puzzle.clues[j]!, puzzle.wording))
          expect(text).toMatch(/^[A-Z].*\.$/)
          expect(text).not.toMatch(/\s{2}|undefined|null|NaN/)
          expect(text.length).toBeLessThanOrEqual(140)
        })
        for (const { def } of puzzle.wording.categories) expect(puzzle.scenario).toContain(def.scenario)
        expect(new Set(puzzle.wording.names.map((n) => n[0])).size).toBe(puzzle.shape.n)
      }
    }
  })
})

describe('farewell-logic-grid pages', () => {
  for (const [w, h] of TRIMS) {
    for (const level of LEVELS) {
      it(`${w} x ${h} ${level}: a full puzzle, inside the safe area, with a matching answer page`, () => {
        const ctx = kdpCtx(w, h)
        const config = { ...base, level }
        const pages = generate(config, ctx)
        const plan = planLgPage({ page: ctx, config, instruction: instructionFor(config), font: FONT, level: parseLgLevel(level) })!
        expect(plan).not.toBeNull()
        expect(plan.text.font).toBeGreaterThanOrEqual(CLUE_FONT_MIN)
        expect(plan.cell).toBeGreaterThanOrEqual(CELL_MIN)
        // A two-page plan prints on one page when this puzzle's clues are short.
        expect(pages.length).toBeGreaterThanOrEqual(1)
        expect(pages.length).toBeLessThanOrEqual(plan.pages)

        for (const page of pages) {
          assertObjectsInSafeMargin(page.objects, ctx)
          expect(harvestAnswers(page.objects)).toHaveLength(0)
        }
        const all = pages.flatMap((p) => texts(walk(p.objects)))
        expect(all.some((t) => /could not be built|too small/.test(t))).toBe(false)

        // Clues are numbered 1..m with no gaps across pages.
        const numbers = pages.flatMap((p) => texts(p.objects).filter((t) => /^\d+\.$/.test(t)))
        expect(numbers).toEqual(numbers.map((_, i) => `${i + 1}.`))
        expect(numbers.length).toBeGreaterThanOrEqual(4)

        if (pages.length === 2) {
          const note = texts(pages[0]!.objects).find((t) => t === NOTE_GRID_NEXT || t === NOTE_CLUES_CONTINUE)
          expect(note).toBeDefined()
        }

        // One grid, as one group, on the last puzzle page; the write-in chart,
        // when there is one, is a second group sharing the grid's left edge.
        const isGrid = (o: StudioFabricObject) => o.type === 'group' && Boolean(o.objects?.some((c) => c.angle === -90))
        const grids = pages.map((p) => p.objects.filter(isGrid).length)
        expect(grids[grids.length - 1]).toBe(1)
        const lastGroups = pages[pages.length - 1]!.objects.filter((o) => o.type === 'group')
        expect(lastGroups.length).toBeLessThanOrEqual(2)
        expect(new Set(lastGroups.map((o) => o.left)).size).toBe(1)

        // The key hangs off the last page only, and prints the stored answer.
        expect(pages.slice(0, -1).every((p) => !p.answerSourceObjects)).toBe(true)
        const source = pages[pages.length - 1]!.answerSourceObjects!
        assertObjectsInSafeMargin(source, ctx)
        // Scene name, answer table and grid share one left edge.
        const keyGroups = source.filter((o) => o.type === 'group')
        const sceneName = source.find((o) => o.data?.[STUDIO_CONTENT_LABEL_KEY])!
        expect(new Set([sceneName.left, ...keyGroups.map((o) => o.left)]).size).toBe(1)
        const key =buildAnswerPage(source, STUDIO_ANSWER_INK_MONO, { contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right })
        expect(key.every((o) => o.visible !== false)).toBe(true)
        const checks = harvestAnswers(source).filter((o) => o.type === 'group')
        const shape = plan.shape
        expect(checks.length === 0 || checks.length === (shape.n * shape.K * (shape.K + 1)) / 2).toBe(true)
        expect(texts(key).some((t) => t.startsWith('Solution'))).toBe(true)
      })
    }
  }

  it('keeps rotated labels inside the grid and the grid inside the page', () => {
    const ctx = kdpCtx(6, 9)
    for (const level of LEVELS) {
      const pages = generate({ ...base, level }, ctx)
      const grid = pages[pages.length - 1]!.objects.find((o) => o.type === 'group')!
      const gridBox = objectExtent(grid)
      const cx = grid.left + grid.width! / 2
      const cy = grid.top + grid.height! / 2
      for (const child of grid.objects!) {
        const e = objectExtent({ ...child, left: child.left + cx, top: child.top + cy })
        expect(e.left).toBeGreaterThanOrEqual(gridBox.left - 1)
        expect(e.right).toBeLessThanOrEqual(gridBox.right + 1)
        expect(e.top).toBeGreaterThanOrEqual(gridBox.top - 1)
        expect(e.bottom).toBeLessThanOrEqual(gridBox.bottom + 1)
      }
      expect(grid.objects!.some((o) => o.angle === -90)).toBe(true)
    }
  })

  it('reports what the trim prints, and refuses a page too small', () => {
    const config = { ...base, level: 'classic' }
    const note = lgPrintNote({ page: kdpCtx(8.5, 11), config, instruction: instructionFor(config), font: FONT, level: parseLgLevel('classic') })
    expect(note).toMatch(/Four people and three categories/)
    expect(note).toMatch(/answer page/)
    const tiny = { pageWidth: 200, pageHeight: 260, margin: { top: 10, right: 10, bottom: 10, left: 10 } }
    expect(lgPrintNote({ page: tiny, config, instruction: instructionFor(config), font: FONT, level: parseLgLevel('classic') })).toMatch(/too small/)
    const pages = generate(config, { ...kdpCtx(6, 9), ...tiny })
    expect(texts(pages[0]!.objects).some((t) => /too small/.test(t))).toBe(true)
  })

  it('prints five people for Challenging on a letter page', () => {
    const plan = planLgPage({ page: kdpCtx(8.5, 11), config: base, instruction: instructionFor(base), font: FONT, level: parseLgLevel('challenging') })!
    expect(plan.shape).toEqual({ n: 5, K: 3 })
  })
})

describe('farewell-logic-grid book uniqueness', () => {
  it('stamps its scene and pattern, and a later puzzle avoids both', async () => {
    const ctx = kdpCtx(8.5, 11, 7)
    const first = generate(base, ctx)
    const labels = labelsOf(first.flatMap((p) => p.objects))
    expect(labels).toHaveLength(1)
    const avoid = lgAvoidFromLabels(labels)
    expect(avoid.structures.size).toBe(1)

    const next = generate(base, { ...ctx, seed: 8, remoteData: { bookLabels: labels } })
    const nextLabel = labelsOf(next.flatMap((p) => p.objects))[0]!
    const [, theme, cats, structure] = nextLabel.split('|')
    expect(avoid.structures.has(structure!)).toBe(false)
    expect(avoid.combos.has(`${theme}|${cats}`)).toBe(false)
    // Themes spread: the used theme is not picked again while others are unused.
    expect(avoid.themeUse.has(theme!)).toBe(false)

    const remote = await farewellLogicGridPrefetch(base, new AbortController().signal, {
      bookContentLabels: () => labels,
    })
    expect(parseLgRemoteData(remote).bookLabels).toEqual(labels)
  })

  it('never repeats a pattern across a long book of one level', () => {
    const labels: string[] = []
    const level = LG_LEVELS.find((l) => l.value === 'gentle')!
    for (let i = 0; i < 40; i++) {
      const puzzle = buildLgPuzzle({ level, shape: level.shapes[0]!, seed: 3_000 + i * 104_723, avoid: lgAvoidFromLabels(labels) })!
      expect(puzzle).not.toBeNull()
      labels.push(lgContentLabel(puzzle))
    }
    const structures = labels.map((l) => l.split('|')[3])
    expect(new Set(structures).size).toBe(labels.length)
    // Scenes rotate through every theme before any repeats.
    const themes = labels.slice(0, LG_THEMES.length).map((l) => l.split('|')[1])
    expect(new Set(themes).size).toBe(LG_THEMES.length)
  })
})
