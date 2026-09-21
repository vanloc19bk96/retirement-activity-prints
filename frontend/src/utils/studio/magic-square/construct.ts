import type { StudioRng } from '../studio-rng'
import type { MagicOrder } from './types'
import {
  cloneSquare,
  isMagic,
  isPermutationOfRange,
  normalConstant,
} from './grid'

export const MAGIC_ORDERS: readonly MagicOrder[] = [3, 4, 5, 6, 7]

/**
 * Node ceiling for the order-4 randomized search. Measured: a solution needs
 * ~43k nodes on average and never exceeded ~250k over 60 seeds, so the budget
 * only fires on pathological orderings — where we fall back to the fixed
 * doubly-even construction rather than block the generate thread.
 */
const SEARCH_NODE_BUDGET = 400_000

/* ------------------------------------------------------------------ *
 * Classic fixed constructions — kept as guaranteed fallbacks.
 * ------------------------------------------------------------------ */

/** De la Loubère / Siamese method — odd orders only. */
export function siameseOddSquare(n: number): number[][] {
  const sq = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  let r = 0
  let c = Math.floor(n / 2)
  for (let v = 1; v <= n * n; v++) {
    sq[r]![c] = v
    const nextR = (r - 1 + n) % n
    const nextC = (c + 1) % n
    if (sq[nextR]![nextC] !== 0) {
      r = (r + 1) % n
    } else {
      r = nextR
      c = nextC
    }
  }
  return sq
}

/** Doubly-even (n divisible by 4): fill 1…n² then complement diagonal cells. */
export function doublyEvenSquare(n: number): number[][] {
  const sq = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  let v = 1
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) sq[r]![c] = v++
  }
  const complement = n * n + 1
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const rm = r % 4
      const cm = c % 4
      if (rm === cm || rm + cm === 3) {
        sq[r]![c] = complement - sq[r]![c]!
      }
    }
  }
  return sq
}

/* ------------------------------------------------------------------ *
 * Odd orders — parametric Graeco-Latin family.
 *
 * A square is built from two layers A and B with
 *   A[i][j] = (a·i + b·j + c) mod n
 * and M = n·A + B + 1. Each layer must itself be line-constant; the pair must
 * be orthogonal for M to hit every value once. Rather than reason about the
 * gcd conditions we enumerate the (a,b,c) triples whose lines verify, then
 * pair them and verify the combined square. That yields 8 squares at n=3
 * (the mathematical maximum for a normal 3×3), 1472 at n=5 and 25272 at n=7,
 * against the single square the Siamese method can produce.
 * ------------------------------------------------------------------ */

export interface MagicLayer {
  a: number
  b: number
  c: number
}

const layerCache = new Map<number, MagicLayer[]>()

function buildLayer(n: number, { a, b, c }: MagicLayer): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (((a * i + b * j + c) % n) + n) % n),
  )
}

/** Layer lines all sum to n(n−1)/2 — the precondition for a magic combination. */
function layerIsBalanced(n: number, spec: MagicLayer): boolean {
  const layer = buildLayer(n, spec)
  const want = (n * (n - 1)) / 2
  let diag = 0
  let anti = 0
  for (let i = 0; i < n; i++) {
    let row = 0
    let col = 0
    for (let j = 0; j < n; j++) {
      row += layer[i]![j]!
      col += layer[j]![i]!
    }
    if (row !== want || col !== want) return false
    diag += layer[i]![i]!
    anti += layer[i]![n - 1 - i]!
  }
  return diag === want && anti === want
}

/** Balanced (a,b,c) layers for order n. Memoised — the scan is O(n³). */
export function magicLayers(n: number): MagicLayer[] {
  const cached = layerCache.get(n)
  if (cached) return cached
  const layers: MagicLayer[] = []
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        const spec = { a, b, c }
        if (layerIsBalanced(n, spec)) layers.push(spec)
      }
    }
  }
  layerCache.set(n, layers)
  return layers
}

function combineLayers(n: number, high: MagicLayer, low: MagicLayer): number[][] {
  const a = buildLayer(n, high)
  const b = buildLayer(n, low)
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => n * a[i]![j]! + b[i]![j]! + 1),
  )
}

/** A random orthogonal layer pair, or null when the order has no such family. */
export function pickLayerPair(
  n: number,
  rng: StudioRng,
): { high: MagicLayer; low: MagicLayer } | null {
  const layers = magicLayers(n)
  if (layers.length < 2) return null
  for (let attempt = 0; attempt < 64; attempt++) {
    const high = rng.pick(layers)
    const low = rng.pick(layers)
    const sq = combineLayers(n, high, low)
    if (isPermutationOfRange(sq, n) && isMagic(sq, n)) return { high, low }
  }
  return null
}

export function parametricOddSquare(n: number, rng: StudioRng): number[][] | null {
  const pair = pickLayerPair(n, rng)
  return pair ? combineLayers(n, pair.high, pair.low) : null
}

/** The two 0…n−1 layers behind a parametric square — the multiplicative mode needs them. */
export function parametricLayerGrids(
  n: number,
  rng: StudioRng,
): { high: number[][]; low: number[][] } | null {
  const pair = pickLayerPair(n, rng)
  if (!pair) return null
  return { high: buildLayer(n, pair.high), low: buildLayer(n, pair.low) }
}

/* ------------------------------------------------------------------ *
 * Diagonal-Latin layers — the basis for arbitrary (non-consecutive) banks.
 *
 * `magicLayers` above only asks each line to *sum* to n(n−1)/2, which is all a
 * consecutive 1…n² square needs: the ranks are an arithmetic run, so a line
 * carrying symbols {1,1,1} totals the same as one carrying {0,1,2}.
 *
 * A bank of freely chosen values needs the stronger property — every row,
 * column and both diagonals must carry each symbol 0…n−1 exactly *once*. Then
 * a line totals Σhigh + Σlow whatever the values are, and the magic constant
 * stops being pinned to n(n²+1)/2.
 *
 * Coverage follows the orthogonal-diagonal-Latin-square existence result:
 *  n = 3 — no diagonal Latin square exists at all (see `rankLayers`, which
 *          returns the weaker Lo Shu layers; order 3 pays for that by
 *          accepting only arithmetic banks).
 *  n = 4 — GF(4): L_a[i][j] = a⊗i ⊕ j is diagonal Latin for a ∉ {0,1}, and
 *          L_2 ⊥ L_3.
 *  n odd — a·i + b·j + c with a, b, a+b, a−b all coprime to n.
 *  n = 6 — none: no orthogonal pair exists (Euler's 36 officers). Excluded.
 * ------------------------------------------------------------------ */

/** Symbol layers a value bank is laid over: `value = start + high[A] + low[B]`. */
export interface BankLayers {
  high: number[][]
  low: number[][]
}

/** Orders a free-value bank can be built on — everything but singly-even 6. */
export const BANK_ORDERS: readonly MagicOrder[] = [3, 4, 5, 7]

export function supportsBank(order: MagicOrder): boolean {
  return BANK_ORDERS.includes(order)
}

function coprime(a: number, n: number): boolean {
  let x = ((a % n) + n) % n
  let y = n
  while (x !== 0) {
    const t = y % x
    y = x
    x = t
  }
  return y === 1
}

const diagonalSpecCache = new Map<number, MagicLayer[]>()

/** Odd-order layers whose rows, columns *and* diagonals are each a permutation. */
export function diagonalLatinSpecs(n: number): MagicLayer[] {
  const cached = diagonalSpecCache.get(n)
  if (cached) return cached
  const specs: MagicLayer[] = []
  if (n % 2 === 1) {
    for (let a = 1; a < n; a++) {
      for (let b = 1; b < n; b++) {
        if (!coprime(a, n) || !coprime(b, n)) continue
        if (!coprime(a + b, n) || !coprime(a - b, n)) continue
        for (let c = 0; c < n; c++) specs.push({ a, b, c })
      }
    }
  }
  diagonalSpecCache.set(n, specs)
  return specs
}

/** GF(4) multiplication over {0, 1, ω, ω+1} encoded as 0…3 (addition is XOR). */
const GF4_MUL: readonly (readonly number[])[] = [
  [0, 0, 0, 0],
  [0, 1, 2, 3],
  [0, 2, 3, 1],
  [0, 3, 1, 2],
]

function gf4Layer(a: number): number[][] {
  return Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => GF4_MUL[a]![i]! ^ j),
  )
}

/** Splits a 1…n² square back into its rank layers — `value − 1 = n·high + low`. */
function rankLayers(sq: number[][], n: number): BankLayers {
  return {
    high: sq.map((row) => row.map((v) => Math.floor((v - 1) / n))),
    low: sq.map((row) => row.map((v) => (v - 1) % n)),
  }
}

function relabel(grid: number[][], perm: readonly number[]): number[][] {
  return grid.map((row) => row.map((v) => perm[v]!))
}

function pickDiagonalPair(
  n: number,
  rng: StudioRng,
): { high: MagicLayer; low: MagicLayer } | null {
  const specs = diagonalLatinSpecs(n)
  if (specs.length < 2) return null
  for (let attempt = 0; attempt < 64; attempt++) {
    const high = rng.pick(specs)
    const low = rng.pick(specs)
    // Orthogonality is what makes the n² (high, low) symbol pairs distinct;
    // checking the combined square covers 1…n² is the cheapest way to see it.
    if (isPermutationOfRange(combineLayers(n, high, low), n)) return { high, low }
  }
  return null
}

/**
 * A layer pair a free-value bank can sit on, or null when the order has none.
 * Symbols are relabelled at random from order 4 up; order 3 must keep its
 * natural labelling because one diagonal of each Lo Shu layer is a single
 * repeated symbol, which only an arithmetic bank can absorb.
 */
export function bankLayers(n: number, rng: StudioRng): BankLayers | null {
  if (n === 3) return rankLayers(buildBaseSquare(3, rng), 3)
  const identity = Array.from({ length: n }, (_, k) => k)
  const dress = (layers: BankLayers): BankLayers => ({
    high: relabel(layers.high, rng.shuffle(identity)),
    low: relabel(layers.low, rng.shuffle(identity)),
  })
  if (n === 4) {
    const [a, b] = rng.chance(0.5) ? [2, 3] : [3, 2]
    return dress({ high: gf4Layer(a), low: gf4Layer(b) })
  }
  if (n % 2 === 1) {
    const pair = pickDiagonalPair(n, rng)
    if (!pair) return null
    return dress({ high: buildLayer(n, pair.high), low: buildLayer(n, pair.low) })
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Order 4 — randomized backtracking over all 7040 normal 4×4 squares.
 * ------------------------------------------------------------------ */

/**
 * Fills 1…n² by randomized backtracking with line-sum bounds pruning and
 * forced-cell propagation. Practical for n = 4 only; larger orders blow the
 * budget, which is why they use the algebraic constructions above.
 */
export function searchMagicSquare(
  n: number,
  rng: StudioRng,
  nodeBudget = SEARCH_NODE_BUDGET,
): number[][] | null {
  const size = n * n
  const constant = normalConstant(n)
  const grid = new Int32Array(size)
  const used = new Uint8Array(size + 1)
  // One shuffled priority order for the whole search — reshuffling per node is
  // both slower and no more varied.
  const valueOrder = rng.shuffle(Array.from({ length: size }, (_, k) => k + 1))
  let nodes = 0

  const lines: number[][] = []
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c))
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c))
  lines.push(Array.from({ length: n }, (_, i) => i * n + i))
  lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)))

  const linesThrough: number[][] = Array.from({ length: size }, () => [])
  lines.forEach((line, index) => {
    for (const cell of line) linesThrough[cell]!.push(index)
  })

  /** Smallest and largest total `k` still-unused values can contribute. */
  function reachable(k: number): [number, number] {
    let low = 0
    let high = 0
    let taken = 0
    for (let v = 1; v <= size && taken < k; v++) {
      if (!used[v]) {
        low += v
        taken++
      }
    }
    taken = 0
    for (let v = size; v >= 1 && taken < k; v--) {
      if (!used[v]) {
        high += v
        taken++
      }
    }
    return [low, high]
  }

  function lineState(index: number): { sum: number; empty: number } {
    let sum = 0
    let empty = 0
    for (const cell of lines[index]!) {
      const v = grid[cell]!
      if (v === 0) empty++
      else sum += v
    }
    return { sum, empty }
  }

  function stillReachable(cell: number): boolean {
    for (const index of linesThrough[cell]!) {
      const { sum, empty } = lineState(index)
      if (empty === 0) {
        if (sum !== constant) return false
      } else {
        const [low, high] = reachable(empty)
        if (sum + low > constant || sum + high < constant) return false
      }
    }
    return true
  }

  /** When a line has this cell as its only gap the value is determined. */
  function forcedValue(cell: number): number | null {
    for (const index of linesThrough[cell]!) {
      const { sum, empty } = lineState(index)
      if (empty === 1) return constant - sum
    }
    return null
  }

  function fill(cell: number, value: number): boolean {
    grid[cell] = value
    used[value] = 1
    if (stillReachable(cell) && place(cell + 1)) return true
    used[value] = 0
    grid[cell] = 0
    return false
  }

  function place(cell: number): boolean {
    if (nodes++ > nodeBudget) return false
    if (cell === size) return true
    const forced = forcedValue(cell)
    if (forced !== null) {
      if (forced < 1 || forced > size || used[forced]) return false
      return fill(cell, forced)
    }
    for (const value of valueOrder) {
      if (used[value]) continue
      if (fill(cell, value)) return true
      if (nodes > nodeBudget) return false
    }
    return false
  }

  if (!place(0)) return null
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => grid[r * n + c]!),
  )
}

/* ------------------------------------------------------------------ *
 * Singly-even orders (n ≡ 2 mod 4) — Conway's LUX method.
 * ------------------------------------------------------------------ */

/** Offsets 1…4 inside a 2×2 block, per LUX letter. */
const LUX_BLOCKS: Record<'L' | 'U' | 'X', [number, number, number, number]> = {
  //          top-left, top-right, bottom-left, bottom-right
  L: [4, 1, 2, 3],
  U: [1, 4, 2, 3],
  X: [1, 4, 3, 2],
}

function luxLetters(k: number, m: number): ('L' | 'U' | 'X')[][] {
  const letters: ('L' | 'U' | 'X')[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, () => (i <= m ? 'L' : i === m + 1 ? 'U' : 'X')),
  )
  // Conway's swap: the centre L of the last L-row trades places with the U below it.
  letters[m]![m] = 'U'
  letters[m + 1]![m] = 'L'
  return letters
}

export function luxSinglyEvenSquare(n: number, rng: StudioRng): number[][] | null {
  if (n % 4 !== 2 || n < 6) return null
  const m = (n - 2) / 4
  const k = 2 * m + 1
  const seed = parametricOddSquare(k, rng) ?? siameseOddSquare(k)
  const inner = applyRandomSymmetry(seed, rng, { allowComplement: false })
  const letters = luxLetters(k, m)

  const sq = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const base = 4 * (inner[i]![j]! - 1)
      const [tl, tr, bl, br] = LUX_BLOCKS[letters[i]![j]!]
      sq[2 * i]![2 * j] = base + tl
      sq[2 * i]![2 * j + 1] = base + tr
      sq[2 * i + 1]![2 * j] = base + bl
      sq[2 * i + 1]![2 * j + 1] = base + br
    }
  }
  return sq
}

/* ------------------------------------------------------------------ *
 * Symmetry — free variety on top of whatever construction produced the square.
 * ------------------------------------------------------------------ */

function rotate90(sq: number[][]): number[][] {
  const n = sq.length
  const out = Array.from({ length: n }, () => Array.from({ length: n }, () => 0))
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) out[c]![n - 1 - r] = sq[r]![c]!
  }
  return out
}

function reflectHorizontal(sq: number[][]): number[][] {
  return sq.map((row) => [...row].reverse())
}

/**
 * Dihedral variety: rotate 0–270°, optional horizontal reflect, optional
 * complement (v → n²+1−v, which keeps every line sum). Complement is opt-out
 * because it scrambles the layer structure the multiplicative mode relies on.
 */
export function applyRandomSymmetry(
  sq: number[][],
  rng: StudioRng,
  options?: { allowComplement?: boolean },
): number[][] {
  const n = sq.length
  let out = cloneSquare(sq)
  const turns = rng.int(0, 3)
  for (let i = 0; i < turns; i++) out = rotate90(out)
  if (rng.chance(0.5)) out = reflectHorizontal(out)
  if (options?.allowComplement !== false && rng.chance(0.5)) {
    const complement = n * n + 1
    out = out.map((row) => row.map((v) => complement - v))
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Entry point.
 * ------------------------------------------------------------------ */

function candidateSquares(n: number, rng: StudioRng): (number[][] | null)[] {
  if (n % 2 === 1) return [parametricOddSquare(n, rng), siameseOddSquare(n)]
  if (n % 4 === 0) return [searchMagicSquare(n, rng), doublyEvenSquare(n)]
  return [luxSinglyEvenSquare(n, rng)]
}

/**
 * A verified normal magic square of order n, randomised across the widest
 * family we can construct for that order. Every candidate is checked before it
 * is returned, so a construction bug can never reach the page.
 */
export function buildBaseSquare(n: number, rng: StudioRng): number[][] {
  for (const candidate of candidateSquares(n, rng)) {
    if (!candidate) continue
    if (!isPermutationOfRange(candidate, n) || !isMagic(candidate, n)) continue
    return applyRandomSymmetry(candidate, rng)
  }
  throw new Error(`Unsupported magic-square order: ${n}`)
}

/**
 * Back-compat entry point: a normal square shifted by a flat `offset`.
 * Prefer `buildValuedSquare` — it also covers stepped and multiplicative sets.
 */
export function buildMagicSquare(
  n: number,
  offset: number,
  rng: StudioRng,
): number[][] {
  const sq = buildBaseSquare(n, rng)
  return offset === 0 ? sq : sq.map((row) => row.map((v) => v + offset))
}
