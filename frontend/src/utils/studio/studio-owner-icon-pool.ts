import { createRng, deriveSeed } from './studio-rng'

/** Icons sampled into each seller’s private vocabulary. */
export const STUDIO_OWNER_ICON_POOL_SIZE = 28

/**
 * Resolve a stable owner key for per-account icon pools.
 * Prefer authenticated user; book id separates untitled/guest sessions.
 */
export function resolveStudioOwnerKey(options: {
  userId?: string | number | null
  bookId?: string | null
}): string {
  const userId = options.userId != null ? String(options.userId).trim() : ''
  if (userId) return `user:${userId}`
  const bookId = options.bookId?.trim() ?? ''
  if (bookId) return `book:${bookId}`
  return 'anonymous'
}

/**
 * Deterministic subset of `masterPool` unique to `ownerKey`.
 * Same owner → same vocabulary; different owners → different subsets.
 */
export function selectOwnerIconPool(
  masterPool: readonly string[],
  ownerKey: string,
  poolSize: number = STUDIO_OWNER_ICON_POOL_SIZE,
): string[] {
  if (masterPool.length === 0) return []
  const n = Math.min(Math.max(1, poolSize), masterPool.length)
  const rng = createRng(deriveSeed(0, `owner-icons:${ownerKey}`))
  return rng.sample(masterPool, n)
}
