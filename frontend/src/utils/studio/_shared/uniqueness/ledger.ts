/**
 * Book- and page-scoped canonical ledger (§4.3).
 *
 * On generate: hash the puzzle, and if the book already holds that hash,
 * re-derive from an incremented nonce. After `RESAMPLE_ATTEMPTS` tries, widen a
 * parameter — bump the clue count, change the rank subset, change the figure
 * count — and keep going. Only after `HARD_LIMIT` total attempts does it fail
 * loudly, which should be unreachable given the §4.5 entropy floor.
 *
 * This is what makes intra-book duplication *impossible* rather than improbable.
 */

import { canonicalHash } from './hash'

/** Retries before the generator is asked to widen a parameter. */
export const CANONICAL_RESAMPLE_ATTEMPTS = 32
/** Total attempts before giving up with a user-visible error. */
export const CANONICAL_HARD_LIMIT = 64

export class StudioUniquenessError extends Error {
  constructor(templateKey: string, attempts: number) {
    super(
      `${templateKey}: could not find an unused puzzle in ${attempts} attempts. ` +
        `Widen the settings (more clues, a different tier, more figures per page).`,
    )
    this.name = 'StudioUniquenessError'
  }
}

/** Set of canonical hashes already claimed by the current book or page. */
export class CanonicalLedger {
  private readonly claimed: Set<string>

  constructor(initial?: Iterable<string>) {
    this.claimed = new Set(initial ?? [])
  }

  has(hash: string): boolean {
    return this.claimed.has(hash)
  }

  add(hash: string): void {
    this.claimed.add(hash)
  }

  get size(): number {
    return this.claimed.size
  }

  hashes(): string[] {
    return [...this.claimed]
  }
}

export interface UniquePuzzleAttempt<T> {
  value: T
  /** Canonical serialisation from `canonical.ts`, before hashing. */
  canonicalForm: string
}

export interface UniquePuzzleResult<T> {
  value: T
  hash: string
  attempts: number
}

/**
 * Draw puzzles until one is new to the ledger, then claim it.
 *
 * `build` receives the attempt number — use it to vary the nonce — and a
 * `widen` flag that turns true once plain resampling has been exhausted.
 */
export function resolveUniquePuzzle<T>(options: {
  templateKey: string
  ledger: CanonicalLedger
  build: (attempt: number, widen: boolean) => UniquePuzzleAttempt<T>
  resampleAttempts?: number
  hardLimit?: number
}): UniquePuzzleResult<T> {
  const {
    templateKey,
    ledger,
    build,
    resampleAttempts = CANONICAL_RESAMPLE_ATTEMPTS,
    hardLimit = CANONICAL_HARD_LIMIT,
  } = options

  for (let attempt = 0; attempt < hardLimit; attempt++) {
    const { value, canonicalForm } = build(attempt, attempt >= resampleAttempts)
    const hash = canonicalHash(canonicalForm)
    if (ledger.has(hash)) continue
    ledger.add(hash)
    return { value, hash, attempts: attempt + 1 }
  }

  throw new StudioUniquenessError(templateKey, hardLimit)
}
