import { describe, it, expect } from 'vitest'
import { fallenPhraseTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_INSTRUCTION_SIZE,
} from '@/constants/studio.constants'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { resolveStudioMarginForPage } from '../studio-margin'
import { calculateMarginGuide, parsePageSizeLabel } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { fallenPhraseFixtureResponse, FALLEN_PHRASE_FIXTURE_ITEMS } from './fixture'
import {
  FALLEN_PHRASE_AI_EMPTY_MESSAGE,
  FALLEN_PHRASE_INSTRUCTION,
  bandFor,
  isValidPhrase,
  letterCount,
  normalizePhrase,
  selectAiPhrases,
} from './content'
import {
  GAP,
  MAX_BLOCKED_SHARE,
  MAX_GAP_SPACES,
  blockedShare,
  emptyColumns,
  buildFallenPhraseGrid,
  columnLetters,
  justifyRows,
  reconstructPhrase,
  shuffleColumn,
} from './grid'
import {
  DEFAULT_FALLEN_PHRASE_LEVEL_ID,
  FALLEN_PHRASE_LEVELS,
  FALLEN_PHRASE_MAX_ROWS,
  FALLEN_PHRASE_MIN_ROWS,
  parseFallenPhraseLevel,
  rowCandidatesFor,
} from './levels'
import {
  FALLEN_PHRASE_MAX_COLS,
  FALLEN_PHRASE_MIN_CELL,
  FALLEN_PHRASE_MIN_COLS,
  FALLEN_PHRASE_MIN_LETTER,
  fallenPhraseBodyField,
  fallenPhraseColumnCandidates,
  fallenPhrasePrintNote,
  planFallenPhrasePage,
} from './layout'
import { runFallenPhraseKdpPreflight } from './kdp-preflight'
import { validateFallenPhraseConfig } from './config'

const remote = fallenPhraseFixtureResponse()

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
  ...over,
})

const base: StudioConfig = {
  ...buildDefaultConfig(fallenPhraseTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  title: 'Game 1',
  showTitle: true,
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flatten(obj.objects ?? [])])
}

function pageText(objects: StudioFabricObject[]): string {
  return flatten(objects)
    .map((obj) => String(obj.text ?? ''))
    .join(' ')
}

function isErrorPage(objects: StudioFabricObject[]): boolean {
  return /too small|could not write|would settle|not safe|not valid/i.test(
    pageText(objects),
  )
}

/* -------------------------------------------------------------------------- *
 * Reading the printed page back
 *
 * Every assertion about correctness below is made against the objects the
 * generator actually emitted, never against the plan that produced them. A
 * column whose letters match in the builder and not on the page is exactly the
 * failure this template exists to make impossible, and only the drawn page can
 * prove it did not happen.
 * -------------------------------------------------------------------------- */

interface Glyph {
  text: string
  x: number
  y: number
}

/** Single letters drawn in a given role, as x/y centres. */
function glyphs(objects: StudioFabricObject[], role: 'answer' | 'prompt'): Glyph[] {
  return flatten(objects)
    .filter(
      (obj) =>
        obj.studioRole === role &&
        obj.originX === 'center' &&
        obj.originY === 'center' &&
        /^[A-Z]$/.test(String(obj.text ?? '')),
    )
    .map((obj) => ({ text: String(obj.text), x: obj.left, y: obj.top }))
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * The grid axis these marks sit on — one entry per column (or row), including
 * the ones holding nothing.
 *
 * Reading the axis straight off the glyph positions is not good enough: a
 * column with no letters has no glyphs to be read from, so it would simply
 * vanish and every column after it would shift one place left. A grid with a
 * blank stripe in it would then reconstruct as a saying with two words run
 * together, and the test would blame the generator for the harness's own
 * blind spot. Spacing is a whole multiple of the cell pitch, so the pitch is
 * the gcd of the gaps, and the axis is rebuilt from it.
 */
function bands(values: number[]): number[] {
  const seen = [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b)
  const centres: number[] = []
  for (const value of seen) {
    if (centres.length === 0 || value - centres[centres.length - 1]! > 4) {
      centres.push(value)
    }
  }
  if (centres.length < 2) return centres

  let pitch = 0
  for (let i = 1; i < centres.length; i++) {
    pitch = gcd(pitch, centres[i]! - centres[i - 1]!)
  }
  const last = centres[centres.length - 1]!
  const out: number[] = []
  for (let at = centres[0]!; at <= last; at += pitch) out.push(at)
  return out
}

function bandIndex(bandList: number[], value: number): number {
  let best = 0
  let bestGap = Infinity
  bandList.forEach((band, i) => {
    const gap = Math.abs(band - value)
    if (gap < bestGap) {
      bestGap = gap
      best = i
    }
  })
  return best
}

interface PrintedPuzzle {
  cols: number
  rows: string[]
  /** Letters printed under each column, top to bottom. */
  fallen: string[][]
  phrase: string
}

/**
 * Rebuild the puzzle from the marks on the page.
 *
 * Column identity is taken from the x coordinate alone, which is the same cue
 * the reader has: a letter belongs to the column it is printed under. If the
 * generator ever drew a letter under the wrong column, this is where it shows.
 */
function readPrintedPuzzle(objects: StudioFabricObject[]): PrintedPuzzle {
  const cells = glyphs(objects, 'answer')
  const fallenGlyphs = glyphs(objects, 'prompt')
  const columnBands = bands([...cells, ...fallenGlyphs].map((g) => g.x))
  const rowBands = bands(cells.map((g) => g.y))

  const grid: string[][] = rowBands.map(() => columnBands.map(() => GAP))
  for (const cell of cells) {
    grid[bandIndex(rowBands, cell.y)]![bandIndex(columnBands, cell.x)] = cell.text
  }

  const fallen: string[][] = columnBands.map(() => [])
  for (const glyph of [...fallenGlyphs].sort((a, b) => a.y - b.y)) {
    fallen[bandIndex(columnBands, glyph.x)]!.push(glyph.text)
  }

  const rows = grid.map((row) => row.join(''))
  return { cols: columnBands.length, rows, fallen, phrase: reconstructPhrase(rows) }
}

function sorted(letters: readonly string[]): string {
  return [...letters].sort().join('')
}

function generatePage(config: StudioConfig = base, ctx = CTX()) {
  resetObjectCounter()
  return fallenPhraseTemplate.generate(config, ctx)
}

/* -------------------------------------------------------------------------- *
 * Shared Studio contract
 * -------------------------------------------------------------------------- */

runGeneratorContractTests(fallenPhraseTemplate, {
  contextOverrides: { remoteData: remote },
})

assertGeneratorEntropy(fallenPhraseTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('fallen-phrase registration', () => {
  it('is in the template registry under its own key', () => {
    expect(getStudioTemplate('fallen-phrase')).toBeDefined()
    expect(fallenPhraseTemplate.category).toBe('word')
    expect(fallenPhraseTemplate.producesAnswerKey).toBe(true)
    expect(fallenPhraseTemplate.pageCount).toBe(1)
  })

  it('reveals its answer page in black, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('fallen-phrase')).toBe(true)
  })

  it('asks two questions and neither is about the page', () => {
    const keys = fallenPhraseTemplate.configSchema
      .map((field) => field.key)
      .filter((key) => !['showTitle', 'title', 'showInstructions'].includes(key))
    expect(keys).toEqual(['theme', 'customTheme', 'level'])
  })
})

/* -------------------------------------------------------------------------- *
 * The promise the page makes to its solver
 * -------------------------------------------------------------------------- */

describe('fallen-phrase printed puzzle', () => {
  it('prints letters only under the column they came from', () => {
    for (const level of FALLEN_PHRASE_LEVELS) {
      for (let seed = 1; seed <= 12; seed++) {
        const pages = generatePage({ ...base, level: level.id, seed }, CTX({ seed }))
        const objects = pages[0]!.objects
        expect(isErrorPage(objects), `${level.id} seed ${seed}`).toBe(false)

        const printed = readPrintedPuzzle(objects)
        for (let c = 0; c < printed.cols; c++) {
          const boxes = columnLetters(printed.rows, c)
          expect(
            sorted(printed.fallen[c]!),
            `${level.id} seed ${seed} column ${c}`,
          ).toBe(sorted(boxes))
        }
      }
    }
  })

  it('shows exactly as many letters under a column as it has boxes', () => {
    const printed = readPrintedPuzzle(generatePage()[0]!.objects)
    for (let c = 0; c < printed.cols; c++) {
      expect(printed.fallen[c]!.length).toBe(columnLetters(printed.rows, c).length)
    }
  })

  it('loses no letter and invents none', () => {
    const printed = readPrintedPuzzle(generatePage()[0]!.objects)
    const inBoxes = printed.rows.join('').replace(/ /g, '')
    const underneath = printed.fallen.flat().join('')
    expect(sorted([...underneath])).toBe(sorted([...inBoxes]))
  })

  it('rebuilds a saying the content service actually wrote', () => {
    for (const level of FALLEN_PHRASE_LEVELS) {
      for (let seed = 1; seed <= 8; seed++) {
        const printed = readPrintedPuzzle(
          generatePage({ ...base, level: level.id, seed }, CTX({ seed }))[0]!.objects,
        )
        expect(FALLEN_PHRASE_FIXTURE_ITEMS).toContain(printed.phrase)
        expect(isValidPhrase(printed.phrase, level.id === 'gentle' ? 'short' : undefined))
          .toBe(true)
      }
    }
  })

  it('never prints a column in solved order once it has three letters', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const printed = readPrintedPuzzle(generatePage({ ...base, seed }, CTX({ seed }))[0]!.objects)
      for (let c = 0; c < printed.cols; c++) {
        const boxes = columnLetters(printed.rows, c)
        if (boxes.length < 3 || new Set(boxes).size < 2) continue
        expect(printed.fallen[c]!.join(''), `seed ${seed} column ${c}`).not.toBe(
          boxes.join(''),
        )
      }
    }
  })

  it('keeps the fallen letters aligned to the grid columns', () => {
    const objects = generatePage()[0]!.objects
    const cellX = new Set(glyphs(objects, 'answer').map((g) => Math.round(g.x)))
    for (const glyph of glyphs(objects, 'prompt')) {
      // Every fallen letter sits on a column centre the grid itself uses.
      expect(cellX.has(Math.round(glyph.x))).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- *
 * The solution page
 * -------------------------------------------------------------------------- */

describe('fallen-phrase answer page', () => {
  it('hides every solved letter on the puzzle page', () => {
    const pages = generatePage()
    const answers = harvestAnswers(pages[0]!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
  })

  it('fills the grid in and drops the fallen letters', () => {
    const pages = generatePage()
    const puzzle = readPrintedPuzzle(pages[0]!.objects)
    const key = buildAnswerPage(pages[0]!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)

    // Nothing is left loose under the grid: the letters are all in boxes now.
    expect(glyphs(key, 'prompt')).toHaveLength(0)
    const solved = flatten(key).filter(
      (obj) => obj.studioPageRole === 'answers' && /^[A-Z]$/.test(String(obj.text ?? '')),
    )
    expect(solved.length).toBe(letterCount(puzzle.phrase))
    expect(solved.every((obj) => obj.visible === true)).toBe(true)
  })

  it('spells the saying out underneath, exactly as the grid reads', () => {
    const pages = generatePage()
    const puzzle = readPrintedPuzzle(pages[0]!.objects)
    const key = buildAnswerPage(pages[0]!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const caption = flatten(key).find((obj) =>
      String(obj.text ?? '')
        .replace(/\n/g, ' ')
        .includes(puzzle.phrase.split(' ').slice(0, 3).join(' ')),
    )
    expect(caption, 'solution caption').toBeDefined()
    expect(String(caption!.text).replace(/\s+/g, ' ').trim()).toBe(puzzle.phrase)
  })

  it('reads back the same saying the puzzle page set', () => {
    const pages = generatePage()
    const puzzle = readPrintedPuzzle(pages[0]!.objects)
    const key = buildAnswerPage(pages[0]!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const revealed = flatten(key)
      .filter(
        (obj) =>
          obj.originX === 'center' &&
          obj.originY === 'center' &&
          /^[A-Z]$/.test(String(obj.text ?? '')),
      )
      .map((obj) => ({ text: String(obj.text), x: obj.left, y: obj.top }))

    const columnBands = bands(revealed.map((g) => g.x))
    const rowBands = bands(revealed.map((g) => g.y))
    const grid = rowBands.map(() => columnBands.map(() => GAP))
    for (const glyph of revealed) {
      grid[bandIndex(rowBands, glyph.y)]![bandIndex(columnBands, glyph.x)] = glyph.text
    }
    expect(reconstructPhrase(grid.map((row) => row.join('')))).toBe(puzzle.phrase)
  })

  it('leaves the how-to copy off the answer page', () => {
    const pages = generatePage()
    const key = buildAnswerPage(pages[0]!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    expect(pageText(key)).not.toContain('fallen out of the boxes')
  })
})

/* -------------------------------------------------------------------------- *
 * Page fit
 * -------------------------------------------------------------------------- */

const TRIMS = ['5 x 8 in', '6 x 9 in', '7 x 10 in', '8.5 x 11 in'] as const

function trimContext(label: (typeof TRIMS)[number], seed: number): StudioGenerateContext {
  const dimensions = parsePageSizeLabel(label)
  return {
    pageWidth: dimensions.widthPixels,
    pageHeight: dimensions.heightPixels,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: dimensions.widthPixels,
      pageHeight: dimensions.heightPixels,
      marginGuide: calculateMarginGuide(100, false),
    }),
    seed,
    instanceId: 'trim-run',
    remoteData: remote,
  }
}

describe('fallen-phrase page fit', () => {
  it('prints a real puzzle on every KDP trim, at every level', () => {
    for (const trim of TRIMS) {
      for (const level of FALLEN_PHRASE_LEVELS) {
        for (let seed = 1; seed <= 10; seed++) {
          const ctx = trimContext(trim, seed)
          resetObjectCounter()
          const pages = fallenPhraseTemplate.generate(
            { ...base, level: level.id, seed },
            ctx,
          )
          expect(isErrorPage(pages[0]!.objects), `${trim} ${level.id} seed ${seed}`).toBe(
            false,
          )
        }
      }
    }
  })

  it('keeps both pages inside the safe area on every trim', () => {
    for (const trim of TRIMS) {
      for (const level of FALLEN_PHRASE_LEVELS) {
        const ctx = trimContext(trim, 5)
        resetObjectCounter()
        const pages = fallenPhraseTemplate.generate({ ...base, level: level.id }, ctx)
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        assertObjectsInSafeMargin(
          buildAnswerPage(pages[0]!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO),
          ctx,
        )
      }
    }
  })

  it('never prints a box or a letter below the large-print floor', () => {
    for (const trim of TRIMS) {
      for (const level of FALLEN_PHRASE_LEVELS) {
        const ctx = trimContext(trim, 3)
        const field = fallenPhraseBodyField(ctx, base, FALLEN_PHRASE_INSTRUCTION)
        const cols = fallenPhraseColumnCandidates(field, level)
        expect(cols.length).toBeGreaterThan(0)
        for (const colCount of cols) {
          const plan = planFallenPhrasePage({
            field,
            cols: colCount,
            rowCount: level.rows,
            bankRows: level.rows,
          })
          if (!plan) continue
          expect(plan.metrics.cell).toBeGreaterThanOrEqual(FALLEN_PHRASE_MIN_CELL)
          expect(plan.metrics.letterSize).toBeGreaterThanOrEqual(FALLEN_PHRASE_MIN_LETTER)
          expect(plan.metrics.bankLetterSize).toBeGreaterThanOrEqual(
            FALLEN_PHRASE_MIN_LETTER,
          )
          expect(plan.blockHeight).toBeLessThanOrEqual(field.height)
          expect(plan.cols * plan.metrics.cell).toBeLessThanOrEqual(field.width)
        }
      }
    }
  })

  it('keeps the grid within the printable column range', () => {
    for (const trim of TRIMS) {
      const ctx = trimContext(trim, 1)
      const field = fallenPhraseBodyField(ctx, base, FALLEN_PHRASE_INSTRUCTION)
      for (const level of FALLEN_PHRASE_LEVELS) {
        for (const cols of fallenPhraseColumnCandidates(field, level)) {
          expect(cols).toBeGreaterThanOrEqual(FALLEN_PHRASE_MIN_COLS)
          expect(cols).toBeLessThanOrEqual(FALLEN_PHRASE_MAX_COLS)
        }
      }
    }
  })

  it('refuses rather than shrinks when the column is far too narrow', () => {
    const ctx: StudioGenerateContext = {
      ...CTX(),
      pageWidth: 240,
      pageHeight: 500,
      margin: { top: 24, right: 24, bottom: 24, left: 24 },
    }
    resetObjectCounter()
    const pages = fallenPhraseTemplate.generate(base, ctx)
    expect(pageText(pages[0]!.objects)).toContain('too small')
  })

  it('reports a grid the page can actually set', () => {
    const ctx = trimContext('6 x 9 in', 1)
    const note = fallenPhrasePrintNote({
      level: FALLEN_PHRASE_LEVELS[1]!,
      page: ctx,
      config: base,
      instruction: FALLEN_PHRASE_INSTRUCTION,
    })
    expect(note).toMatch(/\d+ x \d+ grid/)
    expect(note).toContain('answer page')
  })

  it('drops the instruction strip when the seller turns it off', () => {
    const on = generatePage({ ...base, showInstructions: true })
    const off = generatePage({ ...base, showInstructions: false })
    expect(pageText(on[0]!.objects)).toContain('fallen out of the boxes')
    expect(pageText(off[0]!.objects)).not.toContain('fallen out of the boxes')
    const strip = flatten(off[0]!.objects).filter(
      (obj) => obj.fontSize === STUDIO_INSTRUCTION_SIZE && obj.studioRole === 'decoration',
    )
    expect(strip).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- *
 * The grid builder
 * -------------------------------------------------------------------------- */

describe('fallen-phrase grid builder', () => {
  const build = (phrase: string, cols = 13, rows = 4) =>
    buildFallenPhraseGrid({
      phrase,
      colCandidates: [cols],
      rowCandidates: [rows],
      targetRows: rows,
      preferredCols: cols,
      seed: 7,
    })

  it('sets every row to the full width of the grid', () => {
    for (const phrase of FALLEN_PHRASE_FIXTURE_ITEMS) {
      for (const cols of [11, 12, 13, 14]) {
        for (const rows of [3, 4, 5, 6]) {
          const grid = build(phrase, cols, rows)
          if (!grid) continue
          for (const row of grid.rows) expect(row.length).toBe(cols)
        }
      }
    }
  })

  it('never breaks a word across two rows', () => {
    for (const phrase of FALLEN_PHRASE_FIXTURE_ITEMS) {
      const grid = build(phrase, 13, 4) ?? build(phrase, 13, 5)
      if (!grid) continue
      const wordsBack = grid.rows
        .join(GAP)
        .split(/\s+/)
        .filter(Boolean)
      expect(wordsBack).toEqual(phrase.split(' '))
    }
  })

  it('reads back as the saying it was given', () => {
    for (const phrase of FALLEN_PHRASE_FIXTURE_ITEMS) {
      for (const cols of [11, 12, 13, 14]) {
        const grid = buildFallenPhraseGrid({
          phrase,
          colCandidates: [cols],
          rowCandidates: [3, 4, 5, 6],
          targetRows: 4,
          preferredCols: cols,
          seed: 11,
        })
        if (!grid) continue
        expect(reconstructPhrase(grid.rows)).toBe(phrase)
      }
    }
  })

  it('stays under the blocked-cell cap', () => {
    for (const phrase of FALLEN_PHRASE_FIXTURE_ITEMS) {
      for (const cols of [11, 12, 13, 14]) {
        const grid = buildFallenPhraseGrid({
          phrase,
          colCandidates: [cols],
          rowCandidates: [3, 4, 5, 6],
          targetRows: 4,
          preferredCols: cols,
          seed: 3,
        })
        if (!grid) continue
        expect(blockedShare(grid)).toBeLessThanOrEqual(MAX_BLOCKED_SHARE)
      }
    }
  })

  it('never opens a word gap wider than the cap', () => {
    for (const phrase of FALLEN_PHRASE_FIXTURE_ITEMS) {
      const grid = build(phrase, 13, 4) ?? build(phrase, 13, 5)
      if (!grid) continue
      for (const row of grid.rows) {
        // Leading and trailing pads are a separate allowance; the cap here is
        // on the gaps between two words.
        const inner = row.replace(/^ +| +$/g, '')
        for (const run of inner.match(/ +/g) ?? []) {
          expect(run.length).toBeLessThanOrEqual(MAX_GAP_SPACES)
        }
      }
    }
  })

  it('gives every column of a built grid the letters its boxes hold', () => {
    for (const phrase of FALLEN_PHRASE_FIXTURE_ITEMS) {
      const grid = build(phrase, 13, 4) ?? build(phrase, 13, 5)
      if (!grid) continue
      grid.columns.forEach((column, c) => {
        expect(column.letters).toEqual(columnLetters(grid.rows, c))
        expect(sorted(column.fallen)).toBe(sorted(column.letters))
      })
    }
  })

  it('refuses a saying with a word wider than the grid', () => {
    expect(build('RETIREMENT IS A LONG AND HAPPY HOLIDAY NOW', 8, 3)).toBeNull()
    expect(justifyRows(['ABCDEFGHIJKL', 'AT'], 10, 2)).toBeNull()
  })

  it('refuses more rows than the saying has words', () => {
    expect(justifyRows(['ONE', 'TWO', 'SIX'], 12, 4)).toBeNull()
  })

  it('is stable for a seed and moves with it', () => {
    const phrase = FALLEN_PHRASE_FIXTURE_ITEMS[6]!
    const a = buildFallenPhraseGrid({
      phrase,
      colCandidates: [13],
      rowCandidates: [4],
      targetRows: 4,
      preferredCols: 13,
      seed: 21,
    })
    const b = buildFallenPhraseGrid({
      phrase,
      colCandidates: [13],
      rowCandidates: [4],
      targetRows: 4,
      preferredCols: 13,
      seed: 21,
    })
    expect(a).toEqual(b)
  })
})

describe('fallen-phrase column shuffle', () => {
  it('keeps the same letters', () => {
    expect(sorted(shuffleColumn(['R', 'E', 'T', 'I'], 5))).toBe('EIRT')
  })

  it('leaves a column of one alone', () => {
    expect(shuffleColumn(['A'], 9)).toEqual(['A'])
  })

  it('leaves a column of identical letters alone', () => {
    expect(shuffleColumn(['E', 'E', 'E'], 9)).toEqual(['E', 'E', 'E'])
  })

  it('moves a column of three or more off its solved order', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const letters = ['G', 'A', 'R', 'D', 'E', 'N'].slice(0, 3 + (seed % 4))
      expect(shuffleColumn(letters, seed).join('')).not.toBe(letters.join(''))
    }
  })
})

/* -------------------------------------------------------------------------- *
 * Content gates
 * -------------------------------------------------------------------------- */

describe('fallen-phrase content', () => {
  it('strips punctuation and uppercases', () => {
    expect(normalizePhrase("A kind word, costs nothing — and it's kept!")).toBe(
      'A KIND WORD COSTS NOTHING AND IT S KEPT',
    )
  })

  it('accepts the fixture sayings for their own band', () => {
    for (const level of FALLEN_PHRASE_LEVELS) {
      const band = bandFor(level.length)
      const inBand = FALLEN_PHRASE_FIXTURE_ITEMS.filter((phrase) =>
        isValidPhrase(phrase, level.length),
      )
      expect(inBand.length, level.id).toBeGreaterThanOrEqual(4)
      for (const phrase of inBand) {
        expect(letterCount(phrase)).toBeGreaterThanOrEqual(band.minLetters)
        expect(letterCount(phrase)).toBeLessThanOrEqual(band.maxLetters)
        expect(phrase.split(' ').length).toBeGreaterThanOrEqual(band.minWords)
        expect(phrase.split(' ').length).toBeLessThanOrEqual(band.maxWords)
      }
    }
  })

  it('drops sayings outside the band, and unsafe copy', () => {
    const kept = selectAiPhrases(
      [
        'TOO SHORT BY FAR',
        'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
        'AS SOMEONE ONCE SAID THE BEST YEARS ARE STILL AHEAD OF YOU NOW',
        'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
      ],
      { count: 1, length: 'medium' },
    )
    expect(kept).toEqual(['THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN'])
  })

  it('drops a saying carrying a word the grid cannot set', () => {
    expect(isValidPhrase('THE GRANDCHILDREN COME ROUND ON A SUNDAY FOR LUNCH')).toBe(
      false,
    )
  })

  it('falls back to a message when the service returns nothing usable', () => {
    resetObjectCounter()
    const pages = fallenPhraseTemplate.generate(base, CTX({ remoteData: { items: [] } }))
    expect(pageText(pages[0]!.objects)).toContain(FALLEN_PHRASE_AI_EMPTY_MESSAGE)
  })
})

/* -------------------------------------------------------------------------- *
 * Levels
 * -------------------------------------------------------------------------- */

describe('fallen-phrase levels', () => {
  it('falls back to classic, and reads the old length field', () => {
    expect(parseFallenPhraseLevel({}).id).toBe(DEFAULT_FALLEN_PHRASE_LEVEL_ID)
    expect(parseFallenPhraseLevel({ level: 'nonsense' }).id).toBe(
      DEFAULT_FALLEN_PHRASE_LEVEL_ID,
    )
    expect(parseFallenPhraseLevel({ length: 'short' }).id).toBe('gentle')
    expect(parseFallenPhraseLevel({ difficulty: 'hard' }).id).toBe('challenging')
  })

  it('offers only row counts the page can print', () => {
    for (const level of FALLEN_PHRASE_LEVELS) {
      const rows = rowCandidatesFor(level)
      expect(rows[0]).toBe(level.rows)
      for (const count of rows) {
        expect(count).toBeGreaterThanOrEqual(FALLEN_PHRASE_MIN_ROWS)
        expect(count).toBeLessThanOrEqual(FALLEN_PHRASE_MAX_ROWS)
      }
    }
  })

  it('prints more rows for a harder level on the same trim', () => {
    const rowsFor = (level: string) => {
      const printed = readPrintedPuzzle(
        generatePage({ ...base, level, seed: 5 }, CTX({ seed: 5 }))[0]!.objects,
      )
      return printed.rows.length
    }
    expect(rowsFor('gentle')).toBeLessThan(rowsFor('challenging'))
  })
})

/* -------------------------------------------------------------------------- *
 * Preflight
 * -------------------------------------------------------------------------- */

describe('fallen-phrase preflight', () => {
  const grid = buildFallenPhraseGrid({
    phrase: 'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
    colCandidates: [13],
    rowCandidates: [4],
    targetRows: 4,
    preferredCols: 13,
    seed: 4,
  })!
  const metrics = planFallenPhrasePage({
    field: fallenPhraseBodyField(STUDIO_TEST_CTX, base, FALLEN_PHRASE_INSTRUCTION),
    cols: grid.cols,
    rowCount: grid.rows.length,
    bankRows: grid.maxColumnLetters,
  })!.metrics

  const check = (over: Partial<typeof grid> = {}) =>
    runFallenPhraseKdpPreflight({
      grid: { ...grid, ...over },
      length: 'medium',
      metrics,
    })

  it('passes a grid the builder produced', () => {
    expect(check().ok).toBe(true)
    expect(check().errors).toEqual([])
  })

  it('catches a column printed with a letter from elsewhere', () => {
    const columns = grid.columns.map((column, i) =>
      i === 2 ? { ...column, fallen: ['Z', ...column.fallen.slice(1)] } : column,
    )
    expect(check({ columns }).ok).toBe(false)
    expect(check({ columns }).errors.join(' ')).toContain('do not belong')
  })

  it('catches a column missing one of its letters', () => {
    const columns = grid.columns.map((column, i) =>
      i === 1 ? { ...column, fallen: column.fallen.slice(1) } : column,
    )
    const result = check({ columns })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/different number of letters|do not belong/)
  })

  it('catches a grid that no longer spells its saying', () => {
    const result = check({ phrase: 'A COMPLETELY DIFFERENT SAYING FOR THE PAGE TODAY' })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('does not spell')
  })

  it('catches a row that is not the full width of the grid', () => {
    const rows = [grid.rows[0]!.slice(1), ...grid.rows.slice(1)]
    expect(check({ rows }).ok).toBe(false)
  })

  it('catches boxes too small to write in', () => {
    const result = runFallenPhraseKdpPreflight({
      grid,
      length: 'medium',
      metrics: { ...metrics, cell: FALLEN_PHRASE_MIN_CELL - 1 },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('wide enough')
  })

  it('catches letters too small to read', () => {
    const result = runFallenPhraseKdpPreflight({
      grid,
      length: 'medium',
      metrics: { ...metrics, bankLetterSize: FALLEN_PHRASE_MIN_LETTER - 1 },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('large enough')
  })

  it('warns, but does not refuse, when a column prints in solved order', () => {
    const columns = grid.columns.map((column) => ({ ...column, fallen: column.letters }))
    const result = check({ columns })
    expect(result.warnings.join(' ')).toContain('solved order')
  })

  it('accepts a row pushed in from the edge, which the wrap does on purpose', () => {
    // `grid.ts` spills slack past the ends of a row when the word gaps are
    // full. Refusing that here would quietly throw away a third of the grids
    // the builder produces.
    const padded = buildFallenPhraseGrid({
      phrase: 'THE GARDEN KEEPS ITS OWN QUIET HOURS NOW',
      colCandidates: [11, 12, 13],
      rowCandidates: [3, 4],
      targetRows: 3,
      preferredCols: 12,
      seed: 6,
    })
    expect(padded).not.toBeNull()
    const result = runFallenPhraseKdpPreflight({
      grid: padded!,
      length: 'short',
      metrics,
    })
    expect(result.errors).toEqual([])
  })

  it('warns, but does not refuse, a column with no boxes at all', () => {
    // An empty column is solvable — nothing is printed under it either — so it
    // is scored against, not banned. See `emptyColumns` in grid.ts.
    const rows = grid.rows.map((row) => `${row.slice(0, 3)} ${row.slice(4)}`)
    const columns = grid.columns.map((column, c) => {
      const letters = columnLetters(rows, c)
      return { ...column, letters, fallen: [...letters].reverse() }
    })
    const result = check({ rows, columns })
    expect(emptyColumns({ ...grid, rows, columns })).toBeGreaterThan(0)
    expect(result.warnings.join(' ')).toContain('no boxes')
    expect(result.errors.join(' ')).not.toContain('no boxes')
  })
})

/* -------------------------------------------------------------------------- *
 * Form
 * -------------------------------------------------------------------------- */

describe('fallen-phrase config', () => {
  it('requires a theme only when the seller chose to write one', () => {
    expect(validateFallenPhraseConfig({ theme: 'mixed' })).toBeNull()
    expect(validateFallenPhraseConfig({ theme: 'custom', customTheme: '' })?.field).toBe(
      'customTheme',
    )
    expect(
      validateFallenPhraseConfig({ theme: 'custom', customTheme: 'weekend gardening' }),
    ).toBeNull()
  })

  it('defaults to the classic level', () => {
    expect(buildDefaultConfig(fallenPhraseTemplate).level).toBe(
      DEFAULT_FALLEN_PHRASE_LEVEL_ID,
    )
  })
})
