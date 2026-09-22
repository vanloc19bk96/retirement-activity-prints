import type { StudioRng } from '@/utils/studio/studio-rng'
import {
  interleavedCandidateStarts,
  isBackwardsWrite,
  isDiagonalDir,
  isLongForDiagonal,
  meetsMix,
  mixScore,
  mixTargets,
  type PlacementMix,
} from './mix'
import type {
  Dir,
  Placement,
  WordEntry,
  WordSearchDifficulty,
  WordSearchPuzzle,
} from './types'

export type {
  Dir,
  Placement,
  WordEntry,
  WordSearchDifficulty,
  WordSearchPuzzle,
} from './types'

const DIRS_EASY: readonly Dir[] = [
  { dr: 0, dc: 1, name: 'E' },
  { dr: 1, dc: 0, name: 'S' },
]

const DIRS_MEDIUM: readonly Dir[] = [
  ...DIRS_EASY,
  { dr: 1, dc: 1, name: 'SE' },
  { dr: 1, dc: -1, name: 'SW' },
]

const DIRS_HARD: readonly Dir[] = [
  ...DIRS_MEDIUM,
  { dr: 0, dc: -1, name: 'W' },
  { dr: -1, dc: 0, name: 'N' },
  { dr: -1, dc: -1, name: 'NW' },
  { dr: -1, dc: 1, name: 'NE' },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const BLOCKED_CELL = '\u0000'

export type WordSearchCellMask = readonly (readonly boolean[])[]

/**
 * Cap DFS work so dense custom lists (14–15 grids, hard dirs) cannot freeze the UI.
 * Crossword uses the same pattern (`MAX_BACKTRACK_NODES`).
 */
const MAX_BACKTRACK_NODES = 12_000
/** Shared across grow/trim retries in one `resolveWordSearch` call. */
const MAX_RESOLVE_NODES = 48_000
/** Fresh shuffles at a given size before growing the grid / trimming the list. */
const PLACEMENT_RESTARTS = 3

interface NodeBudget {
  remaining: number
}

export function directionsForDifficulty(difficulty: WordSearchDifficulty): readonly Dir[] {
  if (difficulty === 'easy') return DIRS_EASY
  if (difficulty === 'hard') return DIRS_HARD
  return DIRS_MEDIUM
}

export function reverseWord(word: string): string {
  return [...word].reverse().join('')
}

export interface SanitizeWordOptions {
  gridSize: number
  minLetters?: number
  maxLetters?: number
}

function rawLines(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((w) => String(w))
  return String(raw ?? '')
    .split(/[\n,]+/)
    .map((w) => w.trim())
}

/**
 * Collapse spaces, keep a clean display string, and build an A–Z grid token
 * (spaces / hyphens / apostrophes stripped). English V1 — no accent stripping.
 */
export function sanitizeWordEntry(
  input: string,
  options: SanitizeWordOptions,
): WordEntry | null {
  const display = input.trim().replace(/\s+/g, ' ')
  if (!display) return null

  const token = display
    .toUpperCase()
    .replace(/[\s'\u2019-]/g, '')
    .replace(/[^A-Z]/g, '')

  const minLetters = options.minLetters ?? 3
  const maxLetters = Math.max(
    minLetters,
    options.maxLetters ?? Math.min(12, options.gridSize),
  )
  if (token.length < minLetters || token.length > maxLetters) return null
  // Reject if non-letter junk remained after strip (e.g. digits, accents).
  const lettersOnly = display.toUpperCase().replace(/[\s'\u2019-]/g, '')
  if (lettersOnly !== token) return null

  return { display, token }
}

/** WordEntry pipeline — length-bounded, deduped by token, order preserved. */
export function sanitizeWordEntries(
  raw: unknown,
  options: SanitizeWordOptions,
): WordEntry[] {
  const seen = new Set<string>()
  const out: WordEntry[] = []
  for (const line of rawLines(raw)) {
    const entry = sanitizeWordEntry(line, options)
    if (!entry) continue
    if (seen.has(entry.token)) continue
    seen.add(entry.token)
    out.push(entry)
  }
  return out
}

/** Uppercase A–Z tokens only — length 3–gridSize, deduped, order preserved. */
export function sanitizeWords(raw: unknown, gridSize: number): string[] {
  return sanitizeWordEntries(raw, { gridSize }).map((e) => e.token)
}

function emptyGrid(size: number, mask?: WordSearchCellMask): (string | null)[][] {
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (mask && !mask[r]?.[c] ? BLOCKED_CELL : null)),
  )
}

function canPlace(
  grid: (string | null)[][],
  word: string,
  r: number,
  c: number,
  dir: Dir,
): boolean {
  for (let i = 0; i < word.length; i++) {
    const cell = grid[r + dir.dr * i]![c + dir.dc * i]!
    if (cell !== null && cell !== word[i]) return false
  }
  return true
}

function writeWord(
  grid: (string | null)[][],
  word: string,
  r: number,
  c: number,
  dir: Dir,
): () => void {
  const undo: { r: number; c: number; prev: string | null }[] = []
  for (let i = 0; i < word.length; i++) {
    const rr = r + dir.dr * i
    const cc = c + dir.dc * i
    undo.push({ r: rr, c: cc, prev: grid[rr]![cc]! })
    grid[rr]![cc] = word[i]!
  }
  return () => {
    for (const cell of undo) {
      grid[cell.r]![cell.c] = cell.prev
    }
  }
}

function fillEmptyCells(grid: (string | null)[][], rng: StudioRng): string[][] {
  return grid.map((row) =>
    row.map((cell) =>
      cell === BLOCKED_CELL ? '' : (cell ?? LETTERS[rng.int(0, LETTERS.length - 1)]!),
    ),
  )
}

/** Read letters along a placement (may be reverse of listed word when hard-mode flipped). */
export function readWord(grid: string[][], placement: Placement): string {
  const chars: string[] = []
  for (let i = 0; i < placement.word.length; i++) {
    chars.push(
      grid[placement.r + placement.dir.dr * i]![placement.c + placement.dir.dc * i]!,
    )
  }
  return chars.join('')
}

export function placementMatchesWord(grid: string[][], placement: Placement): boolean {
  const letters = readWord(grid, placement)
  return letters === placement.word || letters === reverseWord(placement.word)
}

export function countPuzzleMix(grid: string[][], placements: Placement[]): PlacementMix {
  let diagonal = 0
  let backwards = 0
  for (const placement of placements) {
    if (isDiagonalDir(placement.dir)) diagonal += 1
    if (isBackwardsWrite(placement.dir, readWord(grid, placement), placement.word)) {
      backwards += 1
    }
  }
  return { diagonal, backwards }
}

function spendNode(budget: NodeBudget): boolean {
  budget.remaining -= 1
  return budget.remaining >= 0
}

/**
 * Longest-first backtracking placement. Overlaps allowed on matching letters.
 * Returns null if words cannot all fit at this size (or the node budget is spent).
 */
export function buildWordSearch(
  words: string[],
  size: number,
  directions: readonly Dir[],
  allowReverse: boolean,
  rng: StudioRng,
  nodeBudget: NodeBudget = { remaining: MAX_BACKTRACK_NODES },
  mask?: WordSearchCellMask,
): { grid: string[][]; placements: Placement[] } | null {
  if (words.length === 0) return null
  if (words.some((w) => w.length > size)) return null
  if (nodeBudget.remaining <= 0) return null

  const sorted = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const grid = emptyGrid(size, mask)
  const placements: Placement[] = []
  const targets = mixTargets({
    wordCount: sorted.length,
    hasDiagonal: directions.some(isDiagonalDir),
    allowReverse,
  })
  let diagonalCount = 0
  let backwardsCount = 0

  function place(index: number): boolean {
    if (index === sorted.length) return true
    if (!spendNode(nodeBudget)) return false

    const original = sorted[index]!
    const reversed = reverseWord(original)
    const remaining = sorted.length - index
    const needDiagonal = targets.minDiagonal - diagonalCount
    const needBackwards = targets.minBackwards - backwardsCount
    const preferDiagonal =
      needDiagonal > 0 && (!isLongForDiagonal(original.length, size) || needDiagonal >= remaining)
    const preferBackwards = needBackwards > 0
    // Try both orientations on hard — a single coin-flip dead-end used to
    // force deep backtracking (UI jank on dense 14–15 lists).
    const pair = allowReverse && reversed !== original ? [original, reversed] : [original]
    const orientations = preferBackwards && pair.length === 2 ? [reversed, original] : rng.shuffle(pair)

    for (const toWrite of orientations) {
      const starts = interleavedCandidateStarts(
        toWrite,
        size,
        directions,
        rng,
        preferDiagonal,
      )
      for (const start of starts) {
        if (!spendNode(nodeBudget)) return false
        if (!canPlace(grid, toWrite, start.r, start.c, start.dir)) continue
        const undo = writeWord(grid, toWrite, start.r, start.c, start.dir)
        const placedDiagonal = isDiagonalDir(start.dir)
        const placedBackwards = isBackwardsWrite(start.dir, toWrite, original)
        if (placedDiagonal) diagonalCount += 1
        if (placedBackwards) backwardsCount += 1
        placements.push({ word: original, r: start.r, c: start.c, dir: start.dir })
        if (place(index + 1)) return true
        undo()
        placements.pop()
        if (placedDiagonal) diagonalCount -= 1
        if (placedBackwards) backwardsCount -= 1
      }
    }
    return false
  }

  if (!place(0)) return null
  return { grid: fillEmptyCells(grid, rng), placements }
}

/**
 * Public masked variant used by shaped word-search sheets. The classic API
 * remains unchanged for existing callers and hidden-message puzzles.
 */
export function buildMaskedWordSearch(
  words: string[],
  size: number,
  directions: readonly Dir[],
  allowReverse: boolean,
  rng: StudioRng,
  mask: WordSearchCellMask,
): { grid: string[][]; placements: Placement[] } | null {
  return buildWordSearch(
    words,
    size,
    directions,
    allowReverse,
    rng,
    { remaining: MAX_BACKTRACK_NODES },
    mask,
  )
}

function tryBuildWordSearch(
  words: string[],
  size: number,
  directions: readonly Dir[],
  allowReverse: boolean,
  rng: StudioRng,
  nodeBudget: NodeBudget,
  restarts: number = PLACEMENT_RESTARTS,
): { grid: string[][]; placements: Placement[] } | null {
  const targets = mixTargets({
    wordCount: words.length,
    hasDiagonal: directions.some(isDiagonalDir),
    allowReverse,
  })
  let best: { grid: string[][]; placements: Placement[] } | null = null
  let bestScore = -1
  for (let attempt = 0; attempt < restarts; attempt++) {
    if (nodeBudget.remaining <= 0) break
    // Per-attempt cap so one unlucky shuffle cannot burn the whole resolve budget.
    const attemptCap = Math.min(MAX_BACKTRACK_NODES, nodeBudget.remaining)
    const attemptBudget: NodeBudget = { remaining: attemptCap }
    const built = buildWordSearch(words, size, directions, allowReverse, rng, attemptBudget)
    nodeBudget.remaining -= attemptCap - attemptBudget.remaining
    if (!built) continue
    const mix = countPuzzleMix(built.grid, built.placements)
    if (meetsMix(mix, targets)) return built
    const score = mixScore(mix, targets)
    if (score > bestScore) {
      best = built
      bestScore = score
    }
  }
  return best
}

/**
 * Reliable word ceiling for one grid (≈1 word per 9 cells).
 * Denser caps (cells/6–8) often fail hard-mode placement and silently trim.
 * `validateConfig` surfaces this as a hard limit; resolve also slices to it.
 */
export function packingBudget(gridSize: number): number {
  const size = Math.max(8, Math.min(15, Math.round(gridSize)))
  return Math.max(5, Math.min(25, Math.floor((size * size) / 9)))
}

/**
 * Place every word; enlarge grid then trim word list on failure.
 * Printed clue list always matches returned `words` / `placements`.
 */
export function resolveWordSearch(options: {
  words: string[]
  gridSize: number
  difficulty: WordSearchDifficulty
  rng: StudioRng
  /** Optional display labels keyed by token (defaults to sentence-case token). */
  displaysByToken?: ReadonlyMap<string, string>
}): WordSearchPuzzle {
  const { difficulty, rng } = options
  const dirs = directionsForDifficulty(difficulty)
  const allowReverse = difficulty === 'hard'
  const requested = options.words.filter((w) => w.length <= Math.max(options.gridSize, 15))
  const nodeBudget: NodeBudget = { remaining: MAX_RESOLVE_NODES }

  let size = Math.max(8, Math.min(15, options.gridSize))
  // Longest word forces minimum size.
  const longest = requested.reduce((m, w) => Math.max(m, w.length), 0)
  size = Math.max(size, longest)

  // Prefer as many as the grid can reasonably hold; grow budget if we enlarge.
  let words = requested.slice(0, packingBudget(size))

  let built = tryBuildWordSearch(words, size, dirs, allowReverse, rng, nodeBudget)
  while (!built && size < 15) {
    size += 1
    words = requested.filter((w) => w.length <= size).slice(0, packingBudget(size))
    built = tryBuildWordSearch(words, size, dirs, allowReverse, rng, nodeBudget)
  }

  // Drop a quarter each pass — stepping by 2 on a 20-word fail is far too slow.
  while (!built && words.length > 3) {
    const nextLen = Math.max(3, Math.floor(words.length * 0.75))
    words = words.slice(0, nextLen < words.length ? nextLen : words.length - 1)
    // One shuffle each trim step — the shared node budget already bounds work.
    built = tryBuildWordSearch(words, size, dirs, allowReverse, rng, nodeBudget, 1)
  }

  if (!built) {
    // Last resort: single short word on a tiny grid (always placeable).
    words = words.slice(0, 1)
    if (words.length === 0) words = ['WORD']
    size = Math.max(words[0]!.length, 8)
    built = buildWordSearch(words, size, dirs, false, rng, { remaining: MAX_BACKTRACK_NODES })
  }

  if (!built) {
    throw new Error('word-search: failed to place words')
  }

  // Clue list = placed words only (same set, stable original order from `words`).
  const placedSet = new Set(built.placements.map((p) => p.word))
  const ordered = words.filter((w) => placedSet.has(w))
  const displays = ordered.map((token) => {
    const labeled = options.displaysByToken?.get(token)
    if (labeled) return labeled
    const lower = token.toLowerCase()
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })

  return {
    grid: built.grid,
    placements: built.placements,
    size,
    words: ordered,
    displays,
  }
}
