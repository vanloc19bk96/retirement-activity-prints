import { describe, it, expect } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_INK_MUTED,
} from '@/constants/studio.constants'
import {
  calculateMarginGuide,
  parsePageSizeLabel,
  type PageSizeLabel,
} from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioConfigLayoutContext,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { resolveStudioMarginForPage } from '../studio-margin'
import { createRng } from '../studio-rng'
import {
  RETIREMENT_THEME_CUSTOM,
  RETIREMENT_THEME_MIXED,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { ALPHABET, buildCipher, cipherIsValid, decodeSaying, encodeLetter } from './cipher'
import { CRYPTOGRAM_CONFIG_SCHEMA, instructionFor, validateCryptogramConfig } from './config'
import {
  CRYPTOGRAM_AI_EMPTY_MESSAGE,
  CRYPTOGRAM_INSTRUCTION,
  CRYPTOGRAM_STARTER_NOTE,
  candidateCountFor,
  isValidSaying,
  letterCount,
  normalizeSaying,
  selectAiSayings,
  worstCaseSaying,
} from './content'
import { isNearDuplicateSaying, themeIpWarning } from './content-quality'
import { cryptogramTemplate } from './generate'
import { pickStarterLetters, revealedSlotCount } from './hints'
import { runCryptogramKdpPreflight } from './kdp-preflight'
import {
  SLOT_MIN_W,
  SLOT_MAX_W,
  cryptogramBodyField,
  cryptogramPrintNote,
  layoutSaying,
  planCryptogramPage,
  pxToPt,
  slotMetrics,
} from './layout'
import { CRYPTOGRAM_LEVELS, parseCryptogramLevel } from './levels'
import { CRYPTOGRAM_THEME_SALT } from './theme'

const MEDIUM_SAYINGS = [
  'FREE TIME IS BEST SPENT DOING WHAT YOU LOVE',
  'A QUIET GARDEN IS A FINE PLACE TO SIT AND DREAM',
  'SLOW MORNINGS AT HOME NOW FEEL LIKE A GIFT',
  'GOOD NEIGHBOURS TURN A STREET INTO A HOME',
  'EVERY SUNDAY CAN BE A SUNDAY NOW MY FRIEND',
  'PACK A FLASK AND WALK THE LONG WAY ROUND',
]

const SHORT_SAYINGS = [
  'FREE TIME FEELS BEST WITH FRIENDS',
  'A NEW CHAPTER BEGINS AT HOME',
  'GOOD MORNINGS MAKE THE DAY BRIGHT',
]

const LONG_SAYINGS = [
  'THE BEST YEARS BEGIN WHEN THE ALARM CLOCK FINALLY GOES QUIET',
  'LONG WALKS AND SLOW COFFEE FILL THE MORNINGS WITH SIMPLE JOY',
]

const remote = { items: MEDIUM_SAYINGS }
const CTX: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: remote }

const base: StudioConfig = {
  ...buildDefaultConfig(cryptogramTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

function layoutFor(label: PageSizeLabel): StudioConfigLayoutContext {
  const dims = parsePageSizeLabel(label)
  return {
    pageWidth: dims.widthPixels,
    pageHeight: dims.heightPixels,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth: dims.widthPixels,
      pageHeight: dims.heightPixels,
      marginGuide: calculateMarginGuide(100, false),
    }),
  }
}

function ctxFor(label: PageSizeLabel, items: string[]): StudioGenerateContext {
  return { ...STUDIO_TEST_CTX, ...layoutFor(label), remoteData: { items } }
}

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (list: StudioFabricObject[]) => {
    for (const obj of list) {
      out.push(obj)
      if (obj.objects) walk(obj.objects)
    }
  }
  walk(objects)
  return out
}

runGeneratorContractTests(cryptogramTemplate, {
  contextOverrides: { remoteData: remote },
})
assertGeneratorEntropy(cryptogramTemplate, {
  contextOverrides: { remoteData: remote },
})

describe('cryptogram cipher', () => {
  it('is a bijection with no letter standing for itself', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const cipher = buildCipher(createRng(seed))
      expect(cipherIsValid(cipher)).toBe(true)
      for (const letter of ALPHABET) {
        expect(cipher.get(letter)).not.toBe(letter)
      }
    }
  })

  it('decodes a coded saying back to the solution it was made from', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const cipher = buildCipher(createRng(seed))
      for (const plain of MEDIUM_SAYINGS) {
        const coded = [...plain]
          .map((ch) => (ch === ' ' ? ' ' : encodeLetter(ch, cipher)))
          .join('')
        expect(decodeSaying(coded, cipher)).toBe(plain)
      }
    }
  })
})

describe('cryptogram content', () => {
  it('normalizes to uppercase A–Z with single spaces', () => {
    expect(normalizeSaying("  Don't  count your chickens, yet! ")).toBe(
      'DON T COUNT YOUR CHICKENS YET',
    )
  })

  it('accepts only sayings inside the level letter bands', () => {
    expect(isValidSaying('NO WAY')).toBe(false)
    expect(isValidSaying('A'.repeat(90))).toBe(false)
    for (const saying of SHORT_SAYINGS) expect(isValidSaying(saying, 'short')).toBe(true)
    for (const saying of MEDIUM_SAYINGS) expect(isValidSaying(saying, 'medium')).toBe(true)
    for (const saying of LONG_SAYINGS) expect(isValidSaying(saying, 'long')).toBe(true)
    // Bands do not overlap end to end: a short line is not a long one.
    expect(isValidSaying(SHORT_SAYINGS[0]!, 'long')).toBe(false)
  })

  it('asks the writer for more sayings than the page needs', () => {
    for (const need of [1, 2, 3, 4, 5, 6]) {
      expect(candidateCountFor(need)).toBeGreaterThan(need)
    }
  })

  it('keeps the worst case printable for every level', () => {
    for (const level of CRYPTOGRAM_LEVELS) {
      const worst = worstCaseSaying(level.length)
      expect(isValidSaying(worst, level.length)).toBe(true)
    }
  })

  it('drops malformed, duplicate, near-duplicate and unsafe lines', () => {
    const picked = selectAiSayings(
      [
        'TOO SHORT',
        MEDIUM_SAYINGS[0],
        MEDIUM_SAYINGS[0],
        'FREE TIME IS BEST SPENT DOING WHAT YOU ENJOY',
        'PREVENT DEMENTIA WITH A DAILY WALK AROUND TOWN',
        MEDIUM_SAYINGS[1],
      ],
      { count: 2, length: 'medium' },
    )
    expect(picked).toEqual([MEDIUM_SAYINGS[0], MEDIUM_SAYINGS[1]])
  })

  it('treats a reordered saying as a duplicate', () => {
    expect(
      isNearDuplicateSaying(
        'QUIET MORNINGS ARE THE BEST PART OF RETIREMENT',
        'THE BEST PART OF RETIREMENT IS QUIET MORNINGS',
      ),
    ).toBe(true)
    expect(isNearDuplicateSaying(MEDIUM_SAYINGS[0]!, MEDIUM_SAYINGS[1]!)).toBe(false)
  })

  it('warns on third-party IP in a custom theme', () => {
    expect(themeIpWarning('Disney Retirement')).toMatch(/intellectual property/i)
    expect(themeIpWarning('Travel Dreams')).toBeNull()
  })
})

describe('cryptogram levels and theme', () => {
  it('asks two questions and keeps the old knobs off the form', () => {
    const keys = CRYPTOGRAM_CONFIG_SCHEMA.map((field) => field.key)
    expect(keys).toEqual(['theme', 'customTheme', 'level'])
    for (const dropped of [
      'writeOwnTheme',
      'retirementCategory',
      'presetThemeId',
      'length',
      'printStyle',
      'puzzleCount',
    ]) {
      expect(keys).not.toContain(dropped)
    }
  })

  it('defaults to mixed themes at the classic level', () => {
    const defaults = buildDefaultConfig(cryptogramTemplate)
    expect(defaults.theme).toBe(RETIREMENT_THEME_MIXED)
    expect(defaults.level).toBe('classic')
    expect(parseCryptogramLevel(defaults).length).toBe('medium')
  })

  it('migrates a sheet saved against the old length field', () => {
    expect(parseCryptogramLevel({ length: 'short' }).id).toBe('gentle')
    expect(parseCryptogramLevel({ length: 'medium' }).id).toBe('classic')
    expect(parseCryptogramLevel({ length: 'long' }).id).toBe('challenging')
    // An explicit level always wins over the legacy field.
    expect(parseCryptogramLevel({ length: 'long', level: 'gentle' }).id).toBe('gentle')
  })

  it('migrates a sheet saved against the old theme fields', () => {
    const legacy = { writeOwnTheme: true, customTheme: 'Weekends in the garden' }
    expect(resolveRetirementTheme(legacy, 1, CRYPTOGRAM_THEME_SALT).prompt).toBe(
      'Weekends in the garden',
    )
    const preset = { presetThemeId: 'gardening', retirementCategory: 'hobbies-leisure' }
    expect(resolveRetirementTheme(preset, 1, CRYPTOGRAM_THEME_SALT).label).toBe('Gardening')
  })

  it('rotates a different theme per page when mixed', () => {
    const labels = new Set(
      Array.from({ length: 24 }, (_, i) =>
        resolveRetirementTheme({ theme: RETIREMENT_THEME_MIXED }, 1_000 + i * 7_919, CRYPTOGRAM_THEME_SALT)
          .label,
      ),
    )
    expect(labels.size).toBeGreaterThan(5)
  })

  it('requires theme text only when the seller writes their own', () => {
    expect(validateCryptogramConfig({ theme: RETIREMENT_THEME_MIXED })).toBeNull()
    expect(
      validateCryptogramConfig({ theme: RETIREMENT_THEME_CUSTOM, customTheme: '  ' }),
    ).toMatchObject({ field: 'customTheme' })
    expect(
      validateCryptogramConfig({
        theme: RETIREMENT_THEME_CUSTOM,
        customTheme: 'Weekends in the garden',
      }),
    ).toBeNull()
    expect(
      validateCryptogramConfig({
        theme: RETIREMENT_THEME_CUSTOM,
        customTheme: 'x'.repeat(200),
      }),
    ).toMatchObject({ field: 'customTheme' })
  })
})

describe('cryptogram starter letters', () => {
  it('reveals whole letters, never single slots', () => {
    const starters = pickStarterLetters(MEDIUM_SAYINGS[0]!, 3)
    expect(starters.size).toBeGreaterThan(0)
    for (const letter of starters) {
      expect(MEDIUM_SAYINGS[0]!).toContain(letter)
    }
  })

  it('never gives away more than 40% of a saying', () => {
    for (const saying of [...SHORT_SAYINGS, ...MEDIUM_SAYINGS, ...LONG_SAYINGS]) {
      for (const want of [1, 3, 8]) {
        const starters = pickStarterLetters(saying, want)
        const revealed = revealedSlotCount(saying, starters)
        expect(revealed).toBeLessThanOrEqual(Math.floor(letterCount(saying) * 0.4))
      }
    }
  })

  it('gives nothing away at the challenging level', () => {
    expect(pickStarterLetters(LONG_SAYINGS[0]!, 0).size).toBe(0)
  })

  it('picks the same starters for the same saying every time', () => {
    expect([...pickStarterLetters(MEDIUM_SAYINGS[1]!, 3)]).toEqual([
      ...pickStarterLetters(MEDIUM_SAYINGS[1]!, 3),
    ])
  })
})

describe('cryptogram layout', () => {
  it('keeps every word whole or refuses the pitch', () => {
    const metrics = slotMetrics(SLOT_MIN_W)
    const words = MEDIUM_SAYINGS[0]!.split(' ')
    const wide = layoutSaying(words, 420, metrics)
    expect(wide).not.toBeNull()
    expect(wide!.lines.flat()).toEqual(words)
    expect(layoutSaying(words, 40, metrics)).toBeNull()
  })

  it('never plans a stack taller than the body or narrower than the writing floor', () => {
    for (const label of ['5 x 8 in', '6 x 9 in', '8.5 x 11 in'] as PageSizeLabel[]) {
      for (const level of CRYPTOGRAM_LEVELS) {
        const page = layoutFor(label)
        const config = { ...base, level: level.id, showTitle: true, title: 'Game 1' }
        const field = cryptogramBodyField(page, config, instructionFor(config))
        const plan = planCryptogramPage({
          field,
          sayings: Array.from({ length: level.targetPuzzles }, () =>
            worstCaseSaying(level.length),
          ),
          target: level.targetPuzzles,
        })
        expect(plan, `${label} ${level.id}`).not.toBeNull()
        expect(plan!.metrics.slotW).toBeGreaterThanOrEqual(SLOT_MIN_W)
        expect(plan!.metrics.slotW).toBeLessThanOrEqual(SLOT_MAX_W)
        expect(plan!.puzzleCount).toBeLessThanOrEqual(level.targetPuzzles)

        const stack =
          plan!.layouts.reduce((sum, layout) => sum + layout.height, 0) +
          plan!.metrics.bandGutter * (plan!.puzzleCount - 1)
        expect(stack).toBeLessThanOrEqual(field.height)
      }
    }
  })

  it('keeps every level at large-print size on a KDP paperback trim', () => {
    for (const label of ['5 x 8 in', '6 x 9 in', '8.5 x 11 in'] as PageSizeLabel[]) {
      for (const level of CRYPTOGRAM_LEVELS) {
        const page = layoutFor(label)
        const config = { ...base, level: level.id, showTitle: true, title: 'Game 1' }
        const field = cryptogramBodyField(page, config, instructionFor(config))
        const plan = planCryptogramPage({
          field,
          sayings: Array.from({ length: level.targetPuzzles }, () =>
            worstCaseSaying(level.length),
          ),
          target: level.targetPuzzles,
        })
        expect(pxToPt(plan!.metrics.codeFont), `${label} ${level.id}`).toBeGreaterThanOrEqual(13)
      }
    }
  })
})

describe('cryptogram page', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('cryptogram')).toBe(true)
  })

  it('auto-adds a solution page with no form toggles', () => {
    expect(cryptogramTemplate.producesAnswerKey).toBe(true)
    const keys = new Set(getStudioTemplate('cryptogram')!.configSchema.map((f) => f.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('hides one answer per unrevealed letter and prints the starters', () => {
    resetObjectCounter()
    const items = [MEDIUM_SAYINGS[0]!]
    const [page] = cryptogramTemplate.generate(
      { ...base, level: 'classic' },
      { ...STUDIO_TEST_CTX, remoteData: { items } },
    )
    const starters = pickStarterLetters(items[0]!, 1)
    const revealed = revealedSlotCount(items[0]!, starters)
    const hidden = harvestAnswers(page!.objects)

    expect(revealed).toBeGreaterThan(0)
    expect(hidden.length).toBe(letterCount(items[0]!) - revealed)
    expect(hidden.every((o) => o.visible === false)).toBe(true)

    // Every printed starter is one of the chosen letters, and every slot has a code.
    const printed = flatten(page!.objects).filter(
      (o) => o.studioRole === 'prompt' && typeof o.text === 'string',
    )
    expect(printed.length).toBe(letterCount(items[0]!) + revealed)
  })

  it('prints the solution as a filled slot grid', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, CTX)
    const key = buildAnswerPage(page!.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
    const answers = harvestAnswers(key)

    expect(answers.every((o) => o.visible !== false)).toBe(true)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(answers.every((o) => o.fontWeight === 'normal')).toBe(true)
    expect(answers.every((o) => /^[A-Z]$/.test(String(o.text ?? '')))).toBe(true)

    const puzzleGroups = page!.objects.filter((o) => o.type === 'group')
    const keyGroups = key.filter((o) => o.type === 'group')
    expect(keyGroups.length).toBe(puzzleGroups.length)

    keyGroups.forEach((group, index) => {
      const children = flatten([group])
      expect(children.some((o) => o.type === 'rect')).toBe(true)
      const codes = children.filter(
        (o) => o.studioRole === 'prompt' && /^[A-Z]$/.test(String(o.text ?? '')),
      )
      expect(codes.length).toBe(letterCount(MEDIUM_SAYINGS[index]!))
      expect(codes.every((o) => o.fill === STUDIO_INK_MUTED)).toBe(true)
      expect(codes.every((o) => o.fontWeight === 'normal')).toBe(true)
      expect(codes.every((o) => o.fontFamily === base.fontFamily)).toBe(true)

      const solved = harvestAnswers([group])
        .map((o) => String(o.text ?? ''))
        .join('')
      expect(solved).toBe(MEDIUM_SAYINGS[index]!.replace(/ /g, ''))
    })

    const puzzleCodes = flatten(puzzleGroups).filter(
      (o) => o.studioRole === 'prompt' && o.fontFamily === STUDIO_DIGIT_FONT,
    )
    expect(puzzleCodes.length).toBeGreaterThan(0)
    expect(puzzleCodes.every((o) => o.fill === STUDIO_INK)).toBe(true)
  })

  it('prints the sayings the page actually encoded', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, CTX)
    const groups = page!.objects.filter((o) => o.type === 'group')
    const solutionGroups = (page!.answerSourceObjects ?? []).filter((o) => o.type === 'group')

    expect(solutionGroups.length).toBe(groups.length)
    groups.forEach((group, index) => {
      const letters = flatten([group])
        .filter((o) => o.studioRole === 'answer' || o.studioRole === 'prompt')
        .filter((o) => typeof o.text === 'string')
      expect(letters.length).toBeGreaterThan(0)

      const solved = harvestAnswers([solutionGroups[index]!])
        .map((o) => String(o.text ?? ''))
        .join('')
      expect(solved).toBe(MEDIUM_SAYINGS[index]!.replace(/ /g, ''))
    })
  })

  it('keeps the written letter, the rule and the code clear of each other', () => {
    // Everything a solver reads sits in one row: what they write on top, the
    // rule they write on, the code underneath. The row is tuned tightly enough
    // that the three bands have to be checked against what Fabric will render,
    // not against the ratios they were laid out from.
    for (const label of ['5 x 8 in', '8.5 x 11 in'] as PageSizeLabel[]) {
      resetObjectCounter()
      const [page] = cryptogramTemplate.generate(
        { ...base, level: 'gentle', showTitle: true, title: 'Game 1' },
        ctxFor(label, SHORT_SAYINGS),
      )
      const group = page!.objects.find((o) => o.type === 'group')!
      const rows = new Map<number, StudioFabricObject[]>()
      for (const child of group.objects ?? []) {
        // Group children are relative to the group centre; bucket by row.
        const key = Math.round((child.top + (child.height ?? 0) / 2) / 10)
        rows.set(key, [...(rows.get(key) ?? []), child])
      }
      expect(rows.size).toBeGreaterThan(0)

      for (const child of group.objects ?? []) {
        if (child.type !== 'rect') continue
        const ruleY = child.top
        const sameColumn = (group.objects ?? []).filter(
          (o) => o.type === 'textbox' && Math.abs(o.left - (child.left + (child.width ?? 0) / 2)) < 2,
        )
        for (const text of sameColumn) {
          const size = text.fontSize ?? 0
          const top = text.top - size / 2
          const bottom = text.top + size / 2
          const above = bottom <= ruleY
          const below = top >= ruleY
          expect(above || below, `${label}: glyph overlaps its own rule`).toBe(true)
        }
      }
    }
  })

  it('numbers puzzles only when there is more than one', () => {
    resetObjectCounter()
    const [single] = cryptogramTemplate.generate(
      { ...base, level: 'challenging' },
      ctxFor('5 x 8 in', LONG_SAYINGS),
    )
    const singleGroups = single!.objects.filter((o) => o.type === 'group')
    const indexes = flatten(single!.objects).filter((o) =>
      /^\d+\.$/.test(String(o.text ?? '')),
    )
    expect(indexes.length).toBe(singleGroups.length > 1 ? singleGroups.length : 0)
  })

  it('keeps both pages inside the safe margin on every KDP trim', () => {
    for (const label of [
      '5 x 8 in',
      '5.5 x 8.5 in',
      '6 x 9 in',
      '7.5 x 9.25 in',
      '8.5 x 11 in',
    ] as PageSizeLabel[]) {
      for (const level of CRYPTOGRAM_LEVELS) {
        const items =
          level.length === 'short'
            ? SHORT_SAYINGS
            : level.length === 'long'
              ? LONG_SAYINGS
              : MEDIUM_SAYINGS
        const ctx = ctxFor(label, items)
        for (const showTitle of [false, true]) {
          resetObjectCounter()
          const pages = cryptogramTemplate.generate(
            {
              ...base,
              level: level.id,
              showTitle,
              title: showTitle ? 'Game 1' : '',
            },
            ctx,
          )
          for (const page of pages) {
            assertObjectsInSafeMargin(page.objects, ctx)
            if (page.answerSourceObjects) {
              assertObjectsInSafeMargin(page.answerSourceObjects, ctx)
            }
          }
        }
      }
    }
  })

  it('prints the number of puzzles its own help note promises', () => {
    for (const label of ['5 x 8 in', '6 x 9 in', '8.5 x 11 in'] as PageSizeLabel[]) {
      for (const level of CRYPTOGRAM_LEVELS) {
        const items =
          level.length === 'short'
            ? SHORT_SAYINGS
            : level.length === 'long'
              ? LONG_SAYINGS
              : MEDIUM_SAYINGS
        const config = { ...base, level: level.id, showTitle: true, title: 'Game 1' }
        const note = cryptogramPrintNote(
          parseCryptogramLevel(config),
          layoutFor(label),
          config,
          instructionFor(config),
        )
        const promised = Number(/^(\d+) saying/.exec(note)?.[1] ?? 0)
        expect(promised, `${label} ${level.id}: ${note}`).toBeGreaterThan(0)

        resetObjectCounter()
        const [page] = cryptogramTemplate.generate(config, ctxFor(label, items))
        const printed = page!.objects.filter((o) => o.type === 'group').length
        // The note measures the worst case; real sayings may be shorter, never
        // longer, so the page can match the promise but must not fall short of
        // what the sayings allow.
        expect(printed, `${label} ${level.id}`).toBe(Math.min(promised, items.length))
      }
    }
  })

  it('adds the starter note to the instruction only when letters are given', () => {
    const gentle = instructionFor({ ...base, level: 'gentle' })
    const challenging = instructionFor({ ...base, level: 'challenging' })
    expect(gentle).toContain(CRYPTOGRAM_INSTRUCTION)
    expect(gentle).toContain(CRYPTOGRAM_STARTER_NOTE)
    expect(challenging).toBe(CRYPTOGRAM_INSTRUCTION)
    expect(instructionFor({ ...base, showInstructions: false })).toBe('')
  })

  it('titles a blank heading with the theme it was written for', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(
      { ...base, theme: 'gardening', showTitle: true, title: '' },
      CTX,
    )
    const json = JSON.stringify(page).replace(/ /g, ' ')
    expect(json).toContain('Gardening')
  })

  it('prints no heading at all when the page title is turned off', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(
      { ...base, theme: 'gardening', showTitle: false, title: '' },
      CTX,
    )
    const json = JSON.stringify(page).replace(/ /g, ' ')
    expect(json).not.toContain('Gardening')
  })

  it('shows a visible error when the writer returned nothing', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, STUDIO_TEST_CTX)
    expect(JSON.stringify(page)).toContain(CRYPTOGRAM_AI_EMPTY_MESSAGE)
  })

  it('does not print a tracking strip under the puzzles', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, CTX)
    expect(flatten(page!.objects).filter((o) => o.studioRole === 'key').length).toBe(0)
  })
})

describe('cryptogram preflight', () => {
  const metrics = slotMetrics(SLOT_MIN_W)
  const puzzle = (plain: string, seed: number) => ({
    plain,
    cipher: buildCipher(createRng(seed)),
    starters: pickStarterLetters(plain, 1),
  })

  it('passes a sound page', () => {
    const result = runCryptogramKdpPreflight({
      puzzles: [puzzle(MEDIUM_SAYINGS[0]!, 1), puzzle(MEDIUM_SAYINGS[1]!, 2)],
      length: 'medium',
      metrics,
    })
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('refuses a duplicated saying, a broken cipher and a cramped slot', () => {
    expect(
      runCryptogramKdpPreflight({
        puzzles: [puzzle(MEDIUM_SAYINGS[0]!, 1), puzzle(MEDIUM_SAYINGS[0]!, 2)],
        length: 'medium',
        metrics,
      }).ok,
    ).toBe(false)

    const selfMapped = new Map(buildCipher(createRng(3)))
    selfMapped.set('A', 'A')
    expect(
      runCryptogramKdpPreflight({
        puzzles: [{ plain: MEDIUM_SAYINGS[0]!, cipher: selfMapped, starters: new Set() }],
        length: 'medium',
        metrics,
      }).ok,
    ).toBe(false)

    expect(
      runCryptogramKdpPreflight({
        puzzles: [puzzle(MEDIUM_SAYINGS[0]!, 1)],
        length: 'medium',
        metrics: slotMetrics(SLOT_MIN_W - 4),
      }).ok,
    ).toBe(false)
  })

  it('refuses a saying that is mostly filled in', () => {
    const plain = MEDIUM_SAYINGS[0]!
    const everyLetter = new Set(plain.replace(/ /g, ''))
    expect(
      runCryptogramKdpPreflight({
        puzzles: [{ plain, cipher: buildCipher(createRng(1)), starters: everyLetter }],
        length: 'medium',
        metrics,
      }).ok,
    ).toBe(false)
  })
})
