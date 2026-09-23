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
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { createRng, deriveSeed } from '../studio-rng'
import { RETIREMENT_THEMES } from '../retirement-word-search/retirement-themes'
import { readEntry } from '../crossword/validate'
import { codewordTemplate } from './generate'
import { validateCodewordConfig } from './config'
import {
  buildCodewordCipher,
  buildCodewordPuzzle,
  distinctGridLetters,
  pickCodewordStarters,
  type CodewordPuzzle,
} from './build'
import {
  CODEWORD_THEMES,
  codewordWordPool,
  isExcludedCodewordWord,
  resolveCodewordTheme,
  selectCodewordWords,
} from './content'
import {
  KEY_FONT_MIN,
  KEY_MAX_ITEMS,
  NUMBER_MIN_SIZE,
  codewordCellMetrics,
  codewordKeyItems,
  planCodewordKey,
  resolveStarterCaption,
  starterCaptionHeight,
  starterPairs,
} from './draw'
import { runCodewordKdpPreflight } from './kdp-preflight'
import {
  CODEWORD_MAX_SIDE,
  CODEWORD_MIN_CELL,
  codewordBodyField,
  codewordPrintNote,
  planCodewordPage,
  pxToPt,
} from './layout'
import {
  CODEWORD_LEVELS,
  codewordInstruction,
  parseCodewordLevel,
  type CodewordLevel,
} from './levels'

/**
 * The draft a seller really has in front of them.
 *
 * `buildDefaultConfig` on the raw template only covers this game's own fields —
 * the page-header fields are merged in by the registry — so the common defaults
 * are restated here. Without them the plan would be measured against a page with
 * no heading, and every number below would be off by the height of a title.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(codewordTemplate),
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
 * Trims every level is expected to lay out on.
 *
 * 5 x 8 is deliberately absent, and so is the challenging level on 5.5 x 8.5:
 * a codeword needs a grid wide enough to interlock ten or more words *and* a
 * key strip wide enough to write in under it, and below these sizes one of the
 * two has to give. The form says so rather than printing a squint — which is
 * what `refuses the smallest trims` checks.
 */
const PRINTABLE_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [6, 9],
  [6.69, 9.61],
  [7, 10],
  [7.5, 9.25],
  [8, 10],
  [8.5, 11],
]

function configFor(level: CodewordLevel, overrides: StudioConfig = {}): StudioConfig {
  return { ...base, level: level.id, ...overrides }
}

function planFor(
  level: CodewordLevel,
  ctx: StudioGenerateContext,
  config: StudioConfig = configFor(level),
) {
  return planCodewordPage({
    page: ctx,
    config,
    instruction: codewordInstruction(config),
    level,
  })
}

function puzzleFor(
  level: CodewordLevel,
  ctx: StudioGenerateContext,
  config: StudioConfig = configFor(level),
): CodewordPuzzle | null {
  const plan = planFor(level, ctx, config)
  if (!plan) return null
  const theme = resolveCodewordTheme(config, ctx.seed)
  return buildCodewordPuzzle({
    pool: codewordWordPool(theme.id, {
      minLetters: level.minLetters,
      maxLetters: Math.min(level.maxLetters, plan.maxGridSide),
    }),
    level,
    maxGridSide: plan.maxGridSide,
    targetWords: plan.targetWords,
    rng: createRng(deriveSeed(ctx.seed, 'codeword')),
  })
}

/** Fabric joins one-line runs with NBSP; comparisons normalise it away. */
const NBSP = /\u00a0/g

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) =>
    obj.objects ? [obj, ...flatten(obj.objects)] : [obj],
  )
}

/** Every error message `generate` can print in place of a puzzle. */
const ERROR_COPY = /page size is too small|Could not interlock|not suitable|does not|too few|Too little|twice|outside the range/

function errorTextOn(objects: StudioFabricObject[]): string | null {
  const found = flatten(objects).find(
    (obj) => obj.studioRole === 'prompt' && ERROR_COPY.test(String(obj.text ?? '')),
  )
  return found ? String(found.text) : null
}

/* -------------------------------------------------------------------------- *
 * Shared studio contracts
 * -------------------------------------------------------------------------- */

runGeneratorContractTests(codewordTemplate)
assertGeneratorEntropy(codewordTemplate)

describe('codeword registry', () => {
  it('is registered as a monochrome answer-key template', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(codewordTemplate.key)).toBe(true)
  })

  it('asks only about the puzzle, never about the page', () => {
    // Its own schema is two questions; the registry merges the shared page-header
    // fields on top, which is where "Page title" and "Show instructions" come from.
    expect(codewordTemplate.configSchema.map((field) => field.key)).toEqual([
      'theme',
      'level',
    ])
  })

  it('offers no custom-theme box, because nothing would read it', () => {
    const theme = codewordTemplate.configSchema.find((field) => field.key === 'theme')!
    expect(theme.options?.some((option) => option.value === 'custom')).toBe(false)
  })
})

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

describe('codeword vocabulary', () => {
  const bounds = { minLetters: 4, maxLetters: 9 }

  it('prints single plain words only — never a phrase or a hyphenate', () => {
    for (const theme of CODEWORD_THEMES.slice(0, 8)) {
      for (const word of codewordWordPool(theme.id, bounds)) {
        expect(word.token).toMatch(/^[A-Z]{4,9}$/)
        expect(word.display).toBe(word.token)
      }
    }
  })

  it('never offers a brand name from the bundled wordlists', () => {
    const branded = [
      'BETAMAX',
      'WALKMAN',
      'DISCMAN',
      'POLAROID',
      'TELEX',
      'SLINKY',
      'FRISBEE',
      'THERMOS',
      'PILATES',
      'PULLMAN',
    ]
    for (const token of branded) expect(isExcludedCodewordWord(token)).toBe(true)

    const everything = new Set(
      codewordWordPool(CODEWORD_THEMES[0]!.id, bounds).map((word) => word.token),
    )
    for (const token of branded) expect(everything.has(token)).toBe(false)
  })

  it('never offers a place name — a codeword answer has to be deducible', () => {
    const places = ['PARIS', 'TOKYO', 'SANTORINI', 'BUDAPEST', 'HAWAII', 'ICELAND']
    const everything = new Set(
      codewordWordPool(CODEWORD_THEMES[0]!.id, bounds).map((word) => word.token),
    )
    for (const token of places) expect(everything.has(token)).toBe(false)
    // The picker must not offer the theme those names come from either.
    expect(CODEWORD_THEMES.some((theme) => theme.id === 'dream-destinations')).toBe(false)
    expect(RETIREMENT_THEMES.length).toBeGreaterThan(CODEWORD_THEMES.length)
  })

  it('leads with the chosen theme and only borrows to fill', () => {
    const themeId = 'gardening'
    const pool = codewordWordPool(themeId, bounds)
    const own = new Set(
      pool.filter((word) => word.tier === 0).map((word) => word.token),
    )
    expect(own.size).toBeGreaterThan(10)

    const picked = selectCodewordWords({
      pool,
      count: 12,
      rng: createRng(99),
    })
    const onTheme = picked.filter((word) => own.has(word.token)).length
    expect(onTheme).toBeGreaterThanOrEqual(Math.ceil(picked.length * 0.6))
  })

  it('still fills a grid from the thinnest wordlist in the corpus', () => {
    // Retro Technology yields about fifteen usable words on its own — fewer than
    // any level needs — so the tiers below it have to carry the difference.
    const pool = codewordWordPool('retro-technology', bounds)
    expect(pool.length).toBeGreaterThan(60)
    expect(pool.filter((word) => word.tier === 0).length).toBeLessThan(25)
  })

  it('covers letters rather than simply taking the first words offered', () => {
    const pool = codewordWordPool('gardening', bounds)
    const picked = selectCodewordWords({ pool, count: 14, rng: createRng(7) })
    const letters = new Set(picked.flatMap((word) => [...word.token]))
    expect(letters.size).toBeGreaterThanOrEqual(16)
  })
})

/* -------------------------------------------------------------------------- *
 * The code
 * -------------------------------------------------------------------------- */

describe('codeword cipher', () => {
  it('is a bijection onto 1..N for any set of letters', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const letters = [...'ABCDEFGHIJKLMNOPQRST'].slice(0, 12 + (seed % 9))
      const { letterToNumber, numberToLetter } = buildCodewordCipher(
        letters,
        createRng(seed),
      )
      expect(letterToNumber.size).toBe(letters.length)
      expect(new Set(letterToNumber.values()).size).toBe(letters.length)
      expect([...letterToNumber.values()].sort((a, b) => a - b)).toEqual(
        letters.map((_, i) => i + 1),
      )
      for (const [letter, number] of letterToNumber) {
        expect(numberToLetter.get(number)).toBe(letter)
      }
    }
  })

  it('never prints the alphabet in order', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const letters = [...'ABCDEFGHIJKLMNOPQR']
      const { letterToNumber } = buildCodewordCipher(letters, createRng(seed))
      const identity = letters.every(
        (letter, index) => letterToNumber.get(letter) === index + 1,
      )
      expect(identity).toBe(false)
    }
  })
})

/* -------------------------------------------------------------------------- *
 * The starters
 * -------------------------------------------------------------------------- */

describe('codeword starters', () => {
  const ctx = kdpCtx(8.5, 11)

  it('gives two or three letters, never more', () => {
    for (const level of CODEWORD_LEVELS) {
      expect([2, 3]).toContain(level.starterLetters)
      const puzzle = puzzleFor(level, ctx)!
      expect(puzzle).not.toBeNull()
      expect(puzzle.starters.size).toBe(level.starterLetters)
    }
  })

  it('gives letters that are really in the grid, with the numbers the page prints', () => {
    for (let i = 0; i < 12; i++) {
      const level = parseCodewordLevel(base)
      const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 700 + i * 4093))!
      const letters = new Set(distinctGridLetters(puzzle.grid))
      for (const starter of puzzle.starters) expect(letters.has(starter)).toBe(true)

      for (const pair of starterPairs(puzzle)) {
        const [number, letter] = pair.split(' = ')
        expect(puzzle.numberToLetter.get(Number(number))).toBe(letter)
        expect(puzzle.letterToNumber.get(letter!)).toBe(Number(number))
      }
    }
  })

  it('reads "3 = A", number first — the number is what the cells print', () => {
    const puzzle = puzzleFor(parseCodewordLevel(base), ctx)!
    for (const pair of starterPairs(puzzle)) {
      expect(pair).toMatch(/^\d+ = [A-Z]$/)
    }
    const numbers = starterPairs(puzzle).map((pair) => Number(pair.split(' = ')[0]))
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  it('opens the puzzle without solving it', () => {
    for (let i = 0; i < 12; i++) {
      const level = parseCodewordLevel(base)
      const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 300 + i * 2707))!
      const filled = puzzle.grid.flat().filter((cell) => cell !== null).length
      let revealed = 0
      for (const cell of puzzle.grid.flat()) {
        if (cell !== null && puzzle.starters.has(cell)) revealed += 1
      }
      // Enough to be worth having, nowhere near enough to read the page off.
      expect(revealed).toBeGreaterThanOrEqual(3)
      expect(revealed / filled).toBeLessThanOrEqual(0.3)
      // And far more of the code is left to deduce than is handed over.
      expect(puzzle.letters.length - puzzle.starters.size).toBeGreaterThan(
        puzzle.starters.size,
      )
    }
  })

  it('hands over a vowel, and only one', () => {
    let withVowel = 0
    for (let i = 0; i < 12; i++) {
      const level = parseCodewordLevel(base)
      const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 1500 + i * 3517))!
      const vowels = [...puzzle.starters].filter((letter) =>
        'AEIOU'.includes(letter),
      )
      expect(vowels.length).toBeLessThanOrEqual(1)
      if (vowels.length === 1) withVowel += 1
    }
    expect(withVowel).toBeGreaterThanOrEqual(10)
  })

  it('does not hand over the same letters on every page of a book', () => {
    const level = parseCodewordLevel(base)
    const sets = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 4000 + i * 8171))!
      sets.add([...puzzle.starters].sort().join(''))
    }
    expect(sets.size).toBeGreaterThanOrEqual(6)
  })

  it('refuses rather than give away a grid it cannot open safely', () => {
    // One word, one heading, four letters: there is nothing here to give away
    // that does not hand over the whole line.
    const grid: (string | null)[][] = [[...'MOON'].map((letter) => letter)]
    const entries = [
      { word: 'MOON', clue: '', r: 0, c: 0, dir: 'across' as const, number: 0 },
    ]
    expect(
      pickCodewordStarters({ grid, entries, want: 3, rng: createRng(5) }),
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- *
 * The grid
 * -------------------------------------------------------------------------- */

describe('codeword grid', () => {
  it('spells the words it claims, decoded through its own numbers', () => {
    for (const level of CODEWORD_LEVELS) {
      for (let i = 0; i < 6; i++) {
        const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 200 + i * 5209), configFor(level))!
        expect(puzzle).not.toBeNull()

        const decoded = puzzle.grid.map((row) =>
          row.map((cell) => {
            if (cell === null) return null
            const number = puzzle.letterToNumber.get(cell)!
            return puzzle.numberToLetter.get(number)!
          }),
        )
        for (const entry of puzzle.entries) {
          expect(readEntry(puzzle.grid, entry)).toBe(entry.word)
          expect(readEntry(decoded, entry)).toBe(entry.word)
        }
      }
    }
  })

  it('numbers every letter it uses, and nothing it does not', () => {
    const puzzle = puzzleFor(parseCodewordLevel(base), kdpCtx(8.5, 11))!
    const letters = distinctGridLetters(puzzle.grid)
    expect([...puzzle.letterToNumber.keys()].sort()).toEqual(letters)
    expect(letters.length).toBeLessThanOrEqual(KEY_MAX_ITEMS)
  })

  it('carries enough distinct letters to be a codeword at all', () => {
    for (const level of CODEWORD_LEVELS) {
      for (let i = 0; i < 6; i++) {
        const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 90 + i * 3323), configFor(level))!
        expect(puzzle.letters.length).toBeGreaterThanOrEqual(level.minDistinctLetters)
      }
    }
  })

  it('interlocks in both headings, with no word placed twice', () => {
    for (let i = 0; i < 8; i++) {
      const puzzle = puzzleFor(parseCodewordLevel(base), kdpCtx(8.5, 11, 60 + i * 1531))!
      expect(new Set(puzzle.entries.map((entry) => entry.dir)).size).toBe(2)
      const words = puzzle.entries.map((entry) => entry.word)
      expect(new Set(words).size).toBe(words.length)
      expect(puzzle.entries.length).toBeGreaterThanOrEqual(
        parseCodewordLevel(base).minWords,
      )
    }
  })

  it('never prints a word this game excludes', () => {
    for (let i = 0; i < 10; i++) {
      const puzzle = puzzleFor(parseCodewordLevel(base), kdpCtx(8.5, 11, 11 + i * 9007))!
      for (const entry of puzzle.entries) {
        expect(isExcludedCodewordWord(entry.word)).toBe(false)
      }
    }
  })
})

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

describe('codeword layout', () => {
  it('lays out every level on every printable trim', () => {
    for (const [w, h] of PRINTABLE_TRIMS) {
      for (const level of CODEWORD_LEVELS) {
        const plan = planFor(level, kdpCtx(w, h))
        expect(plan, `${w}x${h} ${level.id}`).not.toBeNull()
        expect(plan!.gridCell).toBeGreaterThanOrEqual(CODEWORD_MIN_CELL)
        expect(plan!.maxGridSide).toBeLessThanOrEqual(CODEWORD_MAX_SIDE)
        expect(codewordCellMetrics(plan!.gridCell).numberSize).toBeGreaterThanOrEqual(
          NUMBER_MIN_SIZE,
        )
      }
    }
  })

  it('measures the heading a blank title will really print', () => {
    // "Page title" on with no text is not an untitled page: generate falls back
    // to the theme and a book run stamps "Game N", so the plan must reserve it.
    const ctx = kdpCtx(6, 9)
    const level = parseCodewordLevel(base)
    const blank = codewordBodyField(ctx, configFor(level), codewordInstruction(base))
    const stamped = codewordBodyField(
      ctx,
      configFor(level, { title: 'Game 1' }),
      codewordInstruction(base),
    )
    expect(blank.height).toBe(stamped.height)
  })

  it('refuses the smallest trims instead of printing a squint', () => {
    const ctx = kdpCtx(5, 8)
    for (const level of CODEWORD_LEVELS) {
      expect(planFor(level, ctx)).toBeNull()
      expect(codewordPrintNote(level, ctx, configFor(level), codewordInstruction(base)))
        .toMatch(/too small/)
    }
  })

  it('points at the lever that actually works on a tight trim', () => {
    const ctx = kdpCtx(5.5, 8.5)
    const hardest = CODEWORD_LEVELS[CODEWORD_LEVELS.length - 1]!
    const gentlest = CODEWORD_LEVELS[0]!
    expect(planFor(gentlest, ctx)).not.toBeNull()
    expect(planFor(hardest, ctx)).toBeNull()
    expect(
      codewordPrintNote(hardest, ctx, configFor(hardest), codewordInstruction(base)),
    ).toMatch(/gentler level/)
  })

  it('reports the numbers the page will really print', () => {
    const ctx = kdpCtx(8.5, 11)
    const level = parseCodewordLevel(base)
    const config = configFor(level)
    const plan = planFor(level, ctx, config)!
    const note = codewordPrintNote(level, ctx, config, codewordInstruction(config))
    expect(note).toContain(`${plan.maxGridSide} × ${plan.maxGridSide}`)
    expect(note).toContain(`${pxToPt(codewordCellMetrics(plan.gridCell).numberSize)} pt`)
    expect(note).toContain(`${level.starterLetters} letters given`)
  })

  it('measures the heading the page will really carry', () => {
    const ctx = kdpCtx(6, 9)
    const level = parseCodewordLevel(base)
    const titled = codewordBodyField(ctx, configFor(level), codewordInstruction(base))
    const bare = codewordBodyField(
      ctx,
      configFor(level, { showTitle: false, title: '', showInstructions: false }),
      '',
    )
    expect(bare.height).toBeGreaterThan(titled.height)
  })

  it('keeps the key strip writable, however tight the column', () => {
    for (const [w, h] of PRINTABLE_TRIMS) {
      const level = parseCodewordLevel(base)
      const ctx = kdpCtx(w, h)
      const plan = planFor(level, ctx)!
      const items = Array.from({ length: KEY_MAX_ITEMS }, (_, i) => ({
        number: i + 1,
        letter: 'A',
        given: false,
      }))
      const key = planCodewordKey({
        items,
        bandWidth: plan.field.width,
        maxHeight: plan.field.height,
      })
      expect(key, `${w}x${h}`).not.toBeNull()
      expect(key!.fontSize).toBeGreaterThanOrEqual(KEY_FONT_MIN)
      expect(key!.blockWidth).toBeLessThanOrEqual(plan.field.width)
    }
  })
})

/* -------------------------------------------------------------------------- *
 * The printed page
 * -------------------------------------------------------------------------- */

describe('codeword page', () => {
  it('prints a puzzle, not an apology, on every printable trim', () => {
    for (const [w, h] of PRINTABLE_TRIMS) {
      for (const level of CODEWORD_LEVELS) {
        for (const seed of [42, 9001, 123_457]) {
          resetObjectCounter()
          const ctx = kdpCtx(w, h, seed)
          const pages = codewordTemplate.generate(configFor(level, { seed }), ctx)
          expect(errorTextOn(pages[0]!.objects), `${w}x${h} ${level.id} ${seed}`).toBeNull()
        }
      }
    }
  })

  it('keeps both pages inside the safe margin', () => {
    for (const [w, h] of PRINTABLE_TRIMS) {
      for (const level of CODEWORD_LEVELS) {
        resetObjectCounter()
        const ctx = kdpCtx(w, h)
        const pages = codewordTemplate.generate(configFor(level), ctx)
        for (const page of pages) {
          assertObjectsInSafeMargin(page.objects, ctx)
          assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects, ctx)
        }
      }
    }
  })

  it('prints the starter pairs where a solver will see them', () => {
    resetObjectCounter()
    const ctx = kdpCtx(8.5, 11)
    const config = configFor(parseCodewordLevel(base))
    const pages = codewordTemplate.generate(config, ctx)
    const puzzle = puzzleFor(parseCodewordLevel(base), ctx, config)!

    const printed = flatten(pages[0]!.objects)
      .map((obj) => String(obj.text ?? '').replace(NBSP, ' ').replace(/\s+/g, ' '))
      .find((text) => text.includes(' = '))
    expect(printed).toBeDefined()
    for (const pair of starterPairs(puzzle)) {
      expect(printed).toContain(pair)
    }
  })

  it('keeps the starter line on one line at every printable width', () => {
    for (const [w, h] of PRINTABLE_TRIMS) {
      for (const level of CODEWORD_LEVELS) {
        const ctx = kdpCtx(w, h)
        const plan = planFor(level, ctx)!
        const puzzle = puzzleFor(level, ctx)!
        const caption = resolveStarterCaption(puzzle, plan.field.width, 'PT Serif')
        // A wrapped second line would print into the number key below it, because
        // the page reserves exactly one line of height for these pairs.
        expect(caption.fitsOneLine, `${w}x${h} ${level.id}`).toBe(true)
        expect(starterCaptionHeight(caption.fontSize)).toBeLessThan(plan.field.height)
        for (const pair of starterPairs(puzzle)) {
          expect(caption.text).toContain(pair)
        }
      }
    }
  })

  it('prints one numbered box for every number in the code', () => {
    resetObjectCounter()
    const ctx = kdpCtx(8.5, 11)
    const config = configFor(parseCodewordLevel(base))
    const pages = codewordTemplate.generate(config, ctx)
    const puzzle = puzzleFor(parseCodewordLevel(base), ctx, config)!

    const labels = flatten(pages[0]!.objects)
      .filter((obj) => obj.studioRole === 'prompt' && /^\d+$/.test(String(obj.text ?? '')))
      .map((obj) => Number(obj.text))
    // Every number appears once under the key strip, plus once per grid cell.
    for (const item of codewordKeyItems(puzzle)) {
      expect(labels).toContain(item.number)
    }
  })

  it('shows a starter letter on the puzzle page and hides the rest', () => {
    resetObjectCounter()
    const ctx = kdpCtx(8.5, 11)
    const config = configFor(parseCodewordLevel(base))
    const pages = codewordTemplate.generate(config, ctx)
    const puzzle = puzzleFor(parseCodewordLevel(base), ctx, config)!

    const letterCells = flatten(pages[0]!.objects).filter(
      (obj) => /^[A-Z]$/.test(String(obj.text ?? '')) && obj.studioRole !== 'decoration',
    )
    for (const cell of letterCells) {
      const isStarter = puzzle.starters.has(String(cell.text))
      expect(cell.studioRole).toBe(isStarter ? 'prompt' : 'answer')
      if (!isStarter) expect(cell.visible).toBe(false)
    }
    expect(harvestAnswers(pages[0]!.objects).length).toBeGreaterThan(0)
  })

  it('does not repeat the starter line on the solution page', () => {
    resetObjectCounter()
    const ctx = kdpCtx(8.5, 11)
    const pages = codewordTemplate.generate(configFor(parseCodewordLevel(base)), ctx)
    const key = buildAnswerPage(
      pages[0]!.answerSourceObjects ?? pages[0]!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const captions = flatten(key).filter((obj) =>
      String(obj.text ?? '')
        .replace(/\u00a0/g, ' ')
        .startsWith('Starter letters:'),
    )
    expect(captions).toHaveLength(0)
  })

  it('reveals the finished grid and the whole code on the solution page', () => {
    resetObjectCounter()
    const ctx = kdpCtx(8.5, 11)
    const config = configFor(parseCodewordLevel(base))
    const pages = codewordTemplate.generate(config, ctx)
    const puzzle = puzzleFor(parseCodewordLevel(base), ctx, config)!
    const key = buildAnswerPage(
      pages[0]!.answerSourceObjects ?? pages[0]!.objects,
      STUDIO_ANSWER_INK_MONO,
    )

    const letters = flatten(key).filter((obj) =>
      /^[A-Z]$/.test(String(obj.text ?? '')),
    )
    expect(letters.length).toBeGreaterThan(0)
    for (const obj of letters) expect(obj.visible).not.toBe(false)

    // Every letter of the grid, and every letter of the code, is now printed.
    const printed = new Set(letters.map((obj) => String(obj.text)))
    for (const letter of puzzle.letters) expect(printed.has(letter)).toBe(true)

    // The key strip on the solution reads back as the puzzle's own mapping.
    const filled = flatten(key).filter(
      (obj) => /^[A-Z]$/.test(String(obj.text ?? '')) && obj.studioPageRole === 'answers',
    )
    expect(filled.length).toBeGreaterThanOrEqual(
      puzzle.letters.length - puzzle.starters.size,
    )
  })

  it('titles the page with its theme when the seller leaves it blank', () => {
    resetObjectCounter()
    const ctx = kdpCtx(8.5, 11)
    const config = configFor(parseCodewordLevel(base), { title: '' })
    const theme = resolveCodewordTheme(config, ctx.seed)
    const pages = codewordTemplate.generate(config, ctx)
    const heading = flatten(pages[0]!.objects).find((obj) => obj.fontWeight === 700)
    expect(String(heading?.text ?? '').replace(/\u00a0/g, ' ')).toBe(theme.label)
  })

  it('keeps the grid legible when the heading strip is switched off', () => {
    const ctx = kdpCtx(6, 9)
    const level = parseCodewordLevel(base)
    const bare = configFor(level, { showTitle: false, title: '', showInstructions: false })
    resetObjectCounter()
    const pages = codewordTemplate.generate(bare, ctx)
    expect(errorTextOn(pages[0]!.objects)).toBeNull()
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })

  it('survives the book builder stamping "Game N" onto the draft', () => {
    const ctx = kdpCtx(6, 9)
    const level = parseCodewordLevel(base)
    const config = withStudioPageHeader(configFor(level), {
      showTitle: true,
      title: '',
      showInstructions: true,
    })
    resetObjectCounter()
    const pages = codewordTemplate.generate(config, ctx)
    expect(errorTextOn(pages[0]!.objects)).toBeNull()
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })
})

/* -------------------------------------------------------------------------- *
 * Preflight
 * -------------------------------------------------------------------------- */

describe('codeword preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const level = parseCodewordLevel(base)

  function preflightFor(puzzle: CodewordPuzzle) {
    const plan = planFor(level, ctx)!
    const key = planCodewordKey({
      items: codewordKeyItems(puzzle),
      bandWidth: plan.field.width,
      maxHeight: plan.field.height,
    })!
    return runCodewordKdpPreflight({ puzzle, level, key, gridCell: plan.gridCell })
  }

  it('passes a puzzle the builder produced', () => {
    for (let i = 0; i < 8; i++) {
      const puzzle = puzzleFor(level, kdpCtx(8.5, 11, 31 + i * 6733))!
      expect(preflightFor(puzzle).errors).toEqual([])
    }
  })

  it('catches two letters sharing a number', () => {
    const puzzle = puzzleFor(level, ctx)!
    const letterToNumber = new Map(puzzle.letterToNumber)
    const [first, second] = [...letterToNumber.keys()]
    letterToNumber.set(second!, letterToNumber.get(first!)!)
    const result = preflightFor({ ...puzzle, letterToNumber })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/share a number|does not read the same/)
  })

  it('catches a code that does not read back to the intended words', () => {
    const puzzle = puzzleFor(level, ctx)!
    const grid = puzzle.grid.map((row) => [...row])
    const target = puzzle.entries[0]!
    grid[target.r]![target.c] = grid[target.r]![target.c] === 'A' ? 'B' : 'A'
    const result = preflightFor({ ...puzzle, grid })
    expect(result.ok).toBe(false)
  })

  it('catches a starter that is not in the grid', () => {
    const puzzle = puzzleFor(level, ctx)!
    const missing = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(
      (letter) => !puzzle.letters.includes(letter),
    )!
    const starters = new Set([...puzzle.starters].slice(1))
    starters.add(missing)
    const result = preflightFor({ ...puzzle, starters })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/starter letter does not appear/)
  })

  it('catches a grid cell whose number is too small to read', () => {
    const puzzle = puzzleFor(level, ctx)!
    const plan = planFor(level, ctx)!
    const key = planCodewordKey({
      items: codewordKeyItems(puzzle),
      bandWidth: plan.field.width,
      maxHeight: plan.field.height,
    })!
    const result = runCodewordKdpPreflight({
      puzzle,
      level,
      key,
      gridCell: CODEWORD_MIN_CELL - 4,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/too small to write/)
  })

  it('catches a starter line that will not fit on one line', () => {
    const puzzle = puzzleFor(level, ctx)!
    const plan = planFor(level, ctx)!
    const key = planCodewordKey({
      items: codewordKeyItems(puzzle),
      bandWidth: plan.field.width,
      maxHeight: plan.field.height,
    })!
    const result = runCodewordKdpPreflight({
      puzzle,
      level,
      key,
      gridCell: plan.gridCell,
      // A column no starter line could ever fit on.
      starterCaption: resolveStarterCaption(puzzle, 40, 'PT Serif'),
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/one line/)
  })

  it('catches a key strip that does not print the whole code', () => {
    const puzzle = puzzleFor(level, ctx)!
    const plan = planFor(level, ctx)!
    const key = planCodewordKey({
      items: codewordKeyItems(puzzle).slice(0, -1),
      bandWidth: plan.field.width,
      maxHeight: plan.field.height,
    })!
    const result = runCodewordKdpPreflight({ puzzle, level, key, gridCell: plan.gridCell })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/one box for every number/)
  })
})

/* -------------------------------------------------------------------------- *
 * Config
 * -------------------------------------------------------------------------- */

describe('codeword config', () => {
  it('accepts every level the form offers', () => {
    for (const level of CODEWORD_LEVELS) {
      expect(validateCodewordConfig(configFor(level))).toBeNull()
    }
  })

  it('falls back to the mix for a theme this game does not offer', () => {
    for (const theme of ['custom', 'dream-destinations', 'not-a-theme']) {
      const resolved = resolveCodewordTheme({ ...base, theme }, 42)
      expect(CODEWORD_THEMES.some((option) => option.id === resolved.id)).toBe(true)
    }
  })

  it('rotates the theme across a book, and pins it for one sheet', () => {
    const labels = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const seed = 5_000 + i * 4099
      labels.add(resolveCodewordTheme(base, seed).label)
      expect(resolveCodewordTheme(base, seed).id).toBe(
        resolveCodewordTheme(base, seed).id,
      )
    }
    expect(labels.size).toBeGreaterThan(5)
  })

  it('keeps a chosen theme fixed whatever the seed', () => {
    const config = { ...base, theme: 'gardening' }
    for (const seed of [1, 2, 3, 99_991]) {
      expect(resolveCodewordTheme(config, seed).id).toBe('gardening')
    }
  })

  it('names the count of starters in the instruction, never the pairs', () => {
    expect(codewordInstruction(configFor(CODEWORD_LEVELS[0]!))).toContain('Three letters')
    expect(
      codewordInstruction(configFor(CODEWORD_LEVELS[CODEWORD_LEVELS.length - 1]!)),
    ).toContain('Two letters')
    expect(codewordInstruction({ ...base, showInstructions: false })).toBe('')
  })

  it('still reads a sheet saved against an older difficulty field', () => {
    expect(parseCodewordLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parseCodewordLevel({ difficulty: 'challenge' }).id).toBe('challenging')
    expect(parseCodewordLevel({}).id).toBe('classic')
  })
})
