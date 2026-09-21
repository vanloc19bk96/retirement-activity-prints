import { describe, it, expect } from 'vitest'
import { cryptogramTemplate, validateCryptogramConfig } from './generate'
import { ALPHABET, buildCipher } from './cipher'
import {
  puzzleCountFor,
  resolveAiQuotes,
  resolveQuotes,
  sanitizeQuotes,
  themeQuoteCount,
} from './content'
import { layoutCryptogram } from './layout'
import { createRng } from '../studio-rng'
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
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type { StudioConfig, StudioFabricObject } from '@/types/studio-template.types'

const base: StudioConfig = {
  ...buildDefaultConfig(cryptogramTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

const SIGNAL = new AbortController().signal

runGeneratorContractTests(cryptogramTemplate)
assertGeneratorEntropy(cryptogramTemplate)

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
  it('strips everything except A–Z and single spaces', () => {
    expect(sanitizeQuotes(['  Don\'t  count your chickens, yet! '])).toEqual([
      'DON T COUNT YOUR CHICKENS YET',
    ])
  })

  it('rejects sayings that are too short or too long to set', () => {
    expect(sanitizeQuotes(['NO WAY'])).toEqual([])
    expect(sanitizeQuotes(['A'.repeat(90)])).toEqual([])
  })

  it('holds enough sayings for a full-length book', () => {
    for (const key of ['proverbs', 'wisdom', 'everyday', 'nature', 'kindness']) {
      expect(themeQuoteCount(key)).toBeGreaterThanOrEqual(45)
    }
    expect(themeQuoteCount('mixed')).toBeGreaterThanOrEqual(300)
  })

  it('never repeats a saying within one page', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const quotes = resolveQuotes({ theme: 'mixed' }, 3, createRng(seed))
      expect(quotes.length).toBe(3)
      expect(new Set(quotes).size).toBe(3)
    }
  })

  it('keeps own sayings in typed order and does not pad or shuffle', () => {
    const lines = [
      'KNOWLEDGE IS POWER',
      'PRACTICE MAKES PERFECT',
      'A KIND WORD GOES A LONG WAY',
    ]
    const quotes = resolveQuotes(
      { source: 'custom', quotes: lines, puzzleCount: 2 },
      puzzleCountFor({ source: 'custom', quotes: lines, puzzleCount: 2 }),
      createRng(3),
    )
    expect(quotes).toEqual(lines)
  })

  it('counts one puzzle per own saying, ignoring puzzles-per-page', () => {
    const quotes = [
      'KNOWLEDGE IS POWER',
      'PRACTICE MAKES PERFECT',
      'A KIND WORD GOES A LONG WAY',
    ]
    expect(puzzleCountFor({ source: 'custom', quotes, puzzleCount: 2 })).toBe(3)
    expect(puzzleCountFor({ source: 'custom', quotes: quotes.slice(0, 1), puzzleCount: 4 })).toBe(1)
    expect(
      puzzleCountFor({
        source: 'custom',
        quotes: [
          ...quotes,
          'THE EARLY BIRD CATCHES THE WORM',
          'BETTER LATE THAN NEVER',
        ],
        puzzleCount: 1,
      }),
    ).toBe(4)
    expect(puzzleCountFor({ source: 'theme', puzzleCount: 3 })).toBe(3)
  })

  it('blocks generation when custom content is unusable', () => {
    expect(validateCryptogramConfig({ source: 'custom', quotes: ['HI'] })).toEqual({
      field: 'quotes',
      message: 'Enter at least one saying of 12\u201378 letters (A\u2013Z only).',
    })
    expect(validateCryptogramConfig({ source: 'theme' })).toBeNull()
  })

  it('blocks generation when custom sayings exceed the page limit', () => {
    const five = [
      'PRACTICE MAKES PERFECT',
      'KNOWLEDGE IS POWER',
      'A KIND WORD GOES A LONG WAY',
      'BETTER LATE THAN NEVER',
      'ACTIONS SPEAK LOUDER THAN WORDS',
    ]
    expect(validateCryptogramConfig({ source: 'custom', quotes: five })).toEqual({
      field: 'quotes',
      message: 'Use at most 4 sayings (one per line).',
    })
    expect(
      validateCryptogramConfig({ source: 'custom', quotes: five.slice(0, 4) }),
    ).toBeNull()
  })

  it('requires custom theme text when Custom theme is on', () => {
    expect(
      validateCryptogramConfig({
        source: 'theme',
        customTheme: true,
        customThemeText: '   ',
      }),
    ).toMatchObject({ field: 'customThemeText' })
    expect(
      validateCryptogramConfig({
        source: 'theme',
        customTheme: true,
        customThemeText: 'patience and kindness',
      }),
    ).toBeNull()
    expect(validateCryptogramConfig({ source: 'theme', customTheme: false })).toBeNull()
  })
})

describe('cryptogram layout', () => {
  it('keeps every word whole and shrinks type until the band fits', () => {
    const words = 'THE GRASS IS ALWAYS GREENER ON THE OTHER SIDE'.split(' ')
    const layout = layoutCryptogram({
      words,
      bandWidth: 400,
      bandHeight: 120,
      slotEm: 1.15,
      maxFont: 20,
    })
    expect(layout.height).toBeLessThanOrEqual(120)
    expect(layout.lines.flat()).toEqual(words)
  })
})

describe('cryptogram', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('cryptogram')).toBe(true)
  })

  it('hides one answer per letter on the puzzle page', () => {
    resetObjectCounter()
    const items = ['CURIOUS MINDS KEEP THE YEARS FROM PILING UP QUIETLY']
    const config = {
      ...base,
      source: 'theme',
      puzzleCount: 1,
      theme: 'proverbs',
    }
    const [page] = cryptogramTemplate.generate(config, {
      ...STUDIO_TEST_CTX,
      remoteData: { items },
    })
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBe(items[0]!.replace(/ /g, '').length)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('reveals answers in black on the key', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(base, STUDIO_TEST_CTX)
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
    const [page] = cryptogramTemplate.generate(
      { ...base, puzzleCount: 2 },
      STUDIO_TEST_CTX,
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups.length).toBe(2)
    expect(groups.every((g) => (g.objects?.length ?? 0) > 0)).toBe(true)
  })

  it('centers the solution puzzles in the answer-key body', () => {
    resetObjectCounter()
    const config = { ...base, puzzleCount: 2, showTitle: true, title: 'Cryptogram' }
    const [page] = cryptogramTemplate.generate(config, STUDIO_TEST_CTX)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
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
    const stackCenterX = (left + right) / 2
    const stackCenterY = (top + bottom) / 2

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
    expect(Math.abs(stackCenterX - (field.left + field.width / 2))).toBeLessThanOrEqual(2)
    expect(Math.abs(stackCenterY - (field.top + field.height / 2))).toBeLessThanOrEqual(2)
  })

  it('keeps the densest configuration inside the safe margin', () => {
    resetObjectCounter()
    const pages = cryptogramTemplate.generate(
      {
        ...base,
        puzzleCount: 4,
        length: 'long',
        showTitle: true,
        title: 'Game 4',
      },
      STUDIO_TEST_CTX,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, STUDIO_TEST_CTX)
      if (page.answerSourceObjects) {
        assertObjectsInSafeMargin(page.answerSourceObjects, STUDIO_TEST_CTX)
      }
    }
  })

  it('skips prefetch for custom sayings', async () => {
    expect(await cryptogramTemplate.prefetch?.({ source: 'custom' }, SIGNAL)).toBeUndefined()
  })

  it('enciphers the AI sayings when the call succeeded', () => {
    resetObjectCounter()
    const items = ['CURIOUS MINDS KEEP THE YEARS FROM PILING UP QUIETLY']
    const [page] = cryptogramTemplate.generate(
      { ...base, source: 'theme', puzzleCount: 1 },
      { ...STUDIO_TEST_CTX, remoteData: { items } },
    )
    // Every letter of the AI saying becomes one hidden answer slot.
    const letters = items[0]!.replace(/ /g, '').length
    expect(harvestAnswers(page!.objects).length).toBe(letters)
  })

  it('falls back to bundled sayings when the AI call returned nothing', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(
      { ...base, source: 'theme', puzzleCount: 2 },
      { ...STUDIO_TEST_CTX, remoteData: undefined },
    )
    expect(harvestAnswers(page!.objects).length).toBeGreaterThan(0)
  })

  it('tops up short AI batches from the bundled bank', () => {
    const quotes = resolveAiQuotes({
      remote: ['ONE GOOD TURN DESERVES ANOTHER IN TIME'],
      config: base,
      count: 3,
      rng: createRng(7),
    })
    expect(quotes).toHaveLength(3)
    expect(quotes[0]).toBe('ONE GOOD TURN DESERVES ANOTHER IN TIME')
  })

  it('drops AI lines that fall outside the printable letter range', () => {
    const quotes = resolveAiQuotes({
      remote: ['TOO SHORT', 'ONE GOOD TURN DESERVES ANOTHER IN TIME'],
      config: base,
      count: 1,
      rng: createRng(7),
    })
    expect(quotes).toEqual(['ONE GOOD TURN DESERVES ANOTHER IN TIME'])
  })

  it('hides puzzles-per-page when content is own sayings', () => {
    const field = cryptogramTemplate.configSchema.find((f) => f.key === 'puzzleCount')
    expect(field?.visibleWhen?.({ ...base, source: 'custom' })).toBe(false)
    expect(field?.visibleWhen?.({ ...base, source: 'theme' })).toBe(true)
  })

  it('prints own sayings in typed order, one puzzle each', () => {
    resetObjectCounter()
    const quotes = [
      'KNOWLEDGE IS POWER',
      'PRACTICE MAKES PERFECT',
      'A KIND WORD GOES A LONG WAY',
    ]
    const [page] = cryptogramTemplate.generate(
      { ...base, source: 'custom', quotes, puzzleCount: 2 },
      STUDIO_TEST_CTX,
    )
    const groups = page!.objects.filter((o) => o.type === 'group')
    expect(groups).toHaveLength(3)
    const plains = groups.map((group) =>
      (group.objects ?? [])
        .filter((o) => o.studioRole === 'answer')
        .map((o) => o.text ?? '')
        .join(''),
    )
    expect(plains).toEqual(quotes.map((q) => q.replace(/ /g, '')))
  })

  it('does not print a tracking strip under puzzles', () => {
    resetObjectCounter()
    const [page] = cryptogramTemplate.generate(
      { ...base, puzzleCount: 2 },
      STUDIO_TEST_CTX,
    )
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
