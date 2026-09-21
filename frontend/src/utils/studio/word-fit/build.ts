/**
 * Word Fit-In — puzzle construction.
 *
 * The interlocking grid comes from the crossword packer, which is already
 * proven, already tested and already tuned for these trims. Everything added
 * here is what a fill-in needs and a crossword does not: a skeleton view of the
 * grid, a proof that the bank fills it exactly one way, and the starter words
 * that force that when the draw alone does not.
 */

import type { StudioRng } from '../studio-rng'
import { buildCrossword, maxGridForPlaceCount } from '../crossword/construct'
import { delta } from '../crossword/types'
import type { CrosswordBuild } from '../crossword/types'
import {
  canonicalGridForm,
  composeCanonicalForm,
  log2Choose,
  log2Factorial,
} from '../_shared/uniqueness'
import { countFillings, nextStarterSlot } from './solver'
import {
  WORD_FIT_STARTERS_MAX,
  type WordFitCrossing,
  type WordFitMode,
  type WordFitPuzzle,
  type WordFitSlot,
} from './types'

/**
 * Draws of the bank before the build gives up on this seed.
 *
 * Four, not fourteen. Interlocking the bank is by far the most expensive step
 * in generating this page, and it succeeds on the first draw about nine times
 * in ten — so a generous retry budget bought almost nothing and cost a tenfold
 * blowout on exactly the pages that were already struggling. The caller has
 * cheaper moves left when four draws fail: a roomier lattice, then a shorter
 * bank.
 */
const BANK_ATTEMPTS = 4

/**
 * Draws for a bare grid — one the seller asked to print with no starters at
 * all. Higher than `BANK_ATTEMPTS` because uniqueness now has to come from the
 * draw alone: any bank that interlocks ambiguously is redrawn, never rescued
 * by revealing a word.
 */
const BARE_GRID_BANK_ATTEMPTS = 8

/**
 * Slots the packer must place before a build counts.
 *
 * A grid that dropped four of its fourteen words prints a bank the reader
 * cannot exhaust, which reads as a misprint. The packer substitutes freely, so
 * this is nearly always met on the first attempt.
 */
const MIN_PLACED_SHARE = 0.85

export interface WordFitBuildOptions {
  mode: WordFitMode
  /** Candidate bank for this attempt, already length-spread. */
  words: readonly string[]
  wordCount: number
  /** Starters the seller asked for. The build adds more only to force uniqueness. */
  starters: number
  /**
   * Largest lattice the page can print at the legibility floor.
   *
   * The page tells the puzzle what it can afford, not the other way round: a
   * packer left to spread over its own 15x15 canvas produces grids that only
   * print at eight-point letters on a 5x8 trim, and the honest response to that
   * is a tighter grid, never a smaller letter.
   */
  maxSize: number
}

/** Every run of two or more cells, across and down. */
function readSlots(build: CrosswordBuild): WordFitSlot[] {
  const { grid, size } = build
  const slots: WordFitSlot[] = []

  const scan = (dir: 'across' | 'down'): void => {
    const step = delta(dir)
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r]![c] === null) continue
        const prevR = r - step.dr
        const prevC = c - step.dc
        const hasPrev =
          prevR >= 0 && prevC >= 0 && (grid[prevR]?.[prevC] ?? null) !== null
        if (hasPrev) continue
        let length = 0
        while (
          r + step.dr * length < size &&
          c + step.dc * length < size &&
          (grid[r + step.dr * length]?.[c + step.dc * length] ?? null) !== null
        ) {
          length++
        }
        if (length < 2) continue
        slots.push({ id: slots.length, row: r, col: c, dir, length })
      }
    }
  }

  scan('across')
  scan('down')
  return slots.map((slot, id) => ({ ...slot, id }))
}

function readCrossings(slots: readonly WordFitSlot[]): WordFitCrossing[] {
  const cells = new Map<string, { slot: number; at: number }[]>()
  for (const slot of slots) {
    const step = delta(slot.dir)
    for (let i = 0; i < slot.length; i++) {
      const key = `${slot.row + step.dr * i},${slot.col + step.dc * i}`
      cells.set(key, [...(cells.get(key) ?? []), { slot: slot.id, at: i }])
    }
  }

  const crossings: WordFitCrossing[] = []
  for (const owners of cells.values()) {
    if (owners.length < 2) continue
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        crossings.push({
          a: owners[i]!.slot,
          ai: owners[i]!.at,
          b: owners[j]!.slot,
          bi: owners[j]!.at,
        })
      }
    }
  }
  return crossings
}

/** The word each slot holds in the grid the packer built. */
function readAssignment(
  build: CrosswordBuild,
  slots: readonly WordFitSlot[],
  words: readonly string[],
): number[] | null {
  const assignment: number[] = []
  const used = new Set<number>()
  for (const slot of slots) {
    const step = delta(slot.dir)
    let text = ''
    for (let i = 0; i < slot.length; i++) {
      text += build.grid[slot.row + step.dr * i]![slot.col + step.dc * i] ?? ''
    }
    const index = words.findIndex((word, at) => word === text && !used.has(at))
    // A run the packer created but no bank word owns — two words abutting in
    // line, which `canPlace` forbids, so this is a guard rather than a path.
    if (index < 0) return null
    used.add(index)
    assignment.push(index)
  }
  return assignment
}

/** Bank order as printed: shortest first, then alphabetical. Stable across seeds. */
function sortBank(words: readonly string[]): string[] {
  return [...words].sort((a, b) => a.length - b.length || a.localeCompare(b))
}

/**
 * Build one fill-in, adding starter words until it has exactly one solution.
 *
 * Returns `null` when this bank cannot make a printable grid, so the caller can
 * redraw. The starter loop is bounded: a draw that still has two fillings after
 * `WORD_FIT_STARTERS_MAX` reveals is thrown away rather than printed, because
 * revealing a fourth word starts giving the puzzle away.
 */
export function buildWordFitPuzzle(
  rng: StudioRng,
  options: WordFitBuildOptions,
): WordFitPuzzle | null {
  const { mode, wordCount } = options
  const bank = sortBank(options.words.slice(0, wordCount))
  if (bank.length < 4) return null

  const maxSize = Math.max(5, Math.min(maxGridForPlaceCount(bank.length), options.maxSize))
  const built = buildCrossword(
    bank.map((word) => ({ word, clue: '' })),
    maxSize,
    rng,
    bank.length,
  )
  if (!built) return null
  if (built.entries.length < Math.ceil(bank.length * MIN_PLACED_SHARE)) return null

  const slots = readSlots(built)
  // The packer may place fewer words than the bank offers; the bank printed
  // beside the grid is exactly what the grid holds, never a superset.
  const placed = sortBank(built.entries.map((entry) => entry.word))
  if (placed.length !== slots.length) return null

  const assignment = readAssignment(built, slots, placed)
  if (!assignment) return null

  const crossings = readCrossings(slots)

  const finish = (revealed: ReadonlyMap<number, number>): WordFitPuzzle => ({
    grid: built.grid,
    size: built.size,
    slots,
    crossings,
    words: placed,
    assignment,
    starters: [...revealed.keys()].sort((a, b) => a - b),
    mode,
  })

  // "Entries filled in to start: 0" is a hard choice, not a preference — the
  // reader asked for a bare grid. A draw that is not already unique on its own
  // is handed back for a redraw rather than rescued by revealing a word, so a
  // zero-starter page never prints a hint. `resolveWordFitPuzzle` widens the
  // draw budget to match.
  if (options.starters <= 0) {
    const bare = new Map<number, number>()
    return countFillings({ slots, crossings, words: placed, fixed: bare }) === 1
      ? finish(bare)
      : null
  }

  const fixed = new Map<number, number>()

  // Seller-requested starters first, then only as many more as uniqueness needs.
  for (let i = 0; i < Math.min(options.starters, WORD_FIT_STARTERS_MAX); i++) {
    const slot = nextStarterSlot({ slots, crossings, words: placed, fixed })
    if (!slot) break
    fixed.set(slot.id, assignment[slot.id]!)
  }

  for (let guard = 0; guard <= WORD_FIT_STARTERS_MAX; guard++) {
    const fillings = countFillings({ slots, crossings, words: placed, fixed })
    // Zero means the skeleton and bank disagree — unreachable, and never printed.
    if (fillings === 0) return null
    if (fillings === 1) return finish(fixed)
    if (fixed.size >= WORD_FIT_STARTERS_MAX) return null
    const slot = nextStarterSlot({ slots, crossings, words: placed, fixed })
    if (!slot) return null
    fixed.set(slot.id, assignment[slot.id]!)
  }

  return null
}

/**
 * Draw until a bank makes a printable, single-solution grid.
 *
 * `drawBank` is handed the attempt number so it can vary the draw; the caller
 * owns where the words come from, which is what lets the themed and number
 * modes share this loop.
 */
export function resolveWordFitPuzzle(options: {
  drawBank: (attempt: number) => { rng: StudioRng; words: string[] }
  mode: WordFitMode
  wordCount: number
  starters: number
  maxSize: number
}): WordFitPuzzle | null {
  // A bare grid rejects every draw that is not already unique, so a larger
  // share of attempts come back empty — it gets a wider budget to compensate.
  const bareGrid = options.starters <= 0
  const attempts = bareGrid ? BARE_GRID_BANK_ATTEMPTS : BANK_ATTEMPTS
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { rng, words } = options.drawBank(attempt)
    const puzzle = buildWordFitPuzzle(rng, {
      mode: options.mode,
      words,
      wordCount: options.wordCount,
      maxSize: options.maxSize,
      // A later attempt buys one more starter: a bank that keeps coming back
      // ambiguous is telling us its lengths are bunched, and one more revealed
      // word is a better answer than a fifth redraw. Never when the seller asked
      // for a bare grid — there an ambiguous draw is redrawn, not pinned.
      starters:
        options.starters + (!bareGrid && attempt >= BANK_ATTEMPTS / 2 ? 1 : 0),
    })
    if (puzzle) return puzzle
  }
  return null
}

/**
 * Canonical form (§4.2): the filled lattice, reduced over its eight rotations
 * and reflections, plus the bank.
 *
 * The bank is part of the form because two grids with identical geometry but
 * different words are visibly different pages; the geometry is reduced because
 * the same grid turned ninety degrees is the same puzzle. Starters are left
 * out — a page that reveals a different word is the same puzzle with a
 * different amount of help, and should collide.
 */
export function wordFitCanonicalForm(puzzle: WordFitPuzzle): string {
  const grid = puzzle.grid.map((row) => row.map((cell) => cell ?? '.'))
  return composeCanonicalForm(
    'word-fit',
    puzzle.mode,
    canonicalGridForm(grid, (cell) => cell),
    puzzle.words.join(','),
  )
}

/**
 * Analytic entropy of one page, in bits (§4.5).
 *
 *   bank         which words are drawn           C(pool, n)
 *   interlock    how the packer laid them out    measured floor, see below
 *   starters     which slot is revealed          n
 *
 * less three bits for the lattice's own symmetry group.
 *
 * The interlock term is deliberately pessimistic. The packer explores up to 24
 * seeded orderings and each produces a different grid, but only some are
 * distinct after symmetry, so it is counted as `log2(n!)` capped well below
 * what the packer can actually reach — the bank term alone clears the floor by
 * a wide margin, and there is nothing to gain from flattering the total.
 */
export function wordFitPageEntropyBits(options: {
  poolSize: number
  wordCount: number
}): number {
  const { poolSize, wordCount } = options
  if (poolSize < wordCount) return 0
  const interlock = Math.min(10, log2Factorial(wordCount) / 4)
  return Math.max(
    0,
    log2Choose(poolSize, wordCount) + interlock + Math.log2(Math.max(1, wordCount)) - 3,
  )
}
