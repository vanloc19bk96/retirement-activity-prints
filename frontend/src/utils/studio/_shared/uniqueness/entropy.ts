/**
 * Entropy budget (§4.5) — the floor every template must clear.
 *
 * Birthday arithmetic sets the bar. Take the pessimistic case of 10,000 sellers
 * each printing 100 puzzles of one template: 10^6 draws. For a collision
 * probability under 1% the space must satisfy N > n^2 / (2 x 0.01), which is
 * about 2^45.6. Rounded up:
 *
 *   > every template offers >= 2^48 canonically-distinct puzzles per page at
 *   > its default tier.
 *
 * Per *page*, because pages carry several figures and entropy multiplies. A
 * template whose single figure reaches only 2^18 is fine at four figures a
 * page; one that cannot reach the floor on any axis does not ship.
 *
 * Templates export an analytic estimate built from these helpers, the config
 * validator refuses a setting that falls below the floor, and §9.4 checks the
 * analytic figure against a sampled birthday estimate.
 */

/** Bits of entropy a page must offer at its default tier. */
export const STUDIO_ENTROPY_FLOOR_BITS = 48

/**
 * Seller-facing copy when a config fails the entropy floor.
 *
 * Keep the maths in the comment above — the form should say what to change,
 * not quote bit budgets that round to the same number as the floor.
 */
export function entropyFloorMessage(fix: string): string {
  const tip = fix.trim()
  return tip
    ? `These settings don't create enough unique puzzles for a published book. ${tip}`
    : "These settings don't create enough unique puzzles for a published book."
}

/** log2(n!) — arrangement entropy. */
export function log2Factorial(n: number): number {
  let total = 0
  for (let i = 2; i <= n; i++) total += Math.log2(i)
  return total
}

/** log2(C(n, k)) — choice entropy. */
export function log2Choose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  const kk = Math.min(k, n - k)
  let total = 0
  for (let i = 0; i < kk; i++) total += Math.log2((n - i) / (i + 1))
  return total
}

/** log2(n^k) — independent repeated choices. */
export function log2Pow(base: number, exponent: number): number {
  return base <= 0 ? -Infinity : exponent * Math.log2(base)
}

/**
 * Combine per-figure entropy across a page.
 *
 * Figures on one page are drawn from the same space *without* replacement, so
 * the honest count is C(N, figures) rather than N^figures. At the scale these
 * spaces run that is within a couple of bits of the naive product, but the
 * discount is real and this file exists to avoid flattering the numbers.
 */
export function combineFigureEntropyBits(perFigureBits: number, figures: number): number {
  if (figures <= 1) return perFigureBits
  let total = 0
  for (let i = 0; i < figures; i++) {
    total += perFigureBits - Math.log2(i + 1)
  }
  return total
}

/**
 * Birthday estimator for a sampled corpus: N ≈ n^2 / (2 * collisions).
 * Returns Infinity when the sample produced no collisions at all.
 */
export function birthdayEstimateBits(sampleSize: number, collisions: number): number {
  if (collisions <= 0) return Infinity
  return Math.log2((sampleSize * sampleSize) / (2 * collisions))
}

export interface EntropyReport {
  /** Template registry key. */
  templateKey: string
  /** Human-readable tier / mode this figure was measured at. */
  variant: string
  perFigureBits: number
  figuresPerPage: number
  pageBits: number
  clearsFloor: boolean
}

export function entropyReport(options: {
  templateKey: string
  variant: string
  perFigureBits: number
  figuresPerPage: number
}): EntropyReport {
  const pageBits = combineFigureEntropyBits(
    options.perFigureBits,
    options.figuresPerPage,
  )
  return {
    ...options,
    pageBits,
    clearsFloor: pageBits >= STUDIO_ENTROPY_FLOOR_BITS,
  }
}
