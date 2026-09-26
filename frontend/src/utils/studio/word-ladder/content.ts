import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { WL_CLUES, WL_LADDERS_BY_LEVEL, type WlLadder, type WlLevel } from './ladders'

export type { WlLadder, WlLevel } from './ladders'

/**
 * What a Word Ladder page shows, and how each page's ladders are chosen.
 *
 * A page is two or three ladders from the level's hand-written library,
 * each climbing from a word of the working week to a word of retirement.
 * Ladders are dealt from a stream keyed by the seller's puzzle salt and the
 * page seed, so two sellers on the same settings print different books and
 * the same seed reprints the same page. A book prints every ladder of its
 * level once before any comes back, and a seller's next book opens with
 * ladders their last one did not.
 */

export const WL_TEMPLATE_KEY = 'word-ladder'
export const WL_DEFAULT_TITLE = 'Word Ladder'

export const WL_BUILD_FAILED_MESSAGE = 'Could not build a Word Ladder page. Try again.'

export const WL_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for Word Ladders at large print. Pick a larger page in Settings, or an easier level.'

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export interface WlLevelSpec {
  value: WlLevel
  label: string
  /** Rungs to fill on every ladder of the level. */
  minRungs: number
  maxRungs: number
  /** Shade the square whose letter changes on each rung. */
  shadeChange: boolean
  /** Smallest letter square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is how far apart the two words are. Every rung has its own
 * clue at every level; Gentle also shades the square that changes, so the
 * reader only has to find the new letter.
 */
export const WL_LEVELS: readonly WlLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — 2 or 3 rungs, changing letter shaded', minRungs: 2, maxRungs: 3, shadeChange: true, minCell: inch(0.4) },
  { value: 'classic', label: 'Classic — 3 or 4 rungs', minRungs: 3, maxRungs: 4, shadeChange: false, minCell: inch(0.38) },
  { value: 'challenging', label: 'Challenging — 5 or 6 rungs', minRungs: 5, maxRungs: 6, shadeChange: false, minCell: inch(0.36) },
]

export const DEFAULT_WL_LEVEL: WlLevel = 'classic'

export function parseWlLevel(raw: unknown): WlLevel {
  const value = String(raw ?? '')
  return WL_LEVELS.some((l) => l.value === value) ? (value as WlLevel) : DEFAULT_WL_LEVEL
}

export const wlLevelSpec = (level: WlLevel): WlLevelSpec => WL_LEVELS.find((l) => l.value === level)!

export const wlLevelLadders = (level: WlLevel): readonly WlLadder[] => WL_LADDERS_BY_LEVEL[level]

const LADDER_INDEX = new Map(
  (Object.values(WL_LADDERS_BY_LEVEL) as (readonly WlLadder[])[]).flat().map((ladder) => [ladder.id, ladder]),
)
export const wlLadderById = (id: string) => LADDER_INDEX.get(id)

/** Every clue a level can print, for measuring the page before any is dealt. */
export const wlLevelClues = (level: WlLevel): string[] => [
  ...new Set(wlLevelLadders(level).flatMap((ladder) => wlRungs(ladder).map((word) => wlClue(word)))),
]

/* ------------------------------------------------------------------ *
 * A ladder's parts
 * ------------------------------------------------------------------ */

export const wlStart = (ladder: WlLadder) => ladder.words[0]!
export const wlFinish = (ladder: WlLadder) => ladder.words[ladder.words.length - 1]!
/** The words the reader writes in, top to bottom. */
export const wlRungs = (ladder: WlLadder) => ladder.words.slice(1, -1)
export const wlClue = (word: string) => WL_CLUES[word] ?? ''

/** Squares that differ between two words of the same length. */
export function wlChangedSquares(a: string, b: string): number[] {
  const out: number[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.push(i)
  return out
}

/** The square each rung changes from the word above it (Gentle shades it). */
export const wlChangeOf = (ladder: WlLadder, row: number) => wlChangedSquares(ladder.words[row - 1]!, ladder.words[row]!)[0]!

/** "From WORK to GOLF" — the ladder's caption, after its number. */
export const wlCaption = (ladder: WlLadder, index: number) => `${index + 1}. From ${wlStart(ladder)} to ${wlFinish(ladder)}`

/**
 * True when the ladder is sound for its level: every step changes exactly
 * one letter in place, no word repeats, every rung has a clue that does not
 * give its own word away, and the rung count is the level's.
 */
export function isValidWlLadder(ladder: WlLadder, level: WlLevel): boolean {
  const spec = wlLevelSpec(level)
  const words = ladder.words
  if (words.length < 3) return false
  const length = words[0]!.length
  if (!words.every((w) => w.length === length && /^[A-Z]+$/.test(w))) return false
  if (new Set(words).size !== words.length) return false
  for (let i = 1; i < words.length; i++) if (wlChangedSquares(words[i - 1]!, words[i]!).length !== 1) return false
  const rungs = wlRungs(ladder)
  if (rungs.length < spec.minRungs || rungs.length > spec.maxRungs) return false
  return rungs.every((word) => {
    const clue = wlClue(word)
    return clue.length > 0 && !clue.toUpperCase().includes(word)
  })
}

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const WL_INSTRUCTION = 'Change one letter on each rung to spell the word in its clue, all the way to the bottom.'
export const WL_GENTLE_HINT = ' The shaded square changes.'

export function wlInstruction(config: StudioConfig, level: WlLevel): string {
  if (config.showInstructions === false) return ''
  return wlLevelSpec(level).shadeChange ? WL_INSTRUCTION + WL_GENTLE_HINT : WL_INSTRUCTION
}

/** The label beside the last word (the caption sits beside the first). */
export const WL_FINISH_LABEL = 'Finish'

/* ------------------------------------------------------------------ *
 * Dealing a page's ladders
 * ------------------------------------------------------------------ */

/** The book's Word Ladder pages, oldest first, from their stamped labels. */
export function parseWlBook(labels: readonly string[]): string[] {
  return labels.filter((label) => wlLadderById(label) !== undefined)
}

export interface WlPageDeal {
  ladders: WlLadder[]
  /** True when a ladder the book already prints had to come back. */
  repeat: boolean
}

/**
 * The next ladders for a page.
 *
 * Least-shown in the book first, so a book walks the whole level before a
 * ladder returns; the previous page's ladders never follow themselves while
 * there are others; then ones this seller has not printed lately; then the
 * dealt order. A page never shows two ladders from the same start word or to
 * the same finish while the level has others, and prints its ladders
 * shortest first.
 */
export function pickWlLadders(options: {
  level: WlLevel
  count: number
  seed: number
  ownerSalt: string
  /** Ladder ids the book already prints, oldest first. */
  book: readonly string[]
  /** Ladder ids this seller printed lately, oldest first. */
  recent: readonly string[]
  /** Ladders already refused for this page. */
  exclude?: ReadonlySet<string>
  attempt?: number
}): WlPageDeal | null {
  const { level, count, seed, ownerSalt, book, recent, exclude, attempt = 0 } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: WL_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `deal:${attempt}`,
  })
  const pool = wlLevelLadders(level).filter((l) => !exclude?.has(l.id))
  if (pool.length < count || count < 1) return null

  const shown = new Map<string, number>()
  for (const id of book) shown.set(id, (shown.get(id) ?? 0) + 1)
  const previous = new Set(book.slice(-count))
  const recentSet = new Set(recent)
  const dealt = rng.shuffle(pool)
  const order = new Map(dealt.map((l, i) => [l.id, i]))
  const ranked = [...pool].sort((a, b) => {
    const byShown = (shown.get(a.id) ?? 0) - (shown.get(b.id) ?? 0)
    if (byShown !== 0) return byShown
    const byPrevious = Number(previous.has(a.id)) - Number(previous.has(b.id))
    if (byPrevious !== 0) return byPrevious
    const byRecent = Number(recentSet.has(a.id)) - Number(recentSet.has(b.id))
    if (byRecent !== 0) return byRecent
    return order.get(a.id)! - order.get(b.id)!
  })

  // Tier by tier (never shown, shown once, …), so keeping the page's words
  // apart never costs a ladder the book has not printed yet.
  const chosen: WlLadder[] = []
  const tiers = [...new Set(ranked.map((l) => shown.get(l.id) ?? 0))]
  for (const tier of tiers) {
    const inTier = ranked.filter((l) => (shown.get(l.id) ?? 0) === tier)
    for (const strict of [true, false]) {
      for (const ladder of inTier) {
        if (chosen.length >= count) break
        if (chosen.includes(ladder)) continue
        if (strict && chosen.some((c) => wlStart(c) === wlStart(ladder) || wlFinish(c) === wlFinish(ladder))) continue
        chosen.push(ladder)
      }
    }
  }
  if (chosen.length < count) return null

  // Shortest first, the page's easiest ladder at the top; the dealt order breaks ties.
  chosen.sort((a, b) => a.words.length - b.words.length || order.get(a.id)! - order.get(b.id)!)
  return { ladders: chosen, repeat: chosen.some((l) => shown.has(l.id)) }
}
