import { describe, it, expect } from 'vitest'
import { wordSearchTemplate } from './generate'
import {
  buildWordSearch,
  countPuzzleMix,
  directionsForDifficulty,
  placementMatchesWord,
  resolveWordSearch,
  sanitizeWordEntries,
  sanitizeWordEntry,
  sanitizeWords,
} from '@/utils/puzzles/word-search-core'
import { interleavedCandidateStarts, mixTargets } from '@/utils/puzzles/word-search-core'
import { createRng } from '../studio-rng'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { resetObjectCounter, type StudioTag } from '../studio-fabric-builders'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { parseWordCount, wordBankColumnCount } from './config'

const AI_WORDS = [
  'TIGER',
  'LION',
  'ZEBRA',
  'HORSE',
  'MOUSE',
  'EAGLE',
  'SNAKE',
  'WHALE',
  'SHARK',
  'PANDA',
  'KOALA',
  'CAMEL',
  'LLAMA',
  'GOOSE',
  'SWIFT',
  'ROBIN',
  'OTTER',
  'BISON',
  'MOOSE',
  'FINCH',
]

const CTX = (remoteData?: { items: string[] }): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remoteData ?? { items: AI_WORDS },
})

const base = {
  ...buildDefaultConfig(wordSearchTemplate),
  seed: 42,
  fontFamily: 'Inter',
  source: 'ai',
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) =>
    o.type === 'group' && o.objects ? flatten(o.objects) : [o],
  )
}

runGeneratorContractTests(wordSearchTemplate, {
  configOverrides: { source: 'custom', words: AI_WORDS.slice(0, 12) },
})

describe('retirement-word-search', () => {
  it('defaults to AI source and classic / large-print', () => {
    const defaults = buildDefaultConfig(wordSearchTemplate)
    expect(defaults.source).toBe('ai')
    expect(defaults.writeOwnTheme).toBe(false)
    expect(defaults.retirementCategory).toBe('retirement-life')
    expect(defaults.presetThemeId).toBe('life-after-work')
    expect(defaults.difficulty).toBe('classic')
    expect(defaults.printStyle).toBe('large-print')
    expect(defaults.gridSize).toBe('auto')
    expect(defaults.wordCount).toBe('auto')
  })

  it('is deterministic', () => {
    resetObjectCounter()
    const a = wordSearchTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = wordSearchTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different puzzles', () => {
    resetObjectCounter()
    const a = JSON.stringify(wordSearchTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      wordSearchTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('custom words all appear in the grid', () => {
    const words = ['CAT', 'DOG', 'BIRD', 'FISH', 'MOUSE']
    const res = buildWordSearch(
      words,
      10,
      directionsForDifficulty('medium'),
      false,
      createRng(1),
    )
    expect(res).not.toBeNull()
    for (const word of words) {
      expect(res!.placements.some((p) => p.word === word)).toBe(true)
      expect(placementMatchesWord(res!.grid, res!.placements.find((p) => p.word === word)!)).toBe(
        true,
      )
    }
  })

  it('resolveWordSearch clue list equals placed words', () => {
    const puzzle = resolveWordSearch({
      words: AI_WORDS.slice(0, 12),
      gridSize: 12,
      difficulty: 'medium',
      rng: createRng(42),
    })
    expect(puzzle.words.length).toBe(puzzle.placements.length)
    expect(puzzle.displays.length).toBe(puzzle.words.length)
    const placed = new Set(puzzle.placements.map((p) => p.word))
    expect([...placed].sort()).toEqual([...puzzle.words].sort())
  })

  it('sanitizeWordEntry keeps multi-word display and compact token', () => {
    expect(sanitizeWordEntry('Road Trip', { gridSize: 12 })).toEqual({
      display: 'Road Trip',
      token: 'ROADTRIP',
    })
    expect(sanitizeWordEntry('café', { gridSize: 12 })).toBeNull()
  })

  it('prints multi-word phrases in the bank, not the token', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(
      {
        ...base,
        source: 'custom',
        words: ['Road Trip', 'Free Time', 'Garden', 'Travel', 'Relax'],
        difficulty: 'classic',
        gridSize: 12,
      },
      CTX(),
    )
    const printed = flatten(page!.objects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(printed).toContain('Road Trip')
    expect(printed).toContain('Free Time')
    expect(printed).not.toContain('ROADTRIP')
  })

  it('medium prefers some diagonals; hard prefers diagonals + backwards', () => {
    const words = AI_WORDS.slice(0, 12)
    const medium = resolveWordSearch({
      words,
      gridSize: 12,
      difficulty: 'medium',
      rng: createRng(3),
    })
    const hard = resolveWordSearch({
      words,
      gridSize: 14,
      difficulty: 'hard',
      rng: createRng(3),
    })
    const mediumMix = countPuzzleMix(medium.grid, medium.placements)
    const hardMix = countPuzzleMix(hard.grid, hard.placements)
    const mediumTargets = mixTargets({
      wordCount: medium.words.length,
      hasDiagonal: true,
      allowReverse: false,
    })
    const hardTargets = mixTargets({
      wordCount: hard.words.length,
      hasDiagonal: true,
      allowReverse: true,
    })
    expect(mediumMix.diagonal).toBeGreaterThanOrEqual(Math.min(1, mediumTargets.minDiagonal))
    expect(hardMix.backwards).toBeGreaterThanOrEqual(Math.min(1, hardTargets.minBackwards))
  })

  it('interleaved starts keep diagonal dirs in the early mix', () => {
    const dirs = directionsForDifficulty('medium')
    const starts = interleavedCandidateStarts('TIGER', 12, dirs, createRng(1), true)
    const firstDiagonalAt = starts.findIndex((s) => s.dir.dr !== 0 && s.dir.dc !== 0)
    expect(firstDiagonalAt).toBeGreaterThanOrEqual(0)
    expect(firstDiagonalAt).toBeLessThan(starts.length / 2)
  })

  it('dense hard placement finishes quickly', () => {
    const animals = [
      'TIGER', 'LION', 'ZEBRA', 'HORSE', 'MOUSE', 'EAGLE', 'SNAKE', 'WHALE',
      'SHARK', 'PANDA', 'KOALA', 'CAMEL', 'LLAMA', 'GOOSE', 'SWIFT', 'ROBIN',
      'OTTER', 'BISON', 'MOOSE', 'FINCH', 'CRANE', 'HERON', 'RAVEN', 'QUAIL',
    ]
    const t0 = performance.now()
    const puzzle = resolveWordSearch({
      words: animals,
      gridSize: 15,
      difficulty: 'hard',
      rng: createRng(42),
    })
    expect(performance.now() - t0).toBeLessThan(500)
    expect(puzzle.words.length).toBeGreaterThanOrEqual(16)
  })

  it('word list matches placed words with display casing', () => {
    resetObjectCounter()
    const cfg = {
      ...base,
      source: 'custom',
      words: ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'OMEGA'],
      gridSize: 12,
      difficulty: 'classic',
    }
    const [page] = wordSearchTemplate.generate(cfg, CTX())
    const prompts = flatten(page!.objects)
      .filter((o) => o.studioRole === 'prompt' && o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    const listed = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'OMEGA'].filter((w) =>
      prompts.includes(w),
    )
    expect(listed.sort()).toEqual(['ALPHA', 'BETA', 'DELTA', 'GAMMA', 'OMEGA'])
    expect(harvestAnswers(page!.objects).length).toBe(5)
  })

  it('every difficulty and AI / custom generate', () => {
    for (const difficulty of ['relaxed', 'classic', 'challenge'] as const) {
      resetObjectCounter()
      expect(() =>
        wordSearchTemplate.generate({ ...base, source: 'ai', difficulty }, CTX()),
      ).not.toThrow()
    }
    resetObjectCounter()
    expect(() =>
      wordSearchTemplate.generate(
        {
          ...base,
          source: 'custom',
          words: ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'OMEGA'],
        },
        CTX(),
      ),
    ).not.toThrow()
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(wordSearchTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('word-search')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('groups the letter grid and word bank into movable units', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, CTX())
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
  })

  it('centers the grid in the content area', () => {
    resetObjectCounter()
    const ctx = CTX()
    const [page] = wordSearchTemplate.generate(base, ctx)
    const grid = page!.objects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const contentLeft = ctx.margin.left + STUDIO_CONTENT_SAFE_INSET_X
    const contentRight = ctx.pageWidth - ctx.margin.right - STUDIO_CONTENT_SAFE_INSET_X
    const contentCenterX = (contentLeft + contentRight) / 2
    const gridCenterX = grid.left! + grid.width! / 2
    expect(Math.abs(gridCenterX - contentCenterX)).toBeLessThanOrEqual(2)
  })

  it('max density stays inside safe margin', () => {
    resetObjectCounter()
    expect(() =>
      wordSearchTemplate.generate(
        {
          ...base,
          gridSize: 15,
          wordCount: 16,
          difficulty: 'challenge',
        },
        CTX(),
      ),
    ).not.toThrow()
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('word-search')).toBe(true)
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects).filter((o) => o.type === 'rect')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.fill === 'transparent')).toBe(true)
    expect(answers.every((o) => o.stroke === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.stroke !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('centers the solution grid in the answer-key body', () => {
    resetObjectCounter()
    const ctx = CTX()
    const config = { ...base, showTitle: true, title: 'Travel' }
    const [page] = wordSearchTemplate.generate(config, ctx)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const grid = keyObjects.find(
      (o) => o.type === 'group' && (o.objects ?? []).some((c) => c.studioRole === 'answer'),
    )!
    const tag: StudioTag = {
      templateKey: 'word-search',
      instanceId: 'test-run',
      pageRole: 'single',
    }
    const field = drawHeader(
      insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      tag,
      '',
    ).body
    const gridCenterX = grid.left! + grid.width! / 2
    const gridCenterY = grid.top! + grid.height! / 2
    expect(Math.abs(gridCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(gridCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('instruction matches difficulty labels', () => {
    resetObjectCounter()
    const [relaxed] = wordSearchTemplate.generate(
      { ...base, difficulty: 'relaxed', showInstructions: true },
      CTX(),
    )
    const relaxedText = flatten(relaxed!.objects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .join(' ')
    expect(relaxedText).toContain('across or down')

    resetObjectCounter()
    const [challenge] = wordSearchTemplate.generate(
      { ...base, difficulty: 'challenge', showInstructions: true },
      CTX(),
    )
    const challengeText = flatten(challenge!.objects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
      .join(' ')
    expect(challengeText).toContain('backwards')
  })

  it('sanitizeWords uppercases, strips junk, and dedupes', () => {
    expect(
      sanitizeWords(['cat', 'Cat', 'd0g!', 'AB', 'BIRD', 'TOOLONGWORDXYZ'], 8),
    ).toEqual(['CAT', 'BIRD'])
  })

  it('validateConfig allows blank AI theme when writing own theme', () => {
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'ai',
        writeOwnTheme: true,
        customTheme: '   ',
      }),
    ).toBeNull()
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'ai',
        writeOwnTheme: false,
        retirementCategory: 'travel-adventure',
        presetThemeId: 'travel-dreams',
      }),
    ).toBeNull()
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        words: ['CAT', 'DOG', 'BIRD'],
      }),
    ).toBeNull()
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'ai',
        writeOwnTheme: true,
        customTheme: 'x'.repeat(121),
      }),
    ).toMatchObject({ field: 'customTheme' })
  })

  it('validateConfig rejects too few custom words', () => {
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        words: ['CAT'],
      }),
    ).toMatchObject({ field: 'words' })
  })

  it('blocks generate when custom words exceed the grid packing budget', () => {
    const longList = [
      'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
      'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA',
      'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY',
      'XRAY', 'YANKEE',
    ]
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'custom',
        gridSize: 10,
        words: longList,
      }),
    ).toMatchObject({
      field: 'words',
      message: expect.stringMatching(/fits at most 11 words/),
    })
  })

  it('blocks generate when wordCount exceeds the grid packing budget', () => {
    expect(
      wordSearchTemplate.validateConfig?.({
        ...base,
        source: 'ai',
        customTheme: 'animals',
        gridSize: 10,
        wordCount: 20,
      }),
    ).toMatchObject({
      field: 'wordCount',
      message: expect.stringMatching(/fits at most 11 words/),
    })
  })

  it('soft-warns short custom words', () => {
    const wordsField = wordSearchTemplate.configSchema.find((f) => f.key === 'words')
    expect(
      wordsField?.warningWhen?.({
        source: 'custom',
        difficulty: 'classic',
        printStyle: 'large-print',
        gridSize: 12,
        words: ['CAT', 'DOG', 'BIRD', 'FISH'],
      }),
    ).toMatch(/Short words/)
  })

  it('source options are AI and custom only; AI shows theme picker', () => {
    const sourceField = wordSearchTemplate.configSchema.find((f) => f.key === 'source')
    expect(sourceField?.options?.map((o) => o.value)).toEqual(['ai', 'custom'])
    expect(wordSearchTemplate.configSchema.some((f) => f.key === 'presetThemeId')).toBe(true)
    expect(wordSearchTemplate.configSchema.some((f) => f.key === 'writeOwnTheme')).toBe(true)
    const themeField = wordSearchTemplate.configSchema.find((f) => f.key === 'presetThemeId')
    expect(themeField?.visibleWhen?.({ source: 'ai', writeOwnTheme: false })).toBe(true)
    expect(themeField?.visibleWhen?.({ source: 'ai', writeOwnTheme: true })).toBe(false)
    const customField = wordSearchTemplate.configSchema.find((f) => f.key === 'customTheme')
    expect(customField?.visibleWhen?.({ source: 'ai', writeOwnTheme: true })).toBe(true)
    expect(customField?.visibleWhen?.({ source: 'ai', writeOwnTheme: false })).toBe(false)
  })

  it('prefetches only in AI mode', async () => {
    const signal = new AbortController().signal
    expect(await wordSearchTemplate.prefetch?.({ source: 'custom' }, signal)).toBeUndefined()
  })

  it('prints AI words with display casing', () => {
    resetObjectCounter()
    const items = ['TROWEL', 'RAKE', 'HOSE', 'SPADE', 'SEEDS', 'MULCH']
    const [page] = wordSearchTemplate.generate(
      { ...base, source: 'ai', wordCount: 6 },
      CTX({ items }),
    )
    const printed = flatten(page!.objects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(items.every((word) => printed.includes(word))).toBe(true)
  })

  it('only offers balanced word-bank counts in the select', () => {
    const field = wordSearchTemplate.configSchema.find((f) => f.key === 'wordCount')
    const numeric = (field?.options ?? [])
      .map((o) => o.value)
      .filter((v): v is number => typeof v === 'number')
    expect(numeric).toEqual([6, 8, 9, 12, 16])
    for (const n of numeric) {
      expect(n % wordBankColumnCount(n)).toBe(0)
    }
  })

  it('snaps legacy unbalanced wordCount to a balanced fill', () => {
    expect(parseWordCount(5, 'classic', 12)).toBe(6)
    expect(parseWordCount(14, 'challenge', 15)).toBe(16)
    expect(parseWordCount(10, 'classic', 12)).toBe(9)
  })

  it('omits the word bank from the solution page', () => {
    resetObjectCounter()
    const [page] = wordSearchTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const keyText = flatten(keyObjects)
      .filter((o) => o.type === 'textbox')
      .map((o) => String(o.text ?? ''))
    expect(keyText.some((t) => /^Words to find:/i.test(t))).toBe(false)
    expect(harvestAnswers(keyObjects).length).toBeGreaterThan(0)
  })

  it('throws a clear message when the AI call returned nothing', () => {
    resetObjectCounter()
    expect(() =>
      wordSearchTemplate.generate(
        { ...base, source: 'ai' },
        { ...CTX(), remoteData: undefined },
      ),
    ).toThrow(/enough retirement-themed words/)
  })

  it('sanitizeWordEntries preserves order and display', () => {
    const entries = sanitizeWordEntries(['Road Trip', 'road trip', 'Garden'], {
      gridSize: 12,
      minLetters: 4,
    })
    expect(entries).toEqual([
      { display: 'Road Trip', token: 'ROADTRIP' },
      { display: 'Garden', token: 'GARDEN' },
    ])
  })
})
