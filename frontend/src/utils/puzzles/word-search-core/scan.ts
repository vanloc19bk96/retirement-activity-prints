import type { Dir, Placement, WordSearchPuzzle } from './types'
import { reverseWord } from './placement'

const SCAN_DIRS: readonly Dir[] = [
  { dr: 0, dc: 1, name: 'E' },
  { dr: 1, dc: 0, name: 'S' },
  { dr: 1, dc: 1, name: 'SE' },
  { dr: 1, dc: -1, name: 'SW' },
  { dr: 0, dc: -1, name: 'W' },
  { dr: -1, dc: 0, name: 'N' },
  { dr: -1, dc: -1, name: 'NW' },
  { dr: -1, dc: 1, name: 'NE' },
]

/**
 * Every way `token` reads in the grid, counted over all eight headings.
 *
 * Deliberately blind to the difficulty's allowed directions. A solver scans
 * the whole grid with their eyes, not with the direction set the generator
 * used, so a second reading of a listed word is a second correct answer even
 * when the puzzle never meant to offer it — and the answer key circles only
 * one of them.
 */
export function countTokenReadings(grid: string[][], token: string): number {
  return countTokenOccurrences(grid, token)
}

function countTokenOccurrences(grid: string[][], token: string): number {
  const size = grid.length
  let count = 0
  for (const dir of SCAN_DIRS) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let ok = true
        for (let i = 0; i < token.length; i++) {
          const rr = r + dir.dr * i
          const cc = c + dir.dc * i
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) {
            ok = false
            break
          }
          if (grid[rr]![cc] !== token[i]) {
            ok = false
            break
          }
        }
        if (ok) count += 1
      }
    }
  }
  return count
}

/**
 * Extra hits of a target token beyond its intentional placement (and its
 * reverse spelling on the same path). Soft quality signal — not a hard fail.
 */
export function findAccidentalDuplicates(puzzle: WordSearchPuzzle): string[] {
  const extras: string[] = []
  const placed = new Map<string, number>()
  for (const placement of puzzle.placements) {
    placed.set(placement.word, (placed.get(placement.word) ?? 0) + 1)
  }

  for (const token of puzzle.words) {
    const intentional = placed.get(token) ?? 0
    // Each placement also matches the reverse read in the opposite direction.
    const expected = intentional * 2
    const found = countTokenOccurrences(puzzle.grid, token)
    const reverse = reverseWord(token)
    const foundReverse =
      reverse !== token ? countTokenOccurrences(puzzle.grid, reverse) : 0
    // Count unique paths roughly: forward + reverse of each placement ≈ 2.
    if (found + foundReverse > expected + 2) {
      extras.push(token)
    }
  }
  return extras
}

/** True when every placement still spells its listed word (or reverse). */
export function placementsIntact(puzzle: WordSearchPuzzle): boolean {
  for (const placement of puzzle.placements) {
    const letters: string[] = []
    for (let i = 0; i < placement.word.length; i++) {
      letters.push(
        puzzle.grid[placement.r + placement.dir.dr * i]![
          placement.c + placement.dir.dc * i
        ]!,
      )
    }
    const read = letters.join('')
    if (read !== placement.word && read !== reverseWord(placement.word)) {
      return false
    }
  }
  return true
}

export function placementKey(placement: Placement): string {
  return `${placement.word}:${placement.r},${placement.c}:${placement.dir.name}`
}
