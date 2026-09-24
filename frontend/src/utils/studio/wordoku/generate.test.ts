import { beforeEach, describe, expect, it } from 'vitest'
import { wordokuTemplate } from './generate'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import {
  AMAZON_KDP_PAGE_SIZES,
  DPI,
  PDF_POINTS_PER_INCH,
  calculateMarginGuide,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { resolveStudioMarginForPage } from '../studio-margin'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { objectExtent } from '../studio-layout'
import { clearStudioRecentContent } from '../studio-variety'
import { createRng } from '../studio-rng'
import { countSolutions, isFullyValid } from '../sudoku/solver'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { wordokuPrintNote } from './layout'
import {
  WORDOKU_AVOID_WINDOW,
  WORDOKU_PAGE_TOO_SMALL_MESSAGE,
  isValidWordokuTarget,
  loadWordokuTargets,
  wordokuTargetFaults,
} from './content'
import {
  DEFAULT_WORDOKU_LEVEL_ID,
  WORDOKU_INSTRUCTION,
  WORDOKU_LEVELS,
  parseWordokuLevel,
} from './levels'
import {
  buildDiagonalGrid,
  buildWordokuPuzzle,
  diagonalGivenCount,
  wordokuDiagonal,
  wordokuFaults,
  wordokuLetter,
  wordokuLetterBank,
  type WordokuPuzzle,
} from './puzzle'
import { ratePuzzle } from '../sudoku/rate'
import { clueCount } from '../sudoku/puzzle'
import { WORDOKU_SHADE } from './layout'

const base: StudioConfig = {
  ...buildDefaultConfig(wordokuTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  title: 'Word-oku',
}

const LETTER_CTX = (): StudioGenerateContext => ({
  pageWidth: 816,
  pageHeight: 1056,
  margin: { top: 60, right: 60, bottom: 60, left: 72 },
  seed: 42,
  instanceId: 'test-run',
})

/** The geometry the editor hands a generator for one KDP trim. */
function kdpContext(label: (typeof AMAZON_KDP_PAGE_SIZES)[number], seed = 4242): StudioGenerateContext {
  const page = parsePageSizeLabel(label)
  return {
    pageWidth: page.widthPixels,
    pageHeight: page.heightPixels,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: page.widthPixels,
      pageHeight: page.heightPixels,
      marginGuide: calculateMarginGuide(120, false),
    }),
    seed,
    instanceId: 'kdp-run',
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  clearStudioRecentContent()
  resetObjectCounter()
  return wordokuTemplate.generate(config, ctx)
}

const isGroup = (o: StudioFabricObject) => o.type === 'group'
const gridGroupOf = (objects: StudioFabricObject[]) =>
  objects.find((o) => isGroup(o) && typeof o.data?.[STUDIO_CANONICAL_KEY] === 'string')!

/** Children of a group in page coordinates (Fabric stores them centre-relative). */
function absoluteChildren(group: StudioFabricObject): StudioFabricObject[] {
  const cx = group.left + group.width! / 2
  const cy = group.top + group.height! / 2
  return group.objects!.map((child) => ({ ...child, left: child.left + cx, top: child.top + cy }))
}

/** Read the 9×9 letters a page prints, from the text sitting in each cell. */
function readGrid(group: StudioFabricObject, visibleOnly: boolean): string[][] {
  const cell = group.width! / 9
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => '.'))
  for (const child of absoluteChildren(group)) {
    if (child.type !== 'textbox') continue
    if (visibleOnly && child.visible === false) continue
    const c = Math.floor((child.left - group.left) / cell)
    const r = Math.floor((child.top - group.top) / cell)
    expect(grid[r]![c]).toBe('.')
    grid[r]![c] = String(child.text)
  }
  return grid
}

function letters(puzzle: WordokuPuzzle, grid: number[][]): string[][] {
  return grid.map((row) => row.map((n) => (n === 0 ? '.' : wordokuLetter(puzzle.target, n))))
}

beforeEach(() => {
  clearStudioRecentContent()
})

runGeneratorContractTests(wordokuTemplate)
assertGeneratorEntropy(wordokuTemplate, { seeds: 30 })

describe('wordoku form', () => {
  it('asks one question — the puzzle level', () => {
    expect(wordokuTemplate.configSchema.map((f) => f.key)).toEqual(['level'])
  })

  it('is registered in the Logic tab with an automatic, black-ink answer page', () => {
    const registered = getStudioTemplate('wordoku')!
    expect(registered.category).toBe('logic')
    expect(registered.producesAnswerKey).toBe(true)
    const keys = new Set(registered.configSchema.map((f) => f.key))
    for (const removed of ['size', 'difficulty', 'word', 'targetWord', 'includeAnswerKey']) {
      expect(keys.has(removed)).toBe(false)
    }
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('wordoku')).toBe(true)
  })

  it('defaults to Classic', () => {
    expect(base.level).toBe(DEFAULT_WORDOKU_LEVEL_ID)
    expect(parseWordokuLevel(base).id).toBe('classic')
  })

  it('still generates from a row saved with a difficulty field', () => {
    expect(parseWordokuLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parseWordokuLevel({ difficulty: 'hard' }).id).toBe('challenging')
    expect(parseWordokuLevel({ difficulty: 'medium' }).id).toBe('classic')
    expect(parseWordokuLevel({ level: 'nonsense' }).id).toBe('classic')
  })

  it('tells the seller what will print on their page size', () => {
    const level = parseWordokuLevel(base)
    const ctx = kdpContext('7.5 x 9.25 in')
    const note = wordokuPrintNote(level, ctx, base, WORDOKU_INSTRUCTION)
    expect(note).toMatch(/9×9 letter grid/)
    expect(note).toMatch(/hidden retirement word/)
    expect(note).toMatch(/in wide with \d+ pt letters/)
    expect(wordokuPrintNote(level, undefined, base, WORDOKU_INSTRUCTION)).toMatch(/one solution/)
  })
})

describe('wordoku target words', () => {
  it('ships a curated list that clears the gate, with room for a long book', () => {
    const targets = loadWordokuTargets()
    expect(targets.length).toBeGreaterThan(WORDOKU_AVOID_WINDOW)
    expect(new Set(targets.map((t) => t.word)).size).toBe(targets.length)
    for (const target of targets) {
      expect(target.word).toMatch(/^[A-Z]{9}$/)
      expect(new Set(target.word).size).toBe(9)
      expect(target.hint.length).toBeGreaterThan(0)
      expect(wordokuTargetFaults(target)).toEqual([])
    }
  })

  it('rejects words that cannot be a nine-symbol alphabet', () => {
    expect(isValidWordokuTarget({ word: 'GARDENING' })).toBe(false) // repeated letters
    expect(isValidWordokuTarget({ word: 'AFTERNOON' })).toBe(false)
    expect(isValidWordokuTarget({ word: 'HOLIDAYS' })).toBe(false) // eight letters
    expect(isValidWordokuTarget({ word: 'Birdhouse' })).toBe(false) // not normalised
    expect(isValidWordokuTarget({ word: 'BIRD-HOUSE' })).toBe(false)
    expect(isValidWordokuTarget({ word: 'BIRDHOUSE', hint: 'A birdhouse' })).toBe(false)
    expect(isValidWordokuTarget({ word: 'BIRDHOUSE', hint: 'In the garden' })).toBe(true)
  })

  it('refuses to build a grid from an invalid word', () => {
    const level = parseWordokuLevel(base)
    expect(
      buildWordokuPuzzle({ target: { word: 'GARDENING', hint: '' }, level, rng: createRng(1) }),
    ).toBeNull()
  })
})

describe('wordoku grid', () => {
  it('pins the diagonal to the word order before anything else is filled', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const grid = buildDiagonalGrid(createRng(seed))!
      expect(isFullyValid(grid, 9)).toBe(true)
      for (let i = 0; i < 9; i++) expect(grid[i]![i]).toBe(i + 1)
    }
  })

  for (const level of WORDOKU_LEVELS) {
    it(`${level.id}: every puzzle is a valid, unique Word-oku that spells its word`, () => {
      const targets = loadWordokuTargets()
      for (let seed = 1; seed <= 8; seed++) {
        const target = targets[(seed * 5) % targets.length]!
        const puzzle = buildWordokuPuzzle({ target, level, rng: createRng(seed * 104_729) })!
        expect(puzzle).not.toBeNull()
        expect(wordokuFaults(puzzle, level)).toEqual([])

        // Sudoku rules, checked in the letters the reader actually sees.
        const solved = letters(puzzle, puzzle.solved)
        const alphabet = [...target.word].sort().join('')
        const unit = (cells: string[]) => [...cells].sort().join('')
        for (let i = 0; i < 9; i++) {
          expect(unit(solved[i]!)).toBe(alphabet)
          expect(unit(solved.map((row) => row[i]!))).toBe(alphabet)
          const br = Math.floor(i / 3) * 3
          const bc = (i % 3) * 3
          const box = [0, 1, 2].flatMap((dr) => [0, 1, 2].map((dc) => solved[br + dr]![bc + dc]!))
          expect(unit(box)).toBe(alphabet)
        }
        expect(solved.map((row, i) => row[i]).join('')).toBe(target.word)
        expect(wordokuDiagonal(target, puzzle.solved)).toBe(target.word)

        expect(countSolutions(puzzle.puzzle, 9, 2)).toBe(1)
        expect(ratePuzzle(puzzle.puzzle, 9)).toBe(level.ceiling)
        const clues = clueCount(puzzle.puzzle, 9)
        expect(clues).toBeGreaterThanOrEqual(level.minClues)
        expect(clues).toBeLessThanOrEqual(level.maxClues)
        expect(diagonalGivenCount(puzzle.puzzle)).toBe(level.diagonalGivens)

        const bank = wordokuLetterBank(target)
        expect(bank.join('')).toBe(alphabet)
        expect(bank.join('')).not.toBe(target.word)
      }
    }, 60_000)
  }

  it('flags a tampered puzzle instead of trusting it', () => {
    const level = parseWordokuLevel(base)
    const target = loadWordokuTargets()[0]!
    const good = buildWordokuPuzzle({ target, level, rng: createRng(9) })!

    const wrongGiven = structuredClone(good)
    const [r, c] = (() => {
      for (let rr = 0; rr < 9; rr++)
        for (let cc = 0; cc < 9; cc++) if (rr !== cc && good.puzzle[rr]![cc]) return [rr, cc]
      return [0, 1]
    })()
    wrongGiven.puzzle[r]![c] = (good.puzzle[r]![c]! % 9) + 1
    expect(wordokuFaults(wrongGiven, level).length).toBeGreaterThan(0)

    const tooOpen = structuredClone(good)
    tooOpen.puzzle = tooOpen.puzzle.map((row) => row.map(() => 0))
    expect(wordokuFaults(tooOpen, level)).toContain(
      'The puzzle does not have exactly one solution.',
    )

    const brokenDiagonal = structuredClone(good)
    brokenDiagonal.solved = brokenDiagonal.solved.map((row) => row.map((n) => (n % 9) + 1))
    expect(wordokuFaults(brokenDiagonal, level)).toContain(
      'The diagonal does not spell the hidden word in order.',
    )
  })
})

describe('wordoku page', () => {
  it('prints a letter bank, one grid, and the hidden-word row', () => {
    const [page] = generate(base, LETTER_CTX())
    const groups = page!.objects.filter(isGroup)
    expect(groups.length).toBe(3)
    const grid = gridGroupOf(page!.objects)
    expect(String(grid.data![STUDIO_CANONICAL_KEY])).toMatch(/^wordoku:/)

    const bankLetters = groups[0]!.objects!.filter((o) => o.type === 'textbox').map((o) => o.text)
    expect(bankLetters.length).toBe(9)
    expect(bankLetters).toEqual([...bankLetters].sort())

    const label = page!.objects.find((o) => /^Hidden/.test(String(o.text ?? '')))!
    expect(String(label.text).replace(/ /g, ' ')).toMatch(/^Hidden word · Hint: /)
  })

  it('shades exactly the diagonal, with an outline that survives without the tint', () => {
    const [page] = generate(base, LETTER_CTX())
    const grid = gridGroupOf(page!.objects)
    const cell = grid.width! / 9
    const children = absoluteChildren(grid)
    const shaded = children.filter((o) => o.type === 'rect' && o.fill === WORDOKU_SHADE)
    expect(shaded.length).toBe(9)
    const outlines = children.filter(
      (o) => o.type === 'rect' && o.fill === 'transparent' && o.stroke && o.width! < cell,
    )
    expect(outlines.length).toBe(9)
    for (const rect of shaded) {
      const r = Math.round((rect.top - grid.top) / cell)
      const c = Math.round((rect.left - grid.left) / cell)
      expect(r).toBe(c)
    }
  })

  it('puzzle and answer page print the same grid, and the key completes it', () => {
    for (const level of WORDOKU_LEVELS) {
      const [page] = generate({ ...base, level: level.id }, LETTER_CTX())
      const puzzleGrid = gridGroupOf(page!.objects)
      const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
      const keyGrid = gridGroupOf(key)

      // Same place on both pages — a reader checks cell by cell.
      expect(keyGrid.left).toBe(puzzleGrid.left)
      expect(keyGrid.top).toBe(puzzleGrid.top)
      expect(keyGrid.width).toBe(puzzleGrid.width)

      const givens = readGrid(puzzleGrid, true)
      const solved = readGrid(keyGrid, true)
      let given = 0
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          expect(solved[r]![c]).toMatch(/^[A-Z]$/)
          if (givens[r]![c] !== '.') {
            given++
            expect(givens[r]![c]).toBe(solved[r]![c])
          }
        }
      }
      expect(given).toBeGreaterThanOrEqual(level.minClues)
      expect(given).toBeLessThanOrEqual(level.maxClues)

      // The hidden word boxes on the key spell the diagonal.
      const diagonal = solved.map((row, i) => row[i]).join('')
      const wordGroup = key.filter(isGroup).at(-1)!
      const word = absoluteChildren(wordGroup)
        .filter((o) => o.type === 'textbox')
        .sort((a, b) => a.left - b.left)
        .map((o) => o.text)
        .join('')
      expect(word).toBe(diagonal)
      expect(loadWordokuTargets().some((t) => t.word === word)).toBe(true)

      const keyAnswers = harvestAnswers(key)
      expect(keyAnswers.every((o) => o.visible !== false)).toBe(true)
      expect(keyAnswers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
      // Bank, grid and word row — the key keeps the puzzle page's layout.
      expect(key.filter(isGroup).length).toBe(3)
    }
  }, 60_000)

  it('hides the answers and the hidden word on the puzzle page', () => {
    const [page] = generate(base, LETTER_CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(9)
    expect(answers.every((o) => o.visible === false)).toBe(true)
    const visibleText = JSON.stringify(
      page!.objects.flatMap((o) => (o.objects ? absoluteChildren(o) : [o]))
        .filter((o) => o.visible !== false && o.type === 'textbox')
        .map((o) => o.text),
    )
    const word = readGrid(gridGroupOf(buildAnswerPage(page!.answerSourceObjects!, '#000')), true)
      .map((row, i) => row[i])
      .join('')
    expect(visibleText.includes(word)).toBe(false)
  })

  it('does not repeat a hidden word across a book', () => {
    const ctx = LETTER_CTX()
    const words: string[] = []
    const keys = new Set<string>()
    clearStudioRecentContent()
    for (let i = 0; i < WORDOKU_AVOID_WINDOW; i++) {
      resetObjectCounter()
      const seed = 5_000 + i * 7_919
      const [page] = wordokuTemplate.generate({ ...base, seed }, { ...ctx, seed })
      const key = buildAnswerPage(page!.answerSourceObjects!, '#000')
      words.push(readGrid(gridGroupOf(key), true).map((row, j) => row[j]).join(''))
      keys.add(String(gridGroupOf(page!.objects).data![STUDIO_CANONICAL_KEY]))
    }
    expect(new Set(words).size).toBe(words.length)
    expect(keys.size).toBe(words.length)
  }, 60_000)

  it('refuses a page too small for large-print letters with a message, not a puzzle', () => {
    const tiny: StudioGenerateContext = {
      pageWidth: 300,
      pageHeight: 420,
      margin: { top: 30, right: 30, bottom: 30, left: 30 },
      seed: 1,
      instanceId: 'tiny',
    }
    const [page] = generate(base, tiny)
    expect(page!.objects.some((o) => o.text === WORDOKU_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
    expect(harvestAnswers(page!.objects).length).toBe(0)
    expect(page!.answerSourceObjects).toBeUndefined()
  })
})

describe('wordoku print fit on every KDP trim', () => {
  for (const label of AMAZON_KDP_PAGE_SIZES) {
    it(`${label}: readable, balanced and inside the safe area`, () => {
      for (const level of WORDOKU_LEVELS) {
        for (const config of [
          { ...base, level: level.id },
          { ...base, level: level.id, title: '', showInstructions: false },
        ]) {
          const ctx = kdpContext(label)
          const [page] = generate(config, ctx)
          assertObjectsInSafeMargin(page!.objects, ctx)
          const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO, {
            contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
          })
          assertObjectsInSafeMargin(key, ctx)

          const groups = page!.objects.filter(isGroup)
          expect(groups.length).toBe(3)
          const [bank, grid, word] = groups as [StudioFabricObject, StudioFabricObject, StudioFabricObject]
          const labelObj = page!.objects.find((o) => /^Hidden/.test(String(o.text ?? '')))!
          const labelExtent = objectExtent(labelObj)

          // Blocks stack top to bottom without touching.
          expect(bank.top + bank.height!).toBeLessThan(grid.top)
          expect(grid.top + grid.height!).toBeLessThan(labelExtent.top)
          expect(labelExtent.bottom).toBeLessThanOrEqual(word.top)

          // Square grid, bank and answer row no wider than it.
          expect(Math.abs(grid.width! - grid.height!)).toBeLessThanOrEqual(2)
          expect(bank.width!).toBeLessThanOrEqual(grid.width! + 1)
          expect(word.width!).toBeLessThanOrEqual(grid.width! + 1)

          // Large print, never crowding the rules.
          const cell = grid.width! / 9
          const gridLetters = grid.objects!.filter((o) => o.type === 'textbox')
          const size = gridLetters[0]!.fontSize!
          expect(gridLetters.every((o) => o.fontSize === size)).toBe(true)
          expect((size * PDF_POINTS_PER_INCH) / DPI).toBeGreaterThanOrEqual(14)
          expect(size).toBeLessThanOrEqual(cell * 0.75)
          expect((labelObj.fontSize! * PDF_POINTS_PER_INCH) / DPI).toBeGreaterThanOrEqual(10)

          // A real share of the page, not a poster and not a postage stamp.
          expect(grid.width! / ctx.pageWidth).toBeGreaterThan(0.5)
          expect(grid.width! / ctx.pageWidth).toBeLessThan(0.8)
        }
      }
    }, 60_000)
  }
})
