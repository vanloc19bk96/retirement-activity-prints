import type { StudioRng } from '../studio-rng'
import { canonicalHash, gridSymmetries } from '../_shared/uniqueness'
import {
  SM_BLANK,
  SM_NONE,
  SM_OPPOSITE,
  SM_SAME,
  SM_SUN,
  UNKNOWN,
  isSmSolution,
  smAdvance,
  smAnswerText,
  smStartState,
  solveSm,
  type SmPuzzle,
  type SmRules,
  type SmTally,
} from './solver'

/**
 * Building a Sun & Moon grid.
 *
 * The answer comes first: a sun or a moon on every square, row by row in a
 * random order, never three alike and never more than half of one in any
 * row or column. Its clues come next, one at a time where the reader would
 * be stuck: the level's steps (short of "what if") solve the grid as far as
 * they can, a square they could not reach is picked at random, and it gets
 * either its own sun or moon printed or a sign (= or ×) to one of its
 * neighbours, whichever the level's share of signs draws. When the steps
 * finish the grid, every clue is then tried without, in a random order, and
 * dropped for good when the level's own steps still finish the grid on its
 * one answer. What is left is a grid where every clue matters. The solver
 * then decides whether it is no easier than the level.
 */

export interface SmBuilt {
  puzzle: SmPuzzle
  /** The one answer: 0 sun, 1 moon, square by square in reading order. */
  answer: number[]
  /** Digest of the grid, the same however it is turned or mirrored, or with suns and moons swapped. */
  signature: string
}

/** Grids built before a level gives up on this stream. */
export const SM_CANDIDATES = 40

/** A grid's own fingerprint: turned, mirrored, or with every sun a moon, it is the same puzzle. */
export function smSignature(p: SmPuzzle): string {
  const n = p.size
  const side = 2 * n - 1
  // Squares on the even places, signs between them: turning the picture turns the signs with it.
  const picture = (swap: boolean) =>
    Array.from({ length: side }, (_, y) =>
      Array.from({ length: side }, (_, x) => {
        if (y % 2 === 0 && x % 2 === 0) {
          const v = p.givens[(y / 2) * n + x / 2]!
          if (v === SM_BLANK) return '.'
          return (v === SM_SUN) !== swap ? 'S' : 'M'
        }
        if (y % 2 === 0) return signChar(p.across[(y / 2) * n + (x - 1) / 2]!)
        if (x % 2 === 0) return signChar(p.down[((y - 1) / 2) * n + x / 2]!)
        return ' '
      }),
    )
  let best: string | null = null
  for (const swap of [false, true]) {
    for (const turned of gridSymmetries(picture(swap))) {
      const form = turned.map((row) => row.join('')).join('/')
      if (best === null || form < best) best = form
    }
  }
  return canonicalHash(`${n}|${best ?? ''}`)
}

const signChar = (sign: number) => (sign === SM_SAME ? '=' : sign === SM_OPPOSITE ? 'x' : '.')

/**
 * A finished grid: as many suns as moons in every row and column, never
 * three alike. Null when the search runs past its budget.
 */
export function drawSmAnswer(n: number, rng: StudioRng): number[] | null {
  const half = n / 2
  const s = new Array<number>(n * n).fill(UNKNOWN)
  const rows = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)]
  const cols = [new Array<number>(n).fill(0), new Array<number>(n).fill(0)]
  let budget = 20000
  const place = (i: number): boolean => {
    if (i === n * n) return true
    const r = Math.floor(i / n)
    const c = i % n
    for (const v of rng.chance(0.5) ? [0, 1] : [1, 0]) {
      if (--budget < 0) return false
      if (rows[v]![r]! >= half || cols[v]![c]! >= half) continue
      if (c >= 2 && s[i - 1] === v && s[i - 2] === v) continue
      if (r >= 2 && s[i - n] === v && s[i - 2 * n] === v) continue
      s[i] = v
      rows[v]![r]!++
      cols[v]![c]!++
      if (place(i + 1)) return true
      rows[v]![r]!--
      cols[v]![c]!--
      s[i] = UNKNOWN
    }
    return false
  }
  return place(0) ? s : null
}

/**
 * A clue, as one number: `k` (below n²) prints square k's own sun or moon;
 * `n² + k` the sign between square k and the square to its right;
 * `2n² + k` the sign between square k and the square below it.
 */
export type SmClue = number

/** The grid a set of clues prints for an answer. */
export function smPuzzleFrom(n: number, answer: readonly number[], clues: Iterable<SmClue>): SmPuzzle {
  const givens = new Array<number>(n * n).fill(SM_BLANK)
  const across = new Array<number>(n * n).fill(SM_NONE)
  const down = new Array<number>(n * n).fill(SM_NONE)
  const sign = (a: number, b: number) => (answer[a] === answer[b] ? SM_SAME : SM_OPPOSITE)
  for (const clue of clues) {
    const k = clue % (n * n)
    const kind = Math.floor(clue / (n * n))
    if (kind === 0) givens[k] = answer[k]!
    else if (kind === 1) across[k] = sign(k, k + 1)
    else down[k] = sign(k, k + n)
  }
  return { size: n, givens, across, down }
}

/** A square's signs to its neighbours, as clues. */
function signsAround(n: number, i: number): SmClue[] {
  const r = Math.floor(i / n)
  const c = i % n
  const out: SmClue[] = []
  if (c + 1 < n) out.push(n * n + i)
  if (c > 0) out.push(n * n + i - 1)
  if (r + 1 < n) out.push(2 * n * n + i)
  if (r > 0) out.push(2 * n * n + i - n)
  return out
}

export interface SmLevelNeeds {
  size: number
  rules: SmRules
  /** Refuse grids these steps alone finish. */
  beyond?: SmRules | null
  /** The fewest level steps ("make the row fit" or "what if") the grid must take. */
  minHard?: number
  /** How often a stuck square gets a sign rather than its own sun or moon. */
  signShare: number
  /** Fewest and most clues (printed squares and signs), as a share of the squares. */
  clues: readonly [number, number]
}

/** The level's own steps beyond the ones before it: "make the row fit" at Classic, "what if" at Challenging. */
export function smHardSteps(tally: SmTally, rules: SmRules): number {
  if (rules === 'probe') return tally.probe
  if (rules === 'lines') return tally.lines
  return 0
}

/** How many clues a grid prints: its suns and moons, and its signs. */
export function smClueCount(p: SmPuzzle): { givens: number; signs: number } {
  return {
    givens: p.givens.filter((v) => v !== SM_BLANK).length,
    signs: p.across.filter((v) => v !== SM_NONE).length + p.down.filter((v) => v !== SM_NONE).length,
  }
}

/** True when the grid is one the level's steps finish on exactly this answer, and no easier. */
export function smMeetsLevel(p: SmPuzzle, answer: readonly number[], needs: SmLevelNeeds): boolean {
  if (p.size !== needs.size || !isSmSolution(p, answer)) return false
  const { givens, signs } = smClueCount(p)
  const squares = p.size * p.size
  if (givens + signs < Math.ceil(needs.clues[0] * squares) || givens + signs > Math.floor(needs.clues[1] * squares)) return false
  // Both kinds of clue on every grid: it is the signs that make it Sun & Moon.
  if (givens === 0 || signs === 0) return false
  const solve = solveSm(p, needs.rules)
  if (!solve.solved || smAnswerText(solve.state) !== smAnswerText(answer)) return false
  if (needs.beyond && solveSm(p, needs.beyond).solved) return false
  return smHardSteps(solve.tally, needs.rules) >= (needs.minHard ?? 0)
}

/**
 * One grid built for the level, kept only when the level's steps solve it to
 * exactly its answer (and, when `beyond` is given, those steps alone do
 * not). Null when this draw does not.
 */
export function drawSmCandidate(options: SmLevelNeeds & { rng: StudioRng }): SmBuilt | null {
  const { size: n, rules, signShare, rng } = options
  const answer = drawSmAnswer(n, rng)
  if (!answer) return null
  // Clues where the reader is stuck, until the steps short of "what if" finish the grid.
  const building: SmRules = rules === 'probe' ? 'lines' : rules
  const clues = new Set<SmClue>()
  let puzzle = smPuzzleFrom(n, answer, clues)
  const state = smStartState(puzzle)
  const tally: SmTally = { basic: 0, lines: 0, probe: 0 }
  for (let guard = 0; guard < n * n * 2; guard++) {
    if (smAdvance(puzzle, state, building, tally)) break
    const stuck: number[] = []
    state.forEach((v, i) => {
      if (v === UNKNOWN) stuck.push(i)
    })
    if (stuck.length === 0) return null
    const i = rng.pick(stuck)
    const signs = signsAround(n, i).filter((clue) => !clues.has(clue))
    if (signs.length > 0 && rng.chance(signShare)) clues.add(rng.pick(signs))
    else {
      clues.add(i)
      state[i] = answer[i]!
    }
    puzzle = smPuzzleFrom(n, answer, clues)
  }
  if (state.includes(UNKNOWN)) return null
  // Every clue tried without: gone for good when the level's steps still finish the grid.
  for (const clue of rng.shuffle([...clues])) {
    clues.delete(clue)
    if (!solveSm(smPuzzleFrom(n, answer, clues), rules).solved) clues.add(clue)
  }
  puzzle = smPuzzleFrom(n, answer, clues)
  return smMeetsLevel(puzzle, answer, options) ? { puzzle, answer, signature: smSignature(puzzle) } : null
}

/**
 * A grid for the level from this stream: grids built until one is solved by
 * exactly the level's steps, or null when none is within the budget.
 */
export function buildSmGrid(
  options: SmLevelNeeds & {
    rng: StudioRng
    /** Grids already refused for this page (by signature). */
    exclude?: ReadonlySet<string>
  },
): SmBuilt | null {
  const { exclude, ...needs } = options
  for (let k = 0; k < SM_CANDIDATES; k++) {
    const built = drawSmCandidate(needs)
    if (built && !exclude?.has(built.signature)) return built
  }
  return null
}

