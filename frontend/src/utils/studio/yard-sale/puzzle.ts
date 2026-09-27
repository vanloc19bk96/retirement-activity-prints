import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { UNKNOWN, YS_SHADED, YS_WHITE, isYsSolution, solveYs, ysJoined, ysShadeText, type YsPuzzle, type YsRules, type YsTally } from './solver'

/**
 * Building a Yard Sale grid.
 *
 * The answer comes first: a Latin square (every number once in every row and
 * column), drawn square by square in a random order, and a shading on it —
 * squares taken at random, never two side by side and never one that would
 * cut the white squares in two, up to the level's share. The white squares
 * keep their numbers; every shaded square is given a number another white
 * square in its row or column already holds, so it is a real repeat and
 * the reader has a reason to shade it.
 *
 * The shaded squares' numbers are then tuned until the grid tells its
 * answer: the level's steps (short of "what if") solve the grid as far as
 * they can, a few shaded squares in the rows and columns they could not
 * reach are each tried with another repeat, and the change that leaves the
 * fewest squares open is kept. A grid those steps finish is kept when it is
 * no easier than the level; one that is too easy has single numbers changed
 * until one makes a grid only the level's own steps finish (at a "what if"
 * level, every grid comes this way).
 */

export interface YsBuilt {
  puzzle: YsPuzzle
  /** The one answer: 1 shaded, 0 white, square by square in reading order. */
  shade: number[]
  /** Digest of the grid, the same however it is turned or mirrored, or its numbers renamed. */
  signature: string
}

/** Grids built before a level gives up on this stream. */
export const YS_CANDIDATES = 30
/** Numbers changed while tuning one shading. */
const REPAIRS = 120
/** Changes weighed at each tuning step; the one leaving the fewest squares open is kept. */
const REPAIR_CHOICES = 6
/** One-number changes tried on a too-easy grid before it is shaken up instead. */
const HARDEN_TRIES = 60

/**
 * A grid's own fingerprint: turned, mirrored, or with its numbers renamed
 * (every 3 a 5 and every 5 a 3), it is the same puzzle.
 */
export function ysSignature(p: YsPuzzle): string {
  const n = p.size
  const rows = Array.from({ length: n }, (_, r) => p.numbers.slice(r * n, r * n + n))
  let best: string | null = null
  for (const turned of gridSymmetries(rows)) {
    // Numbers renamed in the order they are first read.
    const names = new Map<number, number>()
    const form = turned
      .map((row) =>
        row
          .map((v) => {
            if (!names.has(v)) names.set(v, names.size + 1)
            return names.get(v)!.toString(36)
          })
          .join(''),
      )
      .join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(`${n}|${best ?? ''}`)
}

/* ------------------------------------------------------------------ *
 * The answer
 * ------------------------------------------------------------------ */

/**
 * A Latin square of numbers 1 to n: square by square, each taking a number
 * not yet in its row or column, in a random order. Null when the search runs
 * past its budget.
 */
export function drawYsLatin(n: number, rng: StudioRng): number[] | null {
  const grid = new Array<number>(n * n).fill(0)
  const inRow = Array.from({ length: n }, () => new Uint8Array(n + 1))
  const inCol = Array.from({ length: n }, () => new Uint8Array(n + 1))
  const numbers = Array.from({ length: n }, (_, k) => k + 1)
  let budget = 40000
  const place = (i: number): boolean => {
    if (i === n * n) return true
    const r = Math.floor(i / n)
    const c = i % n
    for (const v of rng.shuffle(numbers)) {
      if (--budget < 0) return false
      if (inRow[r]![v] || inCol[c]![v]) continue
      grid[i] = v
      inRow[r]![v] = 1
      inCol[c]![v] = 1
      if (place(i + 1)) return true
      inRow[r]![v] = 0
      inCol[c]![v] = 0
    }
    return false
  }
  return place(0) ? grid : null
}

/**
 * A shading of `count` squares (or as near as the grid allows): squares
 * taken in a random order, never two side by side, never one that would cut
 * the white squares in two.
 */
export function drawYsShading(n: number, count: number, rng: StudioRng): number[] {
  const shade = new Array<number>(n * n).fill(YS_WHITE)
  const open = new Array<boolean>(n * n).fill(true)
  let placed = 0
  for (const i of rng.shuffle(Array.from({ length: n * n }, (_, k) => k))) {
    if (placed >= count) break
    const r = Math.floor(i / n)
    const c = i % n
    if ((r > 0 && shade[i - n]) || (c > 0 && shade[i - 1]) || (c + 1 < n && shade[i + 1]) || (r + 1 < n && shade[i + n])) continue
    open[i] = false
    if (!ysJoined(n, open)) {
      open[i] = true
      continue
    }
    shade[i] = YS_SHADED
    placed++
  }
  return shade
}

/** The numbers a shaded square may take: any a white square in its row or column holds. */
function repeatsFor(n: number, latin: readonly number[], shade: readonly number[], i: number): number[] {
  const r = Math.floor(i / n)
  const c = i % n
  const out = new Set<number>()
  for (let k = 0; k < n; k++) {
    if (shade[r * n + k] === YS_WHITE) out.add(latin[r * n + k]!)
    if (shade[k * n + c] === YS_WHITE) out.add(latin[k * n + c]!)
  }
  return [...out]
}

/* ------------------------------------------------------------------ *
 * The level
 * ------------------------------------------------------------------ */

export interface YsLevelNeeds {
  size: number
  rules: YsRules
  /** Refuse grids these steps alone finish. */
  beyond?: YsRules | null
  /** The fewest of the level's own steps ("never wall off" or "what if") the grid must take. */
  minHard?: number
  /** Fewest and most shaded squares, as a share of the squares. */
  shaded: readonly [number, number]
}

/** The level's own steps beyond the ones before it: "never wall off" at walls, "what if" at probe. */
export function ysHardSteps(tally: YsTally, rules: YsRules): number {
  if (rules === 'probe') return tally.probe
  if (rules === 'walls') return tally.walls
  return 0
}

/** How many squares an answer shades. */
export const ysShadedCount = (shade: readonly number[]) => shade.filter((v) => v === YS_SHADED).length

/** True when the answer shades the level's share of the squares. */
export function ysShareFits(size: number, shade: readonly number[], shaded: readonly [number, number]): boolean {
  const count = ysShadedCount(shade)
  return count >= Math.ceil(shaded[0] * size * size) && count <= Math.floor(shaded[1] * size * size)
}

/** True when the level's own steps finish the grid on exactly this answer. */
function finishes(p: YsPuzzle, shade: readonly number[], rules: YsRules): YsTally | null {
  const solve = solveYs(p, rules)
  return solve.solved && ysShadeText(solve.state) === ysShadeText(shade) ? solve.tally : null
}

/** True when the grid is one the level's steps finish on exactly this answer, and no easier. */
export function ysMeetsLevel(p: YsPuzzle, shade: readonly number[], needs: YsLevelNeeds): boolean {
  if (p.size !== needs.size || !isYsSolution(p, shade) || !ysShareFits(p.size, shade, needs.shaded)) return false
  const tally = finishes(p, shade, needs.rules)
  if (!tally) return false
  if (needs.beyond && solveYs(p, needs.beyond).solved) return false
  return ysHardSteps(tally, needs.rules) >= (needs.minHard ?? 0)
}

/**
 * One grid built for the level, kept only when the level's steps solve it to
 * exactly its answer (and, when `beyond` is given, those steps alone do not).
 * Null when this draw does not.
 */
export function drawYsCandidate(options: YsLevelNeeds & { rng: StudioRng }): YsBuilt | null {
  const { size: n, rules, shaded, rng } = options
  const latin = drawYsLatin(n, rng)
  if (!latin) return null
  const squares = n * n
  const target = Math.round(squares * (shaded[0] + rng.next() * (shaded[1] - shaded[0])))
  const shade = drawYsShading(n, target, rng)
  if (!ysShareFits(n, shade, shaded)) return null
  const dark = shade.flatMap((v, i) => (v === YS_SHADED ? [i] : []))
  const choices = new Map(dark.map((i) => [i, repeatsFor(n, latin, shade, i)]))
  const numbers = [...latin]
  for (const i of dark) numbers[i] = rng.pick(choices.get(i)!)
  const first: YsRules = rules === 'probe' ? 'walls' : rules
  const puzzleOf = (): YsPuzzle => ({ size: n, numbers: [...numbers] })
  const built = (p: YsPuzzle): YsBuilt => ({ puzzle: p, shade: [...shade], signature: ysSignature(p) })

  /** Another repeat for shaded square i, other than the one it holds. */
  const otherFor = (i: number): number | null => {
    const others = choices.get(i)!.filter((v) => v !== numbers[i])
    return others.length > 0 ? rng.pick(others) : null
  }
  /** A grid one number away from this too-easy one that only the level's own steps finish; null when none is among those tried. */
  const harden = (): YsBuilt | null => {
    const moves = dark.flatMap((i) => choices.get(i)!.filter((v) => v !== numbers[i]).map((v) => [i, v] as const))
    for (const [i, v] of rng.shuffle(moves).slice(0, HARDEN_TRIES)) {
      const keep = numbers[i]!
      numbers[i] = v
      const p = puzzleOf()
      // Most changes leave the grid as easy as it was: the easier steps say so far sooner than the level's own.
      if (!(options.beyond && solveYs(p, options.beyond).solved) && ysMeetsLevel(p, shade, options)) return built(p)
      numbers[i] = keep
    }
    return null
  }

  for (let k = 0; k < REPAIRS; k++) {
    const p = puzzleOf()
    const solve = solveYs(p, first)
    if (solve.solved) {
      if (rules !== 'probe' && !(options.beyond && solveYs(p, options.beyond).solved)) {
        return ysMeetsLevel(p, shade, options) ? built(p) : harden()
      }
      // Too easy: one shaded square given another repeat may be just hard enough.
      const harder = harden()
      if (harder) return harder
      const i = rng.pick(dark)
      const v = otherFor(i)
      if (v !== null) numbers[i] = v
      continue
    }
    // Tune a shaded square in a line the steps could not finish: a few tries, keep the best.
    const stuckLines = new Set<number>()
    solve.state.forEach((v, i) => {
      if (v !== UNKNOWN) return
      stuckLines.add(Math.floor(i / n))
      stuckLines.add(n + (i % n))
    })
    const near = dark.filter((i) => stuckLines.has(Math.floor(i / n)) || stuckLines.has(n + (i % n)))
    const pool = near.length > 0 ? near : dark
    let best: { i: number; v: number; open: number } | null = null
    for (let c = 0; c < REPAIR_CHOICES; c++) {
      const i = rng.pick(pool)
      const v = otherFor(i)
      if (v === null) continue
      const keep = numbers[i]!
      numbers[i] = v
      const left = solveYs(puzzleOf(), first).open
      numbers[i] = keep
      if (!best || left < best.open) best = { i, v, open: left }
    }
    if (best) numbers[best.i] = best.v
  }
  return null
}

/**
 * A grid for the level from this stream: grids built until one is solved by
 * exactly the level's steps, or null when none is within the budget.
 */
export function buildYsGrid(
  options: YsLevelNeeds & {
    rng: StudioRng
    /** Grids already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): YsBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < YS_CANDIDATES; k++) {
    const built = drawYsCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
