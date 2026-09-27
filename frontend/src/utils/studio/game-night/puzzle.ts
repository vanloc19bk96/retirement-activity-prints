import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { GN_MAX_CAGE, gnCageHolds, gnCageJoined, gnValuesText, isGnSolution, solveGn, type GnCage, type GnOp, type GnPuzzle, type GnRules, type GnTally } from './solver'

/**
 * Building a Game Night grid.
 *
 * The answer comes first: a Latin square (every number once in every row and
 * column), drawn square by square in a random order. Boxes are grown on it
 * from random squares, a square at a time into a random neighbour, up to a
 * size drawn for the level — never taking in a number the box already holds,
 * so no answer ever asks a reader to repeat a number inside a box. Each box
 * then takes a sign its numbers allow (÷ only where the larger divides by
 * the smaller) and the target its numbers make.
 *
 * The boxes are then tuned until the grid tells its answer: the level's
 * steps (short of "what if") solve the grid as far as they can, and a few
 * changes near the squares left open — a box given another sign, or cut in
 * two — are each tried; the one that leaves the fewest pencil marks is kept.
 * A grid those steps finish is kept when it is no easier than the level; one
 * that is too easy climbs: two neighbouring boxes are joined, or a sign
 * changed, a change at a time, each kept while the level's steps still
 * finish the grid, until only the level's own steps do (at a "what if"
 * level, every grid comes this way).
 */

export interface GnBuilt {
  puzzle: GnPuzzle
  /** The one answer: the number in every square, in reading order. */
  values: number[]
  /** Digest of the grid, the same however it is turned or mirrored. */
  signature: string
}

/** Grids built before a level gives up on this stream. */
export const GN_CANDIDATES = 24
/** Changes made while tuning one grid. */
const REPAIRS = 12
/** Changes weighed at each tuning step; the one leaving the fewest pencil marks is kept. */
const REPAIR_CHOICES = 6
/** Changes tried on a too-easy grid before it is tuned afresh. */
const HARDEN_TRIES = 40

/** The largest product a box may print: three figures and its sign fit a square at large print. */
export const GN_MAX_PRODUCT = 999

/**
 * A grid's own fingerprint: turned or mirrored, it is the same puzzle.
 * Numbers are not renamed — a box's target is arithmetic, so 1 and 5 swapped
 * is a different puzzle.
 */
export function gnSignature(p: GnPuzzle): string {
  const n = p.size
  const cageOf = new Array<number>(n * n).fill(-1)
  p.cages.forEach((c, ci) => c.cells.forEach((i) => (cageOf[i] = ci)))
  const rows = Array.from({ length: n }, (_, r) => cageOf.slice(r * n, r * n + n))
  let best: string | null = null
  for (const turned of gridSymmetries(rows)) {
    // Boxes named in the order they are first read, each with its clue.
    const names = new Map<number, number>()
    const cells = turned
      .map((row) =>
        row
          .map((ci) => {
            if (!names.has(ci)) names.set(ci, names.size)
            return names.get(ci)!.toString(36)
          })
          .join('.'),
      )
      .join('/')
    const clues = [...names.keys()].map((ci) => `${p.cages[ci]!.target}${p.cages[ci]!.op}`).join(',')
    const form = `${cells}|${clues}`
    if (best === null || form < best) best = form
  }
  return canonicalHash(`gn|${n}|${best ?? ''}`)
}

/* ------------------------------------------------------------------ *
 * The answer and its boxes
 * ------------------------------------------------------------------ */

/**
 * A Latin square of numbers 1 to n: square by square, each taking a number
 * not yet in its row or column, in a random order. Null when the search runs
 * past its budget.
 */
export function drawGnLatin(n: number, rng: StudioRng): number[] | null {
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

const neighboursOf = (n: number, i: number): number[] => {
  const r = Math.floor(i / n)
  const c = i % n
  const out: number[] = []
  if (r > 0) out.push(i - n)
  if (c > 0) out.push(i - 1)
  if (c + 1 < n) out.push(i + 1)
  if (r + 1 < n) out.push(i + n)
  return out
}

/** A box size drawn from the level's mix: weights for boxes of 1, 2, 3 and 4 squares. */
function drawSize(mix: readonly number[], rng: StudioRng): number {
  const total = mix.reduce((a, b) => a + b, 0)
  let x = rng.next() * total
  for (let k = 0; k < mix.length; k++) {
    x -= mix[k]!
    if (x < 0) return k + 1
  }
  return mix.length
}

/**
 * Boxes grown on the answer, as lists of squares in reading order: from a
 * random square, a random neighbour at a time up to a drawn size, never
 * taking in a number the box holds. Loose single squares beyond the level's
 * allowance are then joined to a neighbouring box that has room and lacks
 * their number. Null when too many are left alone.
 */
export function drawGnBoxes(n: number, values: readonly number[], mix: readonly number[], maxGivens: number, rng: StudioRng): number[][] | null {
  const cageOf = new Array<number>(n * n).fill(-1)
  const boxes: number[][] = []
  for (const start of rng.shuffle(Array.from({ length: n * n }, (_, k) => k))) {
    if (cageOf[start]! >= 0) continue
    const size = drawSize(mix, rng)
    const box = [start]
    cageOf[start] = boxes.length
    while (box.length < size) {
      const held = new Set(box.map((i) => values[i]))
      const frontier = [...new Set(box.flatMap((i) => neighboursOf(n, i)))].filter((j) => cageOf[j]! < 0 && !held.has(values[j]!))
      if (frontier.length === 0) break
      const j = rng.pick(frontier)
      cageOf[j] = boxes.length
      box.push(j)
    }
    boxes.push(box)
  }
  // Loose squares: joined to a neighbour with room, until the level's allowance.
  const loose = rng.shuffle(boxes.flatMap((b, bi) => (b.length === 1 ? [bi] : [])))
  let givens = loose.length
  for (const bi of loose) {
    if (givens <= maxGivens) break
    const i = boxes[bi]![0]!
    const homes = [...new Set(neighboursOf(n, i).map((j) => cageOf[j]!))].filter((hi) => {
      const home = boxes[hi]!
      return hi !== bi && home.length > 1 && home.length < GN_MAX_CAGE && !home.some((j) => values[j] === values[i])
    })
    if (homes.length === 0) continue
    const hi = rng.pick(homes)
    boxes[hi]!.push(i)
    boxes[bi] = []
    cageOf[i] = hi
    givens--
  }
  if (givens > maxGivens) return null
  return boxes.filter((b) => b.length > 0).map((b) => [...b].sort((a, b2) => a - b2))
}

/** The signs a box's numbers allow at the level, each with its target. */
export function gnSignsFor(values: readonly number[], ops: readonly GnOp[]): { op: GnOp; target: number }[] {
  if (values.length === 1) return [{ op: '=', target: values[0]! }]
  const out: { op: GnOp; target: number }[] = []
  const sum = values.reduce((a, b) => a + b, 0)
  const product = values.reduce((a, b) => a * b, 1)
  if (ops.includes('+')) out.push({ op: '+', target: sum })
  if (ops.includes('*') && product <= GN_MAX_PRODUCT) out.push({ op: '*', target: product })
  if (values.length === 2) {
    const hi = Math.max(values[0]!, values[1]!)
    const lo = Math.min(values[0]!, values[1]!)
    if (ops.includes('-') && hi > lo) out.push({ op: '-', target: hi - lo })
    if (ops.includes('/') && hi % lo === 0 && hi > lo) out.push({ op: '/', target: hi / lo })
  }
  return out
}

/** How much each sign is wanted when a box is first signed: − and ÷ make two-square boxes a reader can start on. */
const SIGN_WEIGHT: Record<GnOp, number> = { '=': 1, '+': 2, '-': 3, '*': 2, '/': 4 }

function signBox(cells: readonly number[], values: readonly number[], ops: readonly GnOp[], rng: StudioRng, not?: GnOp): GnCage | null {
  const options = gnSignsFor(
    cells.map((i) => values[i]!),
    ops,
  ).filter((o) => o.op !== not)
  if (options.length === 0) return null
  const total = options.reduce((a, o) => a + SIGN_WEIGHT[o.op], 0)
  let x = rng.next() * total
  for (const o of options) {
    x -= SIGN_WEIGHT[o.op]
    if (x < 0) return { cells: [...cells], ...o }
  }
  return { cells: [...cells], ...options[options.length - 1]! }
}

/* ------------------------------------------------------------------ *
 * The level
 * ------------------------------------------------------------------ */

export interface GnLevelNeeds {
  size: number
  rules: GnRules
  /** Refuse grids these steps alone finish. */
  beyond?: GnRules | null
  /** The fewest of the level's own steps ("must be here" or "what if") the grid must take. */
  minHard?: number
  /** The signs the level prints. */
  ops: readonly GnOp[]
  /** Weights for boxes of 1, 2, 3 and 4 squares. */
  mix: readonly number[]
  /** The most boxes of one square (numbers given outright). */
  maxGivens: number
}

/** The level's own steps beyond the ones before it. */
export function gnHardSteps(tally: GnTally, rules: GnRules): number {
  if (rules === 'probe') return tally.probe
  if (rules === 'lines') return tally.lines
  return 0
}

/** How many boxes of one square the grid prints. */
export const gnGivenCount = (p: GnPuzzle) => p.cages.filter((c) => c.cells.length === 1).length

/** True when every box is one the level prints: a sign it allows, a product that fits, no number twice. */
export function gnBoxesFit(p: GnPuzzle, values: readonly number[], needs: Pick<GnLevelNeeds, 'ops' | 'maxGivens'>): boolean {
  if (gnGivenCount(p) > needs.maxGivens) return false
  return p.cages.every((c) => {
    const held = c.cells.map((i) => values[i]!)
    if (new Set(held).size !== held.length) return false
    if (c.op !== '=' && !needs.ops.includes(c.op)) return false
    if (c.op === '*' && c.target > GN_MAX_PRODUCT) return false
    return gnCageHolds(c.op, c.target, held)
  })
}

/** True when the level's own steps finish the grid on exactly this answer. */
function finishes(p: GnPuzzle, values: readonly number[], rules: GnRules): GnTally | null {
  const solve = solveGn(p, rules)
  return solve.solved && gnValuesText(solve.values) === gnValuesText(values) ? solve.tally : null
}

/** True when the grid is one the level's steps finish on exactly this answer, and no easier. */
export function gnMeetsLevel(p: GnPuzzle, values: readonly number[], needs: GnLevelNeeds): boolean {
  if (p.size !== needs.size || !isGnSolution(p, values) || !gnBoxesFit(p, values, needs)) return false
  const tally = finishes(p, values, needs.rules)
  if (!tally) return false
  if (needs.beyond && solveGn(p, needs.beyond).solved) return false
  return gnHardSteps(tally, needs.rules) >= (needs.minHard ?? 0)
}

/** The boxes of a grid, sorted in reading order of their first square. */
const ordered = (cages: readonly GnCage[]): GnCage[] => [...cages].sort((a, b) => a.cells[0]! - b.cells[0]!)

/** Every way to cut a box in two joined pieces; the caller keeps lone squares within the level’s allowance. */
function splitsOf(n: number, cells: readonly number[]): [number[], number[]][] {
  const out: [number[], number[]][] = []
  const m = cells.length
  // Each subset containing the first square, against the rest.
  for (let mask = 1; mask < (1 << m) - 1; mask += 2) {
    const a = cells.filter((_, k) => mask & (1 << k))
    const b = cells.filter((_, k) => !(mask & (1 << k)))
    if (gnCageJoined(n, a) && gnCageJoined(n, b)) out.push([a, b])
  }
  return out
}

/**
 * One grid built for the level, kept only when the level's steps solve it to
 * exactly its answer (and, when `beyond` is given, those steps alone do not).
 * Null when this draw does not.
 */
export function drawGnCandidate(options: GnLevelNeeds & { rng: StudioRng }): GnBuilt | null {
  const { size: n, rules, ops, mix, maxGivens, rng } = options
  const values = drawGnLatin(n, rng)
  if (!values) return null
  const boxes = drawGnBoxes(n, values, mix, maxGivens, rng)
  if (!boxes) return null
  let cages: GnCage[] = []
  for (const box of boxes) {
    const cage = signBox(box, values, ops, rng)
    if (!cage) return null
    cages.push(cage)
  }
  const first: GnRules = rules === 'probe' ? 'lines' : rules
  const puzzleOf = (list: readonly GnCage[]): GnPuzzle => ({ size: n, cages: ordered(list) })
  const built = (p: GnPuzzle): GnBuilt => ({ puzzle: p, values: [...values], signature: gnSignature(p) })
  const givens = (list: readonly GnCage[]) => list.filter((c) => c.cells.length === 1).length
  const boxOf = (list: readonly GnCage[], i: number) => list.findIndex((c) => c.cells.includes(i))

  /** A change that pins the answer down near `pool`: a box given another sign, or cut in two. Null when none applies. */
  const pinDown = (list: readonly GnCage[], pool: readonly number[]): GnCage[] | null => {
    const at = boxOf(list, rng.pick(pool))
    const cage = list[at]!
    const moves: (() => GnCage[] | null)[] = []
    if (cage.cells.length > 1) {
      moves.push(() => {
        const other = signBox(cage.cells, values, ops, rng, cage.op)
        return other ? list.map((c, k) => (k === at ? other : c)) : null
      })
      const splits = splitsOf(n, cage.cells).filter(([a, b]) => givens(list) + Number(a.length === 1) + Number(b.length === 1) <= maxGivens)
      if (splits.length > 0) {
        moves.push(() => {
          const [a, b] = rng.pick(splits)
          const ca = signBox(a, values, ops, rng)
          const cb = signBox(b, values, ops, rng)
          return ca && cb ? [...list.filter((_, k) => k !== at), ca, cb] : null
        })
      }
    }
    return moves.length > 0 ? rng.pick(moves)() : null
  }

  /** A change that makes the grid harder: two neighbouring boxes joined, or a sign changed. */
  const toughen = (list: readonly GnCage[]): GnCage[] | null => {
    const at = rng.int(0, list.length - 1)
    const cage = list[at]!
    if (rng.chance(0.6)) {
      const held = new Set(cage.cells.map((i) => values[i]))
      const near = [...new Set(cage.cells.flatMap((i) => neighboursOf(n, i)).map((j) => boxOf(list, j)))].filter((k) => {
        if (k === at) return false
        const other = list[k]!
        return other.cells.length + cage.cells.length <= GN_MAX_CAGE && !other.cells.some((j) => held.has(values[j]))
      })
      if (near.length > 0) {
        const k = rng.pick(near)
        const joined = signBox([...cage.cells, ...list[k]!.cells].sort((a, b) => a - b), values, ops, rng)
        if (joined) return [...list.filter((_, j) => j !== at && j !== k), joined]
      }
    }
    if (cage.cells.length === 1) return null
    const other = signBox(cage.cells, values, ops, rng, cage.op)
    return other ? list.map((c, k) => (k === at ? other : c)) : null
  }

  /**
   * A too-easy grid made harder a change at a time: each change the level's
   * steps still finish on the answer is kept, until the easier steps alone
   * no longer finish it and it takes enough of the level's own. Null when
   * the tries run out first.
   */
  const harden = (list: readonly GnCage[]): GnBuilt | null => {
    let current = list
    for (let k = 0; k < HARDEN_TRIES; k++) {
      const next = toughen(current)
      if (!next) continue
      const p = puzzleOf(next)
      // Still easy: kept, and the climb goes on from it.
      if (options.beyond && solveGn(p, options.beyond).solved) {
        current = next
        continue
      }
      const tally = finishes(p, values, rules)
      if (!tally) continue
      if (gnHardSteps(tally, rules) >= (options.minHard ?? 0) && gnBoxesFit(p, values, options)) return built(p)
      current = next
    }
    return null
  }

  for (let k = 0; k < REPAIRS; k++) {
    const p = puzzleOf(cages)
    const solve = solveGn(p, first)
    if (solve.solved) {
      if (rules !== 'probe' && !(options.beyond && solveGn(p, options.beyond).solved)) {
        return gnMeetsLevel(p, values, options) ? built(p) : harden(cages)
      }
      // Too easy: climb from here, or take one change and look again.
      const harder = harden(cages)
      if (harder) return harder
      const next = toughen(cages)
      if (next) cages = next
      continue
    }
    // Tune a box near the squares the steps could not finish: a few tries, keep the best.
    const stuck = solve.values.flatMap((v, i) => (v === 0 ? [i] : []))
    const pool = stuck.length > 0 ? stuck : Array.from({ length: n * n }, (_, i) => i)
    let best: { next: GnCage[]; open: number } | null = null
    for (let c = 0; c < REPAIR_CHOICES; c++) {
      const next = pinDown(cages, pool)
      if (!next) continue
      const left = solveGn(puzzleOf(next), first).open
      if (!best || left < best.open) best = { next, open: left }
    }
    if (best && best.open <= solve.open) cages = best.next
  }
  return null
}

/**
 * A grid for the level from this stream: grids built until one is solved by
 * exactly the level's steps, or null when none is within the budget.
 */
export function buildGnGrid(
  options: GnLevelNeeds & {
    rng: StudioRng
    /** Grids already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): GnBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < GN_CANDIDATES; k++) {
    const built = drawGnCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
