import {
  countPuzzleMix,
  countTokenReadings,
  directionsForDifficulty,
  isBackslashDir,
  isDiagonalDir,
  isSlashDir,
  meetsMix,
  mixTargets,
  type Dir,
  type Placement,
  type WordEntry,
  type WordSearchPuzzle,
} from '@/utils/puzzles/word-search-core'
import { createRng, type StudioRng } from '../studio-rng'
import { sortForBank, type NormalizedMessage } from './content'
import type { HiddenMessageLevel } from './levels'
import { allStarts, sampleStarts } from './starts'

/**
 * Filling a hidden-message grid is an arithmetic problem wearing a puzzle's
 * clothes.
 *
 * A plain word search places what words it can and scatters random letters over
 * the rest. Here there is no filler: every cell the words do not claim holds one
 * letter of the saying, in reading order. So the words must consume the grid
 * *exactly* — one cell too few and the saying runs off the end, one too many and
 * it stops short — and a page that gets this wrong is not a slightly worse
 * puzzle, it is an unsolvable one with a wrong answer key.
 *
 * Everything below exists to make that exactness safe rather than lucky: the
 * endgame rule that never strands an unfillable remainder, the backtracking that
 * un-places a word rather than giving up on the sheet, and the verification pass
 * that refuses to return a grid it cannot prove.
 */

/** Distinct word subsets tried before a build is abandoned. */
const PLACE_ATTEMPTS = 48
/** Random starts sampled per word per step, when an exact fit is not required. */
const FILL_SAMPLE = 28
/** Place / un-place steps one attempt may spend before it is called stuck. */
const MAX_STEPS = 200

export interface HiddenMessagePuzzle extends WordSearchPuzzle {
  /** The saying as it is printed on the answer page, punctuation intact. */
  messageDisplay: string
  /** The A–Z run the leftover cells spell, in reading order. */
  messageLetters: string
  /** The saying's letter runs, one per word — one write-in slot per letter. */
  messageWords: string[]
  /** Cells holding the saying, row-major — the order the solver reads them in. */
  leftoverCells: { r: number; c: number }[]
}

interface CellGrid {
  cells: (string | null)[][]
  size: number
}

interface UndoCell {
  r: number
  c: number
  prev: string | null
}

interface Hit {
  entry: WordEntry
  r: number
  c: number
  dir: Dir
  /** Cells this placement would newly claim — length minus any overlap. */
  net: number
}

function emptyGrid(size: number): CellGrid {
  return {
    size,
    cells: Array.from({ length: size }, () => Array.from({ length: size }, () => null)),
  }
}

function emptyCount(grid: CellGrid): number {
  let n = 0
  for (const row of grid.cells) {
    for (const cell of row) if (cell === null) n += 1
  }
  return n
}

/** Free cells in reading order — left to right, top to bottom. */
function leftoverCellsOf(grid: CellGrid): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = []
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (grid.cells[r]![c] === null) out.push({ r, c })
    }
  }
  return out
}

/** Cells a placement would claim, or -1 when it would contradict the grid. */
function netNewCells(grid: CellGrid, word: string, r: number, c: number, dir: Dir): number {
  let overlap = 0
  for (let i = 0; i < word.length; i++) {
    const cell = grid.cells[r + dir.dr * i]![c + dir.dc * i]!
    if (cell === word[i]) overlap += 1
    else if (cell !== null) return -1
  }
  return word.length - overlap
}

/**
 * Whether a placement leaves a remainder the pool can still finish.
 *
 * The old rule allowed any remainder of three or more, which reads as safe and
 * is not: the shortest word a level lists is four letters, so stopping with
 * three free cells above the saying's length leaves a hole that nothing in the
 * pool fits. The placer then spent its whole step budget backtracking out of a
 * position it should never have entered.
 *
 * Landing exactly on zero, or leaving at least one whole word's worth, is the
 * only pair of outcomes that keeps the endgame solvable by construction.
 */
function isAllowedNet(net: number, remaining: number, minLetters: number): boolean {
  if (net <= 0 || net > remaining) return false
  const next = remaining - net
  return next === 0 || next >= minLetters
}

function writeWithUndo(
  grid: CellGrid,
  word: string,
  r: number,
  c: number,
  dir: Dir,
): UndoCell[] {
  const undo: UndoCell[] = []
  for (let i = 0; i < word.length; i++) {
    const rr = r + dir.dr * i
    const cc = c + dir.dc * i
    undo.push({ r: rr, c: cc, prev: grid.cells[rr]![cc]! })
    grid.cells[rr]![cc] = word[i]!
  }
  return undo
}

function applyUndo(grid: CellGrid, undo: UndoCell[]): void {
  for (const cell of undo) grid.cells[cell.r]![cell.c] = cell.prev
}

/** Write the saying into the free cells, in reading order. */
function fillMessage(grid: CellGrid, letters: string): string[][] {
  const leftover = leftoverCellsOf(grid)
  const filled = grid.cells.map((row) => row.map((cell) => cell ?? ''))
  leftover.forEach((cell, i) => {
    filled[cell.r]![cell.c] = letters[i]!
  })
  return filled
}

/** Best of a random sample of starts for one word — highest net wins. */
function sampleHit(
  grid: CellGrid,
  entry: WordEntry,
  dirs: readonly Dir[],
  remaining: number,
  minLetters: number,
  rng: StudioRng,
): Hit | null {
  let best: Hit | null = null
  for (const start of sampleStarts(entry.token, grid.size, dirs, rng, FILL_SAMPLE)) {
    const net = netNewCells(grid, entry.token, start.r, start.c, start.dir)
    if (!isAllowedNet(net, remaining, minLetters)) continue
    // A placement that finishes the grid is always taken; otherwise take the
    // one that claims the most, so the bank stays as short as the page planned.
    if (net === remaining) return { entry, ...start, net }
    if (!best || net > best.net) best = { entry, ...start, net }
  }
  return best
}

/** Exhaustive search for a placement that closes the grid exactly. */
function exactHit(
  grid: CellGrid,
  entry: WordEntry,
  dirs: readonly Dir[],
  remaining: number,
): Hit | null {
  if (entry.token.length < remaining) return null
  for (const start of allStarts(entry.token, grid.size, dirs)) {
    if (netNewCells(grid, entry.token, start.r, start.c, start.dir) === remaining) {
      return { entry, ...start, dir: start.dir, net: remaining }
    }
  }
  return null
}

function firstHit(options: {
  grid: CellGrid
  unused: readonly WordEntry[]
  dirs: readonly Dir[]
  remaining: number
  minLetters: number
  rng: StudioRng
  banned: string | null
  /** The remainder is within one word's reach — hunt for a placement that closes it. */
  wantExact: boolean
}): Hit | null {
  const { grid, unused, dirs, remaining, minLetters, rng, banned, wantExact } = options
  for (const entry of unused) {
    if (entry.token === banned) continue
    if (wantExact) {
      const hit =
        exactHit(grid, entry, dirs, remaining) ??
        sampleHit(grid, entry, dirs, remaining, minLetters, rng)
      if (hit) return hit
      continue
    }
    const hit = sampleHit(grid, entry, dirs, remaining, minLetters, rng)
    if (hit) return hit
  }
  return null
}

interface FilledGrid {
  grid: CellGrid
  placements: Placement[]
  entries: WordEntry[]
}

/**
 * Claim cells until exactly the saying's letters are left, or give up.
 *
 * Longest word first, because long words are the ones with few legal starts —
 * fitting them last is how a grid ends up with a seven-letter word and nowhere
 * to put it. When no word fits, the last placement is un-made and banned for one
 * step, which is enough to break the loop that otherwise re-picks it.
 *
 * `maxWords` is the budget the page reserved bank rows for. Exceeding it is not
 * a worse-looking page, it is a word list printed over the write-in rules, so
 * the search backtracks instead.
 */
function greedyFill(options: {
  pool: readonly WordEntry[]
  size: number
  dirs: readonly Dir[]
  messageLength: number
  maxWords: number
  minLetters: number
  rng: StudioRng
}): FilledGrid | null {
  const { pool, size, dirs, messageLength, maxWords, minLetters, rng } = options
  const grid = emptyGrid(size)
  const unused = rng
    .shuffle(pool.filter((entry) => entry.token.length <= size))
    .sort((a, b) => b.token.length - a.token.length)
  const stack: { hit: Hit; undo: UndoCell[] }[] = []
  const longest = unused[0]?.token.length ?? 0
  let banned: string | null = null

  for (let step = 0; step < MAX_STEPS; step++) {
    const remaining = emptyCount(grid) - messageLength
    if (remaining === 0) {
      return {
        grid,
        placements: stack.map(({ hit }) => ({
          word: hit.entry.token,
          r: hit.r,
          c: hit.c,
          dir: hit.dir,
        })),
        entries: stack.map(({ hit }) => hit.entry),
      }
    }

    const hit =
      stack.length >= maxWords
        ? null
        : firstHit({
            grid,
            unused,
            dirs,
            remaining,
            minLetters,
            rng,
            banned,
            wantExact: remaining <= longest,
          })

    if (hit) {
      const undo = writeWithUndo(grid, hit.entry.token, hit.r, hit.c, hit.dir)
      const index = unused.findIndex((entry) => entry.token === hit.entry.token)
      if (index >= 0) unused.splice(index, 1)
      stack.push({ hit, undo })
      banned = null
      continue
    }

    const last = stack.pop()
    if (!last) return null
    applyUndo(grid, last.undo)
    unused.push(last.hit.entry)
    banned = last.hit.entry.token
  }
  return null
}

/**
 * Prove a finished grid before it is allowed onto a page.
 *
 * Three claims, each of which the reader will check with a pencil: every listed
 * word reads in exactly one place, the leftover cells spell the saying, and the
 * placements the answer key will circle still say what they were written to say.
 *
 * The reading count is deliberately blind to the level's directions. A solver
 * scans with their eyes, not with the direction set the generator used, so a
 * second reading of a listed word is a second correct answer even on a gentle
 * page that never meant to offer one.
 */
function verifyPuzzle(
  grid: string[][],
  tokens: readonly string[],
  leftover: readonly { r: number; c: number }[],
  letters: string,
): boolean {
  if (leftover.length !== letters.length) return false
  for (let i = 0; i < leftover.length; i++) {
    const cell = leftover[i]!
    if (grid[cell.r]![cell.c] !== letters[i]) return false
  }
  return tokens.every((token) => countTokenReadings(grid, token) === 1)
}

/**
 * Build one hidden-message puzzle, or null.
 *
 * Every attempt is a fresh shuffle of the same pool: which words happen to add
 * up to the free cells is the whole difficulty, and re-ordering the pool is far
 * cheaper than re-asking the writer for another one. The pool is over-requested
 * for exactly this reason.
 */
export function tryBuildHiddenMessagePuzzle(options: {
  message: NormalizedMessage
  words: readonly WordEntry[]
  level: HiddenMessageLevel
  gridSide: number
  maxWords: number
  seed: number
}): HiddenMessagePuzzle | null {
  const { message, words, level, gridSide, maxWords, seed } = options
  const dirs = directionsForDifficulty(level.directions)
  const pool = words.filter((entry) => entry.token.length <= gridSide)
  if (pool.length < level.minWords) return null

  const cells = gridSide * gridSide
  if (cells - message.letters.length < level.minWords * level.minLetters) return null

  const targets = mixTargets({
    wordCount: level.minWords,
    hasDiagonal: dirs.some(isDiagonalDir),
    hasSlash: dirs.some(isSlashDir),
    hasBackslash: dirs.some(isBackslashDir),
    allowReverse: level.directions === 'hard',
  })

  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    const rng = createRng(seed + attempt * 10_007)
    const built = greedyFill({
      pool,
      size: gridSide,
      dirs,
      messageLength: message.letters.length,
      maxWords,
      minLetters: level.minLetters,
      rng,
    })
    if (!built) continue
    if (built.entries.length < level.minWords) continue

    const leftover = leftoverCellsOf(built.grid)
    const filled = fillMessage(built.grid, message.letters)
    const tokens = built.entries.map((entry) => entry.token)
    if (!verifyPuzzle(filled, tokens, leftover, message.letters)) continue

    // A "classic" page whose every word runs across or down is a gentle page
    // wearing the wrong label, and the solver notices before the seller does.
    if (!meetsMix(countPuzzleMix(filled, built.placements), targets)) continue

    const ordered = sortForBank(built.entries)
    return {
      grid: filled,
      placements: built.placements,
      size: gridSide,
      words: ordered.map((entry) => entry.token),
      displays: ordered.map((entry) => entry.display),
      messageDisplay: message.display,
      messageLetters: message.letters,
      messageWords: message.boxWords,
      leftoverCells: leftover,
    }
  }

  return null
}
