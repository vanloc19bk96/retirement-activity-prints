/**
 * Happy Campers (Tents & Trees): the rules, and a reader's way of solving.
 *
 * The grid is read row by row, one flat index per square. Trees are given;
 * every other square ends up a tent or grass. A finished grid obeys:
 *
 * - every tree has its own tent beside it (above, below, left or right),
 *   one tent per tree and one tree per tent;
 * - no two tents touch, not even corner to corner;
 * - each row and column holds exactly the tents its number says.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. Every step is sound (it follows from the rules alone), so a grid
 * the solver finishes has exactly one answer. What it may use depends on the
 * level:
 *
 * - `basic` — the counts (a full row is grass, a row with just enough room
 *   is tents), grass round every tent, a tree with one free square left
 *   gets its tent there, a square beside no free tree is grass, and a tent
 *   with only one tree beside it belongs to that tree.
 * - `runs` — adds counting inside a row: a gap of free squares holds at most
 *   half of them, rounded up. When a row needs exactly that many, an odd gap
 *   is tent, grass, tent… and the squares either side of an even gap are grass.
 * - `probe` — adds "what if": a square where a tent (or grass) leads, by the
 *   steps above, straight to a broken rule is the other thing.
 */

export const UNKNOWN = 0
export const TENT = 1
export const GRASS = 2
export const TREE = 3
export type HcCell = typeof UNKNOWN | typeof TENT | typeof GRASS | typeof TREE

export type HcRules = 'basic' | 'runs' | 'probe'

export interface HcPuzzle {
  rows: number
  cols: number
  /** Flat, row by row: true where a tree stands. */
  trees: readonly boolean[]
  rowCounts: readonly number[]
  colCounts: readonly number[]
}

interface Geometry {
  size: number
  /** Squares above, below, left and right. */
  orth: number[][]
  /** All eight squares round a square. */
  around: number[][]
  /** Every row, then every column, with its count. */
  lines: { cells: number[]; count: number; row: boolean }[]
  trees: number[]
}

const geometryCache = new WeakMap<HcPuzzle, Geometry>()

function geometry(p: HcPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const { rows, cols } = p
  const size = rows * cols
  const orth: number[][] = []
  const around: number[][] = []
  for (let i = 0; i < size; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const o: number[] = []
    const a: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
        a.push(rr * cols + cc)
        if (dr === 0 || dc === 0) o.push(rr * cols + cc)
      }
    }
    orth.push(o)
    around.push(a)
  }
  const lines: Geometry['lines'] = []
  for (let r = 0; r < rows; r++) lines.push({ cells: Array.from({ length: cols }, (_, c) => r * cols + c), count: p.rowCounts[r]!, row: true })
  for (let c = 0; c < cols; c++) lines.push({ cells: Array.from({ length: rows }, (_, r) => r * cols + c), count: p.colCounts[c]!, row: false })
  const trees: number[] = []
  for (let i = 0; i < size; i++) if (p.trees[i]) trees.push(i)
  const g = { size, orth, around, lines, trees }
  geometryCache.set(p, g)
  return g
}

/** The grid before a pencil touches it: trees, and every other square open. */
export function hcStartState(p: HcPuzzle): Uint8Array {
  const s = new Uint8Array(p.rows * p.cols)
  p.trees.forEach((t, i) => {
    if (t) s[i] = TREE
  })
  return s
}

/* ------------------------------------------------------------------ *
 * Matching trees to tents
 * ------------------------------------------------------------------ */

/** Kuhn's augmenting paths: can every `left` be given its own `right`? */
function saturates(left: readonly number[], options: (l: number) => readonly number[]): boolean {
  const owner = new Map<number, number>()
  const tryAssign = (l: number, seen: Set<number>): boolean => {
    for (const r of options(l)) {
      if (seen.has(r)) continue
      seen.add(r)
      const held = owner.get(r)
      if (held === undefined || tryAssign(held, seen)) {
        owner.set(r, l)
        return true
      }
    }
    return false
  }
  return left.every((l) => tryAssign(l, new Set()))
}

/**
 * True while the grid can still pair every tree with its own tent and every
 * tent with its own tree. (If each side can be matched on its own, both can
 * at once — Mendelsohn–Dulmage — so two one-sided checks suffice.)
 */
function matchable(s: Uint8Array, g: Geometry): boolean {
  const treesOk = saturates(g.trees, (t) => g.orth[t]!.filter((c) => s[c] === TENT || s[c] === UNKNOWN))
  if (!treesOk) return false
  const tents: number[] = []
  for (let i = 0; i < g.size; i++) if (s[i] === TENT) tents.push(i)
  return saturates(tents, (t) => g.orth[t]!.filter((c) => s[c] === TREE))
}

/* ------------------------------------------------------------------ *
 * Sure steps
 * ------------------------------------------------------------------ */

type Step = 'changed' | 'same' | 'broken'

/**
 * Trees and tents that can only belong to each other. A tent with one free
 * tree beside it is that tree's; a tree whose only free square is a tent
 * owns it. Returns the pairing, or null when a tree or tent is left with no
 * partner at all.
 */
function pairUp(s: Uint8Array, g: Geometry): { tentOf: Map<number, number>; treeOf: Map<number, number> } | null {
  const tentOf = new Map<number, number>()
  const treeOf = new Map<number, number>()
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < g.size; i++) {
      if (s[i] !== TENT || treeOf.has(i)) continue
      const free = g.orth[i]!.filter((c) => s[c] === TREE && !tentOf.has(c))
      if (free.length === 0) return null
      if (free.length === 1) {
        tentOf.set(free[0]!, i)
        treeOf.set(i, free[0]!)
        changed = true
      }
    }
    for (const t of g.trees) {
      if (tentOf.has(t)) continue
      const room = g.orth[t]!.filter((c) => s[c] === UNKNOWN || (s[c] === TENT && !treeOf.has(c)))
      if (room.length === 0) return null
      if (room.length === 1 && s[room[0]!] === TENT) {
        tentOf.set(t, room[0]!)
        treeOf.set(room[0]!, t)
        changed = true
      }
    }
  }
  return { tentOf, treeOf }
}

function basicStep(s: Uint8Array, g: Geometry): Step {
  let changed = false
  // Grass round every tent.
  for (let i = 0; i < g.size; i++) {
    if (s[i] !== TENT) continue
    for (const j of g.around[i]!) {
      if (s[j] === TENT) return 'broken'
      if (s[j] === UNKNOWN) {
        s[j] = GRASS
        changed = true
      }
    }
  }
  // The counts.
  for (const line of g.lines) {
    let tents = 0
    let open = 0
    for (const c of line.cells) {
      if (s[c] === TENT) tents++
      else if (s[c] === UNKNOWN) open++
    }
    if (tents > line.count || tents + open < line.count) return 'broken'
    if (open === 0) continue
    if (tents === line.count) {
      for (const c of line.cells) if (s[c] === UNKNOWN) s[c] = GRASS
      changed = true
    } else if (tents + open === line.count) {
      for (const c of line.cells) if (s[c] === UNKNOWN) s[c] = TENT
      changed = true
    }
  }
  if (changed) return 'changed'
  // Trees and their tents.
  const pairs = pairUp(s, g)
  if (!pairs) return 'broken'
  for (const t of g.trees) {
    if (pairs.tentOf.has(t)) continue
    const room = g.orth[t]!.filter((c) => s[c] === UNKNOWN || (s[c] === TENT && !pairs.treeOf.has(c)))
    if (room.length === 1 && s[room[0]!] === UNKNOWN) {
      s[room[0]!] = TENT
      changed = true
    }
  }
  if (changed) return 'changed'
  for (let i = 0; i < g.size; i++) {
    if (s[i] !== UNKNOWN) continue
    if (!g.orth[i]!.some((c) => s[c] === TREE && !pairs.tentOf.has(c))) {
      s[i] = GRASS
      changed = true
    }
  }
  return changed ? 'changed' : 'same'
}

/** Counting inside a line: the most tents each gap of open squares can take. */
function runsStep(s: Uint8Array, g: Geometry, p: HcPuzzle): Step {
  let changed = false
  for (const line of g.lines) {
    let need = line.count
    const gaps: number[][] = []
    let current: number[] = []
    for (const c of line.cells) {
      if (s[c] === TENT) need--
      if (s[c] === UNKNOWN) current.push(c)
      else if (current.length > 0) {
        gaps.push(current)
        current = []
      }
    }
    if (current.length > 0) gaps.push(current)
    if (need <= 0 || gaps.length === 0) continue
    const most = gaps.reduce((sum, gap) => sum + Math.ceil(gap.length / 2), 0)
    if (most < need) return 'broken'
    if (most !== need) continue
    for (const gap of gaps) {
      if (gap.length % 2 === 1) {
        gap.forEach((c, k) => {
          s[c] = k % 2 === 0 ? TENT : GRASS
        })
        changed = true
        continue
      }
      // Each neighbouring pair holds one tent: the squares either side of the
      // gap, across the line, touch it whichever square it is.
      for (const c of gap) {
        const r = Math.floor(c / p.cols)
        const col = c % p.cols
        const across = line.row
          ? [r - 1, r + 1].filter((rr) => rr >= 0 && rr < p.rows).map((rr) => rr * p.cols + col)
          : [col - 1, col + 1].filter((cc) => cc >= 0 && cc < p.cols).map((cc) => r * p.cols + cc)
        for (const a of across) {
          if (s[a] === UNKNOWN) {
            s[a] = GRASS
            changed = true
          }
        }
      }
    }
    if (changed) return 'changed'
  }
  return changed ? 'changed' : 'same'
}

/** Sure steps until none is left. False when the grid breaks a rule. */
function settle(s: Uint8Array, g: Geometry, p: HcPuzzle, runs: boolean, tally?: HcTally): boolean {
  for (;;) {
    const basic = basicStep(s, g)
    if (basic === 'broken') return false
    if (basic === 'changed') {
      if (tally) tally.basic++
      continue
    }
    if (!runs) return true
    const counted = runsStep(s, g, p)
    if (counted === 'broken') return false
    if (counted === 'same') return true
    if (tally) tally.runs++
  }
}

function consistent(s: Uint8Array, g: Geometry): boolean {
  for (const line of g.lines) {
    let tents = 0
    let open = 0
    for (const c of line.cells) {
      if (s[c] === TENT) tents++
      else if (s[c] === UNKNOWN) open++
    }
    if (tents > line.count || tents + open < line.count) return false
  }
  for (let i = 0; i < g.size; i++) {
    if (s[i] === TENT && g.around[i]!.some((j) => s[j] === TENT)) return false
  }
  return matchable(s, g)
}

/** How many sure steps of each kind a solve took. */
export interface HcTally {
  basic: number
  runs: number
  probe: number
}

export interface HcSolve {
  /** The grid as far as the solver got. */
  state: Uint8Array
  /** Every square decided, and the result obeys every rule. */
  solved: boolean
  tally: HcTally
}

/**
 * Solve as a reader would with the level's steps, never guessing. A solved
 * result is the puzzle's one and only answer: every step was forced.
 */
export function solveHc(p: HcPuzzle, rules: HcRules): HcSolve {
  const g = geometry(p)
  const s = hcStartState(p)
  const tally: HcTally = { basic: 0, runs: 0, probe: 0 }
  const runs = rules !== 'basic'
  const fail = (): HcSolve => ({ state: s, solved: false, tally })
  if (!settle(s, g, p, runs, tally)) return fail()

  if (rules === 'probe') {
    let progress = true
    while (progress && s.includes(UNKNOWN)) {
      progress = false
      for (let i = 0; i < g.size && !progress; i++) {
        if (s[i] !== UNKNOWN) continue
        for (const guess of [TENT, GRASS] as const) {
          const trial = s.slice()
          trial[i] = guess
          if (settle(trial, g, p, true) && consistent(trial, g)) continue
          s[i] = guess === TENT ? GRASS : TENT
          tally.probe++
          if (!settle(s, g, p, true, tally)) return fail()
          progress = true
          break
        }
      }
    }
  }

  const solved = !s.includes(UNKNOWN) && consistent(s, g) && isHcSolution(p, tentsOf(s))
  return { state: s, solved, tally }
}

/** The tents of a finished grid, flat. */
export function tentsOf(state: Uint8Array): boolean[] {
  return Array.from(state, (v) => v === TENT)
}

/** True when these tents answer the puzzle: counts, no touching, one tree each. */
export function isHcSolution(p: HcPuzzle, tents: readonly boolean[]): boolean {
  const g = geometry(p)
  if (tents.length !== g.size) return false
  const s = hcStartState(p)
  for (let i = 0; i < g.size; i++) {
    if (!tents[i]) {
      if (s[i] !== TREE) s[i] = GRASS
      continue
    }
    if (p.trees[i]) return false
    s[i] = TENT
  }
  for (const line of g.lines) {
    if (line.cells.filter((c) => s[c] === TENT).length !== line.count) return false
  }
  const tentCount = tents.filter(Boolean).length
  if (tentCount !== g.trees.length) return false
  return consistent(s, g)
}

/** The counts a set of tents gives each row and column. */
export function hcCounts(rows: number, cols: number, tents: readonly boolean[]): { rowCounts: number[]; colCounts: number[] } {
  const rowCounts = new Array<number>(rows).fill(0)
  const colCounts = new Array<number>(cols).fill(0)
  tents.forEach((t, i) => {
    if (!t) return
    rowCounts[Math.floor(i / cols)]!++
    colCounts[i % cols]!++
  })
  return { rowCounts, colCounts }
}

/**
 * Brute force, for proving the solver: how many different sets of tents
 * answer the puzzle, stopping at `limit`. Not used to build pages — a grid
 * the solver finishes is already proven to have one answer.
 */
export function countHcSolutions(p: HcPuzzle, limit = 2): number {
  const g = geometry(p)
  const { rows, cols } = p
  const candidate = Array.from({ length: g.size }, (_, i) => !p.trees[i] && g.orth[i]!.some((c) => p.trees[c]))
  // Squares still to come in each column, below and including each row.
  const colLeft: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols).fill(0))
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) colLeft[r]![c] = colLeft[r + 1]![c]! + (candidate[r * cols + c] ? 1 : 0)
  }
  const tents = new Array<boolean>(g.size).fill(false)
  const rowTents = new Array<number>(rows).fill(0)
  const colTents = new Array<number>(cols).fill(0)
  let found = 0

  const visit = (i: number): void => {
    if (found >= limit) return
    if (i === g.size) {
      if (colTents.every((n, c) => n === p.colCounts[c]) && isHcSolution(p, tents)) found++
      return
    }
    const r = Math.floor(i / cols)
    const c = i % cols
    if (c === 0 && r > 0) {
      if (rowTents[r - 1] !== p.rowCounts[r - 1]) return
      for (let cc = 0; cc < cols; cc++) if (colTents[cc]! + colLeft[r]![cc]! < p.colCounts[cc]!) return
    }
    if (candidate[i] && rowTents[r]! < p.rowCounts[r]! && colTents[c]! < p.colCounts[c]!) {
      const touching = g.around[i]!.some((j) => j < i && tents[j])
      if (!touching) {
        tents[i] = true
        rowTents[r]!++
        colTents[c]!++
        visit(i + 1)
        tents[i] = false
        rowTents[r]!--
        colTents[c]!--
      }
    }
    visit(i + 1)
  }
  visit(0)
  return found
}
