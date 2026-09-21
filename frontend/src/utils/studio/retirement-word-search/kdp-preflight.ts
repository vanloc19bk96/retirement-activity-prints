import type { WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import { findAccidentalDuplicates, placementsIntact } from '@/utils/puzzles/word-search-core'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * Lightweight KDP / print preflight before a sheet is considered export-ready.
 * Hard errors block generate; warnings are soft quality notes.
 */
export function runWordSearchKdpPreflight(options: {
  puzzle: WordSearchPuzzle
  gridSize: number
  printStyle: 'large-print' | 'standard'
}): KdpPreflightResult {
  const { puzzle, gridSize, printStyle } = options
  const warnings: string[] = []
  const errors: string[] = []

  if (puzzle.words.length === 0) {
    errors.push('No words were placed — try a broader theme or custom list.')
  }

  if (puzzle.words.length !== puzzle.placements.length) {
    errors.push('Clue list does not match placed words (orphan risk).')
  }

  if (!placementsIntact(puzzle)) {
    errors.push('A placed word no longer matches the grid.')
  }

  if (puzzle.size < gridSize && printStyle === 'large-print') {
    warnings.push(
      `Grid grew beyond the requested ${gridSize}×${gridSize} to fit longer words.`,
    )
  }

  const accidental = findAccidentalDuplicates(puzzle)
  if (accidental.length > 0) {
    warnings.push(
      `Short or common words may appear more than once: ${accidental.slice(0, 3).join(', ')}.`,
    )
  }

  const uniqueTokens = new Set(puzzle.words)
  if (uniqueTokens.size !== puzzle.words.length) {
    errors.push('Duplicate target words in the clue list.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
