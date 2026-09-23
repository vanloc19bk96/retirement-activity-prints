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
import { withStudioPageHeader } from '../studio-page-header'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { atoZWordSearchTemplate } from './generate'
import { validateAtoZConfig } from './config'
import {
  ALPHABET,
  ATOZ_DEFAULT_TITLE,
  ATOZ_WORD_COUNT,
  candidatesForLetter,
  selectAlphabetSet,
} from './content'
import { ATOZ_LETTERS_CAPTION, ATOZ_LIST_MIN_SIZE, planAtoZList } from './draw'
import { runAtoZKdpPreflight } from './kdp-preflight'
import {
  ATOZ_CELL_MIN,
  ATOZ_MAX_SIDE,
  ATOZ_MIN_SIDE,
  LETTER_MIN,
  atoZBandBudget,
  atoZBodyField,
  atoZPrintNote,
  planAtoZPage,
  pxToPt,
} from './layout'
import { ATOZ_LEVELS, atoZInstruction, parseAtoZLevel } from './levels'
import { planAnswersBand, planLettersBand } from './page'
import { tryBuildAtoZPuzzle } from './place'

/**
 * The draft a seller really has in front of them.
 *
 * `buildDefaultConfig` on the raw template only covers this game's own field —
 * the page-header fields are merged in by the registry — so the common defaults
 * are restated here. Without them the plan would be measured against a page with
 * no heading, and every number below would be off by the height of a title.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(atoZWordSearchTemplate),
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
 * Twenty-six words is the most any page in this library hides, and the grid that
 * holds them has a floor of sixteen cells at the large-print pitch — about six
 * inches of column before the margins. So the smaller trims are deliberately
 * absent: on a 5.5 x 8.5 interior this puzzle genuinely does not fit, and the form
 * says so rather than printing a squint.
 */
const PRINTABLE_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [6, 9],
  [6.69, 9.61],
  [7, 10],
  [7.5, 9.25],
  [8.5, 11],
]

/** Trims this page refuses outright, at every level. */
const TOO_SMALL_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.25, 8],
  [5.5, 8.5],
]

/**
 * The context the shared contract tests run in.
 *
 * `STUDIO_TEST_CTX` is a 6 x 9 page with half-inch margins, which leaves a column
 * this puzzle cannot fill — twenty-six words need about six inches of *usable*
 * width. So the contract suite is pointed at the app's own default trim instead,
 * which is the page most of these books are built on.
 */
const CONTRACT_CTX = kdpCtx(7.5, 9.25)

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

function promptTexts(objects: StudioFabricObject[]): string[] {
  return flatten(objects)
    .filter((obj) => obj.studioRole === 'prompt')
    .map((obj) => String(obj.text ?? ''))
}

function generateAt(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return atoZWordSearchTemplate.generate(config, ctx)
}

function planFor(config: StudioConfig, ctx: StudioGenerateContext) {
  return planAtoZPage({
    page: ctx,
    config,
    instruction: atoZInstruction(config),
    level: parseAtoZLevel(config),
  })
}

/**
 * The puzzle the page builds, without going through Fabric objects.
 *
 * Mirrors generate's own steps exactly — same plan, same seed, same word ceiling
 * — so a test comparing this against the drawn page is comparing the same puzzle
 * rather than a lookalike.
 */
function buildPuzzle(config: StudioConfig, ctx: StudioGenerateContext) {
  const level = parseAtoZLevel(config)
  const plan = planFor(config, ctx)!
  const puzzle = tryBuildAtoZPuzzle({
    level,
    gridSide: plan.gridSide,
    maxWordLetters: plan.maxWordLetters,
    seed: ctx.seed,
  })
  return { level, plan, puzzle }
}

function bands(config: StudioConfig, ctx: StudioGenerateContext) {
  const { level, plan, puzzle } = buildPuzzle(config, ctx)
  const field = atoZBodyField(ctx, config, atoZInstruction(config))
  const font = String(config.fontFamily)
  const lettersBand = planLettersBand({ plan, font, bandWidth: field.width })
  const answersBand = puzzle
    ? planAnswersBand({ plan, puzzle, font, bandWidth: field.width })
    : null
  return { level, plan, puzzle, field, lettersBand, answersBand }
}

runGeneratorContractTests(atoZWordSearchTemplate, {
  contextOverrides: CONTRACT_CTX,
})

assertGeneratorEntropy(atoZWordSearchTemplate, {
  seeds: 40,
  contextOverrides: CONTRACT_CTX,
})

describe('a to z word search — form', () => {
  it('asks one question, and no technical ones', () => {
    const keys = atoZWordSearchTemplate.configSchema.map((f) => f.key)
    expect(keys).toContain('level')
    // Word count cannot be a setting — the puzzle is the alphabet. Everything
    // else comes from the page, not from a seller who cannot see the trim while
    // answering.
    for (const derived of [
      'gridSize',
      'wordCount',
      'itemCount',
      'words',
      'theme',
      'customTheme',
      'difficulty',
      'printStyle',
      'minLetters',
      'maxLetters',
      'columns',
    ]) {
      expect(keys).not.toContain(derived)
    }
  })

  it('names itself when the heading is left blank', () => {
    expect(atoZWordSearchTemplate.defaultPageTitle).toBe(ATOZ_DEFAULT_TITLE)
  })

  it('needs no content of its own to validate', () => {
    for (const level of ATOZ_LEVELS) {
      expect(validateAtoZConfig({ ...base, level: level.id })).toBeNull()
    }
  })

  it('reports the page it will really print, on the page size in Settings', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of ATOZ_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const config = headed({ ...base, level: level.id })
        const note = atoZPrintNote(
          parseAtoZLevel(config),
          ctx,
          config,
          atoZInstruction(config),
        )
        const plan = planFor(config, ctx)!
        expect(note, `${wIn}x${hIn} ${level.id}`).toContain(`${ATOZ_WORD_COUNT} hidden words`)
        expect(note).toContain(`${plan.gridSide} × ${plan.gridSide}`)
        expect(note).toContain(`${pxToPt(plan.letterFont)} pt`)
        expect(note).toContain('answer page')
      }
    }
  })

  it('offers only a lever that works when the trim is too small', () => {
    for (const [wIn, hIn] of TOO_SMALL_TRIMS) {
      const ctx = kdpCtx(wIn, hIn)
      const config = headed(base)
      expect(planFor(config, ctx), `${wIn}x${hIn}`).toBeNull()
      const note = atoZPrintNote(
        parseAtoZLevel(config),
        ctx,
        config,
        atoZInstruction(config),
      )
      expect(note).toContain('larger page')
      expect(note).not.toContain('gentler level')
    }
  })

  it('reads a sheet saved against the older difficulty field', () => {
    expect(parseAtoZLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parseAtoZLevel({ difficulty: 'hard' }).id).toBe('challenging')
    expect(parseAtoZLevel({}).id).toBe('classic')
  })
})

describe('a to z word search — the alphabet is complete', () => {
  it('hides one word for every letter, A to Z, in order', () => {
    for (const level of ATOZ_LEVELS) {
      const { puzzle } = buildPuzzle(headed({ ...base, level: level.id }), CONTRACT_CTX)
      expect(puzzle, level.id).not.toBeNull()
      expect(puzzle!.entries).toHaveLength(ATOZ_WORD_COUNT)
      expect(puzzle!.entries.map((entry) => entry.letter)).toEqual([...ALPHABET])
    }
  })

  it('starts every hidden word with the letter it answers for', () => {
    for (let seed = 0; seed < 12; seed++) {
      const ctx = { ...CONTRACT_CTX, seed: 1_000 + seed * 7_919 }
      const { puzzle } = buildPuzzle(headed(base), ctx)
      expect(puzzle, `seed ${ctx.seed}`).not.toBeNull()
      for (const entry of puzzle!.entries) {
        expect(entry.token.startsWith(entry.letter), entry.token).toBe(true)
        expect(entry.display.toUpperCase().startsWith(entry.letter)).toBe(true)
      }
    }
  })

  it('never repeats a word, and never hides one inside another', () => {
    for (let seed = 0; seed < 12; seed++) {
      const ctx = { ...CONTRACT_CTX, seed: 500 + seed * 3_571 }
      const { puzzle } = buildPuzzle(headed(base), ctx)
      const tokens = puzzle!.entries.map((entry) => entry.token)
      expect(new Set(tokens).size).toBe(ATOZ_WORD_COUNT)
      for (const token of tokens) {
        const reversed = [...token].reverse().join('')
        for (const other of tokens) {
          if (other === token) continue
          expect(other.includes(token), `${other} contains ${token}`).toBe(false)
          expect(other, `${other} is ${token} backwards`).not.toBe(reversed)
        }
      }
    }
  })

  it('places every word in the grid, and each one reads exactly once', () => {
    for (const level of ATOZ_LEVELS) {
      const { puzzle } = buildPuzzle(headed({ ...base, level: level.id }), CONTRACT_CTX)
      const placed = new Set(puzzle!.placements.map((p) => p.word))
      for (const entry of puzzle!.entries) {
        expect(placed.has(entry.token), `${level.id} ${entry.token}`).toBe(true)
        expect(
          countTokenReadings(puzzle!.grid, entry.token),
          `${level.id} ${entry.token}`,
        ).toBe(1)
      }
      expect(puzzle!.placements.length).toBe(ATOZ_WORD_COUNT)
    }
  })

  it('keeps every word inside the grid and inside the level', () => {
    for (const level of ATOZ_LEVELS) {
      const config = headed({ ...base, level: level.id })
      const { plan, puzzle } = buildPuzzle(config, CONTRACT_CTX)
      for (const entry of puzzle!.entries) {
        expect(entry.token.length).toBeGreaterThanOrEqual(level.minLetters)
        expect(entry.token.length).toBeLessThanOrEqual(plan.maxWordLetters)
        expect(entry.token.length).toBeLessThanOrEqual(plan.gridSide)
      }
    }
  })

  it('draws a different alphabet for a different seed', () => {
    const a = buildPuzzle(headed(base), { ...CONTRACT_CTX, seed: 11 }).puzzle!
    const b = buildPuzzle(headed(base), { ...CONTRACT_CTX, seed: 12 }).puzzle!
    expect(a.words.join()).not.toBe(b.words.join())
  })
})

describe('a to z word search — the words stay hidden', () => {
  it('prints only letters on the puzzle page, never the words', () => {
    const config = headed(base)
    const { puzzle } = buildPuzzle(config, CONTRACT_CTX)
    const pages = generateAt(config, CONTRACT_CTX)
    const texts = promptTexts(pages[0]!.objects)

    // Every prompt glyph on this page is a single character: a grid cell, or one
    // letter of the alphabet band. A word anywhere on it would give the puzzle
    // away, and this page is the whole puzzle.
    for (const text of texts) {
      expect(text.replace(/ /g, ' ').trim().length, text).toBe(1)
    }
    const joined = texts.join('|')
    for (const entry of puzzle!.entries) {
      expect(joined).not.toContain(entry.display.toUpperCase())
    }
  })

  it('prints all twenty-six letters under the grid', () => {
    const pages = generateAt(headed(base), CONTRACT_CTX)
    const letters = promptTexts(pages[0]!.objects).filter((text) => /^[A-Z]$/.test(text))
    for (const letter of ALPHABET) {
      // Once for the alphabet band, plus however many times the grid happens to
      // use it as a cell — so the band's own letter is what is being checked.
      expect(letters.filter((text) => text === letter).length, letter).toBeGreaterThan(0)
    }
    expect(
      flatten(pages[0]!.objects).some(
        (obj) => String(obj.text ?? '').replace(/ /g, ' ') === ATOZ_LETTERS_CAPTION,
      ),
    ).toBe(true)
  })

  it('reveals every letter’s word on the solution page', () => {
    const config = headed(base)
    const { puzzle } = buildPuzzle(config, CONTRACT_CTX)
    const pages = generateAt(config, CONTRACT_CTX)
    const key = buildAnswerPage(
      pages[0]!.answerSourceObjects!,
      STUDIO_ANSWER_INK_MONO,
      { contentWidth: CONTRACT_CTX.pageWidth },
    )
    const texts = promptTexts(key).map((text) => text.replace(/ /g, ' ').trim())
    for (const entry of puzzle!.entries) {
      expect(texts, entry.letter).toContain(entry.display.toUpperCase())
    }
    // And the letters are still there beside them, so a reader can scan A to Z.
    for (const letter of ALPHABET) {
      expect(texts).toContain(letter)
    }
  })

  it('marks the answers in black, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(atoZWordSearchTemplate.key)).toBe(true)
  })

  it('hides the answer marks on the puzzle page', () => {
    const pages = generateAt(headed(base), CONTRACT_CTX)
    const marks = flatten(pages[0]!.objects).filter((obj) => obj.studioRole === 'answer')
    expect(marks.length).toBe(ATOZ_WORD_COUNT)
    expect(marks.every((obj) => obj.visible === false)).toBe(true)
  })
})

describe('a to z word search — the page holds it all', () => {
  it('keeps both pages inside the safe margin on every printable trim', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of ATOZ_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const config = headed({ ...base, level: level.id })
        const pages = generateAt(config, ctx)
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        assertObjectsInSafeMargin(
          buildAnswerPage(pages[0]!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
            contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
          }),
          ctx,
        )
      }
    }
  })

  it('fits the letters and the answers inside the band both pages reserved', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of ATOZ_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const config = headed({ ...base, level: level.id })
        const { plan, lettersBand, answersBand } = bands(config, ctx)
        const where = `${wIn}x${hIn} ${level.id}`
        expect(lettersBand, where).not.toBeNull()
        expect(answersBand, where).not.toBeNull()
        expect(lettersBand!.height, where).toBeLessThanOrEqual(atoZBandBudget(plan))
        expect(answersBand!.height, where).toBeLessThanOrEqual(atoZBandBudget(plan))
        expect(lettersBand!.items).toHaveLength(ATOZ_WORD_COUNT)
        expect(answersBand!.items).toHaveLength(ATOZ_WORD_COUNT)
        expect(answersBand!.blockWidth).toBeLessThanOrEqual(Math.ceil(bandsWidth(ctx, config)))
      }
    }
  })

  it('never sets the grid or the lists below large print', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of ATOZ_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const config = headed({ ...base, level: level.id })
        const { plan, lettersBand, answersBand } = bands(config, ctx)
        const where = `${wIn}x${hIn} ${level.id}`
        expect(plan.letterFont, where).toBeGreaterThanOrEqual(LETTER_MIN)
        expect(plan.cell, where).toBeGreaterThanOrEqual(ATOZ_CELL_MIN)
        expect(lettersBand!.fontSize, where).toBeGreaterThanOrEqual(ATOZ_LIST_MIN_SIZE)
        expect(answersBand!.fontSize, where).toBeGreaterThanOrEqual(ATOZ_LIST_MIN_SIZE)
      }
    }
  })

  it('keeps the grid inside the sizes twenty-six words can use', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      const ctx = kdpCtx(wIn, hIn)
      const plan = planFor(headed(base), ctx)!
      expect(plan.gridSide).toBeGreaterThanOrEqual(ATOZ_MIN_SIDE)
      expect(plan.gridSide).toBeLessThanOrEqual(ATOZ_MAX_SIDE)
    }
  })

  it('draws the same grid, at the same pitch, on the puzzle page and the solution', () => {
    // Not the same *position*: a solution page carries no instruction line, so
    // its column is taller and the stack sits higher in it. What has to match is
    // the square itself, because the circles are drawn against those cells.
    const config = headed(base)
    const pages = generateAt(config, CONTRACT_CTX)
    const gridOf = (objects: StudioFabricObject[]) =>
      objects.find(
        (obj) => obj.type === 'group' && flatten([obj]).some((c) => c.studioRole === 'answer'),
      )!
    const puzzleGrid = gridOf(pages[0]!.objects)
    const keyGrid = gridOf(pages[0]!.answerSourceObjects!)
    expect(keyGrid.left).toBe(puzzleGrid.left)
    expect(keyGrid.width).toBe(puzzleGrid.width)
    expect(keyGrid.height).toBe(puzzleGrid.height)

    // Every cell letter and every circle keeps its offset within the group, so
    // the mark on the key lands on the same letters it did on the puzzle.
    const offsets = (grid: StudioFabricObject) =>
      flatten([grid])
        .filter((obj) => obj !== grid)
        .map((obj) => `${Math.round(obj.left)},${Math.round(obj.top)}:${obj.text ?? obj.type}`)
        .join('|')
    expect(offsets(keyGrid)).toBe(offsets(puzzleGrid))
  })

  it('still lays out with the heading and the instruction switched off', () => {
    for (const showTitle of [true, false]) {
      for (const showInstructions of [true, false]) {
        const config = headed({ ...base, showTitle, showInstructions })
        const ctx = kdpCtx(6, 9)
        expect(planFor(config, ctx), `${showTitle} ${showInstructions}`).not.toBeNull()
        const pages = generateAt(config, ctx)
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
      }
    }
  })

  it('prints an explaining page rather than a broken one when the trim is too small', () => {
    const ctx = kdpCtx(5, 8)
    const pages = generateAt(headed(base), ctx)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.answerSourceObjects).toBeUndefined()
    const copy = flatten(pages[0]!.objects)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(copy).toContain('too small')
    assertObjectsInSafeMargin(pages[0]!.objects, ctx)
  })
})

function bandsWidth(ctx: StudioGenerateContext, config: StudioConfig): number {
  return atoZBodyField(ctx, config, atoZInstruction(config)).width
}

describe('a to z word search — preflight', () => {
  it('passes on every printable trim and level', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of ATOZ_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const config = headed({ ...base, level: level.id })
        const { plan, puzzle, lettersBand, answersBand } = bands(config, ctx)
        const where = `${wIn}x${hIn} ${level.id}`
        expect(puzzle, where).not.toBeNull()
        const result = runAtoZKdpPreflight({
          puzzle: puzzle!,
          plan,
          level,
          lettersBand: lettersBand!,
          answersBand: answersBand!,
        })
        expect(result.errors, where).toEqual([])
      }
    }
  })

  it('refuses a puzzle that is missing a letter', () => {
    const config = headed(base)
    const { level, plan, puzzle, lettersBand, answersBand } = bands(config, CONTRACT_CTX)
    const short = {
      ...puzzle!,
      entries: puzzle!.entries.slice(0, ATOZ_WORD_COUNT - 1),
      words: puzzle!.words.slice(0, ATOZ_WORD_COUNT - 1),
      displays: puzzle!.displays.slice(0, ATOZ_WORD_COUNT - 1),
    }
    const result = runAtoZKdpPreflight({
      puzzle: short,
      plan,
      level,
      lettersBand: lettersBand!,
      answersBand: answersBand!,
    })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('twenty-six')
  })

  it('refuses a word printed against the wrong letter', () => {
    const config = headed(base)
    const { level, plan, puzzle, lettersBand, answersBand } = bands(config, CONTRACT_CTX)
    const entries = [...puzzle!.entries]
    entries[3] = { ...entries[3]!, letter: 'Z' }
    const result = runAtoZKdpPreflight({
      puzzle: { ...puzzle!, entries },
      plan,
      level,
      lettersBand: lettersBand!,
      answersBand: answersBand!,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a solution page whose answers run in another order', () => {
    const config = headed(base)
    const { level, plan, puzzle, lettersBand, answersBand } = bands(config, CONTRACT_CTX)
    const scrambled = {
      ...answersBand!,
      items: [...answersBand!.items].reverse(),
    }
    const result = runAtoZKdpPreflight({
      puzzle: puzzle!,
      plan,
      level,
      lettersBand: lettersBand!,
      answersBand: scrambled,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a grid that is not the size the page was laid out for', () => {
    const config = headed(base)
    const { level, plan, puzzle, lettersBand, answersBand } = bands(config, CONTRACT_CTX)
    const result = runAtoZKdpPreflight({
      puzzle: { ...puzzle!, size: plan.gridSide + 1 },
      plan,
      level,
      lettersBand: lettersBand!,
      answersBand: answersBand!,
    })
    expect(result.ok).toBe(false)
  })
})

describe('a to z word search — the bundled lexicon', () => {
  const bounds = (maxLetters: number) => ({
    minLetters: 4,
    maxLetters,
    gridSide: ATOZ_MAX_SIDE,
  })

  it('has printable words for every letter, at every level', () => {
    for (const level of ATOZ_LEVELS) {
      for (const letter of ALPHABET) {
        const candidates = candidatesForLetter(letter, {
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          gridSide: ATOZ_MAX_SIDE,
        })
        expect(candidates.length, `${level.id} ${letter}`).toBeGreaterThan(0)
      }
    }
  })

  it('still covers every letter at the shortest ceiling a page can ask for', () => {
    // The page walks the word ceiling down to six letters on tight trims; a
    // letter that ran dry there would print a puzzle missing a letter.
    for (const letter of ALPHABET) {
      expect(candidatesForLetter(letter, bounds(6)).length, letter).toBeGreaterThan(0)
    }
  })

  it('starts every word with its own letter, within the length bounds', () => {
    for (const letter of ALPHABET) {
      for (const entry of candidatesForLetter(letter, bounds(9))) {
        expect(entry.token.startsWith(letter), entry.token).toBe(true)
        expect(entry.token).toMatch(/^[A-Z]+$/)
        expect(entry.token.length).toBeGreaterThanOrEqual(4)
        expect(entry.token.length).toBeLessThanOrEqual(9)
      }
    }
  })

  it('holds no word that another letter’s word contains or reverses', () => {
    const all = ALPHABET.flatMap((letter) => candidatesForLetter(letter, bounds(9)))
    for (const entry of all) {
      const reversed = [...entry.token].reverse().join('')
      for (const other of all) {
        if (other.letter === entry.letter) continue
        expect(other.token.includes(entry.token), `${other.token} ⊃ ${entry.token}`).toBe(
          false,
        )
        expect(other.token, `${other.token} = ${entry.token} backwards`).not.toBe(reversed)
      }
    }
  })

  it('draws a complete alphabet from the lexicon on its own', () => {
    for (const level of ATOZ_LEVELS) {
      for (let seed = 0; seed < 25; seed++) {
        const picked = selectAlphabetSet({
          level,
          gridSide: ATOZ_MIN_SIDE,
          seed: 7 + seed * 1_117,
        })
        expect(picked, `${level.id} seed ${seed}`).not.toBeNull()
        expect(picked!.map((entry) => entry.letter)).toEqual([...ALPHABET])
      }
    }
  })

  it('varies the words it draws across a book', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 30; seed++) {
      const picked = selectAlphabetSet({
        level: ATOZ_LEVELS[1]!,
        gridSide: 18,
        seed: 1_000 + seed * 7_919,
      })
      seen.add(picked!.map((entry) => entry.token).join())
    }
    expect(seen.size).toBe(30)
  })
})

describe('a to z word search — the band', () => {
  it('sets the alphabet in even rows, never a stub', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      const ctx = kdpCtx(wIn, hIn)
      const config = headed(base)
      const { lettersBand } = bands(config, ctx)
      const lastRow = ATOZ_WORD_COUNT % lettersBand!.columnCount
      expect(lastRow === 0 || lastRow * 2 >= lettersBand!.columnCount, `${wIn}x${hIn}`).toBe(
        true,
      )
    }
  })

  it('refuses a band too narrow for one answer rather than overflowing it', () => {
    expect(
      planAtoZList({
        items: ALPHABET.map((letter) => ({ letter, word: 'XYLOPHONE' })),
        mode: 'answers',
        bandWidth: 40,
        maxHeight: 4_000,
        font: 'PT Serif',
      }),
    ).toBeNull()
  })

  it('refuses a band with no room rather than setting below the floor', () => {
    expect(
      planAtoZList({
        items: ALPHABET.map((letter) => ({ letter })),
        mode: 'letters',
        bandWidth: 600,
        maxHeight: 10,
        font: 'PT Serif',
      }),
    ).toBeNull()
  })
})
