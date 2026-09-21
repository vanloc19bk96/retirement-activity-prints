/**
 * Instruction phrasing pools (§4.7) — the cheapest and highest-value
 * anti-duplicate lever in the system.
 *
 * Instruction text is the element most likely to be *literally identical*
 * across two sellers' books, and the element a human reviewer reads first. Two
 * books with mathematically distinct puzzles but byte-identical instruction
 * lines read as the same product.
 *
 * The variants are hand-written and live in `constants/studio-phrasing/`. They
 * are never generated at runtime by a language model: doing so would reinstate
 * the AI-content disclosure obligation and the fact-checking burden this whole
 * pack exists to avoid (§5.4).
 */

import type { StudioRng } from '../../studio-rng'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../../studio-variety'

/** Ship-blocking floor, asserted by the phrasing tests. */
export const MIN_PHRASING_VARIANTS = 10

/** One pool per mode. Every mode a template exposes needs its own. */
export type PhrasingPool = Readonly<Record<string, readonly string[]>>

/** How many recently used variants a pool refuses to repeat. */
const AVOID_WINDOW = 4

function poolKey(templateKey: string, poolName: string, mode: string): string {
  return studioVarietyKey(`${templateKey}-${poolName}`, mode)
}

/**
 * Pick a variant, preferring one this book has not printed lately.
 *
 * History lives in the Studio's existing variety store, which persists across
 * sittings — a book built over three evenings still avoids repeating itself.
 * When every variant has been used recently the pool reopens rather than
 * failing; a repeat eight pages apart is not the failure mode §4.7 guards.
 */
export function pickPhrase(options: {
  templateKey: string
  /** Pool family: `instruction`, `title`, `answerHeader`, `writeIn`. */
  poolName: string
  mode: string
  pool: readonly string[]
  rng: StudioRng
}): string {
  const { templateKey, poolName, mode, pool, rng } = options
  if (pool.length === 0) {
    throw new Error(`pickPhrase: empty ${poolName} pool for ${templateKey}/${mode}`)
  }

  const key = poolKey(templateKey, poolName, mode)
  const window = Math.min(AVOID_WINDOW, pool.length - 1)
  const recent = new Set(studioAvoidList(key, window))
  const candidates = pool.filter((_, index) => !recent.has(variantToken(index)))
  const chosen = rng.pick(candidates.length > 0 ? candidates : pool)

  rememberStudioContent(key, [variantToken(pool.indexOf(chosen))])
  return chosen
}

/**
 * Store the index, not the sentence: the variety store normalises and truncates
 * what it keeps, and two long instructions can share their first 60 characters.
 */
function variantToken(index: number): string {
  return `v${index}`
}

/** Resolve a template's pool for a mode, falling back to its default pool. */
export function poolForMode(pool: PhrasingPool, mode: string): readonly string[] {
  return pool[mode] ?? pool.default ?? []
}

/**
 * Vocabulary banned from every generated string (§2.4).
 *
 * KDP does not ban gambling content, but casino framing triggers content
 * review, muddies categorisation, and is off-brand for a memory product line.
 * A "Card Sums" page is mental arithmetic; it is never a blackjack drill.
 */
export const BANNED_GAMBLING_TERMS: readonly string[] = [
  'casino',
  'betting',
  'bet',
  'wager',
  'stake',
  'stakes',
  'chips',
  'odds',
  'blackjack',
  'poker',
  'bust',
  'dealer',
  'bankroll',
  'gamble',
  'gambling',
  'jackpot',
  'ante',
]

/**
 * Live trademarks that must never appear in generated output (§2.3).
 * The suit symbols and rank notation are public domain; these names are not.
 */
export const BANNED_DECK_BRANDS: readonly string[] = [
  'bicycle',
  'bee',
  'hoyle',
  'tally-ho',
  'tally ho',
  'waddingtons',
  'aviator',
  'copag',
]

/**
 * First banned term found in `text`, or null.
 * Whole-word matching: "stakes" is banned, "mistake" is not, and the suit
 * "spades" must not trip the "ace" of any of these.
 */
export function findBannedTerm(text: string): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9-]+/g, ' ')} `
  for (const term of [...BANNED_GAMBLING_TERMS, ...BANNED_DECK_BRANDS]) {
    if (haystack.includes(` ${term} `)) return term
  }
  return null
}
