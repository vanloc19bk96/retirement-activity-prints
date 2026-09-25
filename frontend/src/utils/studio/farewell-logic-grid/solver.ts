/**
 * The logic behind a Farewell Party grid: what a clue means, and whether a set
 * of clues pins down one answer a reader can reach without guessing.
 *
 * Groups are numbered 0..K: group 0 is the people, groups 1..K the categories.
 * Every category has one value per person. The solver keeps, for each person
 * and category, the set of values still possible (a bit mask) — exactly what a
 * reader's X marks leave open in the People rows of the grid.
 *
 * Two solvers share that state:
 *
 * - `solveByDeduction` is the reader. It only ever uses one clue at a time
 *   against what is already marked ("if Carol brought the pie, clue 4 could
 *   not hold") plus the one-per-row, one-per-column rule. It never tries a
 *   guess and follows it. A puzzle is only accepted when this alone fills the
 *   whole grid, so no level asks for trial and error.
 * - `countSolutions` is the auditor. It branches on every open choice and
 *   counts complete answers (stopping at two), so it proves uniqueness
 *   independently of how clever the reader is.
 */

export interface LgRef {
  /** 0 = the people; 1..K = a category. */
  g: number
  /** Person index when g = 0, otherwise the value index within the category. */
  v: number
}

export type LgClue =
  /** a and b belong to the same person. */
  | { kind: 'same'; a: LgRef; b: LgRef }
  /** a and b belong to different people. */
  | { kind: 'diff'; a: LgRef; b: LgRef }
  /** Neither a nor b is c. */
  | { kind: 'neither'; a: LgRef; b: LgRef; c: LgRef }
  /** a is either b or c (b and c are two values of one group). */
  | { kind: 'either'; a: LgRef; b: LgRef; c: LgRef }
  /** a and b are different people; one is c and the other d (c, d of one group). */
  | { kind: 'pair'; a: LgRef; b: LgRef; c: LgRef; d: LgRef }
  /**
   * In ordinal category k, a comes before b — by exactly `gap` places when
   * gap > 0. `flip` only changes the wording (b is the sentence's subject).
   */
  | { kind: 'order'; a: LgRef; b: LgRef; k: number; gap: number; flip: boolean }

export interface LgShape {
  /** People (and values per category). */
  n: number
  /** Categories besides the people. */
  K: number
}

/** solution[g][p] = value index person p holds in group g; solution[0][p] = p. */
export type LgSolution = number[][]

/** Possible-value masks, `dom[(g - 1) * n + p]`. */
export type LgDomains = number[]

export const bitCount = (mask: number) => {
  let m = mask
  let c = 0
  while (m) {
    m &= m - 1
    c++
  }
  return c
}
const isSingle = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0
const lowBit = (mask: number) => 31 - Math.clz32(mask & -mask)

export function fullDomains(shape: LgShape): LgDomains {
  return Array.from({ length: shape.K * shape.n }, () => (1 << shape.n) - 1)
}

/** People who could still hold `ref`, as a mask. */
function holders(ref: LgRef, dom: LgDomains, n: number): number {
  if (ref.g === 0) return 1 << ref.v
  const base = (ref.g - 1) * n
  const bit = 1 << ref.v
  let mask = 0
  for (let p = 0; p < n; p++) if (dom[base + p]! & bit) mask |= 1 << p
  return mask
}

export function clueRefs(clue: LgClue): LgRef[] {
  switch (clue.kind) {
    case 'same':
    case 'diff':
    case 'order':
      return [clue.a, clue.b]
    case 'neither':
    case 'either':
      return [clue.a, clue.b, clue.c]
    case 'pair':
      return [clue.a, clue.b, clue.c, clue.d]
  }
}

/** Category groups a clue can mark in the grid. */
export function clueGroups(clue: LgClue): number[] {
  const groups = new Set(clueRefs(clue).map((r) => r.g))
  if (clue.kind === 'order') groups.add(clue.k)
  groups.delete(0)
  return [...groups]
}

/** Two references in one group name different values, so different people. */
function mustDiffer(a: LgRef, b: LgRef) {
  return a.g === b.g && a.v !== b.v
}

/**
 * Whether persons can be assigned to the clue's references so that it holds,
 * given what is still possible. Small enough to enumerate outright.
 */
function feasible(clue: LgClue, dom: LgDomains, n: number): boolean {
  const refs = clueRefs(clue)
  const masks = refs.map((r) => holders(r, dom, n))
  if (masks.some((m) => m === 0)) return false

  if (clue.kind === 'same') return (masks[0]! & masks[1]!) !== 0
  if (clue.kind === 'diff') return !(masks[0] === masks[1] && isSingle(masks[0]!))

  const persons: number[] = []
  const test = (): boolean => {
    const [pa, pb, pc, pd] = persons as [number, number, number, number]
    switch (clue.kind) {
      case 'neither':
        return pa !== pc && pb !== pc
      case 'either':
        return pa === pb || pa === pc
      case 'pair':
        return pa !== pb && ((pa === pc && pb === pd) || (pa === pd && pb === pc))
      case 'order': {
        if (pa === pb) return false
        const da = dom[(clue.k - 1) * n + pa]!
        const db = dom[(clue.k - 1) * n + pb]!
        for (let x = 0; x < n; x++) {
          if (!(da & (1 << x))) continue
          if (clue.gap > 0) {
            if (db & (1 << (x + clue.gap))) return true
          } else if (db >> (x + 1)) {
            return true
          }
        }
        return false
      }
      default:
        return false
    }
  }
  const walk = (i: number): boolean => {
    if (i === refs.length) return test()
    for (let p = 0; p < n; p++) {
      if (!(masks[i]! & (1 << p))) continue
      let ok = true
      for (let j = 0; j < i; j++) {
        const same = persons[j] === p
        if (same && mustDiffer(refs[i]!, refs[j]!)) ok = false
        if (!same && refs[i]!.g === refs[j]!.g && refs[i]!.v === refs[j]!.v) ok = false
      }
      if (!ok) continue
      persons[i] = p
      if (walk(i + 1)) return true
    }
    return false
  }
  return walk(0)
}

/** The domains with person p fixed to value v in group g. */
function assume(dom: LgDomains, n: number, g: number, p: number, v: number): LgDomains {
  const next = dom.slice()
  const base = (g - 1) * n
  const bit = 1 << v
  for (let q = 0; q < n; q++) next[base + q] = q === p ? bit : next[base + q]! & ~bit
  return next
}

/** One-per-row and one-per-column marks. False on a contradiction. */
function applyUniqueness(dom: LgDomains, shape: LgShape): { ok: boolean; changed: boolean } {
  const { n, K } = shape
  let changed = false
  for (let g = 1; g <= K; g++) {
    const base = (g - 1) * n
    let again = true
    while (again) {
      again = false
      for (let p = 0; p < n; p++) {
        const d = dom[base + p]!
        if (d === 0) return { ok: false, changed }
        if (!isSingle(d)) continue
        for (let q = 0; q < n; q++) {
          if (q === p || !(dom[base + q]! & d)) continue
          dom[base + q] = dom[base + q]! & ~d
          if (dom[base + q] === 0) return { ok: false, changed }
          changed = again = true
        }
      }
      for (let value = 0; value < n; value++) {
        const bit = 1 << value
        let who = -1
        let count = 0
        for (let p = 0; p < n; p++) {
          if (dom[base + p]! & bit) {
            who = p
            count++
          }
        }
        if (count === 0) return { ok: false, changed }
        if (count === 1 && dom[base + who] !== bit) {
          dom[base + who] = bit
          changed = again = true
        }
      }
    }
  }
  return { ok: true, changed }
}

export interface LgDeduction {
  ok: boolean
  /** Passes over the clue list before nothing more could be marked. */
  rounds: number
}

/**
 * Mark everything the clues force, one clue at a time, until nothing changes.
 * Mutates `dom`. `ok` is false when the clues contradict what is marked.
 */
export function propagate(dom: LgDomains, clues: readonly LgClue[], shape: LgShape): LgDeduction {
  const { n } = shape
  let rounds = 0
  for (;;) {
    const unique = applyUniqueness(dom, shape)
    if (!unique.ok) return { ok: false, rounds }
    let changed = false
    for (const clue of clues) {
      if (!feasible(clue, dom, n)) return { ok: false, rounds }
      for (const g of clueGroups(clue)) {
        const base = (g - 1) * n
        for (let p = 0; p < n; p++) {
          const d = dom[base + p]!
          if (isSingle(d)) continue
          for (let value = 0; value < n; value++) {
            if (!(d & (1 << value))) continue
            if (feasible(clue, assume(dom, n, g, p, value), n)) continue
            dom[base + p] = dom[base + p]! & ~(1 << value)
            if (dom[base + p] === 0) return { ok: false, rounds }
            changed = true
          }
        }
      }
    }
    rounds++
    if (!changed) return { ok: true, rounds }
  }
}

export const isSolved = (dom: LgDomains) => dom.every(isSingle)

export function domainsToSolution(dom: LgDomains, shape: LgShape): LgSolution {
  const { n, K } = shape
  const solution: LgSolution = [Array.from({ length: n }, (_, p) => p)]
  for (let g = 1; g <= K; g++) {
    solution.push(Array.from({ length: n }, (_, p) => lowBit(dom[(g - 1) * n + p]!)))
  }
  return solution
}

/** What a reader can fill in by deduction alone, starting from a blank grid. */
export function solveByDeduction(
  clues: readonly LgClue[],
  shape: LgShape,
): { solved: boolean; rounds: number; dom: LgDomains } {
  const dom = fullDomains(shape)
  const result = propagate(dom, clues, shape)
  return { solved: result.ok && isSolved(dom), rounds: result.rounds, dom }
}

/** Who holds `ref` in a complete solution. */
export function personOf(ref: LgRef, solution: LgSolution): number {
  return ref.g === 0 ? ref.v : solution[ref.g]!.indexOf(ref.v)
}

/**
 * Whether a clue is true of a complete solution — evaluated directly from the
 * solution, sharing no code with the deduction above.
 */
export function clueHolds(clue: LgClue, solution: LgSolution): boolean {
  const at = (ref: LgRef) => personOf(ref, solution)
  switch (clue.kind) {
    case 'same':
      return at(clue.a) === at(clue.b)
    case 'diff':
      return at(clue.a) !== at(clue.b)
    case 'neither':
      return at(clue.a) !== at(clue.c) && at(clue.b) !== at(clue.c)
    case 'either': {
      const a = at(clue.a)
      return (a === at(clue.b)) !== (a === at(clue.c))
    }
    case 'pair': {
      const [a, b, c, d] = [at(clue.a), at(clue.b), at(clue.c), at(clue.d)]
      return a !== b && ((a === c && b === d) || (a === d && b === c))
    }
    case 'order': {
      const x = solution[clue.k]![at(clue.a)]!
      const y = solution[clue.k]![at(clue.b)]!
      return clue.gap > 0 ? y - x === clue.gap : y > x
    }
  }
}

/**
 * Complete answers the clues allow, counted up to `limit`. Exhaustive: every
 * open choice is branched on, and each leaf is checked against every clue
 * directly, so a sound-but-incomplete deduction cannot hide a second answer.
 */
export function countSolutions(clues: readonly LgClue[], shape: LgShape, limit = 2): number {
  let found = 0
  const search = (dom: LgDomains) => {
    if (found >= limit) return
    if (!propagate(dom, clues, shape).ok) return
    const open = dom.findIndex((d) => !isSingle(d))
    if (open < 0) {
      if (clues.every((c) => clueHolds(c, domainsToSolution(dom, shape)))) found++
      return
    }
    const g = Math.floor(open / shape.n) + 1
    const p = open % shape.n
    for (let value = 0; value < shape.n && found < limit; value++) {
      if (dom[open]! & (1 << value)) search(assume(dom, shape.n, g, p, value))
    }
  }
  search(fullDomains(shape))
  return found
}
