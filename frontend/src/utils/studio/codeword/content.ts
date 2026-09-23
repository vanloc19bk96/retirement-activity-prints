/**
 * Where a Codeword page gets its words, and why none of them come from an LLM.
 *
 * Every other themed word game in this library asks a model for its content,
 * because it needs *clues* — sentences no wordlist can hold. A codeword has no
 * clues at all: the grid is the clue. So the only thing this page needs is
 * words, and the app already ships sixty-one hand-curated retirement wordlists
 * for the word searches. Using those instead of the network makes this page
 * offline, instant, free to generate and impossible to fail mid-book — and it
 * removes the one route by which unreviewed copy could reach a printed page.
 *
 * The curated lists are sized for a word search (about forty entries), and the
 * thinnest of them holds only fifteen entries this game can use. A codeword
 * needs more than that: the packer has to be given substitutes, or one stubborn
 * word costs the page. So the pool is tiered — the chosen theme first, then its
 * category, then the rest of the corpus — and the selector prefers the earlier
 * tiers. A themed page still reads as themed; a thin theme borrows from its
 * neighbours rather than refusing to print.
 */

import type { StudioConfig } from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import {
  RETIREMENT_THEMES,
  getRetirementTheme,
  type RetirementThemePreset,
} from '../retirement-word-search/retirement-themes'
import { loadCuratedThemeEntries } from '../retirement-word-search/retirement-wordlists'
import {
  RETIREMENT_DEFAULT_THEME_LABEL,
  RETIREMENT_THEME_MIXED,
  parseRetirementThemeChoice,
} from '../_shared/retirement-theme-config'

/**
 * Keeps the codeword's rotating theme out of step with its neighbours'.
 *
 * A book run hands every game on a spread the same seed, so without a per-game
 * salt the crossword and the codeword on facing pages would both come out as
 * "Gardening" — two grids of the same vocabulary, one of them numbered.
 */
export const CODEWORD_THEME_SALT = 0x636f6465

export const CODEWORD_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a codeword — the grid and the number key need a wider column. ' +
  'Pick a larger page in Settings (6 x 9 in or larger works well).'

export const CODEWORD_BUILD_FAILED_MESSAGE =
  'Could not interlock enough words into a grid for this level. ' +
  'Try a fresh variation code, a different theme, or a gentler level.'

/**
 * Themes whose vocabulary a codeword cannot use.
 *
 * "Dream Destinations" is thirty-eight place names. A word search can hide
 * SANTORINI happily — the word is printed in the bank beside the grid, and the
 * solver only has to match letters. A codeword prints no words at all: every
 * answer has to be *deduced* from its letter pattern, and nobody deduces a
 * proper noun. A grid of them is not a hard codeword, it is an unfair one, and
 * it is also the shape of page that draws complaints about a book being wrong.
 */
const EXCLUDED_THEME_IDS = new Set(['dream-destinations'])

/**
 * Brand names the curated wordlists carry, which this page will not print.
 *
 * The bundled lists were written for word searches, where a nostalgia page
 * naming the tape player everyone owned is the point. A codeword prints its
 * words on the solution page of a book sold on Amazon, and a registered mark
 * set in a puzzle grid is a takedown risk that buys the page nothing: there is
 * always an ordinary word that interlocks just as well.
 *
 * Kept local to this game rather than added to the shared `isUnsafeCopy` gate,
 * which other templates' output and tests are pinned to.
 */
const BRAND_WORDS = new Set([
  'BETAMAX',
  'DISCMAN',
  'FRISBEE',
  'MIMEOGRAPH',
  'PILATES',
  'POLAROID',
  'PULLMAN',
  'SLINKY',
  'TELEX',
  'THERMOS',
  'VIEWMASTER',
  'WALKMAN',
])

/** Themes this game offers, in the shared picker's order. */
export const CODEWORD_THEMES = RETIREMENT_THEMES.filter(
  (theme) => !EXCLUDED_THEME_IDS.has(theme.id),
)

/** True when a word is barred from every codeword grid, whatever the theme. */
export function isExcludedCodewordWord(token: string): boolean {
  return BRAND_WORDS.has(token) || isUnsafeCopy(token)
}

export interface CodewordWord {
  /** A–Z run written into the grid. */
  token: string
  /** How the word is spelled for a reader — identical to the token here. */
  display: string
  /** 0 = the chosen theme, 1 = its category, 2 = the rest of the corpus. */
  tier: 0 | 1 | 2
}

export interface CodewordWordBounds {
  minLetters: number
  maxLetters: number
}

/**
 * Longest word this game will ever ask the sanitizer for.
 *
 * `loadCuratedThemeEntries` uses its `gridSize` argument only as a default
 * length ceiling, and this page always passes an explicit one, so the value
 * just has to be at least as large as the longest level.
 */
const SANITIZE_GRID_SIZE = 16

/**
 * A word this grid may print.
 *
 * Three gates, and each is something a printed page cannot recover from:
 *
 * * **Single words only.** "Raised Bed" sanitizes to the token RAISEDBED, which
 *   is not a word. A word search can hide it and print the space back in the
 *   word bank; a codeword grid has no word bank, so the solver would be asked
 *   to decode a string that spells nothing.
 * * **One letter per cell, A–Z.** Anything the sanitizer had to strip would put
 *   a glyph in the grid that no number can stand for.
 * * **Nothing that puts a KDP title at risk.** The shared gate plus this game's
 *   own brand list: losing an entry costs nothing, printing one can cost the
 *   book.
 */
function toCodewordWord(
  display: string,
  token: string,
  tier: 0 | 1 | 2,
  bounds: CodewordWordBounds,
): CodewordWord | null {
  if (!/^[A-Za-z]+$/.test(display.trim())) return null
  if (!/^[A-Z]+$/.test(token)) return null
  if (token.length < bounds.minLetters || token.length > bounds.maxLetters) return null
  if (isUnsafeCopy(display) || isExcludedCodewordWord(token)) return null
  return { token, display: token, tier }
}

function entriesForTheme(
  themeId: string,
  tier: 0 | 1 | 2,
  bounds: CodewordWordBounds,
): CodewordWord[] {
  const out: CodewordWord[] = []
  const raw = loadCuratedThemeEntries(themeId, SANITIZE_GRID_SIZE, {
    minLetters: bounds.minLetters,
    maxLetters: bounds.maxLetters,
  })
  for (const entry of raw) {
    const word = toCodewordWord(entry.display, entry.token, tier, bounds)
    if (word) out.push(word)
  }
  return out
}

/**
 * Pools are pure functions of a theme and a length band, and the form asks for
 * one on every keystroke (the level's help line re-plans the page, and
 * `validateConfig` re-checks the vocabulary). Sanitising sixty-one wordlists
 * each time is work the answer cannot change, so it is done once per band.
 */
const POOL_CACHE = new Map<string, CodewordWord[]>()

/**
 * Every word this page could print, chosen theme first.
 *
 * Deduped by token across the tiers, so a word that appears in three wordlists
 * is offered once — at the best tier it reaches — and can never be placed twice
 * in one grid.
 */
export function codewordWordPool(
  themeId: string,
  bounds: CodewordWordBounds,
): CodewordWord[] {
  const cacheKey = `${themeId}|${bounds.minLetters}|${bounds.maxLetters}`
  const cached = POOL_CACHE.get(cacheKey)
  if (cached) return cached

  const theme = getRetirementTheme(themeId)
  const seen = new Set<string>()
  const out: CodewordWord[] = []

  const add = (words: CodewordWord[]): void => {
    for (const word of words) {
      if (seen.has(word.token)) continue
      seen.add(word.token)
      out.push(word)
    }
  }

  if (!EXCLUDED_THEME_IDS.has(themeId)) add(entriesForTheme(themeId, 0, bounds))
  if (theme) {
    for (const sibling of CODEWORD_THEMES) {
      if (sibling.id === theme.id || sibling.category !== theme.category) continue
      add(entriesForTheme(sibling.id, 1, bounds))
    }
  }
  for (const other of CODEWORD_THEMES) {
    if (other.id === themeId) continue
    add(entriesForTheme(other.id, 2, bounds))
  }

  POOL_CACHE.set(cacheKey, out)
  return out
}

/**
 * The shortlist one puzzle chooses from, before coverage is considered.
 *
 * The full pool is the whole corpus — eleven hundred words — and choosing from
 * all of it would mean the theme never survives contact with the letter-
 * coverage score: there is always some word further down the list that adds one
 * more letter. So the pool is cut to a working set at the head of the tier
 * order, which is theme words first. Three times what the grid will hold is
 * enough that the choice is genuinely between alternatives, and short enough
 * that most of it is still the theme the seller picked.
 */
const WORKING_SET_MULTIPLE = 3
const WORKING_SET_MIN = 40

/**
 * How far down the working set the selector looks before it commits to a word.
 *
 * A pure greedy pass over a fixed order would print the same grid for every
 * seed on one theme; a pure shuffle would ignore letter coverage, and coverage
 * is what decides how many numbers the finished puzzle has. So each pick is
 * made from a window at the head of a seeded shuffle: wide enough that the
 * choice is genuinely between alternatives, narrow enough that the tier order
 * — and with it the theme — still shows through.
 */
const SELECT_WINDOW_MIN = 8
const SELECT_WINDOW_SHARE = 0.35

/** New letters are worth this many letters of length when scoring a candidate. */
const COVERAGE_WEIGHT = 4
/** Gentle pull back towards the head of the window, so the theme still reads. */
const ORDER_PENALTY = 0.05

/**
 * Words for one puzzle, chosen to cover as much of the alphabet as the pool
 * allows.
 *
 * Coverage is not a nicety here. The numbers on a codeword page are the
 * distinct letters in its grid, so a draw of thirteen words that happens to use
 * fourteen letters is a fourteen-number puzzle — noticeably slighter than the
 * same thirteen words drawn to cover twenty. Each pick therefore scores its
 * candidates on the letters they would add that nothing already picked carries.
 *
 * More words are returned than the grid will hold: the packer needs substitutes
 * for the ones that will not interlock, and losing a word should cost the page
 * that word, not the page.
 */
export function selectCodewordWords(options: {
  pool: readonly CodewordWord[]
  count: number
  rng: StudioRng
}): CodewordWord[] {
  const { pool, count, rng } = options
  if (pool.length === 0 || count <= 0) return []

  const tiers: CodewordWord[][] = [[], [], []]
  for (const word of pool) tiers[word.tier]!.push(word)
  const remaining = tiers
    .flatMap((tier) => rng.shuffle(tier))
    .slice(0, Math.max(WORKING_SET_MIN, count * WORKING_SET_MULTIPLE))

  const picked: CodewordWord[] = []
  const used = new Set<string>()

  while (picked.length < count && remaining.length > 0) {
    const windowSize = Math.min(
      remaining.length,
      Math.max(SELECT_WINDOW_MIN, Math.ceil(remaining.length * SELECT_WINDOW_SHARE)),
    )
    let bestIndex = 0
    let bestScore = -Infinity
    for (let i = 0; i < windowSize; i++) {
      const candidate = remaining[i]!
      let gain = 0
      for (const letter of new Set(candidate.token)) {
        if (!used.has(letter)) gain += 1
      }
      const score = gain * COVERAGE_WEIGHT + candidate.token.length - i * ORDER_PENALTY
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }
    const chosen = remaining.splice(bestIndex, 1)[0]!
    picked.push(chosen)
    for (const letter of chosen.token) used.add(letter)
  }

  return picked
}

export interface CodewordTheme {
  /** Shown as the fallback page title and used as the variety bucket. */
  label: string
  /** Wordlist the pool is built from. */
  id: string
}

/** Theme options this form offers — presets plus the rotating mix. */
export function codewordThemeSelectOptions() {
  return [
    { label: 'Mixed retirement themes', value: RETIREMENT_THEME_MIXED },
    ...CODEWORD_THEMES.map((theme) => ({ label: theme.label, value: theme.id })),
  ]
}

function mixedTheme(seed: number, salt: number): RetirementThemePreset {
  return createRng(((seed >>> 0) ^ (salt >>> 0)) >>> 0).pick(CODEWORD_THEMES)
}

/**
 * The theme one puzzle draws its words from.
 *
 * `mixed` is seeded from the puzzle's own seed, so the same sheet always
 * redraws with the same theme while consecutive pages of a book land on
 * different ones. A sheet saved against an option this form does not offer —
 * the shared picker's "write my own", or a theme this game excludes — falls
 * back to the mix rather than refusing: there is no model here to write a typed
 * theme into words, and a book row saved elsewhere must still print.
 */
export function resolveCodewordTheme(config: StudioConfig, seed: number): CodewordTheme {
  const choice = parseRetirementThemeChoice(config)
  const chosen = EXCLUDED_THEME_IDS.has(choice) ? undefined : getRetirementTheme(choice)
  const preset = chosen ?? mixedTheme(seed, CODEWORD_THEME_SALT)
  return {
    label: preset?.label ?? RETIREMENT_DEFAULT_THEME_LABEL,
    id: preset?.id ?? CODEWORD_THEMES[0]!.id,
  }
}
