import { describe, it, expect } from 'vitest'
import { mazeTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
} from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import {
  mazeBodyField,
  mazeDrawField,
  mazePrintNote,
  planMazePage,
} from './layout'
import {
  MAZE_INSTRUCTION,
  MAZE_LEVELS,
  parseMazeLevel,
  type MazeLevelId,
} from './levels'
import { buildMaze, isPerfectMaze } from './generator'
import { runMazeKdpPreflight } from './kdp-preflight'

const base: StudioConfig = {
  ...buildDefaultConfig(mazeTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

/** The same page with its heading spelled out, as a real run always has one. */
const titled: StudioConfig = { ...base, title: 'Game 1' }

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
  seed: 4242,
  instanceId: 'kdp',
})

const KDP_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7.5, 9.25],
  [8.5, 11],
]

const LEVEL_IDS = MAZE_LEVELS.map((level) => level.id)

function page(config: StudioConfig, ctx: StudioGenerateContext = STUDIO_TEST_CTX) {
  resetObjectCounter()
  const [out] = mazeTemplate.generate(config, ctx)
  return out!
}

function mazeGroup(objects: readonly StudioFabricObject[]): StudioFabricObject {
  const group = objects.find((obj) => obj.type === 'group')
  expect(group, 'the page draws a maze').toBeDefined()
  return group!
}

const children = (group: StudioFabricObject): StudioFabricObject[] => group.objects ?? []

const wallBars = (group: StudioFabricObject) =>
  children(group).filter((obj) => obj.type === 'rect')

const captions = (group: StudioFabricObject) =>
  children(group)
    .filter((obj) => obj.type === 'textbox')
    .map((obj) => String(obj.text ?? '').trim())

const answerKey = (out: { objects: StudioFabricObject[]; answerSourceObjects?: StudioFabricObject[] }) =>
  buildAnswerPage(out.answerSourceObjects ?? out.objects, STUDIO_ANSWER_INK_MONO)

runGeneratorContractTests(mazeTemplate)
assertGeneratorEntropy(mazeTemplate)

describe('maze form', () => {
  it('is registered and skips manual answer-key fields', () => {
    const registered = getStudioTemplate('maze')
    expect(registered).toBeDefined()
    expect(registered!.producesAnswerKey).toBe(true)
    const keys = new Set(registered!.configSchema.map((field) => field.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('asks one question about the puzzle and derives the rest from the page', () => {
    const own = mazeTemplate.configSchema.map((field) => field.key)
    expect(own).toEqual(['level'])
    // The controls that used to fight each other are gone for good.
    const registered = new Set(getStudioTemplate('maze')!.configSchema.map((f) => f.key))
    expect(registered.has('size')).toBe(false)
    expect(registered.has('difficulty')).toBe(false)
    expect(registered.has('showLabels')).toBe(false)
  })

  it('defaults to the everyday level', () => {
    expect(buildDefaultConfig(mazeTemplate).level).toBe('classic')
  })

  it('reads the mazes a sheet was saved with before the ladder existed', () => {
    const cases: [StudioConfig, MazeLevelId][] = [
      [{ difficulty: 'easy' }, 'gentle'],
      [{ difficulty: 'medium' }, 'classic'],
      [{ difficulty: 'hard' }, 'challenging'],
      [{ size: 'small' }, 'gentle'],
      [{ size: 'xlarge' }, 'challenging'],
      [{}, 'classic'],
      // A saved level always wins over the fields it replaced.
      [{ level: 'gentle', difficulty: 'hard' }, 'gentle'],
    ]
    for (const [config, expected] of cases) {
      expect(parseMazeLevel(config).id, JSON.stringify(config)).toBe(expected)
    }
  })

  it('reports the maze the chosen trim will actually print', () => {
    const note = mazePrintNote({
      level: parseMazeLevel(titled),
      page: kdpCtx(8.5, 11),
      config: titled,
      instruction: MAZE_INSTRUCTION,
    })
    expect(note).toMatch(/A \d+ × \d+ maze/)
    expect(note).toMatch(/paths 0\.\d+ in wide/)
    expect(note).toContain('one way through')
    expect(note).toContain('answer page')
  })

  it('says so rather than promising a maze the page cannot hold', () => {
    const note = mazePrintNote({
      level: parseMazeLevel(titled),
      page: kdpCtx(4, 6),
      config: titled,
      instruction: MAZE_INSTRUCTION,
    })
    expect(note).toContain('too small')
  })
})

describe('maze page', () => {
  it('draws the whole puzzle as one movable group', () => {
    expect(page(titled).objects.filter((obj) => obj.type === 'group')).toHaveLength(1)
  })

  it('prints walls in black, not the grey a press would break up', () => {
    const bars = wallBars(mazeGroup(page(titled).objects))
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.every((bar) => bar.fill === STUDIO_INK)).toBe(true)
  })

  it('draws the outer frame heavier than the corridors inside it', () => {
    const plan = planMazePage({
      page: STUDIO_TEST_CTX,
      config: titled,
      instruction: MAZE_INSTRUCTION,
      level: parseMazeLevel(titled),
    })!
    const bars = wallBars(mazeGroup(page(titled).objects))
    const weights = new Set(bars.map((bar) => Math.min(bar.width!, bar.height!)))
    expect(weights.has(plan.metrics.wallWidth)).toBe(true)
    expect(weights.has(plan.metrics.borderWidth)).toBe(true)
    expect(plan.metrics.borderWidth).toBeGreaterThan(plan.metrics.wallWidth)
  })

  it('merges straight wall runs instead of emitting one bar per edge', () => {
    const ctx = kdpCtx(8.5, 11)
    const bars = wallBars(
      mazeGroup(page({ ...titled, level: 'challenging' }, ctx).objects),
    )
    // Un-merged, a 22 x 25 maze needs well over a thousand bars.
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.length).toBeLessThan(700)
  })

  it('labels both openings and points an arrow into each', () => {
    const group = mazeGroup(page(titled).objects)
    expect(captions(group)).toEqual(expect.arrayContaining(['Start', 'Finish']))
    expect(children(group).filter((obj) => obj.type === 'polygon')).toHaveLength(2)
  })

  it('sets the captions at large-print size, in the page font', () => {
    const group = mazeGroup(page(titled).objects)
    const labels = children(group).filter((obj) => obj.type === 'textbox')
    for (const label of labels) {
      // 13 pt is the floor the whole catalogue holds its supporting type to.
      expect(label.fontSize!).toBeGreaterThanOrEqual(Math.round((13 * DPI) / 72))
      expect(label.fontFamily).toBe('PT Serif')
    }
  })

  it('states the one-route promise, and keeps it off the answer page', () => {
    const out = page(titled)
    expect(out.objects.map((obj) => String(obj.text ?? ''))).toContain(MAZE_INSTRUCTION)
    expect(answerKey(out).map((obj) => String(obj.text ?? ''))).not.toContain(
      MAZE_INSTRUCTION,
    )
  })

  it('drops the instruction when the heading strip is switched off', () => {
    const out = page({ ...titled, showInstructions: false })
    expect(out.objects.map((obj) => String(obj.text ?? ''))).not.toContain(
      MAZE_INSTRUCTION,
    )
  })

  it('centres the maze in the content column', () => {
    const ctx = kdpCtx(7.5, 9.25)
    const group = mazeGroup(page(titled, ctx).objects)
    const left = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const right = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    expect(Math.abs(group.left! + group.width! / 2 - (left + right) / 2)).toBeLessThanOrEqual(2)
  })
})

describe('maze answer page', () => {
  it('hides the route on the puzzle page', () => {
    const answers = harvestAnswers(page(titled).objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
    expect(answers.every((obj) => obj.type === 'line')).toBe(true)
  })

  it('traces the route in black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('maze')).toBe(true)
    const revealed = harvestAnswers(answerKey(page(titled)))
    expect(revealed.length).toBeGreaterThan(0)
    expect(revealed.every((obj) => obj.visible === true)).toBe(true)
    expect(revealed.every((obj) => obj.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(revealed.every((obj) => obj.stroke !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('keeps Start and Finish on the key, so it reads as the same maze', () => {
    const key = answerKey(page(titled))
    expect(captions(mazeGroup(key))).toEqual(expect.arrayContaining(['Start', 'Finish']))
  })

  it('prints the same maze at the same size, centred in its own body', () => {
    const ctx = kdpCtx(6, 9)
    const out = page(titled, ctx)
    const puzzle = mazeGroup(out.objects)
    const key = mazeGroup(answerKey(out))

    expect(key.width).toBe(puzzle.width)
    expect(key.height).toBe(puzzle.height)
    expect(key.left).toBe(puzzle.left)

    // The key has no instruction, so its body is taller — the block re-centres.
    const keyField = mazeDrawField(mazeBodyField(ctx, titled, ''))
    const keyCentre = keyField.top + keyField.height / 2
    expect(Math.abs(key.top! + key.height! / 2 - keyCentre)).toBeLessThanOrEqual(3)
  })

  it('walls, route and captions all travel in the same group', () => {
    const key = mazeGroup(answerKey(page(titled)))
    const kinds = new Set(children(key).map((obj) => obj.type))
    expect(kinds).toContain('rect')
    expect(kinds).toContain('line')
    expect(kinds).toContain('textbox')
    expect(kinds).toContain('polygon')
  })
})

describe('maze print fitting', () => {
  it('stays inside the safe margin on every KDP trim and level', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of LEVEL_IDS) {
        for (const showTitle of [false, true]) {
          const ctx = kdpCtx(wIn, hIn)
          const config = {
            ...base,
            level,
            showTitle,
            title: showTitle ? 'Game 12' : '',
          }
          const out = page(config, ctx)
          assertObjectsInSafeMargin(out.objects, ctx)
          assertObjectsInSafeMargin(answerKey(out), ctx)
        }
      }
    }
  })

  it('keeps every path wide enough to draw a line down', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of MAZE_LEVELS) {
        const plan = planMazePage({
          page: kdpCtx(wIn, hIn),
          config: titled,
          instruction: MAZE_INSTRUCTION,
          level,
        })
        expect(plan, `${level.id} on ${wIn}x${hIn}`).not.toBeNull()
        expect(plan!.metrics.cell).toBeGreaterThanOrEqual(level.minPath)
        expect(plan!.metrics.cell).toBeLessThanOrEqual(level.maxPath)
        // A quarter inch is the floor for the game, whatever the level.
        expect(plan!.metrics.cell).toBeGreaterThanOrEqual(Math.round(0.24 * DPI))
      }
    }
  })

  it('keeps the grid inside the level bands on every trim', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of MAZE_LEVELS) {
        const plan = planMazePage({
          page: kdpCtx(wIn, hIn),
          config: titled,
          instruction: MAZE_INSTRUCTION,
          level,
        })!
        const where = `${level.id} on ${wIn}x${hIn}`
        expect(plan.cols, where).toBeGreaterThanOrEqual(level.minCols)
        expect(plan.cols, where).toBeLessThanOrEqual(level.maxCols)
        expect(plan.rows, where).toBeGreaterThanOrEqual(level.minRows)
        expect(plan.rows, where).toBeLessThanOrEqual(level.maxRows)
      }
    }
  })

  it('spends a larger trim on more maze, not on wider margins', () => {
    const cells = (wIn: number, hIn: number) => {
      const plan = planMazePage({
        page: kdpCtx(wIn, hIn),
        config: titled,
        instruction: MAZE_INSTRUCTION,
        level: parseMazeLevel(titled),
      })!
      return plan.cols * plan.rows
    }
    expect(cells(5, 8)).toBeLessThan(cells(6, 9))
    expect(cells(6, 9)).toBeLessThan(cells(8.5, 11))
  })

  it('prints a real maze at every level on the smallest trim it sells', () => {
    const ctx = kdpCtx(5, 8)
    for (const level of LEVEL_IDS) {
      const out = page({ ...titled, level }, ctx)
      const group = mazeGroup(out.objects)
      expect(wallBars(group).length, `${level} on 5 x 8`).toBeGreaterThan(20)
      assertObjectsInSafeMargin(out.objects, ctx)
    }
  })

  it('says so rather than printing a broken page when the trim is too small', () => {
    const ctx = kdpCtx(4, 6)
    const out = page(titled, ctx)
    expect(out.objects.some((obj) => obj.type === 'group')).toBe(false)
    const message = out.objects.find((obj) => obj.studioRole === 'prompt')
    expect(String(message?.text ?? '')).toContain('too small')
    assertObjectsInSafeMargin(out.objects, ctx)
  })
})

describe('maze quality', () => {
  it('gives every sheet of a book one way through, and a key that matches it', () => {
    const ctx = kdpCtx(7.5, 9.25)
    for (const level of LEVEL_IDS) {
      for (let seed = 1; seed <= 6; seed++) {
        const out = page({ ...titled, level }, { ...ctx, seed: seed * 101 })
        // A maze that failed preflight prints a message instead of a group.
        expect(out.objects.some((obj) => obj.type === 'group'), `${level} ${seed}`).toBe(
          true,
        )
        expect(harvestAnswers(out.objects).length).toBeGreaterThan(0)
      }
    }
  })

  it('never repeats a maze across the seeds one book would use', () => {
    const ctx = kdpCtx(6, 9)
    const seen = new Set<string>()
    for (let seed = 1; seed <= 24; seed++) {
      const group = mazeGroup(page(titled, { ...ctx, seed: seed * 7919 }).objects)
      seen.add(
        wallBars(group)
          .map((bar) => `${bar.left},${bar.top},${bar.width},${bar.height}`)
          .join('|'),
      )
    }
    expect(seen.size).toBe(24)
  })

  it('clears KDP preflight on every trim, level and seed a book would use', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of MAZE_LEVELS) {
        const plan = planMazePage({
          page: kdpCtx(wIn, hIn),
          config: titled,
          instruction: MAZE_INSTRUCTION,
          level,
        })!
        for (let seed = 1; seed <= 4; seed++) {
          const puzzle = buildMaze({
            rows: plan.rows,
            cols: plan.cols,
            profile: level.profile,
            rng: createRng(seed * 2711),
          })
          const preflight = runMazeKdpPreflight({ puzzle, plan, level })
          expect(preflight.errors, `${level.id} on ${wIn}x${hIn}`).toEqual([])
          expect(isPerfectMaze(puzzle)).toBe(true)
        }
      }
    }
  })

  it('refuses a maze with a second way through', () => {
    const level = MAZE_LEVELS[1]!
    const plan = planMazePage({
      page: kdpCtx(6, 9),
      config: titled,
      instruction: MAZE_INSTRUCTION,
      level,
    })!
    const puzzle = buildMaze({
      rows: plan.rows,
      cols: plan.cols,
      profile: level.profile,
      rng: createRng(5),
    })
    // One extra interior opening turns the tree into a loop: two routes.
    puzzle.vWalls[1]![1] = false
    puzzle.vWalls[1]![2] = false
    const preflight = runMazeKdpPreflight({ puzzle, plan, level })
    expect(preflight.ok).toBe(false)
    expect(preflight.errors.join(' ')).toContain('exactly one way through')
  })
})
