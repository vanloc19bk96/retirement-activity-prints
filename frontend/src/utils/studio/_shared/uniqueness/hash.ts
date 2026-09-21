/**
 * Canonical hashing (§4.2).
 *
 * SHA-256 over the canonical form, truncated to 64 bits. Truncation is safe at
 * the scale this operates on: at 10^8 stored puzzles the birthday collision
 * probability across the whole corpus is ~0.03%, and a collision costs one
 * harmless regeneration, never a wrong puzzle.
 */

import { sha256Hex } from './sha256'

/** Length of the stored digest, in hex characters (64 bits). */
export const CANONICAL_HASH_HEX_LENGTH = 16

export function canonicalHash(canonicalForm: string): string {
  return sha256Hex(canonicalForm).slice(0, CANONICAL_HASH_HEX_LENGTH)
}

/**
 * Fabric `data` key carrying a figure's canonical hash.
 *
 * The Studio's content fingerprint walks the object tree and transcribes every
 * mark it finds. For a card figure that means thousands of pip vertices, which
 * is both slow and *wrong* for uniqueness: a puzzle rotated 90° draws different
 * vertices and would fingerprint as a new page. Stamping this key on the figure
 * group makes the fingerprint use the canonical hash and skip the subtree, so
 * the book-scoped ledger the Studio already runs becomes the §4.3 ledger.
 */
export const STUDIO_CANONICAL_KEY = 'studioCanonicalKey'

/** `data` payload for the group that wraps one puzzle figure. */
export function canonicalKeyData(
  templateKey: string,
  hash: string,
): Record<string, unknown> {
  return { [STUDIO_CANONICAL_KEY]: `${templateKey}:${hash}` }
}
