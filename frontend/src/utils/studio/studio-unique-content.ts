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

/**
 * Allocate a fresh seed, build pages, and claim the fingerprint when unique.
 * When `usedFingerprints` is omitted, accepts the first successful build.
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
  const maxAttempts = usedFingerprints
    ? (options.maxAttempts ?? STUDIO_UNIQUE_CONTENT_ATTEMPTS)
    : 1
  const prefix = namespace ? `${namespace}:` : ''

  let lastOk: { seed: number; outputs: StudioPageOutput[]; fingerprint: string } | null =
    null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isAborted?.()) return { ok: false, reason: 'aborted' }

    const seed = allocateStudioSeed(usedSeeds)
    const built = await build(seed)
    if (built === 'aborted') return { ok: false, reason: 'aborted' }
    if (built === 'error') return { ok: false, reason: 'error' }

    const fingerprint = hashStudioFingerprint(`${prefix}${pagesContentFingerprint(built)}`)
    lastOk = { seed, outputs: built, fingerprint }
    if (usedFingerprints?.has(fingerprint)) continue
    usedFingerprints?.add(fingerprint)
    return { ok: true, seed, outputs: built, fingerprint, duplicate: false }
  }

  if (lastOk) return { ok: true, ...lastOk, duplicate: true }
  return { ok: false, reason: 'exhausted' }
}
