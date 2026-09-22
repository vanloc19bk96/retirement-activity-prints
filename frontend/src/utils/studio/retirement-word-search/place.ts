import {
  buildMaskedWordSearch,
  createRng,
  directionsForDifficulty,
  type WordEntry,
  type WordSearchCellMask,
  type WordSearchPuzzle,
} from '@/utils/puzzles/word-search-core'
import type {
  StudioWordSearchDifficulty,
  WordSearchPrintStyle,
} from '@/types/studio-word-search.types'
import { listedWordsAreUnique } from '../hidden-message-word-search/verify'
import {
  difficultyPreset,
  type WordSearchShape,
  WORD_SEARCH_BUILD_ERROR,
} from './content'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const PLACEMENT_ATTEMPTS = 12
const FILL_ATTEMPTS = 32

export interface ShapedWordSearchPuzzle extends WordSearchPuzzle {
  shape: WordSearchShape
}

export function shapeMask(size: number, shape: WordSearchShape): boolean[][] {
  const middle = (size - 1) / 2
  const radius = size / 2
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      if (shape === 'square') return true
      const x = (col - middle) / radius
      const y = (row - middle) / radius
      if (shape === 'circle') return x * x + y * y <= 1
      if (shape === 'diamond') return Math.abs(x) + Math.abs(y) <= 1.08

      // Two rounded lobes tapering to a centered point.
      const topY = (row + 0.5) / size
      const topX = (col + 0.5) / size
      if (topY <= 0.48) {
        const left = (topX - 0.31) ** 2 + (topY - 0.28) ** 2 <= 0.24 ** 2
        const right = (topX - 0.69) ** 2 + (topY - 0.28) ** 2 <= 0.24 ** 2
        return left || right || (topY >= 0.25 && Math.abs(topX - 0.5) <= 0.38)
      }
      return Math.abs(topX - 0.5) <= Math.max(0.04, (1 - topY) * 0.78)
    }),
  )
}

function placementCellKeys(puzzle: Pick<WordSearchPuzzle, 'placements'>): Set<string> {
  const keys = new Set<string>()
  for (const placement of puzzle.placements) {
    for (let i = 0; i < placement.word.length; i++) {
      keys.add(`${placement.r + placement.dir.dr * i},${placement.c + placement.dir.dc * i}`)
    }
  }
  return keys
}

function refillUntilUnique(options: {
  puzzle: WordSearchPuzzle
  mask: WordSearchCellMask
  difficulty: StudioWordSearchDifficulty
  seed: number
}): string[][] | null {
  const { puzzle, mask, difficulty, seed } = options
  const dirs = directionsForDifficulty(difficulty)
  const fixed = placementCellKeys(puzzle)

  for (let attempt = 0; attempt < FILL_ATTEMPTS; attempt++) {
    const rng = createRng(seed + attempt)
    const grid = puzzle.grid.map((row, r) =>
      row.map((letter, c) => {
        if (!mask[r]?.[c]) return ''
        if (fixed.has(`${r},${c}`)) return letter
        return LETTERS[rng.int(0, LETTERS.length - 1)]!
      }),
    )
    if (listedWordsAreUnique(grid, puzzle.words, dirs)) return grid
  }
  return null
}

function tryShape(options: {
  entries: WordEntry[]
  target: number
  minimum: number
  difficulty: StudioWordSearchDifficulty
  gridSize: number
  shape: WordSearchShape
  seed: number
}): ShapedWordSearchPuzzle | null {
  const { entries, target, minimum, difficulty, gridSize, shape, seed } = options
  const dirs = directionsForDifficulty(difficulty)
  const allowReverse = difficulty === 'hard'
  const mask = shapeMask(gridSize, shape)

  for (let count = target; count >= minimum; count--) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const attemptSeed = seed + attempt
      const rng = createRng(attemptSeed)
      const picked = rng.shuffle(entries).slice(0, count)
      const built = buildMaskedWordSearch(
        picked.map((entry) => entry.token),
        gridSize,
        dirs,
        allowReverse,
        rng,
        mask,
      )
      if (!built) continue

      const byToken = new Map(picked.map((entry) => [entry.token, entry.display]))
      const tokens = picked
        .map((entry) => entry.token)
        .filter((token) => built.placements.some((placement) => placement.word === token))
      const provisional: WordSearchPuzzle = {
        grid: built.grid,
        placements: built.placements,
        size: gridSize,
        words: tokens,
        displays: tokens.map((token) => byToken.get(token) ?? token),
      }
      const grid = refillUntilUnique({
        puzzle: provisional,
        mask,
        difficulty,
        seed: seed + attempt * 1_009,
      })
      if (!grid) continue

      const pairs = provisional.words
        .map((token, index) => ({ token, display: provisional.displays[index]! }))
        .sort((a, b) => a.display.localeCompare(b.display, 'en', { sensitivity: 'base' }))
      return {
        ...provisional,
        grid,
        words: pairs.map((pair) => pair.token),
        displays: pairs.map((pair) => pair.display),
        shape,
      }
    }
  }
  return null
}

export function listedWordTarget(options: {
  poolSize: number
  difficulty: StudioWordSearchDifficulty
  printStyle: WordSearchPrintStyle
  custom: boolean
}): number {
  const desired = difficultyPreset(options.difficulty, options.printStyle).listedWords
  return Math.min(desired, options.poolSize)
}

export function tryBuildClassicWordSearch(options: {
  entries: WordEntry[]
  difficulty: StudioWordSearchDifficulty
  printStyle?: WordSearchPrintStyle
  shape?: WordSearchShape
  seed: number
  custom?: boolean
}): ShapedWordSearchPuzzle | null {
  const {
    entries,
    difficulty,
    printStyle = 'large-print',
    shape = 'square',
    seed,
    custom = false,
  } = options
  const preset = difficultyPreset(difficulty, printStyle)
  const target = listedWordTarget({
    poolSize: entries.length,
    difficulty,
    printStyle,
    custom,
  })
  if (target < 3) return null
  const easyMinimum = difficultyPreset('easy', printStyle).listedWords
  const minimum = Math.min(target, easyMinimum)
  const shaped = tryShape({
    entries,
    target,
    minimum,
    difficulty,
    gridSize: preset.gridSize,
    shape,
    seed,
  })
  if (shaped || shape === 'square') return shaped
  return tryShape({
    entries,
    target,
    minimum,
    difficulty,
    gridSize: preset.gridSize,
    shape: 'square',
    seed,
  })
}

export function buildClassicWordSearch(
  options: Parameters<typeof tryBuildClassicWordSearch>[0],
): ShapedWordSearchPuzzle {
  const puzzle = tryBuildClassicWordSearch(options)
  if (!puzzle) throw new Error(WORD_SEARCH_BUILD_ERROR)
  return puzzle
}
