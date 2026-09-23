import { describe, it, expect } from 'vitest'
import { riddleScrambleTemplate } from './generate'
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
import { objectExtent } from '../studio-object-bounds'
import { resolveStudioMarginForPage } from '../studio-margin'
import { calculateMarginGuide, parsePageSizeLabel } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { sortedKey } from '../retirement-anagram/scramble'
import { riddleScrambleFixtureResponse } from './fixture'
import { buildRiddleScramblePuzzle, markedLetters } from './build'
import {
  MAX_CLUE_CHARS,
  MAX_RIDDLE_CHARS,
  MIN_CLUE_CHARS,
  RIDDLE_SCRAMBLE_INSTRUCTION,
  givesWordAway,
  selectRiddles,
  selectWords,
  worstCaseCandidates,
} from './content'
import {
  DEFAULT_RIDDLE_SCRAMBLE_LEVEL_ID,
  RIDDLE_SCRAMBLE_LEVELS,
  parseRiddleScrambleLevel,
} from './levels'
import {
  MAX_RIDDLE_LINES,
  RULE_HEIGHT,
  SLOT_MIN_W,
  riddleScramblePrintNote,
  riddleScrambleWorstCasePlan,
} from './layout'
import { runRiddleScrambleKdpPreflight } from './kdp-preflight'
import { validateRiddleScrambleConfig } from './config'

const remote = riddleScrambleFixtureResponse()

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
  ...over,
})

const base: StudioConfig = {
  ...buildDefaultConfig(riddleScrambleTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  title: 'Game 1',
  showTitle: true,
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flatten(obj.objects ?? [])])
}

interface ReadRow {
  index: string
  scramble: string
  clue: string
  word: string
  /** Which slot carries the box rather than a writing rule. */
  markIndex: number
  slots: StudioFabricObject[]
  letters: StudioFabricObject[]
}

/**
 * Read back the rows a page actually drew.
 *
 * Tests assert against what the objects say rather than against the plan that
 * produced them. A marked letter that matches its riddle in the builder and
 * not on the printed page is exactly the failure this template exists to make
 * impossible, and only the drawn page can prove it did not happen.
 */
/** A word row carries the bold scramble. The answer strip does not. */
function isWordRowGroup(obj: StudioFabricObject): boolean {
  return (
    obj.type === 'group' &&
    (obj.objects ?? []).some((child) => child.fontWeight === 700)
  )
}

function readRows(objects: StudioFabricObject[]): ReadRow[] {
  const groups = objects.filter(isWordRowGroup)
  return groups.map((group) => {
    const children = group.objects ?? []
    const texts = children.filter((child) => child.type === 'textbox')
    const letters = texts.filter((child) => child.originY === 'bottom')
    const index = texts.find((child) => /^\d+\.$/.test(String(child.text ?? '')))
    const scramble = texts.find((child) => child.fontWeight === 700)
    const clue = texts.find(
      (child) => child !== index && child !== scramble && !letters.includes(child),
    )
    const slots = children.filter((child) => child.type === 'rect')
    return {
      index: String(index?.text ?? ''),
      // Drawn with non-breaking spaces between the letters.
      scramble: String(scramble?.text ?? '').replace(/\s/g, ''),
      clue: String(clue?.text ?? '').replace(/\u00a0/g, ' '),
      word: letters.map((child) => String(child.text ?? '')).join(''),
      markIndex: slots.findIndex((slot) => (slot.height ?? 0) > RULE_HEIGHT),
      slots,
      letters,
    }
  })
}

interface ReadRiddle {
  question: string
  lines: number
  /** Letters written into the boxes under the riddle. */
  answer: string
  boxes: StudioFabricObject[]
  numbers: string[]
}

/** Read back the riddle. The question is loose; the boxes and numbers are one group. */
function readRiddle(objects: StudioFabricObject[]): ReadRiddle {
  const loose = objects.filter((obj) => obj.type !== 'group')
  const texts = loose.filter((obj) => obj.type === 'textbox')
  const question = texts.find(
    (obj) => obj.originY !== 'center' && String(obj.text ?? '').includes('?'),
  )
  const fill = objects.find((obj) => obj.type === 'group' && !isWordRowGroup(obj))
  const children = fill?.objects ?? []
  const letters = children.filter(
    (obj) => obj.type === 'textbox' && obj.originY === 'center',
  )
  const numbers = children.filter((obj) => /^\d+$/.test(String(obj.text ?? '')))
  const raw = String(question?.text ?? '').replace(/\u00a0/g, ' ')
  return {
    question: raw.replace(/\n/g, ' '),
    lines: raw ? raw.split('\n').length : 0,
    answer: letters.map((obj) => String(obj.text ?? '')).join(''),
    boxes: children.filter((obj) => obj.type === 'rect'),
    numbers: numbers.map((obj) => String(obj.text ?? '')),
  }
}

/**
 * The trims this book is actually sold in, with the margins KDP asks for.
 *
 * STUDIO_TEST_CTX is a convenient square-ish page; it is not one a seller ever
 * picks, and the safe area it describes is symmetric where a real interior
 * page's is not. Both layout faults this suite guards against — content pushed
 * to the left margin, and an answer box landing on the bottom safe line — only
 * show up against real geometry.
 */
const REAL_PAGES = [
  { label: '7.5x9.25', size: '7.5 x 9.25 in', bleed: false },
  { label: '6x9', size: '6 x 9 in', bleed: false },
  // Same trim with bleed: a wider sheet, wider outside margins, and the same
  // safe column — so a page that fits one must fit the other.
  { label: '6x9 bleed', size: '6 x 9 in', bleed: true },
  { label: '8.5x11', size: '8.5 x 11 in', bleed: false },
] as const

function realCtx(page: (typeof REAL_PAGES)[number]): StudioGenerateContext {
  const trim = parsePageSizeLabel(page.size)
  const pageWidth = page.bleed
    ? Math.round((trim.widthInches + 0.125) * 96)
    : trim.widthPixels
  const pageHeight = page.bleed
    ? Math.round((trim.heightInches + 0.25) * 96)
    : trim.heightPixels
  return {
    ...CTX(),
    pageWidth,
    pageHeight,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth,
      pageHeight,
      marginGuide: calculateMarginGuide(120, page.bleed),
    }),
  }
}

function generatePage(config: StudioConfig = base, ctx = CTX()) {
  resetObjectCounter()
  const pages = riddleScrambleTemplate.generate(config, ctx)
  expect(pages).toHaveLength(1)
  return pages[0]!
}

runGeneratorContractTests(riddleScrambleTemplate, {
  configOverrides: { title: 'Game 1' },
  contextOverrides: { remoteData: remote },
})

assertGeneratorEntropy(riddleScrambleTemplate, {
  seeds: 40,
  configOverrides: { title: 'Game 1' },
  contextOverrides: { remoteData: remote },
})

describe('riddle-scramble page', () => {
  it('registers in the studio template library', () => {
    expect(getStudioTemplate('riddle-scramble')).toBe(
      getStudioTemplate(riddleScrambleTemplate.key),
    )
    expect(riddleScrambleTemplate.producesAnswerKey).toBe(true)
  })

  it('prints one numbered word row per letter of the riddle answer', () => {
    for (const level of RIDDLE_SCRAMBLE_LEVELS) {
      const ctx = realCtx(REAL_PAGES[0]!)
      const built = generatePage({ ...base, level: level.id }, ctx)
      const rows = readRows(built.objects)
      const riddle = readRiddle(built.objects)
      expect(rows).toHaveLength(level.answerLetters)
      expect(riddle.answer).toHaveLength(level.answerLetters)
      rows.forEach((row, i) => {
        expect(row.index).toBe(`${i + 1}.`)
      })
    }
  })

  // The page in one assertion: solve every row, read the boxed letters down
  // the page, and they are the answer printed in the boxes under the riddle.
  it('spells the riddle answer out of the boxed letters, in row order', () => {
    for (const level of RIDDLE_SCRAMBLE_LEVELS) {
      const ctx = realCtx(REAL_PAGES[0]!)
      const built = generatePage({ ...base, level: level.id }, ctx)
      const rows = readRows(built.objects)
      const riddle = readRiddle(built.objects)
      const boxed = rows.map((row) => row.word[row.markIndex] ?? '').join('')
      expect(boxed).toBe(riddle.answer)
      expect(boxed).toHaveLength(rows.length)
    }
  })

  it('boxes exactly one slot per row, inside the word', () => {
    for (const row of readRows(generatePage().objects)) {
      const boxes = row.slots.filter((slot) => (slot.height ?? 0) > RULE_HEIGHT)
      expect(boxes).toHaveLength(1)
      expect(row.slots).toHaveLength(row.word.length)
      expect(row.markIndex).toBeGreaterThanOrEqual(0)
      expect(row.markIndex).toBeLessThan(row.word.length)
    }
  })

  it('numbers the riddle boxes to match the word rows', () => {
    const built = generatePage()
    const rows = readRows(built.objects)
    const riddle = readRiddle(built.objects)
    expect(riddle.boxes).toHaveLength(rows.length)
    expect(riddle.numbers).toEqual(rows.map((_, i) => `${i + 1}`))
  })

  it('scrambles rearrange into exactly their own word', () => {
    for (const level of RIDDLE_SCRAMBLE_LEVELS) {
      const ctx = realCtx(REAL_PAGES[0]!)
      const rows = readRows(generatePage({ ...base, level: level.id }, ctx).objects)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(sortedKey(row.scramble)).toBe(sortedKey(row.word))
        expect(row.scramble).not.toBe(row.word)
        expect(row.scramble).toHaveLength(row.word.length)
        expect(row.word.length).toBeGreaterThanOrEqual(
          parseRiddleScrambleLevel({ ...base, level: level.id }).minLetters,
        )
      }
    }
  })

  it('never repeats a word, a letter set or a scramble on one page', () => {
    const rows = readRows(generatePage().objects)
    const words = rows.map((row) => row.word)
    expect(new Set(words).size).toBe(words.length)
    const letterSets = words.map((word) => sortedKey(word))
    expect(new Set(letterSets).size).toBe(letterSets.length)
    const scrambles = rows.map((row) => row.scramble)
    expect(new Set(scrambles).size).toBe(scrambles.length)
  })

  it('gives every row a clue that leaks neither its word nor the riddle', () => {
    const built = generatePage()
    const riddle = readRiddle(built.objects)
    for (const row of readRows(built.objects)) {
      expect(row.clue.length).toBeGreaterThanOrEqual(MIN_CLUE_CHARS)
      expect(row.clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS)
      expect(givesWordAway(row.clue, row.word)).toBe(false)
      expect(givesWordAway(row.clue, riddle.answer)).toBe(false)
    }
  })

  it('prints a riddle that is a question and does not answer itself', () => {
    const built = generatePage()
    const riddle = readRiddle(built.objects)
    expect(riddle.question.trim().endsWith('?')).toBe(true)
    expect(riddle.question.length).toBeLessThanOrEqual(MAX_RIDDLE_CHARS)
    expect(riddle.lines).toBeLessThanOrEqual(MAX_RIDDLE_LINES)
    expect(givesWordAway(riddle.question, riddle.answer)).toBe(false)
    // No printed word may hand the riddle over either.
    for (const row of readRows(built.objects)) {
      expect(row.word).not.toBe(riddle.answer)
      expect(row.word.includes(riddle.answer)).toBe(false)
    }
  })

  it('groups the answer boxes with the numbers under them', () => {
    const built = generatePage()
    const fills = built.objects.filter(
      (obj) =>
        obj.type === 'group' &&
        (obj.objects ?? []).some((child) => /^\d+$/.test(String(child.text ?? ''))),
    )
    expect(fills).toHaveLength(1)
    const children = fills[0]!.objects ?? []
    const boxes = children.filter((child) => child.type === 'rect')
    const numbers = children
      .filter((child) => /^\d+$/.test(String(child.text ?? '')))
      .map((child) => String(child.text ?? ''))
    const letters = children.filter((child) => child.studioRole === 'answer')
    expect(boxes.length).toBeGreaterThan(1)
    expect(numbers).toEqual(boxes.map((_, index) => String(index + 1)))
    expect(letters).toHaveLength(boxes.length)
  })

  it('keeps answers hidden on the puzzle page', () => {
    const page = generatePage()
    const answers = harvestAnswers(page.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
  })

  it('centres the puzzle on the page instead of hugging the left margin', () => {
    // Real KDP geometry: a recto page has a wider inside margin, so "centred"
    // means centred in the safe area, not on the sheet.
    for (const page of REAL_PAGES) {
      const ctx = realCtx(page)
      const rows = generatePage(base, ctx).objects.filter((o) => o.type === 'group')
      expect(rows.length).toBeGreaterThan(0)
      const left = Math.min(...rows.map((o) => objectExtent(o).left))
      const right = Math.max(...rows.map((o) => objectExtent(o).right))
      const slackLeft = left - ctx.margin.left
      const slackRight = ctx.pageWidth - ctx.margin.right - right
      expect(slackLeft).toBeGreaterThan(0)
      // Symmetric to within a pixel of rounding.
      expect(Math.abs(slackLeft - slackRight)).toBeLessThanOrEqual(2)
    }
  })

  it('leaves air under the answer boxes on every real trim and level', () => {
    for (const page of REAL_PAGES) {
      const ctx = realCtx(page)
      for (const level of RIDDLE_SCRAMBLE_LEVELS) {
        const built = generatePage({ ...base, level: level.id }, ctx)
        expect(readRows(built.objects).length).toBe(level.answerLetters)
        const safeBottom = ctx.pageHeight - ctx.margin.bottom
        for (const objects of [
          built.objects,
          buildAnswerPage(built.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
            contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
          }),
        ]) {
          const bottom = Math.max(...objects.map((o) => objectExtent(o).bottom))
          // Not merely inside the line — clear of it, so the difference between
          // estimated and real glyph metrics cannot push a box over.
          expect(safeBottom - bottom).toBeGreaterThanOrEqual(8)
        }
      }
    }
  })

  it('sets every page of one run at the same size', () => {
    // The worst case is measured once; a page of short clues must not come
    // back bigger than a page of long ones, or a book stops looking like one.
    const ctx = realCtx(REAL_PAGES.find((page) => page.label === '6x9')!)
    const withClue = (clue: string) => ({
      riddles: remote.riddles,
      words: remote.words.map((word) => ({ ...word, clue })),
    })
    const sizeOf = (remoteData: unknown) => {
      const rows = readRows(generatePage(base, { ...ctx, remoteData }).objects)
      expect(rows.length).toBeGreaterThan(0)
      return rows[0]!.letters[0]!.fontSize
    }
    expect(sizeOf(withClue('A pleasant thing'))).toBe(
      sizeOf(withClue('Part of a quiet, unhurried day')),
    )
  })

  it('never overlaps a row with the next one or with the riddle band', () => {
    for (const page of REAL_PAGES) {
      const ctx = realCtx(page)
      for (const level of RIDDLE_SCRAMBLE_LEVELS) {
        const built = generatePage({ ...base, level: level.id }, ctx)
        const rows = built.objects
          .filter(isWordRowGroup)
          .map((obj) => objectExtent(obj))
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i]!.top).toBeGreaterThanOrEqual(rows[i - 1]!.bottom)
        }
        const lastRow = rows[rows.length - 1]!
        const band = built.objects.filter((obj) => !isWordRowGroup(obj))
        // The riddle and its boxes live under the last row — everything above
        // them belongs to the header.
        const bandTop = Math.min(
          ...band
            .map((obj) => objectExtent(obj))
            .filter((extent) => extent.top > rows[0]!.top)
            .map((extent) => extent.top),
        )
        expect(bandTop).toBeGreaterThanOrEqual(lastRow.bottom)
      }
    }
  })

  it('stacks each row as letters, clue, then writing slots', () => {
    const built = generatePage(base, realCtx(REAL_PAGES[0]!))
    const rows = built.objects.filter(isWordRowGroup)
    for (const group of rows) {
      const children = group.objects ?? []
      const scramble = children.find((child) => child.fontWeight === 700)!
      const letters = children.filter((child) => child.originY === 'bottom')
      const clue = children.find(
        (child) =>
          child.type === 'textbox' &&
          child !== scramble &&
          !letters.includes(child) &&
          !/^\d+\.$/.test(String(child.text ?? '')),
      )!
      const slots = children.filter((child) => child.type === 'rect')
      // Group children are stored relative to the group centre; the ordering
      // between them is what matters, not the absolute numbers.
      expect(objectExtent(clue).top).toBeGreaterThanOrEqual(
        objectExtent(scramble).bottom - 1,
      )
      const slotTop = Math.min(...slots.map((slot) => objectExtent(slot).top))
      expect(slotTop).toBeGreaterThanOrEqual(objectExtent(clue).bottom)
    }
  })

  it('keeps every object inside the safe margin on the puzzle and the key', () => {
    const ctx = CTX()
    const page = generatePage(base, ctx)
    assertObjectsInSafeMargin(page.objects, ctx)
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
      contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
    })
    assertObjectsInSafeMargin(key, ctx)
  })
})

describe('riddle-scramble solution page', () => {
  it('is the puzzle page with the words written in and the riddle answered', () => {
    const page = generatePage()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const puzzleRows = readRows(page.objects)
    const keyRows = readRows(key)

    expect(keyRows).toHaveLength(puzzleRows.length)
    keyRows.forEach((row, i) => {
      const puzzle = puzzleRows[i]!
      // Same prompt, same clue, same slots — a reader checking an answer is
      // looking at the row they solved, not at a bare list.
      expect(row.scramble).toBe(puzzle.scramble)
      expect(row.clue).toBe(puzzle.clue)
      expect(row.slots).toHaveLength(puzzle.slots.length)
      expect(row.markIndex).toBe(puzzle.markIndex)
      expect(row.word).toBe(puzzle.word)
    })

    const keyRiddle = readRiddle(key)
    expect(keyRiddle.question).toBe(readRiddle(page.objects).question)
    expect(keyRiddle.answer).toBe(
      keyRows.map((row) => row.word[row.markIndex]).join(''),
    )
  })

  it('reveals every answer letter in print-safe black', () => {
    const page = generatePage()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const revealed = flatten(key).filter((obj) => obj.studioRole === 'answer')
    expect(revealed.length).toBeGreaterThan(0)
    for (const obj of revealed) {
      expect(obj.visible).toBe(true)
      expect(obj.fill).toBe(STUDIO_ANSWER_INK_MONO)
    }
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('riddle-scramble')).toBe(true)
  })

  it('drops the instruction strip but keeps the riddle and the clues', () => {
    const page = generatePage()
    const key = buildAnswerPage(page.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const texts = flatten(key).map((obj) => String(obj.text ?? ''))
    expect(texts).not.toContain(RIDDLE_SCRAMBLE_INSTRUCTION)
    expect(readRiddle(key).question).toMatch(/\?$/)
    expect(readRows(key).every((row) => row.clue.length > 0)).toBe(true)
  })

  it('never tags a clue or the riddle as instruction decoration', () => {
    // `shouldOmitFromAnswerPage` drops decoration text at the instruction size;
    // a clue or riddle that landed on that size would vanish from the key.
    const page = generatePage()
    for (const obj of flatten(page.answerSourceObjects!)) {
      if (obj.studioRole !== 'decoration') continue
      expect(obj.fontSize).not.toBe(STUDIO_INSTRUCTION_SIZE)
    }
  })
})

describe('riddle-scramble puzzle builder', () => {
  const level = RIDDLE_SCRAMBLE_LEVELS.find((entry) => entry.id === 'classic')!

  it('builds a chain whose marked letters are the riddle answer', () => {
    for (const entry of RIDDLE_SCRAMBLE_LEVELS) {
      const puzzle = buildRiddleScramblePuzzle({
        riddles: selectRiddles(remote.riddles, entry),
        words: selectWords(remote.words, { level: entry }),
        level: entry,
        seed: 42,
      })
      expect(puzzle).not.toBeNull()
      expect(markedLetters(puzzle!.rows)).toBe(puzzle!.answer)
      expect(puzzle!.rows).toHaveLength(entry.answerLetters)
    }
  })

  it('re-seats earlier rows rather than stranding a scarce letter', () => {
    // WRAP is the only word carrying an R and it also carries a P and an A,
    // so a first-fit walk spends it on slot 1 and then has nothing for slot 3.
    // The pool is shuffled per seed, so first-fit fails on some seeds and not
    // others — which is exactly why this asserts across a run of them.
    const riddles = [
      { riddle: 'Where did the retired driver leave the car?', answer: 'PARK' },
    ]
    const words = [
      { word: 'WRAP', clue: 'Put paper round a gift' },
      { word: 'PATIO', clue: 'Paved spot for a chair' },
      { word: 'MEADOW', clue: 'A field of wild flowers' },
      { word: 'BOOK', clue: 'Pages between two covers' },
    ]
    const four = { ...level, answerLetters: 4, minLetters: 4, maxLetters: 6 }
    for (let seed = 1; seed <= 20; seed++) {
      const puzzle = buildRiddleScramblePuzzle({ riddles, words, level: four, seed })
      expect(puzzle).not.toBeNull()
      expect(markedLetters(puzzle!.rows)).toBe('PARK')
      // WRAP was seated on the R rather than on the P it would have taken first.
      const wrap = puzzle!.rows.findIndex((row) => row.word === 'WRAP')
      expect(wrap).toBe(2)
      expect(puzzle!.rows[wrap]!.word[puzzle!.rows[wrap]!.markIndex]).toBe('R')
    }
  })

  it('refuses a riddle its pool cannot spell rather than guessing', () => {
    const puzzle = buildRiddleScramblePuzzle({
      riddles: [{ riddle: 'What did the old typewriter keep?', answer: 'KEYS' }],
      words: [
        { word: 'ROSES', clue: 'Blooms with thorns' },
        { word: 'PATIO', clue: 'Paved spot for a chair' },
      ],
      level: { ...level, answerLetters: 4 },
      seed: 3,
    })
    expect(puzzle).toBeNull()
  })

  it('never prints the riddle answer as one of its own words', () => {
    const puzzle = buildRiddleScramblePuzzle({
      riddles: selectRiddles(remote.riddles, level),
      words: [
        { word: 'PORCH', clue: 'Step by the front door' },
        ...selectWords(remote.words, { level }),
      ],
      level,
      seed: 11,
    })
    expect(puzzle).not.toBeNull()
    expect(puzzle!.rows.map((row) => row.word)).not.toContain(puzzle!.answer)
  })

  it('is stable for a seed and different across seeds', () => {
    const build = (seed: number) =>
      buildRiddleScramblePuzzle({
        riddles: selectRiddles(remote.riddles, level),
        words: selectWords(remote.words, { level }),
        level,
        seed,
      })
    expect(build(5)).toEqual(build(5))
    expect(build(5)).not.toEqual(build(6))
  })
})

describe('riddle-scramble content gates', () => {
  const level = RIDDLE_SCRAMBLE_LEVELS.find((entry) => entry.id === 'classic')!

  it('drops riddles of the wrong answer length or with awkward letters', () => {
    const kept = selectRiddles(
      [
        { riddle: 'What did the retired chef keep by the door?', answer: 'APRON' },
        { riddle: 'Too short an answer for this level?', answer: 'NAPS' },
        { riddle: 'Which board game did the old sailor bring?', answer: 'CHEZS' },
        { riddle: 'Where does a retired sailor drop anchor?', answer: 'PORCH' },
      ],
      level,
    )
    expect(kept.map((entry) => entry.answer)).toEqual(['APRON', 'PORCH'])
  })

  it('drops a riddle that gives its own answer away', () => {
    expect(
      selectRiddles(
        [{ riddle: 'What do you call a relaxing sort of chair?', answer: 'CHAIR' }],
        level,
      ),
    ).toHaveLength(0)
  })

  it('restores a question mark rather than dropping the riddle', () => {
    const kept = selectRiddles(
      [{ riddle: 'What did the retired chef keep by the door', answer: 'APRON' }],
      level,
    )
    expect(kept[0]?.riddle).toBe('What did the retired chef keep by the door?')
  })

  it('drops words that share their letters with another common word', () => {
    // GARDEN is the word a retirement word list conspicuously cannot use:
    // its letters also spell GANDER, so the key can only be right about one.
    const kept = selectWords(
      [
        { word: 'GARDEN', clue: 'Where the roses grow' },
        { word: 'PATIO', clue: 'Paved spot for a chair' },
      ],
      { level },
    )
    expect(kept.map((entry) => entry.word)).toEqual(['PATIO'])
  })

  it('keeps every fixture word inside its level band and clue budget', () => {
    for (const entry of RIDDLE_SCRAMBLE_LEVELS) {
      const kept = selectWords(remote.words, { level: entry })
      expect(kept.length).toBeGreaterThanOrEqual(entry.answerLetters * 3)
      for (const word of kept) {
        expect(word.word.length).toBeGreaterThanOrEqual(entry.minLetters)
        expect(word.word.length).toBeLessThanOrEqual(entry.maxLetters)
        expect(word.clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS)
      }
    }
  })
})

describe('riddle-scramble preflight', () => {
  const level = RIDDLE_SCRAMBLE_LEVELS.find((entry) => entry.id === 'classic')!

  function fixturePlan() {
    const ctx = realCtx(REAL_PAGES[0]!)
    const plan = riddleScrambleWorstCasePlan({
      level,
      page: ctx,
      config: base,
      instruction: RIDDLE_SCRAMBLE_INSTRUCTION,
      font: 'PT Serif',
    })
    expect(plan).not.toBeNull()
    return plan!
  }

  function fixturePuzzle() {
    const puzzle = buildRiddleScramblePuzzle({
      riddles: selectRiddles(remote.riddles, level),
      words: selectWords(remote.words, { level }),
      level,
      seed: 42,
    })
    expect(puzzle).not.toBeNull()
    return puzzle!
  }

  it('passes a page the builder produced', () => {
    const result = runRiddleScrambleKdpPreflight({
      puzzle: fixturePuzzle(),
      level,
      plan: fixturePlan(),
    })
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('refuses a page whose marked letters no longer spell the answer', () => {
    const puzzle = fixturePuzzle()
    const broken = {
      ...puzzle,
      rows: puzzle.rows.map((row, i) =>
        i === 0 ? { ...row, markIndex: (row.markIndex + 1) % row.word.length } : row,
      ),
    }
    const result = runRiddleScrambleKdpPreflight({
      puzzle: broken,
      level,
      plan: fixturePlan(),
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('The marked letters do not spell the riddle answer.')
  })

  it('refuses a scramble that does not rearrange into its word', () => {
    const puzzle = fixturePuzzle()
    const broken = {
      ...puzzle,
      rows: puzzle.rows.map((row, i) =>
        i === 0 ? { ...row, scrambled: `${row.scrambled}X` } : row,
      ),
    }
    const result = runRiddleScrambleKdpPreflight({
      puzzle: broken,
      level,
      plan: fixturePlan(),
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('A scrambled word does not rearrange into its answer.')
  })

  it('refuses a mark that sits outside its word', () => {
    const puzzle = fixturePuzzle()
    const broken = {
      ...puzzle,
      rows: puzzle.rows.map((row, i) => (i === 0 ? { ...row, markIndex: 99 } : row)),
    }
    const result = runRiddleScrambleKdpPreflight({
      puzzle: broken,
      level,
      plan: fixturePlan(),
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('A marked letter sits outside its word.')
  })
})

describe('riddle-scramble form', () => {
  it('asks two questions and never a word count', () => {
    const keys = riddleScrambleTemplate.configSchema.map((field) => field.key)
    expect(keys).toContain('theme')
    expect(keys).toContain('level')
    expect(keys).not.toContain('wordCount')
    expect(keys).not.toContain('riddle')
    expect(keys).not.toContain('answerLetters')
  })

  it('defaults to the classic level', () => {
    expect(parseRiddleScrambleLevel(buildDefaultConfig(riddleScrambleTemplate)).id).toBe(
      DEFAULT_RIDDLE_SCRAMBLE_LEVEL_ID,
    )
  })

  it('reads a legacy difficulty field rather than silently resetting it', () => {
    expect(parseRiddleScrambleLevel({ difficulty: 'hard' }).id).toBe('challenging')
    expect(parseRiddleScrambleLevel({ difficulty: 'easy' }).id).toBe('gentle')
  })

  it('requires a theme when the seller chose to write their own', () => {
    expect(validateRiddleScrambleConfig({ theme: 'custom', customTheme: '' })).toEqual({
      field: 'customTheme',
      message: 'Enter a theme for the riddle and words.',
    })
    expect(
      validateRiddleScrambleConfig({ theme: 'custom', customTheme: 'Sunday roasts' }),
    ).toBeNull()
  })

  it('reports what the chosen trim will really print', () => {
    for (const page of REAL_PAGES) {
      const ctx = realCtx(page)
      for (const level of RIDDLE_SCRAMBLE_LEVELS) {
        const note = riddleScramblePrintNote({
          level,
          page: ctx,
          config: base,
          instruction: RIDDLE_SCRAMBLE_INSTRUCTION,
          font: 'PT Serif',
        })
        expect(note).toContain(`${level.answerLetters} words a page`)
        expect(note).toContain('answer page')
      }
    }
  })

  it('says so instead of promising a page the trim cannot hold', () => {
    const trim = parsePageSizeLabel('5 x 8 in')
    const page = {
      pageWidth: trim.widthPixels,
      pageHeight: trim.heightPixels,
      margin: resolveStudioMarginForPage({
        pageIndex: 0,
        pageWidth: trim.widthPixels,
        pageHeight: trim.heightPixels,
        marginGuide: calculateMarginGuide(120, false),
      }),
    }
    const hardest = RIDDLE_SCRAMBLE_LEVELS.find((level) => level.id === 'challenging')!
    const note = riddleScramblePrintNote({
      level: hardest,
      page,
      config: base,
      instruction: RIDDLE_SCRAMBLE_INSTRUCTION,
      font: 'PT Serif',
    })
    expect(note).toContain('too small')

    // And the page agrees with the note rather than printing something broken.
    const built = generatePage({ ...base, level: hardest.id }, { ...CTX(), ...page })
    expect(readRows(built.objects)).toHaveLength(0)
  })

  it('measures the worst case at a writable slot on every real trim', () => {
    for (const page of REAL_PAGES) {
      for (const level of RIDDLE_SCRAMBLE_LEVELS) {
        const plan = riddleScrambleWorstCasePlan({
          level,
          page: realCtx(page),
          config: base,
          instruction: RIDDLE_SCRAMBLE_INSTRUCTION,
          font: 'PT Serif',
        })
        expect(plan).not.toBeNull()
        expect(plan!.metrics.slotW).toBeGreaterThanOrEqual(SLOT_MIN_W)
        expect(plan!.rowCount).toBe(worstCaseCandidates(level).length)
      }
    }
  })
})

describe('riddle-scramble content failures', () => {
  it('explains itself when the writer sent nothing usable', () => {
    const built = generatePage(base, CTX({ remoteData: { riddles: [], words: [] } }))
    const texts = built.objects.map((obj) => String(obj.text ?? ''))
    expect(readRows(built.objects)).toHaveLength(0)
    expect(texts.some((text) => text.includes('Could not write a riddle'))).toBe(true)
  })

  it('explains itself when no riddle can be spelled from the words', () => {
    const built = generatePage(
      base,
      CTX({
        remoteData: {
          // No word in the pool carries a B, so BRASS cannot be spelled.
          riddles: [
            { riddle: 'What did the retired jeweller polish most?', answer: 'BRASS' },
          ],
          words: [
            { word: 'ROSES', clue: 'Blooms with thorns' },
            { word: 'SHEDS', clue: 'Where the tools are kept' },
            { word: 'CHESS', clue: 'Game of kings and pawns' },
            { word: 'LAWNS', clue: 'Grass you mow on Saturdays' },
            { word: 'SPADE', clue: 'Tool for turning soil' },
          ],
        },
      }),
    )
    const texts = built.objects.map((obj) => String(obj.text ?? ''))
    expect(readRows(built.objects)).toHaveLength(0)
    expect(texts.some((text) => text.includes('Could not spell this riddle'))).toBe(true)
  })
})
