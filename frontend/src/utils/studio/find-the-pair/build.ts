/**
 * Find the Pair — field construction.
 *
 * Two correctness properties hold every field together, and both are enforced
 * here rather than hoped for at draw time:
 *
 *  1. **Exactly one right answer.** Every figure on the page except the twins
 *     appears once, and no two distinct figures may *print* alike — a field
 *     holding two figures that differ only by an unreadable size step would
 *     have a second defensible answer, and whichever one the key named, half
 *     the readers would be marked wrong. `isDistinguishable` from Matrix
 *     Reasoning is the same rule that pack uses to keep its answer choices
 *     apart, so the two templates agree on what "different" means in print.
 *
 *  2. **Every figure is printable.** A mark struck inside a solid shape, or
 *     into a small one, closes up on paper (`isPrintable`). Such a figure would
 *     reach the page as a duplicate of some other figure — silently turning a
 *     one-answer puzzle into a two-answer one.
 */

import type { StudioRng } from '../studio-rng'
import { isDistinguishable } from '../matrix-reasoning/distractors'
import {
  COUNTS,
  FILLS,
  MARKS,
  SHAPES,
  SIZE_STEPS,
  isPrintable,
  type AttributeKey,
  type CountKind,
  type Figure,
  type SizeKind,
} from '../matrix-reasoning/types'
import {
  canonicalGridForm,
  composeCanonicalForm,
  log2Choose,
  log2Factorial,
} from '../_shared/uniqueness'
import type { FindThePairTier, PairExtraAttribute } from './types'

/** Attribute order used by `figureDistance` and `figureToken`. */
const ATTRIBUTES: readonly AttributeKey[] = ['shape', 'count', 'fill', 'size', 'mark']

/** Bits discounted for the eight rotations and reflections of a rectangle. */
const SYMMETRY_BITS = 3

/** Tries for a well-separated twin placement before the constraint is relaxed. */
const PLACEMENT_ATTEMPTS = 60

export interface FindThePairField {
  cols: number
  rows: number
  /** Row-major, `cols * rows` long. */
  cells: Figure[]
  /** True where the cell is half of a twinned pair — the answer key. */
  marked: boolean[]
  /** Shapes per cell across the whole field, so every figure prints at one scale. */
  slots: number
}

export interface FindThePairOptions {
  cols: number
  rows: number
  pairCount: number
  extras: readonly PairExtraAttribute[]
  tier: FindThePairTier
}

/** How many of the five attributes two figures disagree on. */
export function figureDistance(a: Figure, b: Figure): number {
  let distance = 0
  for (const attribute of ATTRIBUTES) {
    if (a[attribute] !== b[attribute]) distance++
  }
  return distance
}

/** Stable five-digit identity, independent of which extras are switched on. */
export function figureToken(figure: Figure): string {
  return [
    SHAPES.indexOf(figure.shape),
    COUNTS.indexOf(figure.count),
    FILLS.indexOf(figure.fill),
    SIZE_STEPS.indexOf(figure.size),
    MARKS.indexOf(figure.mark),
  ].join('')
}

const spaceCache = new Map<string, Figure[]>()

/**
 * Every figure this setting can print, pruned so no two of them print alike.
 *
 * The prune is a guard, not a formality: it is what property (1) above rests
 * on, and it keeps holding if someone later widens `SIZE_FACTOR` and brings two
 * size steps close enough to be confusable.
 */
export function printableSpace(extras: readonly PairExtraAttribute[]): Figure[] {
  const key = [...extras].sort().join(',')
  const cached = spaceCache.get(key)
  if (cached) return cached

  const counts: CountKind[] = extras.includes('count') ? COUNTS : [1]
  const sizes: SizeKind[] = extras.includes('size') ? SIZE_STEPS : ['medium']

  const candidates: Figure[] = []
  for (const shape of SHAPES) {
    for (const count of counts) {
      for (const fill of FILLS) {
        for (const size of sizes) {
          for (const mark of MARKS) {
            const figure: Figure = { shape, count, fill, size, mark }
            if (isPrintable(figure)) candidates.push(figure)
          }
        }
      }
    }
  }

  const kept: Figure[] = []
  for (const figure of candidates) {
    if (kept.every((seen) => isDistinguishable(seen, figure))) kept.push(figure)
  }

  spaceCache.set(key, kept)
  return kept
}

/** Distance from `figure` to its nearest twin — what the tier band is measured on. */
function distanceToTwins(figure: Figure, twins: readonly Figure[]): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const twin of twins) {
    nearest = Math.min(nearest, figureDistance(figure, twin))
  }
  return nearest
}

/**
 * Distractors inside the tier's distance band, widening it only when the field
 * cannot otherwise be filled with distinct figures.
 *
 * Widening is a real outcome, not a theoretical branch: a seller who switches
 * every extra attribute off leaves 51 printable figures, and Hard wants 35 of
 * them. Printing a slightly easier page beats refusing to print one, so the
 * band opens outward — and `validateConfig` blocks the case where even the
 * whole space is too small.
 */
function candidatePool(
  space: readonly Figure[],
  twins: readonly Figure[],
  tier: FindThePairTier,
  needed: number,
): { pool: Figure[]; minDistance: number; maxDistance: number } {
  const twinTokens = new Set(twins.map(figureToken))
  const others = space.filter((figure) => !twinTokens.has(figureToken(figure)))

  let minDistance = tier.minDistance
  let maxDistance = tier.maxDistance
  for (let step = 0; step < 8; step++) {
    const pool = others.filter((figure) => {
      const distance = distanceToTwins(figure, twins)
      return distance >= minDistance && distance <= maxDistance
    })
    if (pool.length >= needed) return { pool, minDistance, maxDistance }
    if (maxDistance < ATTRIBUTES.length) maxDistance++
    else if (minDistance > 1) minDistance--
    else break
  }
  return { pool: others, minDistance: 1, maxDistance: ATTRIBUTES.length }
}

/**
 * Fill the field, front-loading the tier's quota of near misses.
 *
 * Drawing the distractors as one shuffled batch lets a Hard page come out with
 * no near miss at all when the band happens to be wide, and the Difficulty
 * label then lies. Taking the quota from the distance-1 figures first makes the
 * tier a property of the page rather than of the draw.
 */
function pickDistractors(
  rng: StudioRng,
  pool: readonly Figure[],
  twins: readonly Figure[],
  needed: number,
  closeQuota: number,
): Figure[] {
  const close = pool.filter((figure) => distanceToTwins(figure, twins) === 1)
  const rest = pool.filter((figure) => distanceToTwins(figure, twins) !== 1)

  const chosen: Figure[] = []
  const taken = new Set<string>()
  const take = (figures: readonly Figure[], limit: number): void => {
    for (const figure of figures) {
      if (chosen.length >= limit) break
      const token = figureToken(figure)
      if (taken.has(token)) continue
      taken.add(token)
      chosen.push(figure)
    }
  }

  take(rng.shuffle(close), Math.min(needed, closeQuota))
  take(rng.shuffle([...rest, ...close]), needed)
  return chosen
}

function chebyshev(a: number, b: number, cols: number): number {
  return Math.max(
    Math.abs(Math.floor(a / cols) - Math.floor(b / cols)),
    Math.abs((a % cols) - (b % cols)),
  )
}

function sameRowOrColumn(a: number, b: number, cols: number): boolean {
  return Math.floor(a / cols) === Math.floor(b / cols) || a % cols === b % cols
}

/**
 * Where the twins go.
 *
 * Two identical figures sitting side by side are spotted without scanning
 * anything, and two in one row are found by reading that row — both waste the
 * page. Twins are therefore kept off each other's row, column and eight
 * neighbours. Four pairs on a small field can make that impossible, so the
 * constraint relaxes in one step rather than looping forever, exactly as the
 * card pack's change positions do.
 */
function pickTwinPositions(
  rng: StudioRng,
  total: number,
  cols: number,
  pairCount: number,
): number[][] {
  const all = Array.from({ length: total }, (_, i) => i)

  const attempt = (strict: boolean): number[][] | null => {
    const picked = rng.sample(all, pairCount * 2)
    const pairs: number[][] = []
    for (let i = 0; i < pairCount; i++) {
      const a = picked[i * 2]!
      const b = picked[i * 2 + 1]!
      if (chebyshev(a, b, cols) < 2) return null
      if (strict && sameRowOrColumn(a, b, cols)) return null
      pairs.push([a, b])
    }
    return pairs
  }

  for (let i = 0; i < PLACEMENT_ATTEMPTS; i++) {
    const strict = attempt(true)
    if (strict) return strict
  }
  for (let i = 0; i < PLACEMENT_ATTEMPTS; i++) {
    const loose = attempt(false)
    if (loose) return loose
  }
  // Last resort: distinct cells, nothing more. Reachable only on a field so
  // small that no separated placement exists at all.
  const picked = rng.sample(all, pairCount * 2)
  return Array.from({ length: pairCount }, (_, i) => [picked[i * 2]!, picked[i * 2 + 1]!])
}

export function buildFindThePairField(
  rng: StudioRng,
  options: FindThePairOptions,
): FindThePairField {
  const { cols, rows, extras, tier } = options
  const total = cols * rows
  const space = printableSpace(extras)

  const pairCount = Math.max(1, Math.min(options.pairCount, Math.floor(total / 2) - 1))
  const needed = total - pairCount * 2

  /**
   * Twins are drawn apart from each other for the same reason distractors are
   * drawn close to them: two twins one attribute apart put four near-identical
   * figures on the page, and the reader can no longer tell which two of the
   * four actually match.
   */
  let twins = rng.sample(space, pairCount)
  for (let i = 0; i < 24 && pairCount > 1; i++) {
    const spread = twins.every((a, ai) =>
      twins.slice(ai + 1).every((b) => figureDistance(a, b) >= 2),
    )
    if (spread) break
    twins = rng.sample(space, pairCount)
  }

  const { pool } = candidatePool(space, twins, tier, needed)
  const distractors = pickDistractors(rng, pool, twins, needed, tier.closeQuota)

  const cells = new Array<Figure | null>(total).fill(null)
  const marked = new Array<boolean>(total).fill(false)
  const positions = pickTwinPositions(rng, total, cols, pairCount)

  positions.forEach((pair, index) => {
    const twin = twins[index] ?? twins[0]!
    for (const position of pair) {
      cells[position] = twin
      marked[position] = true
    }
  })

  const spare = rng.shuffle(distractors)
  let next = 0
  for (let i = 0; i < total; i++) {
    if (cells[i]) continue
    // `spare` is sized to the empty cells, but a relaxed twin placement can
    // collide two pairs onto one cell; fall back rather than leave a hole.
    cells[i] = spare[next++] ?? spare[next % Math.max(1, spare.length)] ?? twins[0]!
  }

  const filled = cells as Figure[]
  return {
    cols,
    rows,
    cells: filled,
    marked,
    slots: Math.max(1, ...filled.map((figure) => figure.count)),
  }
}

/**
 * Canonical form (§4.2): the field as a grid of figure tokens, reduced over the
 * eight rotations and reflections. A field turned ninety degrees is the same
 * puzzle and must collide; one built from a different set of figures must not.
 *
 * The answer is a function of the grid — the twins are simply the figures that
 * appear twice — so the grid alone is a complete description of the puzzle.
 */
export function findThePairCanonicalForm(field: FindThePairField): string {
  const grid: string[][] = []
  for (let r = 0; r < field.rows; r++) {
    grid.push(
      Array.from({ length: field.cols }, (_, c) => figureToken(field.cells[r * field.cols + c]!)),
    )
  }
  return composeCanonicalForm('find-the-pair', canonicalGridForm(grid, (token) => token))
}

/**
 * Analytic entropy of one page, in bits (§4.5).
 *
 * Three independent axes multiply:
 *
 *   twins        which figures are the repeated ones      C(F, k)
 *   distractors  which of the pool fills the rest         C(P, n − 2k)
 *   arrangement  where all of it lands                    n! / 2^k
 *
 * less three bits for the grid's own symmetry group, which the canonical form
 * collapses. `P` is the *smallest* pool any twin in the space can offer at this
 * tier's band, so the figure is a lower bound rather than a typical case.
 */
export function findThePairPageEntropyBits(options: FindThePairOptions): number {
  const { cols, rows, extras, tier } = options
  const total = cols * rows
  const space = printableSpace(extras)
  const pairCount = Math.max(1, Math.min(options.pairCount, Math.floor(total / 2) - 1))
  const needed = total - pairCount * 2
  if (space.length < total - pairCount) return 0

  let smallestPool = Number.POSITIVE_INFINITY
  for (const twin of space) {
    const { pool } = candidatePool(space, [twin], tier, needed)
    smallestPool = Math.min(smallestPool, pool.length)
  }

  return Math.max(
    0,
    log2Choose(space.length, pairCount) +
      log2Choose(smallestPool, needed) +
      log2Factorial(total) -
      pairCount -
      SYMMETRY_BITS,
  )
}

/** Distinct figures a field of `total` cells with `pairCount` twins consumes. */
export function distinctFiguresNeeded(total: number, pairCount: number): number {
  return total - pairCount
}
