import { allocateStudioSeed } from '@/constants/studio.constants'
import type { StudioPageOutput } from '@/types/studio-template.types'
import {
  hashStudioFingerprint,
  pagesContentFingerprint,
} from './studio-content-fingerprint'

/** Retries per sheet when bulk content collides (same fingerprint, new seed). */
export const STUDIO_UNIQUE_CONTENT_ATTEMPTS = 32

/**
 * Retries for sheets whose content comes from the AI endpoint.
 *
 * Every attempt is a paid model call against a per-user, per-minute quota. A
 * genuine collision is rare and usually clears on the second draw; 32 tries
 * would burn the quota for the rest of the book to save one sheet.
 */
export const STUDIO_UNIQUE_CONTENT_REMOTE_ATTEMPTS = 4

/** The first failed page's message, when a build drew an apology instead of a puzzle. */
export function studioBuildFailure(outputs: readonly StudioPageOutput[]): string | null {
  for (const out of outputs) {
    if (out.buildFailed) return out.buildFailed
  }
  return null
}

export type ClaimUniqueStudioOutputsResult =
  | {
      ok: true
      seed: number
      outputs: StudioPageOutput[]
      fingerprint: string
      /** True when every attempt collided and a repeat was accepted anyway. */
      duplicate: boolean
    }
  | { ok: false; reason: 'aborted' | 'error' | 'exhausted' }
  /** Every draw came back as an error page; `message` is the last one's. */
  | { ok: false; reason: 'failed'; message: string }

/**
 * Allocate a fresh seed, build pages, and claim the fingerprint when unique.
 * When `usedFingerprints` is omitted, accepts the first successful build.
 * A build that comes back as an error page (`buildFailed`) is a bad draw, not a
 * result: it is redrawn on a new seed, with or without a fingerprint set, and
 * never claimed — an apology page must not land in a book.
 * After max unique attempts still collide, keep the last sheet so book/bulk
 * quantity is honored instead of skipping the game — but flag it `duplicate`
 * so the caller can tell the seller which pages still repeat.
 */
export async function claimUniqueStudioOutputs(options: {
  usedSeeds?: Set<number>
  usedFingerprints?: Set<string>
  /** Isolates uniqueness per template so mixed books do not cross-collide. */
  namespace?: string
  maxAttempts?: number
  /**
   * Error-page draws tolerated before giving up, when lower than
   * `maxAttempts`. A failure that survives a couple of fresh draws is usually
   * the settings (a level too big for the trim), not the luck of the seed.
   */
  maxFailedAttempts?: number
  isAborted?: () => boolean
  build: (seed: number) => Promise<StudioPageOutput[] | 'aborted' | 'error'>
}): Promise<ClaimUniqueStudioOutputsResult> {
  const {
    usedSeeds,
    usedFingerprints,
    namespace,
    isAborted,
    build,
  } = options
  const maxAttempts = options.maxAttempts ?? STUDIO_UNIQUE_CONTENT_ATTEMPTS
  const prefix = namespace ? `${namespace}:` : ''

  let lastOk: { seed: number; outputs: StudioPageOutput[]; fingerprint: string } | null =
    null
  let lastFailure: string | null = null
  let failedAttempts = 0
  const maxFailedAttempts = options.maxFailedAttempts ?? maxAttempts

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isAborted?.()) return { ok: false, reason: 'aborted' }

    const seed = allocateStudioSeed(usedSeeds)
    const built = await build(seed)
    if (built === 'aborted') return { ok: false, reason: 'aborted' }
    if (built === 'error') return { ok: false, reason: 'error' }

    const failure = studioBuildFailure(built)
    if (failure) {
      lastFailure = failure
      failedAttempts += 1
      if (failedAttempts >= maxFailedAttempts) break
      continue
    }

    const fingerprint = hashStudioFingerprint(`${prefix}${pagesContentFingerprint(built)}`)
    if (!usedFingerprints) return { ok: true, seed, outputs: built, fingerprint, duplicate: false }
    lastOk = { seed, outputs: built, fingerprint }
    if (usedFingerprints.has(fingerprint)) continue
    usedFingerprints.add(fingerprint)
    return { ok: true, seed, outputs: built, fingerprint, duplicate: false }
  }

  if (lastOk) return { ok: true, ...lastOk, duplicate: true }
  if (lastFailure) return { ok: false, reason: 'failed', message: lastFailure }
  return { ok: false, reason: 'exhausted' }
}
