import type { StudioRng } from '../studio-rng'
import { canonicalHash } from '../_shared/uniqueness'
import {
  DRIVE_BLANK,
  driveAnswerKey,
  driveConnected,
  driveCombos,
  driveKeepsRules,
  drivePatternWellFormed,
  driveRuns,
  driveTotalsOf,
  fillDriveGrid,
  solveDrive,
  type DrivePuzzle,
  type DriveRules,
} from './solver'

/**
 * Building a Scenic Drive grid.
 *
 * The road map comes first: a square of white squares inside a gray top row
 * and left column, with gray squares set in pairs, each the mirror of the
 * other through the grid's centre, so the page looks balanced as a
 * crossword does. Gray squares go in to break runs longer than the level
 * allows, then a few more at random; a white square left alone in a run of
 * one goes gray with them, and the white squares must stay one piece.
 *
 * The digits come next: a search writes a digit in every white square, no
 * digit twice in a run, trying digits in a random order; every run's total
 * is then read off the digits.
 *
 * The digits are then tuned until the totals tell them: the level's steps
 * (short of "what if") solve the grid as far as they can, a few squares they
 * could not reach are each tried with another digit — most often the one
 * that makes its two totals hardest to make more than one way — and the
 * change that leaves the fewest squares open is kept. A grid those steps
 * finish on exactly its digits is kept when it is no easier than the level;
 * one that is too easy has single digits changed until one change makes a
 * grid only the level's own steps finish (at a "what if" level, every grid
 * the other steps finish is too easy, so every grid comes this way).
 */

export interface DriveBuilt {
  puzzle: DrivePuzzle
  /** The one answer: the digit in every white square (DRIVE_BLANK on gray ones). */
  values: number[]
  /** Digest of the grid and its totals, the same however the grid is flipped across its diagonal. */
  signature: string
}

/** Grids built before a level gives up on this stream. */
export const DRIVE_CANDIDATES = 24
/** Road maps drawn before a candidate gives up. */
const PATTERN_TRIES = 60
/** Fresh fillings of one road map before another is drawn. */
const FILLS = 4
/** Digits changed while tuning one filling. */
const REPAIRS = 160
/** Changes weighed at each tuning step; the one leaving the fewest squares open is kept. */
const REPAIR_CHOICES = 6
/** One-digit changes tried on a too-easy grid before it is shaken up instead. */
const HARDEN_TRIES = 80

/** How a level likes its road map: the longest run, and the share of the inner squares that are gray. */
export interface DriveShape {
  maxRun: number
  blacks: readonly [number, number]
}

/**
 * A grid's own fingerprint: flipped across its diagonal (the runs across
 * becoming the runs down), it is the same puzzle.
 */
export function driveSignature(puzzle: DrivePuzzle): string {
  const n = puzzle.size
  const form = (flip: boolean) => {
    const rows: string[] = []
    for (let r = 0; r < n; r++) {
      const cells: string[] = []
      for (let c = 0; c < n; c++) {
        const s = flip ? c * n + r : r * n + c
        if (puzzle.open[s]) cells.push('.')
        else {
          const across = flip ? puzzle.down[s]! : puzzle.across[s]!
          const down = flip ? puzzle.across[s]! : puzzle.down[s]!
          cells.push(across === DRIVE_BLANK && down === DRIVE_BLANK ? '#' : `${down}\\${across}`)
        }
      }
      rows.push(cells.join(' '))
    }
    return rows.join('/')
  }
  const a = form(false)
  const b = form(true)
  return canonicalHash(a < b ? a : b)
}

/* ------------------------------------------------------------------ *
 * The road map
 * ------------------------------------------------------------------ */

/** True when the white square s stands alone in a run of one, across or down. */
function lone(n: number, open: readonly boolean[], s: number): boolean {
  const c = s % n
  const across = (c > 0 && open[s - 1]) || (c < n - 1 && open[s + 1])
  const down = (s >= n && open[s - n]) || (s + n < n * n && open[s + n])
  return !across || !down
}

/** The square that mirrors (r, c) through the centre of the inner grid. */
const mirror = (n: number, r: number, c: number) => (n - r) * n + (n - c)

/** How many inner squares a road map has gray. */
export function driveGrayCount(n: number, open: readonly boolean[]): number {
  let count = 0
  for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) if (!open[r * n + c]) count++
  return count
}

/** True when the road map's gray share of the inner squares is within the level's range. */
export function driveShapeFits(n: number, open: readonly boolean[], shape: DriveShape): boolean {
  const inner = (n - 1) * (n - 1)
  const gray = driveGrayCount(n, open)
  return gray >= Math.floor(shape.blacks[0] * inner) && gray <= Math.ceil(shape.blacks[1] * inner) && drivePatternWellFormed(n, open, shape.maxRun)
}

/**
 * Draws an n × n road map: the gray top row and left column, and gray pairs
 * inside mirrored through the centre. Each pair that goes in takes with it
 * (and its mirror) any white square it leaves alone in a run of one, and is
 * taken back if that cuts the white squares in two or grays too many. Runs
 * longer than the level allows are broken first, then pairs go in at random
 * until the level's share is reached. Null when this draw does not come out
 * proper.
 */
export function drawDrivePattern(n: number, rng: StudioRng, shape: DriveShape): boolean[] | null {
  const open = Array.from({ length: n * n }, (_, s) => s >= n && s % n !== 0)
  const inner = (n - 1) * (n - 1)
  const most = Math.ceil(shape.blacks[1] * inner)
  const target = Math.round(inner * (shape.blacks[0] + rng.next() * (shape.blacks[1] - shape.blacks[0])))

  /** Grays s and its mirror, and every square that leaves alone, unless the whites split or too many go gray. */
  const tryGray = (s: number): boolean => {
    if (!open[s]) return false
    const before = [...open]
    const queue = [s]
    while (queue.length > 0) {
      const t = queue.pop()!
      for (const u of [t, mirror(n, Math.floor(t / n), t % n)]) {
        if (!open[u]) continue
        open[u] = false
        const r = Math.floor(u / n)
        const c = u % n
        for (let k = 1; k < n; k++) {
          if (open[r * n + k] && lone(n, open, r * n + k)) queue.push(r * n + k)
          if (open[k * n + c] && lone(n, open, k * n + c)) queue.push(k * n + c)
        }
      }
    }
    if (driveGrayCount(n, open) <= most && open.some(Boolean) && driveConnected(n, open)) return true
    for (let k = 0; k < open.length; k++) open[k] = before[k]!
    return false
  }

  // Break every run longer than the level allows: a square well inside it, most often.
  for (let guard = 0; guard < 60; guard++) {
    const long = driveRuns({ size: n, open }).filter((run) => run.cells.length > shape.maxRun)
    if (long.length === 0) break
    const run = rng.pick(long).cells
    const middle = run.slice(2, -2)
    const spots = [...rng.shuffle(middle), ...rng.shuffle(run.filter((s) => !middle.includes(s)))]
    if (!spots.some(tryGray)) return null
  }

  // Then pairs at random until the level's share.
  for (const s of rng.shuffle(open.flatMap((o, k) => (o ? [k] : [])))) {
    if (driveGrayCount(n, open) >= target) break
    tryGray(s)
  }
  return driveShapeFits(n, open, shape) ? open : null
}

/* ------------------------------------------------------------------ *
 * The digits
 * ------------------------------------------------------------------ */

export interface DriveLevelNeeds extends DriveShape {
  size: number
  rules: DriveRules
  /** Refuse grids these steps alone finish. */
  beyond?: DriveRules | null
  /** How often tuning takes the digit that makes its totals hardest to make other ways (the rest, any digit). */
  greed: number
}

/** True when the level's own steps finish the grid on exactly these digits. */
function finishes(puzzle: DrivePuzzle, values: readonly number[], rules: DriveRules): boolean {
  const done = (r: DriveRules) => {
    const solve = solveDrive(puzzle, r)
    return solve.solved && driveAnswerKey(solve.values) === driveAnswerKey(values)
  }
  // "What if" only adds to the other steps: a grid they finish, it finishes too — and far sooner.
  if (rules === 'probe' && done('fit')) return true
  return done(rules)
}

/** True when the grid is one the level's steps finish on exactly these digits, and no easier. */
export function driveMeetsLevel(puzzle: DrivePuzzle, values: readonly number[], needs: Pick<DriveLevelNeeds, 'rules' | 'beyond'>): boolean {
  if (!driveKeepsRules(puzzle, values)) return false
  if (!finishes(puzzle, values, needs.rules)) return false
  return !(needs.beyond && solveDrive(puzzle, needs.beyond).solved)
}

/** The puzzle a road map and its digits make: the totals read off the digits. */
export function drivePuzzleOf(n: number, open: readonly boolean[], values: readonly number[]): DrivePuzzle {
  return { size: n, open, ...driveTotalsOf(n, open, values) }
}

/**
 * One grid built for the level, kept only when the level's steps solve it to
 * exactly its digits (and, when `beyond` is given, those steps alone do not).
 * Null when this draw does not.
 */
export function drawDriveCandidate(options: DriveLevelNeeds & { rng: StudioRng }): DriveBuilt | null {
  const { size: n, rng } = options
  let open: boolean[] | null = null
  for (let t = 0; t < PATTERN_TRIES && !open; t++) open = drawDrivePattern(n, rng, options)
  if (!open) return null
  const runs = driveRuns({ size: n, open })
  const runsOf: number[][] = Array.from({ length: n * n }, () => [])
  runs.forEach((run, i) => run.cells.forEach((s) => runsOf[s]!.push(i)))
  const whites = open.flatMap((o, s) => (o ? [s] : []))
  const first: DriveRules = options.rules === 'probe' ? 'fit' : options.rules
  let values: number[] = []
  /** The digits already in a square's two runs. */
  const takenBy = (s: number) => new Set(runsOf[s]!.flatMap((r) => runs[r]!.cells.filter((t) => t !== s).map((t) => values[t]!)))
  /** How many ways the totals of square s's two runs could be made, were it to hold d. */
  const ways = (s: number, d: number) =>
    runsOf[s]!.reduce((sum, r) => {
      const run = runs[r]!
      const total = run.cells.reduce((acc, t) => acc + (t === s ? d : values[t]!), 0)
      return sum + driveCombos(run.cells.length, total).length
    }, 0)
  /**
   * A grid one digit away from this too-easy one that the level's steps, and
   * only they, finish; null when none is among the changes tried.
   */
  const harden = (): DriveBuilt | null => {
    const moves = whites.flatMap((s) => {
      const taken = takenBy(s)
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== values[s] && !taken.has(d)).map((d) => [s, d] as const)
    })
    for (const [s, d] of rng.shuffle(moves).slice(0, HARDEN_TRIES)) {
      const keep = values[s]!
      values[s] = d
      const puzzle = drivePuzzleOf(n, open, values)
      if (driveMeetsLevel(puzzle, values, options)) return { puzzle, values: [...values], signature: driveSignature(puzzle) }
      values[s] = keep
    }
    return null
  }

  for (let f = 0; f < FILLS; f++) {
    const filled = fillDriveGrid(n, open, (o) => rng.shuffle(o))
    if (!filled) return null
    values = filled
    for (let k = 0; k < REPAIRS; k++) {
      const puzzle = drivePuzzleOf(n, open, values)
      // Tuned against the steps short of "what if": at a "what if" level those must not finish the
      // grid, so a grid they do finish is made one digit harder.
      const solve = solveDrive(puzzle, first)
      if (solve.solved) {
        if (options.rules !== 'probe' && !(options.beyond && solveDrive(puzzle, options.beyond).solved)) {
          if (driveMeetsLevel(puzzle, values, options)) return { puzzle, values: [...values], signature: driveSignature(puzzle) }
          break
        }
        // Too easy: one square given another digit may be just hard enough.
        const harder = harden()
        if (harder) return harder
        // If none is, any square, any other digit, and tune again from there.
        const s = rng.pick(whites)
        const taken = takenBy(s)
        const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== values[s] && !taken.has(d))
        if (others.length > 0) values[s] = rng.pick(others)
        continue
      }
      // Tune one square the steps could not reach: a few tries, each another digit not already in its
      // runs, and keep the one that leaves the fewest squares open.
      const stuck = whites.filter((t) => solve.values[t] === DRIVE_BLANK)
      let best: { s: number; d: number; open: number } | null = null
      for (let c = 0; c < REPAIR_CHOICES; c++) {
        const s = rng.pick(stuck)
        const taken = takenBy(s)
        const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== values[s] && !taken.has(d))
        if (others.length === 0) continue
        // The digit whose totals have the fewest ways to make them, most of the time.
        let d: number
        if (rng.chance(options.greed)) {
          const fewest = Math.min(...others.map((v) => ways(s, v)))
          d = rng.pick(others.filter((v) => ways(s, v) === fewest))
        } else d = rng.pick(others)
        const keep = values[s]!
        values[s] = d
        const left = solveDrive(drivePuzzleOf(n, open, values), first).open
        values[s] = keep
        if (!best || left < best.open) best = { s, d, open: left }
      }
      if (best) values[best.s] = best.d
    }
  }
  return null
}

/**
 * A grid for the level from this stream: grids built until one is solved by
 * exactly the level's steps, or null when none is within the budget.
 */
export function buildDriveGrid(
  options: DriveLevelNeeds & {
    rng: StudioRng
    /** Grids already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): DriveBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < DRIVE_CANDIDATES; k++) {
    const built = drawDriveCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
