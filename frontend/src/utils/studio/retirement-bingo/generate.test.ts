import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { harvestAnswers } from '../studio-answer-key'
import { withStudioPageHeader } from '../studio-page-header'
import { contentFingerprint } from '../studio-content-fingerprint'
import { measureRunWidth } from '../studio-text-metrics'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { retirementBingoTemplate } from './generate'
import {
  BINGO_MAX_CHARS,
  BINGO_MIN_THEME_POOL,
  BINGO_MOMENT_COUNT,
  RETIREMENT_BINGO_FREE_LABEL,
  RETIREMENT_BINGO_FREE_TEXT,
  RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE,
  loadRetirementBingoBank,
  momentKey,
  retirementBingoBankFaults,
  retirementBingoMomentFaults,
  retirementBingoPool,
  selectRetirementBingoMoments,
  type RetirementBingoMoment,
} from './content'
import {
  CELL_MIN,
  PHRASE_FONT_MIN,
  PHRASE_MAX_LINES,
  planRetirementBingoPage,
  retirementBingoPrintNote,
  wrapBingoPhrase,
} from './layout'
import {
  DEFAULT_RETIREMENT_BINGO_THEME_ID,
  RETIREMENT_BINGO_THEMES,
  parseRetirementBingoTheme,
  retirementBingoInstruction,
} from './themes'
import { runRetirementBingoKdpPreflight } from './kdp-preflight'
import { BINGO_FREE_SHADE, BINGO_LETTERS } from './draw'

/**
 * The draft a seller really has in front of them — the registry merges the
 * page-header fields in, so they are restated here.
 */
const base: StudioConfig = {
  ...buildDefaultConfig(retirementBingoTemplate),
  showTitle: true,
  title: '',
  showInstructions: true,
  seed: 42,
  fontFamily: 'PT Serif',
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'kdp',
})

/** Every paperback interior this app offers. */
const TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.25, 8],
  [5.5, 8.5],
  [6, 9],
  [6.69, 9.61],
  [7, 10],
  [7.5, 9.25],
  [8.5, 11],
]

/** A run stamps its heading onto the config before generate — so do we. */
function headed(config: StudioConfig): StudioConfig {
  return withStudioPageHeader(config, {
    showTitle: config.showTitle !== false,
    title: config.title,
    showInstructions: config.showInstructions,
  })
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioFabricObject[] {
  resetObjectCounter()
  return retirementBingoTemplate
    .generate(headed(config), ctx)
    .flatMap((page) => page.objects)
}

function planFor(config: StudioConfig, ctx: StudioGenerateContext) {
  const h = headed(config)
  return planRetirementBingoPage({
    page: ctx,
    config: h,
    theme: parseRetirementBingoTheme(h),
    instruction: retirementBingoInstruction(h),
    font: String(h.fontFamily),
  })
}

/** The 24 moment squares, in grid order. */
function momentTexts(objects: StudioFabricObject[]): string[] {
  return objects
    .filter((obj) => obj.type === 'textbox' && obj.studioRole === 'prompt')
    .map((obj) => String(obj.text ?? '').replace(/\n/g, ' '))
}

runGeneratorContractTests(retirementBingoTemplate)
assertGeneratorEntropy(retirementBingoTemplate, { seeds: 60 })

describe('retirement bingo bank', () => {
  it('holds only moments that pass their own rules', () => {
    expect(retirementBingoBankFaults()).toEqual([])
  })

  it('keeps every moment short, plain, safe and clear of the free square', () => {
    for (const moment of loadRetirementBingoBank()) {
      expect(moment.text.length).toBeLessThanOrEqual(BINGO_MAX_CHARS)
      expect(isUnsafeCopy(moment.text)).toBe(false)
      expect(moment.text).not.toMatch(/\bnap/i)
      expect(moment.text).not.toMatch(/[.!?,;:"]$/)
    }
  })

  it('gives every theme enough moments for cards to stay different', () => {
    for (const theme of RETIREMENT_BINGO_THEMES) {
      expect(retirementBingoPool(theme).length).toBeGreaterThanOrEqual(BINGO_MIN_THEME_POOL)
    }
  })

  it('rejects the phrasing faults a bingo square cannot survive', () => {
    const fault = (text: string) =>
      retirementBingoMomentFaults({ text, group: 'routine', family: 'x', firstYear: false })
    expect(fault('Took an afternoon nap').length).toBeGreaterThan(0)
    expect(fault('Went to the neighborhood cookout today').length).toBeGreaterThan(0)
    expect(fault('Watched extraordinary birds').length).toBeGreaterThan(0)
    expect(fault('slept in').length).toBeGreaterThan(0)
    expect(fault('Slept in.').length).toBeGreaterThan(0)
    expect(fault('Felt frail').length).toBeGreaterThan(0)
    expect(fault('Slept past 9')).toEqual([])
  })
})

describe('retirement bingo card selection', () => {
  const everyday = retirementBingoPool(parseRetirementBingoTheme({}))

  it('deals 24 different moments, never two from one family', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const card = selectRetirementBingoMoments({ pool: everyday, seed, themeId: 'everyday' })
      expect(card).toHaveLength(BINGO_MOMENT_COUNT)
      expect(new Set(card.map((m) => momentKey(m.text))).size).toBe(BINGO_MOMENT_COUNT)
      expect(new Set(card.map((m) => m.family)).size).toBe(BINGO_MOMENT_COUNT)
    }
  })

  it('is the same card for the same seed', () => {
    const a = selectRetirementBingoMoments({ pool: everyday, seed: 7, themeId: 'everyday' })
    const b = selectRetirementBingoMoments({ pool: everyday, seed: 7, themeId: 'everyday' })
    expect(a).toEqual(b)
  })

  it('balances a card across the kinds of moment instead of one taking over', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const card = selectRetirementBingoMoments({ pool: everyday, seed, themeId: 'everyday' })
      const perGroup = new Map<string, number>()
      for (const moment of card) perGroup.set(moment.group, (perGroup.get(moment.group) ?? 0) + 1)
      expect(perGroup.size).toBe(5)
      expect(Math.max(...perGroup.values())).toBeLessThanOrEqual(6)
    }
  })

  /**
   * The promise behind "every card draws its own mix": two cards from one book
   * share a handful of squares, not most of them.
   */
  it('keeps cards in one book meaningfully different', () => {
    for (const theme of RETIREMENT_BINGO_THEMES) {
      const pool = retirementBingoPool(theme)
      const cards = Array.from({ length: 20 }, (_, i) =>
        new Set(
          selectRetirementBingoMoments({ pool, seed: 1000 + i * 7919, themeId: theme.id }).map(
            (m) => m.text,
          ),
        ),
      )
      let total = 0
      let pairs = 0
      let worst = 0
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const shared = [...cards[i]!].filter((text) => cards[j]!.has(text)).length
          total += shared
          worst = Math.max(worst, shared)
          pairs++
        }
      }
      // Mean overlap tracks 24² / pool size; the worst pair must still leave
      // most of a card new.
      expect(total / pairs).toBeLessThanOrEqual((BINGO_MOMENT_COUNT ** 2 / pool.length) * 1.4)
      expect(worst).toBeLessThanOrEqual(BINGO_MOMENT_COUNT / 2)
    }
  })

  it('returns a short card, not a padded one, when the pool cannot make 24', () => {
    const families = new Set<string>()
    const tiny = everyday.filter((m) => !families.has(m.family) && families.add(m.family))
      .slice(0, 10)
    expect(selectRetirementBingoMoments({ pool: tiny, seed: 1, themeId: 'x' }).length).toBe(10)
    // Near-duplicates are never used to pad a short card.
    const twins = everyday.filter((m) => m.family === everyday[0]!.family)
    expect(selectRetirementBingoMoments({ pool: twins, seed: 1, themeId: 'x' }).length).toBe(1)
  })
})

describe('retirement bingo phrase wrapping', () => {
  const spec = { fontFamily: 'PT Serif' }

  it('uses the fewest lines, broken evenly rather than greedily', () => {
    const text = 'Took the long way home'
    const width = measureRunWidth('Took the long', 16, spec) + 1
    const lines = wrapBingoPhrase(text, 16, width, spec)!
    expect(lines.join(' ')).toBe(text)
    expect(lines).toHaveLength(2)
    const widths = lines.map((line) => measureRunWidth(line, 16, spec))
    expect(Math.max(...widths)).toBeLessThanOrEqual(width)
  })

  it('never leaves "a" or "the" alone on a line', () => {
    const width = measureRunWidth('bookshop', 13, spec) + 1
    expect(wrapBingoPhrase('Browsed a bookshop', 13, width, spec)).toBeNull()
    const lines = wrapBingoPhrase('Went to a concert', 16, measureRunWidth('a concert', 16, spec) + 1, spec)
    expect(lines).not.toBeNull()
    for (const line of lines!) expect(['a', 'the', 'to']).not.toContain(line)
  })

  it('refuses a word wider than the square instead of splitting it', () => {
    expect(wrapBingoPhrase('Birdwatching', 16, 40, spec)).toBeNull()
  })

  it('refuses a phrase that needs more lines than a square holds', () => {
    expect(wrapBingoPhrase('One two three four five', 16, 30, spec, PHRASE_MAX_LINES)).toBeNull()
  })
})

describe('retirement bingo page', () => {
  it('is registered as a Word game with no answer page', () => {
    const registered = STUDIO_TEMPLATES.find((t) => t.key === 'retirement-bingo')
    expect(registered).toBeDefined()
    expect(registered!.category).toBe('word')
    expect(registered!.producesAnswerKey).toBe(false)
    expect(registered!.pageCount).toBe(1)
    expect(registered!.configSchema.map((f) => f.key)).toEqual([
      'showTitle',
      'title',
      'showInstructions',
      'theme',
    ])
    expect(buildDefaultConfig(registered!).theme).toBe(DEFAULT_RETIREMENT_BINGO_THEME_ID)
  })

  it('emits no hidden answers, so no solution page is added', () => {
    expect(harvestAnswers(generate(base, kdpCtx(6, 9)))).toEqual([])
  })

  for (const [w, h] of TRIMS) {
    for (const theme of RETIREMENT_BINGO_THEMES) {
      it(`prints a full, readable card on ${w} x ${h} (${theme.id})`, () => {
        const config = { ...base, theme: theme.id }
        const ctx = kdpCtx(w, h)
        const plan = planFor(config, ctx)
        expect(plan).not.toBeNull()
        expect(plan!.metrics.cell).toBeGreaterThanOrEqual(CELL_MIN)
        expect(plan!.phraseFont).toBeGreaterThanOrEqual(PHRASE_FONT_MIN)
        expect(plan!.pool.length).toBeGreaterThanOrEqual(BINGO_MIN_THEME_POOL)

        const objects = generate(config, ctx)
        assertObjectsInSafeMargin(objects, ctx)

        const texts = momentTexts(objects)
        expect(texts).toHaveLength(BINGO_MOMENT_COUNT)
        expect(new Set(texts.map(momentKey)).size).toBe(BINGO_MOMENT_COUNT)
        const bank = new Set(retirementBingoPool(theme).map((m) => m.text))
        for (const text of texts) expect(bank.has(text)).toBe(true)

        // Every phrase sits inside its own square, at the planned size and breaks.
        const phrases = objects.filter(
          (obj) => obj.type === 'textbox' && obj.studioRole === 'prompt',
        )
        const { cell } = plan!.metrics
        for (const phrase of phrases) {
          expect(phrase.fontSize).toBe(plan!.phraseFont)
          const lines = String(phrase.text).split('\n')
          expect(lines.length).toBeLessThanOrEqual(PHRASE_MAX_LINES)
          for (const line of lines) {
            expect(measureRunWidth(line, plan!.phraseFont, { fontFamily: 'PT Serif' }))
              .toBeLessThanOrEqual(plan!.metrics.fitWidth)
          }
          expect(phrase.width!).toBeLessThan(cell)
          expect(phrase.left).toBeGreaterThan(plan!.gridLeft)
          expect(phrase.left).toBeLessThan(plan!.gridLeft + plan!.gridSize)
          expect(phrase.top).toBeGreaterThan(plan!.gridTop)
          expect(phrase.top).toBeLessThan(plan!.gridTop + plan!.gridSize)
        }
      })
    }
  }

  it('keeps the free NAP square in the exact centre, marked without colour', () => {
    const ctx = kdpCtx(6, 9)
    const plan = planFor(base, ctx)!
    const objects = generate(base, ctx)
    const center = {
      x: plan.gridLeft + plan.gridSize / 2,
      y: plan.gridTop + plan.gridSize / 2,
    }
    const nap = objects.find((obj) => obj.text === RETIREMENT_BINGO_FREE_TEXT)!
    const free = objects.find((obj) => obj.text === RETIREMENT_BINGO_FREE_LABEL)!
    expect(nap).toBeDefined()
    expect(free).toBeDefined()
    expect(nap.fontWeight).toBe(700)
    expect(Math.abs(nap.left - center.x)).toBeLessThan(1)
    expect(Math.abs(nap.top - center.y)).toBeLessThan(plan.metrics.cell / 2)

    // Tinted *and* framed in ink, so a press that drops the tint still shows it.
    const shade = objects.find((obj) => obj.fill === BINGO_FREE_SHADE)!
    expect(shade.stroke).toBe('#000000')
    expect(shade.left + shade.width! / 2).toBeCloseTo(center.x, 0)
    expect(shade.top + shade.height! / 2).toBeCloseTo(center.y, 0)

    // No moment square sits on the centre.
    const phrases = objects.filter((obj) => obj.studioRole === 'prompt')
    for (const phrase of phrases) {
      const onCenter =
        Math.abs(phrase.left - center.x) < 1 && Math.abs(phrase.top - center.y) < 1
      expect(onCenter).toBe(false)
    }
  })

  it('heads each column with B-I-N-G-O above the grid', () => {
    const ctx = kdpCtx(8.5, 11)
    const plan = planFor(base, ctx)!
    const objects = generate(base, ctx)
    const letters = objects.filter(
      (obj) => obj.studioRole === 'decoration' && BINGO_LETTERS.includes(obj.text as never),
    )
    expect(letters.map((obj) => obj.text)).toEqual([...BINGO_LETTERS])
    for (const letter of letters) expect(letter.top).toBeLessThan(plan.gridTop)
  })

  it('prints every card of a book at one size, whichever moments it draws', () => {
    const ctx = kdpCtx(6, 9)
    const sizes = new Set<number>()
    for (let seed = 1; seed <= 12; seed++) {
      const objects = generate({ ...base, seed }, { ...ctx, seed })
      for (const obj of objects) if (obj.studioRole === 'prompt') sizes.add(obj.fontSize!)
    }
    expect(sizes.size).toBe(1)
  })

  it('gives each seed its own card', () => {
    const ctx = kdpCtx(6, 9)
    const a = contentFingerprint(generate({ ...base, seed: 1 }, { ...ctx, seed: 1 }))
    const b = contentFingerprint(generate({ ...base, seed: 2 }, { ...ctx, seed: 2 }))
    expect(a).not.toBe(b)
  })

  it('still lays out with the heading and instructions switched off', () => {
    for (const [w, h] of TRIMS) {
      const ctx = kdpCtx(w, h)
      const config = { ...base, showTitle: false, title: '', showInstructions: false }
      const objects = generate(config, ctx)
      assertObjectsInSafeMargin(objects, ctx)
      expect(momentTexts(objects)).toHaveLength(BINGO_MOMENT_COUNT)
    }
  })

  it('refuses a page too small to read rather than shrinking the card', () => {
    const ctx = kdpCtx(3, 4)
    const objects = generate(base, ctx)
    expect(objects.some((obj) => obj.text === RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE)).toBe(
      true,
    )
    expect(momentTexts(objects).filter((t) => t !== RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE))
      .toHaveLength(0)
    assertObjectsInSafeMargin(objects, ctx)
  })

  it('reports what the page will print in the form help line', () => {
    const theme = parseRetirementBingoTheme(base)
    const note = retirementBingoPrintNote({
      theme,
      page: kdpCtx(6, 9),
      config: headed(base),
      instruction: retirementBingoInstruction(base),
      font: 'PT Serif',
    })
    expect(note).toMatch(/in squares/)
    expect(note).toMatch(/pt/)
    expect(note).toMatch(/No answer page/)
    const tooSmall = retirementBingoPrintNote({
      theme,
      page: kdpCtx(3, 4),
      config: headed(base),
      instruction: retirementBingoInstruction(base),
      font: 'PT Serif',
    })
    expect(tooSmall).toMatch(/too small/)
  })
})

describe('retirement bingo preflight', () => {
  const ctx = kdpCtx(6, 9)
  const plan = planFor(base, ctx)!
  const card = (): RetirementBingoMoment[] =>
    selectRetirementBingoMoments({ pool: plan.pool, seed: 5, themeId: 'everyday' })
  const check = (moments: RetirementBingoMoment[]) =>
    runRetirementBingoKdpPreflight({ moments, plan, font: 'PT Serif' })

  it('passes a card as dealt', () => {
    expect(check(card())).toMatchObject({ ok: true, errors: [] })
  })

  it('refuses a card that is not full', () => {
    expect(check(card().slice(1)).ok).toBe(false)
  })

  it('refuses the same moment twice', () => {
    const moments = card()
    moments[3] = moments[0]!
    expect(check(moments).ok).toBe(false)
  })

  it('refuses two phrasings of one moment', () => {
    const moments = card()
    moments[3] = { ...moments[3]!, family: moments[0]!.family }
    expect(check(moments).ok).toBe(false)
  })

  it('refuses a square that repeats the free NAP square', () => {
    const moments = card()
    moments[0] = { ...moments[0]!, text: 'Took a long nap' }
    expect(check(moments).ok).toBe(false)
  })

  it('refuses a phrase the page was not planned to fit', () => {
    const moments = card()
    moments[0] = { ...moments[0]!, text: 'Watched the ball game' }
    expect(check(moments).ok).toBe(false)
  })
})
