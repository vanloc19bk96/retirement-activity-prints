import { createRng, type StudioRng } from '../studio-rng'
import { PRICE_SERIES } from './data'

/**
 * What one Price Check question is, and every rule it must pass to print.
 *
 * Every price comes from `data.ts`, which `scripts/build-price-check-data.py`
 * builds from published U.S. sources — BLS average prices, the EIA gasoline
 * table, the theatre owners' ticket averages and the USPS rate history. No
 * model writes a price, and no price is estimated, adjusted or converted: the
 * page prints the nominal figure people paid at the time, in U.S. dollars,
 * for the unit the source measured.
 *
 * One series is one item in one unit ("a pound of white bread"), so a
 * question can never mix a pound with a loaf or a half-gallon with a gallon.
 * Series that share a real-world thing (the two milks, the two gasolines) share
 * a `family`, and a page never asks about one family twice.
 *
 * The question, its four prices and its answer-key line are all derived from
 * one validated fact, so the key can only ever describe the puzzle it sits
 * under.
 */

export const PC_TEMPLATE_KEY = 'price-check'
export const PC_DEFAULT_TITLE = 'Price Check: Then & Now'

export const PC_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Price Check page. Pick a larger page in Settings.'
export const PC_BUILD_FAILED_MESSAGE = 'Could not lay out these price questions on this page. Try again.'
export const PC_BOOK_FULL_MESSAGE =
  'This book already asks every Price Check question there is. Remove a Price Check page to add another.'

export const PC_FIRST_YEAR = 1950
export const PC_LAST_YEAR = 2000
export const PC_LETTERS = ['A', 'B', 'C', 'D'] as const
export const PC_OPTION_COUNT = PC_LETTERS.length

/** `average` — a national average; `official` — one price set for the whole country. */
export type PriceBasis = 'average' | 'official'

export interface PriceSeries {
  key: string
  /** Same real-world thing in another unit or grade shares a family. */
  family: string
  /** What the question asks about, with its quantity: "a dozen large eggs". */
  item: string
  /** The quantity again, for the answer line: "a dozen". */
  unit: string
  basis: PriceBasis
  /** Where the numbers come from; not printed, kept for audit. */
  source: string
  /** U.S. nominal price in whole cents, by calendar year. */
  cents: Readonly<Record<number, number>>
}

export interface PriceFact {
  /** `series@year` — the identity a book compares, whatever the wording. */
  key: string
  series: PriceSeries
  year: number
  cents: number
}

/** The decade a page balances on; 2000 counts with the 1990s rather than as a decade of one year. */
export const decadeOf = (year: number) => Math.min(Math.floor(year / 10) * 10, 1990)

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type PriceCheckLevel = 'gentle' | 'classic'

interface LevelSpec {
  value: PriceCheckLevel
  label: string
  /** Each price is this many times the one before it (drawn per step). */
  step: readonly [number, number]
  /** Neighbouring prices, once rounded, are never closer than this ratio. */
  minRatio: number
}

export const PC_LEVELS: readonly LevelSpec[] = [
  { value: 'gentle', label: 'Gentle — prices well apart', step: [1.5, 1.85], minRatio: 1.4 },
  { value: 'classic', label: 'Classic — prices closer together', step: [1.3, 1.5], minRatio: 1.22 },
]

export function parsePcLevel(raw: unknown): PriceCheckLevel {
  const value = String(raw ?? '')
  return PC_LEVELS.some((level) => level.value === value) ? (value as PriceCheckLevel) : 'gentle'
}

const levelSpec = (level: PriceCheckLevel) => PC_LEVELS.find((l) => l.value === level)!

export function pcInstruction(): string {
  return 'Circle your best guess for each price — then compare it with today.'
}

/* ------------------------------------------------------------------ *
 * Facts
 * ------------------------------------------------------------------ */

const SERIES_KEY = /^[a-z][a-z-]*[a-z]$/
/** Nothing in the book costs more than this; a bigger figure is a data error. */
const MAX_CENTS = 10_000

/**
 * A series that can print: named, measured in a unit its own wording states,
 * and sourced. The build script writes these; this refuses a hand edit that
 * drops a unit or a source rather than printing it.
 */
export function isValidSeries(series: PriceSeries): boolean {
  if (!SERIES_KEY.test(series.key) || !SERIES_KEY.test(series.family)) return false
  if (series.basis !== 'average' && series.basis !== 'official') return false
  if (!series.source.trim()) return false
  if (!/^an? \S/.test(series.item) || !/^an? \S/.test(series.unit)) return false
  // The answer's unit must be the unit the question asked about.
  const unitWord = series.unit.split(' ').pop()!
  return series.item.includes(unitWord)
}

export function isValidFact(fact: PriceFact): boolean {
  return (
    Number.isInteger(fact.year) &&
    fact.year >= PC_FIRST_YEAR &&
    fact.year <= PC_LAST_YEAR &&
    Number.isInteger(fact.cents) &&
    fact.cents > 0 &&
    fact.cents <= MAX_CENTS &&
    fact.key === `${fact.series.key}@${fact.year}` &&
    isValidSeries(fact.series)
  )
}

function buildFacts(series: readonly PriceSeries[]): PriceFact[] {
  const seen = new Set<string>()
  const out: PriceFact[] = []
  for (const s of series) {
    if (!isValidSeries(s) || seen.has(s.key)) continue
    seen.add(s.key)
    for (const [year, cents] of Object.entries(s.cents)) {
      const fact: PriceFact = { key: `${s.key}@${year}`, series: s, year: Number(year), cents }
      if (isValidFact(fact)) out.push(fact)
    }
  }
  return out
}

/** Every fact a page may print, validated once. */
export const PRICE_FACTS: readonly PriceFact[] = buildFacts(PRICE_SERIES)
const FACT_INDEX = new Map(PRICE_FACTS.map((fact) => [fact.key, fact]))

export const factByKey = (key: string) => FACT_INDEX.get(key)

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

type Frame = (item: string, year: number) => string

/**
 * Original wording, several ways, so a page does not read as one sentence
 * repeated. "About" and "average" are for national averages; a set price
 * (postage) is asked plainly, because it was exact.
 */
const AVERAGE_FRAMES: readonly Frame[] = [
  (item, year) => `In ${year}, about how much did ${item} cost in the U.S.?`,
  (item, year) => `About what did ${item} cost in the U.S. in ${year}?`,
  (item, year) => `What was the average U.S. price of ${item} in ${year}?`,
]
const OFFICIAL_FRAMES: readonly Frame[] = [
  (item, year) => `In ${year}, how much did ${item} cost in the U.S.?`,
  (item, year) => `What did ${item} cost in the U.S. in ${year}?`,
]

const framesFor = (basis: PriceBasis) => (basis === 'official' ? OFFICIAL_FRAMES : AVERAGE_FRAMES)

export function questionText(fact: PriceFact, frame: number): string {
  const frames = framesFor(fact.series.basis)
  return frames[((frame % frames.length) + frames.length) % frames.length]!(fact.series.item, fact.year)
}

/**
 * Every wording any series can take, at a sample year — what the page's line
 * limit is proved against. Years are all four digits, so one stands for all;
 * the real question is broken again when it is placed.
 */
export function questionProbes(): string[] {
  return PRICE_SERIES.filter(isValidSeries).flatMap((series) =>
    framesFor(series.basis).map((_, frame) =>
      questionText({ key: `${series.key}@1988`, series, year: 1988, cents: 1 }, frame),
    ),
  )
}

/** The longest answer-key line each series can print, in its two halves. */
export function answerProbes(): [string, string][] {
  return PRICE_SERIES.filter(isValidSeries).map((series) =>
    answerParts({ key: `${series.key}@1988`, series, year: 1988, cents: 8888 }, true),
  )
}

/**
 * "$1.25" or "8¢". One style per question: if any choice reaches a dollar,
 * every choice is written in dollars, so no price stands out by its format.
 */
export function formatPrice(cents: number, dollars: boolean): string {
  return dollars ? `$${(cents / 100).toFixed(2)}` : `${cents}¢`
}

export const usesDollars = (options: readonly number[]) => options.some((c) => c >= 100)

/**
 * "About $1.25 a gallon (U.S. average)" — the line the answer page sets under
 * the ringed choice, as its two halves: the figure, and what it is. A line
 * that must break breaks between them, never inside "(U.S. average)". The
 * letter is left to the ring and the year to the question just above it.
 */
export function answerParts(fact: PriceFact, dollars: boolean): [string, string] {
  const price = formatPrice(fact.cents, dollars)
  const { unit, basis } = fact.series
  return basis === 'official'
    ? [`${price} ${unit}`, '(official U.S. rate)']
    : [`About ${price} ${unit}`, '(U.S. average)']
}

/** "B — About $1.25 a gallon (U.S. average)": the whole answer, for checking. */
export function answerText(fact: PriceFact, letter: string, dollars: boolean): string {
  return `${letter} — ${answerParts(fact, dollars).join(' ')}`
}

/* ------------------------------------------------------------------ *
 * Choices
 * ------------------------------------------------------------------ */

/** Cheapest a choice may be: a price of a cent or nothing is not a guess. */
const MIN_CHOICE_CENTS = 2
/** Neighbouring choices under a dollar differ by at least this much. */
const MIN_CHOICE_GAP_CENTS = 2
const CHOICE_TRIES = 16

/**
 * Four ascending prices with the true one at `rank`.
 *
 * The others are the true price stepped down and up by a ratio from its
 * neighbour, so they scale with it: a 1955 stamp's choices are a few cents apart, a 1995 movie
 * ticket's a dollar or two. Steps are drawn per gap, so the choices are not an
 * even ladder a reader can solve by arithmetic. A set is refused when two
 * rounded choices sit too close to tell apart, or a choice falls below two
 * cents — then the true price cannot sit at that rank.
 */
export function buildChoices(
  cents: number,
  rank: number,
  level: PriceCheckLevel,
  rng: StudioRng,
): number[] | null {
  const { step } = levelSpec(level)
  const draw = () => step[0] + rng.next() * (step[1] - step[0])
  for (let attempt = 0; attempt < CHOICE_TRIES; attempt++) {
    const options = new Array<number>(PC_OPTION_COUNT)
    options[rank] = cents
    // Each step is a ratio, but never less than two cents: 3¢, 4¢ and 5¢ are
    // not three different guesses.
    for (let i = rank - 1; i >= 0; i--) {
      options[i] = Math.min(Math.round(options[i + 1]! / draw()), options[i + 1]! - MIN_CHOICE_GAP_CENTS)
    }
    for (let i = rank + 1; i < PC_OPTION_COUNT; i++) {
      options[i] = Math.max(Math.round(options[i - 1]! * draw()), options[i - 1]! + MIN_CHOICE_GAP_CENTS)
    }
    if (choicesAreFair(options, cents, level)) return options
  }
  return null
}

/** One right answer, three plainly different wrong ones, in ascending order. */
export function choicesAreFair(options: readonly number[], cents: number, level: PriceCheckLevel): boolean {
  const { minRatio } = levelSpec(level)
  if (options.length !== PC_OPTION_COUNT) return false
  if (options.filter((o) => o === cents).length !== 1) return false
  if (options.some((o) => !Number.isInteger(o) || o < MIN_CHOICE_CENTS || o > MAX_CENTS * 20)) return false
  for (let i = 1; i < options.length; i++) {
    const low = options[i - 1]!
    const high = options[i]!
    // A little slack for rounding to the cent; the draw aims well above it.
    if (high / low < minRatio - 0.02) return false
    if (high - low < MIN_CHOICE_GAP_CENTS) return false
  }
  return true
}

/* ------------------------------------------------------------------ *
 * Choosing a page's facts
 * ------------------------------------------------------------------ */

/** Years inside which two facts about one family count as the same question. */
const NEAR_YEARS = 3

/**
 * True when `fact` would read as a repeat of `other`: the same thing (family)
 * in a neighbouring year, or at the very same price — three 1950s stamps are
 * one question at 3¢, whatever their years.
 */
export function factsRepeat(fact: PriceFact, other: PriceFact): boolean {
  if (fact.key === other.key) return true
  if (fact.series.family !== other.series.family) return false
  return Math.abs(fact.year - other.year) <= NEAR_YEARS || fact.cents === other.cents
}

/** Facts the book already prints, from the labels its pages carry. */
export function bookFacts(labels: readonly string[]): PriceFact[] {
  const out: PriceFact[] = []
  for (const label of labels) {
    const fact = factByKey(label.trim())
    if (fact) out.push(fact)
  }
  return out
}

/**
 * The facts for one page.
 *
 * Each pick goes to the decade the page has used least; among those, to the
 * decade with the fewest item families left, because the 1950s and 1960s can
 * only be asked about through stamps, gasoline and the movies, and a page
 * that spends those on the 1990s has nothing left for them. Within the decade
 * it takes the family the book has asked about least, so a long book rotates
 * through bread, eggs, coffee and the rest instead of asking about stamps on
 * every page. Ties go to the seed.
 *
 * Nothing already in the book is ever repeated exactly. Near-repeats of the
 * book (the same family a few years apart, or the same price again) are avoided
 * while the pool allows, and only allowed once a long book has used everything
 * else. Returns up to `count` facts in pick order, so a page that must print
 * fewer keeps the most varied ones.
 */
export function pickFacts(options: {
  count: number
  seed: number
  book?: readonly PriceFact[]
}): PriceFact[] {
  const { count, seed, book = [] } = options
  const rng = createRng(seed)
  const printed = new Set(book.map((fact) => fact.key))
  const fresh = PRICE_FACTS.filter((fact) => !printed.has(fact.key))
  const strict = fresh.filter((fact) => !book.some((other) => factsRepeat(fact, other)))
  const bookUse = new Map<string, number>()
  for (const fact of book) bookUse.set(fact.series.family, (bookUse.get(fact.series.family) ?? 0) + 1)

  const picked: PriceFact[] = []
  const pageUse = (decade: number) => picked.filter((kept) => decadeOf(kept.year) === decade).length
  const least = <T>(items: readonly T[], score: (item: T) => number): T[] => {
    const low = Math.min(...items.map(score))
    return items.filter((item) => score(item) === low)
  }

  for (const pool of [strict, fresh]) {
    const shuffled = rng.shuffle(pool)
    while (picked.length < count) {
      const open = shuffled.filter(
        (fact) => !picked.some((kept) => kept.series.family === fact.series.family || factsRepeat(fact, kept)),
      )
      if (open.length === 0) break
      const familiesIn = (decade: number) =>
        new Set(open.filter((fact) => decadeOf(fact.year) === decade).map((fact) => fact.series.family)).size
      const decades = least(least([...new Set(open.map((fact) => decadeOf(fact.year)))], pageUse), familiesIn)
      const decade = rng.pick(decades)
      const inDecade = open.filter((fact) => decadeOf(fact.year) === decade)
      const families = least([...new Set(inDecade.map((fact) => fact.series.family))], (family) => bookUse.get(family) ?? 0)
      const family = rng.pick(families)
      // First in shuffled order: a random year for that family.
      picked.push(inDecade.find((fact) => fact.series.family === family)!)
    }
  }
  return picked
}

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

export interface PriceQuestion {
  fact: PriceFact
  question: string
  /** Four prices in cents, cheapest first. */
  options: number[]
  /** Index into `options` (and `PC_LETTERS`) of the true price. */
  correct: number
  dollars: boolean
  answer: string
}

/**
 * Turn picked facts into questions, dealing answer letters so a page never
 * leans on one of them.
 *
 * Letters come off a shuffled A–D deck, refilled when it runs out; a fact whose
 * price cannot sit at the dealt letter (a 3¢ stamp has no room for three
 * cheaper choices) takes the next letter it can use. Wording rotates from a
 * random start so neighbouring questions never share a frame.
 */
export function buildQuestions(
  facts: readonly PriceFact[],
  level: PriceCheckLevel,
  seed: number,
): PriceQuestion[] {
  const rng = createRng(seed ^ 0x70636b31)
  const out: PriceQuestion[] = []
  let deck: number[] = []
  let frame = rng.int(0, 5)
  let lastRank = -1

  for (const fact of facts) {
    if (deck.length === 0) deck = rng.shuffle([0, 1, 2, 3])
    // Dealt letter first, then the rest of the deck, then any other letter.
    const order = [...deck, ...[0, 1, 2, 3].filter((r) => !deck.includes(r))]
    const ranked = order.filter((r) => r !== lastRank).concat(order.filter((r) => r === lastRank))
    let built: { rank: number; options: number[] } | null = null
    for (const rank of ranked) {
      const options = buildChoices(fact.cents, rank, level, rng)
      if (options) {
        built = { rank, options }
        break
      }
    }
    if (!built) continue
    deck = deck.filter((r) => r !== built!.rank)
    lastRank = built.rank
    const dollars = usesDollars(built.options)
    out.push({
      fact,
      question: questionText(fact, frame++),
      options: built.options,
      correct: built.rank,
      dollars,
      answer: answerText(fact, PC_LETTERS[built.rank]!, dollars),
    })
  }
  return out
}

/**
 * Re-prove a question from its fact: the fact is one the dataset holds at
 * this price, the true price is among the choices exactly once at `correct`,
 * the choices are fair for the level, and the answer line names the right
 * letter, price, unit and year.
 */
export function isValidQuestion(q: PriceQuestion, level: PriceCheckLevel): boolean {
  const fact = factByKey(q.fact.key)
  if (!fact || fact.cents !== q.fact.cents || fact.year !== q.fact.year) return false
  if (!isValidFact(fact)) return false
  if (q.options[q.correct] !== fact.cents) return false
  if (!choicesAreFair(q.options, fact.cents, level)) return false
  if (q.dollars !== usesDollars(q.options)) return false
  if (q.answer !== answerText(fact, PC_LETTERS[q.correct]!, q.dollars)) return false
  return q.question.includes(String(fact.year)) && q.question.includes(fact.series.item)
}
