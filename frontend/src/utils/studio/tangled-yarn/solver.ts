/**
 * Tangled Yarn (Numberlink): the rules, and a reader's way of solving.
 *
 * A square grid holds pairs of yarn balls, each pair printed with the same
 * number. The reader draws one strand of yarn between the two balls of every
 * pair. A finished grid obeys:
 *
 * - a strand runs from square to square, straight across or down (never
 *   corner to corner), from one ball of a pair to the other;
 * - strands never cross, branch or share a square;
 * - every square of the grid is used by exactly one strand.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps a pencil mark for every side two squares share (strand,
 * no strand, or not yet known) and, where it can tell, which yarn fills a
 * square. Every step follows from the rules alone, so a grid the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — counting: a ball has one strand leaving it and any other square
 *   two, so a square with only as many open sides as it needs uses them all,
 *   and a full square closes the rest; a strand never joins two different
 *   yarns, and never closes on itself in a loop.
 * - `reach` — adds following a yarn: a square no yarn can reach through the
 *   open squares is a broken grid, a square only one yarn can reach is that
 *   yarn's, two squares no yarn could share never join, and a square every
 *   way between a pair's balls must pass through belongs to that pair.
 * - `probe` — adds "what if": a strand (or a gap) that leads, by the steps
 *   above, straight to a broken rule is ruled out.
 */

export interface TyPuzzle {
  rows: number
  cols: number
  /** Flat (row × cols + col): the pair's number (1, 2, …) on each of its two balls, 0 on every other square. */
  ends: readonly number[]
}

export type TyRules = 'basic' | 'reach' | 'probe'

interface Geometry {
  /** Each side two squares share, as the two squares (lower index first). */
  edges: [number, number][]
  /** The sides round each square. */
  byCell: number[][]
  /** Pairs on the grid. */
  pairs: number
  /** Each pair's two balls (pair k at index k - 1). */
  endsOf: [number, number][]
}

const geometryCache = new WeakMap<TyPuzzle, Geometry>()

function geometry(p: TyPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const { rows, cols, ends } = p
  const edges: [number, number][] = []
  const byCell: number[][] = Array.from({ length: rows * cols }, () => [])
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (c + 1 < cols) edges.push([i, i + 1])
      if (r + 1 < rows) edges.push([i, i + cols])
    }
  }
  edges.forEach(([a, b], e) => {
    byCell[a]!.push(e)
    byCell[b]!.push(e)
  })
  const pairs = Math.max(0, ...ends)
  const found: number[][] = Array.from({ length: pairs }, () => [])
  ends.forEach((k, i) => {
    if (k > 0) found[k - 1]!.push(i)
  })
  const endsOf = found.map((cells) => [cells[0] ?? -1, cells[1] ?? -1] as [number, number])
  const g = { edges, byCell, pairs, endsOf }
  geometryCache.set(p, g)
  return g
}

/** Squares side by side (across or down) in a grid this many columns wide. */
export const tyNeighbours = (a: number, b: number, cols: number) =>
  (Math.abs(a - b) === 1 && Math.floor(a / cols) === Math.floor(b / cols)) || Math.abs(a - b) === cols

/** True when the grid is well formed: every number on exactly two balls, numbered 1 up with none skipped. */
export function tyWellFormed(p: TyPuzzle): boolean {
  if (p.ends.length !== p.rows * p.cols) return false
  const g = geometry(p)
  const seen = new Array<number>(g.pairs).fill(0)
  for (const k of p.ends) {
    if (!Number.isInteger(k) || k < 0) return false
    if (k > 0) seen[k - 1]!++
  }
  return g.pairs > 0 && seen.every((n) => n === 2)
}

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

const UNKNOWN = -1
const OFF = 0
const ON = 1

export interface TyState {
  /** Per side: -1 not known, 0 no strand, 1 strand. */
  edge: Int8Array
  /** Per square: the yarn known to fill it, or 0. */
  label: Int8Array
}

export function tyStartState(p: TyPuzzle): TyState {
  const g = geometry(p)
  return { edge: new Int8Array(g.edges.length).fill(UNKNOWN), label: Int8Array.from(p.ends) }
}

const copy = (s: TyState): TyState => ({ edge: s.edge.slice(), label: s.label.slice() })

type Step = 'changed' | 'same' | 'broken'

/** Squares joined by strands, as a root per square; null when the strands close a loop. */
function strandGroups(s: TyState, g: Geometry, cells: number): Int32Array | null {
  const parent = new Int32Array(cells)
  for (let i = 0; i < cells; i++) parent[i] = i
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  for (let e = 0; e < g.edges.length; e++) {
    if (s.edge[e] !== ON) continue
    const [a, b] = g.edges[e]!
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return null
    parent[ra] = rb
  }
  for (let i = 0; i < cells; i++) parent[i] = find(i)
  return parent
}

/**
 * Counting round every square, then the yarns: a strand carries its yarn
 * along, never joins two yarns, and never closes a loop.
 */
function basicStep(s: TyState, g: Geometry, p: TyPuzzle): Step {
  const { edge, label } = s
  const cells = p.rows * p.cols
  let changed = false
  for (let i = 0; i < cells; i++) {
    const need = p.ends[i]! > 0 ? 1 : 2
    let on = 0
    let open = 0
    for (const e of g.byCell[i]!) {
      if (edge[e] === ON) on++
      else if (edge[e] === UNKNOWN) open++
    }
    if (on > need || on + open < need) return 'broken'
    if (open === 0) continue
    if (on === need || on + open === need) {
      const to = on === need ? OFF : ON
      for (const e of g.byCell[i]!) if (edge[e] === UNKNOWN) edge[e] = to
      changed = true
    }
  }
  if (changed) return 'changed'

  const root = strandGroups(s, g, cells)
  if (!root) return 'broken'
  const yarn = new Int8Array(cells)
  for (let i = 0; i < cells; i++) {
    const k = label[i]!
    if (k === 0) continue
    const r = root[i]!
    if (yarn[r] !== 0 && yarn[r] !== k) return 'broken'
    yarn[r] = k
  }
  for (let i = 0; i < cells; i++) {
    const k = yarn[root[i]!]!
    if (k !== 0 && label[i] !== k) {
      label[i] = k
      changed = true
    }
  }
  for (let e = 0; e < g.edges.length; e++) {
    if (edge[e] !== UNKNOWN) continue
    const [a, b] = g.edges[e]!
    const same = root[a] === root[b]
    const clash = label[a] !== 0 && label[b] !== 0 && label[a] !== label[b]
    if (same || clash) {
      edge[e] = OFF
      changed = true
    }
  }
  return changed ? 'changed' : 'same'
}

/**
 * Squares a yarn can reach from its first ball, over open sides, through
 * squares that are no other yarn's; `skip` is left out, as if blocked.
 */
function reachable(s: TyState, g: Geometry, p: TyPuzzle, k: number, from: number, skip = -1): Uint8Array {
  const seen = new Uint8Array(p.rows * p.cols)
  const queue = [from]
  seen[from] = 1
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!
    for (const e of g.byCell[i]!) {
      if (s.edge[e] === OFF) continue
      const [a, b] = g.edges[e]!
      const j = a === i ? b : a
      if (seen[j] || j === skip) continue
      const l = s.label[j]!
      if (l !== 0 && l !== k) continue
      seen[j] = 1
      queue.push(j)
    }
  }
  return seen
}

/** One shortest way between a pair's balls, over the squares `reachable` allows. */
function oneWay(s: TyState, g: Geometry, p: TyPuzzle, k: number, from: number, to: number): number[] {
  const back = new Int32Array(p.rows * p.cols).fill(-1)
  back[from] = from
  const queue = [from]
  for (let q = 0; q < queue.length && back[to] === -1; q++) {
    const i = queue[q]!
    for (const e of g.byCell[i]!) {
      if (s.edge[e] === OFF) continue
      const [a, b] = g.edges[e]!
      const j = a === i ? b : a
      if (back[j] !== -1) continue
      const l = s.label[j]!
      if (l !== 0 && l !== k) continue
      back[j] = i
      queue.push(j)
    }
  }
  const way: number[] = []
  if (back[to] === -1) return way
  for (let i = back[to]!; i !== from; i = back[i]!) way.push(i)
  return way
}

/** Following each yarn: who can reach a square, and squares every way must pass. */
function reachStep(s: TyState, g: Geometry, p: TyPuzzle): Step {
  const cells = p.rows * p.cols
  const root = strandGroups(s, g, cells)
  if (!root) return 'broken'
  // Which yarns could fill each square, as bits (yarn k is bit k - 1).
  const could = new Int32Array(cells)
  for (let i = 0; i < cells; i++) if (s.label[i]! > 0) could[i] = 1 << (s.label[i]! - 1)
  let changed = false
  for (let k = 1; k <= g.pairs; k++) {
    const [a, b] = g.endsOf[k - 1]!
    if (root[a] === root[b]) continue
    const seen = reachable(s, g, p, k, a)
    if (!seen[b]) return 'broken'
    for (let i = 0; i < cells; i++) if (seen[i] && s.label[i] === 0) could[i]! |= 1 << (k - 1)
    // A square every way between the balls passes through is this yarn's.
    for (const i of oneWay(s, g, p, k, a, b)) {
      if (s.label[i] !== 0) continue
      if (!reachable(s, g, p, k, a, i)[b]) {
        s.label[i] = k
        could[i] = 1 << (k - 1)
        changed = true
      }
    }
  }
  for (let i = 0; i < cells; i++) {
    if (s.label[i] !== 0) continue
    const bits = could[i]!
    if (bits === 0) return 'broken'
    if ((bits & (bits - 1)) === 0) {
      s.label[i] = 31 - Math.clz32(bits) + 1
      changed = true
    }
  }
  for (let e = 0; e < g.edges.length; e++) {
    if (s.edge[e] !== UNKNOWN) continue
    const [a, b] = g.edges[e]!
    if ((could[a]! & could[b]!) === 0) {
      s.edge[e] = OFF
      changed = true
    }
  }
  return changed ? 'changed' : 'same'
}

/** How many sure steps of each kind a solve took. */
export interface TyTally {
  basic: number
  reach: number
  probe: number
}

/** Sure steps until none is left. False when the grid breaks a rule. */
function settle(s: TyState, g: Geometry, p: TyPuzzle, reach: boolean, tally?: TyTally): boolean {
  for (;;) {
    const basic = basicStep(s, g, p)
    if (basic === 'broken') return false
    if (basic === 'changed') {
      if (tally) tally.basic++
      continue
    }
    if (!reach) return true
    const followed = reachStep(s, g, p)
    if (followed === 'broken') return false
    if (followed === 'same') return true
    if (tally) tally.reach++
  }
}

const decided = (s: TyState) => s.edge.every((v) => v !== UNKNOWN)

export interface TySolve {
  state: TyState
  /** Every side decided, and the strands obey every rule. */
  solved: boolean
  tally: TyTally
}

/**
 * Solve as a reader would with the level's steps, never guessing. A solved
 * result is the grid's one and only answer: every step was forced.
 */
export function solveTy(p: TyPuzzle, rules: TyRules): TySolve {
  const g = geometry(p)
  const s = tyStartState(p)
  const tally: TyTally = { basic: 0, reach: 0, probe: 0 }
  const reach = rules !== 'basic'
  const fail = (): TySolve => ({ state: s, solved: false, tally })
  if (!tyWellFormed(p) || !settle(s, g, p, reach, tally)) return fail()

  if (rules === 'probe') {
    let progress = true
    while (progress && !decided(s)) {
      progress = false
      for (let e = 0; e < g.edges.length && !progress; e++) {
        if (s.edge[e] !== UNKNOWN) continue
        // What if a strand crossed this side? What if none did?
        for (const guess of [ON, OFF]) {
          const trial = copy(s)
          trial.edge[e] = guess
          if (settle(trial, g, p, true)) continue
          s.edge[e] = guess === ON ? OFF : ON
          tally.probe++
          if (!settle(s, g, p, true, tally)) return fail()
          progress = true
          break
        }
      }
    }
  }

  const solved = decided(s) && isTySolution(p, pathsOf(p, s))
  return { state: s, solved, tally }
}

/** The strands a decided state draws: each pair's squares, from its first ball to its second. Empty when it does not. */
export function pathsOf(p: TyPuzzle, s: TyState): number[][] {
  const g = geometry(p)
  const out: number[][] = []
  for (const [a, b] of g.endsOf) {
    const path = [a]
    let prev = -1
    let at = a
    while (at !== b && path.length <= p.rows * p.cols) {
      let next = -1
      for (const e of g.byCell[at]!) {
        if (s.edge[e] !== ON) continue
        const [x, y] = g.edges[e]!
        const j = x === at ? y : x
        if (j !== prev) {
          next = j
          break
        }
      }
      if (next < 0) return []
      path.push(next)
      prev = at
      at = next
    }
    if (at !== b) return []
    out.push(path)
  }
  return out
}

/** Strands in a stable form, for comparing two answers. */
export const tyPathList = (paths: readonly (readonly number[])[]) => paths.map((path) => path.join('.')).join('|')

/**
 * True when these strands answer the grid: one per pair, from ball to ball,
 * square by neighbouring square, and every square used exactly once.
 */
export function isTySolution(p: TyPuzzle, paths: readonly (readonly number[])[]): boolean {
  if (!tyWellFormed(p)) return false
  const g = geometry(p)
  if (paths.length !== g.pairs) return false
  const used = new Uint8Array(p.rows * p.cols)
  for (let k = 1; k <= g.pairs; k++) {
    const path = paths[k - 1]!
    const [a, b] = g.endsOf[k - 1]!
    if (path.length < 2 || path[0] !== a || path[path.length - 1] !== b) return false
    for (let n = 0; n < path.length; n++) {
      const i = path[n]!
      if (!Number.isInteger(i) || i < 0 || i >= used.length || used[i]) return false
      if (n > 0 && n < path.length - 1 && p.ends[i] !== 0) return false
      if (n > 0 && !tyNeighbours(path[n - 1]!, i, p.cols)) return false
      used[i] = 1
    }
  }
  return used.every((u) => u === 1)
}

/**
 * Brute force, for proving the solver: how many different ways of drawing
 * the strands answer the grid, stopping at `limit`. Not used to build pages —
 * a grid the solver finishes is already proven to have one answer.
 */
export function countTySolutions(p: TyPuzzle, limit = 2): number {
  if (!tyWellFormed(p)) return 0
  const g = geometry(p)
  const cells = p.rows * p.cols
  const { cols } = p
  // 0 free, else the yarn using the square.
  const owner = Int8Array.from(p.ends)
  const near = Array.from({ length: cells }, (_, i) => g.byCell[i]!.map((e) => (g.edges[e]![0] === i ? g.edges[e]![1] : g.edges[e]![0])))
  let found = 0

  /** Every free square can still be filled by a yarn not yet drawn, and those yarns can still join. */
  const hopeful = (from: number): boolean => {
    const region = new Int32Array(cells).fill(-1)
    let regions = 0
    const touches: number[] = []
    for (let i = 0; i < cells; i++) {
      if (owner[i] !== 0 || region[i] !== -1) continue
      const id = regions++
      let mask = 0
      const queue = [i]
      region[i] = id
      for (let q = 0; q < queue.length; q++) {
        for (const j of near[queue[q]!]!) {
          if (owner[j] === 0 && region[j] === -1) {
            region[j] = id
            queue.push(j)
          } else if (p.ends[j]! > from) mask |= 1 << (p.ends[j]! - 1)
        }
      }
      touches.push(mask)
    }
    for (let k = from + 1; k <= g.pairs; k++) {
      const [a, b] = g.endsOf[k - 1]!
      if (tyNeighbours(a, b, cols)) continue
      const ra = new Set(near[a]!.filter((j) => owner[j] === 0).map((j) => region[j]))
      if (!near[b]!.some((j) => owner[j] === 0 && ra.has(region[j]!))) return false
    }
    // A free region no later yarn touches can never be filled.
    return touches.every((mask) => mask !== 0)
  }

  const draw = (k: number): void => {
    if (found >= limit) return
    if (k > g.pairs) {
      if (owner.every((o) => o !== 0)) found++
      return
    }
    if (!hopeful(k - 1)) return
    const [a, b] = g.endsOf[k - 1]!
    const extend = (at: number): void => {
      if (found >= limit) return
      for (const j of near[at]!) {
        if (j === b) {
          draw(k + 1)
          continue
        }
        if (owner[j] !== 0) continue
        owner[j] = k
        extend(j)
        owner[j] = 0
      }
    }
    extend(a)
  }
  draw(1)
  return found
}
