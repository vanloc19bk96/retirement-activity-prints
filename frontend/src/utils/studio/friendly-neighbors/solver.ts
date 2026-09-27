/**
 * Friendly Neighbors (a Suguru, or "number blocks" puzzle): the rules, and a
 * reader's way of solving.
 *
 * A square town of N × N houses, cut by streets into blocks of one to five
 * houses. The reader writes a house number in every house. A finished town
 * obeys:
 *
 * - a block of k houses holds every number from 1 to k, once each (a block
 *   of 3 holds 1, 2 and 3; a house alone on its block is 1);
 * - two houses that touch — side by side or corner to corner, even across a
 *   street — never hold the same number;
 * - the numbers printed on the page stay where they are.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil list on every empty house of the numbers that
 * could still go there, and crosses numbers off it: writing a number crosses
 * it off the rest of the block and off every house touching it. Every step
 * follows from the rules alone, so a town the solver finishes has only one
 * answer. What it may use depends on the level:
 *
 * - `single` — "one left": a house with one number left takes it, and a
 *   number with one house left in its block goes there.
 * - `touch` — adds "all touch one house": when every house in a block that
 *   could take a number touches the same house outside the block, that house
 *   cannot take it (wherever the number goes in the block, it sits next
 *   door).
 * - `probe` — adds "claimed numbers": two houses of a block with only the
 *   same two numbers left (or three with three) share them, so the block's
 *   other houses do not get them; and "what if": a number on a house that
 *   leads, by every step before it, straight to a broken rule is crossed
 *   off it.
 */

/** A house with no number printed. */
export const NEIGHBORS_BLANK = 0
/** The largest block a town has, and so the largest house number. */
export const NEIGHBORS_MAX_BLOCK = 5

export interface NeighborsPuzzle {
  /** Houses across and down. */
  size: number
  /** Every house in reading order: the block it belongs to, numbered 0, 1, 2 … */
  blocks: readonly number[]
  /** Every house in reading order: NEIGHBORS_BLANK, or the number printed on it. */
  clues: readonly number[]
}

export type NeighborsRules = 'single' | 'touch' | 'probe'

/** The steps in order: one left, all touch one house, claimed numbers, what if. */
const STEP = { single: 0, touch: 1, claim: 2, probe: 3 } as const
/** The last step each level may use. */
const RANK: Record<NeighborsRules, number> = { single: STEP.single, touch: STEP.touch, probe: STEP.probe }

/* ------------------------------------------------------------------ *
 * The town
 * ------------------------------------------------------------------ */

const kingCache = new Map<number, number[][]>()

/** Per house, the houses touching it: side by side or corner to corner. */
export function neighborsTouching(n: number): number[][] {
  const cached = kingCache.get(n)
  if (cached) return cached
  const out: number[][] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const list: number[] = []
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n) list.push((r + dr) * n + c + dc)
        }
      }
      out.push(list)
    }
  }
  kingCache.set(n, out)
  return out
}

/** Per house, its neighbours across and down only (up, right, down, left; -1 past the edge). */
export function neighborsBeside(n: number, s: number): [number, number, number, number] {
  const r = Math.floor(s / n)
  const c = s % n
  return [r > 0 ? s - n : -1, c < n - 1 ? s + 1 : -1, r < n - 1 ? s + n : -1, c > 0 ? s - 1 : -1]
}

/** The houses of every block, block by block, in reading order. */
export function neighborsBlockCells(p: Pick<NeighborsPuzzle, 'blocks'>): number[][] {
  const out: number[][] = []
  p.blocks.forEach((b, s) => {
    while (out.length <= b) out.push([])
    out[b]!.push(s)
  })
  return out
}

/** True when the cells are one piece, joined across and down. */
function connected(n: number, cells: readonly number[]): boolean {
  if (cells.length === 0) return false
  const inside = new Set(cells)
  const seen = new Set([cells[0]!])
  const stack = [cells[0]!]
  while (stack.length > 0) {
    const s = stack.pop()!
    for (const t of neighborsBeside(n, s)) {
      if (t >= 0 && inside.has(t) && !seen.has(t)) {
        seen.add(t)
        stack.push(t)
      }
    }
  }
  return seen.size === cells.length
}

/** True when the blocks cut the town properly: numbered 0 up, each one piece of one to five houses. */
export function neighborsBlocksWellFormed(n: number, blocks: readonly number[]): boolean {
  if (!Number.isInteger(n) || n < 2 || blocks.length !== n * n) return false
  if (blocks.some((b) => !Number.isInteger(b) || b < 0)) return false
  const cells = neighborsBlockCells({ blocks })
  return cells.every((list) => list.length >= 1 && list.length <= NEIGHBORS_MAX_BLOCK && connected(n, list))
}

/**
 * True when the town is well formed: its blocks cut it properly, and every
 * house is blank or a number its block can hold, none twice in a block.
 */
export function neighborsWellFormed(p: NeighborsPuzzle): boolean {
  const n = p.size
  if (!neighborsBlocksWellFormed(n, p.blocks) || p.clues.length !== n * n) return false
  const cells = neighborsBlockCells(p)
  for (const list of cells) {
    const seen = new Set<number>()
    for (const s of list) {
      const v = p.clues[s]!
      if (v === NEIGHBORS_BLANK) continue
      if (!Number.isInteger(v) || v < 1 || v > list.length || seen.has(v)) return false
      seen.add(v)
    }
  }
  return true
}

/** True when the numbers keep the rules: each block holds 1 to its size, and no two touching houses match. */
export function neighborsKeepsRules(p: Pick<NeighborsPuzzle, 'size' | 'blocks'>, values: readonly number[]): boolean {
  const n = p.size
  if (values.length !== n * n) return false
  const cells = neighborsBlockCells(p)
  for (const list of cells) {
    const seen = new Set(list.map((s) => values[s]!))
    if (seen.size !== list.length || [...seen].some((v) => !Number.isInteger(v) || v < 1 || v > list.length)) return false
  }
  const touch = neighborsTouching(n)
  for (let s = 0; s < n * n; s++) for (const t of touch[s]!) if (values[s] === values[t]) return false
  return true
}

/** True when the numbers make a finished town for the puzzle. */
export function isNeighborsSolution(p: NeighborsPuzzle, values: readonly number[]): boolean {
  if (!neighborsKeepsRules(p, values)) return false
  return p.clues.every((v, s) => v === NEIGHBORS_BLANK || values[s] === v)
}

/** A finished town as one comparable string. */
export const neighborsAnswerKey = (values: readonly number[]) => values.join('')

/* ------------------------------------------------------------------ *
 * The solver's pencil lists
 * ------------------------------------------------------------------ */

export interface NeighborsTally {
  single: number
  touch: number
  claim: number
  probe: number
}

export interface NeighborsSolveResult {
  solved: boolean
  /** The number in every house (NEIGHBORS_BLANK where none is known). */
  values: number[]
  /** Houses still empty. */
  open: number
  /** A rule was found broken: the puzzle has no answer. */
  broken: boolean
  /** How many times each kind of step was used. */
  tally: NeighborsTally
}

/** What never changes while a town is solved: its blocks and who touches whom. */
interface Town {
  n: number
  blockOf: readonly number[]
  cells: readonly (readonly number[])[]
  touch: readonly (readonly number[])[]
}

interface State {
  /** Per house, a bit for every number still possible (bit k − 1 for k). */
  cand: Uint8Array
  value: Uint8Array
  broken: boolean
}

const bit = (v: number) => 1 << (v - 1)
const popcount = (m: number) => {
  let c = 0
  for (let x = m; x; x &= x - 1) c++
  return c
}
const lowest = (m: number) => 31 - Math.clz32(m & -m) + 1

function townOf(p: NeighborsPuzzle): Town {
  return { n: p.size, blockOf: p.blocks, cells: neighborsBlockCells(p), touch: neighborsTouching(p.size) }
}

const clone = (s: State): State => ({ cand: s.cand.slice(), value: s.value.slice(), broken: s.broken })

/** Writes v in house s, crossing it off the house's block and every house touching it. */
function place(town: Town, st: State, s: number, v: number): void {
  if (st.broken) return
  if (st.value[s] === v) return
  if (st.value[s] !== 0 || !(st.cand[s]! & bit(v))) {
    st.broken = true
    return
  }
  st.value[s] = v
  st.cand[s] = bit(v)
  const off = ~bit(v)
  for (const t of town.cells[town.blockOf[s]!]!) {
    if (t === s) continue
    st.cand[t]! &= off
    if (st.cand[t] === 0) st.broken = true
  }
  for (const t of town.touch[s]!) {
    st.cand[t]! &= off
    if (st.cand[t] === 0) st.broken = true
  }
}

function initial(town: Town, p: NeighborsPuzzle): State {
  const N = town.n * town.n
  const st: State = { cand: new Uint8Array(N), value: new Uint8Array(N), broken: false }
  for (let s = 0; s < N; s++) st.cand[s] = (1 << town.cells[town.blockOf[s]!]!.length) - 1
  for (let s = 0; s < N && !st.broken; s++) if (p.clues[s] !== NEIGHBORS_BLANK) place(town, st, s, p.clues[s]!)
  return st
}

/** "One left": a house with one number left, or a number with one house left in its block. */
function stepSingle(town: Town, st: State): boolean {
  const N = town.n * town.n
  let changed = false
  for (let s = 0; s < N && !st.broken; s++) {
    if (st.value[s] !== 0) continue
    const m = st.cand[s]!
    if (m === 0) st.broken = true
    else if ((m & (m - 1)) === 0) {
      place(town, st, s, lowest(m))
      changed = true
    }
  }
  if (changed || st.broken) return true
  for (const list of town.cells) {
    for (let v = 1; v <= list.length && !st.broken; v++) {
      let where = -1
      let count = 0
      let placed = false
      for (const s of list) {
        if (st.value[s] === v) placed = true
        if (st.cand[s]! & bit(v)) {
          count++
          where = s
        }
      }
      if (placed) continue
      if (count === 0) st.broken = true
      else if (count === 1) {
        place(town, st, where, v)
        changed = true
      }
    }
  }
  return changed || st.broken
}

/** "All touch one house": every house of a block that could take v touches t, so t cannot. */
function stepTouch(town: Town, st: State): boolean {
  let changed = false
  town.cells.forEach((list, b) => {
    for (let v = 1; v <= list.length; v++) {
      if (list.some((s) => st.value[s] === v)) continue
      const spots = list.filter((s) => st.cand[s]! & bit(v))
      if (spots.length === 0) continue
      for (const t of town.touch[spots[0]!]!) {
        if (town.blockOf[t] === b || st.value[t] !== 0 || !(st.cand[t]! & bit(v))) continue
        if (spots.every((s) => town.touch[s]!.includes(t))) {
          st.cand[t]! &= ~bit(v)
          if (st.cand[t] === 0) st.broken = true
          changed = true
        }
      }
    }
  })
  return changed
}

/** "Claimed numbers": k open houses of a block with only k numbers between them keep those numbers to themselves. */
function stepClaim(town: Town, st: State): boolean {
  let changed = false
  for (const list of town.cells) {
    const open = list.filter((s) => st.value[s] === 0)
    const k = open.length
    if (k < 3) continue
    for (let mask = 1; mask < 1 << k; mask++) {
      const size = popcount(mask)
      if (size < 2 || size >= k) continue
      let union = 0
      for (let i = 0; i < k; i++) if (mask & (1 << i)) union |= st.cand[open[i]!]!
      if (popcount(union) !== size) continue
      for (let i = 0; i < k; i++) {
        if (mask & (1 << i)) continue
        const s = open[i]!
        if (st.cand[s]! & union) {
          st.cand[s]! &= ~union
          if (st.cand[s] === 0) st.broken = true
          changed = true
        }
      }
    }
  }
  return changed
}

/** Runs the steps up to `rank`, cheapest first, until the town is finished, broken, or no step helps. */
function run(town: Town, st: State, rank: number, tally: NeighborsTally | null): void {
  outer: while (!st.broken) {
    for (let k = 0; k <= rank; k++) {
      const [name, step] = STEPS[k]!
      if (step(town, st)) {
        if (tally) tally[name]++
        continue outer
      }
    }
    return
  }
}

/** "What if": a number that leads, by every step short of "what if", to a broken rule is crossed off. */
function stepProbe(town: Town, st: State): boolean {
  const N = town.n * town.n
  let changed = false
  // Houses with fewest numbers left first: that is where a reader tries "what if".
  for (let left = 2; left <= 3 && !changed; left++) {
    for (let s = 0; s < N && !st.broken; s++) {
      if (st.value[s] !== 0 || popcount(st.cand[s]!) !== left) continue
      for (let m = st.cand[s]!; m; m &= m - 1) {
        const v = lowest(m)
        const trial = clone(st)
        place(town, trial, s, v)
        run(town, trial, STEP.claim, null)
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
const STEPS: readonly (readonly [keyof NeighborsTally, (town: Town, st: State) => boolean])[] = [
  ['single', stepSingle],
  ['touch', stepTouch],
  ['claim', stepClaim],
  ['probe', stepProbe],
]

/** Solves the town with the level's steps only. */
export function solveNeighbors(p: NeighborsPuzzle, rules: NeighborsRules): NeighborsSolveResult {
  const town = townOf(p)
  const tally: NeighborsTally = { single: 0, touch: 0, claim: 0, probe: 0 }
  const st = initial(town, p)
  run(town, st, RANK[rules], tally)
  const values = Array.from(st.value)
  const open = values.filter((v) => v === 0).length
  return { solved: !st.broken && open === 0, values, open, broken: st.broken, tally }
}

/**
 * Plain search (for tests and checks): how many finished towns keep the
 * printed numbers, counting no further than `limit`.
 */
export function countNeighborsSolutions(p: NeighborsPuzzle, limit = 2): number {
  const town = townOf(p)
  const N = town.n * town.n
  let found = 0
  const search = (st: State) => {
    if (found >= limit || st.broken) return
    let best = -1
    let bestCount = 99
    for (let s = 0; s < N; s++) {
      if (st.value[s] !== 0) continue
      const c = popcount(st.cand[s]!)
      if (c === 0) return
      if (c < bestCount) {
        best = s
        bestCount = c
      }
    }
    if (best < 0) {
      if (neighborsKeepsRules(p, Array.from(st.value))) found++
      return
    }
    for (let m = st.cand[best]!; m && found < limit; m &= m - 1) {
      const next = clone(st)
      place(town, next, best, lowest(m))
      search(next)
    }
  }
  search(initial(town, p))
  return found
}

/**
 * Fills a town's blocks with numbers that keep the rules, trying each
 * house's numbers in the order `order` gives them; null when there is no
 * way, or the search runs out of patience first.
 */
export function fillNeighborsTown(
  p: Pick<NeighborsPuzzle, 'size' | 'blocks'>,
  order: (options: readonly number[]) => number[],
  patience = 4000,
): number[] | null {
  const puzzle: NeighborsPuzzle = { ...p, clues: new Array<number>(p.size * p.size).fill(NEIGHBORS_BLANK) }
  const town = townOf(puzzle)
  const N = town.n * town.n
  let nodes = 0
  const search = (st: State): number[] | null => {
    if (st.broken || nodes++ > patience) return null
    // Sure steps first: they cost nothing and cut the search down.
    run(town, st, STEP.single, null)
    if (st.broken) return null
    let best = -1
    let bestCount = 99
    for (let s = 0; s < N; s++) {
      if (st.value[s] !== 0) continue
      const c = popcount(st.cand[s]!)
      if (c < bestCount) {
        best = s
        bestCount = c
      }
    }
    if (best < 0) return Array.from(st.value)
    const options: number[] = []
    for (let m = st.cand[best]!; m; m &= m - 1) options.push(lowest(m))
    for (const v of order(options)) {
      const next = clone(st)
      place(town, next, best, v)
      const done = search(next)
      if (done) return done
    }
    return null
  }
  const done = search(initial(town, puzzle))
  return done && neighborsKeepsRules(p, done) ? done : null
}
