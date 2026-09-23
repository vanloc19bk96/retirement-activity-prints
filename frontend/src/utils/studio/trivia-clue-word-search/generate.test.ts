import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { countTokenReadings } from '@/utils/puzzles/word-search-core'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage } from '../studio-answer-key'
import { drawHeader } from '../studio-layout'
import { withStudioPageHeader } from '../studio-page-header'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { triviaClueWordSearchTemplate } from './generate'
import { validateTriviaConfig } from './config'
import { TRIVIA_DEFAULT_TITLE, selectTriviaEntries } from './content'
import { CLUE_MIN_SIZE, MAX_CLUE_LINES, listFontSpec, measureClueLines } from './draw'
import { wrapSafeWidth, wrapTextToWidth } from '../studio-text-metrics'
import { runTriviaKdpPreflight } from './kdp-preflight'
import {
  CELL_MIN,
  LETTER_MIN,
  planTriviaPage,
  triviaBodyField,
  triviaContentBox,
  triviaListBudget,
  triviaPrintNote,
} from './layout'
import { TRIVIA_LEVELS, parseTriviaLevel, triviaInstruction } from './levels'
import { planAnswerBlock, planClueBlock } from './page'
import { tryBuildTriviaPuzzle } from './place'
import { TRIVIA_FIXTURE, TRIVIA_FIXTURE_ITEMS } from './fixture'

const remote = TRIVIA_FIXTURE

/**
 * The draft a seller really has in front of them.
 *
 * `buildDefaultConfig` on the raw template only covers this game's own fields —
 * the page-header fields are merged in by the registry — so the common
 * defaults are restated here. Without them `withThemeTitle` would stamp a
 * heading the plan never measured, and every number below would be off by the
 * height of a title.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(triviaClueWordSearchTemplate),
  showTitle: true,
  title: '',
  showInstructions: true,
  seed: 42,
  fontFamily: 'PT Serif',
}

const CTX = (): StudioGenerateContext => ({ ...STUDIO_TEST_CTX, remoteData: remote })

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42): StudioGenerateContext => ({
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
  remoteData: remote,
})

/**
 * Trims every level is expected to lay out on.
 *
 * 5 x 8 is deliberately absent. A grid at the large-print pitch, a numbered
 * clue list and a heading genuinely do not fit that trim, and the form says so
 * rather than printing a squint — the same call the hidden-message page makes.
 */
const PRINTABLE_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [7.5, 9.25],
  [8.5, 11],
]

/** What the form actually measures: a blank heading still prints "Game N". */
function headed(config: StudioConfig): StudioConfig {
  return withStudioPageHeader(config, {
    showTitle: config.showTitle === true,
    title: config.title,
    showInstructions: config.showInstructions,
  })
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (list: StudioFabricObject[]) => {
    for (const obj of list) {
      out.push(obj)
      if (Array.isArray(obj.objects)) walk(obj.objects)
    }
  }
  walk(objects)
  return out
}

/** Grid letters are the single-character prompt glyphs. */
function gridLetters(objects: StudioFabricObject[]): StudioFabricObject[] {
  return flatten(objects).filter(
    (obj) => obj.studioRole === 'prompt' && String(obj.text ?? '').length === 1,
  )
}

/** Numbered list items — clues on the puzzle page, answers on the key. */
function numberedLines(objects: StudioFabricObject[]): string[] {
  return flatten(objects)
    .filter((obj) => obj.studioRole === 'prompt' && /^\d+\./.test(String(obj.text ?? '')))
    .map((obj) => String(obj.text).replace(/\n/g, ' '))
}

function generateAt(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return triviaClueWordSearchTemplate.generate(config, ctx)
}

function planFor(config: StudioConfig, ctx: StudioGenerateContext) {
  return planTriviaPage({
    page: ctx,
    config,
    instruction: triviaInstruction(config),
    level: parseTriviaLevel(config),
  })
}

/**
 * The puzzle the page builds, without going through Fabric objects.
 *
 * Mirrors generate's own pool gates exactly — including the measured line
 * ceiling — so a test that compares this against the drawn page is comparing
 * the same puzzle rather than a lookalike.
 */
function buildPuzzle(config: StudioConfig, ctx: StudioGenerateContext) {
  const level = parseTriviaLevel(config)
  const plan = planFor(config, ctx)!
  const spec = listFontSpec(String(config.fontFamily))
  const entries = selectTriviaEntries(TRIVIA_FIXTURE_ITEMS, {
    minLetters: level.minLetters,
    maxLetters: plan.maxAnswerLetters,
    maxClueChars: level.clueMaxChars,
    maxClueLines: MAX_CLUE_LINES,
    clueLines: (clue) =>
      measureClueLines(`88. ${clue} (99)`, plan.clueFontSize, plan.clueWrapWidth, spec),
  })
  const puzzle = tryBuildTriviaPuzzle({
    entries,
    clueCount: Math.min(plan.clueCount, entries.length),
    gridSide: plan.gridSide,
    level,
    seed: ctx.seed,
  })
  return { level, plan, entries, puzzle }
}

runGeneratorContractTests(triviaClueWordSearchTemplate, {
  contextOverrides: { remoteData: remote },
})

assertGeneratorEntropy(triviaClueWordSearchTemplate, {
  seeds: 40,
  contextOverrides: { remoteData: remote },
})

describe('trivia clue word search — form', () => {
  it('asks two questions and no technical ones', () => {
    const keys = triviaClueWordSearchTemplate.configSchema.map((f) => f.key)
    expect(keys).toContain('theme')
    expect(keys).toContain('level')
    // Grid size, clue count, clue length and answer length come from the page,
    // not from a seller who cannot see the trim while answering.
    for (const derived of [
      'gridSize',
      'clueCount',
      'itemCount',
      'wordCount',
      'difficulty',
      'printStyle',
      'maxClueChars',
      'minLetters',
      'maxLetters',
    ]) {
      expect(keys).not.toContain(derived)
    }
  })

  it('names itself when the heading is left blank', () => {
    expect(triviaClueWordSearchTemplate.defaultPageTitle).toBe(TRIVIA_DEFAULT_TITLE)
  })

  it('requires a theme only when the seller chose to write one', () => {
    expect(validateTriviaConfig(base)).toBeNull()
    expect(validateTriviaConfig({ ...base, theme: 'custom' })?.field).toBe('customTheme')
    expect(
      validateTriviaConfig({ ...base, theme: 'custom', customTheme: 'Garden days' }),
    ).toBeNull()
  })

  it('reports the page it will really print, on the page size in Settings', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      const ctx = kdpCtx(wIn, hIn)
      const config = headed(base)
      const note = triviaPrintNote(
        parseTriviaLevel(config),
        ctx,
        config,
        triviaInstruction(config),
      )
      const plan = planFor(config, ctx)!
      expect(note).toContain(`${plan.clueCount} clues`)
      expect(note).toContain(`${plan.gridSide} × ${plan.gridSide}`)
      expect(note).toContain('answer page')
    }
  })

  it('offers only a lever that works when the trim is too small', () => {
    const ctx = kdpCtx(5, 8)
    const config = headed(base)
    const note = triviaPrintNote(
      parseTriviaLevel(config),
      ctx,
      config,
      triviaInstruction(config),
    )
    expect(planFor(config, ctx)).toBeNull()
    expect(note).toContain('larger page')
    expect(note).not.toContain('gentler level')
  })
})

describe('trivia clue word search — clues and grid agree', () => {
  it('numbers every clue against the answer the key prints', () => {
    const { puzzle } = buildPuzzle(headed(base), CTX())
    expect(puzzle).not.toBeNull()
    puzzle!.entries.forEach((entry, index) => {
      expect(entry.token).toBe(puzzle!.words[index])
      expect(entry.token).toBe(puzzle!.displays[index])
    })
  })

  it('places every answer in the grid, and each one reads exactly once', () => {
    for (const level of TRIVIA_LEVELS) {
      const { puzzle } = buildPuzzle(headed({ ...base, level: level.id }), CTX())
      expect(puzzle, level.id).not.toBeNull()
      const placed = new Set(puzzle!.placements.map((p) => p.word))
      for (const entry of puzzle!.entries) {
        expect(placed.has(entry.token), `${level.id} ${entry.token}`).toBe(true)
        expect(countTokenReadings(puzzle!.grid, entry.token)).toBe(1)
      }
      expect(puzzle!.placements.length).toBe(puzzle!.entries.length)
    }
  })

  it('never prints a clue that gives its own answer away', () => {
    const { puzzle } = buildPuzzle(headed(base), CTX())
    for (const entry of puzzle!.entries) {
      expect(entry.clue.toUpperCase()).not.toContain(entry.token)
      expect(entry.clue.trim().length).toBeGreaterThan(0)
    }
  })

  it('does not order the clues by their answers, which would leak them', () => {
    const { puzzle } = buildPuzzle(headed(base), CTX())
    const tokens = puzzle!.entries.map((entry) => entry.token)
    const sorted = [...tokens].sort()
    expect(tokens).not.toEqual(sorted)
  })

  it('passes its own preflight on every printable trim and level', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of TRIVIA_LEVELS) {
        const config = headed({ ...base, level: level.id })
        const ctx = kdpCtx(wIn, hIn)
        const { plan, puzzle } = buildPuzzle(config, ctx)
        expect(puzzle, `${wIn}x${hIn} ${level.id}`).not.toBeNull()
        const field = triviaBodyField(ctx, config, triviaInstruction(config))
        const shared = { field, plan, puzzle: puzzle!, font: 'PT Serif' }
        const clueList = planClueBlock(shared)!
        const answerList = planAnswerBlock(shared)!
        const result = runTriviaKdpPreflight({
          puzzle: puzzle!,
          plan,
          level,
          field,
          clueList,
          answerList,
        })
        expect(result.errors, `${wIn}x${hIn} ${level.id}`).toEqual([])
      }
    }
  })

  it('refuses a puzzle whose clue is numbered against a different answer', () => {
    const config = headed(base)
    const ctx = CTX()
    const { level, plan, puzzle } = buildPuzzle(config, ctx)
    const field = triviaBodyField(ctx, config, triviaInstruction(config))
    const swapped = {
      ...puzzle!,
      entries: [puzzle!.entries[1]!, puzzle!.entries[0]!, ...puzzle!.entries.slice(2)],
    }
    const shared = { field, plan, puzzle: swapped, font: 'PT Serif' }
    const result = runTriviaKdpPreflight({
      puzzle: swapped,
      plan,
      level,
      field,
      clueList: planClueBlock(shared)!,
      answerList: planAnswerBlock(shared)!,
    })
    expect(result.ok).toBe(false)
  })
})

describe('trivia clue word search — the printed page', () => {
  it('prints one clue per placed answer, numbered from one', () => {
    const config = headed(base)
    const ctx = CTX()
    const plan = planFor(config, ctx)!
    const [page] = generateAt(config, ctx)
    const clues = numberedLines(page!.objects)
    expect(clues).toHaveLength(plan.clueCount)
    expect(clues.map((line) => Number(line.split('.')[0]))).toEqual(
      Array.from({ length: plan.clueCount }, (_, i) => i + 1),
    )
  })

  it('tells the reader how many letters the answer has', () => {
    const [page] = generateAt(headed(base), CTX())
    for (const line of numberedLines(page!.objects)) {
      expect(line).toMatch(/\(\d+\)$/)
    }
  })

  it('sets grid letters and clues at large-print sizes', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of TRIVIA_LEVELS) {
        const config = headed({ ...base, level: level.id })
        const ctx = kdpCtx(wIn, hIn)
        const plan = planFor(config, ctx)
        expect(plan, `${wIn}x${hIn} ${level.id}`).not.toBeNull()
        expect(plan!.letterFont).toBeGreaterThanOrEqual(LETTER_MIN)
        expect(plan!.cell).toBeGreaterThanOrEqual(CELL_MIN)
        expect(plan!.clueFontSize).toBeGreaterThanOrEqual(CLUE_MIN_SIZE)

        const [page] = generateAt(config, ctx)
        for (const letter of gridLetters(page!.objects)) {
          expect(letter.fontSize ?? 0).toBeGreaterThanOrEqual(LETTER_MIN)
        }
      }
    }
  })

  it('keeps the clue block inside the room the grid left it', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      const config = headed(base)
      const ctx = kdpCtx(wIn, hIn)
      const { plan, puzzle } = buildPuzzle(config, ctx)
      const field = triviaBodyField(ctx, config, triviaInstruction(config))
      const shared = { field, plan, puzzle: puzzle!, font: 'PT Serif' }
      const clueList = planClueBlock(shared)!
      expect(clueList.height).toBeLessThanOrEqual(triviaListBudget(field, plan))
      expect(Math.max(...clueList.items.map((i) => i.lines))).toBeLessThanOrEqual(
        MAX_CLUE_LINES,
      )
      expect(planAnswerBlock(shared)!.height).toBeLessThanOrEqual(
        triviaListBudget(field, plan),
      )
    }
  })

  it('stays inside the safe margin on every printable trim', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of TRIVIA_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const pages = generateAt(headed({ ...base, level: level.id }), ctx)
        for (const page of pages) {
          assertObjectsInSafeMargin(page.objects, ctx)
          assertObjectsInSafeMargin(page.answerSourceObjects ?? [], ctx)
        }
      }
    }
  })

  it('draws a page rather than an error message on every printable trim', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of TRIVIA_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const [page] = generateAt(headed({ ...base, level: level.id }), ctx)
        expect(gridLetters(page!.objects).length, `${wIn}x${hIn} ${level.id}`).toBe(
          planFor(headed({ ...base, level: level.id }), ctx)!.gridSide ** 2,
        )
      }
    }
  })

  it('says so, rather than printing a squint, when the trim is too small', () => {
    const ctx = kdpCtx(5, 8)
    const [page] = generateAt(headed(base), ctx)
    expect(gridLetters(page!.objects)).toHaveLength(0)
    expect(
      flatten(page!.objects).some((obj) =>
        String(obj.text ?? '').includes('too small'),
      ),
    ).toBe(true)
    assertObjectsInSafeMargin(page!.objects, ctx)
  })

  it('falls back to the theme when the heading is left blank', () => {
    const [page] = generateAt({ ...base, title: '' }, CTX())
    const heading = flatten(page!.objects).find((obj) => obj.fontWeight === 700)
    expect(String(heading?.text ?? '').trim().length).toBeGreaterThan(0)
  })

  it('draws no page furniture when the heading strip is switched off', () => {
    const config = { ...base, showTitle: false, title: '', showInstructions: false }
    const ctx = CTX()
    const [page] = generateAt(config, ctx)
    const header = drawHeader(triviaContentBox(ctx), config, {
      templateKey: 'trivia-clue-word-search',
      instanceId: ctx.instanceId,
      pageRole: 'single',
    }, '')
    expect(header.objects).toHaveLength(0)
    expect(gridLetters(page!.objects).length).toBeGreaterThan(0)
  })
})

describe('trivia clue word search — the solution page', () => {
  it('prints black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('trivia-clue-word-search')).toBe(true)
  })

  it('lists the answers under the same numbers the clues carried', () => {
    const config = headed(base)
    const ctx = CTX()
    const { puzzle } = buildPuzzle(config, ctx)
    const [page] = generateAt(config, ctx)
    const answers = numberedLines(
      buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO),
    )
    expect(answers).toEqual(
      puzzle!.entries.map((entry, index) => `${index + 1}. ${entry.token}`),
    )
  })

  it('circles every answer, and only the answers', () => {
    const config = headed(base)
    const ctx = CTX()
    const plan = planFor(config, ctx)!
    const [page] = generateAt(config, ctx)
    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const capsules = flatten(key).filter((obj) => obj.studioRole === 'answer')
    expect(capsules).toHaveLength(plan.clueCount)
    expect(capsules.every((obj) => obj.visible === true)).toBe(true)
    expect(capsules.every((obj) => obj.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  it('centres the answer block instead of leaving it against the margin', () => {
    const config = headed(base)
    const ctx = CTX()
    const [page] = generateAt(config, ctx)
    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const field = triviaBodyField(ctx, config, triviaInstruction(config))

    const groups = key.filter(
      (obj) =>
        String(obj.type).toLowerCase() === 'group' &&
        (obj.objects ?? []).some((child) => /^\d+\./.test(String(child.text ?? ''))),
    )
    expect(groups.length).toBeGreaterThan(0)
    const left = Math.min(...groups.map((obj) => obj.left))
    const right = Math.max(...groups.map((obj) => obj.left + (obj.width ?? 0)))
    // Equal air either side, to within a rounding pixel or two.
    const slackLeft = left - field.left
    const slackRight = field.left + field.width - right
    expect(Math.abs(slackLeft - slackRight)).toBeLessThanOrEqual(4)
    expect(slackLeft).toBeGreaterThan(0)
  })

  it('hugs the answers rather than boxing them at clue width', () => {
    const config = headed(base)
    const ctx = CTX()
    const { plan, puzzle } = buildPuzzle(config, ctx)
    const field = triviaBodyField(ctx, config, triviaInstruction(config))
    const shared = { field, plan, puzzle: puzzle!, font: 'PT Serif' }
    const answerList = planAnswerBlock(shared)!
    const clueList = planClueBlock(shared)!

    // Short answers cannot justify a full clue column.
    expect(answerList.drawWidth).toBeLessThan(answerList.columnWidth)
    expect(answerList.drawWidth).toBeLessThan(clueList.drawWidth)
    // Every box still holds its own longest line without Fabric re-breaking it.
    for (const item of answerList.items) {
      expect(item.width).toBeLessThanOrEqual(answerList.drawWidth)
      expect(item.lines).toBe(1)
    }
    // Prose still fills its measure — the clue page is not narrowed by this.
    expect(clueList.drawWidth).toBeGreaterThan(clueList.columnWidth * 0.9)
  })

  it('leaves a wrapped clue room to wrap where the plan wrapped it', () => {
    const config = headed(base)
    const ctx = CTX()
    const { plan, puzzle } = buildPuzzle(config, ctx)
    const field = triviaBodyField(ctx, config, triviaInstruction(config))
    const font = 'PT Serif'
    const clueList = planClueBlock({ field, plan, puzzle: puzzle!, font })!
    const spec = listFontSpec(font)

    // Every box is drawn at this width, so re-breaking its own text here is
    // what Fabric does on the canvas. A line more than the plan counted is a
    // line of height nobody reserved — it prints over the next clue.
    const safe = wrapSafeWidth(clueList.drawWidth, spec)
    for (const item of clueList.items) {
      expect(wrapTextToWidth(item.text, clueList.fontSize, safe, spec)).toHaveLength(
        item.lines,
      )
    }
    expect(clueList.items.some((item) => item.lines > 1)).toBe(true)
  })

  it('does not reprint the clues the reader already has', () => {
    const config = headed(base)
    const ctx = CTX()
    const { puzzle } = buildPuzzle(config, ctx)
    const key = buildAnswerPage(
      generateAt(config, ctx)[0]!.answerSourceObjects!,
      STUDIO_ANSWER_INK_MONO,
    )
    const text = flatten(key)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(text).not.toContain(puzzle!.entries[0]!.clue)
  })

  it('keeps the solution heading inside the column on a narrow trim', () => {
    const ctx = kdpCtx(5.5, 8.5)
    const config = headed(base)
    const [page] = generateAt(config, ctx)
    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
      contentWidth: triviaContentBox(ctx).width,
    })
    assertObjectsInSafeMargin(key, ctx)
  })
})
