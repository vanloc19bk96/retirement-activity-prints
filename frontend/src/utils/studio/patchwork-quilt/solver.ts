/**
 * Patchwork Quilt (Shikaku): the rules, and a reader's way of solving.
 *
 * A square quilt of N × N squares carries numbers in some of its squares.
 * The reader sews the quilt into patches along the grid lines. A finished
 * quilt obeys:
 *
 * - every patch is a rectangle (a square counts);
 * - every patch holds exactly one number, and that number is how many
 *   squares the patch covers;
 * - every square of the quilt is in exactly one patch.
 *
 * The solver works the way a reader does, one sure step at a time, and never
 * guesses. It keeps, for every number, the ways its patch could still lie
 * (every rectangle of the right size round the number that holds no other
 * number and crosses no patch already sewn). Every step follows from the
 * rules alone, so a quilt the solver finishes has exactly one answer. What
 * it may use depends on the level:
 *
 * - `basic` — lay and cross off: a number with one way left is sewn there;
 *   squares every way of a number covers are that number's (no other patch
 *   may take them); a square only one number's patch can reach is that
 *   number's, so its patch must take it; and a way that crosses a square
 *   another number already owns is crossed off.
 * - `reach` — adds "would it block": a way that would leave some square no
 *   patch can reach, or leave another number with no way at all, is
 *   crossed off.
 * - `probe` — adds "what if": a way that leads, by the basic steps, straight
 *   to a broken rule is crossed off.
 */

export interface PqClue {
  /** The square the number prints in (row × size + col). */
  at: number
  /** The number: how many squares its patch covers. */
  size: number
}

export interface PqPuzzle {
  /** Squares across and down. */
  size: number
  /** The numbers, in reading order. */
  clues: readonly PqClue[]
}

/** A patch: a rectangle of squares. */
export interface PqRect {
  row: number
  col: number
  height: number
  width: number
}

export type PqRules = 'basic' | 'reach' | 'block'

const RANK: Record<PqRules, number> = { basic: 0, reach: 1, block: 2 }

/** Squares a patch covers, in reading order. */
export function pqRectSquares(rect: PqRect, n: number): number[] {
  const out: number[] = []
  for (let r = rect.row; r < rect.row + rect.height; r++) for (let c = rect.col; c < rect.col + rect.width; c++) out.push(r * n + c)
  return out
}

/** True when the square lies inside the patch. */
export function pqRectHas(rect: PqRect, i: number, n: number): boolean {
  const r = Math.floor(i / n)
  const c = i % n
  return r >= rect.row && r < rect.row + rect.height && c >= rect.col && c < rect.col + rect.width
}

/** A patch as one comparable string. */
export const pqRectKey = (rect: PqRect) => `${rect.row},${rect.col},${rect.height},${rect.width}`

/** A whole answer (one patch per number, in the numbers' order) as one comparable string. */
export const pqAnswerKey = (rects: readonly PqRect[]) => rects.map(pqRectKey).join('/')

/** True when the quilt is well formed: numbers of 1 or more on distinct squares, adding up to the quilt. */
export function pqWellFormed(p: PqPuzzle): boolean {
  const n = p.size
  if (!Number.isInteger(n) || n < 3) return false
  const seen = new Set<number>()
  let total = 0
  for (const clue of p.clues) {
    if (!Number.isInteger(clue.at) || clue.at < 0 || clue.at >= n * n || seen.has(clue.at)) return false
    if (!Number.isInteger(clue.size) || clue.size < 1) return false
    seen.add(clue.at)
    total += clue.size
  }
  return total === n * n
}

/** True when the patches (one per number, in order) are a finished quilt. */
export function isPqSolution(p: PqPuzzle, rects: readonly PqRect[]): boolean {
  const n = p.size
  if (rects.length !== p.clues.length) return false
  const cover = new Int16Array(n * n).fill(-1)
  for (let k = 0; k < rects.length; k++) {
    const rect = rects[k]!
    const clue = p.clues[k]!
    if (rect.height < 1 || rect.width < 1 || rect.row < 0 || rect.col < 0 || rect.row + rect.height > n || rect.col + rect.width > n) return false
    if (rect.height * rect.width !== clue.size || !pqRectHas(rect, clue.at, n)) return false
    for (const i of pqRectSquares(rect, n)) {
      if (cover[i] !== -1) return false
      cover[i] = k
    }
  }
  if (cover.includes(-1)) return false
  // No patch holds a second number.
  return p.clues.every((clue, k) => cover[clue.at] === k)
}

/* ------------------------------------------------------------------ *
 * The ways each number's patch can lie
 * ------------------------------------------------------------------ */

interface Geometry {
  /** Every way, over all numbers. */
  ways: PqRect[]
  /** Each way's squares. */
  squares: number[][]
  /** Each way's number. */
  clueOf: number[]
  /** Each number's ways. */
  waysOf: number[][]
  /** Each square's ways. */
  waysAt: number[][]
}

const geometryCache = new WeakMap<PqPuzzle, Geometry>()

/** Every rectangle of the number's size round its square that holds no other number. */
export function pqWaysFor(p: PqPuzzle, k: number): PqRect[] {
  const n = p.size
  const clue = p.clues[k]!
  const r0 = Math.floor(clue.at / n)
  const c0 = clue.at % n
  const others = new Set(p.clues.filter((_, j) => j !== k).map((c) => c.at))
  const out: PqRect[] = []
  for (let height = 1; height <= Math.min(n, clue.size); height++) {
    if (clue.size % height !== 0) continue
    const width = clue.size / height
    if (width > n) continue
    for (let row = Math.max(0, r0 - height + 1); row <= Math.min(r0, n - height); row++) {
      for (let col = Math.max(0, c0 - width + 1); col <= Math.min(c0, n - width); col++) {
        const rect = { row, col, height, width }
        if (pqRectSquares(rect, n).some((i) => others.has(i))) continue
        out.push(rect)
      }
    }
  }
  return out
}

function geometry(p: PqPuzzle): Geometry {
  const cached = geometryCache.get(p)
  if (cached) return cached
  const n = p.size
  const ways: PqRect[] = []
  const squares: number[][] = []
  const clueOf: number[] = []
  const waysOf: number[][] = p.clues.map(() => [])
  const waysAt: number[][] = Array.from({ length: n * n }, () => [])
  p.clues.forEach((_, k) => {
    for (const rect of pqWaysFor(p, k)) {
      const w = ways.length
      ways.push(rect)
      const cells = pqRectSquares(rect, n)
      squares.push(cells)
      clueOf.push(k)
      waysOf[k]!.push(w)
      for (const i of cells) waysAt[i]!.push(w)
    }
  })
  const g = { ways, squares, clueOf, waysOf, waysAt }
  geometryCache.set(p, g)
  return g
}

/* ------------------------------------------------------------------ *
 * The solver's pencil marks
 * ------------------------------------------------------------------ */

type Step = 'changed' | 'same' | 'broken'

export interface PqTally {
  basic: number
  reach: number
  block: number
}

interface State {
  /** Per way: still possible. */
  live: Uint8Array
  /** Per square: the number whose patch must take it, or -1. */
  owner: Int16Array
}

export interface PqSolveResult {
  solved: boolean
  /** Each number's patch when solved (in the numbers' order), else what is known: null where more than one way is left. */
  rects: (PqRect | null)[]
  /** Squares no patch has claimed yet. */
  open: number
  /** How many times each kind of step moved the quilt on. */
  tally: PqTally
}

function liveWays(g: Geometry, s: State, k: number): number[] {
  return g.waysOf[k]!.filter((w) => s.live[w] === 1)
}

/**
 * Laying and crossing off, number by number, until nothing moves: ways
 * across a square another number owns go, and squares every way of a
 * number covers are its own (a number with one way left owns all of it).
 */
function numberSteps(p: PqPuzzle, g: Geometry, s: State): Step {
  let any = false
  for (let again = true; again; ) {
    again = false
    for (let w = 0; w < g.ways.length; w++) {
      if (s.live[w] !== 1) continue
      const k = g.clueOf[w]!
      if (g.squares[w]!.some((i) => s.owner[i] !== -1 && s.owner[i] !== k)) {
        s.live[w] = 0
        again = true
      }
    }
    for (let k = 0; k < p.clues.length; k++) {
      const live = liveWays(g, s, k)
      if (live.length === 0) return 'broken'
      const count = new Map<number, number>()
      for (const w of live) for (const i of g.squares[w]!) count.set(i, (count.get(i) ?? 0) + 1)
      for (const [i, c] of count) {
        if (c !== live.length || s.owner[i] === k) continue
        if (s.owner[i] !== -1) return 'broken'
        s.owner[i] = k
        again = true
      }
    }
    if (again) any = true
  }
  return any ? 'changed' : 'same'
}

/**
 * Square by square: a square only one number's patch can reach is that
 * number's, and its ways that miss the square go; a square no patch can
 * reach is a broken rule.
 */
function squareStep(p: PqPuzzle, g: Geometry, s: State): Step {
  const n = p.size
  let any = false
  for (let i = 0; i < n * n; i++) {
    const reach = new Set<number>()
    for (const w of g.waysAt[i]!) if (s.live[w] === 1) reach.add(g.clueOf[w]!)
    if (reach.size === 0) return 'broken'
    if (reach.size !== 1) continue
    const k = [...reach][0]!
    if (s.owner[i] === -1) {
      s.owner[i] = k
      any = true
    }
    for (const w of g.waysOf[k]!) {
      if (s.live[w] === 1 && !g.squares[w]!.includes(i)) {
        s.live[w] = 0
        any = true
      }
    }
  }
  return any ? 'changed' : 'same'
}

/** The level's everyday steps, over and over, until nothing moves. */
function runSteps(p: PqPuzzle, g: Geometry, s: State, squares: boolean, tally: PqTally | null): Step {
  let any = false
  for (;;) {
    const numbers = numberSteps(p, g, s)
    if (numbers === 'broken') return 'broken'
    if (numbers === 'changed') {
      any = true
      if (tally) tally.basic++
    }
    if (!squares) return any ? 'changed' : 'same'
    const square = squareStep(p, g, s)
    if (square === 'broken') return 'broken'
    if (square === 'same') return any ? 'changed' : 'same'
    any = true
    if (tally) tally.reach++
  }
}

/**
 * "Would it block": a way that leaves some other square with no patch to
 * reach it, or another number with no way at all, cannot be the patch.
 * One such way is crossed off per step, so the tally counts how often the
 * reader needs the idea.
 */
function block(p: PqPuzzle, g: Geometry, s: State): Step {
  const n = p.size
  for (let k = 0; k < p.clues.length; k++) {
    const live = liveWays(g, s, k)
    if (live.length < 2) continue
    for (const w of live) {
      const mine = new Set(g.squares[w]!)
      const clashes = (v: number) => g.squares[v]!.some((i) => mine.has(i))
      let blocks = false
      for (let j = 0; j < p.clues.length && !blocks; j++) {
        if (j !== k && !liveWays(g, s, j).some((v) => !clashes(v))) blocks = true
      }
      for (let i = 0; i < n * n && !blocks; i++) {
        if (mine.has(i)) continue
        if (!g.waysAt[i]!.some((v) => s.live[v] === 1 && g.clueOf[v] !== k && !clashes(v))) blocks = true
      }
      if (blocks) {
        s.live[w] = 0
        return 'changed'
      }
    }
  }
  return 'same'
}

function settled(p: PqPuzzle, g: Geometry, s: State): boolean {
  return p.clues.every((_, k) => liveWays(g, s, k).length === 1)
}

/**
 * Solves the quilt with the level's steps only. `solved` is true only when
 * every number has one way left and the patches make a finished quilt,
 * which — every step being sound — also proves it is the only answer.
 */
export function solvePq(p: PqPuzzle, rules: PqRules): PqSolveResult {
  const g = geometry(p)
  const n = p.size
  const s: State = { live: new Uint8Array(g.ways.length).fill(1), owner: new Int16Array(n * n).fill(-1) }
  const tally: PqTally = { basic: 0, reach: 0, block: 0 }
  const rank = RANK[rules]
  const result = (solved: boolean): PqSolveResult => {
    const rects = p.clues.map((_, k) => {
      const live = liveWays(g, s, k)
      return live.length === 1 ? g.ways[live[0]!]! : null
    })
    let open = 0
    for (let i = 0; i < n * n; i++) if (s.owner[i] === -1) open++
    return { solved, rects, open, tally }
  }
  for (;;) {
    if (runSteps(p, g, s, rank >= RANK.reach, tally) === 'broken') return result(false)
    if (settled(p, g, s)) break
    if (rank >= RANK.block && block(p, g, s) === 'changed') {
      tally.block++
      continue
    }
    return result(false)
  }
  const out = result(false)
  const rects = out.rects as PqRect[]
  return { ...out, solved: isPqSolution(p, rects) }
}

/**
 * The quilt's answers by plain search, up to `limit` of them, each as one
 * patch per number — the generator's measure of how far a quilt is from one
 * answer, and the tests' independent check on the solver. The first open
 * square in reading order is always the top-left corner of its patch, so
 * the search only ever tries patches that start there.
 */
export function pqSolutions(p: PqPuzzle, limit = 2): PqRect[][] {
  const g = geometry(p)
  const n = p.size
  const startsAt: number[][] = Array.from({ length: n * n }, () => [])
  g.ways.forEach((rect, w) => startsAt[rect.row * n + rect.col]!.push(w))
  const cover = new Uint8Array(n * n)
  const used = new Uint8Array(p.clues.length)
  const chosen: number[] = new Array(p.clues.length).fill(-1)
  const out: PqRect[][] = []
  const walk = (from: number) => {
    let i = from
    while (i < n * n && cover[i] === 1) i++
    if (i === n * n) {
      out.push(chosen.map((w) => g.ways[w]!))
      return
    }
    for (const w of startsAt[i]!) {
      if (out.length >= limit) return
      const k = g.clueOf[w]!
      if (used[k] === 1) continue
      const cells = g.squares[w]!
      if (cells.some((j) => cover[j] === 1)) continue
      for (const j of cells) cover[j] = 1
      used[k] = 1
      chosen[k] = w
      walk(i + 1)
      chosen[k] = -1
      used[k] = 0
      for (const j of cells) cover[j] = 0
    }
  }
  walk(0)
  return out
}

/** How many answers the quilt has, counted up to `limit`. */
export const countPqSolutions = (p: PqPuzzle, limit = 2) => pqSolutions(p, limit).length
