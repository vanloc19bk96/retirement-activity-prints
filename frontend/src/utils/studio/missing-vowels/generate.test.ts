import { describe, it, expect } from 'vitest'
import { missingVowelsTemplate } from './generate'
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
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { DPI } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { missingVowelsFixtureResponse } from './fixture'
import {
  MAX_CLUE_CHARS,
  MISSING_VOWELS_DEFAULT_TITLE,
  MISSING_VOWELS_INSTRUCTION,
  clueGivesAnswerAway,
  isNearDuplicate,
  isValidMissingVowelsItem,
  normalizeAnswer,
  normalizeClue,
  selectAiItems,
  worstCaseItems,
} from './content'
import { isVowel, letterToken, maskedText, toSlots } from './mask'
import {
  buildVowelPatternIndexForTests,
  hasUniqueAnswerFill,
  vowelPattern,
} from './pattern'
import {
  MISSING_VOWELS_LEVELS,
  parseMissingVowelsLevel,
  type MissingVowelsLevelId,
} from './levels'
import {
  SLOT_MIN_W,
  missingVowelsPrintNote,
  missingVowelsWorstCasePlan,
} from './layout'
import { validateMissingVowelsConfig } from './config'

const remote = missingVowelsFixtureResponse()

const CTX = (over: Partial<StudioGenerateContext> = {}): StudioGenerateContext => ({
  ...STUDIO_TEST_CTX,
  remoteData: remote,
  ...over,
})

const base: StudioConfig = {
  ...buildDefaultConfig(missingVowelsTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

/**
 * The same page with its heading spelled out.
 *
 * Generate fills a blank title from the theme, so a config that leaves it blank
 * measures against a body taller than the one the page really lays out in. Any
 * test that compares the form's promise with the printed page has to hold both
 * sides to the same header.
 */
const titled: StudioConfig = { ...base, title: 'Missing Vowels' }

/** A real KDP interior page: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed: 4242,
  instanceId: 'kdp',
  remoteData: remote,
})

const KDP_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7.5, 9.25],
  [8.5, 11],
]

function flatten(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) => [obj, ...flatten(obj.objects ?? [])])
}

/** Row groups, in the order the page drew them. */
function rowGroups(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  return objects.filter(
    (obj) => obj.type === 'group' && (obj.objects ?? []).some(isSlotLetter),
  )
}

function isSlotLetter(obj: StudioFabricObject): boolean {
  if (obj.type !== 'textbox') return false
  if (obj.studioRole !== 'prompt' && obj.studioRole !== 'answer') return false
  return /^[A-Z]$/.test(String(obj.text ?? ''))
}

/** The letters of one printed row, left to right, prompts and answers alike. */
function rowLetters(group: StudioFabricObject): StudioFabricObject[] {
  return (group.objects ?? [])
    .filter(isSlotLetter)
    .toSorted((a, b) => a.left - b.left)
}

/** The clue printed under one row. */
function rowClue(group: StudioFabricObject): string {
  const texts = (group.objects ?? []).filter(
    (obj) =>
      obj.type === 'textbox' &&
      obj.studioRole === 'prompt' &&
      !isSlotLetter(obj) &&
      !/^\d+\.$/.test(String(obj.text ?? '').trim()),
  )
  return String(texts.at(-1)?.text ?? '').replace(/\n/g, ' ')
}

runGeneratorContractTests(missingVowelsTemplate, {
  contextOverrides: { remoteData: remote },
})
assertGeneratorEntropy(missingVowelsTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('missing-vowels rows', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('missing-vowels')).toBe(true)
  })

  it('prints every consonant and hides every vowel, slot by slot', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const rows = rowGroups(page!.objects)
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      for (const letter of rowLetters(row)) {
        const text = String(letter.text)
        if (isVowel(text)) {
          expect(letter.studioRole, `${text} should be hidden`).toBe('answer')
          expect(letter.visible).toBe(false)
        } else {
          expect(letter.studioRole, `${text} should be printed`).toBe('prompt')
          expect(letter.visible).not.toBe(false)
        }
      }
    }
  })

  it('restores each row of blanks to exactly its own answer', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const answers = new Set(remote.items.map((item) => item.answer.replace(/ /g, '')))

    for (const row of rowGroups(page!.objects)) {
      const restored = rowLetters(row)
        .map((obj) => String(obj.text))
        .join('')
      expect(answers.has(restored), `${restored} is not one of the answers`).toBe(true)
      // And the blanks are exactly the vowels of that answer — nothing printed
      // that should have been written, nothing hidden that should have printed.
      const blanks = rowLetters(row)
        .map((obj) => (obj.studioRole === 'answer' ? '_' : String(obj.text)))
        .join('')
      expect(blanks).toBe(maskedText(restored))
    }
  })

  it('draws one writing rule for every blank, and none for a word gap', () => {
    resetObjectCounter()
    // Classic is the level that prints phrases, so it is the one with gaps.
    const [page] = missingVowelsTemplate.generate({ ...base, level: 'classic' }, CTX())
    for (const row of rowGroups(page!.objects)) {
      const blanks = rowLetters(row).filter((obj) => obj.studioRole === 'answer')
      const rules = (row.objects ?? []).filter(
        (obj) => obj.type === 'rect' && obj.studioRole === 'structure',
      )
      expect(rules.length).toBe(blanks.length)
    }
  })

  it('gives every row a clue that never contains its own answer', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    for (const row of rowGroups(page!.objects)) {
      const clue = rowClue(row).trim()
      const answer = rowLetters(row)
        .map((obj) => String(obj.text))
        .join('')
      expect(clue.length).toBeGreaterThan(0)
      expect(clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS + 2)
      expect(clueGivesAnswerAway(clue, answer)).toBe(false)
    }
  })

  it('never prints the same answer or the same row of blanks twice', () => {
    for (const seed of [1, 42, 777, 20_260_922]) {
      resetObjectCounter()
      const [page] = missingVowelsTemplate.generate(
        { ...base, seed },
        CTX({ seed }),
      )
      const rows = rowGroups(page!.objects).map((row) =>
        rowLetters(row)
          .map((obj) => String(obj.text))
          .join(''),
      )
      expect(new Set(rows).size).toBe(rows.length)
      expect(new Set(rows.map(maskedText)).size).toBe(rows.length)
    }
  })
})

describe('missing-vowels solution page', () => {
  it('is the puzzle page with the vowels written into their own blanks', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)

    const puzzleRows = rowGroups(page!.objects)
    const keyRows = rowGroups(key)
    expect(keyRows.length).toBe(puzzleRows.length)

    for (let i = 0; i < keyRows.length; i++) {
      const puzzle = rowLetters(puzzleRows[i]!)
      const solved = rowLetters(keyRows[i]!)
      expect(solved.length).toBe(puzzle.length)
      for (let j = 0; j < solved.length; j++) {
        // Same letter, same slot — the key is the page, filled in.
        expect(String(solved[j]!.text)).toBe(String(puzzle[j]!.text))
        expect(solved[j]!.left).toBe(puzzle[j]!.left)
        expect(solved[j]!.visible).not.toBe(false)
      }
      expect(rowClue(keyRows[i]!)).toBe(rowClue(puzzleRows[i]!))
    }
  })

  it('reveals a hidden answer for every vowel on the page', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((obj) => obj.visible === false)).toBe(true)
    expect(answers.every((obj) => isVowel(String(obj.text)))).toBe(true)
    expect(missingVowelsTemplate.producesAnswerKey).toBe(true)
  })

  it('drops the instruction strip but keeps the clues', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX())
    const keyText = flatten(page!.answerSourceObjects!)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(keyText).not.toContain('Write the missing vowels')
    for (const row of rowGroups(page!.objects)) {
      expect(keyText).toContain(rowClue(row))
    }
  })
})

describe('missing-vowels page fitting', () => {
  it('stays inside the safe margin on every KDP trim and level', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of MISSING_VOWELS_LEVELS) {
        for (const showTitle of [false, true]) {
          const ctx = kdpCtx(wIn, hIn)
          resetObjectCounter()
          const pages = missingVowelsTemplate.generate(
            { ...base, level: level.id, showTitle, title: showTitle ? 'Game 1' : '' },
            ctx,
          )
          for (const page of pages) {
            assertObjectsInSafeMargin(page.objects, ctx)
            assertObjectsInSafeMargin(
              buildAnswerPage(page.answerSourceObjects ?? page.objects, STUDIO_ANSWER_INK_MONO),
              ctx,
            )
          }
        }
      }
    }
  })

  it('prints a real page at every level on the smallest trim it sells', () => {
    const ctx = kdpCtx(5, 8)
    for (const level of MISSING_VOWELS_LEVELS) {
      resetObjectCounter()
      const [page] = missingVowelsTemplate.generate({ ...base, level: level.id }, ctx)
      const rows = rowGroups(page!.objects)
      expect(rows.length, `${level.id} on 5 x 8`).toBeGreaterThanOrEqual(4)
    }
  })

  it('keeps blanks wide enough to write a letter in', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of MISSING_VOWELS_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const plan = missingVowelsWorstCasePlan({
          level,
          page: ctx,
          config: titled,
          instruction: MISSING_VOWELS_INSTRUCTION,
          font: 'PT Serif',
        })
        expect(plan, `${level.id} on ${wIn}x${hIn}`).not.toBeNull()
        expect(plan!.metrics.slotW).toBeGreaterThanOrEqual(SLOT_MIN_W)
      }
    }
  })

  it('uses both columns of a wide page at every level', () => {
    // A single column of long words down the left half of a US Letter sheet
    // wastes the page — the level bands are set so a second column fits.
    for (const level of MISSING_VOWELS_LEVELS) {
      const plan = missingVowelsWorstCasePlan({
        level,
        page: kdpCtx(8.5, 11),
        config: titled,
        instruction: MISSING_VOWELS_INSTRUCTION,
        font: 'PT Serif',
      })
      expect(plan!.columns, `${level.id} on 8.5 x 11`).toBe(2)
    }
  })

  it('holds every page of one run to the same shape and count', () => {
    const ctx = kdpCtx(6, 9)
    const counts = new Set<number>()
    const pitches = new Set<number>()
    for (let seed = 1; seed <= 8; seed++) {
      resetObjectCounter()
      const [page] = missingVowelsTemplate.generate(
        { ...base, seed },
        { ...ctx, seed },
      )
      const rows = rowGroups(page!.objects)
      counts.add(rows.length)
      pitches.add(Number(rowLetters(rows[0]!)[0]!.fontSize))
    }
    expect(counts.size, 'every page of one run holds the same count').toBe(1)
    expect(pitches.size, 'every page of one run sets at the same size').toBe(1)
  })

  it('never promises the form more puzzles than the page prints', () => {
    for (const [wIn, hIn] of KDP_TRIMS) {
      for (const level of MISSING_VOWELS_LEVELS) {
        const ctx = kdpCtx(wIn, hIn)
        const promised = missingVowelsWorstCasePlan({
          level,
          page: ctx,
          config: titled,
          instruction: MISSING_VOWELS_INSTRUCTION,
          font: 'PT Serif',
        })!
        resetObjectCounter()
        const [page] = missingVowelsTemplate.generate(
          { ...titled, level: level.id },
          ctx,
        )
        expect(rowGroups(page!.objects).length).toBe(promised.itemCount)
      }
    }
  })

  it('reports what the chosen trim will actually print', () => {
    const note = missingVowelsPrintNote({
      level: parseMissingVowelsLevel(titled),
      page: kdpCtx(8.5, 11),
      config: titled,
      instruction: MISSING_VOWELS_INSTRUCTION,
      font: 'PT Serif',
    })
    expect(note).toMatch(/\d+ puzzles a page/)
    expect(note).toMatch(/letters at \d+ pt/)
    expect(note).toContain('answer page')
  })
})

describe('missing-vowels content gates', () => {
  const level = MISSING_VOWELS_LEVELS.find((l) => l.id === 'classic')!

  it('rejects an answer whose blanks fit a second common word', () => {
    // C_L_ND_R is CALENDAR and COLANDER; the key can only be right about one.
    const index = buildVowelPatternIndexForTests(['CALENDAR', 'COLANDER', 'PICNIC'])
    expect(hasUniqueAnswerFill('CALENDAR', index)).toBe(false)
    expect(hasUniqueAnswerFill('PICNIC', index)).toBe(true)
    expect(vowelPattern('CALENDAR')).toBe('C.L.ND.R')
  })

  it('checks a phrase one word at a time', () => {
    const index = buildVowelPatternIndexForTests(['TIME', 'TOME', 'FREE', 'CLUB', 'BOOK'])
    expect(hasUniqueAnswerFill('FREE TIME', index)).toBe(false)
    expect(hasUniqueAnswerFill('BOOK CLUB', index)).toBe(true)
  })

  it('refuses rows with too few blanks or too little word left', () => {
    const pool = [
      { answer: 'RHYTHMS', clue: 'Beats in a piece of music' },
      { answer: 'PICNIC', clue: 'Lunch on a rug in the park' },
    ]
    const picked = selectAiItems(pool, { count: 2, level })
    expect(picked.map((item) => item.answer)).toEqual(['PICNIC'])
  })

  it('refuses a clue that carries its own answer', () => {
    expect(clueGivesAnswerAway('Where a gardener works', 'GARDENING')).toBe(true)
    expect(clueGivesAnswerAway('Where the roses grow', 'GARDENING')).toBe(false)
    expect(clueGivesAnswerAway('A club for readers', 'BOOK CLUB')).toBe(true)
  })

  it('drops a second row built off the same stem', () => {
    expect(isNearDuplicate('GARDEN', 'GARDENING')).toBe(true)
    expect(isNearDuplicate('READING', 'REUNION')).toBe(false)
    const picked = selectAiItems(
      [
        { answer: 'PAINTING', clue: 'Brush, easel and a quiet hour' },
        { answer: 'PAINT', clue: 'What the brush carries' },
        { answer: 'PICNIC', clue: 'Lunch on a rug in the park' },
      ],
      { count: 3, level },
    )
    expect(picked.map((item) => item.answer)).toEqual(['PAINTING', 'PICNIC'])
  })

  it('normalizes what the writer sent into what the page prints', () => {
    expect(normalizeAnswer(' road trip! ')).toBe('ROAD TRIP')
    expect(normalizeClue('  a quiet hour.  ')).toBe('A quiet hour')
    expect(maskedText('ROAD TRIP')).toBe('R__D TR_P')
    expect(letterToken('Road Trip')).toBe('ROADTRIP')
    expect(toSlots('AT ONE').filter((slot) => slot.gap).length).toBe(1)
  })

  it('holds every fixture row to the gate the page applies', () => {
    for (const item of remote.items) {
      const fits = MISSING_VOWELS_LEVELS.some((l) =>
        isValidMissingVowelsItem({ answer: item.answer, clue: item.clue }, l),
      )
      expect(fits, `${item.answer} — ${item.clue}`).toBe(true)
    }
  })

  it('probes the widest row a level can be handed', () => {
    for (const l of MISSING_VOWELS_LEVELS) {
      const [worst] = worstCaseItems(l, 3)
      expect(letterToken(worst!.answer).length).toBe(l.maxLetters)
      expect(worst!.answer.split(' ').length).toBe(l.maxWords)
      expect(worst!.clue.length).toBeLessThanOrEqual(MAX_CLUE_CHARS)
    }
  })
})

describe('missing-vowels form', () => {
  it('asks two questions and derives the rest from the page', () => {
    const keys = missingVowelsTemplate.configSchema.map((field) => field.key)
    expect(keys).toEqual(['theme', 'customTheme', 'level'])
    // Everything the old form asked about the page is gone.
    for (const dropped of ['itemCount', 'printStyle', 'difficulty', 'retirementCategory']) {
      expect(keys).not.toContain(dropped)
    }
  })

  it('defaults to a rotating theme and the everyday level', () => {
    const config = buildDefaultConfig(missingVowelsTemplate)
    expect(config.theme).toBe('mixed')
    expect(config.level).toBe('classic')
    expect(missingVowelsTemplate.defaultPageTitle).toBe(MISSING_VOWELS_DEFAULT_TITLE)
  })

  it('reads the levels a sheet was saved with before the ladder existed', () => {
    const legacy: Array<[unknown, MissingVowelsLevelId]> = [
      ['relaxed', 'gentle'],
      ['easy', 'gentle'],
      ['classic', 'classic'],
      ['challenge', 'challenging'],
      ['hard', 'challenging'],
    ]
    for (const [difficulty, expected] of legacy) {
      expect(parseMissingVowelsLevel({ difficulty }).id).toBe(expected)
    }
    expect(parseMissingVowelsLevel({}).id).toBe('classic')
  })

  it('only asks for a typed theme when the seller chose to type one', () => {
    expect(validateMissingVowelsConfig({ theme: 'mixed' })).toBeNull()
    expect(validateMissingVowelsConfig({ theme: 'custom', customTheme: '' })).toEqual({
      field: 'customTheme',
      message: 'Enter a theme for the words.',
    })
    expect(
      validateMissingVowelsConfig({ theme: 'custom', customTheme: 'canal weekends' }),
    ).toBeNull()
  })

  it('says so rather than printing a broken page when nothing usable came back', () => {
    resetObjectCounter()
    const [page] = missingVowelsTemplate.generate(base, CTX({ remoteData: { items: [] } }))
    const text = flatten(page!.objects)
      .map((obj) => String(obj.text ?? ''))
      .join(' ')
    expect(text).toContain('Could not write enough retirement words')
    expect(rowGroups(page!.objects).length).toBe(0)
  })
})
