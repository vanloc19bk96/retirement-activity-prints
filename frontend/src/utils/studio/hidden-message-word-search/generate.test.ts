import { describe, it, expect } from 'vitest'
import { hiddenMessageWordSearchTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
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
} from '@/constants/studio.constants'
import { buildAnswerPage } from '../studio-answer-key'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import {
  DIFFICULTY_PRESETS,
  HIDDEN_MESSAGE_DEFAULT_TITLE,
  HIDDEN_MESSAGE_INSTRUCTION,
  difficultyPreset,
  filterWordPool,
  isPalindrome,
  minValidPoolSize,
  normalizeMessage,
  parseDifficulty,
  parsePrintStyle,
} from './content'
import { validateHiddenMessageConfig } from './config'
import { tryBuildHiddenMessagePuzzle } from './place'
import { countExactOccurrences } from './verify'
import { directionsForDifficulty } from '@/utils/puzzles/word-search-core'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { FIXTURE_MESSAGE, FIXTURE_WORDS } from './fixture'
import { wordSearchTemplate } from '../retirement-word-search/generate'

const remote = { message: FIXTURE_MESSAGE, words: FIXTURE_WORDS }

const CTX = (): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
})

const LARGE_CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const base: StudioConfig = {
  ...buildDefaultConfig(hiddenMessageWordSearchTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
  theme: 'Life after work',
  tone: 'heartfelt',
  difficulty: 'medium',
}

runGeneratorContractTests(hiddenMessageWordSearchTemplate, {
  contextOverrides: { remoteData: remote },
})
assertGeneratorEntropy(hiddenMessageWordSearchTemplate, {
  contextOverrides: { remoteData: remote },
  seeds: 12,
})

function leftoverLetters(puzzle: NonNullable<ReturnType<typeof tryBuildHiddenMessagePuzzle>>): string {
  return puzzle.leftoverCells.map((cell) => puzzle.grid[cell.r]![cell.c]!).join('')
}

describe('hidden-message-word-search', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('hidden-message-word-search')).toBe(true)
  })

  it('uses the spec default title and instruction', () => {
    expect(hiddenMessageWordSearchTemplate.defaultPageTitle).toBe(HIDDEN_MESSAGE_DEFAULT_TITLE)
    expect(HIDDEN_MESSAGE_INSTRUCTION).toContain('letters left over')
  })

  it('defaults to large-print KDP sizes', () => {
    const defaults = buildDefaultConfig(hiddenMessageWordSearchTemplate)
    expect(parsePrintStyle(defaults.printStyle)).toBe('large-print')
    expect(difficultyPreset('easy', 'large-print')).toEqual({ gridSize: 10, listedWords: 12 })
    expect(difficultyPreset('medium', 'large-print')).toEqual({ gridSize: 12, listedWords: 14 })
    expect(difficultyPreset('hard', 'large-print')).toEqual({ gridSize: 13, listedWords: 16 })
    expect(difficultyPreset('hard', 'standard')).toEqual({ gridSize: 15, listedWords: 28 })
  })

  it('matches leftover cells to the normalized message', () => {
    const difficulty = parseDifficulty(base.difficulty)
    const words = filterWordPool(FIXTURE_WORDS, DIFFICULTY_PRESETS[difficulty].gridSize)
    const message = normalizeMessage(FIXTURE_MESSAGE)!
    const puzzle = tryBuildHiddenMessagePuzzle({
      message,
      words,
      difficulty,
      seed: 42,
      printStyle: 'large-print',
    })
    expect(puzzle).not.toBeNull()
    expect(puzzle!.leftoverCells).toHaveLength(message.letters.length)
    expect(leftoverLetters(puzzle!)).toBe(message.letters)
  })

  it('places each listed word exactly once in allowed directions', () => {
    const difficulty = parseDifficulty('easy')
    const dirs = directionsForDifficulty(difficulty)
    const words = filterWordPool(FIXTURE_WORDS, DIFFICULTY_PRESETS[difficulty].gridSize)
    const puzzle = tryBuildHiddenMessagePuzzle({
      message: normalizeMessage(FIXTURE_MESSAGE)!,
      words,
      difficulty,
      seed: 7,
      printStyle: 'large-print',
    })
    expect(puzzle).not.toBeNull()
    const allowed = new Set(dirs.map((dir) => dir.name))
    for (const placement of puzzle!.placements) {
      expect(allowed.has(placement.dir.name)).toBe(true)
      expect(countExactOccurrences(puzzle!.grid, placement.word, dirs)).toBe(1)
    }
  })

  it('is deterministic for the same seed and AI payload', () => {
    const difficulty = parseDifficulty('medium')
    const words = filterWordPool(FIXTURE_WORDS, DIFFICULTY_PRESETS[difficulty].gridSize)
    const options = {
      message: normalizeMessage(FIXTURE_MESSAGE)!,
      words,
      difficulty,
      seed: 99,
      printStyle: 'large-print' as const,
    }
    const a = tryBuildHiddenMessagePuzzle(options)
    const b = tryBuildHiddenMessagePuzzle(options)
    expect(a).toEqual(b)
  })

  it('prints the solution saying on one line when the band still has width', () => {
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(base, LARGE_CTX())
    const key = buildAnswerPage(page!.answerSourceObjects ?? page!.objects, STUDIO_ANSWER_INK_MONO)
    const saying = key.find((obj) =>
      String(obj.text ?? '')
        .replace(/\u00a0/g, ' ')
        .includes('SATURDAY'),
    )
    expect(saying).toBeDefined()
    expect(String(saying!.text)).not.toContain(' ')
    expect(String(saying!.text)).not.toContain('\n')
    const spec = { fontFamily: String(base.fontFamily), fontWeight: 'normal' as const }
    const needed = hugTextBoxWidth(
      String(saying!.text),
      Number(saying!.fontSize),
      Number.POSITIVE_INFINITY,
      spec,
    )
    expect(Number(saying!.width)).toBeGreaterThanOrEqual(needed)
  })

  it('accepts a custom saying and still packs the grid', () => {
    const custom = 'NO MORE ALARM CLOCKS NOW'
    const config = { ...base, wordsFrom: 'custom-saying', customMessage: custom, difficulty: 'easy' }
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(config, {
      ...CTX(),
      remoteData: { message: 'IGNORED SAYING HERE OK', words: FIXTURE_WORDS },
    })
    const key = buildAnswerPage(page!.answerSourceObjects ?? page!.objects, STUDIO_ANSWER_INK_MONO)
    const texts = key.map((obj) => String(obj.text ?? ''))
    expect(texts.some((text) => text.includes('ALARM'))).toBe(true)
    expect(hiddenMessageWordSearchTemplate.producesAnswerKey).toBe(true)
  })

  it('keeps a hard large-print sheet inside the safe area', () => {
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(
      { ...base, difficulty: 'hard', printStyle: 'large-print' },
      LARGE_CTX(),
    )
    assertObjectsInSafeMargin(page!.objects, LARGE_CTX())
    const key = buildAnswerPage(page!.answerSourceObjects ?? page!.objects, STUDIO_ANSWER_INK_MONO)
    assertObjectsInSafeMargin(key, LARGE_CTX())
  })

  it('keeps a hard standard 15×15 sheet inside the safe area', () => {
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(
      { ...base, difficulty: 'hard', printStyle: 'standard' },
      LARGE_CTX(),
    )
    assertObjectsInSafeMargin(page!.objects, LARGE_CTX())
    const key = buildAnswerPage(page!.answerSourceObjects ?? page!.objects, STUDIO_ANSWER_INK_MONO)
    assertObjectsInSafeMargin(key, LARGE_CTX())
  })

  it('rejects a too-short pool and a too-long saying', () => {
    expect(minValidPoolSize('easy', 'large-print')).toBe(20)
    expect(minValidPoolSize('easy', 'standard')).toBe(26)
    expect(normalizeMessage('HI THERE')).toBeNull()
    expect(normalizeMessage('A'.repeat(36))).toBeNull()
    expect(() =>
      hiddenMessageWordSearchTemplate.generate(base, {
        ...CTX(),
        remoteData: { message: 'HI', words: ['TEA', 'NAP'] },
      }),
    ).toThrow()
  })

  it('drops palindromes, nested tokens, and unsafe copy', () => {
    const pool = filterWordPool(
      ['LEVEL', 'REST', 'RESTAURANT', 'Disney', 'cure memory loss', 'GARDEN', 'NAP'],
      12,
    )
    const tokens = pool.map((entry) => entry.token)
    expect(isPalindrome('LEVEL')).toBe(true)
    expect(tokens).not.toContain('LEVEL')
    expect(tokens).not.toContain('REST')
    expect(tokens).not.toContain('DISNEY')
    expect(tokens).toContain('RESTAURANT')
    expect(tokens).toContain('GARDEN')
  })

  it('validates custom saying length in the form', () => {
    expect(
      validateHiddenMessageConfig({
        ...base,
        wordsFrom: 'custom-saying',
        customMessage: 'too short',
      }),
    ).not.toBeNull()
    expect(
      validateHiddenMessageConfig({
        ...base,
        wordsFrom: 'custom-saying',
        customMessage: FIXTURE_MESSAGE,
      }),
    ).toBeNull()
  })

  it('validates the AI theme when wordsFrom is ai-theme', () => {
    expect(
      validateHiddenMessageConfig({ ...base, wordsFrom: 'ai-theme', theme: '' }),
    ).not.toBeNull()
    expect(
      validateHiddenMessageConfig({ ...base, wordsFrom: 'ai-theme', theme: 'Gardening' }),
    ).toBeNull()
  })

  it('defaults to a valid preset theme when wordsFrom is theme', () => {
    expect(validateHiddenMessageConfig({ ...base, wordsFrom: 'theme' })).toBeNull()
  })

  it('paints leftover message letters under the answer highlights', () => {
    resetObjectCounter()
    const page = hiddenMessageWordSearchTemplate.generate(
      { ...base, showTitle: true, title: 'Game 1' },
      CTX(),
    )[0]!
    const grid = page.answerSourceObjects?.find(
      (obj) =>
        obj.type === 'group' && (obj.objects ?? []).some((child) => child.studioRole === 'answer'),
    )
    const children = grid?.objects ?? []
    const lastLetter = children.findLastIndex((child) => child.studioRole === 'prompt')
    const firstCapsule = children.findIndex((child) => child.studioRole === 'answer')
    expect(lastLetter).toBeGreaterThanOrEqual(0)
    expect(firstCapsule).toBeGreaterThan(lastLetter)
  })

  it('keeps the large-print word bank readable (above the KDP floor)', () => {
    const flat = (objects: StudioFabricObject[]) => {
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
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      resetObjectCounter()
      const [page] = hiddenMessageWordSearchTemplate.generate(
        { ...base, difficulty, printStyle: 'large-print' },
        LARGE_CTX(),
      )
      // Bank entries are multi-letter runs; single letters are the grid.
      const bankFonts = flat(page!.objects)
        .filter((obj) => obj.studioRole === 'prompt' && String(obj.text ?? '').length > 1)
        .map((obj) => Number(obj.fontSize))
      expect(bankFonts.length).toBeGreaterThan(0)
      // The bank must sit comfortably above the 14 pt KDP large-print floor,
      // not be clamped to it by a starved band.
      expect(Math.min(...bankFonts)).toBeGreaterThan(14)
    }
  })

  it('spaces grid letters like word search', () => {
    const titled = { showTitle: true, title: 'Game 1', fontFamily: 'PT Serif', seed: 42 }
    const compare = (pageWidth: number, pageHeight: number) => {
      const page = {
        pageWidth,
        pageHeight,
        margin: { top: 24, right: 24, bottom: 24, left: 36 },
        seed: 42,
        instanceId: 'letter-size',
      }
      resetObjectCounter()
      const wordSearch = wordSearchTemplate.generate(
        { ...buildDefaultConfig(wordSearchTemplate), ...titled, printStyle: 'large-print', difficulty: 'medium' },
        { ...page, remoteData: { words: FIXTURE_WORDS } },
      )
      resetObjectCounter()
      const hidden = hiddenMessageWordSearchTemplate.generate(
        { ...base, ...titled, printStyle: 'large-print', difficulty: 'medium' },
        { ...page, remoteData: remote },
      )
      assertObjectsInSafeMargin(hidden[0]!.objects, page)
      const flat = (objects: StudioFabricObject[]) => {
        const texts: StudioFabricObject[] = []
        const walk = (list: StudioFabricObject[]) => {
          for (const obj of list) {
            texts.push(obj)
            if (Array.isArray(obj.objects)) walk(obj.objects)
          }
        }
        walk(objects)
        return texts
      }
      const gridFont = (objects: StudioFabricObject[]) => {
        const hit = flat(objects).find(
          (obj) => obj.studioRole === 'prompt' && String(obj.text ?? '').length === 1,
        )
        return Number(hit?.fontSize ?? 0)
      }
      const cellStep = (objects: StudioFabricObject[]) => {
        const xs = [
          ...new Set(
            flat(objects)
              .filter((obj) => obj.studioRole === 'prompt' && String(obj.text ?? '').length === 1)
              .map((obj) => Number(obj.left)),
          ),
        ].sort((a, b) => a - b)
        return (xs[1] ?? 0) - (xs[0] ?? 0)
      }
      const wordFont = gridFont(wordSearch[0]!.objects)
      const hiddenFont = gridFont(hidden[0]!.objects)
      const wordStep = cellStep(wordSearch[0]!.objects)
      const hiddenStep = cellStep(hidden[0]!.objects)
      expect(wordStep).toBeGreaterThan(0)
      expect(hiddenStep).toBeGreaterThan(0)
      expect(Math.abs(hiddenFont / hiddenStep - wordFont / wordStep)).toBeLessThanOrEqual(0.04)
    }
    compare(Math.round(8.5 * 96), Math.round(11 * 96))
    compare(Math.round(7.5 * 96), Math.round(9.25 * 96))
  })
})
