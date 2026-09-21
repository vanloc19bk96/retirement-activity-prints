import { describe, it, expect } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import {
  calculateMarginGuide,
  parsePageSizeLabel,
  type PageSizeLabel,
} from '@/types/canvas-settings.types'
import type { StudioConfig, StudioFabricObject } from '@/types/studio-template.types'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import { resolveStudioMarginForPage } from '../studio-margin'
import { createRng } from '../studio-rng'
import { ALPHABET, buildCipher } from './cipher'
import { resolvePuzzleCountMax } from './config'
import {
  CRYPTOGRAM_AI_EMPTY_MESSAGE,
  CRYPTOGRAM_DEFAULT_TITLE,
  CRYPTOGRAM_INSTRUCTION,
  MAX_PUZZLES,
  candidateCountFor,
  isValidSaying,
  minSlotFont,
  normalizeSaying,
  puzzleCountFor,
  selectAiSayings,
  worstCaseSaying,
} from './content'
import { themeIpWarning } from './content-quality'
import { cryptogramTemplate, validateCryptogramConfig } from './generate'
import { layoutCryptogram } from './layout'

const AI_SAYINGS = [
  'FREE TIME IS BEST SPENT DOING WHAT YOU LOVE',
  'GOOD FRIENDS MAKE EVERY RETIREMENT DAY FEEL LIGHT',
  'A QUIET GARDEN IS A FINE PLACE TO SIT AND DREAM',
  'SLOW MORNINGS AT HOME FEEL LIKE A GIFT NOW',
  'GARDEN DAYS AND QUIET HOBBIES FILL THE HOURS',
  'FRIENDSHIP THAT LASTED PAST THE JOB STILL SHINES',
]

const SHORT_SAYINGS = [
  'FREE TIME FEELS BEST WITH FRIENDS',
  'A NEW CHAPTER BEGINS AT HOME NOW',
  'GOOD FRIENDS MAKE THE DAY BRIGHT',
]

const remote = { items: AI_SAYINGS }
const CTX = { ...STUDIO_TEST_CTX, remoteData: remote }

function layoutFor(label: PageSizeLabel) {
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

const base: StudioConfig = {
  ...buildDefaultConfig(cryptogramTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
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
      expect(cipher.size).toBe(26)
      expect(new Set(cipher.values()).size).toBe(26)
      for (const letter of ALPHABET) {
        expect(cipher.get(letter)).not.toBe(letter)
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

  it('rejects sayings outside the printable retirement ranges', () => {
    expect(isValidSaying('NO WAY')).toBe(false)
    expect(isValidSaying('A'.repeat(90))).toBe(false)
    expect(isValidSaying(AI_SAYINGS[0]!, 'medium')).toBe(true)
    expect(isValidSaying(SHORT_SAYINGS[0]!, 'short')).toBe(true)
  })

  it('caps puzzles per page by what the trim can actually hold', () => {
    expect(puzzleCountFor({ length: 'medium', puzzleCount: 5 })).toBe(5)
    expect(puzzleCountFor({ length: 'long', puzzleCount: 6 })).toBe(6)
    expect(candidateCountFor(1)).toBe(5)
    expect(candidateCountFor(3)).toBe(10)
    expect(candidateCountFor(5)).toBe(14)
    for (const length of ['short', 'medium', 'long'] as const) {
      expect(isValidSaying(worstCaseSaying(length), length)).toBe(true)
    }

    const titled = {
      ...base,
      length: 'medium',
      printStyle: 'large-print',
      showTitle: true,
      title: CRYPTOGRAM_DEFAULT_TITLE,
    }
    const letterMax = resolvePuzzleCountMax(titled, layoutFor('8.5 x 11 in'))
    const defaultTrimMax = resolvePuzzleCountMax(titled, layoutFor('7.5 x 9.25 in'))
    expect(letterMax).toBeGreaterThan(3)
    expect(letterMax).toBeLessThanOrEqual(MAX_PUZZLES)
    expect(defaultTrimMax).toBeGreaterThan(3)
    expect(defaultTrimMax).toBeLessThanOrEqual(MAX_PUZZLES)
    expect(resolvePuzzleCountMax(titled)).toBe(MAX_PUZZLES)

    const field = cryptogramTemplate.configSchema.find((f) => f.key === 'puzzleCount')
    expect(field?.maxWhen?.(titled, layoutFor('8.5 x 11 in'))).toBe(letterMax)
  })

  it('requires custom theme text when Write my own theme is on', () => {
    expect(
      validateCryptogramConfig({ writeOwnTheme: true, customTheme: '   ' }),
    ).toMatchObject({ field: 'customTheme' })
    expect(
      validateCryptogramConfig({
        writeOwnTheme: true,
        customTheme: 'Retirement by the Sea',
      }),
    ).toBeNull()
    expect(validateCryptogramConfig({ writeOwnTheme: false })).toBeNull()
  })

  it('warns on third-party IP in a custom theme', () => {
    expect(themeIpWarning('Disney Retirement')).toMatch(/intellectual property/i)
    expect(themeIpWarning('Travel Dreams')).toBeNull()
  })

  it('drops short, duplicate, and unsafe AI lines', () => {
    const quotes = selectAiSayings(
      ['TOO SHORT', AI_SAYINGS[0], AI_SAYINGS[0], 'PREVENT DEMENTIA WITH A DAILY WALK TODAY'],
      { count: 2, length: 'medium' },
    )
    expect(quotes).toEqual([AI_SAYINGS[0]])
  })
})

describe('cryptogram layout', () => {
  it('keeps every word whole and never shrinks below the Large Print minimum', () => {
    const words = 'THE GRASS IS ALWAYS GREENER ON THE OTHER SIDE'.split(' ')
    const layout = layoutCryptogram({
      words,
      bandWidth: 400,
      bandHeight: 160,
      slotEm: 1.15,
      minFont: 14,
      maxFont: 20,
    })
    expect(layout).not.toBeNull()
    expect(layout!.fontSize).toBeGreaterThanOrEqual(14)
    expect(layout!.height).toBeLessThanOrEqual(160)
    expect(layout!.lines.flat()).toEqual(words)
  })

  it('returns null rather than shrinking below minFont', () => {
    const layout = layoutCryptogram({
      words: 'FREE TIME IS BEST SPENT DOING WHAT YOU LOVE'.split(' '),
      bandWidth: 80,
      bandHeight: 20,
      slotEm: 1.15,
      minFont: 14,
      maxFont: 20,
    })
    expect(layout).toBeNull()
  })
})

describe('cryptogram', () => {
  it('defaults to retirement category, medium, and large-print', () => {
    const defaults = buildDefaultConfig(cryptogramTemplate)
    expect(defaults.writeOwnTheme).toBe(false)
    expect(defaults.retirementCategory).toBe('retirement-life')
    expect(defaults.presetThemeId).toBe('life-after-work')
    expect(defaults.length).toBe('medium')
    expect(defaults.printStyle).toBe('large-print')
    expect(defaults.puzzleCount).toBe(2)
    expect(cryptogramTemplate.defaultPageTitle).toBe(CRYPTOGRAM_DEFAULT_TITLE)
    expect(minSlotFont('large-print')).toBe(14)
    expect(minSlotFont('standard')).toBe(11)
  })

  it('drops custom-sayings fields', () => {
    const keys = cryptogramTemplate.configSchema.map((f) => f.key)
    expect(keys).not.toContain('source')
    expect(keys).not.toContain('quotes')
    expect(keys).not.toContain('theme')
    expect(keys).toContain('retirementCategory')
    expect(keys).toContain('presetThemeId')
    expect(keys).toContain('printStyle')
  })

  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('cryptogram')).toBe(true)
  })

  it('hides one answer per letter on the puzzle page', () => {
    resetObjectCounter()
    const items = [AI_SAYINGS[0]!]
    const [page] = cryptogramTemplate.generate(
      { ...base, puzzleCount: 1 },
      { ...STUDIO_TEST_CTX, remoteData: { items } },
    )
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(items[0]!.replace(/ /g, '').length)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('reveals answers in black on the key', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, CTX)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible !== false)).toBe(true)
    expect(answers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
  })

  it('groups each puzzle and keeps groups inside the body', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate({ ...base, puzzleCount: 2 }, CTX)
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
    expect(groups.every((g) => (g.objects?.length ?? 0) > 0)).toBe(true)
  })

  it('centers the solution puzzles in the answer-key body', () => {
    resetObjectCounter()
    const config = { ...base, puzzleCount: 2, showTitle: true, title: CRYPTOGRAM_DEFAULT_TITLE }
    const [page] = cryptogramTemplate.generate(config, CTX)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const groups = keyObjects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)

    const left = Math.min(...groups.map((g) => g.left ?? 0))
    const top = Math.min(...groups.map((g) => g.top ?? 0))
    const right = Math.max(...groups.map((g) => (g.left ?? 0) + (g.width ?? 0)))
    const bottom = Math.max(...groups.map((g) => (g.top ?? 0) + (g.height ?? 0)))
    const field = drawHeader(
      insetHorizontal(contentBox(STUDIO_TEST_CTX), STUDIO_CONTENT_SAFE_INSET_X),
      config,
      {
        templateKey: 'cryptogram',
        instanceId: STUDIO_TEST_CTX.instanceId,
        pageRole: 'single',
      },
      '',
    ).body
    expect(Math.abs((left + right) / 2 - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs((top + bottom) / 2 - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('keeps three short Large Print puzzles inside the safe margin', () => {
    resetObjectCounter()
    const pages = cryptogramTemplate.generate(
      {
        ...base,
        puzzleCount: 3,
        length: 'short',
        printStyle: 'large-print',
        showTitle: true,
        title: CRYPTOGRAM_DEFAULT_TITLE,
      },
      { ...STUDIO_TEST_CTX, remoteData: { items: SHORT_SAYINGS } },
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, STUDIO_TEST_CTX)
      if (page.answerSourceObjects) {
        assertObjectsInSafeMargin(page.answerSourceObjects, STUDIO_TEST_CTX)
      }
    }
  })

  it('prints the layout max of medium Large Print puzzles on letter', () => {
    resetObjectCounter()
    const layout = layoutFor('8.5 x 11 in')
    const ctx = {
      ...STUDIO_TEST_CTX,
      ...layout,
      remoteData: { items: AI_SAYINGS },
    }
    const config = {
      ...base,
      length: 'medium',
      printStyle: 'large-print',
      showTitle: true,
      title: CRYPTOGRAM_DEFAULT_TITLE,
    }
    const max = resolvePuzzleCountMax(config, layout)
    expect(max).toBeGreaterThan(3)
    const [page] = cryptogramTemplate.generate({ ...config, puzzleCount: max }, ctx)
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(max)
    assertObjectsInSafeMargin(page!.objects, ctx)
  })

  it('shows a visible error when remoteData is missing (no bundled fallback)', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, STUDIO_TEST_CTX)
    expect(JSON.stringify(page)).toMatch(/Unable to create enough high-quality retirement sayings/i)
    expect(JSON.stringify(page)).toContain(CRYPTOGRAM_AI_EMPTY_MESSAGE)
  })

  it('uses the shorter instruction and default title', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(
      { ...base, showTitle: true, title: '' },
      CTX,
    )
    const json = JSON.stringify(page).replace(/\u00a0/g, ' ')
    expect(json).toContain(CRYPTOGRAM_INSTRUCTION)
    expect(json).toContain(CRYPTOGRAM_DEFAULT_TITLE)
    expect(json).not.toMatch(/memory training|cognitive/i)
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(cryptogramTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('cryptogram')
    const keys = new Set(registered!.configSchema.map((f) => f.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('does not print a tracking strip under puzzles', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate({ ...base, puzzleCount: 2 }, CTX)
    const flat: StudioFabricObject[] = []
    const walk = (objs: StudioFabricObject[]) => {
      for (const o of objs) {
        flat.push(o)
        if (o.objects) walk(o.objects)
      }
    }
    walk(page!.objects)
    expect(flat.filter((o) => o.studioRole === 'key').length).toBe(0)
  })
})
