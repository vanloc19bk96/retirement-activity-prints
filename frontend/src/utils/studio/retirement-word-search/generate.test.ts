import { describe, expect, it } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
} from '@/constants/studio.constants'
import type {
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { directionsForDifficulty } from '@/utils/puzzles/word-search-core'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import {
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { resetObjectCounter } from '../studio-fabric-builders'
import { countExactOccurrences } from '../hidden-message-word-search/verify'
import { FIXTURE_WORDS } from '../hidden-message-word-search/fixture'
import {
  WORD_SEARCH_BUILD_ERROR,
  WORD_SEARCH_DEFAULT_TITLE,
  WORD_SEARCH_INSTRUCTION,
  difficultyPreset,
  filterWordPool,
  minValidPoolSize,
} from './content'
import { tryBuildClassicWordSearch } from './place'
import { wordSearchTemplate } from './generate'

const AI_WORDS = FIXTURE_WORDS.slice(0, 30)
const remote = { words: AI_WORDS }

const CTX = (remoteData: unknown = remote): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'word-search-test',
  remoteData,
})

const base = {
  ...buildDefaultConfig(wordSearchTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((object) =>
    object.type === 'group' && object.objects ? flatten(object.objects) : [object],
  )
}

runGeneratorContractTests(wordSearchTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('word-search retirement edition', () => {
  it('uses the new convention fields and removes Memory-only controls', () => {
    const defaults = buildDefaultConfig(wordSearchTemplate)
    expect(defaults).toMatchObject({
      theme: 'Life after work',
      tone: 'heartfelt',
      difficulty: 'medium',
      printStyle: 'large-print',
      shape: 'square',
      customWords: [],
    })
    const keys = new Set(wordSearchTemplate.configSchema.map((field) => field.key))
    for (const key of ['source', 'writeOwnTheme', 'retirementCategory', 'presetThemeId', 'gridSize', 'wordCount', 'words']) {
      expect(keys.has(key)).toBe(false)
    }
    expect(wordSearchTemplate.defaultPageTitle).toBe(WORD_SEARCH_DEFAULT_TITLE)
  })

  it('matches Hidden Message grid and word-count presets', () => {
    expect(difficultyPreset('easy', 'large-print')).toEqual({ gridSize: 10, listedWords: 12 })
    expect(difficultyPreset('medium', 'large-print')).toEqual({ gridSize: 12, listedWords: 14 })
    expect(difficultyPreset('hard', 'large-print')).toEqual({ gridSize: 13, listedWords: 16 })
    expect(difficultyPreset('easy', 'standard')).toEqual({ gridSize: 12, listedWords: 18 })
    expect(difficultyPreset('medium', 'standard')).toEqual({ gridSize: 13, listedWords: 22 })
    expect(difficultyPreset('hard', 'standard')).toEqual({ gridSize: 15, listedWords: 28 })
    expect(minValidPoolSize('medium', 'large-print')).toBe(20)
  })

  it('places every listed word exactly once using only allowed directions', () => {
    for (const printStyle of ['large-print', 'standard'] as const) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const preset = difficultyPreset(difficulty, printStyle)
        const entries = filterWordPool(FIXTURE_WORDS, preset.gridSize)
        const puzzle = tryBuildClassicWordSearch({
          entries,
          difficulty,
          printStyle,
          seed: 17,
        })
        expect(puzzle).not.toBeNull()
        expect(puzzle!.size).toBe(preset.gridSize)
        expect(puzzle!.words.length).toBe(preset.listedWords)
        const dirs = directionsForDifficulty(difficulty)
        const allowed = new Set(dirs.map((dir) => dir.name))
        for (const placement of puzzle!.placements) {
          expect(allowed.has(placement.dir.name)).toBe(true)
          expect(countExactOccurrences(puzzle!.grid, placement.word, dirs)).toBe(1)
        }
      }
    }
  })

  it('is deterministic and changes with the seed', () => {
    const entries = filterWordPool(AI_WORDS, 12)
    const options = {
      entries,
      difficulty: 'medium' as const,
      printStyle: 'large-print' as const,
      seed: 88,
    }
    expect(tryBuildClassicWordSearch(options)).toEqual(tryBuildClassicWordSearch(options))
    expect(tryBuildClassicWordSearch(options)?.grid).not.toEqual(
      tryBuildClassicWordSearch({ ...options, seed: 89 })?.grid,
    )
  })

  it('supports shaped masks and falls back without changing preset size', () => {
    const entries = filterWordPool(AI_WORDS, 12)
    for (const shape of ['circle', 'diamond', 'heart'] as const) {
      const puzzle = tryBuildClassicWordSearch({
        entries,
        difficulty: 'medium',
        printStyle: 'large-print',
        shape,
        seed: 23,
      })
      expect(puzzle).not.toBeNull()
      expect(puzzle!.size).toBe(12)
      expect(puzzle!.words.length).toBeGreaterThanOrEqual(12)
      if (puzzle!.shape !== 'square') {
        expect(puzzle!.grid.flat().some((cell) => cell === '')).toBe(true)
      }
    }
  })

  it('normalizes phrases for the grid and keeps display spaces in an alphabetical bank', () => {
    const customWords = [
      'Road Trip', 'Free Time', 'Garden', 'Travel', 'Relax', 'Pension',
      'Hammock', 'Family', 'Sunset', 'Friends', 'Nature', 'Reading',
    ]
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(
      { ...base, difficulty: 'easy', customWords },
      CTX(undefined),
    )
    const text = flatten(page!.objects)
      .filter((object) => object.type === 'textbox')
      .map((object) => String(object.text ?? ''))
    expect(text).toContain('Road Trip')
    expect(text).toContain('Free Time')
    expect(text).not.toContain('ROADTRIP')
    const printedBank = text.filter((value) => customWords.includes(value))
    expect(printedBank).toEqual(
      [...printedBank].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    )
  })

  it('customWords skips AI and passes the same safety filters', async () => {
    const customWords = ['LEVEL', 'REST', 'RESTAURANT', 'Disney', 'Garden', 'Road Trip']
    const filtered = filterWordPool(customWords, 12).map((entry) => entry.token)
    expect(filtered).not.toContain('LEVEL')
    expect(filtered).not.toContain('REST')
    expect(filtered).not.toContain('DISNEY')
    expect(filtered).toContain('RESTAURANT')
    await expect(
      wordSearchTemplate.prefetch?.({ customWords: ['Garden', 'Travel', 'Relax'] }, new AbortController().signal),
    ).resolves.toBeUndefined()
  })

  it('renders the exact instruction and omits bank/instruction from the solution', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, CTX())
    const puzzleText = flatten(page!.objects).map((object) => String(object.text ?? ''))
    expect(puzzleText).toContain(WORD_SEARCH_INSTRUCTION)

    const key = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const keyText = flatten(key).map((object) => String(object.text ?? ''))
    expect(keyText).not.toContain(WORD_SEARCH_INSTRUCTION)
    expect(keyText.some((value) => /^Words to find:/i.test(value))).toBe(false)
  })

  it('keeps puzzle and answer key print-safe with monochrome capsules', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('word-search')).toBe(true)
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(
      { ...base, difficulty: 'hard', printStyle: 'standard' },
      CTX(),
    )
    assertObjectsInSafeMargin(page!.objects, CTX())
    const key = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    assertObjectsInSafeMargin(key, CTX())
    const answers = harvestAnswers(key).filter((object) => object.type === 'rect')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((object) => object.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((object) => object.stroke !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('validates custom words and exposes automatic answer keys', () => {
    expect(
      wordSearchTemplate.validateConfig?.({ ...base, customWords: ['LEVEL', 'Disney'] }),
    ).toMatchObject({ field: 'customWords' })
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        customWords: ['Road Trip', 'Garden', 'Travel'],
      }),
    ).toBeNull()
    expect(wordSearchTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('word-search')!
    expect(registered.configSchema.some((field) => field.key === 'includeAnswerKey')).toBe(false)
  })

  it('uses the final spec error for invalid or missing AI data', () => {
    expect(() =>
      wordSearchTemplate.generate(base, { ...CTX(), remoteData: undefined }),
    ).toThrow(
      WORD_SEARCH_BUILD_ERROR,
    )
  })

  it('keeps compact contract fixtures inside the shared safe area', () => {
    resetObjectCounter()
    const pages = wordSearchTemplate.generate(base, {
      ...STUDIO_TEST_CTX,
      remoteData: remote,
    })
    for (const page of pages) assertObjectsInSafeMargin(page.objects, STUDIO_TEST_CTX)
  })
})
