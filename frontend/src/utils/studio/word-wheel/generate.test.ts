import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildDefaultConfig, STUDIO_TEMPLATES } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { withStudioPageHeader } from '../studio-page-header'
import { contentFingerprint } from '../studio-content-fingerprint'
import { clearStudioRecentContent } from '../studio-variety'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { wordWheelTemplate } from './generate'
import {
  WORD_WHEEL_AVOID_WINDOW,
  WORD_WHEEL_DEFAULT_TITLE,
  WORD_WHEEL_OUTER_COUNT,
  answersFor,
  buildWordWheelPuzzle,
  centerChoicesFor,
  fitsLetters,
  letterCounts,
  lettersKey,
  loadWordWheelLexicon,
  loadWordWheelTargets,
  wordWheelFaults,
  type WordWheelPuzzle,
} from './content'
import {
  WHEEL_LETTER_MIN,
  WHEEL_MAX_DIAMETER,
  WHEEL_MIN_DIAMETER,
  planWordWheelPage,
  pxToPt,
  wordWheelBodyField,
  wordWheelPageBands,
  wordWheelPrintNote,
  wordWheelWorkBudget,
} from './layout'
import {
  DEFAULT_WORD_WHEEL_LEVEL_ID,
  WORD_WHEEL_LETTER_COUNT,
  WORD_WHEEL_LEVELS,
  WORD_WHEEL_MIN_WORD_LENGTH,
  parseWordWheelLevel,
  wordWheelGoal,
  wordWheelInstruction,
} from './levels'
import { goalCaption, planWordWheelSheet, wordWheelCanonicalKey } from './page'
import { runWordWheelKdpPreflight } from './kdp-preflight'
import {
  INNER_RADIUS_RATIO,
  SLOT_LABEL,
  planWordWheelSlots,
  wrapWriteCaption,
} from './draw'

/**
 * The draft a seller really has in front of them.
 *
 * `buildDefaultConfig` on the raw template only covers this game's own field —
 * the page-header fields are merged in by the registry — so the common defaults
 * are restated here. Without them every measurement below would be taken against
 * a page with no heading.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(wordWheelTemplate),
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

/**
 * Every paperback interior this app offers.
 *
 * Unlike the twenty-six word A to Z grid, a word wheel is nine letters and a few
 * ruled lines — it has no size below which it stops being itself, so it is
 * expected to lay out on the smallest trim KDP sells as well as the largest.
 */
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

/** What the form actually measures: a blank heading still prints "Game N". */
function headed(config: StudioConfig): StudioConfig {
  return withStudioPageHeader(config, {
    showTitle: config.showTitle === true,
    title: config.title,
    showInstructions: config.showInstructions,
  })
}

/**
 * The config a generated page really carries.
 *
 * A blank heading still prints "Game N", so every measurement here is taken
 * against a page with a title — the same page `generate` lays out.
 */
const titled: StudioConfig = headed(base)

function buildSheet(options: {
  ctx: StudioGenerateContext
  config?: StudioConfig
  levelId?: string
  seed?: number
}) {
  const config = {
    ...titled,
    ...options.config,
    level: options.levelId ?? DEFAULT_WORD_WHEEL_LEVEL_ID,
  }
  const level = parseWordWheelLevel(config)
  const instruction = wordWheelInstruction(config)
  const plan = planWordWheelPage({ page: options.ctx, config, instruction })
  expect(plan).not.toBeNull()
  const bandWidth = wordWheelBodyField(options.ctx, config, instruction).width
  const puzzle = buildWordWheelPuzzle({ level, seed: options.seed ?? options.ctx.seed })
  expect(puzzle).not.toBeNull()
  const sheet = planWordWheelSheet({
    plan: plan!,
    puzzle: puzzle!,
    level,
    bandWidth,
    font: 'PT Serif',
  })
  expect(sheet).not.toBeNull()
  return { config, level, instruction, plan: plan!, puzzle: puzzle!, sheet: sheet!, bandWidth }
}

/**
 * One page, and the sheet it was laid out from.
 *
 * Both are built from a cleared variety ledger, because the ledger is what
 * stops a book repeating a wheel — and a test that measured the page and then
 * rebuilt the sheet would be handed the *next* wheel, not the one on the page.
 */
function renderSheet(ctx: StudioGenerateContext, levelId?: string) {
  clearStudioRecentContent()
  const built = buildSheet({ ctx, levelId })
  clearStudioRecentContent()
  resetObjectCounter()
  const pages = wordWheelTemplate.generate(built.config, ctx)
  return { ...built, page: pages[0]! }
}

function textsOf(objects: StudioFabricObject[]): string[] {
  const out: string[] = []
  const walk = (list: StudioFabricObject[]) => {
    for (const obj of list) {
      if (obj.objects) walk(obj.objects)
      // Hard line breaks and NBSP are layout, not content: flatten both so a
      // caption the column wrapped still reads as the sentence it prints.
      const text = String(obj.text ?? '')
        .replace(/[\s\u00a0]+/g, ' ')
        .trim()
      if (text) out.push(text)
    }
  }
  walk(objects)
  return out
}

runGeneratorContractTests(wordWheelTemplate)

assertGeneratorEntropy(wordWheelTemplate, { seeds: 40 })

/* ------------------------------------------------------------------ *
 * The data the puzzle is built out of
 * ------------------------------------------------------------------ */

describe('word wheel — the bundled word lists', () => {
  it('holds only nine-letter targets, each printable', () => {
    const targets = loadWordWheelTargets()
    expect(targets.length).toBeGreaterThan(100)
    for (const target of targets) {
      expect(target).toMatch(/^[A-Z]{9}$/)
      expect(isUnsafeCopy(target)).toBe(false)
    }
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('never hides two targets that are the same nine letters', () => {
    // Two anagram targets are one puzzle printed twice: same wheel, same finds,
    // and a reader who solved GARDENING knows every answer on the other page.
    const keys = loadWordWheelTargets().map(lettersKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never hides a target whose letters also spell another word in the list', () => {
    // MILESTONE and LIMESTONE are the same nine letters. A page promising "one
    // word uses all nine" has two right answers and a key that marks one wrong.
    const nineLetterWords = loadWordWheelLexicon()
      .filter((entry) => entry.word.length === WORD_WHEEL_LETTER_COUNT)
      .map((entry) => entry.word)
    const byKey = new Map<string, string[]>()
    for (const word of nineLetterWords) {
      const key = lettersKey(word)
      byKey.set(key, [...(byKey.get(key) ?? []), word])
    }
    for (const target of loadWordWheelTargets()) {
      const clash = (byKey.get(lettersKey(target)) ?? []).filter((w) => w !== target)
      expect(clash, `${target} is also ${clash.join(', ')}`).toEqual([])
    }
  })

  it('holds only printable answer words', () => {
    const lexicon = loadWordWheelLexicon()
    expect(lexicon.length).toBeGreaterThan(2000)
    for (const entry of lexicon) {
      expect(entry.word).toMatch(/^[A-Z]{4,9}$/)
      expect(isUnsafeCopy(entry.word)).toBe(false)
    }
  })

  it('leaves every level more targets than one book can use', () => {
    // The avoid window is what stops a book repeating a wheel. It can only do
    // that while there are still unused targets behind it.
    for (const level of WORD_WHEEL_LEVELS) {
      const usable = loadWordWheelTargets().filter(
        (target) =>
          centerChoicesFor({
            target,
            minWordLength: level.minWordLength,
            minAnswers: level.minAnswers,
            maxAnswers: level.maxAnswers,
          }).length > 0,
      )
      expect(usable.length, level.id).toBeGreaterThan(WORD_WHEEL_AVOID_WINDOW)
    }
  })
})

/* ------------------------------------------------------------------ *
 * The puzzle
 * ------------------------------------------------------------------ */

describe('word wheel — the puzzle', () => {
  it('builds the wheel out of the hidden word, letter for letter', () => {
    for (const level of WORD_WHEEL_LEVELS) {
      clearStudioRecentContent()
      for (let i = 0; i < 12; i++) {
        const puzzle = buildWordWheelPuzzle({ level, seed: 900 + i * 37 })!
        expect(puzzle.target).toHaveLength(WORD_WHEEL_LETTER_COUNT)
        expect(puzzle.outer).toHaveLength(WORD_WHEEL_OUTER_COUNT)
        expect(lettersKey(puzzle.center + puzzle.outer.join(''))).toBe(
          lettersKey(puzzle.target),
        )
        expect(wordWheelFaults(puzzle)).toEqual([])
      }
    }
  })

  it('keeps a repeated letter on the wheel as many times as the word needs it', () => {
    // AFTERNOON carries two O's and two N's. A wheel that quietly de-duplicated
    // them could not spell its own hidden word.
    const repeated = loadWordWheelTargets().find(
      (target) => new Set(target).size < WORD_WHEEL_LETTER_COUNT,
    )
    expect(repeated).toBeDefined()
    const choices = centerChoicesFor({
      target: repeated!,
      minWordLength: WORD_WHEEL_MIN_WORD_LENGTH,
      minAnswers: 0,
      maxAnswers: Number.POSITIVE_INFINITY,
    })
    expect(choices.length).toBeGreaterThan(0)
    const counts = letterCounts(repeated!)
    const wheel = letterCounts(choices[0]!.center + repeated!.replace(choices[0]!.center, ''))
    expect(wheel).toEqual(counts)
  })

  it('never offers an answer the wheel cannot spell', () => {
    for (const target of loadWordWheelTargets().slice(0, 40)) {
      const available = letterCounts(target)
      for (const center of new Set(target)) {
        for (const word of answersFor({ target, center, minWordLength: 4 })) {
          expect(word.includes(center), `${word} / ${center}`).toBe(true)
          expect(fitsLetters(word, available), `${word} / ${target}`).toBe(true)
          expect(word).not.toBe(target)
        }
      }
    }
  })

  it('counts a letter used twice against a wheel that holds it once', () => {
    // GARDENING holds one R: a word needing two of them is not an answer.
    expect(fitsLetters('ERROR', letterCounts('GARDENING'))).toBe(false)
    expect(fitsLetters('RANGE', letterCounts('GARDENING'))).toBe(true)
    expect(fitsLetters('GREEN', letterCounts('GARDENING'))).toBe(false)
  })

  it('picks a middle letter the wheel is worth solving on', () => {
    for (const level of WORD_WHEEL_LEVELS) {
      clearStudioRecentContent()
      for (let i = 0; i < 10; i++) {
        const puzzle = buildWordWheelPuzzle({ level, seed: 3_000 + i * 613 })!
        expect(puzzle.answers.length, `${puzzle.target}/${puzzle.center}`).toBeGreaterThanOrEqual(
          level.minAnswers,
        )
        expect(
          puzzle.answers.every((word) => word.length >= level.minWordLength),
        ).toBe(true)
      }
    }
  })

  it('does not print the nine-letter word around the rim in order', () => {
    for (const level of WORD_WHEEL_LEVELS) {
      clearStudioRecentContent()
      for (let i = 0; i < 20; i++) {
        const puzzle = buildWordWheelPuzzle({ level, seed: 77 + i * 991 })!
        const at = puzzle.target.indexOf(puzzle.center)
        const rim = puzzle.target.slice(0, at) + puzzle.target.slice(at + 1)
        const ring = [...puzzle.outer, ...puzzle.outer].join('')
        const back = [...puzzle.outer].reverse()
        expect(ring.includes(rim)).toBe(false)
        expect([...back, ...back].join('').includes(rim)).toBe(false)
      }
    }
  })

  it('does not repeat a wheel while the book is still short', () => {
    // The whole point of the variety ledger: a seller building a forty-game
    // book must not be handed the same nine letters twice.
    clearStudioRecentContent()
    const seen = new Set<string>()
    for (let i = 0; i < WORD_WHEEL_AVOID_WINDOW; i++) {
      const puzzle = buildWordWheelPuzzle({
        level: WORD_WHEEL_LEVELS[1]!,
        seed: 1_000 + i * 7_919,
      })
      expect(puzzle).not.toBeNull()
      seen.add(puzzle!.target)
    }
    expect(seen.size).toBe(WORD_WHEEL_AVOID_WINDOW)
  })

  it('is the same puzzle for the same seed on a clean ledger', () => {
    clearStudioRecentContent()
    const first = buildWordWheelPuzzle({ level: WORD_WHEEL_LEVELS[1]!, seed: 4_242 })
    clearStudioRecentContent()
    const second = buildWordWheelPuzzle({ level: WORD_WHEEL_LEVELS[1]!, seed: 4_242 })
    expect(first).toEqual(second)
  })
})

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

describe('word wheel — the page', () => {
  it('lays out on every paperback trim, at large print', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const config = headed(base)
      const plan = planWordWheelPage({
        page: ctx,
        config,
        instruction: wordWheelInstruction(config),
      })
      expect(plan, `${w} x ${h}`).not.toBeNull()
      expect(plan!.outerLetterFont).toBeGreaterThanOrEqual(WHEEL_LETTER_MIN)
      expect(plan!.centerLetterFont).toBeGreaterThan(plan!.outerLetterFont)
      expect(plan!.diameter).toBeGreaterThanOrEqual(WHEEL_MIN_DIAMETER)
      expect(plan!.diameter).toBeLessThanOrEqual(WHEEL_MAX_DIAMETER)
    }
  })

  it('never lets a block overrun the column or the block below it', () => {
    for (const [w, h] of TRIMS) {
      const { plan, sheet, bandWidth, config, instruction } = buildSheet({
        ctx: kdpCtx(w, h),
      })
      const field = wordWheelBodyField(kdpCtx(w, h), config, instruction)
      const bands = wordWheelPageBands(field, plan)
      expect(bands.slots.top).toBeGreaterThanOrEqual(bands.wheel.top + bands.wheel.height)
      expect(bands.work.top).toBeGreaterThanOrEqual(bands.slots.top + bands.slots.height)
      expect(bands.work.top + bands.work.height).toBeLessThanOrEqual(
        field.top + field.height + 1,
      )
      const budget = wordWheelWorkBudget(plan)
      expect(sheet.lines.height).toBeLessThanOrEqual(budget)
      expect(sheet.list.height).toBeLessThanOrEqual(budget)
      expect(sheet.list.blockWidth).toBeLessThanOrEqual(bandWidth)
      expect(plan.slots.blockWidth).toBeLessThanOrEqual(bandWidth)
    }
  })

  it('keeps every object inside the safe margin, on every trim and level', () => {
    for (const [w, h] of TRIMS) {
      for (const level of WORD_WHEEL_LEVELS) {
        clearStudioRecentContent()
        resetObjectCounter()
        const ctx = kdpCtx(w, h)
        const pages = wordWheelTemplate.generate({ ...titled, level: level.id }, ctx)
        for (const page of pages) {
          assertObjectsInSafeMargin(page.objects, ctx)
          assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects, ctx)
        }
      }
    }
  })

  it('gives the nine slots room for a hand on the tightest trim', () => {
    const ctx = kdpCtx(5, 8)
    const config = headed(base)
    const field = wordWheelBodyField(ctx, config, wordWheelInstruction(config))
    const slots = planWordWheelSlots(field.width)
    expect(slots).not.toBeNull()
    expect(slots!.blockWidth).toBeLessThanOrEqual(field.width)
    expect(slots!.slotWidth).toBeGreaterThanOrEqual(26)
  })

  it('reports the size it will really print, in the form help line', () => {
    const ctx = kdpCtx(6, 9)
    const config = headed(base)
    const instruction = wordWheelInstruction(config)
    const plan = planWordWheelPage({ page: ctx, config, instruction })!
    const note = wordWheelPrintNote(
      parseWordWheelLevel(config),
      ctx,
      config,
      instruction,
    )
    expect(note).toContain(`${pxToPt(plan.outerLetterFont)} pt`)
  })

  it('says a too-small page is a page problem, not a level problem', () => {
    // The level does not move this layout, so "try a gentler level" would send
    // a seller round a loop that ends where it started.
    const tiny: StudioGenerateContext = {
      pageWidth: 300,
      pageHeight: 300,
      margin: { top: 24, right: 24, bottom: 24, left: 24 },
      seed: 1,
      instanceId: 'tiny',
    }
    const config = headed(base)
    const note = wordWheelPrintNote(
      parseWordWheelLevel(config),
      tiny,
      config,
      wordWheelInstruction(config),
    )
    expect(note).toContain('larger page in Settings')
    expect(note).not.toContain('gentler level')
  })
})

/* ------------------------------------------------------------------ *
 * The wheel as drawn
 * ------------------------------------------------------------------ */

describe('word wheel — the wheel as drawn', () => {
  const wheelGroup = (objects: StudioFabricObject[]) =>
    objects.find((obj) => typeof obj.data?.studioCanonicalKey === 'string')!

  it('prints nine letters: eight around a rim and one in the middle', () => {
    const { page, puzzle } = renderSheet(kdpCtx(6, 9))
    const letters = (wheelGroup(page.objects).objects ?? []).filter((obj) =>
      String(obj.type) === 'textbox',
    )
    expect(letters).toHaveLength(WORD_WHEEL_LETTER_COUNT)
    // Children are stored relative to the group centre, so the middle letter is
    // the one sitting on the origin.
    const middle = letters.filter((obj) => obj.left === 0 && obj.top === 0)
    expect(middle).toHaveLength(1)
    expect(middle[0]!.text).toBe(puzzle.center)
    expect(letters.filter((obj) => obj !== middle[0]).map((obj) => obj.text)).toEqual(
      puzzle.outer,
    )
  })

  it('spaces the rim letters evenly, clear of the spokes', () => {
    const { page, plan } = renderSheet(kdpCtx(6, 9))
    const radius = plan.diameter / 2
    const rim = (wheelGroup(page.objects).objects ?? [])
      .filter((obj) => String(obj.type) === 'textbox' && (obj.left !== 0 || obj.top !== 0))
      .map((obj) => ({
        distance: Math.hypot(obj.left, obj.top),
        angle: (Math.atan2(obj.top, obj.left) * 180) / Math.PI,
      }))
    expect(rim).toHaveLength(WORD_WHEEL_OUTER_COUNT)
    for (const letter of rim) {
      // Inside the rim, outside the middle ring: never on a line.
      expect(letter.distance).toBeGreaterThan(radius * INNER_RADIUS_RATIO)
      expect(letter.distance).toBeLessThan(radius)
    }
    const angles = rim.map((letter) => (letter.angle + 360) % 360).sort((a, b) => a - b)
    for (let i = 1; i < angles.length; i++) {
      expect(Math.round(angles[i]! - angles[i - 1]!)).toBe(45)
    }
  })

  it('marks the middle letter three ways, none of them colour', () => {
    // Black on white is the only ink this book has. The middle letter is inside
    // a double ring, the inner ring is the heaviest stroke on the page, and the
    // letter is bold and larger than its neighbours.
    const { page, plan, puzzle } = renderSheet(kdpCtx(6, 9))
    const children = wheelGroup(page.objects).objects ?? []
    const circles = children
      .filter((obj) => String(obj.type) === 'circle')
      .sort((a, b) => (a.radius ?? 0) - (b.radius ?? 0))
    expect(circles).toHaveLength(3)
    expect(circles[0]!.radius).toBeLessThan(circles[1]!.radius!)
    expect(circles[1]!.strokeWidth).toBeGreaterThan(circles[2]!.strokeWidth!)

    const middle = children.find((obj) => obj.text === puzzle.center && obj.left === 0)!
    expect(middle.fontWeight).toBe(700)
    expect(middle.fontSize).toBe(plan.centerLetterFont)
    expect(middle.fontSize!).toBeGreaterThan(plan.outerLetterFont)
    // Every letter is the same black — nothing here is carried by colour.
    const inks = new Set(
      children
        .filter((obj) => String(obj.type) === 'textbox')
        .map((obj) => String(obj.fill)),
    )
    expect([...inks]).toEqual(['#000000'])
  })

  it('keeps the wheel from swallowing the page it sits on', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const config = titled
      const instruction = wordWheelInstruction(config)
      const plan = planWordWheelPage({ page: ctx, config, instruction })!
      const field = wordWheelBodyField(ctx, config, instruction)
      const share = (plan.diameter / field.height) * 100
      expect(share, `${w} x ${h}`).toBeGreaterThan(35)
      expect(share, `${w} x ${h}`).toBeLessThan(70)
    }
  })
})

/* ------------------------------------------------------------------ *
 * What the two pages say to each other
 * ------------------------------------------------------------------ */

describe('word wheel — puzzle page and solution page', () => {
  it('asks for a number the solution page can actually show', () => {
    for (const [w, h] of TRIMS) {
      for (const level of WORD_WHEEL_LEVELS) {
        clearStudioRecentContent()
        const { sheet } = buildSheet({ ctx: kdpCtx(w, h), levelId: level.id })
        expect(sheet.goal).toBeGreaterThan(0)
        expect(sheet.goal).toBeLessThanOrEqual(sheet.list.words.length)
        expect(sheet.goal).toBeLessThanOrEqual(sheet.lines.capacity)
      }
    }
  })

  it('groups the nine-letter word rules so they move as one block', () => {
    const { page, puzzle } = renderSheet(kdpCtx(6, 9))
    const ruleGroups = page.objects.filter(
      (obj) =>
        obj.type === 'group' &&
        (obj.objects ?? []).length === puzzle.target.length &&
        (obj.objects ?? []).every((child) => child.type === 'rect'),
    )
    expect(ruleGroups).toHaveLength(1)
  })

  it('groups the solution word with the lines under it, and the word list as one block', () => {
    const { page, puzzle, sheet } = renderSheet(kdpCtx(6, 9))
    const solution = page.answerSourceObjects ?? []
    const slotGroups = solution.filter((obj) => {
      const children = obj.objects ?? []
      const letters = children
        .filter((child) => child.type === 'textbox')
        .map((child) => String(child.text ?? ''))
        .join('')
      const rules = children.filter((child) => child.type === 'rect')
      return obj.type === 'group' && letters === puzzle.target && rules.length === puzzle.target.length
    })
    expect(slotGroups).toHaveLength(1)

    const listGroups = solution.filter(
      (obj) =>
        obj.type === 'group' &&
        (obj.objects ?? []).some((child) => String(child.text ?? '').includes('Words we found')),
    )
    expect(listGroups).toHaveLength(1)
    const words = (listGroups[0]!.objects ?? [])
      .map((child) => String(child.text ?? ''))
      .filter((text) => sheet.list.words.includes(text))
    expect(words).toEqual(sheet.list.words)
  })

  it('groups the writing lines so they move as one block', () => {
    const { page, sheet } = renderSheet(kdpCtx(6, 9))
    const groups = page.objects.filter(
      (obj) =>
        obj.type === 'group' &&
        (obj.objects ?? []).some((child) =>
          String(child.text ?? '').includes('Find at least'),
        ),
    )
    expect(groups).toHaveLength(1)
    const rules = (groups[0]!.objects ?? []).filter((child) => child.type === 'rect')
    expect(rules).toHaveLength(sheet.lines.rowCount * sheet.lines.columnCount)
  })

  it('prints the goal on the puzzle page and the words on the solution', () => {
    const { page, sheet, puzzle } = renderSheet(kdpCtx(6, 9))

    const puzzleText = textsOf(page.objects).join(' | ')
    expect(puzzleText).toContain(`Find at least ${sheet.goal} words`)
    expect(puzzleText).toContain(SLOT_LABEL)

    const solutionText = textsOf(page.answerSourceObjects!)
    for (const word of sheet.list.words) expect(solutionText).toContain(word)
    // The puzzle page must not print the answer list anywhere.
    const listOnPuzzle = sheet.list.words.filter((word) =>
      textsOf(page.objects).includes(word),
    )
    expect(listOnPuzzle).toEqual([])
    expect(puzzle.answers).not.toContain(puzzle.target)
  })

  it('hides the nine-letter word on the puzzle and reveals it on the key', () => {
    const { page, puzzle } = renderSheet(kdpCtx(6, 9))

    const hidden = harvestAnswers(page.objects)
    expect(hidden.length).toBeGreaterThan(0)
    expect(hidden.every((obj) => obj.visible === false)).toBe(true)
    // Every letter of the target is on a slot, in order.
    expect(hidden.map((obj) => String(obj.text)).join('')).toBe(puzzle.target)

    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const revealed = key.filter((obj) => obj.studioPageRole === 'answers')
    expect(revealed.length).toBeGreaterThan(0)
    expect(textsOf(key).join('')).toContain(puzzle.target)
  })

  it('gives the first letter away only on the gentle level', () => {
    for (const level of WORD_WHEEL_LEVELS) {
      clearStudioRecentContent()
      resetObjectCounter()
      const ctx = kdpCtx(6, 9)
      const page = wordWheelTemplate.generate({ ...titled, level: level.id }, ctx)[0]!
      const hidden = harvestAnswers(page.objects)
      expect(hidden.length, level.id).toBe(
        level.firstLetterGiven ? WORD_WHEEL_LETTER_COUNT - 1 : WORD_WHEEL_LETTER_COUNT,
      )
    }
  })

  it('keeps the wheel in the same place on both pages', () => {
    const { page } = renderSheet(kdpCtx(6, 9))
    const wheelOf = (objects: StudioFabricObject[]) =>
      objects.find((obj) => typeof obj.data?.studioCanonicalKey === 'string')
    const onPuzzle = wheelOf(page.objects)!
    const onSolution = wheelOf(page.answerSourceObjects!)!
    expect(onSolution.left).toBe(onPuzzle.left)
    expect(onSolution.top).toBe(onPuzzle.top)
    expect(onSolution.width).toBe(onPuzzle.width)
  })

  it('breaks its own caption over two lines rather than dropping the rule', () => {
    // The instruction strip can be switched off; this caption is then the only
    // place the middle-letter rule is stated, so a narrow column may not shorten
    // it away.
    const caption = goalCaption(12)
    expect(caption).toContain('Find at least 12 words')
    expect(caption).toContain('middle letter')

    const flatten = (text: string) => text.split('\n').join(' ')
    const wide = wrapWriteCaption(caption, 1_000, 'PT Serif')
    const narrow = wrapWriteCaption(caption, 200, 'PT Serif')
    // The target and the rule are broken apart on purpose, whatever the column.
    expect(wide.text.split('\n')).toHaveLength(2)
    expect(narrow.text.split('\n').length).toBeGreaterThan(2)
    expect(flatten(narrow.text)).toBe(flatten(caption))
    expect(narrow.height).toBeGreaterThan(wide.height)
  })
})

/* ------------------------------------------------------------------ *
 * Preflight
 * ------------------------------------------------------------------ */

describe('word wheel — preflight', () => {
  const corrupt = (
    puzzle: WordWheelPuzzle,
    patch: Partial<WordWheelPuzzle>,
  ): WordWheelPuzzle => ({ ...puzzle, ...patch })

  it('passes a sheet the generator actually built', () => {
    for (const level of WORD_WHEEL_LEVELS) {
      clearStudioRecentContent()
      const ctx = kdpCtx(6, 9)
      const built = buildSheet({ ctx, levelId: level.id })
      const result = runWordWheelKdpPreflight({
        puzzle: built.puzzle,
        plan: built.plan,
        sheet: built.sheet,
        level: built.level,
        bandWidth: built.bandWidth,
      })
      expect(result.errors).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('refuses a wheel whose letters do not spell the hidden word', () => {
    clearStudioRecentContent()
    const built = buildSheet({ ctx: kdpCtx(6, 9) })
    const broken = corrupt(built.puzzle, {
      outer: [...built.puzzle.outer.slice(1), 'Z'],
    })
    expect(wordWheelFaults(broken).length).toBeGreaterThan(0)
    const result = runWordWheelKdpPreflight({ ...built, puzzle: broken })
    expect(result.ok).toBe(false)
  })

  it('refuses an answer that skips the middle letter', () => {
    clearStudioRecentContent()
    const built = buildSheet({ ctx: kdpCtx(6, 9) })
    const other = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(
      (letter) => letter !== built.puzzle.center,
    )!
    const broken = corrupt(built.puzzle, { answers: [...built.puzzle.answers, other.repeat(4)] })
    expect(wordWheelFaults(broken).length).toBeGreaterThan(0)
  })

  it('refuses an answer that uses a letter more often than the wheel holds it', () => {
    clearStudioRecentContent()
    const built = buildSheet({ ctx: kdpCtx(6, 9) })
    const { center } = built.puzzle
    const greedy = center.repeat(letterCounts(built.puzzle.target)[center]! + 3)
    const broken = corrupt(built.puzzle, { answers: [greedy] })
    expect(wordWheelFaults(broken)).toContain('An answer uses letters the wheel does not hold.')
  })

  it('refuses a page that asks for more words than its key lists', () => {
    clearStudioRecentContent()
    const built = buildSheet({ ctx: kdpCtx(6, 9) })
    const result = runWordWheelKdpPreflight({
      ...built,
      sheet: { ...built.sheet, goal: built.sheet.list.words.length + 1 },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('more words than')
  })

  it('refuses a page whose key lists a word the wheel never found', () => {
    clearStudioRecentContent()
    const built = buildSheet({ ctx: kdpCtx(6, 9) })
    const result = runWordWheelKdpPreflight({
      ...built,
      sheet: {
        ...built.sheet,
        list: { ...built.sheet.list, words: [...built.sheet.list.words, 'QQQQ'] },
      },
    })
    expect(result.ok).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * Registry and form
 * ------------------------------------------------------------------ */

describe('word wheel — registry and form', () => {
  it('is registered in the Studio library as a word game', () => {
    const registered = STUDIO_TEMPLATES.find((t) => t.key === wordWheelTemplate.key)
    expect(registered).toBeDefined()
    expect(registered!.category).toBe('word')
    expect(registered!.producesAnswerKey).toBe(true)
    expect(registered!.pageCount).toBe(1)
    expect(registered!.defaultPageTitle).toBe(WORD_WHEEL_DEFAULT_TITLE)
  })

  it('prints its answer key in black, not in blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(wordWheelTemplate.key)).toBe(true)
  })

  it('asks one question, and it is about the puzzle', () => {
    expect(wordWheelTemplate.configSchema.map((f) => f.key)).toEqual(['level'])
    const registered = STUDIO_TEMPLATES.find((t) => t.key === wordWheelTemplate.key)!
    expect(registered.configSchema.map((f) => f.key)).toEqual([
      'showTitle',
      'title',
      'showInstructions',
      'level',
    ])
  })

  it('names every level it offers, and defaults to the everyday one', () => {
    const field = wordWheelTemplate.configSchema[0]!
    expect(field.options?.map((o) => o.value)).toEqual(
      WORD_WHEEL_LEVELS.map((level) => level.id),
    )
    expect(field.default).toBe(DEFAULT_WORD_WHEEL_LEVEL_ID)
  })

  it('reads a sheet saved against the old difficulty field', () => {
    expect(parseWordWheelLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parseWordWheelLevel({ difficulty: 'hard' }).id).toBe('challenging')
    expect(parseWordWheelLevel({}).id).toBe(DEFAULT_WORD_WHEEL_LEVEL_ID)
  })

  it('drops the instruction strip when the page turns it off', () => {
    expect(wordWheelInstruction({ ...base, showInstructions: false })).toBe('')
    // …and the goal caption still carries the one rule that matters.
    clearStudioRecentContent()
    resetObjectCounter()
    const page = wordWheelTemplate.generate(
      { ...titled, showInstructions: false },
      kdpCtx(6, 9),
    )[0]!
    expect(textsOf(page.objects).join(' | ')).toContain('middle letter')
  })

  it('never asks for fewer words than a target is worth', () => {
    expect(wordWheelGoal(WORD_WHEEL_LEVELS[1]!, 0)).toBe(0)
    expect(wordWheelGoal(WORD_WHEEL_LEVELS[1]!, 4)).toBe(4)
    expect(wordWheelGoal(WORD_WHEEL_LEVELS[1]!, 30)).toBe(15)
  })
})

/* ------------------------------------------------------------------ *
 * Duplicate detection
 * ------------------------------------------------------------------ */

describe('word wheel — duplicate detection', () => {
  it('names a wheel by its letters, so a turned rim is not a new puzzle', () => {
    const puzzle: WordWheelPuzzle = {
      target: 'GARDENING',
      center: 'N',
      outer: [...'GARDEIG'.padEnd(8, 'N')].slice(0, 8),
      answers: [],
      minWordLength: 4,
    }
    expect(wordWheelCanonicalKey(puzzle)).toBe('word-wheel:GARDENING:N')
  })

  it('fingerprints two sheets on one wheel the same, whatever the rim order', () => {
    const { page } = renderSheet(kdpCtx(6, 9))
    const fingerprint = contentFingerprint(page.objects)
    expect(fingerprint).toContain('canon:word-wheel:')
  })
})
