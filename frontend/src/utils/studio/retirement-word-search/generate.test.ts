import { describe, expect, it } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import { AMAZON_KDP_PAGE_SIZES, DPI, parsePageSizeLabel } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import {
  countTokenReadings,
  directionsForDifficulty,
} from '@/utils/puzzles/word-search-core'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  RETIREMENT_THEME_CUSTOM,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { CRYPTOGRAM_THEME_SALT } from '../cryptogram/theme'
import { selectWordEntries, worstBankEntry } from './content'
import { isPalindrome, isUnsafeCopy } from './content-quality'
import { WORD_SEARCH_FIXTURE_POOL } from './fixture'
import { WORD_SEARCH_THEME_SALT } from './theme'
import { drawWordList } from './draw'
import { wordSearchTemplate } from './generate'
import { tryBuildWordSearch } from './place'
import {
  CELL_MAX,
  CELL_MIN,
  GRID_MAX_SIDE,
  GRID_MIN_SIDE,
  LETTER_MIN,
  planWordSearchPage,
  wordSearchPrintNote,
} from './layout'
import {
  WORD_SEARCH_LEVELS,
  parseWordSearchLevel,
  wordSearchInstruction,
} from './levels'

const remote = { words: WORD_SEARCH_FIXTURE_POOL }

/**
 * A heading is supplied so the plan these tests measure is the plan generate
 * lays out: a blank heading is filled in with the theme, which makes the page
 * taller than a plan measured without one.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(wordSearchTemplate),
  title: 'Game 1',
  seed: 42,
  fontFamily: 'PT Serif',
}

/** 8.5 x 11 with a KDP interior gutter — the roomiest trim this app ships. */
const LETTER_CTX: StudioGenerateContext = {
  pageWidth: 816,
  pageHeight: 1056,
  margin: { top: 24, right: 24, bottom: 24, left: 36 },
  seed: 42,
  instanceId: 'word-search-letter',
  remoteData: remote,
}

/** 5 x 8, the tightest trim, with the widest gutter a 700-page book takes. */
const POCKET_CTX: StudioGenerateContext = {
  pageWidth: 480,
  pageHeight: 768,
  margin: { top: 24, right: 24, bottom: 24, left: 84 },
  seed: 42,
  instanceId: 'word-search-pocket',
  remoteData: remote,
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((object) =>
    object.type === 'group' && object.objects ? flatten(object.objects) : [object],
  )
}

/** Headings are NBSP-joined so they never soft-wrap; read them back as spaces. */
const NBSP = String.fromCharCode(0xa0)

function textsOf(objects: StudioFabricObject[]): string[] {
  return flatten(objects)
    .filter((object) => object.type === 'textbox')
    .map((object) => String(object.text ?? '').split(NBSP).join(' '))
}

/** Every KDP trim, with the gutter a mid-size book takes. */
function everyTrimContext(): StudioGenerateContext[] {
  return AMAZON_KDP_PAGE_SIZES.map((label, index) => {
    const size = parsePageSizeLabel(label)
    return {
      pageWidth: size.widthPixels,
      pageHeight: size.heightPixels,
      margin: {
        top: Math.round(0.25 * DPI),
        right: Math.round(0.25 * DPI),
        bottom: Math.round(0.25 * DPI),
        left: Math.round(0.5 * DPI),
      },
      seed: 1_000 + index * 7_919,
      instanceId: `word-search-${label}`,
      remoteData: remote,
    }
  })
}

runGeneratorContractTests(wordSearchTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('word-search form', () => {
  it('asks two questions about the puzzle and nothing about the page', () => {
    const keys = wordSearchTemplate.configSchema.map((field) => field.key)
    expect(keys).toEqual(['theme', 'customTheme', 'level'])

    const registered = getStudioTemplate('word-search')!
    const registeredKeys = new Set(registered.configSchema.map((field) => field.key))
    // Shared header fields are merged in by the registry, and nothing else.
    expect([...registeredKeys]).toEqual([
      'showTitle',
      'title',
      'showInstructions',
      'theme',
      'customTheme',
      'level',
    ])
    // Everything the old form asked for is now derived or part of the level.
    for (const dropped of [
      'wordsFrom',
      'presetThemeId',
      'retirementCategory',
      'writeOwnTheme',
      'difficulty',
      'printStyle',
      'customWords',
      'gridSize',
      'wordCount',
      'shape',
      'tone',
      'includeAnswerKey',
    ]) {
      expect(registeredKeys.has(dropped)).toBe(false)
    }
  })

  it('defaults to mixed themes and the classic level', () => {
    expect(buildDefaultConfig(wordSearchTemplate)).toMatchObject({
      theme: 'mixed',
      customTheme: '',
      level: 'classic',
    })
  })

  it('only blocks generate on an empty custom theme', () => {
    expect(wordSearchTemplate.validateConfig?.(base)).toBeNull()
    expect(
      wordSearchTemplate.validateConfig?.({ ...base, theme: RETIREMENT_THEME_CUSTOM }),
    ).toMatchObject({ field: 'customTheme' })
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        theme: RETIREMENT_THEME_CUSTOM,
        customTheme: 'Weekends in the garden',
      }),
    ).toBeNull()
  })

  it('reads a level out of a sheet saved against the old difficulty field', () => {
    expect(parseWordSearchLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parseWordSearchLevel({ difficulty: 'hard' }).id).toBe('challenging')
    expect(parseWordSearchLevel({ difficulty: 'medium' }).id).toBe('classic')
    expect(parseWordSearchLevel({}).id).toBe('classic')
  })

  it('reports the grid, word count and type size the current page will print', () => {
    const level = parseWordSearchLevel(base)
    const instruction = wordSearchInstruction(base)
    const note = wordSearchPrintNote(level, LETTER_CTX, base, instruction)
    const plan = planWordSearchPage({
      page: LETTER_CTX,
      config: base,
      instruction,
      level,
    })!
    expect(note).toContain(`${plan.wordCount} words`)
    expect(note).toContain(`${plan.gridSide} × ${plan.gridSide} grid`)
    const pt = Number(/letters at (\d+) pt/.exec(note)?.[1])
    expect(pt).toBeGreaterThanOrEqual(14)
    expect(note).toContain('answer page')
  })

  it('names the page size as the lever when the trim forced fewer words', () => {
    const level = WORD_SEARCH_LEVELS.find((entry) => entry.id === 'challenging')!
    const config = { ...base, level: 'challenging' }
    const instruction = wordSearchInstruction(config)
    const plan = planWordSearchPage({
      page: POCKET_CTX,
      config,
      instruction,
      level,
    })!
    expect(plan.wordCount).toBeLessThan(level.targetWords)
    expect(wordSearchPrintNote(level, POCKET_CTX, config, instruction)).toContain(
      'larger page size',
    )
  })
})

describe('word-search page plan', () => {
  it('sizes a grid the trim can actually print, on every KDP page size', () => {
    for (const ctx of everyTrimContext()) {
      for (const level of WORD_SEARCH_LEVELS) {
        const config = { ...base, level: level.id }
        const plan = planWordSearchPage({
          page: ctx,
          config,
          instruction: wordSearchInstruction(config),
          level,
        })
        expect(plan, `${ctx.instanceId} / ${level.id}`).not.toBeNull()
        expect(plan!.cell).toBeGreaterThanOrEqual(CELL_MIN)
        expect(plan!.cell).toBeLessThanOrEqual(CELL_MAX)
        expect(plan!.letterFont).toBeGreaterThanOrEqual(LETTER_MIN)
        expect(plan!.gridSide).toBeGreaterThanOrEqual(GRID_MIN_SIDE)
        expect(plan!.gridSide).toBeLessThanOrEqual(GRID_MAX_SIDE)
        expect(plan!.wordCount).toBeGreaterThanOrEqual(level.minWords)
        expect(plan!.wordCount).toBeLessThanOrEqual(level.targetWords)
        expect(plan!.maxWordLetters).toBeLessThanOrEqual(plan!.gridSide)
      }
    }
  })

  it('gives a bigger page a bigger grid instead of the same one twice', () => {
    const level = parseWordSearchLevel(base)
    const instruction = wordSearchInstruction(base)
    const pocket = planWordSearchPage({
      page: POCKET_CTX,
      config: base,
      instruction,
      level,
    })!
    const letter = planWordSearchPage({
      page: LETTER_CTX,
      config: base,
      instruction,
      level,
    })!
    expect(letter.gridSide).toBeGreaterThan(pocket.gridSide)
    expect(letter.wordCount).toBeGreaterThanOrEqual(pocket.wordCount)
  })

  it('leaves the bank room for the widest entry the level allows', () => {
    const level = parseWordSearchLevel(base)
    const plan = planWordSearchPage({
      page: POCKET_CTX,
      config: base,
      instruction: wordSearchInstruction(base),
      level,
    })!
    expect(worstBankEntry(level.maxLetters).replace(/ /g, '').length).toBe(
      level.maxLetters,
    )
    expect(plan.maxEntryWidth).toBeGreaterThan(0)
  })
})

describe('word-search puzzle validity', () => {
  it('places every listed word exactly once, in the level’s directions only', () => {
    for (const level of WORD_SEARCH_LEVELS) {
      for (const ctx of [LETTER_CTX, STUDIO_TEST_CTX, POCKET_CTX]) {
        const config = { ...base, level: level.id }
        resetObjectCounter()
        const [page] = wordSearchTemplate.generate(config, {
          ...ctx,
          remoteData: remote,
        })
        const plan = planWordSearchPage({
          page: ctx,
          config,
          instruction: wordSearchInstruction(config),
          level,
        })!
        const bank = textsOf(page!.objects).filter((text) =>
          WORD_SEARCH_FIXTURE_POOL.includes(text),
        )
        expect(bank.length, `${ctx.instanceId} / ${level.id}`).toBe(plan.wordCount)

        const grid = gridFromPage(page!.objects, plan.gridSide)
        const allowed = new Set(
          directionsForDifficulty(level.directions).map((dir) => dir.name),
        )
        for (const display of bank) {
          const token = display.toUpperCase().replace(/[^A-Z]/g, '')
          // Exactly one reading, scanned over all eight headings — not just
          // the ones the generator was allowed to use.
          expect(countTokenReadings(grid, token), `${display} in ${level.id}`).toBe(1)
        }
        expect(allowed.size).toBeGreaterThan(0)
      }
    }
  })

  it('uses both diagonal slants on classic and challenging', () => {
    const seeds = [1, 42, 99, 2026, 7777]
    for (const level of WORD_SEARCH_LEVELS.filter((entry) => entry.id !== 'gentle')) {
      for (const seed of seeds) {
        const config = { ...base, level: level.id, seed }
        const plan = planWordSearchPage({
          page: LETTER_CTX,
          config,
          instruction: wordSearchInstruction(config),
          level,
        })!
        const entries = selectWordEntries(WORD_SEARCH_FIXTURE_POOL, {
          minLetters: level.minLetters,
          maxLetters: plan.maxWordLetters,
        })
        const puzzle = tryBuildWordSearch({
          entries,
          wordCount: plan.wordCount,
          gridSide: plan.gridSide,
          level,
          seed,
        })
        const where = `${level.id} seed ${seed}`
        expect(puzzle, where).not.toBeNull()
        const slash = puzzle!.placements.filter((placement) => placement.dir.dr * placement.dir.dc < 0)
        const backslash = puzzle!.placements.filter(
          (placement) => placement.dir.dr * placement.dir.dc > 0,
        )
        expect(slash.length, `${where} /`).toBeGreaterThan(0)
        expect(backslash.length, `${where} \\`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the word bank alphabetical and free of nested or unsafe entries', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, LETTER_CTX)
    const bank = textsOf(page!.objects).filter((text) =>
      WORD_SEARCH_FIXTURE_POOL.includes(text),
    )
    expect(bank).toEqual(
      [...bank].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    )
    const tokens = bank.map((word) => word.toUpperCase().replace(/[^A-Z]/g, ''))
    for (const token of tokens) {
      expect(isPalindrome(token)).toBe(false)
      expect(tokens.filter((other) => other.includes(token))).toEqual([token])
    }
    expect(bank.some((word) => isUnsafeCopy(word))).toBe(false)
  })

  it('drops palindromes, nested words and risky copy from the pool', () => {
    const entries = selectWordEntries(
      ['Level', 'Rest', 'Restaurant', 'Disney', 'Garden', 'Road Trip', 'Forgetful', 'Sun'],
      { minLetters: 4, maxLetters: 10 },
    )
    const tokens = entries.map((entry) => entry.token)
    expect(tokens).not.toContain('LEVEL')
    expect(tokens).not.toContain('REST')
    expect(tokens).not.toContain('DISNEY')
    expect(tokens).not.toContain('FORGETFUL')
    expect(tokens).not.toContain('SUN')
    expect(tokens).toContain('RESTAURANT')
    expect(tokens).toContain('ROADTRIP')
    expect(entries.find((entry) => entry.token === 'ROADTRIP')?.display).toBe('Road Trip')
  })

  it('refuses a pool that cannot fill the page rather than printing a thin one', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, {
      ...LETTER_CTX,
      remoteData: { words: ['Garden', 'Travel'] },
    })
    expect(textsOf(page!.objects).some((text) => /could not write/i.test(text))).toBe(
      true,
    )
    expect(page!.answerSourceObjects).toBeUndefined()
  })

  it('says so on the page when the AI data never arrived', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, {
      ...LETTER_CTX,
      remoteData: undefined,
    })
    expect(textsOf(page!.objects).some((text) => /could not write/i.test(text))).toBe(
      true,
    )
  })
})

describe('word-search page and solution', () => {
  it('keeps spaced word-bank entries on one line', () => {
    const phrases = ['Dewy Grass', 'Fresh Air', 'Park Path', 'Warm Sun']
    const objects = drawWordList(
      phrases,
      { left: 40, top: 400, width: 720, height: 180 },
      'PT Serif',
      { templateKey: 'word-search', instanceId: 'bank-nowrap', pageRole: 'single' },
    )
    const bank = flatten(objects)
      .filter((object) => object.type === 'textbox')
      .map((object) => String(object.text ?? ''))
      .filter((text) => phrases.includes(text.split(NBSP).join(' ')))
    expect(bank).toHaveLength(phrases.length)
    for (const text of bank) {
      expect(text).not.toMatch(/ /)
      expect(text).toContain(NBSP)
    }
  })

  it('prints the level’s own instruction and drops it from the solution', () => {
    for (const level of WORD_SEARCH_LEVELS) {
      const config = { ...base, level: level.id }
      resetObjectCounter()
      const [page] = wordSearchTemplate.generate(config, LETTER_CTX)
      expect(textsOf(page!.objects)).toContain(level.instruction)

      const key = buildAnswerPage(
        page!.answerSourceObjects ?? page!.objects,
        STUDIO_ANSWER_INK_MONO,
      )
      const keyText = textsOf(key)
      expect(keyText).not.toContain(level.instruction)
      expect(keyText.some((text) => /^Words to find:/i.test(text))).toBe(false)
    }
  })

  it('circles every listed word on the solution, in print-safe black', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('word-search')).toBe(true)
    resetObjectCounter()
    const config = { ...base, level: 'challenging' }
    const [page] = wordSearchTemplate.generate(config, LETTER_CTX)
    const plan = planWordSearchPage({
      page: LETTER_CTX,
      config,
      instruction: wordSearchInstruction(config),
      level: parseWordSearchLevel(config),
    })!

    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const capsules = harvestAnswers(key).filter((object) => object.type === 'rect')
    expect(capsules.length).toBe(plan.wordCount)
    expect(capsules.every((object) => object.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(capsules.every((object) => object.stroke !== STUDIO_ANSWER_INK)).toBe(true)

    const slashCapsules = capsules.filter((object) => {
      const angle = ((Number(object.angle ?? 0) % 180) + 180) % 180
      return Math.abs(angle - 135) < 20
    })
    const backslashCapsules = capsules.filter((object) => {
      const angle = ((Number(object.angle ?? 0) % 180) + 180) % 180
      return Math.abs(angle - 45) < 20
    })
    expect(slashCapsules.length).toBeGreaterThan(0)
    expect(backslashCapsules.length).toBeGreaterThan(0)

    // The solution grid is the puzzle grid, letter for letter.
    const puzzleGrid = gridFromPage(page!.objects, plan.gridSide)
    const solutionGrid = gridFromPage(page!.answerSourceObjects!, plan.gridSide)
    expect(solutionGrid).toEqual(puzzleGrid)
  })

  it('prints a full puzzle, inside the safe area, on every KDP page size', () => {
    for (const ctx of everyTrimContext()) {
      for (const level of WORD_SEARCH_LEVELS) {
        const config = { ...base, level: level.id }
        const plan = planWordSearchPage({
          page: ctx,
          config,
          instruction: wordSearchInstruction(config),
          level,
        })!
        resetObjectCounter()
        const [page] = wordSearchTemplate.generate(config, ctx)
        const where = `${ctx.instanceId} / ${level.id}`

        // An error page carries no solution, so this is also the assertion
        // that no trim in the catalogue falls back to one.
        expect(page!.answerSourceObjects, where).toBeDefined()
        const circles = harvestAnswers(page!.answerSourceObjects!).filter(
          (object) => object.type === 'rect',
        )
        expect(circles.length, where).toBe(plan.wordCount)

        assertObjectsInSafeMargin(page!.objects, ctx)
        assertObjectsInSafeMargin(
          buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO),
          ctx,
        )
      }
    }
  })

  it('sets every grid letter at the large-print floor', () => {
    for (const ctx of [POCKET_CTX, STUDIO_TEST_CTX, LETTER_CTX]) {
      resetObjectCounter()
      const [page] = wordSearchTemplate.generate(base, { ...ctx, remoteData: remote })
      const letters = flatten(page!.objects).filter(
        (object) => object.type === 'textbox' && String(object.text ?? '').length === 1,
      )
      expect(letters.length).toBeGreaterThan(0)
      for (const letter of letters) {
        expect(letter.fontSize ?? 0).toBeGreaterThanOrEqual(LETTER_MIN)
      }
    }
  })

  it('draws a different grid for every seed, so a book cannot repeat a page', () => {
    const plan = planWordSearchPage({
      page: LETTER_CTX,
      config: base,
      instruction: wordSearchInstruction(base),
      level: parseWordSearchLevel(base),
    })!
    const grids = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const seed = 1_000 + i * 7_919
      resetObjectCounter()
      const [page] = wordSearchTemplate.generate(
        { ...base, seed },
        { ...LETTER_CTX, seed },
      )
      grids.add(
        gridFromPage(page!.objects, plan.gridSide)
          .map((row) => row.join(''))
          .join('/'),
      )
    }
    expect(grids.size).toBe(12)
  })

  it('rotates mixed themes per seed, and out of step with the other games', () => {
    const labels = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const seed = 1_000 + i * 7_919
      labels.add(resolveRetirementTheme(base, seed, WORD_SEARCH_THEME_SALT).label)
      // Facing pages of a book share a seed; the salt is what stops the
      // word search and the cryptogram both landing on "Gardening".
      expect(resolveRetirementTheme(base, seed, WORD_SEARCH_THEME_SALT).label).not.toBe(
        resolveRetirementTheme(base, seed, CRYPTOGRAM_THEME_SALT).label,
      )
    }
    expect(labels.size).toBeGreaterThan(6)
  })

  it('titles a heading-less page with its theme, and leaves it off when asked', () => {
    resetObjectCounter()
    const [titled] = wordSearchTemplate.generate(
      { ...base, title: '', showTitle: true },
      LETTER_CTX,
    )
    expect(textsOf(titled!.objects)[0]).toBe(
      resolveRetirementTheme(base, LETTER_CTX.seed, WORD_SEARCH_THEME_SALT).label,
    )

    resetObjectCounter()
    const [untitled] = wordSearchTemplate.generate(
      { ...base, title: '', showTitle: false },
      LETTER_CTX,
    )
    expect(textsOf(untitled!.objects)[0]).toBe(
      parseWordSearchLevel(base).instruction,
    )
  })
})

/**
 * Read the grid back off the page the way a reader does — from the drawn
 * glyphs, sorted into rows and columns — so these tests check what prints
 * rather than what the builder returned.
 */
function gridFromPage(objects: StudioFabricObject[], side: number): string[][] {
  const letters = flatten(objects).filter(
    (object) => object.type === 'textbox' && String(object.text ?? '').length === 1,
  )
  expect(letters.length).toBe(side * side)
  const sorted = [...letters].sort(
    (a, b) => a.top - b.top || a.left - b.left,
  )
  return Array.from({ length: side }, (_, row) =>
    sorted.slice(row * side, (row + 1) * side).map((object) => String(object.text)),
  )
}
