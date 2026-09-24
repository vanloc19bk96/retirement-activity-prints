import momentsJson from '@/data/studio/retirement-bingo/moments.json'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { createRng, deriveSeed } from '../studio-rng'
import {
  RETIREMENT_BINGO_GROUPS,
  type RetirementBingoGroup,
  type RetirementBingoTheme,
} from './themes'

/**
 * The moments a bingo card can print, and the rules a moment passes to be one.
 *
 * A bingo square is read at a glance from arm's length, often by someone
 * holding a pencil in the other hand, so the rules are about the glance: short,
 * plain, past tense, no word long enough to force the type down, nothing a
 * reader has to decode. They are checked over the whole bank in tests and over
 * every card at generate time, so a bad entry costs one square rather than a
 * page.
 *
 * The bank is written, not generated, for the same reason: the humour on a
 * retirement card lives in the gap between "warm" and "a dig", and that is not
 * a line a template can be trusted to walk.
 */

export interface RetirementBingoMoment {
  /** What the square says. Sentence case, no closing punctuation. */
  text: string
  group: RetirementBingoGroup
  /**
   * Near-duplicate key. "Slept past 9" and "Slept in on a Monday" are two
   * phrasings of one moment, and a card holding both reads as padded.
   */
  family: string
  /** Belongs on a first-year-of-retirement card. */
  firstYear: boolean
}

export const RETIREMENT_BINGO_DEFAULT_TITLE = 'Retirement Bingo'

/** The free square. Fixed on every card; never drawn from the bank. */
export const RETIREMENT_BINGO_FREE_TEXT = 'NAP'
export const RETIREMENT_BINGO_FREE_LABEL = 'FREE'

/** Grid side, and the squares a card fills around the free centre. */
export const BINGO_SIZE = 5
export const BINGO_CENTER_INDEX = Math.floor((BINGO_SIZE * BINGO_SIZE) / 2)
export const BINGO_MOMENT_COUNT = BINGO_SIZE * BINGO_SIZE - 1

/**
 * Longest phrase, in characters.
 *
 * Past this a phrase needs a fourth line in a one-inch square, or type small
 * enough that the square stops being readable from a chair. "Had coffee with no
 * rush" is 23 and sits comfortably in three short lines.
 */
export const BINGO_MAX_CHARS = 24
/** Longest single word. A word is the one thing a square cannot break. */
export const BINGO_MAX_WORD_CHARS = 10
/** A square is a moment, not a sentence. */
export const BINGO_MAX_WORDS = 5

/**
 * Fewest moments a theme may hold.
 *
 * Two full cards' worth. Below this, cards in the same book start sharing most
 * of their squares, and a reader notices the second time they cross off the
 * same thing on a different page.
 */
export const BINGO_MIN_THEME_POOL = BINGO_MOMENT_COUNT * 2

export const RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a bingo card — the squares would print ' +
  'below a comfortable reading size. Choose a larger page in Settings.'

export const RETIREMENT_BINGO_BUILD_FAILED_MESSAGE =
  'This theme did not have enough moments that fit this page to fill a card.'

/** Plain sentence copy: letters, digits, apostrophes and hyphens. */
const TEXT_PATTERN = /^[A-Z0-9][A-Za-z0-9' -]*[A-Za-z0-9]$/

/**
 * The free square says NAP; a moment that also says nap turns the free square
 * into a repeat of one of its neighbours.
 */
const NAP_PATTERN = /\bnap(s|ped|ping)?\b/i

/** Case- and space-insensitive identity, for duplicate checks. */
export function momentKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Everything wrong with one moment.
 *
 * Returned rather than thrown so the bank loader (which drops a bad entry) and
 * preflight (which refuses the card) share one set of rules, and a failing test
 * can say which rule.
 */
export function retirementBingoMomentFaults(moment: RetirementBingoMoment): string[] {
  const faults: string[] = []
  const { text } = moment

  if (!TEXT_PATTERN.test(text) || /\s{2,}/.test(text)) {
    faults.push(`"${text}" is not plain sentence copy.`)
    return faults
  }
  if (text.length > BINGO_MAX_CHARS) {
    faults.push(`"${text}" is too long for a bingo square.`)
  }
  const words = text.split(' ')
  if (words.length > BINGO_MAX_WORDS) {
    faults.push(`"${text}" has more words than a square can show at a glance.`)
  }
  if (words.some((word) => word.length > BINGO_MAX_WORD_CHARS)) {
    faults.push(`"${text}" has a word too long to fit a square without shrinking.`)
  }
  if (NAP_PATTERN.test(text)) {
    faults.push(`"${text}" repeats the free NAP square.`)
  }
  if (momentKey(text) === momentKey(RETIREMENT_BINGO_FREE_TEXT)) {
    faults.push(`"${text}" is the free square.`)
  }
  if (isUnsafeCopy(text)) {
    faults.push(`"${text}" is not suitable for a published activity book.`)
  }
  if (!moment.family) {
    faults.push(`"${text}" has no near-duplicate family.`)
  }
  return faults
}

function toMoments(group: RetirementBingoGroup, raw: unknown): RetirementBingoMoment[] {
  if (!Array.isArray(raw)) return []
  const out: RetirementBingoMoment[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record.text !== 'string') continue
    out.push({
      text: record.text,
      group,
      family: typeof record.family === 'string' ? record.family : '',
      firstYear: record.firstYear === true,
    })
  }
  return out
}

function parseBank(): RetirementBingoMoment[] {
  const json = momentsJson as Record<string, unknown>
  return RETIREMENT_BINGO_GROUPS.flatMap((group) => toMoments(group, json[group]))
}

let bankCache: RetirementBingoMoment[] | null = null

/**
 * The bank, with anything that fails its own rules — or repeats an earlier
 * entry — left out. Dropping rather than throwing: an authoring mistake should
 * cost one square, and the tests report it loudly through
 * `retirementBingoBankFaults`.
 */
export function loadRetirementBingoBank(): RetirementBingoMoment[] {
  if (bankCache) return bankCache
  const seen = new Set<string>()
  bankCache = parseBank().filter((moment) => {
    if (retirementBingoMomentFaults(moment).length > 0) return false
    const key = momentKey(moment.text)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return bankCache
}

/** Everything wrong with the bank as a whole — empty when it is clean. */
export function retirementBingoBankFaults(): string[] {
  const faults: string[] = []
  const seen = new Set<string>()
  for (const moment of parseBank()) {
    faults.push(...retirementBingoMomentFaults(moment))
    const key = momentKey(moment.text)
    if (seen.has(key)) faults.push(`The bank holds "${moment.text}" twice.`)
    seen.add(key)
  }
  return faults
}

/** The moments one theme may draw on. */
export function retirementBingoPool(theme: RetirementBingoTheme): RetirementBingoMoment[] {
  return loadRetirementBingoBank().filter(
    (moment) =>
      theme.groups.includes(moment.group) && (!theme.firstYearOnly || moment.firstYear),
  )
}

/**
 * How many squares each group gets on one card.
 *
 * As even as 24 divides, with the leftover squares handed to groups at random
 * so no group is always the one short. A card drawn freely from the pool would
 * sometimes come out as nine kitchen jobs, which reads as a chore list rather
 * than a year of retirement.
 */
function groupQuotas(
  pool: readonly RetirementBingoMoment[],
  total: number,
  rng: ReturnType<typeof createRng>,
): Map<RetirementBingoGroup, number> {
  const sizes = new Map<RetirementBingoGroup, number>()
  for (const moment of pool) sizes.set(moment.group, (sizes.get(moment.group) ?? 0) + 1)
  const groups = rng.shuffle([...sizes.keys()])
  const quotas = new Map<RetirementBingoGroup, number>()
  if (groups.length === 0) return quotas

  const base = Math.floor(total / groups.length)
  let remainder = total - base * groups.length
  for (const group of groups) {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    quotas.set(group, Math.min(sizes.get(group)!, base + extra))
  }
  return quotas
}

/**
 * The 24 moments one card prints, in reading order around the free centre.
 *
 * Seeded from the sheet's own seed, so a card is the same card every time it is
 * regenerated, and two cards in one book share only the few squares chance puts
 * on both — with a bank this deep, three or four on average rather than a
 * rearrangement of the same twenty-four.
 *
 * A card never holds two moments from one family. Groups are filled to their
 * quota first; anything a quota could not supply (a small group, a family
 * collision) is topped up from the rest of the pool, still one per family.
 * Returns fewer than 24 only when the pool genuinely cannot make a card, and
 * the caller refuses the page rather than printing gaps.
 */
export function selectRetirementBingoMoments(options: {
  pool: readonly RetirementBingoMoment[]
  seed: number
  themeId: string
}): RetirementBingoMoment[] {
  const { pool, seed, themeId } = options
  const rng = createRng(deriveSeed(seed, `retirement-bingo:${themeId}`))
  const shuffled = rng.shuffle(pool)
  const quotas = groupQuotas(pool, BINGO_MOMENT_COUNT, rng)

  const chosen: RetirementBingoMoment[] = []
  const families = new Set<string>()
  const texts = new Set<string>()
  const taken = new Map<RetirementBingoGroup, number>()

  const canTake = (moment: RetirementBingoMoment): boolean =>
    !families.has(moment.family) && !texts.has(momentKey(moment.text))
  const take = (moment: RetirementBingoMoment): void => {
    chosen.push(moment)
    families.add(moment.family)
    texts.add(momentKey(moment.text))
    taken.set(moment.group, (taken.get(moment.group) ?? 0) + 1)
  }

  for (const moment of shuffled) {
    if (chosen.length >= BINGO_MOMENT_COUNT) break
    if ((taken.get(moment.group) ?? 0) >= (quotas.get(moment.group) ?? 0)) continue
    if (canTake(moment)) take(moment)
  }
  for (const moment of shuffled) {
    if (chosen.length >= BINGO_MOMENT_COUNT) break
    if (canTake(moment)) take(moment)
  }

  // Top-ups land at the end of the list; a final shuffle keeps them from
  // collecting in the bottom row.
  return rng.shuffle(chosen)
}
