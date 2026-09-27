import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import { isTySolution, pathsOf, solveTy, tyNeighbours, tyPathList, type TyPuzzle, type TyRules } from './solver'

/**
 * Building a Tangled Yarn grid.
 *
 * Every square starts as a strand of its own. Again and again two strands
 * whose ends sit side by side are tied into one — the shortest strands first
 * more often than not, so no scrap is left over — but only when the longer
 * strand would never run beside itself (a strand that doubles back alongside
 * itself could take a short cut, and a grid with a short cut nearly always
 * has two answers). A scrap too short for a pair of balls with nowhere to
 * tie cuts a neighbouring strand where it touches and ties onto one piece.
 * When few enough strands are left, each one's two ends become a lettered
 * pair of yarn balls. That always makes a grid with at least one
 * answer; the solver then decides whether a reader can reach it, and only
 * it, without guessing, so many are drawn and the first one the level's
 * steps finish is kept.
 */

export interface TyBuilt {
  puzzle: TyPuzzle
  /** The one answer: each pair's squares from its first ball (in reading order) to its second. */
  paths: number[][]
  /** Digest of the grid, the same however it is turned or mirrored. */
  signature: string
}

/** Random grids drawn before a level gives up on this stream. */
export const TY_CANDIDATES = 400
/** Chance a tie starts from one of the shortest strands, not any strand. */
const SHORTEST_FIRST = 0.6
/** The shortest strand worth a pair of balls: its balls never sit side by side. */
export const TY_MIN_STRAND = 3

/** A grid's own fingerprint: turned or mirrored, and its pairs renumbered to match, it is the same puzzle. */
export function tySignature(puzzle: TyPuzzle): string {
  const grid = Array.from({ length: puzzle.rows }, (_, r) => puzzle.ends.slice(r * puzzle.cols, (r + 1) * puzzle.cols))
  let best: string | null = null
  for (const turned of gridSymmetries(grid)) {
    const renumber = new Map<number, number>()
    const form = turned
      .map((row) =>
        row
          .map((k) => {
            if (k === 0) return '.'
            if (!renumber.has(k)) renumber.set(k, renumber.size + 1)
            return String(renumber.get(k))
          })
          .join(','),
      )
      .join('/')
    if (best === null || form < best) best = form
  }
  return canonicalHash(best ?? '')
}

/** Strands as pairs numbered in reading order of their first ball, each read from that ball. */
export function tyFromStrands(rows: number, cols: number, strands: readonly (readonly number[])[]): { puzzle: TyPuzzle; paths: number[][] } {
  const oriented = strands.map((s) => (s[0]! <= s[s.length - 1]! ? [...s] : [...s].reverse()))
  oriented.sort((a, b) => a[0]! - b[0]!)
  const ends = new Array<number>(rows * cols).fill(0)
  oriented.forEach((s, k) => {
    ends[s[0]!] = k + 1
    ends[s[s.length - 1]!] = k + 1
  })
  return { puzzle: { rows, cols, ends }, paths: oriented }
}

/** True when no two squares of the strand sit side by side unless they follow one another along it. */
export function tyRunsClear(strand: readonly number[], cols: number): boolean {
  const at = new Map(strand.map((cell, n) => [cell, n]))
  for (let n = 0; n < strand.length; n++) {
    const cell = strand[n]!
    const r = Math.floor(cell / cols)
    for (const next of [cell - 1, cell + 1, cell - cols, cell + cols]) {
      if ((next === cell - 1 || next === cell + 1) && Math.floor(next / cols) !== r) continue
      const m = at.get(next)
      if (m !== undefined && Math.abs(m - n) !== 1) return false
    }
  }
  return true
}

/** A random grid of this size with a pair count in range and at least one answer, not yet proven. */
export function draftTyGrid(options: { rows: number; cols: number; minPairs: number; maxPairs: number; rng: StudioRng }): { puzzle: TyPuzzle; paths: number[][] } | null {
  const { rows, cols, minPairs, maxPairs, rng } = options
  const cells = rows * cols
  const target = rng.int(minPairs, maxPairs)
  // Strands by id; `owner` names the strand through each square.
  const strands = new Map<number, number[]>()
  const owner = new Int32Array(cells)
  let nextId = cells
  for (let i = 0; i < cells; i++) {
    strands.set(i, [i])
    owner[i] = i
  }
  const near = (i: number): number[] => {
    const r = Math.floor(i / cols)
    const c = i % cols
    const out: number[] = []
    if (c > 0) out.push(i - 1)
    if (c + 1 < cols) out.push(i + 1)
    if (r > 0) out.push(i - cols)
    if (r + 1 < rows) out.push(i + cols)
    return out
  }
  const endsOf = (s: readonly number[]) => (s.length === 1 ? [s[0]!] : [s[0]!, s[s.length - 1]!])
  /** `a` (an end of its strand) and `b` (an end of another), tied: the new strand, read through a then b. */
  const tied = (a: number, b: number): number[] => {
    const sa = strands.get(owner[a]!)!
    const sb = strands.get(owner[b]!)!
    const left = sa[sa.length - 1] === a ? sa : [...sa].reverse()
    const right = sb[0] === b ? sb : [...sb].reverse()
    return [...left, ...right]
  }
  /** Puts strands in place of the ones through their squares. */
  const place = (gone: readonly number[], made: readonly number[][]) => {
    for (const id of gone) strands.delete(id)
    for (const strand of made) {
      const id = nextId++
      strands.set(id, strand)
      for (const cell of strand) owner[cell] = id
    }
  }
  const short = () => [...strands.keys()].filter((id) => strands.get(id)!.length < TY_MIN_STRAND)

  const stuck = new Set<number>()
  for (let guard = cells * 12; guard > 0; guard--) {
    const scraps = short()
    if (strands.size <= target && scraps.length === 0) break
    // Down to the target, only scraps are worked on.
    const open = (strands.size > target ? [...strands.keys()] : scraps).filter((id) => !stuck.has(id))
    if (open.length === 0) break
    let pool = open
    if (rng.chance(SHORTEST_FIRST)) {
      const shortest = Math.min(...open.map((id) => strands.get(id)!.length))
      pool = open.filter((id) => strands.get(id)!.length === shortest)
    }
    const id = rng.pick(pool)
    const mine = strands.get(id)!
    // Tie end to end, where the new strand runs clear of itself.
    const ties: number[][] = []
    for (const a of endsOf(mine)) {
      for (const b of near(a)) {
        if (owner[b] === id || !endsOf(strands.get(owner[b]!)!).includes(b)) continue
        const joined = tied(a, b)
        if (tyRunsClear(joined, cols)) ties.push(joined)
      }
    }
    if (ties.length > 0) {
      const joined = rng.pick(ties)
      place([...new Set(joined.map((cell) => owner[cell]!))], [joined])
      stuck.clear()
      continue
    }
    // A scrap with nowhere to tie cuts a neighbouring strand beside it and
    // ties onto one piece; the other piece goes on as a strand of its own.
    if (mine.length < TY_MIN_STRAND) {
      const cuts: { other: number; made: number[][] }[] = []
      for (const a of endsOf(mine)) {
        const toA = mine[mine.length - 1] === a ? mine : [...mine].reverse()
        for (const b of near(a)) {
          const other = owner[b]!
          if (other === id) continue
          const theirs = strands.get(other)!
          const j = theirs.indexOf(b)
          if (j <= 0 || j >= theirs.length - 1) continue
          // Keep b's side before it, or after it.
          const head = theirs.slice(0, j + 1)
          const tail = theirs.slice(j + 1)
          const joinedHead = [...toA, ...[...head].reverse()]
          if (tyRunsClear(joinedHead, cols)) cuts.push({ other, made: [joinedHead, tail] })
          const before = theirs.slice(0, j)
          const after = theirs.slice(j)
          const joinedAfter = [...toA, ...after]
          if (tyRunsClear(joinedAfter, cols)) cuts.push({ other, made: [joinedAfter, before] })
        }
      }
      if (cuts.length > 0) {
        const cut = rng.pick(cuts)
        place([id, cut.other], cut.made)
        stuck.clear()
        continue
      }
    }
    stuck.add(id)
  }
  if (strands.size < minPairs || strands.size > maxPairs) return null
  const list = [...strands.values()]
  if (list.some((s) => s.length < TY_MIN_STRAND || !tyRunsClear(s, cols))) return null
  const drafted = tyFromStrands(rows, cols, list)
  // Balls of one pair side by side are a free strand, not a puzzle.
  if (drafted.paths.some((s) => tyNeighbours(s[0]!, s[s.length - 1]!, cols))) return null
  return drafted
}

/**
 * One random grid of this size, kept only when the level's steps solve it
 * to exactly its strands. Null when this draw does not.
 */
export function drawTyCandidate(options: {
  rows: number
  cols: number
  minPairs: number
  maxPairs: number
  rules: TyRules
  /** Refuse grids these steps alone finish. */
  beyond?: TyRules | null
  rng: StudioRng
}): TyBuilt | null {
  const { rows, cols, minPairs, maxPairs, rules, beyond = null, rng } = options
  const draft = draftTyGrid({ rows, cols, minPairs, maxPairs, rng })
  if (!draft) return null
  const { puzzle, paths } = draft
  if (!isTySolution(puzzle, paths)) return null
  const solve = solveTy(puzzle, rules)
  if (!solve.solved || tyPathList(pathsOf(puzzle, solve.state)) !== tyPathList(paths)) return null
  if (beyond && solveTy(puzzle, beyond).solved) return null
  return { puzzle, paths, signature: tySignature(puzzle) }
}

/**
 * A grid for the level from this stream: random draws until one is solved
 * by exactly the level's steps, or null when none is within the budget.
 */
export function buildTyGrid(options: {
  size: number
  minPairs: number
  maxPairs: number
  rules: TyRules
  beyond: TyRules | null
  rng: StudioRng
  /** Grids already refused for this page (by signature). */
  exclude?: ReadonlySet<string>
}): TyBuilt | null {
  const { size, minPairs, maxPairs, rules, beyond, rng, exclude } = options
  for (let k = 0; k < TY_CANDIDATES; k++) {
    const built = drawTyCandidate({ rows: size, cols: size, minPairs, maxPairs, rules, beyond, rng })
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}
