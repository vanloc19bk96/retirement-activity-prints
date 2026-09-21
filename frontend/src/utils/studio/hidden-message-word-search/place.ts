import {
  directionsForDifficulty,
  type Dir,
  type Placement,
  type WordEntry,
  type WordSearchPuzzle,
} from '@/utils/puzzles/word-search-core'
import { createRng, type StudioRng } from '../studio-rng'
import type { HiddenMessageDifficulty } from '@/types/studio-hidden-message.types'
import type { RetirementPrintStyle } from './content'
import {
  difficultyPreset,
  HIDDEN_MESSAGE_AI_EMPTY_MESSAGE,
  MAX_WORD_LETTERS,
  type NormalizedMessage,
} from './content'
import { listedWordsAreUnique } from './verify'
import { allStarts, sampleStarts } from './starts'

const PLACE_ATTEMPTS = 48
const MAX_GRID = 15
const FILL_SAMPLE = 28
const MAX_STEPS = 80
const MIN_WORD_FILL = 12

export interface HiddenMessagePuzzle extends WordSearchPuzzle {
  messageDisplay: string
  messageLetters: string
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

function leftoverCellsOf(grid: CellGrid): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = []
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (grid.cells[r]![c] === null) out.push({ r, c })
    }
  }
  return out
}

function netNewCells(grid: CellGrid, word: string, r: number, c: number, dir: Dir): number {
  let overlap = 0
  for (let i = 0; i < word.length; i++) {
    const cell = grid.cells[r + dir.dr * i]![c + dir.dc * i]!
    if (cell === word[i]) overlap += 1
    else if (cell !== null) return -1
  }
  return word.length - overlap
}

function isAllowedNet(net: number, remaining: number): boolean {
  if (net <= 0 || net > remaining) return false
  const next = remaining - net
  return next === 0 || next >= 3
}

function writeWithUndo(grid: CellGrid, word: string, r: number, c: number, dir: Dir): UndoCell[] {
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

function fillMessage(grid: CellGrid, letters: string): string[][] {
  const leftover = leftoverCellsOf(grid)
  const filled = grid.cells.map((row) => row.map((cell) => cell ?? ''))
  leftover.forEach((cell, i) => {
    filled[cell.r]![cell.c] = letters[i]!
  })
  return filled
}

function sampleHit(
  grid: CellGrid,
  entry: WordEntry,
  dirs: readonly Dir[],
  remaining: number,
  rng: StudioRng,
): Hit | null {
  let best: Hit | null = null
  for (const start of sampleStarts(entry.token, grid.size, dirs, rng, FILL_SAMPLE)) {
    const net = netNewCells(grid, entry.token, start.r, start.c, start.dir)
    if (!isAllowedNet(net, remaining)) continue
    if (!best || net > best.net || (net === remaining && best.net !== remaining)) {
      best = { entry, ...start, net }
      if (net === remaining) return best
    }
  }
  return best
}

function exactHit(
  grid: CellGrid,
  entry: WordEntry,
  dirs: readonly Dir[],
  remaining: number,
): Hit | null {
  if (entry.token.length < remaining) return null
  for (const start of allStarts(entry.token, grid.size, dirs)) {
    const net = netNewCells(grid, entry.token, start.r, start.c, start.dir)
    if (net === remaining) return { entry, ...start, net }
  }
  return null
}

function firstHit(
  grid: CellGrid,
  unused: WordEntry[],
  dirs: readonly Dir[],
  remaining: number,
  rng: StudioRng,
  minLen: number,
  banned: string | null,
  wantExact: boolean,
): Hit | null {
  for (const entry of unused) {
    if (entry.token === banned || entry.token.length < minLen) continue
    if (wantExact) {
      const hit = exactHit(grid, entry, dirs, remaining) ?? sampleHit(grid, entry, dirs, remaining, rng)
      if (hit) return hit
      continue
    }
    const hit = sampleHit(grid, entry, dirs, remaining, rng)
    if (hit) return hit
  }
  return null
}

function greedyPlace(
  pool: WordEntry[],
  size: number,
  dirs: readonly Dir[],
  letterCount: number,
  rng: StudioRng,
): { grid: CellGrid; placements: Placement[]; entries: WordEntry[] } | null {
  const grid = emptyGrid(size)
  const unused = rng
    .shuffle(pool.filter((entry) => entry.token.length <= size))
    .sort((a, b) => b.token.length - a.token.length)
  const stack: { hit: Hit; undo: UndoCell[] }[] = []
  const fillMin = dirs.length >= 8 ? 5 : 4
  let banned: string | null = null

  for (let step = 0; step < MAX_STEPS; step++) {
    const remaining = emptyCount(grid) - letterCount
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

    const wantExact = remaining <= MAX_WORD_LETTERS
    const hit =
      firstHit(grid, unused, dirs, remaining, rng, wantExact ? 3 : fillMin, banned, wantExact) ??
      (!wantExact ? firstHit(grid, unused, dirs, remaining, rng, 4, banned, false) : null)
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

function gridSizes(start: number, letterCount: number): number[] {
  const first = Math.max(start, Math.min(MAX_GRID, letterCount > start * start ? start + 1 : start))
  return [...new Set([first, first + 1, first + 2].filter((size) => size <= MAX_GRID))].filter(
    (size) => size * size - letterCount >= MIN_WORD_FILL,
  )
}

export function tryBuildHiddenMessagePuzzle(options: {
  message: NormalizedMessage
  words: WordEntry[]
  difficulty: HiddenMessageDifficulty
  seed: number
  printStyle?: RetirementPrintStyle
}): HiddenMessagePuzzle | null {
  const { message, words, difficulty, seed, printStyle = 'large-print' } = options
  const dirs = directionsForDifficulty(difficulty)
  const sizes = gridSizes(difficultyPreset(difficulty, printStyle).gridSize, message.letters.length)
  if (sizes.length === 0) return null

  for (let sizeIndex = 0; sizeIndex < sizes.length; sizeIndex++) {
    const size = sizes[sizeIndex]!
    const pool = words.filter((entry) => entry.token.length <= size)
    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const rng = createRng(seed + sizeIndex * 10_007 + attempt * 997)
      const built = greedyPlace(pool, size, dirs, message.letters.length, rng)
      if (!built) continue
      const leftover = leftoverCellsOf(built.grid)
      if (leftover.length !== message.letters.length) continue
      const filled = fillMessage(built.grid, message.letters)
      const tokens = built.entries.map((entry) => entry.token)
      if (!listedWordsAreUnique(filled, tokens, dirs)) continue
      return {
        grid: filled,
        placements: built.placements,
        size,
        words: tokens,
        displays: built.entries.map((entry) => entry.display),
        messageDisplay: message.display,
        messageLetters: message.letters,
        leftoverCells: leftover,
      }
    }
  }
  return null
}

export function buildHiddenMessagePuzzle(options: {
  message: NormalizedMessage
  words: WordEntry[]
  difficulty: HiddenMessageDifficulty
  seed: number
  printStyle?: RetirementPrintStyle
}): HiddenMessagePuzzle {
  const built = tryBuildHiddenMessagePuzzle(options)
  if (!built) throw new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
  return built
}
