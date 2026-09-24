import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_INSTRUCTION_POOLS } from '@/constants/studio-phrasing'
import {
  RETIREMENT_BINGO_INSTRUCTIONS,
  RETIREMENT_BINGO_WRITE_INS,
} from '@/constants/studio-phrasing/retirement-bingo'
import { STUDIO_PAPER } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { harvestAnswers } from '../studio-answer-key'
import { withStudioPageHeader } from '../studio-page-header'
import { contentFingerprint } from '../studio-content-fingerprint'
import { measureRunWidth } from '../studio-text-metrics'
import { resolveStudioConfigField } from '../studio-config-fields'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  MIN_PHRASING_VARIANTS,
  STUDIO_CANONICAL_KEY,
  STUDIO_ENTROPY_FLOOR_BITS,
  createRngFromSeedInput,
  findBannedTerm,
} from '../_shared/uniqueness'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { retirementBingoTemplate } from './generate'
import {
  BINGO_CUSTOM_MAX,
  BINGO_MAX_CHARS,
  BINGO_MIN_THEME_FAMILIES,
  BINGO_MIN_VARIANTS,
  BINGO_MOMENT_COUNT,
  RETIREMENT_BINGO_FREE_TEXT,
  RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE,
  customMomentsPerCard,
  loadRetirementBingoBank,
  loadRetirementBingoFamilies,
  momentKey,
  normalizeCustomMoment,
  parseCustomMoments,
  retirementBingoBankFaults,
  retirementBingoTextFaults,
  retirementBingoThemeFamilies,
  selectRetirementBingoMoments,
  type RetirementBingoFamily,
  type RetirementBingoMoment,
} from './content'
import {
  BINGO_DECK_MIN_FAMILIES,
  BINGO_DECK_SHARE,
  buildRetirementBingoDeck,
  retirementBingoEntropy,
} from './deck'
import {
  CELL_MIN,
  PHRASE_FONT_MIN,
  PHRASE_MAX_LINES,
  planRetirementBingoPage,
  retirementBingoPrintNote,
  wrapBingoPhrase,
  type RetirementBingoPagePlan,
} from './layout'
import {
  BINGO_FREE_LABELS,
  BINGO_FREE_MARKS,
  BINGO_HEADER_STYLES,
  BINGO_RULE_WEIGHTS,
  retirementBingoHouseStyle,
  type RetirementBingoHouseStyle,
} from './style'
import {
  DEFAULT_RETIREMENT_BINGO_THEME_ID,
  RETIREMENT_BINGO_THEMES,
  parseRetirementBingoTheme,
} from './themes'
import { runRetirementBingoKdpPreflight } from './kdp-preflight'
import {
  BINGO_FREE_SHADE,
  BINGO_LETTERS,
  BINGO_PART_KEY,
  drawRetirementBingoCard,
  retirementBingoCardKey,
} from './draw'

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

/** A 128-bit account salt, as the backend mints them. */
const salt = (n: number): string => n.toString(16).padStart(32, '0')

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (
  wIn: number,
  hIn: number,
  seed = 42,
  ownerSalt: string = salt(1),
): StudioGenerateContext => ({
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
  ownerSalt,
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
    .generate(headed({ ...config, seed: ctx.seed }), ctx)
    .flatMap((page) => page.objects)
}

function planFor(config: StudioConfig, ctx: StudioGenerateContext): RetirementBingoPagePlan {
  const h = headed(config)
  const plan = planRetirementBingoPage({
    page: ctx,
    config: h,
    theme: parseRetirementBingoTheme(h),
    font: String(h.fontFamily),
  })
  if (!plan) throw new Error('expected a plan')
  return plan
}

function deckFor(ownerSalt: string, plan: RetirementBingoPagePlan, config: StudioConfig = base) {
  return buildRetirementBingoDeck({
    families: retirementBingoThemeFamilies(parseRetirementBingoTheme(config)),
    fits: (text) => plan.lines.has(text),
    ownerSalt,
  })
}

function rngFor(ownerSalt: string, nonce: number) {
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: 'retirement-bingo',
    configHash: 'test',
    pageNonce: nonce,
  })
}

/** The 24 moment squares, in grid order. */
function momentTexts(objects: StudioFabricObject[]): string[] {
  return objects
    .filter((obj) => obj.data?.[BINGO_PART_KEY] === 'moment')
    .map((obj) => String(obj.text ?? '').replace(/\n/g, ' '))
}

function partOf(objects: StudioFabricObject[], name: string): StudioFabricObject[] {
  return objects.filter((obj) => obj.data?.[BINGO_PART_KEY] === name)
}

function shared(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0
  for (const text of a) if (b.has(text)) count++
  return count
}

runGeneratorContractTests(retirementBingoTemplate)
assertGeneratorEntropy(retirementBingoTemplate, { seeds: 60 })

describe('retirement bingo bank', () => {
  it('holds only moments that pass their own rules', () => {
    expect(retirementBingoBankFaults()).toEqual([])
  })

  it('writes every moment at least three ways, under a unique family', () => {
    const families = loadRetirementBingoFamilies()
    expect(new Set(families.map((f) => f.family)).size).toBe(families.length)
    for (const family of families) {
      expect(family.variants.length).toBeGreaterThanOrEqual(BINGO_MIN_VARIANTS)
    }
  })

  it('keeps every phrasing short, plain, safe and clear of the free square', () => {
    for (const moment of loadRetirementBingoBank()) {
      expect(moment.text.length).toBeLessThanOrEqual(BINGO_MAX_CHARS)
      expect(isUnsafeCopy(moment.text)).toBe(false)
      expect(findBannedTerm(moment.text)).toBeNull()
      expect(moment.text).not.toMatch(/\bnap/i)
      expect(moment.text).not.toMatch(/[.!?,;:"]$/)
    }
  })

  it('gives every theme enough moments for a seller deck and varied cards', () => {
    for (const theme of RETIREMENT_BINGO_THEMES) {
      expect(retirementBingoThemeFamilies(theme).length).toBeGreaterThanOrEqual(
        BINGO_DECK_MIN_FAMILIES,
      )
    }
  })

  it('rejects the phrasing faults a bingo square cannot survive', () => {
    const faulty = (text: string) => retirementBingoTextFaults(text).length > 0
    expect(faulty('Took an afternoon nap')).toBe(true)
    expect(faulty('Went to the neighborhood cookout today')).toBe(true)
    expect(faulty('Watched extraordinary birds')).toBe(true)
    expect(faulty('slept in')).toBe(true)
    expect(faulty('Slept in.')).toBe(true)
    expect(faulty('Felt frail')).toBe(true)
    expect(faulty('Won at the casino')).toBe(true)
    expect(faulty('Slept past 9')).toBe(false)
  })
})

describe('retirement bingo phrasing pools', () => {
  it('registers enough hand-written instructions to vary every page (§4.7)', () => {
    expect(STUDIO_INSTRUCTION_POOLS['retirement-bingo']?.default).toBe(
      RETIREMENT_BINGO_INSTRUCTIONS,
    )
    expect(RETIREMENT_BINGO_INSTRUCTIONS.length).toBeGreaterThanOrEqual(MIN_PHRASING_VARIANTS)
    expect(new Set(RETIREMENT_BINGO_INSTRUCTIONS).size).toBe(RETIREMENT_BINGO_INSTRUCTIONS.length)
  })

  it('keeps every instruction to two short, safe lines', () => {
    for (const text of RETIREMENT_BINGO_INSTRUCTIONS) {
      const lines = text.split('\n')
      expect(lines).toHaveLength(2)
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(40)
      expect(isUnsafeCopy(text)).toBe(false)
      expect(findBannedTerm(text)).toBeNull()
    }
  })

  it('offers several write-in lines, each short enough for the narrowest card', () => {
    expect(RETIREMENT_BINGO_WRITE_INS.length).toBeGreaterThanOrEqual(5)
    for (const text of RETIREMENT_BINGO_WRITE_INS) expect(text.length).toBeLessThanOrEqual(20)
  })
})

describe('retirement bingo custom moments', () => {
  it('tidies what a seller typed the way they meant it', () => {
    expect(normalizeCustomMoment('  slept   till noon!! ')).toBe('Slept till noon')
    expect(normalizeCustomMoment('bought a boat.')).toBe('Bought a boat')
    expect(normalizeCustomMoment('   ')).toBe('')
  })

  it('keeps good lines, skips bad ones with a reason, and drops repeats', () => {
    const { moments, rejected } = parseCustomMoments([
      'Moved to the lake',
      'moved to the lake',
      'Took a long nap',
      'Went to the grand neighborhood block party today',
      '',
      'Bought a red sports car',
    ])
    expect(moments.map((m) => m.text)).toEqual(['Moved to the lake', 'Bought a red sports car'])
    expect(rejected.map((r) => r.text)).toEqual([
      'Took a long nap',
      'Went to the grand neighborhood block party today',
    ])
    for (const r of rejected) expect(r.reason.length).toBeGreaterThan(0)
    for (const m of moments) expect(m.group).toBe('custom')
  })

  it('accepts a pasted block of text as well as a list', () => {
    expect(parseCustomMoments('Moved to the lake\r\nBought a boat').moments).toHaveLength(2)
  })

  it('caps a very long list', () => {
    const lines = Array.from({ length: BINGO_CUSTOM_MAX + 5 }, (_, i) => `Visited town ${i}`)
    const { moments, rejected } = parseCustomMoments(lines)
    expect(moments).toHaveLength(BINGO_CUSTOM_MAX)
    expect(rejected).toHaveLength(5)
  })

  it('mixes in about a third of the list per card, at most eight', () => {
    expect(customMomentsPerCard(0)).toBe(0)
    expect(customMomentsPerCard(1)).toBe(1)
    expect(customMomentsPerCard(10)).toBe(4)
    expect(customMomentsPerCard(60)).toBe(8)
  })

  it('prints the seller’s moments on the card, and skips ones that cannot fit', () => {
    const fitting = [
      'Moved to the lake',
      'Bought a red sports car',
      'Joined the rowing club',
      'Painted the boat',
      'Took the kids fishing',
      'Adopted a rescue dog',
    ]
    const field = retirementBingoTemplate.configSchema.find((f) => f.key === 'customMoments')!
    expect(
      resolveStudioConfigField(field, headed({ ...base, customMoments: fitting }), kdpCtx(6, 9))
        .warning,
    ).toBeFalsy()
    // Passes every wording rule, but ten capital Ws cannot fit a square.
    const tooWide = 'Saw WWWWWWWWWW'
    for (let seed = 1; seed <= 10; seed++) {
      const objects = generate(
        { ...base, customMoments: [...fitting, tooWide] },
        kdpCtx(6, 9, seed),
      )
      const texts = momentTexts(objects)
      expect(texts).toHaveLength(BINGO_MOMENT_COUNT)
      expect(new Set(texts.map(momentKey)).size).toBe(BINGO_MOMENT_COUNT)
      expect(texts.filter((t) => fitting.includes(t)).length).toBe(
        customMomentsPerCard(fitting.length),
      )
      expect(texts).not.toContain(tooWide)
    }
  })

  it('tells the seller in the form which moments will be skipped, and why', () => {
    const field = retirementBingoTemplate.configSchema.find((f) => f.key === 'customMoments')!
    const config = {
      ...base,
      customMoments: ['Took a long nap', 'Moved to the lake', 'Saw WWWWWWWWWW'],
    }
    const resolved = resolveStudioConfigField(field, headed(config), kdpCtx(6, 9))
    expect(resolved.warning).toMatch(/Took a long nap/)
    expect(resolved.warning).toMatch(/NAP/)
    expect(resolved.warning).toMatch(/WWWWWWWWWW.*fit a square/)
    expect(resolved.help).toMatch(/2 of your moments/)
    const clean = resolveStudioConfigField(field, headed({ ...base }), kdpCtx(6, 9))
    expect(clean.warning).toBeFalsy()
  })
})

describe('retirement bingo seller deck', () => {
  const plan = planFor(base, kdpCtx(6, 9))
  const families = retirementBingoThemeFamilies(parseRetirementBingoTheme(base))

  it('is the same deck every time for one account', () => {
    expect(deckFor(salt(7), plan)).toEqual(deckFor(salt(7), plan))
  })

  it('holds one fitting phrasing per family, about the configured share', () => {
    const deck = deckFor(salt(7), plan)
    expect(new Set(deck.map((m) => m.family)).size).toBe(deck.length)
    for (const moment of deck) expect(plan.lines.has(moment.text)).toBe(true)
    expect(deck.length).toBeGreaterThanOrEqual(BINGO_DECK_MIN_FAMILIES)
    expect(deck.length / families.length).toBeGreaterThan(BINGO_DECK_SHARE - 0.1)
    expect(deck.length / families.length).toBeLessThan(BINGO_DECK_SHARE + 0.1)
  })

  it('never shrinks a small theme below the floor', () => {
    const small = { ...base, theme: 'first-year' }
    const smallPlan = planFor(small, kdpCtx(6, 9))
    const available = new Set(smallPlan.pool.map((m) => m.family)).size
    for (let i = 0; i < 20; i++) {
      expect(deckFor(salt(100 + i), smallPlan, small).length).toBeGreaterThanOrEqual(
        Math.min(available, BINGO_DECK_MIN_FAMILIES),
      )
    }
  })

  it('gives different accounts different moments and different wording', () => {
    const decks = Array.from({ length: 30 }, (_, i) => new Set(deckFor(salt(200 + i), plan).map((m) => m.text)))
    let total = 0
    let pairs = 0
    for (let i = 0; i < decks.length; i++) {
      for (let j = i + 1; j < decks.length; j++) {
        total += shared(decks[i]!, decks[j]!) / decks[i]!.size
        pairs++
      }
    }
    // Without per-seller decks every pair would share every phrase (1.0).
    expect(total / pairs).toBeLessThan(0.35)
  })

  it('keeps an account’s choices when the bank grows', () => {
    const extra: RetirementBingoFamily = {
      family: 'zz-new-family',
      group: 'routine',
      firstYear: false,
      variants: ['Tried something', 'Did something', 'Made something'],
    }
    const before = deckFor(salt(9), plan)
    const after = buildRetirementBingoDeck({
      families: [...families, extra],
      fits: (text) => plan.lines.has(text) || extra.variants.includes(text),
      ownerSalt: salt(9),
    }).filter((m) => m.family !== extra.family)
    // Every family keeps its phrasing; only the floor top-up could differ, and
    // the everyday theme is far above the floor.
    expect(after).toEqual(before)
  })

  it('falls through to another phrasing of the same moment when one does not fit', () => {
    const full = deckFor(salt(11), plan)
    const dropped = new Set(full.map((m) => m.text))
    const narrowed = buildRetirementBingoDeck({
      families,
      fits: (text) => plan.lines.has(text) && !dropped.has(text),
      ownerSalt: salt(11),
    })
    const byFamily = new Map(narrowed.map((m) => [m.family, m.text]))
    for (const moment of full) {
      const replacement = byFamily.get(moment.family)
      if (replacement) expect(replacement).not.toBe(moment.text)
    }
    expect(byFamily.size).toBeGreaterThan(full.length * 0.8)
  })

  it('clears the 2^48 entropy floor even on the smallest deck (§4.5)', () => {
    const report = retirementBingoEntropy()
    expect(report.clearsFloor).toBe(true)
    expect(report.pageBits).toBeGreaterThan(STUDIO_ENTROPY_FLOOR_BITS * 2)
  })
})

describe('retirement bingo card selection', () => {
  const plan = planFor(base, kdpCtx(6, 9))
  const deck = deckFor(salt(3), plan)

  it('deals 24 different moments, never two from one family', () => {
    for (let n = 1; n <= 200; n++) {
      const card = selectRetirementBingoMoments({ deck, rng: rngFor(salt(3), n) })
      expect(card).toHaveLength(BINGO_MOMENT_COUNT)
      expect(new Set(card.map((m) => momentKey(m.text))).size).toBe(BINGO_MOMENT_COUNT)
      expect(new Set(card.map((m) => m.family)).size).toBe(BINGO_MOMENT_COUNT)
    }
  })

  it('is the same card for the same stream', () => {
    const a = selectRetirementBingoMoments({ deck, rng: rngFor(salt(3), 7) })
    const b = selectRetirementBingoMoments({ deck, rng: rngFor(salt(3), 7) })
    expect(a).toEqual(b)
  })

  it('balances a card across the kinds of moment instead of one taking over', () => {
    for (let n = 1; n <= 50; n++) {
      const card = selectRetirementBingoMoments({ deck, rng: rngFor(salt(3), n) })
      const perGroup = new Map<string, number>()
      for (const moment of card) perGroup.set(moment.group, (perGroup.get(moment.group) ?? 0) + 1)
      expect(perGroup.size).toBe(5)
      expect(Math.max(...perGroup.values())).toBeLessThanOrEqual(6)
    }
  })

  /**
   * The promise behind "every card draws its own mix": two cards from one
   * seller's book share a handful of squares, not most of them.
   */
  it('keeps cards in one book meaningfully different, on every theme', () => {
    for (const theme of RETIREMENT_BINGO_THEMES) {
      const config = { ...base, theme: theme.id }
      const themeDeck = deckFor(salt(5), planFor(config, kdpCtx(6, 9)), config)
      const cards = Array.from({ length: 20 }, (_, i) =>
        new Set(
          selectRetirementBingoMoments({ deck: themeDeck, rng: rngFor(salt(5), i) }).map(
            (m) => m.text,
          ),
        ),
      )
      let total = 0
      let pairs = 0
      let worst = 0
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const count = shared(cards[i]!, cards[j]!)
          total += count
          worst = Math.max(worst, count)
          pairs++
        }
      }
      // Mean overlap tracks 24² / deck size; the worst pair must still leave
      // most of a card new.
      expect(total / pairs).toBeLessThanOrEqual((BINGO_MOMENT_COUNT ** 2 / themeDeck.length) * 1.3)
      expect(worst).toBeLessThanOrEqual(13)
    }
  })

  it('returns a short card, not a padded one, when the deck cannot make 24', () => {
    expect(selectRetirementBingoMoments({ deck: deck.slice(0, 10), rng: rngFor(salt(3), 1) }))
      .toHaveLength(10)
  })
})

describe('retirement bingo across sellers', () => {
  /**
   * The account-risk scenario, stated as a test: many sellers building bingo
   * books on the same settings. No two of their cards may be the same card,
   * and on average their cards should share only a square or two.
   */
  it('never prints the same card for two sellers, and their cards barely overlap', () => {
    const ctxFor = (seller: number, page: number) => kdpCtx(6, 9, 1000 + page, salt(5000 + seller))
    const cards: { seller: number; texts: Set<string>; key: string }[] = []
    for (let seller = 0; seller < 40; seller++) {
      for (let page = 0; page < 3; page++) {
        const objects = generate(base, ctxFor(seller, page))
        const texts = momentTexts(objects)
        cards.push({
          seller,
          texts: new Set(texts),
          key: String(partOf(objects, 'moment')[0]?.data?.[STUDIO_CANONICAL_KEY]),
        })
      }
    }
    expect(new Set(cards.map((c) => c.key)).size).toBe(cards.length)

    let total = 0
    let pairs = 0
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        if (cards[i]!.seller === cards[j]!.seller) continue
        total += shared(cards[i]!.texts, cards[j]!.texts)
        pairs++
      }
    }
    expect(total / pairs).toBeLessThan(2)
  })

  it('gives each account its own consistent house style', () => {
    const styles = Array.from({ length: 60 }, (_, i) => retirementBingoHouseStyle(salt(i)))
    const tokens = new Set(styles.map((s) => JSON.stringify(s)))
    expect(tokens.size).toBeGreaterThan(40)
    expect(retirementBingoHouseStyle(salt(1))).toEqual(retirementBingoHouseStyle(salt(1)))
    for (const header of BINGO_HEADER_STYLES) {
      expect(styles.some((s) => s.header === header)).toBe(true)
    }
  })

  it('varies the instruction from page to page, and keeps it on regenerate', () => {
    const instructionOf = (seed: number) => {
      const objects = generate(base, kdpCtx(6, 9, seed))
      return objects.find((obj) => RETIREMENT_BINGO_INSTRUCTIONS.includes(String(obj.text)))?.text
    }
    const seen = new Set(Array.from({ length: 30 }, (_, i) => instructionOf(i + 1)))
    expect(seen.size).toBeGreaterThanOrEqual(6)
    expect(instructionOf(5)).toBe(instructionOf(5))
  })
})

describe('retirement bingo page', () => {
  it('is registered as a Word game with no answer page', () => {
    const registered = STUDIO_TEMPLATES.find((t) => t.key === 'retirement-bingo')
    expect(registered).toBeDefined()
    expect(registered!.category).toBe('word')
    expect(registered!.producesAnswerKey).toBe(false)
    expect(registered!.pageCount).toBe(1)
    expect(registered!.prefetch).toBeUndefined()
    expect(registered!.configSchema.map((f) => f.key)).toEqual([
      'showTitle',
      'title',
      'showInstructions',
      'theme',
      'customMoments',
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
        expect(plan.metrics.cell).toBeGreaterThanOrEqual(CELL_MIN)
        expect(plan.phraseFont).toBeGreaterThanOrEqual(PHRASE_FONT_MIN)
        expect(plan.familyCount).toBeGreaterThanOrEqual(BINGO_MIN_THEME_FAMILIES)

        const objects = generate(config, ctx)
        assertObjectsInSafeMargin(objects, ctx)

        const texts = momentTexts(objects)
        expect(texts).toHaveLength(BINGO_MOMENT_COUNT)
        expect(new Set(texts.map(momentKey)).size).toBe(BINGO_MOMENT_COUNT)
        const bank = new Set(retirementBingoThemeFamilies(theme).flatMap((f) => f.variants))
        for (const text of texts) expect(bank.has(text)).toBe(true)

        const { cell } = plan.metrics
        for (const phrase of partOf(objects, 'moment')) {
          expect(phrase.fontSize).toBe(plan.phraseFont)
          const lines = String(phrase.text).split('\n')
          expect(lines.length).toBeLessThanOrEqual(PHRASE_MAX_LINES)
          for (const line of lines) {
            expect(measureRunWidth(line, plan.phraseFont, { fontFamily: 'PT Serif' }))
              .toBeLessThanOrEqual(plan.metrics.fitWidth)
          }
          expect(phrase.width!).toBeLessThan(cell)
          expect(phrase.left).toBeGreaterThan(plan.gridLeft)
          expect(phrase.left).toBeLessThan(plan.gridLeft + plan.gridSize)
          expect(phrase.top).toBeGreaterThan(plan.gridTop)
          expect(phrase.top).toBeLessThan(plan.gridTop + plan.gridSize)
        }
      })
    }
  }

  it('keeps the free NAP square in the exact centre', () => {
    const ctx = kdpCtx(6, 9)
    const plan = planFor(base, ctx)
    const objects = generate(base, ctx)
    const center = { x: plan.gridLeft + plan.gridSize / 2, y: plan.gridTop + plan.gridSize / 2 }
    const nap = partOf(objects, 'free-text')[0]!
    expect(nap.text).toBe(RETIREMENT_BINGO_FREE_TEXT)
    expect(nap.fontWeight).toBe(700)
    expect(Math.abs(nap.left - center.x)).toBeLessThan(1)
    expect(Math.abs(nap.top - center.y)).toBeLessThan(plan.metrics.cell / 2)
    for (const phrase of partOf(objects, 'moment')) {
      const onCenter = Math.abs(phrase.left - center.x) < 1 && Math.abs(phrase.top - center.y) < 1
      expect(onCenter).toBe(false)
    }
  })

  it('prints every card of a book at one size, and one grid position', () => {
    const sizes = new Set<number>()
    const gridTops = new Set<number>()
    for (let seed = 1; seed <= 12; seed++) {
      const objects = generate(base, kdpCtx(6, 9, seed))
      for (const obj of partOf(objects, 'moment')) sizes.add(obj.fontSize!)
      gridTops.add(Math.round(partOf(objects, 'free-mark')[0]!.top))
    }
    expect(sizes.size).toBe(1)
    // The instruction wording changes page to page; the grid must not move.
    expect(gridTops.size).toBe(1)
  })

  it('treats the same 24 moments in new places as the same card', () => {
    const plan = planFor(base, kdpCtx(6, 9))
    const card = selectRetirementBingoMoments({ deck: deckFor(salt(3), plan), rng: rngFor(salt(3), 1) })
    const reversed = [...card].reverse()
    expect(retirementBingoCardKey(reversed)).toBe(retirementBingoCardKey(card))

    const draw = (moments: RetirementBingoMoment[]) => {
      resetObjectCounter()
      const objects: StudioFabricObject[] = []
      drawRetirementBingoCard(objects, {
        moments,
        lines: plan.lines,
        plan,
        style: retirementBingoHouseStyle(salt(3)),
        font: 'PT Serif',
        tag: { templateKey: 'retirement-bingo', instanceId: 'x', pageRole: 'single' },
      })
      return contentFingerprint(objects)
    }
    // The book-wide ledger fingerprints pages; a shuffled card must collide.
    expect(draw(reversed)).toBe(draw(card))
    const other = selectRetirementBingoMoments({ deck: deckFor(salt(3), plan), rng: rngFor(salt(3), 2) })
    expect(draw(other)).not.toBe(draw(card))
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
    expect(objects.some((obj) => obj.text === RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
    expect(momentTexts(objects)).toHaveLength(0)
    assertObjectsInSafeMargin(objects, ctx)
  })

  it('reports what the page will print in the form help line', () => {
    const theme = parseRetirementBingoTheme(base)
    const note = retirementBingoPrintNote({
      theme,
      page: kdpCtx(6, 9),
      config: headed(base),
      font: 'PT Serif',
    })
    expect(note).toMatch(/in squares/)
    expect(note).toMatch(/own set/)
    expect(note).toMatch(/No answer page/)
    const tooSmall = retirementBingoPrintNote({
      theme,
      page: kdpCtx(3, 4),
      config: headed(base),
      font: 'PT Serif',
    })
    expect(tooSmall).toMatch(/too small/)
  })
})

describe('retirement bingo house styles', () => {
  const ctx = kdpCtx(5, 8)
  const plan = planFor(base, ctx)
  const moments = selectRetirementBingoMoments({ deck: deckFor(salt(3), plan), rng: rngFor(salt(3), 1) })
  const tag = { templateKey: 'retirement-bingo', instanceId: 'x', pageRole: 'single' as const }

  const draw = (style: RetirementBingoHouseStyle) => {
    resetObjectCounter()
    const objects: StudioFabricObject[] = []
    drawRetirementBingoCard(objects, { moments, lines: plan.lines, plan, style, font: 'PT Serif', tag })
    return objects
  }

  /** Every combination that changes geometry, on the tightest trim. */
  for (const header of BINGO_HEADER_STYLES) {
    for (const freeMark of BINGO_FREE_MARKS) {
      for (const freeLabel of BINGO_FREE_LABELS) {
        it(`draws ${header} / ${freeMark} / ${freeLabel} inside the page`, () => {
          const objects = draw({
            header,
            freeMark,
            freeLabel,
            rules: 'heavy',
            writeIn: RETIREMENT_BINGO_WRITE_INS.reduce((a, b) => (a.length >= b.length ? a : b)),
          })
          assertObjectsInSafeMargin(objects, ctx)

          // The label must sit on one line inside the free frame.
          const frame = partOf(objects, 'free-mark')[0]!
          const label = partOf(objects, 'free-label')[0]!
          const labelWidth =
            measureRunWidth(String(label.text), label.fontSize!, {
              fontFamily: 'PT Serif',
              fontWeight: 700,
            }) +
            (label.fontSize! * (label.charSpacing ?? 0) * String(label.text).length) / 1000
          expect(labelWidth).toBeLessThanOrEqual(frame.width!)

          // Never colour alone: every free square is framed in ink.
          expect(partOf(objects, 'free-mark').every((o) => o.stroke === '#000000')).toBe(true)
          const tinted = partOf(objects, 'free-mark').some((o) => o.fill === BINGO_FREE_SHADE)
          expect(tinted).toBe(freeMark !== 'double-frame')
          if (freeMark === 'double-frame') expect(partOf(objects, 'free-mark')).toHaveLength(2)

          const letters = partOf(objects, 'letter')
          expect(letters.map((o) => o.text)).toEqual([...BINGO_LETTERS])
          for (const letter of letters) expect(letter.top).toBeLessThan(plan.gridTop)
          if (header === 'solid') {
            for (const letter of letters) expect(letter.fill).toBe(STUDIO_PAPER)
          }
        })
      }
    }
  }

  it('fits every write-in line on one line beside its rule', () => {
    for (const writeIn of RETIREMENT_BINGO_WRITE_INS) {
      for (const rules of BINGO_RULE_WEIGHTS) {
        const objects = draw({ header: 'plain', freeMark: 'tint-frame', freeLabel: 'FREE', rules, writeIn })
        assertObjectsInSafeMargin(objects, ctx)
        const [label, rule] = partOf(objects, 'write-in')
        expect(String(label!.text)).not.toMatch(/ /) // NBSP-joined: never wraps
        expect(rule).toBeDefined()
        expect(rule!.left).toBeGreaterThan(label!.left + label!.width!)
      }
    }
  })
})

describe('retirement bingo preflight', () => {
  const ctx = kdpCtx(6, 9)
  const plan = planFor(base, ctx)
  const card = (): RetirementBingoMoment[] =>
    selectRetirementBingoMoments({ deck: deckFor(salt(3), plan), rng: rngFor(salt(3), 5) })
  const check = (moments: RetirementBingoMoment[]) =>
    runRetirementBingoKdpPreflight({ moments, plan, lines: plan.lines, font: 'PT Serif' })

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

describe('retirement bingo phrase wrapping', () => {
  const spec = { fontFamily: 'PT Serif' }

  it('uses the fewest lines, broken evenly rather than greedily', () => {
    const text = 'Took the long way home'
    const width = measureRunWidth('Took the long', 16, spec) + 1
    const lines = wrapBingoPhrase(text, 16, width, spec)!
    expect(lines.join(' ')).toBe(text)
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(measureRunWidth(line, 16, spec)).toBeLessThanOrEqual(width)
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
