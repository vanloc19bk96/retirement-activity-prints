import type { StudioRng } from '../studio-rng'
import type { MagicNumberSet, MagicOrder, MagicValuedSquare } from './types'
import {
  buildBaseSquare,
  applyRandomSymmetry,
  bankLayers,
  parametricLayerGrids,
  supportsBank,
} from './construct'
import {
  allValuesDistinct,
  isMagicUnder,
  lineTotal,
  magicConstant,
  magicProduct,
} from './grid'
import {
  pickMultiplySpecForVariety,
  supportsMultiply,
} from './multiply-pool'

export {
  MULTIPLY_ORDERS,
  multiplySpecProduct,
  pickMultiplySpecForVariety,
  supportsMultiply,
} from './multiply-pool'

/** Orders a free-value bank can be built on — 6×6 has no orthogonal layer pair. */
export function supportsMixed(order: MagicOrder): boolean {
  return supportsBank(order)
}

/**
 * The number bank every square on one page draws from. Rolled once per page so
 * a single printed instruction describes every square on it.
 */
export type MagicMapping =
  | {
      kind: 'affine'
      operation: 'add'
      /** value = start + (rank − 1) · step, over ranks 1…n². */
      start: number
      step: number
      bankSentence: string
    }
  | {
      kind: 'bank'
      operation: 'add'
      /** value = start + high[A] + low[B] over the two symbol layers. */
      start: number
      high: number[]
      low: number[]
      bankSentence: string
    }
  | {
      kind: 'multiply'
      operation: 'multiply'
      primes: readonly [number, number]
      /** Whole-square scale factor — multiplies the line product by scale³. */
      scale: number
      bankSentence: string
    }

/** Wider strides at small orders — a 7×7 counting by 5s would run past 3 digits. */
function stepRange(order: MagicOrder): [number, number] {
  if (order <= 4) return [2, 5]
  if (order === 5) return [2, 4]
  return [2, 3]
}

type AffineMapping = Extract<MagicMapping, { kind: 'affine' }>

function affine(order: MagicOrder, start: number, step: number): AffineMapping {
  const cells = order * order
  const end = start + (cells - 1) * step
  return {
    kind: 'affine',
    operation: 'add',
    start,
    step,
    bankSentence:
      step === 1
        ? `each number from ${start} to ${end}`
        : `each number from ${start} to ${end}, counting by ${step}s`,
  }
}

type BankMapping = Extract<MagicMapping, { kind: 'bank' }>

/** Names the bank outright at the small orders; past 4×4 the list is unreadable. */
function bankSentenceFor(order: MagicOrder, values: number[]): string {
  if (order > 4) return 'each number in the square'
  return `each of ${[...values].sort((x, y) => x - y).join(', ')}`
}

function bankMapping(order: MagicOrder, start: number, high: number[], low: number[]): BankMapping {
  const values = high.flatMap((h) => low.map((l) => start + h + l))
  return {
    kind: 'bank',
    operation: 'add',
    start,
    high,
    low,
    bankSentence: bankSentenceFor(order, values),
  }
}

/**
 * A 3×3 bank. One diagonal of each Lo Shu layer repeats a single symbol, so
 * both banks must be arithmetic for that diagonal to still hit the constant —
 * `high = [0, b, 2b]`, `low = [0, c, 2c]`. The pair (b, c) is still free, which
 * is the whole point: it makes every value a free choice and the constant 3·a
 * rather than the fixed 15 a 1…9 square is stuck with.
 *
 * Rejects the degenerate (b, c) that would repeat a value: b = c collapses the
 * b−c corner, and b = 2c (or c = 2b) collides b−c with the opposite layer step.
 */
function rollBank3(rng: StudioRng): BankMapping {
  let b = 3
  let c = 1
  for (let attempt = 0; attempt < 40; attempt++) {
    const nb = rng.int(1, 15)
    const nc = rng.int(1, 15)
    if (nb === nc || nb === 2 * nc || nc === 2 * nb) continue
    b = nb
    c = nc
    break
  }
  // Ceiling is start + 2b + 2c = 84 — two digits, so the cells stay readable.
  return bankMapping(3, rng.int(1, 24), [0, b, 2 * b], [0, c, 2 * c])
}

/**
 * A bank for order 4, 5 or 7. `low` spans 0…spread; every `high` gap is wider
 * than that spread, so the n bands `[high_i, high_i + spread]` are disjoint and
 * all n² sums are distinct by construction — no rejection sampling needed.
 */
function rollBankN(order: MagicOrder, rng: StudioRng): BankMapping {
  const spread = rng.int(order, 2 * order)
  const inner = rng.sample(
    Array.from({ length: spread - 1 }, (_, k) => k + 1),
    order - 2,
  )
  const low = [0, ...inner, spread].sort((x, y) => x - y)

  const jitter = Math.max(2, Math.round(spread / 2))
  const high = [0]
  for (let k = 1; k < order; k++) {
    high.push(high[k - 1]! + spread + rng.int(1, jitter))
  }
  return bankMapping(order, rng.int(1, 9), high, low)
}

function rollBank(order: MagicOrder, rng: StudioRng): BankMapping {
  return order === 3 ? rollBank3(rng) : rollBankN(order, rng)
}

export function rollMapping(
  order: MagicOrder,
  numberSet: MagicNumberSet,
  rng: StudioRng,
  options?: { avoidConstantsNewestFirst?: readonly number[] },
): MagicMapping {
  if (numberSet === 'multiply' && supportsMultiply(order)) {
    const spec = pickMultiplySpecForVariety(rng, options?.avoidConstantsNewestFirst ?? [])
    return {
      kind: 'multiply',
      operation: 'multiply',
      primes: spec.primes,
      scale: spec.scale,
      bankSentence: 'each number',
    }
  }
  if (numberSet === 'mixed' && supportsMixed(order)) return rollBank(order, rng)
  if (numberSet === 'shifted') return affine(order, rng.int(2, 30), 1)
  if (numberSet === 'step') {
    const [minStep, maxStep] = stepRange(order)
    return affine(order, rng.int(1, 9), rng.int(minStep, maxStep))
  }
  return affine(order, 1, 1)
}

function affineSquare(
  order: MagicOrder,
  mapping: AffineMapping,
  rng: StudioRng,
): MagicValuedSquare {
  const base = buildBaseSquare(order, rng)
  const grid = base.map((row) =>
    row.map((rank) => mapping.start + (rank - 1) * mapping.step),
  )
  return {
    operation: 'add',
    grid,
    constant: magicConstant(grid, order),
    bankSentence: mapping.bankSentence,
  }
}

/**
 * `start + high[A] + low[B]` over a diagonal-Latin layer pair. Every line
 * carries each `high` value once and each `low` value once, so every line
 * totals `n·start + Σhigh + Σlow` — a constant the caller chose, not the
 * n(n²+1)/2 a consecutive square is pinned to.
 */
function bankSquare(
  order: MagicOrder,
  mapping: BankMapping,
  rng: StudioRng,
): MagicValuedSquare | null {
  const layers = bankLayers(order, rng)
  if (!layers) return null
  const raw = layers.high.map((row, i) =>
    row.map((high, j) => mapping.start + mapping.high[high]! + mapping.low[layers.low[i]![j]!]!),
  )
  // Dihedral only — complementing is defined against 1…n², which this is not.
  const grid = applyRandomSymmetry(raw, rng, { allowComplement: false })
  return {
    operation: 'add',
    grid,
    constant: magicConstant(grid, order),
    bankSentence: mapping.bankSentence,
  }
}

/**
 * k · p^A · q^B over the two orthogonal layers of a parametric square. Every
 * line carries each layer digit 0…n−1 once, so every line multiplies to
 * (k·p·q)^(n(n−1)/2), and coprimality of p and q keeps all n² values distinct.
 */
function multiplicativeSquare(
  order: MagicOrder,
  primes: readonly [number, number],
  scale: number,
  rng: StudioRng,
): MagicValuedSquare | null {
  const layers = parametricLayerGrids(order, rng)
  if (!layers) return null
  const [p, q] = primes
  const raw = layers.high.map((row, i) =>
    row.map((high, j) => scale * p ** high * q ** layers.low[i]![j]!),
  )
  // Dihedral only — complementing would break the layer structure above.
  const grid = applyRandomSymmetry(raw, rng, { allowComplement: false })
  return {
    operation: 'multiply',
    grid,
    constant: magicProduct(grid),
    bankSentence: 'each number',
  }
}

function isSound(square: MagicValuedSquare, order: MagicOrder): boolean {
  return (
    allValuesDistinct(square.grid) &&
    isMagicUnder(square.grid, order, square.operation) &&
    lineTotal(square.grid[0]!, square.operation) === square.constant
  )
}

/**
 * A verified square carrying the printed values for `mapping`. Falls back to the
 * plain 1…n² set if a variant cannot be built, so generate() never fails on a
 * config the form let through.
 */
export function buildValuedSquare(
  order: MagicOrder,
  mapping: MagicMapping,
  rng: StudioRng,
): MagicValuedSquare {
  if (mapping.kind === 'multiply') {
    const square = multiplicativeSquare(order, mapping.primes, mapping.scale, rng)
    if (square && isSound(square, order)) return square
    return affineSquare(order, affine(order, 1, 1), rng)
  }
  if (mapping.kind === 'bank') {
    // Retry rather than fall back on the first miss: the layer pair is redrawn
    // each attempt, and only a genuinely bank-less order gives up every time.
    for (let attempt = 0; attempt < 8; attempt++) {
      const square = bankSquare(order, mapping, rng)
      if (square && isSound(square, order)) return square
    }
    return affineSquare(order, affine(order, 1, 1), rng)
  }
  const square = affineSquare(order, mapping, rng)
  return isSound(square, order) ? square : affineSquare(order, affine(order, 1, 1), rng)
}
