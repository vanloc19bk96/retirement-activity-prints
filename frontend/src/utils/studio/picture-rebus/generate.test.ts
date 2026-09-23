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
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { withStudioPageHeader } from '../studio-page-header'
import { contentFingerprint } from '../studio-content-fingerprint'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { hasLucideIconNode } from '../studio-icon'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { pictureRebusTemplate } from './generate'
import {
  PICTURE_REBUS_MAX_ICONS,
  PICTURE_REBUS_MAX_LETTERS,
  PICTURE_REBUS_MIN_ICONS,
  answerSlotOffsets,
  answerSlotUnits,
  loadPictureRebusBank,
  maxIconUsesPerPage,
  pictureRebusBankFaults,
  pictureRebusFaults,
  pictureRebusIconKey,
  pictureRebusPool,
  pictureRebusWorstCase,
  selectPictureRebusPuzzles,
  type PictureRebusPuzzle,
} from './content'
import {
  ICON_MIN,
  MAX_ITEMS_PER_PAGE,
  MIN_ITEMS_PER_PAGE,
  SLOT_MIN_W,
  iconBandWidth,
  pictureRebusBodyField,
  pictureRebusPrintNote,
  pictureRebusRowBoxes,
  planPictureRebusPage,
  slotBandWidth,
} from './layout'
import {
  DEFAULT_PICTURE_REBUS_LEVEL_ID,
  PICTURE_REBUS_LEVELS,
  parsePictureRebusLevel,
  pictureRebusInstruction,
} from './levels'
import { runPictureRebusKdpPreflight } from './kdp-preflight'

/**
 * The draft a seller really has in front of them.
 *
 * `buildDefaultConfig` on the raw template only covers this game's own field —
 * the page-header fields are merged in by the registry — so the common defaults
 * are restated here. Without them every measurement below would be taken
 * against a page with no heading.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(pictureRebusTemplate),
  showTitle: true,
  title: '',
  showInstructions: true,
  seed: 42,
  fontFamily: 'PT Serif',
}

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
})

/** Every paperback interior this app offers. */
const TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.25, 8],
  [5.5, 8.5],
  [6, 9],
  [6.69, 9.61],
  [7, 10],
  [7.5, 9.25],
  [8.5, 11],
]

/** What the form measures: a blank heading still prints "Game N". */
function headed(config: StudioConfig): StudioConfig {
  return withStudioPageHeader(config, {
    showTitle: config.showTitle !== false,
    title: config.title,
    showInstructions: config.showInstructions,
  })
}

/**
 * Generate the sheet a seller really gets.
 *
 * Always through `headed`: a run stamps its heading onto the config before
 * calling generate (a blank title still prints "Game N"), so a sheet built from
 * the raw draft is laid out against a page header that no printed sheet has.
 */
function generate(
  config: StudioConfig,
  ctx: StudioGenerateContext,
): StudioFabricObject[] {
  resetObjectCounter()
  return pictureRebusTemplate
    .generate(headed(config), ctx)
    .flatMap((page) => page.objects)
}

function planFor(config: StudioConfig, ctx: StudioGenerateContext) {
  const level = parsePictureRebusLevel(config)
  return planPictureRebusPage({
    page: ctx,
    config,
    level,
    instruction: pictureRebusInstruction(config),
    font: String(config.fontFamily),
  })
}

/** Text of every hidden answer object, in the order the page emits it. */
function answerText(objects: StudioFabricObject[]): string[] {
  return harvestAnswers(objects).map((obj) => String(obj.text ?? ''))
}

function iconNames(objects: StudioFabricObject[]): string[] {
  return objects
    .filter((obj) => obj.data?.source === 'lucide-icon')
    .map((obj) => String(obj.data?.iconName ?? ''))
}

runGeneratorContractTests(pictureRebusTemplate)
assertGeneratorEntropy(pictureRebusTemplate, { seeds: 60 })

describe('picture rebus bank', () => {
  it('holds only puzzles whose pictures spell their own answer', () => {
    expect(pictureRebusBankFaults()).toEqual([])
  })

  it('draws every picture from the curated Studio icon catalog', () => {
    for (const puzzle of loadPictureRebusBank()) {
      for (const icon of puzzle.icons) {
        expect(hasLucideIconNode(icon.name)).toBe(true)
      }
    }
  })

  it('keeps every answer and hint fit to print in a KDP interior', () => {
    for (const puzzle of loadPictureRebusBank()) {
      expect(isUnsafeCopy(puzzle.answer)).toBe(false)
      expect(isUnsafeCopy(puzzle.hint)).toBe(false)
      expect(puzzle.answer.replace(/ /g, '').length).toBeLessThanOrEqual(
        PICTURE_REBUS_MAX_LETTERS,
      )
      expect(puzzle.icons.length).toBeGreaterThanOrEqual(PICTURE_REBUS_MIN_ICONS)
      expect(puzzle.icons.length).toBeLessThanOrEqual(PICTURE_REBUS_MAX_ICONS)
    }
  })

  /**
   * The reversal trap, stated as a test.
   *
   * HOUSE + BOAT and BOAT + HOUSE are the same two pictures and two different
   * real words. A bank holding both has a page whose answer depends on which
   * way the reader happened to read it, and no amount of layout care fixes it.
   */
  it('never lets one set of pictures stand for two answers', () => {
    const seen = new Map<string, string>()
    for (const puzzle of loadPictureRebusBank()) {
      const key = pictureRebusIconKey(puzzle)
      expect(seen.get(key)).toBeUndefined()
      seen.set(key, puzzle.answer)
    }
  })

  it('gives every level enough puzzles to fill a full page several times', () => {
    for (const level of PICTURE_REBUS_LEVELS) {
      expect(pictureRebusPool(level).length).toBeGreaterThanOrEqual(
        MAX_ITEMS_PER_PAGE * 2,
      )
    }
  })

  it('rejects a puzzle whose pictures do not spell its answer', () => {
    const broken: PictureRebusPuzzle = {
      answer: 'SUNFLOWER',
      icons: [
        { name: 'sun', word: 'SUN' },
        { name: 'bird', word: 'BIRD' },
      ],
      hint: 'In the summer garden',
      tier: 1,
    }
    expect(pictureRebusFaults(broken).join(' ')).toContain('does not match its pictures')
  })

  it('rejects a puzzle whose picture the catalog cannot draw', () => {
    const broken: PictureRebusPuzzle = {
      answer: 'SUNFLOWER',
      icons: [
        { name: 'sun', word: 'SUN' },
        { name: 'not-an-icon', word: 'FLOWER' },
      ],
      hint: 'In the summer garden',
      tier: 1,
    }
    expect(pictureRebusFaults(broken).join(' ')).toContain('cannot draw')
  })
})

describe('picture rebus slots', () => {
  it('reserves a wider gap between two words than between two letters', () => {
    expect(answerSlotUnits('CARPET')).toBe(6)
    expect(answerSlotUnits('APPLE TREE')).toBeGreaterThan(9)
    expect(answerSlotUnits('APPLE TREE')).toBeLessThan(10)
  })

  it('gives one slot to every letter and none to the space', () => {
    expect(answerSlotOffsets('APPLE TREE')).toHaveLength(9)
    const offsets = answerSlotOffsets('APPLE TREE')
    expect(offsets[5]! - offsets[4]!).toBeGreaterThan(1)
  })
})

describe('picture rebus selection', () => {
  it('never repeats an answer or a pair of pictures on one page', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const level = parsePictureRebusLevel(base)
      const picked = selectPictureRebusPuzzles({ level, seed, count: MAX_ITEMS_PER_PAGE })
      expect(picked).toHaveLength(MAX_ITEMS_PER_PAGE)
      expect(new Set(picked.map((p) => p.answer)).size).toBe(picked.length)
      expect(new Set(picked.map(pictureRebusIconKey)).size).toBe(picked.length)
    }
  })

  it('keeps one picture from crowding a page, small pages hardest', () => {
    for (const count of [MIN_ITEMS_PER_PAGE, 4, 6, MAX_ITEMS_PER_PAGE]) {
      for (let seed = 1; seed <= 40; seed++) {
        const level = parsePictureRebusLevel(base)
        const picked = selectPictureRebusPuzzles({ level, seed, count })
        const uses = new Map<string, number>()
        for (const puzzle of picked) {
          for (const icon of puzzle.icons) {
            uses.set(icon.name, (uses.get(icon.name) ?? 0) + 1)
          }
        }
        for (const used of uses.values()) {
          expect(used).toBeLessThanOrEqual(maxIconUsesPerPage(count))
        }
      }
    }
  })

  it('draws only from the level it was asked for', () => {
    for (const level of PICTURE_REBUS_LEVELS) {
      const picked = selectPictureRebusPuzzles({ level, seed: 9, count: MAX_ITEMS_PER_PAGE })
      for (const puzzle of picked) {
        expect(level.tiers).toContain(puzzle.tier)
      }
    }
  })
})

describe('picture rebus layout', () => {
  it('fits a full-size page on every KDP interior, at large print', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PICTURE_REBUS_LEVELS) {
        const config = headed({ ...base, level: level.id })
        const plan = planFor(config, kdpCtx(w, h))
        expect(plan, `${w}x${h} ${level.id}`).not.toBeNull()
        expect(plan!.itemCount).toBeGreaterThanOrEqual(MIN_ITEMS_PER_PAGE)
        expect(plan!.itemCount).toBeLessThanOrEqual(MAX_ITEMS_PER_PAGE)
        expect(plan!.metrics.iconSize).toBeGreaterThanOrEqual(ICON_MIN)
        expect(plan!.metrics.slotWidth).toBeGreaterThanOrEqual(SLOT_MIN_W)
      }
    }
  })

  /**
   * The promise the plan makes to a book, not to a page.
   *
   * Pages of one run are laid out against the level's worst puzzle rather than
   * their own, so a reader flicking through does not see the pictures change
   * size from sheet to sheet.
   */
  it('lays out every page of one run identically whatever it drew', () => {
    const ctx = kdpCtx(6, 9)
    const config = headed(base)
    const first = planFor(config, ctx)!
    for (let seed = 2; seed <= 12; seed++) {
      expect(planFor(config, { ...ctx, seed })).toEqual(first)
    }
  })

  it('keeps the widest puzzle inside the column it was planned for', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PICTURE_REBUS_LEVELS) {
        const config = headed({ ...base, level: level.id })
        const plan = planFor(config, kdpCtx(w, h))!
        const worst = pictureRebusWorstCase(level)!
        expect(iconBandWidth(worst.icons.length, plan.metrics)).toBeLessThanOrEqual(
          plan.bandWidth,
        )
        expect(slotBandWidth(worst.answer, plan.metrics)).toBeLessThanOrEqual(
          plan.bandWidth,
        )
        for (const puzzle of pictureRebusPool(level)) {
          expect(slotBandWidth(puzzle.answer, plan.metrics)).toBeLessThanOrEqual(
            plan.bandWidth,
          )
        }
      }
    }
  })

  it('keeps the rows inside the body column, with air under the last rule', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const config = headed(base)
      const plan = planFor(config, ctx)!
      const field = pictureRebusBodyField(ctx, config, pictureRebusInstruction(config))
      const boxes = pictureRebusRowBoxes(field, plan)
      expect(boxes).toHaveLength(plan.itemCount)
      for (const box of boxes) {
        expect(box.top).toBeGreaterThanOrEqual(field.top - 0.5)
        expect(box.top + plan.rowHeight).toBeLessThanOrEqual(
          field.top + field.height - plan.bottomGuard + 0.5,
        )
        expect(box.left).toBeGreaterThanOrEqual(field.left - 0.5)
        expect(box.left + plan.columnWidth).toBeLessThanOrEqual(
          field.left + field.width + 0.5,
        )
      }
    }
  })

  it('tells the seller the same numbers the page prints', () => {
    const ctx = kdpCtx(8.5, 11)
    const config = headed(base)
    const plan = planFor(config, ctx)!
    const note = pictureRebusPrintNote({
      level: parsePictureRebusLevel(config),
      page: ctx,
      config,
      instruction: pictureRebusInstruction(config),
      font: String(config.fontFamily),
    })
    expect(note).toContain(`${plan.itemCount} puzzles a page`)
    if (plan.columns > 1) expect(note).toContain('two columns')
  })

  it('says which lever to pull when a page cannot hold the game', () => {
    const tiny = { ...kdpCtx(3, 4) }
    expect(planFor(headed(base), tiny)).toBeNull()
    const note = pictureRebusPrintNote({
      level: parsePictureRebusLevel(base),
      page: tiny,
      config: headed(base),
      instruction: pictureRebusInstruction(base),
      font: 'PT Serif',
    })
    expect(note).toContain('Settings')
  })
})

describe('picture rebus page', () => {
  it('stays inside the safe margin on every interior and level', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PICTURE_REBUS_LEVELS) {
        const ctx = kdpCtx(w, h)
        const objects = generate({ ...base, level: level.id }, ctx)
        assertObjectsInSafeMargin(objects, ctx)
      }
    }
  })

  it('prints the pictures and the slots of every puzzle it chose', () => {
    const ctx = kdpCtx(6, 9)
    const config = { ...base }
    const plan = planFor(headed(config), ctx)!
    const puzzles = selectPictureRebusPuzzles({
      level: parsePictureRebusLevel(config),
      seed: ctx.seed,
      count: plan.itemCount,
    })
    const objects = generate(config, ctx)

    expect(iconNames(objects)).toEqual(puzzles.flatMap((p) => p.icons.map((i) => i.name)))
    expect(answerText(objects).join('')).toBe(
      puzzles.map((p) => p.answer.replace(/ /g, '')).join(''),
    )
  })

  it('numbers the puzzles down the page from one', () => {
    const ctx = kdpCtx(8.5, 11)
    const objects = generate(base, ctx)
    const plan = planFor(headed(base), ctx)!
    const labels = objects
      .filter((obj) => /^\d+\.$/.test(String(obj.text ?? '')))
      .map((obj) => String(obj.text))
    expect(labels).toEqual(
      Array.from({ length: plan.itemCount }, (_, i) => `${i + 1}.`),
    )
  })

  it('hides every answer letter on the puzzle page', () => {
    const objects = generate(base, kdpCtx(6, 9))
    const answers = harvestAnswers(objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
  })

  it('prints a hint only on the gentle level', () => {
    const ctx = kdpCtx(6, 9)
    const gentleHints = loadPictureRebusBank().map((p) => p.hint)
    const hasHint = (config: StudioConfig) =>
      generate(config, ctx).some((obj) =>
        gentleHints.includes(String(obj.text ?? '').replace(/\n/g, ' ')),
      )
    expect(hasHint({ ...base, level: 'gentle' })).toBe(true)
    expect(hasHint({ ...base, level: 'classic' })).toBe(false)
    expect(hasHint({ ...base, level: 'challenging' })).toBe(false)
  })

  it('falls back to a readable message instead of a broken page', () => {
    const objects = generate(base, kdpCtx(3, 4))
    expect(objects.some((obj) => String(obj.text ?? '').includes('Settings'))).toBe(true)
    expect(harvestAnswers(objects)).toHaveLength(0)
  })
})

describe('picture rebus solution page', () => {
  it('reveals every answer in place, in print-safe black', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(pictureRebusTemplate.key)).toBe(true)

    const ctx = kdpCtx(6, 9)
    const puzzlePage = generate(base, ctx)
    const solution = buildAnswerPage(puzzlePage, STUDIO_ANSWER_INK_MONO)

    const revealed = solution.filter((obj) => obj.studioRole === 'answer')
    expect(revealed).toHaveLength(harvestAnswers(puzzlePage).length)
    expect(revealed.every((obj) => obj.visible === true)).toBe(true)
    expect(revealed.every((obj) => obj.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  /**
   * The solution page is the puzzle page. Any drift between them — a row that
   * moved, a picture that changed size — is a reader checking an answer against
   * a page they did not solve.
   */
  it('keeps every picture and slot exactly where the puzzle page put it', () => {
    const ctx = kdpCtx(6, 9)
    const puzzlePage = generate(base, ctx)
    const solution = buildAnswerPage(puzzlePage, STUDIO_ANSWER_INK_MONO)

    expect(iconNames(solution)).toEqual(iconNames(puzzlePage))
    const anchor = (objects: StudioFabricObject[]) =>
      objects
        .filter((obj) => obj.studioRole !== 'decoration')
        .map((obj) => `${obj.type}@${Math.round(obj.left)},${Math.round(obj.top)}`)
    expect(anchor(solution)).toEqual(anchor(puzzlePage))
  })

  it('answers each numbered puzzle with that puzzle', () => {
    const ctx = kdpCtx(6, 9)
    const config = { ...base }
    const plan = planFor(headed(config), ctx)!
    const puzzles = selectPictureRebusPuzzles({
      level: parsePictureRebusLevel(config),
      seed: ctx.seed,
      count: plan.itemCount,
    })
    const solution = buildAnswerPage(generate(config, ctx), STUDIO_ANSWER_INK_MONO)

    const letters = solution
      .filter((obj) => obj.studioRole === 'answer')
      .map((obj) => String(obj.text ?? ''))
    let cursor = 0
    for (const puzzle of puzzles) {
      const expected = puzzle.answer.replace(/ /g, '')
      expect(letters.slice(cursor, cursor + expected.length).join('')).toBe(expected)
      cursor += expected.length
    }
    expect(cursor).toBe(letters.length)
  })

  it('drops the how-to line but keeps the "+" between the pictures', () => {
    const ctx = kdpCtx(6, 9)
    const solution = buildAnswerPage(generate(base, ctx), STUDIO_ANSWER_INK_MONO)
    expect(solution.some((obj) => String(obj.text ?? '').includes('Each picture'))).toBe(
      false,
    )
    expect(solution.filter((obj) => String(obj.text ?? '') === '+').length).toBeGreaterThan(
      0,
    )
  })
})

describe('picture rebus preflight', () => {
  it('passes the page this game really builds, on every interior', () => {
    for (const [w, h] of TRIMS) {
      for (const level of PICTURE_REBUS_LEVELS) {
        const config = headed({ ...base, level: level.id })
        const ctx = kdpCtx(w, h)
        const plan = planFor(config, ctx)!
        const puzzles = selectPictureRebusPuzzles({
          level: parsePictureRebusLevel(config),
          seed: ctx.seed,
          count: plan.itemCount,
        })
        const result = runPictureRebusKdpPreflight({ puzzles, plan })
        expect(result.errors, `${w}x${h} ${level.id}`).toEqual([])
        expect(result.ok).toBe(true)
      }
    }
  })

  it('refuses a page that would print the same answer twice', () => {
    const config = headed(base)
    const ctx = kdpCtx(6, 9)
    const plan = planFor(config, ctx)!
    const puzzles = selectPictureRebusPuzzles({
      level: parsePictureRebusLevel(config),
      seed: ctx.seed,
      count: plan.itemCount,
    })
    const doubled = [...puzzles.slice(0, plan.itemCount - 1), puzzles[0]!]
    const result = runPictureRebusKdpPreflight({ puzzles: doubled, plan })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('same answer twice')
  })

  it('refuses a puzzle whose pictures do not spell its answer', () => {
    const config = headed(base)
    const ctx = kdpCtx(6, 9)
    const plan = planFor(config, ctx)!
    const puzzles = selectPictureRebusPuzzles({
      level: parsePictureRebusLevel(config),
      seed: ctx.seed,
      count: plan.itemCount,
    })
    const tampered = [
      { ...puzzles[0]!, answer: 'SOMETHING' },
      ...puzzles.slice(1),
    ]
    expect(runPictureRebusKdpPreflight({ puzzles: tampered, plan }).ok).toBe(false)
  })
})

describe('picture rebus form', () => {
  it('asks exactly one question about the puzzle', () => {
    expect(pictureRebusTemplate.configSchema.map((field) => field.key)).toEqual(['level'])
    expect(pictureRebusTemplate.configSchema[0]!.default).toBe(
      DEFAULT_PICTURE_REBUS_LEVEL_ID,
    )
  })

  it('changes the page when the level changes', () => {
    const ctx = kdpCtx(6, 9)
    const prints = PICTURE_REBUS_LEVELS.map((level) =>
      contentFingerprint(generate({ ...base, level: level.id }, ctx)),
    )
    expect(new Set(prints).size).toBe(prints.length)
  })
})
