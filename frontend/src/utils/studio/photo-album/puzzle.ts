import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import type { StudioRng } from '../studio-rng'
import { PA_OPEN, PaSolver, paCountsOf, solvePa, type PaPuzzle, type PaRules, type PaTally } from './solver'

/**
 * Building a Photo Album grid: which squares print their number.
 *
 * The picture fixes every square's number; the puzzle is the choice of
 * which to print. The builder works like a setter at their desk: it solves
 * with nothing printed, and each time "overlap" runs dry it prints one more
 * number — a square picked from the seller's stream among those whose block
 * still holds an open square — and carries on from where it stopped. Once
 * the grid is finished it goes back over every printed number in a random
 * order and takes out each one the grid can do without (down to the level's
 * share at the easier levels), so a reader has to use the numbers left; at
 * Challenging it then takes out a few that only "what if" can do without.
 * Two sellers, or two pages, drawing the same picture get different numbers
 * in different places, and every grid is proven by the level's own steps.
 */

export interface PaBuilt {
  puzzle: PaPuzzle
  /** The answer, row by row. */
  bitmap: readonly boolean[]
  /** A digest of the printed numbers, the same when the grid is turned or mirrored. */
  signature: string
  /** What the level's steps took to finish it. */
  tally: PaTally
}

export interface PaLevelNeeds {
  /** The steps a reader needs; the solver may use no others. */
  rules: PaRules
  /** Steps the level's grids must not fall to alone. */
  beyond: PaRules | null
  /** The fewest of the level's own steps ("overlap" at Classic, "what if" at Challenging) a grid takes. */
  minHard: number
  /** Share of the grid's squares, at most, that print a number (a Gentle grid keeps more to start from). */
  keep: number
}

/** The level's own steps in a tally: "overlap" at Classic, "what if" at Challenging. */
export function paHardSteps(tally: PaTally, rules: PaRules): number {
  if (rules === 'probe') return tally.probe
  if (rules === 'pairs') return tally.pairs
  return 0
}

/** How many squares print a number. */
export const paClueCount = (p: PaPuzzle) => p.clues.filter((v) => v >= 0).length

/**
 * The printed numbers as a digest that is the same however the grid is
 * turned or mirrored: a picture drawn the other way round with its numbers
 * in the mirrored places is the same puzzle.
 */
export function paSignature(p: PaPuzzle): string {
  const rows = Array.from({ length: p.height }, (_, r) => p.clues.slice(r * p.width, r * p.width + p.width).map((v) => (v < 0 ? '.' : String(v))))
  let best: string | null = null
  for (const turned of gridSymmetries(rows)) {
    const form = `${turned[0]?.length ?? 0}x${turned.length}|${turned.map((row) => row.join('')).join('/')}`
    if (best === null || form < best) best = form
  }
  return canonicalHash(`pa|${best ?? ''}`)
}

/** True when the grid is one the level prints: finished by its steps, not by easier ones alone, with its own steps used often enough. */
export function paMeetsLevel(p: PaPuzzle, needs: PaLevelNeeds): { ok: boolean; tally: PaTally } {
  const solve = solvePa(p, needs.rules)
  if (!solve.solved) return { ok: false, tally: solve.tally }
  if (needs.beyond && solvePa(p, needs.beyond).solved) return { ok: false, tally: solve.tally }
  return { ok: paHardSteps(solve.tally, needs.rules) >= needs.minHard, tally: solve.tally }
}

/**
 * Numbers printed until the level's steps finish the grid: the solve runs,
 * and where it stalls one more number is printed on a square whose block is
 * still open. Null when even every number printed will not finish it.
 */
export function growPaClues(bitmap: readonly boolean[], width: number, height: number, rules: PaRules, rng: StudioRng): number[] | null {
  const counts = paCountsOf(bitmap, width, height)
  const n = width * height
  const clues = new Array<number>(n).fill(-1)
  const solver = new PaSolver({ width, height, clues }, rules)
  // Every square in a random order, read from the front each time the solve stalls.
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i))
  let at = 0
  const blockOpen = (i: number) => {
    const r = Math.floor(i / width)
    const c = i % width
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < height && cc >= 0 && cc < width && solver.cells[rr * width + cc] === PA_OPEN) return true
      }
    }
    return false
  }
  while (!solver.run()) {
    if (solver.broken) return null
    while (at < n && (clues[order[at]!]! >= 0 || !blockOpen(order[at]!))) at++
    if (at >= n) return null
    const i = order[at++]!
    clues[i] = counts[i]!
    solver.addClue(i, counts[i]!)
  }
  return clues
}

/** How far the "what if" trim looks: numbers tried, and numbers taken out, before it stops. */
export const PA_PROBE_TRIM = { tries: 90, takes: 3 } as const

/**
 * Printed numbers the grid can do without, taken out in a random order,
 * while the given steps still finish it — and, at a level whose grids keep
 * more numbers, only down to that share. `limit` stops the pass early (the
 * "what if" pass is slow, and a few numbers out is enough).
 */
export function prunePaClues(
  clues: readonly number[],
  width: number,
  height: number,
  rules: PaRules,
  keep: number,
  rng: StudioRng,
  limit: { tries: number; takes: number } = { tries: Infinity, takes: Infinity },
): number[] {
  const out = [...clues]
  const floor = Math.ceil(keep * width * height)
  let printed = out.filter((v) => v >= 0).length
  let tries = 0
  let takes = 0
  for (const i of rng.shuffle(out.map((v, i) => (v >= 0 ? i : -1)).filter((i) => i >= 0))) {
    if (printed <= floor || tries >= limit.tries || takes >= limit.takes) break
    tries++
    const value = out[i]!
    out[i] = -1
    if (solvePa({ width, height, clues: out }, rules).solved) {
      printed--
      takes++
    } else out[i] = value
  }
  return out
}

/**
 * The numbers a level prints, from a finished set: taken out while
 * "overlap" still finishes the grid (quick to check), then — at a level that
 * asks for "what if" — taken out further while "what if" does. A number
 * the second pass takes out is one "overlap" cannot do without, so every
 * such grid needs "what if" to finish.
 */
export function trimPaClues(clues: readonly number[], width: number, height: number, needs: Pick<PaLevelNeeds, 'rules' | 'keep'>, rng: StudioRng): number[] {
  const first = prunePaClues(clues, width, height, needs.rules === 'basic' ? 'basic' : 'pairs', needs.keep, rng)
  return needs.rules === 'probe' ? prunePaClues(first, width, height, 'probe', needs.keep, rng, PA_PROBE_TRIM) : first
}

/**
 * One grid for a picture at a level, or null when this stream cannot make
 * one the level prints (or only one the book already has).
 */
export function buildPaGrid(options: PaLevelNeeds & {
  bitmap: readonly boolean[]
  width: number
  height: number
  rng: StudioRng
  /** Grids already printed (signatures), never built again. */
  exclude?: ReadonlySet<string>
}): PaBuilt | null {
  const { bitmap, width, height, rng, exclude } = options
  // Grown on "overlap" at most: quick, and the trim below asks for more.
  const grown = growPaClues(bitmap, width, height, options.rules === 'basic' ? 'basic' : 'pairs', rng)
  if (!grown) return null
  const clues = trimPaClues(grown, width, height, options, rng)
  const puzzle: PaPuzzle = { width, height, clues }
  const level = paMeetsLevel(puzzle, options)
  if (!level.ok) return null
  const signature = paSignature(puzzle)
  if (exclude?.has(signature)) return null
  return { puzzle, bitmap: [...bitmap], signature, tally: level.tally }
}
