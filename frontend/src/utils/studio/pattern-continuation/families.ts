/**
 * Pattern *families* — the closed set of rules a solver is expected to try.
 *
 * A family fits itself to the known terms of a (possibly masked) sequence and
 * returns a predictor, or null when it does not fit. Two uses:
 *  - generation: a candidate is only shipped when every fitting family agrees
 *    on the hidden term, so the printed puzzle has exactly one defensible answer
 *  - checking: the same code path serves end blanks and interior blanks
 *
 * `minKnown` is the anti-overfit guard: a family that needs k terms to pin its
 * parameters must see at least k+1 so the fit is *verified*, not assumed. This
 * is what stops "two interleaved series" from claiming every 4-term sequence
 * (any 2 points define a straight line) and drowning out the real rule.
 */

export type MaskedSequence = readonly (number | null)[]
export type Predictor = (index: number) => number

export interface NumericFamily {
  id: string
  /** Known terms required before a fit counts as evidence, not overfitting. */
  minKnown: number
  fit(values: MaskedSequence): Predictor | null
}

export interface KnownTerm {
  index: number
  value: number
}

const TOLERANCE = 1e-6

function within(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b))
}

export function isIntegerish(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) <= TOLERANCE
}

export function knownTerms(values: MaskedSequence): KnownTerm[] {
  const out: KnownTerm[] = []
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (value != null && Number.isFinite(value)) out.push({ index, value })
  }
  return out
}

/** Index of the first run of `count` consecutive known terms, or -1. */
function consecutiveAnchor(values: MaskedSequence, count: number): number {
  let run = 0
  for (let i = 0; i < values.length; i++) {
    run = values[i] == null ? 0 : run + 1
    if (run >= count) return i - count + 1
  }
  return -1
}

/** Verify a fully reconstructed series against every known term. */
function verifyAgainstKnown(series: number[], values: MaskedSequence): Predictor | null {
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (value == null) continue
    const got = series[i]
    if (got == null || !Number.isFinite(got) || !within(got, value)) return null
  }
  return (index) => series[index] ?? Number.NaN
}

// ---------------------------------------------------------------------------
// Polynomial families: linear (+d), quadratic (squares, triangular, growing
// step), cubic (n³). Degree k needs k+2 known terms so the fit is checked.
// ---------------------------------------------------------------------------

function lagrange(basis: KnownTerm[], x: number): number {
  let sum = 0
  for (let i = 0; i < basis.length; i++) {
    let term = basis[i]!.value
    for (let j = 0; j < basis.length; j++) {
      if (i === j) continue
      term *= (x - basis[j]!.index) / (basis[i]!.index - basis[j]!.index)
    }
    sum += term
  }
  return sum
}

function polynomialFamily(degree: number): NumericFamily {
  const minKnown = degree + 2
  return {
    id: `polynomial${degree}`,
    minKnown,
    fit(values) {
      const known = knownTerms(values)
      if (known.length < minKnown) return null
      const basis = known.slice(0, degree + 1)
      for (const term of known) {
        if (!within(lagrange(basis, term.index), term.value)) return null
      }
      return (index) => lagrange(basis, index)
    },
  }
}

// ---------------------------------------------------------------------------
// Affine recurrence a(i+1) = m·a(i) + k — covers +d, ×r, ÷r and ×m+k in one
// family, so those never disagree with each other.
// ---------------------------------------------------------------------------

const affineFamily: NumericFamily = {
  id: 'affine',
  minKnown: 4,
  fit(values) {
    if (knownTerms(values).length < 4) return null
    const anchor = consecutiveAnchor(values, 3)
    if (anchor < 0) return null
    const a = values[anchor]!
    const b = values[anchor + 1]!
    const c = values[anchor + 2]!
    if (b - a === 0) return null
    const m = (c - b) / (b - a)
    const k = b - m * a
    if (!Number.isFinite(m) || !Number.isFinite(k)) return null

    const series = new Array<number>(values.length)
    series[anchor] = a
    for (let i = anchor + 1; i < values.length; i++) series[i] = m * series[i - 1]! + k
    for (let i = anchor - 1; i >= 0; i--) {
      if (m === 0) return null
      series[i] = (series[i + 1]! - k) / m
    }
    return verifyAgainstKnown(series, values)
  },
}

// ---------------------------------------------------------------------------
// Pure geometric a(i) = a₀·rⁱ. The affine family already covers ×r runs, but
// only across three *consecutive* known terms — this one still fits when the
// blank sits in the middle of a short run.
// ---------------------------------------------------------------------------

const RATIO_CANDIDATES: readonly number[] = (() => {
  const out: number[] = []
  for (let r = 2; r <= 12; r++) out.push(r, -r, 1 / r, -1 / r)
  return out
})()

const geometricFamily: NumericFamily = {
  id: 'geometric',
  minKnown: 4,
  fit(values) {
    const known = knownTerms(values)
    if (known.length < 4) return null
    const first = known[0]!
    if (first.value === 0) return null
    for (const ratio of RATIO_CANDIDATES) {
      const at = (index: number): number => first.value * ratio ** (index - first.index)
      if (known.every((term) => within(at(term.index), term.value))) return at
    }
    return null
  },
}

// ---------------------------------------------------------------------------
// Fibonacci-like a(i) = a(i-1) + a(i-2)
// ---------------------------------------------------------------------------

const fibonacciFamily: NumericFamily = {
  id: 'fibonacci',
  minKnown: 4,
  fit(values) {
    if (knownTerms(values).length < 4) return null
    const anchor = consecutiveAnchor(values, 2)
    if (anchor < 0) return null

    const series = new Array<number>(values.length)
    series[anchor] = values[anchor]!
    series[anchor + 1] = values[anchor + 1]!
    for (let i = anchor + 2; i < values.length; i++) series[i] = series[i - 1]! + series[i - 2]!
    for (let i = anchor - 1; i >= 0; i--) series[i] = series[i + 2]! - series[i + 1]!
    return verifyAgainstKnown(series, values)
  },
}

// ---------------------------------------------------------------------------
// Two interleaved arithmetic series (odd/even positions advance separately).
// Each parity needs 3 known terms, so a 4-term sequence can never "look"
// interleaved by accident.
// ---------------------------------------------------------------------------

const interleavedLinearFamily: NumericFamily = {
  id: 'interleavedLinear',
  minKnown: 6,
  fit(values) {
    if (knownTerms(values).length < 6) return null
    const series = new Array<number>(values.length)

    for (const parity of [0, 1]) {
      const known = knownTerms(values).filter((t) => t.index % 2 === parity)
      if (known.length < 3) return null
      const first = known[0]!
      const second = known[1]!
      const span = second.index - first.index
      if (span === 0) return null
      const step = (second.value - first.value) / span
      for (const term of known) {
        if (!within(first.value + (term.index - first.index) * step, term.value)) return null
      }
      for (let i = parity; i < values.length; i += 2) {
        series[i] = first.value + (i - first.index) * step
      }
    }
    return verifyAgainstKnown(series, values)
  },
}

// ---------------------------------------------------------------------------
// Alternating operations: ×m then +k, repeating (e.g. 3, 6, 9, 18, 21, 42).
// ---------------------------------------------------------------------------

function alternatingOpsFit(values: MaskedSequence, multiplyOnEven: boolean): Predictor | null {
  const anchor = consecutiveAnchor(values, 4)
  if (anchor < 0) return null
  const [a, b, c, d] = [
    values[anchor]!,
    values[anchor + 1]!,
    values[anchor + 2]!,
    values[anchor + 3]!,
  ]
  const multipliesAt = (index: number): boolean => (index % 2 === 0) === multiplyOnEven

  let m: number
  let k: number
  if (multipliesAt(anchor)) {
    if (a === 0) return null
    m = b / a
    k = c - b
  } else {
    k = b - a
    if (b === 0) return null
    m = c / b
  }
  if (!Number.isFinite(m) || !Number.isFinite(k) || m === 1 || m === 0) return null

  const step = (value: number, index: number): number =>
    multipliesAt(index) ? value * m : value + k
  if (!within(step(c, anchor + 2), d)) return null

  const series = new Array<number>(values.length)
  series[anchor] = a
  for (let i = anchor + 1; i < values.length; i++) series[i] = step(series[i - 1]!, i - 1)
  for (let i = anchor - 1; i >= 0; i--) {
    series[i] = multipliesAt(i) ? series[i + 1]! / m : series[i + 1]! - k
    if (!Number.isFinite(series[i]!)) return null
  }
  return verifyAgainstKnown(series, values)
}

const alternatingOpsFamily: NumericFamily = {
  id: 'alternatingOps',
  minKnown: 5,
  fit(values) {
    if (knownTerms(values).length < 5) return null
    return alternatingOpsFit(values, true) ?? alternatingOpsFit(values, false)
  },
}

// ---------------------------------------------------------------------------
// Multiply by a growing factor: a(i+1) = a(i) · (i + p) — 1, 2, 6, 24, 120.
// ---------------------------------------------------------------------------

const multiplyGrowingFamily: NumericFamily = {
  id: 'multiplyGrowing',
  minKnown: 4,
  fit(values) {
    if (knownTerms(values).length < 4) return null
    const anchor = consecutiveAnchor(values, 2)
    if (anchor < 0) return null
    const a = values[anchor]!
    const b = values[anchor + 1]!
    if (a === 0) return null
    const ratio = b / a
    if (!isIntegerish(ratio)) return null
    // a(i+1) = a(i) · (i + p), pinned from the ratio at the anchor step.
    const p = Math.round(ratio) - anchor
    if (p < 1) return null

    const series = new Array<number>(values.length)
    series[anchor] = a
    for (let i = anchor + 1; i < values.length; i++) {
      const factor = i - 1 + p
      if (factor < 2) return null
      series[i] = series[i - 1]! * factor
    }
    for (let i = anchor - 1; i >= 0; i--) {
      const factor = i + p
      if (factor < 2) return null
      series[i] = series[i + 1]! / factor
    }
    return verifyAgainstKnown(series, values)
  },
}

// ---------------------------------------------------------------------------
// Prime numbers — not algebraic, but instantly recognisable on a worksheet.
// ---------------------------------------------------------------------------

const PRIMES: readonly number[] = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89,
  97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181,
  191, 193, 197, 199,
]

export function primeAt(index: number): number | undefined {
  return PRIMES[index]
}

const primeFamily: NumericFamily = {
  id: 'primes',
  minKnown: 4,
  fit(values) {
    const known = knownTerms(values)
    if (known.length < 4) return null
    for (let offset = 0; offset + values.length <= PRIMES.length; offset++) {
      if (known.every((term) => PRIMES[offset + term.index] === term.value)) {
        return (index) => PRIMES[offset + index] ?? Number.NaN
      }
    }
    return null
  },
}

/** Every family a solver is assumed to consider, cheapest first. */
export const NUMERIC_FAMILIES: readonly NumericFamily[] = [
  polynomialFamily(1),
  polynomialFamily(2),
  polynomialFamily(3),
  affineFamily,
  geometricFamily,
  fibonacciFamily,
  interleavedLinearFamily,
  alternatingOpsFamily,
  multiplyGrowingFamily,
  primeFamily,
]

export interface SolveResult {
  /** Families that fit the known terms. */
  fits: string[]
  /** Value they agree on, or null when they disagree / none fit. */
  value: number | null
}

/**
 * Solve a masked sequence at `blankIndex`. `value` is non-null only when at
 * least one family fits and *all* fitting families predict the same term.
 */
export function solveMasked(values: MaskedSequence, blankIndex: number): SolveResult {
  const fits: string[] = []
  let agreed: number | null = null

  for (const family of NUMERIC_FAMILIES) {
    const predictor = family.fit(values)
    if (!predictor) continue
    const predicted = predictor(blankIndex)
    if (!Number.isFinite(predicted)) return { fits: [...fits, family.id], value: null }
    fits.push(family.id)
    if (agreed === null) {
      agreed = predicted
      continue
    }
    if (!within(predicted, agreed)) return { fits, value: null }
  }

  if (fits.length === 0 || agreed === null) return { fits, value: null }
  // Lagrange interpolation drifts a few ulps; every family here describes an
  // integer sequence, so snap when the prediction is integral within tolerance.
  return { fits, value: isIntegerish(agreed) ? Math.round(agreed) : agreed }
}

/** The sequence forces exactly one value at `blankIndex`, and it is the intended one. */
export function isForced(sequence: readonly number[], blankIndex: number): boolean {
  if (blankIndex < 0 || blankIndex >= sequence.length) return false
  const masked = sequence.map((value, index) => (index === blankIndex ? null : value))
  const { value } = solveMasked(masked, blankIndex)
  return value !== null && within(value, sequence[blankIndex]!)
}
