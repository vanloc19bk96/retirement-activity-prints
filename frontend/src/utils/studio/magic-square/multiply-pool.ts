import type { StudioRng } from '../studio-rng'
import type { MagicOrder } from './types'

/** Largest cell a printed square may carry — past this the digits crowd the grid. */
const MAX_CELL = 999

/**
 * Cube-root cap on the line product (scale·p·q)³. 46 keeps the banner at five
 * digits (≤ 91_125) — still hand-dividable for adult puzzle books, while the
 * old root-21 pool only offered eight products (KDP collision risk at scale).
 */
const MAX_PRODUCT_ROOT = 46

export type MultiplySpec = {
  primes: readonly [number, number]
  scale: number
}

/** Orders that can carry a multiplicative square (it needs the parametric layers). */
export const MULTIPLY_ORDERS: readonly MagicOrder[] = [3]

export function supportsMultiply(order: MagicOrder): boolean {
  return MULTIPLY_ORDERS.includes(order)
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Largest whole-square scale that keeps both the cells and the target printable. */
function maxScale(p: number, q: number): number {
  const cellCap = p * p * q * q
  if (cellCap > MAX_CELL) return 0
  return Math.min(Math.floor(MAX_CELL / cellCap), Math.floor(MAX_PRODUCT_ROOT / (p * q)))
}

/**
 * Every printable (p, q, scale) for a 3×3 product square. Coprime bases keep
 * p^a·q^b injective over exponents 0…2; both orientations (p,q) and (q,p) are
 * kept so the same product still yields distinct cell banks.
 */
function buildMultiplySpecs(): readonly MultiplySpec[] {
  const specs: MultiplySpec[] = []
  for (let p = 2; p <= MAX_PRODUCT_ROOT; p++) {
    for (let q = p + 1; q <= MAX_PRODUCT_ROOT; q++) {
      if (gcd(p, q) !== 1) continue
      const ceiling = maxScale(p, q)
      if (ceiling < 1) continue
      for (let scale = 1; scale <= ceiling; scale++) {
        specs.push({ primes: [p, q], scale })
        specs.push({ primes: [q, p], scale })
      }
    }
  }
  return specs
}

const MULTIPLY_SPECS: readonly MultiplySpec[] = buildMultiplySpecs()

/** Line product for a 3×3 multiplicative spec — (scale·p·q)³. */
export function multiplySpecProduct(spec: MultiplySpec): number {
  return (spec.scale * spec.primes[0] * spec.primes[1]) ** 3
}

/**
 * Prefer a product the book has not printed recently. When every product has
 * already appeared (bulk qty past the pool), fall back to the oldest avoided
 * one so the sheet cycles instead of clustering on a few favourites.
 *
 * `avoidNewestFirst` matches `studioAvoidList` order (newest first).
 */
export function pickMultiplySpecForVariety(
  rng: StudioRng,
  avoidNewestFirst: readonly number[],
): MultiplySpec {
  const avoidSet = new Set(avoidNewestFirst)
  const fresh = MULTIPLY_SPECS.filter((spec) => !avoidSet.has(multiplySpecProduct(spec)))
  if (fresh.length > 0) return rng.pick(fresh)

  const byProduct = new Map<number, MultiplySpec[]>()
  for (const spec of MULTIPLY_SPECS) {
    const product = multiplySpecProduct(spec)
    const bucket = byProduct.get(product)
    if (bucket) bucket.push(spec)
    else byProduct.set(product, [spec])
  }

  for (let i = avoidNewestFirst.length - 1; i >= 0; i--) {
    const specs = byProduct.get(avoidNewestFirst[i]!)
    if (specs?.length) return rng.pick(specs)
  }
  return rng.pick(MULTIPLY_SPECS)
}
