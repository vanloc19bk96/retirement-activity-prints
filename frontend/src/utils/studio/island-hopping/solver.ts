/**
 * Island Hopping (Hashi, or Bridges): the rules, and a reader's way of solving.
 *
 * Islands sit on the points of a square lattice, each with a number. The
 * reader draws bridges between them. A finished chart obeys:
 *
 * - bridges run straight across or straight down, from one island to the
 *   next one along that line, and never cross another bridge or an island;
 * - one or two bridges join a pair of islands, never more;
 * - each island has exactly as many bridges as its number says;
 * - every island can be reached from every other by bridges.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. Every step follows from the rules alone, so a chart the solver
 * finishes has exactly one answer. What it may use depends on the level:
 *
 * - `basic` — counting: an island's number less the most its other lanes can
 *   take is the least this lane must carry, and its number less what its
 *   other lanes already carry is the most this one may; a bridge on one lane
 *   closes every lane that crosses it.
 * - `connect` — adds joining up: a bridge that would finish a group of
 *   islands cut off from the rest cannot be built (two 1s never join, two 2s
 *   never double up), and a group with only one way out takes a bridge there.
 * - `probe` — adds "what if": a bridge (or one fewer) that leads, by the
 *   steps above, straight to a broken rule is ruled out.
 */

export interface IhIsland {
  row: number
  col: number
  /** Bridges that touch the island. */
  n: number
}

export interface IhPuzzle {
  rows: number
  cols: number
  /** Row by row, left to right. */
  islands: readonly IhIsland[]
}

/** Bridges between two islands (`a` < `b`, by index). */
export interface IhBridge {
  a: number
  b: number
  count: 1 | 2
}

export type IhRules = 'basic' | 'connect' | 'probe'

/** A lane two islands can be joined along: nothing but open water between them. */
export interface IhLane {
  a: number
  b: number
  horizontal: boolean
  /** Lattice points strictly between the two islands, flat (row × cols + col). */
  cells: number[]
}

interface Geometry {
  lanes: IhLane[]
  /** Lanes that touch each island. */
  byIsland: number[][]
  /** Lanes each lane crosses. */
  crosses: number[][]
  /** `a-b` → lane. */
  laneOf: Map<string, number>
}

const geometryCache = new WeakMap<IhPuzzle, Geometry>()

export const ihPairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

/** Every lane of a chart: each island to the next one right of it and below it. */
export function ihLanes(p: IhPuzzle): IhLane[] {
  return geometry(p).lanes
}

function geometry(p: IhPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const { rows, cols, islands } = p
  const at = new Map<number, number>()
  islands.forEach((isl, i) => at.set(isl.row * cols + isl.col, i))
  const lanes: IhLane[] = []
  islands.forEach((isl, i) => {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const cells: number[] = []
      let r = isl.row + dr
      let c = isl.col + dc
      while (r < rows && c < cols) {
        const j = at.get(r * cols + c)
        if (j !== undefined) {
          lanes.push({ a: Math.min(i, j), b: Math.max(i, j), horizontal: dr === 0, cells })
          break
        }
        cells.push(r * cols + c)
        r += dr
        c += dc
      }
    }
  })
  const byIsland: number[][] = islands.map(() => [])
  lanes.forEach((lane, e) => {
    byIsland[lane.a]!.push(e)
    byIsland[lane.b]!.push(e)
  })
  const through = new Map<number, number[]>()
  lanes.forEach((lane, e) => {
    for (const cell of lane.cells) through.set(cell, [...(through.get(cell) ?? []), e])
  })
  const crosses: number[][] = lanes.map(() => [])
  for (const passing of through.values()) {
    for (const e of passing) {
      for (const f of passing) {
        if (e !== f && lanes[e]!.horizontal !== lanes[f]!.horizontal && !crosses[e]!.includes(f)) crosses[e]!.push(f)
      }
    }
  }
  const laneOf = new Map(lanes.map((lane, e) => [ihPairKey(lane.a, lane.b), e]))
  const g = { lanes, byIsland, crosses, laneOf }
  geometryCache.set(p, g)
  return g
}

/* ------------------------------------------------------------------ *
 * Groups of islands
 * ------------------------------------------------------------------ */

/** Islands joined by lanes where `joined(e)` holds, as a group id per island. */
function groups(p: IhPuzzle, g: Geometry, joined: (e: number) => boolean): number[] {
  const parent = p.islands.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  g.lanes.forEach((lane, e) => {
    if (joined(e)) parent[find(lane.a)] = find(lane.b)
  })
  return p.islands.map((_, i) => find(i))
}

/* ------------------------------------------------------------------ *
 * The solver's pencil marks: the fewest and most bridges each lane may hold
 * ------------------------------------------------------------------ */

export interface IhState {
  lo: Int8Array
  hi: Int8Array
}

/** Every lane open, up to two bridges or what its smaller island allows. */
export function ihStartState(p: IhPuzzle): IhState {
  const g = geometry(p)
  const lo = new Int8Array(g.lanes.length)
  const hi = new Int8Array(g.lanes.length)
  g.lanes.forEach((lane, e) => {
    hi[e] = Math.min(2, p.islands[lane.a]!.n, p.islands[lane.b]!.n)
  })
  return { lo, hi }
}

const copy = (s: IhState): IhState => ({ lo: s.lo.slice(), hi: s.hi.slice() })

type Step = 'changed' | 'same' | 'broken'

/** Counting round every island, and closing the lanes a bridge crosses. */
function basicStep(s: IhState, g: Geometry, p: IhPuzzle): Step {
  const { lo, hi } = s
  let changed = false
  for (let e = 0; e < g.lanes.length; e++) {
    if (lo[e]! < 1) continue
    for (const f of g.crosses[e]!) {
      if (lo[f]! >= 1) return 'broken'
      if (hi[f]! > 0) {
        hi[f] = 0
        changed = true
      }
    }
  }
  for (let i = 0; i < p.islands.length; i++) {
    const n = p.islands[i]!.n
    const own = g.byIsland[i]!
    let most = 0
    let least = 0
    for (const e of own) {
      most += hi[e]!
      least += lo[e]!
    }
    if (most < n || least > n) return 'broken'
    for (const e of own) {
      const newLo = Math.max(lo[e]!, n - (most - hi[e]!))
      const newHi = Math.min(hi[e]!, n - (least - lo[e]!))
      if (newLo > newHi) return 'broken'
      if (newLo !== lo[e] || newHi !== hi[e]) {
        most += newHi - hi[e]!
        least += newLo - lo[e]!
        lo[e] = newLo
        hi[e] = newHi
        changed = true
      }
    }
  }
  return changed ? 'changed' : 'same'
}

/** Per island: its number less the bridges it already has. */
function missing(s: IhState, g: Geometry, p: IhPuzzle): number[] {
  return p.islands.map((isl, i) => g.byIsland[i]!.reduce((left, e) => left - s.lo[e]!, isl.n))
}

/** True when a group is cut off from the rest: every island in it finished, and islands outside it. */
function sealedGroup(s: IhState, g: Geometry, p: IhPuzzle): boolean {
  const group = groups(p, g, (e) => s.lo[e]! >= 1)
  const left = missing(s, g, p)
  const open = new Set<number>()
  const size = new Map<number, number>()
  group.forEach((id, i) => {
    size.set(id, (size.get(id) ?? 0) + 1)
    if (left[i]! > 0) open.add(id)
  })
  return [...size.entries()].some(([id, n]) => n < p.islands.length && !open.has(id))
}

/** Joining up: no bridge that seals a group off, and a group with one way out takes it. */
function connectStep(s: IhState, g: Geometry, p: IhPuzzle): Step {
  const { lo, hi } = s
  const total = p.islands.length
  if (total < 2) return 'same'
  if (sealedGroup(s, g, p)) return 'broken'
  // The whole chart must still hang together over the lanes left open.
  const reach = groups(p, g, (e) => hi[e]! >= 1)
  if (reach.some((id) => id !== reach[0])) return 'broken'

  const group = groups(p, g, (e) => lo[e]! >= 1)
  const left = missing(s, g, p)
  const members = new Map<number, number[]>()
  group.forEach((id, i) => members.set(id, [...(members.get(id) ?? []), i]))
  const unfinished = new Map<number, number>()
  group.forEach((id, i) => unfinished.set(id, (unfinished.get(id) ?? 0) + (left[i]! > 0 ? 1 : 0)))

  // Every bridge the lane may still take would finish both ends and leave
  // their group(s) sealed: the lane takes one fewer than it may.
  for (let e = 0; e < g.lanes.length; e++) {
    const room = hi[e]! - lo[e]!
    if (room <= 0) continue
    const { a, b } = g.lanes[e]!
    if (left[a] !== room || left[b] !== room) continue
    const ga = group[a]!
    const gb = group[b]!
    const size = members.get(ga)!.length + (ga === gb ? 0 : members.get(gb)!.length)
    // The ends are each group's only unfinished island (in the same group, its only two).
    const others = ga === gb ? unfinished.get(ga)! - 2 : unfinished.get(ga)! - 1 + unfinished.get(gb)! - 1
    if (others === 0 && size < total) {
      hi[e] = hi[e]! - 1
      return 'changed'
    }
  }

  // A group with one way out.
  for (const islands of members.values()) {
    if (islands.length === total) continue
    const exits = new Set<number>()
    for (const i of islands) {
      for (const e of g.byIsland[i]!) {
        const { a, b } = g.lanes[e]!
        if (hi[e]! >= 1 && group[a] !== group[b]) exits.add(e)
      }
    }
    if (exits.size === 0) return 'broken'
    if (exits.size === 1) {
      const [e] = [...exits]
      if (lo[e!]! < 1) {
        lo[e!] = 1
        return 'changed'
      }
    }
  }
  return 'same'
}

/** How many sure steps of each kind a solve took. */
export interface IhTally {
  basic: number
  connect: number
  probe: number
}

/** Sure steps until none is left. False when the chart breaks a rule. */
function settle(s: IhState, g: Geometry, p: IhPuzzle, connect: boolean, tally?: IhTally): boolean {
  for (;;) {
    const basic = basicStep(s, g, p)
    if (basic === 'broken') return false
    if (basic === 'changed') {
      if (tally) tally.basic++
      continue
    }
    if (!connect) return true
    const joined = connectStep(s, g, p)
    if (joined === 'broken') return false
    if (joined === 'same') return true
    if (tally) tally.connect++
  }
}

const decided = (s: IhState) => s.lo.every((v, e) => v === s.hi[e])

export interface IhSolve {
  state: IhState
  /** Every lane decided, and the result obeys every rule. */
  solved: boolean
  tally: IhTally
}

/**
 * Solve as a reader would with the level's steps, never guessing. A solved
 * result is the chart's one and only answer: every step was forced.
 */
export function solveIh(p: IhPuzzle, rules: IhRules): IhSolve {
  const g = geometry(p)
  const s = ihStartState(p)
  const tally: IhTally = { basic: 0, connect: 0, probe: 0 }
  const connect = rules !== 'basic'
  const fail = (): IhSolve => ({ state: s, solved: false, tally })
  if (!settle(s, g, p, connect, tally)) return fail()

  if (rules === 'probe') {
    let progress = true
    while (progress && !decided(s)) {
      progress = false
      for (let e = 0; e < g.lanes.length && !progress; e++) {
        if (s.lo[e] === s.hi[e]) continue
        // What if this lane had one more bridge than it must? One fewer than it may?
        for (const more of [true, false]) {
          const trial = copy(s)
          if (more) trial.lo[e] = trial.lo[e]! + 1
          else trial.hi[e] = trial.hi[e]! - 1
          if (settle(trial, g, p, true)) continue
          if (more) s.hi[e] = s.lo[e]!
          else s.lo[e] = s.hi[e]!
          tally.probe++
          if (!settle(s, g, p, true, tally)) return fail()
          progress = true
          break
        }
      }
    }
  }

  const solved = decided(s) && isIhSolution(p, bridgesOf(p, s))
  return { state: s, solved, tally }
}

/** The bridges a decided state draws. */
export function bridgesOf(p: IhPuzzle, s: IhState): IhBridge[] {
  const g = geometry(p)
  const out: IhBridge[] = []
  g.lanes.forEach((lane, e) => {
    const count = s.lo[e]!
    if (count >= 1) out.push({ a: lane.a, b: lane.b, count: count as 1 | 2 })
  })
  return out
}

/** Bridges in a stable order, for comparing two answers. */
export const ihBridgeList = (bridges: readonly IhBridge[]) =>
  bridges
    .map((b) => `${ihPairKey(b.a, b.b)}:${b.count}`)
    .sort()
    .join(',')

/** True when these bridges answer the chart: lanes, no crossing, numbers, one piece. */
export function isIhSolution(p: IhPuzzle, bridges: readonly IhBridge[]): boolean {
  const g = geometry(p)
  const on = new Int8Array(g.lanes.length)
  for (const bridge of bridges) {
    const e = g.laneOf.get(ihPairKey(bridge.a, bridge.b))
    if (e === undefined || on[e]! > 0 || bridge.count < 1 || bridge.count > 2) return false
    on[e] = bridge.count
  }
  for (let e = 0; e < g.lanes.length; e++) {
    if (on[e]! > 0 && g.crosses[e]!.some((f) => on[f]! > 0)) return false
  }
  for (let i = 0; i < p.islands.length; i++) {
    if (g.byIsland[i]!.reduce((sum, e) => sum + on[e]!, 0) !== p.islands[i]!.n) return false
  }
  const group = groups(p, g, (e) => on[e]! > 0)
  return group.every((id) => id === group[0])
}

/** The numbers a set of bridges gives each island. */
export function ihNumbers(islandCount: number, bridges: readonly IhBridge[]): number[] {
  const n = new Array<number>(islandCount).fill(0)
  for (const b of bridges) {
    n[b.a]! += b.count
    n[b.b]! += b.count
  }
  return n
}

/**
 * Brute force, for proving the solver: how many different sets of bridges
 * answer the chart, stopping at `limit`. Not used to build pages — a chart
 * the solver finishes is already proven to have one answer.
 */
export function countIhSolutions(p: IhPuzzle, limit = 2): number {
  const g = geometry(p)
  const lanes = g.lanes
  const on = new Int8Array(lanes.length)
  const sum = new Array<number>(p.islands.length).fill(0)
  // The last lane of each island, in order: once it is set the island must be exact.
  const lastLane = g.byIsland.map((own) => Math.max(-1, ...own))
  let found = 0

  const visit = (e: number): void => {
    if (found >= limit) return
    if (e === lanes.length) {
      const group = groups(p, g, (k) => on[k]! > 0)
      if (group.every((id) => id === group[0])) found++
      return
    }
    const { a, b } = lanes[e]!
    const blocked = g.crosses[e]!.some((f) => f < e && on[f]! > 0)
    for (let k = 0; k <= (blocked ? 0 : 2); k++) {
      if (sum[a]! + k > p.islands[a]!.n || sum[b]! + k > p.islands[b]!.n) break
      if (lastLane[a] === e && sum[a]! + k !== p.islands[a]!.n) continue
      if (lastLane[b] === e && sum[b]! + k !== p.islands[b]!.n) continue
      on[e] = k
      sum[a]! += k
      sum[b]! += k
      visit(e + 1)
      sum[a]! -= k
      sum[b]! -= k
      on[e] = 0
    }
  }
  // An island with no lanes at all can never be finished.
  if (p.islands.some((isl, i) => g.byIsland[i]!.length === 0 && (isl.n > 0 || p.islands.length > 1))) return 0
  visit(0)
  return found
}
