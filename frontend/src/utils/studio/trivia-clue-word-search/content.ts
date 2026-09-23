import type { WordEntry } from '@/utils/puzzles/word-search-core'
import type {
  TriviaClueItem,
  TriviaCluesResponse,
} from '@/types/studio-trivia-clues.types'
import { isPalindrome, isUnsafeCopy } from '../retirement-word-search/content-quality'

export const TRIVIA_DEFAULT_TITLE = 'Trivia Word Search'

export const TRIVIA_AI_EMPTY_MESSAGE =
  'We could not write enough clear trivia clues for this theme. Try again, or pick a broader theme.'

export const TRIVIA_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a trivia clue word search at this level. Pick a larger page in Settings, or a gentler level.'

export const TRIVIA_BUILD_FAILED_MESSAGE =
  'Could not fit these answers into a grid. Try again, or pick a broader theme.'

/** The API contract's pool ceiling — mirrors `limits.poolSize` in prompt.json. */
export const TRIVIA_POOL_SIZE = 32

/**
 * One clue and the answer it resolves to, ready to place and print.
 *
 * `token` is both the grid run and the label the solution prints, because a
 * trivia answer is a single A–Z word. Nothing here carries a separate display
 * string: the moment the two could differ, the letter count printed after the
 * clue would stop describing the cells a solver has to find.
 */
export interface TriviaEntry extends WordEntry {
  clue: string
}

/**
 * Pairs to ask for when the page prints `need`.
 *
 * Over-requesting is one field in the same call, and it is the only defence
 * against a page that comes back short after the gates below have run. It also
 * gives the placement ladder room to swap a stubborn answer out rather than
 * print fewer clues than the form promised.
 */
export function candidateCountFor(need: number): number {
  return Math.min(TRIVIA_POOL_SIZE, Math.max(need + 8, Math.ceil(need * 1.8)))
}

/** Answer as the page prints it after a clue: "3. Where roses grow (6)". */
export function formatClueLine(number: number, entry: TriviaEntry): string {
  return `${number}. ${entry.clue} (${entry.token.length})`
}

/** Solution line for one numbered answer: "3. GARDEN". */
export function formatAnswerLine(number: number, entry: TriviaEntry): string {
  return `${number}. ${entry.token}`
}

function normalizeAnswer(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  // Single A–Z word only. A phrase would print a letter count the grid does
  // not agree with, and a reader who counts before searching is this book's.
  if (!/^[A-Za-z]+$/.test(text)) return null
  return text.toUpperCase()
}

function normalizeClue(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    // Any length hint the writer added; the page computes its own from the
    // grid, and two disagreeing counts on one line is worse than none.
    .replace(/\s*\(\s*\d+\s*(letters?)?\s*\)\s*$/i, '')
    .trim()
}

/**
 * A clue that prints its own answer, or an obvious stem of it.
 *
 * The backend drops these too. It is repeated here because a clue is the one
 * thing on this page a solver cannot check against anything else: if it hands
 * the answer over, the page has a grid and no puzzle.
 */
export function clueEchoesAnswer(token: string, clue: string): boolean {
  const upper = clue.toUpperCase()
  if (upper.includes(token)) return true
  return token.length >= 5 && upper.includes(token.slice(0, -1))
}

/**
 * Two answers a solver would treat as one.
 *
 * GARDEN inside GARDENING is not a duplicate in a clue list, but it is one in
 * the grid: circling the longer answer circles the shorter, so the page has two
 * clues with a single mark and a key that looks wrong.
 */
function dropContained(entries: TriviaEntry[]): TriviaEntry[] {
  const longestFirst = [...entries].sort(
    (a, b) => b.token.length - a.token.length || a.token.localeCompare(b.token),
  )
  const kept: TriviaEntry[] = []
  for (const entry of longestFirst) {
    if (kept.some((other) => other.token.includes(entry.token))) continue
    kept.push(entry)
  }
  return kept
}

export interface TriviaPoolOptions {
  minLetters: number
  maxLetters: number
  /** Characters a clue may run to before the printed column cannot hold it. */
  maxClueChars: number
  /**
   * Measured line count for one clue on the page being laid out, when the
   * column width is known. Clues that would take more lines than the page
   * reserved are dropped while substitutes remain.
   */
  clueLines?: (clue: string) => number
  maxClueLines?: number
}

/**
 * Normalize the writer's pairs into printable, placeable clue entries.
 *
 * Everything dropped here is dropped because the page cannot print it honestly
 * — not because it is unusual. Order is preserved: the caller decides the
 * printed sequence, and it is not alphabetical, because an alphabetical clue
 * list tells a solver the first letter of every answer.
 */
export function selectTriviaEntries(
  raw: unknown,
  options: TriviaPoolOptions,
): TriviaEntry[] {
  const { minLetters, maxLetters, maxClueChars, clueLines, maxClueLines } = options
  const items = Array.isArray(raw) ? raw : []
  const seenTokens = new Set<string>()
  const seenClues = new Set<string>()
  const entries: TriviaEntry[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const pair = item as Partial<TriviaClueItem> & { word?: unknown }
    const token = normalizeAnswer(pair.answer ?? pair.word)
    if (!token) continue
    if (token.length < minLetters || token.length > maxLetters) continue
    if (isPalindrome(token)) continue
    if (seenTokens.has(token)) continue

    const clue = normalizeClue(pair.clue)
    if (!clue || clue.length > maxClueChars) continue
    if (clueEchoesAnswer(token, clue)) continue
    if (isUnsafeCopy(clue) || isUnsafeCopy(token)) continue
    if (clueLines && maxClueLines != null && clueLines(clue) > maxClueLines) continue

    // Two clues that read alike are two clues a solver cannot tell apart,
    // whatever the answers behind them are.
    const clueKey = clue.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    if (seenClues.has(clueKey)) continue

    seenTokens.add(token)
    seenClues.add(clueKey)
    entries.push({ token, display: token, clue })
  }

  return dropContained(entries)
}

export function parseRemotePayload(raw: unknown): TriviaCluesResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const pairs = items.filter(
    (item): item is TriviaClueItem =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as TriviaClueItem).answer === 'string' &&
      typeof (item as TriviaClueItem).clue === 'string',
  )
  return pairs.length > 0 ? { items: pairs } : null
}
