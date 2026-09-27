/**
 * Scenic Drive (a Kakuro, or "cross sums" puzzle): the rules, and a reader's
 * way of solving.
 *
 * A square grid of N × N squares. The top row and the left column, and a few
 * squares inside, are gray; the rest are white. White squares stand in runs
 * — unbroken stretches across or down between gray squares — and every run
 * has its total printed in the gray square before it (the upper number for
 * the run across, the lower one for the run down). The reader writes a digit
 * from 1 to 9 in every white square. A finished grid obeys:
 *
 * - the digits of every run add up to its total;
 * - no digit appears twice in a run.
 *
 * Every white square belongs to one run across and one run down, each at
 * least two squares long.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil list on every empty square of the digits that
 * could still go there, and crosses digits off it; writing a digit crosses it
 * off the rest of both its runs. Every step follows from the rules alone, so
 * a grid the solver finishes has only one answer. What it may use depends on
 * the level:
 *
 * - `sums` — "the sum table": a run of so many squares adding to so much can
 *   only be made of certain digits (3 in two is 1 + 2; 17 in two is 8 + 9),
 *   so its squares may only hold those — and those that still fit round the
 *   digits the run already has; a digit every way of making the run needs,
 *   with one square left that can take it, goes there; a square with one
 *   digit left takes it.
 * - `fit` — adds "make it fit": the digits must also fit the squares they
 *   go in, so a digit is crossed off a square when the rest of its run could
 *   not then be filled from what their own pencil lists allow ("this square
 *   is 1 or 2, so the other one is 9 or 8").
 * - `probe` — adds "what if": a digit on a square that leads, by every step
 *   before it, straight to a broken rule is crossed off it.
 */

/** A white square with no digit known, or a gray square with no total. */
export const DRIVE_BLANK = 0
/** The largest digit a square holds. */
export const DRIVE_MAX_DIGIT = 9

export interface DrivePuzzle {
  /** Squares across and down, the gray top row and left column included. */
  size: number
  /** Every square in reading order: true where the reader writes a digit. */
  open: readonly boolean[]
  /** Every square in reading order: the total of the run across that starts right of it, or DRIVE_BLANK. */
  across: readonly number[]
  /** Every square in reading order: the total of the run down that starts under it, or DRIVE_BLANK. */
  down: readonly number[]
}

export type DriveRules = 'sums' | 'fit' | 'probe'

/** One run: the gray square its total is printed in, its white squares, and which way it goes. */
export interface DriveRun {
  clue: number
  dir: 'across' | 'down'
  cells: readonly number[]
}

/** The steps in order: one left, the sum table, make it fit, what if. */
const STEP = { single: 0, sums: 1, fit: 2, probe: 3 } as const
/** The last step each level may use. */
const RANK: Record<DriveRules, number> = { sums: STEP.sums, fit: STEP.fit, probe: STEP.probe }

/* ------------------------------------------------------------------ *
 * Digits as bits
 * ------------------------------------------------------------------ */

const ALL = (1 << DRIVE_MAX_DIGIT) - 1
const bit = (v: number) => 1 << (v - 1)
export const drivePopcount = (m: number) => {
  let c = 0
  for (let x = m; x; x &= x - 1) c++
  return c
}
const lowest = (m: number) => 31 - Math.clz32(m & -m) + 1
const maskSum = (m: number) => {
  let s = 0
  for (let x = m; x; x &= x - 1) s += lowest(x)
  return s
}

/** Every way of making each total: COMBOS[length][total] lists the sets of distinct digits, as bit masks. */
const COMBOS: number[][][] = (() => {
  const out: number[][][] = Array.from({ length: DRIVE_MAX_DIGIT + 1 }, () => Array.from({ length: 46 }, () => [] as number[]))
  for (let m = 1; m <= ALL; m++) out[drivePopcount(m)]![maskSum(m)]!.push(m)
  return out
})()

/** The sets of distinct digits that make `total` in `length` squares, as bit masks. */
export const driveCombos = (length: number, total: number): readonly number[] => COMBOS[length]?.[total] ?? []

/** The digits of a bit mask, smallest first. */
export function driveDigits(mask: number): number[] {
  const out: number[] = []
  for (let m = mask; m; m &= m - 1) out.push(lowest(m))
  return out
}

/** The smallest and largest totals a run of this length can have. */
export const driveTotalRange = (length: number): [number, number] => [(length * (length + 1)) / 2, (length * (19 - length)) / 2]

/* ------------------------------------------------------------------ *
 * The grid
 * ------------------------------------------------------------------ */

const runCache = new Map<string, DriveRun[]>()

/** Every run of the grid: across runs in reading order of their gray square, then down runs. */
export function driveRuns(p: Pick<DrivePuzzle, 'size' | 'open'>): DriveRun[] {
  const key = `${p.size}:${p.open.map((o) => (o ? 1 : 0)).join('')}`
  const cached = runCache.get(key)
  if (cached) return cached
  const n = p.size
  const runs: DriveRun[] = []
  for (const dir of ['across', 'down'] as const) {
    for (let s = 0; s < n * n; s++) {
      if (p.open[s]) continue
      const r = Math.floor(s / n)
      const c = s % n
      const cells: number[] = []
      if (dir === 'across') for (let k = c + 1; k < n && p.open[r * n + k]; k++) cells.push(r * n + k)
      else for (let k = r + 1; k < n && p.open[k * n + c]; k++) cells.push(k * n + c)
      if (cells.length > 0) runs.push({ clue: s, dir, cells })
    }
  }
  if (runCache.size > 2000) runCache.clear()
  runCache.set(key, runs)
  return runs
}

/** True when every square left of or above a white square is inside the grid, and the gray border is whole. */
function borderWhole(n: number, open: readonly boolean[]): boolean {
  for (let k = 0; k < n; k++) if (open[k] || open[k * n]) return false
  return true
}

/** True when the white squares are one piece, joined across and down. */
export function driveConnected(n: number, open: readonly boolean[]): boolean {
  const whites = open.flatMap((o, s) => (o ? [s] : []))
  if (whites.length === 0) return false
  const seen = new Set([whites[0]!])
  const stack = [whites[0]!]
  while (stack.length > 0) {
    const s = stack.pop()!
    const r = Math.floor(s / n)
    const c = s % n
    for (const t of [r > 0 ? s - n : -1, c < n - 1 ? s + 1 : -1, r < n - 1 ? s + n : -1, c > 0 ? s - 1 : -1]) {
      if (t >= 0 && open[t] && !seen.has(t)) {
        seen.add(t)
        stack.push(t)
      }
    }
  }
  return seen.size === whites.length
}

/**
 * True when the squares make a proper grid: a gray top row and left column,
 * every white square in one run across and one run down of two to `maxRun`
 * squares, and all the white squares one piece.
 */
export function drivePatternWellFormed(n: number, open: readonly boolean[], maxRun = DRIVE_MAX_DIGIT): boolean {
  if (!Number.isInteger(n) || n < 3 || open.length !== n * n) return false
  if (!borderWhole(n, open)) return false
  const runs = driveRuns({ size: n, open })
  const counted = new Array<number>(n * n).fill(0)
  for (const run of runs) {
    if (run.cells.length < 2 || run.cells.length > Math.min(maxRun, DRIVE_MAX_DIGIT)) return false
    for (const s of run.cells) counted[s]!++
  }
  if (open.some((o, s) => o && counted[s] !== 2)) return false
  return driveConnected(n, open)
}

/**
 * True when the puzzle is well formed: a proper grid, a total printed before
 * every run and nowhere else, and every total one its run can make.
 */
export function driveWellFormed(p: DrivePuzzle): boolean {
  const n = p.size
  const N = n * n
  if (!drivePatternWellFormed(n, p.open) || p.across.length !== N || p.down.length !== N) return false
  const want = { across: new Map<number, number>(), down: new Map<number, number>() }
  for (const run of driveRuns(p)) want[run.dir].set(run.clue, run.cells.length)
  for (let s = 0; s < N; s++) {
    for (const dir of ['across', 'down'] as const) {
      const total = p[dir][s]!
      const length = want[dir].get(s)
      if (length === undefined) {
        if (total !== DRIVE_BLANK) return false
      } else if (!Number.isInteger(total) || driveCombos(length, total).length === 0) return false
    }
  }
  return true
}

/** True when the digits keep the rules: every run adds up to its total with no digit twice. */
export function driveKeepsRules(p: DrivePuzzle, values: readonly number[]): boolean {
  const n = p.size
  if (values.length !== n * n) return false
  for (let s = 0; s < n * n; s++) {
    const v = values[s]!
    if (p.open[s] ? !Number.isInteger(v) || v < 1 || v > DRIVE_MAX_DIGIT : v !== DRIVE_BLANK) return false
  }
  for (const run of driveRuns(p)) {
    const digits = run.cells.map((s) => values[s]!)
    if (new Set(digits).size !== digits.length) return false
    if (digits.reduce((a, b) => a + b, 0) !== p[run.dir][run.clue]) return false
  }
  return true
}

/** A finished grid as one comparable string. */
export const driveAnswerKey = (values: readonly number[]) => values.join('')

/** The totals a filled grid prints: every run's digits added up, in the gray square before it. */
export function driveTotalsOf(n: number, open: readonly boolean[], values: readonly number[]): { across: number[]; down: number[] } {
  const across = new Array<number>(n * n).fill(DRIVE_BLANK)
  const down = new Array<number>(n * n).fill(DRIVE_BLANK)
  for (const run of driveRuns({ size: n, open })) (run.dir === 'across' ? across : down)[run.clue] = run.cells.reduce((sum, s) => sum + values[s]!, 0)
  return { across, down }
}

/* ------------------------------------------------------------------ *
 * The solver's pencil lists
 * ------------------------------------------------------------------ */

export interface DriveTally {
  single: number
  sums: number
  fit: number
  probe: number
}

export interface DriveSolveResult {
  solved: boolean
  /** The digit in every white square (DRIVE_BLANK where none is known, and on gray squares). */
  values: number[]
  /** White squares still empty. */
  open: number
  /** A rule was found broken: the puzzle has no answer. */
  broken: boolean
  /** How many times each kind of step was used. */
  tally: DriveTally
}

/** What never changes while a grid is solved: its runs and their totals, and each square's two runs. */
interface Grid {
  N: number
  runs: readonly DriveRun[]
  totals: readonly number[]
  /** Per white square, the runs it stands in. */
  runsOf: readonly (readonly number[])[]
  whites: readonly number[]
}

interface State {
  /** Per square, a bit for every digit still possible (bit k − 1 for k). */
  cand: Uint16Array
  value: Uint8Array
  broken: boolean
}

function gridOf(p: DrivePuzzle): Grid {
  const runs = driveRuns(p)
  const N = p.size * p.size
  const runsOf: number[][] = Array.from({ length: N }, () => [])
  runs.forEach((run, i) => run.cells.forEach((s) => runsOf[s]!.push(i)))
  return {
    N,
    runs,
    totals: runs.map((run) => p[run.dir][run.clue]!),
    runsOf,
    whites: p.open.flatMap((o, s) => (o ? [s] : [])),
  }
}

const clone = (s: State): State => ({ cand: s.cand.slice(), value: s.value.slice(), broken: s.broken })

/** Writes v in square s, crossing it off the rest of both its runs. */
function place(grid: Grid, st: State, s: number, v: number): void {
  if (st.broken || st.value[s] === v) return
  if (st.value[s] !== 0 || !(st.cand[s]! & bit(v))) {
    st.broken = true
    return
  }
  st.value[s] = v
  st.cand[s] = bit(v)
  const off = ~bit(v)
  for (const r of grid.runsOf[s]!) {
    for (const t of grid.runs[r]!.cells) {
      if (t === s) continue
      st.cand[t]! &= off
      if (st.cand[t] === 0) st.broken = true
    }
  }
}

function initial(grid: Grid): State {
  const st: State = { cand: new Uint16Array(grid.N), value: new Uint8Array(grid.N), broken: false }
  for (const s of grid.whites) st.cand[s] = ALL
  // A total no run of its length can make is a broken puzzle.
  grid.runs.forEach((run, i) => {
    if (driveCombos(run.cells.length, grid.totals[i]!).length === 0) st.broken = true
  })
  return st
}

/** "One left": a square with one digit left takes it. */
function stepSingle(grid: Grid, st: State): boolean {
  let changed = false
  for (const s of grid.whites) {
    if (st.broken) break
    if (st.value[s] !== 0) continue
    const m = st.cand[s]!
    if (m === 0) st.broken = true
    else if ((m & (m - 1)) === 0) {
      place(grid, st, s, lowest(m))
      changed = true
    }
  }
  return changed || st.broken
}

/**
 * "The sum table": the run's squares may hold only digits from the ways of
 * making its total that keep the digits it already has; a digit every such
 * way needs, with one square left to take it, goes there.
 */
function stepSums(grid: Grid, st: State): boolean {
  let changed = false
  for (let i = 0; i < grid.runs.length && !st.broken; i++) {
    const cells = grid.runs[i]!.cells
    let placed = 0
    for (const s of cells) if (st.value[s] !== 0) placed |= bit(st.value[s]!)
    let union = 0
    let common = ALL
    for (const m of driveCombos(cells.length, grid.totals[i]!)) {
      if ((m & placed) !== placed) continue
      union |= m
      common &= m
    }
    if (union === 0) {
      st.broken = true
      break
    }
    const allowed = union & ~placed
    for (const s of cells) {
      if (st.value[s] !== 0 || (st.cand[s]! & ~allowed) === 0) continue
      st.cand[s]! &= allowed
      if (st.cand[s] === 0) st.broken = true
      changed = true
    }
    for (let m = common & ~placed; m && !st.broken; m &= m - 1) {
      const v = lowest(m)
      let where = -1
      let count = 0
      for (const s of cells) {
        if (st.value[s] === 0 && st.cand[s]! & bit(v)) {
          count++
          where = s
        }
      }
      if (count === 0) st.broken = true
      else if (count === 1) {
        place(grid, st, where, v)
        changed = true
      }
    }
  }
  return changed || st.broken
}

/** Per run, what "make it fit" leaves each square, remembered by the run's total and pencil lists. */
const fitCache = new Map<string, number[] | null>()
const FIT_CACHE_LIMIT = 200_000
/** Per length and total, a mark on every set of digits some way of making the total contains. */
const withinCache = new Map<number, Uint8Array>()
function withinOf(length: number, total: number): Uint8Array {
  const key = length * 64 + total
  let marks = withinCache.get(key)
  if (!marks) {
    marks = new Uint8Array(ALL + 1)
    for (const f of driveCombos(length, total)) for (let sub = f; ; sub = (sub - 1) & f) {
      marks[sub] = 1
      if (sub === 0) break
    }
    withinCache.set(key, marks)
  }
  return marks
}
/** Scratch marks for the sets of digits reached after each square, stamped so they never need clearing. */
const reachStamp = new Uint32Array((DRIVE_MAX_DIGIT + 1) << 9)
const okStamp = new Uint32Array((DRIVE_MAX_DIGIT + 1) << 9)
let stamp = 0

/**
 * The digits each square of a run can still hold so that the whole run can
 * be filled from the pencil lists with distinct digits adding to the total;
 * null when it cannot be filled at all.
 */
export function driveFitRun(total: number, cand: readonly number[]): number[] | null {
  const key = `${total}|${cand.join(',')}`
  const cached = fitCache.get(key)
  if (cached !== undefined) return cached
  const L = cand.length
  const within = withinOf(L, total)
  stamp = (stamp + 1) >>> 0
  if (stamp === 0) {
    reachStamp.fill(0)
    okStamp.fill(0)
    stamp = 1
  }
  // Forward: the sets of digits the first i squares can hold between them.
  const reach: number[][] = [[0]]
  reachStamp[0] = stamp
  for (let i = 0; i < L; i++) {
    const next: number[] = []
    const base = (i + 1) << 9
    for (const mask of reach[i]!) {
      for (let m = cand[i]! & ~mask; m; m &= m - 1) {
        const to = mask | (m & -m)
        if (within[to] && reachStamp[base | to] !== stamp) {
          reachStamp[base | to] = stamp
          next.push(to)
        }
      }
    }
    reach.push(next)
  }
  // Backward: of those, the sets the rest of the run can still finish (every full set is a way of making the total).
  for (const mask of reach[L]!) okStamp[(L << 9) | mask] = stamp
  const support = new Array<number>(L).fill(0)
  for (let i = L - 1; i >= 0; i--) {
    const up = (i + 1) << 9
    for (const mask of reach[i]!) {
      let good = false
      for (let m = cand[i]! & ~mask; m; m &= m - 1) {
        const b = m & -m
        if (okStamp[up | mask | b] === stamp) {
          good = true
          support[i]! |= b
        }
      }
      if (good) okStamp[(i << 9) | mask] = stamp
    }
  }
  const out = support.some((m) => m === 0) ? null : support
  if (fitCache.size > FIT_CACHE_LIMIT) fitCache.clear()
  fitCache.set(key, out)
  return out
}

/** "Make it fit": a digit is crossed off a square when the rest of its run could not then be filled. */
function stepFit(grid: Grid, st: State): boolean {
  let changed = false
  for (let i = 0; i < grid.runs.length && !st.broken; i++) {
    const cells = grid.runs[i]!.cells
    const fit = driveFitRun(
      grid.totals[i]!,
      cells.map((s) => st.cand[s]!),
    )
    if (!fit) {
      st.broken = true
      break
    }
    cells.forEach((s, k) => {
      if (st.cand[s] !== fit[k]) {
        st.cand[s] = fit[k]!
        changed = true
      }
    })
  }
  return changed || st.broken
}

/** Runs the steps up to `rank`, cheapest first, until the grid is finished, broken, or no step helps. */
function run(grid: Grid, st: State, rank: number, tally: DriveTally | null): void {
  outer: while (!st.broken) {
    for (let k = 0; k <= rank; k++) {
      const [name, step] = STEPS[k]!
      if (step(grid, st)) {
        if (tally) tally[name]++
        continue outer
      }
    }
    return
  }
}

/** "What if": a digit that leads, by every step short of "what if", to a broken rule is crossed off. */
function stepProbe(grid: Grid, st: State): boolean {
  let changed = false
  // Squares with fewest digits left first: that is where a reader tries "what if".
  for (let left = 2; left <= 3 && !changed; left++) {
    for (const s of grid.whites) {
      if (st.broken) break
      if (st.value[s] !== 0 || drivePopcount(st.cand[s]!) !== left) continue
      for (let m = st.cand[s]!; m; m &= m - 1) {
        const v = lowest(m)
        const trial = clone(st)
        place(grid, trial, s, v)
        run(grid, trial, STEP.fit, null)
        if (trial.broken) {
          st.cand[s]! &= ~bit(v)
          if (st.cand[s] === 0) st.broken = true
          changed = true
        }
      }
    }
  }
  return changed
}

/** Every step, in the order STEP numbers them. */
const STEPS: readonly (readonly [keyof DriveTally, (grid: Grid, st: State) => boolean])[] = [
  ['single', stepSingle],
  ['sums', stepSums],
  ['fit', stepFit],
  ['probe', stepProbe],
]

/** Solves the grid with the level's steps only. */
export function solveDrive(p: DrivePuzzle, rules: DriveRules): DriveSolveResult {
  const grid = gridOf(p)
  const tally: DriveTally = { single: 0, sums: 0, fit: 0, probe: 0 }
  const st = initial(grid)
  run(grid, st, RANK[rules], tally)
  const values = Array.from(st.value)
  const open = grid.whites.filter((s) => values[s] === 0).length
  return { solved: !st.broken && open === 0, values, open, broken: st.broken, tally }
}

/**
 * Plain search (for tests and checks), sharing nothing with the solver: how
 * many finished grids keep the totals, counting no further than `limit`.
 */
export function countDriveSolutions(p: DrivePuzzle, limit = 2): number {
  const n = p.size
  const runs = driveRuns(p)
  const runsOf: number[][] = Array.from({ length: n * n }, () => [])
  runs.forEach((run, i) => run.cells.forEach((s) => runsOf[s]!.push(i)))
  const whites = p.open.flatMap((o, s) => (o ? [s] : []))
  const values = new Array<number>(n * n).fill(0)
  const sum = new Array<number>(runs.length).fill(0)
  const filled = new Array<number>(runs.length).fill(0)
  let found = 0
  const fits = (r: number) => {
    const L = runs[r]!.cells.length
    const k = filled[r]!
    const total = p[runs[r]!.dir][runs[r]!.clue]!
    // The squares left could add at least 1 + 2 + … and at most 9 + 8 + …, whatever is used.
    const rest = L - k
    const least = (rest * (rest + 1)) / 2
    const most = (rest * (19 - rest)) / 2
    return sum[r]! + least <= total && sum[r]! + most >= total
  }
  const search = (i: number) => {
    if (found >= limit) return
    if (i === whites.length) {
      found++
      return
    }
    const s = whites[i]!
    for (let v = 1; v <= DRIVE_MAX_DIGIT && found < limit; v++) {
      if (runsOf[s]!.some((r) => runs[r]!.cells.some((t) => t !== s && values[t] === v))) continue
      values[s] = v
      for (const r of runsOf[s]!) {
        sum[r]! += v
        filled[r]!++
      }
      if (runsOf[s]!.every(fits)) search(i + 1)
      for (const r of runsOf[s]!) {
        sum[r]! -= v
        filled[r]!--
      }
      values[s] = 0
    }
  }
  search(0)
  return found
}

/**
 * Fills a grid's white squares with digits, no digit twice in a run, trying
 * each square's digits in the order `order` gives them; null when there is
 * no way, or the search runs out of patience first.
 */
export function fillDriveGrid(n: number, open: readonly boolean[], order: (options: readonly number[]) => number[], patience = 20_000): number[] | null {
  const runs = driveRuns({ size: n, open })
  const runsOf: number[][] = Array.from({ length: n * n }, () => [])
  runs.forEach((run, i) => run.cells.forEach((s) => runsOf[s]!.push(i)))
  const whites = open.flatMap((o, s) => (o ? [s] : []))
  const used = new Array<number>(runs.length).fill(0)
  const values = new Array<number>(n * n).fill(0)
  let nodes = 0
  const search = (i: number): boolean => {
    if (i === whites.length) return true
    if (nodes++ > patience) return false
    const s = whites[i]!
    const taken = runsOf[s]!.reduce((m, r) => m | used[r]!, 0)
    const options = driveDigits(ALL & ~taken)
    for (const v of order(options)) {
      values[s] = v
      for (const r of runsOf[s]!) used[r]! |= bit(v)
      if (search(i + 1)) return true
      for (const r of runsOf[s]!) used[r]! &= ~bit(v)
      values[s] = 0
    }
    return false
  }
  return search(0) ? values : null
}
