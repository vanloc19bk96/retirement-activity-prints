import momentsJson from '@/data/studio/retirement-bingo/moments.json'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { findBannedTerm } from '../_shared/uniqueness'
import type { StudioRng } from '../studio-rng'
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
 * The bank is organised by *family*: one real-life moment ("slept in"), written
 * several ways ("Slept past 9", "Slept in on a Monday", "Woke up at 10"). A card
 * never holds two phrasings of one family, and each seller's account prints its
 * own phrasing of each family (`deck.ts`) — which is what keeps two sellers'
 * books from sharing their text line for line.
 *
 * Every phrase is written by a person. None is generated at runtime by a
 * language model: that would bring an AI-content disclosure and a fact-check
 * burden onto every book built with it.
 */

/** Where a moment came from — a bank group, or the seller's own list. */
export type RetirementBingoMomentGroup = RetirementBingoGroup | 'custom'

export interface RetirementBingoMoment {
  /** What the square says. Sentence case, no closing punctuation. */
  text: string
  group: RetirementBingoMomentGroup
  /** Near-duplicate key: two moments of one family never share a card. */
  family: string
  /** Belongs on a first-year-of-retirement card. */
  firstYear: boolean
}

/** One real-life moment and the ways it may be written. */
export interface RetirementBingoFamily {
  family: string
  group: RetirementBingoGroup
  firstYear: boolean
  variants: string[]
}

export const RETIREMENT_BINGO_DEFAULT_TITLE = 'Retirement Bingo'

/** The free square. Fixed on every card; never drawn from the bank. */
export const RETIREMENT_BINGO_FREE_TEXT = 'NAP'

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
 * Phrasings every family must offer.
 *
 * The per-seller phrasing pick is only worth anything if there is something to
 * pick between: with three ways to say a moment, two sellers who both deal it
 * print the same words about one time in three.
 */
export const BINGO_MIN_VARIANTS = 3

/**
 * Fewest families a theme may hold on a page size.
 *
 * Two full cards' worth. Below this, cards in the same book start sharing most
 * of their squares, and a reader notices the second time they cross off the
 * same thing on a different page.
 */
export const BINGO_MIN_THEME_FAMILIES = BINGO_MOMENT_COUNT * 2

/** Most custom moments one card mixes in, however long the seller's list. */
export const BINGO_CUSTOM_PER_CARD_MAX = 8
/** Longest custom list the form accepts. */
export const BINGO_CUSTOM_MAX = 100

export const RETIREMENT_BINGO_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a bingo card — the squares would print ' +
  'below a comfortable reading size. Choose a larger page in Settings.'

export const RETIREMENT_BINGO_BUILD_FAILED_MESSAGE =
  'This theme did not have enough moments that fit this page to fill a card.'

/** Plain sentence copy: letters, digits, apostrophes and hyphens. */
const TEXT_PATTERN = /^[A-Z0-9][A-Za-z0-9' -]*[A-Za-z0-9']$/

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
 * Everything wrong with one moment's wording.
 *
 * Returned rather than thrown so the bank loader, the custom-moment parser and
 * preflight share one set of rules, and a failing test can say which rule.
 */
export function retirementBingoTextFaults(text: string): string[] {
  const faults: string[] = []

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
  if (NAP_PATTERN.test(text) || momentKey(text) === momentKey(RETIREMENT_BINGO_FREE_TEXT)) {
    faults.push(`"${text}" repeats the free NAP square.`)
  }
  if (isUnsafeCopy(text) || findBannedTerm(text)) {
    faults.push(`"${text}" is not suitable for a published activity book.`)
  }
  return faults
}

/** A moment's wording faults, plus the bookkeeping a card relies on. */
export function retirementBingoMomentFaults(moment: RetirementBingoMoment): string[] {
  const faults = retirementBingoTextFaults(moment.text)
  if (!moment.family) faults.push(`"${moment.text}" has no near-duplicate family.`)
  return faults
}

/* --- the bank ------------------------------------------------------------ */

function parseFamilies(): RetirementBingoFamily[] {
  const groups = (momentsJson as { groups?: Record<string, unknown> }).groups ?? {}
  const out: RetirementBingoFamily[] = []
  for (const group of RETIREMENT_BINGO_GROUPS) {
    const raw = groups[group]
    if (!Array.isArray(raw)) continue
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      if (typeof record.family !== 'string' || !Array.isArray(record.variants)) continue
      out.push({
        family: record.family,
        group,
        firstYear: record.firstYear === true,
        variants: record.variants.filter((v): v is string => typeof v === 'string'),
      })
    }
  }
  return out
}

let familiesCache: RetirementBingoFamily[] | null = null

/**
 * The bank's families, each holding only the phrasings that pass their rules
 * and have not appeared earlier in the bank. A family with no phrasing left is
 * dropped. Dropping rather than throwing: an authoring mistake should cost one
 * square, and the tests report it loudly through `retirementBingoBankFaults`.
 */
export function loadRetirementBingoFamilies(): RetirementBingoFamily[] {
  if (familiesCache) return familiesCache
  const seenTexts = new Set<string>()
  const seenFamilies = new Set<string>()
  const out: RetirementBingoFamily[] = []
  for (const family of parseFamilies()) {
    if (seenFamilies.has(family.family)) continue
    const variants = family.variants.filter((text) => {
      const key = momentKey(text)
      if (seenTexts.has(key) || retirementBingoTextFaults(text).length > 0) return false
      seenTexts.add(key)
      return true
    })
    if (variants.length === 0) continue
    seenFamilies.add(family.family)
    out.push({ ...family, variants })
  }
  familiesCache = out
  return out
}

function familyMoments(family: RetirementBingoFamily): RetirementBingoMoment[] {
  return family.variants.map((text) => ({
    text,
    group: family.group,
    family: family.family,
    firstYear: family.firstYear,
  }))
}

/** Every phrasing of every family, flat. */
export function loadRetirementBingoBank(): RetirementBingoMoment[] {
  return loadRetirementBingoFamilies().flatMap(familyMoments)
}

/** Everything wrong with the bank as a whole — empty when it is clean. */
export function retirementBingoBankFaults(): string[] {
  const faults: string[] = []
  const texts = new Set<string>()
  const families = new Set<string>()
  for (const family of parseFamilies()) {
    if (families.has(family.family)) faults.push(`The bank holds family "${family.family}" twice.`)
    families.add(family.family)
    if (family.variants.length < BINGO_MIN_VARIANTS) {
      faults.push(`Family "${family.family}" needs at least ${BINGO_MIN_VARIANTS} phrasings.`)
    }
    for (const text of family.variants) {
      faults.push(...retirementBingoTextFaults(text))
      const key = momentKey(text)
      if (texts.has(key)) faults.push(`The bank holds "${text}" twice.`)
      texts.add(key)
    }
  }
  return faults
}

function inTheme(family: RetirementBingoFamily, theme: RetirementBingoTheme): boolean {
  return theme.groups.includes(family.group) && (!theme.firstYearOnly || family.firstYear)
}

/** The families one theme may draw on. */
export function retirementBingoThemeFamilies(
  theme: RetirementBingoTheme,
): RetirementBingoFamily[] {
  return loadRetirementBingoFamilies().filter((family) => inTheme(family, theme))
}

/** Every phrasing one theme may draw on. */
export function retirementBingoPool(theme: RetirementBingoTheme): RetirementBingoMoment[] {
  return retirementBingoThemeFamilies(theme).flatMap(familyMoments)
}

/* --- the seller's own moments ------------------------------------------- */

export interface RejectedCustomMoment {
  text: string
  reason: string
}

/**
 * What a seller typed, tidied the way they meant it: spaces collapsed, closing
 * punctuation dropped, first letter capitalised. "slept till noon!" is a fine
 * moment; refusing it over a capital letter would be the form being pedantic.
 */
export function normalizeCustomMoment(raw: string): string {
  const tidy = raw
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim()
  return tidy ? tidy[0]!.toUpperCase() + tidy.slice(1) : ''
}

/**
 * The seller's own moments, checked against the same rules as the bank.
 *
 * Nothing here blocks generate. A moment that breaks a rule is set aside with
 * the reason, and the form lists those under the field, so a seller learns what
 * was skipped and why instead of finding a card without it.
 */
export function parseCustomMoments(value: unknown): {
  moments: RetirementBingoMoment[]
  rejected: RejectedCustomMoment[]
} {
  const lines = Array.isArray(value)
    ? value.map((line) => String(line ?? ''))
    : String(value ?? '').split(/\r?\n/)
  const moments: RetirementBingoMoment[] = []
  const rejected: RejectedCustomMoment[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const text = normalizeCustomMoment(line)
    if (!text) continue
    const key = momentKey(text)
    if (seen.has(key)) continue
    seen.add(key)
    if (moments.length >= BINGO_CUSTOM_MAX) {
      rejected.push({ text, reason: `only the first ${BINGO_CUSTOM_MAX} are used` })
      continue
    }
    const faults = retirementBingoTextFaults(text)
    if (faults.length > 0) {
      rejected.push({ text, reason: customFaultReason(faults[0]!) })
      continue
    }
    moments.push({ text, group: 'custom', family: `custom:${key}`, firstYear: true })
  }
  return { moments, rejected }
}

/** The fault, reworded for the person who typed the moment. */
function customFaultReason(fault: string): string {
  if (fault.includes('too long for a bingo square')) return `keep it to ${BINGO_MAX_CHARS} letters`
  if (fault.includes('more words')) return `keep it to ${BINGO_MAX_WORDS} words`
  if (fault.includes('word too long')) return 'a word is too long for a square'
  if (fault.includes('NAP')) return 'the NAP square is already free'
  if (fault.includes('not suitable')) return 'not suitable for a published book'
  return 'use plain letters and numbers only'
}

/**
 * How many of the seller's moments go on each card.
 *
 * About a third of the list, so a short list does not print the same custom
 * squares on every page, and never more than a third of the card, so the
 * seller's moments season the card rather than replace it.
 */
export function customMomentsPerCard(count: number): number {
  return Math.min(BINGO_CUSTOM_PER_CARD_MAX, Math.ceil(count / 3))
}

/* --- dealing one card ---------------------------------------------------- */

/**
 * How many squares each group gets on one card.
 *
 * As even as the count divides, with the leftover squares handed to groups at
 * random so no group is always the one short. A card drawn freely from the deck
 * would sometimes come out as nine kitchen jobs, which reads as a chore list
 * rather than a year of retirement.
 */
function groupQuotas(
  deck: readonly RetirementBingoMoment[],
  total: number,
  rng: StudioRng,
): Map<RetirementBingoMomentGroup, number> {
  const sizes = new Map<RetirementBingoMomentGroup, number>()
  for (const moment of deck) sizes.set(moment.group, (sizes.get(moment.group) ?? 0) + 1)
  const groups = rng.shuffle([...sizes.keys()])
  const quotas = new Map<RetirementBingoMomentGroup, number>()
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
 * `rng` is the page's salted stream, so a card is the same card every time its
 * page is regenerated and a different card for every other seller. The
 * seller's own moments go in first, up to their share; the rest is dealt from
 * the seller's deck, balanced across groups.
 *
 * A card never holds two moments from one family. Groups are filled to their
 * quota first; anything a quota could not supply (a small group, a family
 * collision) is topped up from the rest of the deck, still one per family.
 * Returns fewer than 24 only when the deck genuinely cannot make a card, and
 * the caller refuses the page rather than printing gaps.
 */
export function selectRetirementBingoMoments(options: {
  deck: readonly RetirementBingoMoment[]
  custom?: readonly RetirementBingoMoment[]
  rng: StudioRng
}): RetirementBingoMoment[] {
  const { deck, custom = [], rng } = options

  const chosen: RetirementBingoMoment[] = []
  const families = new Set<string>()
  const texts = new Set<string>()
  const taken = new Map<RetirementBingoMomentGroup, number>()

  const canTake = (moment: RetirementBingoMoment): boolean =>
    !families.has(moment.family) && !texts.has(momentKey(moment.text))
  const take = (moment: RetirementBingoMoment): void => {
    chosen.push(moment)
    families.add(moment.family)
    texts.add(momentKey(moment.text))
    taken.set(moment.group, (taken.get(moment.group) ?? 0) + 1)
  }

  for (const moment of rng.shuffle(custom)) {
    if (chosen.length >= customMomentsPerCard(custom.length)) break
    if (canTake(moment)) take(moment)
  }

  const shuffled = rng.shuffle(deck)
  const quotas = groupQuotas(deck, BINGO_MOMENT_COUNT - chosen.length, rng)
  for (const moment of shuffled) {
    if (chosen.length >= BINGO_MOMENT_COUNT) break
    if ((taken.get(moment.group) ?? 0) >= (quotas.get(moment.group) ?? 0)) continue
    if (canTake(moment)) take(moment)
  }
  for (const moment of shuffled) {
    if (chosen.length >= BINGO_MOMENT_COUNT) break
    if (canTake(moment)) take(moment)
  }

  // Custom moments and top-ups land at the ends of the list; a final shuffle
  // keeps either from collecting in one row.
  return rng.shuffle(chosen)
}
