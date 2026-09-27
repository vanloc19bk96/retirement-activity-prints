import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { FENCE_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the fields its pages already print. */
export interface FenceRemoteData {
  bookLabels: string[]
}

/**
 * No network: every field is built and proven in the browser. This only
 * reads back what the book’s Country Fence pages already print (the
 * `pasture|level|field` label stamped on each puzzle), which generate
 * cannot see on its own, so page 30 does not repeat page 2’s field. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function countryFencePrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<FenceRemoteData> {
  return { bookLabels: context?.bookContentLabels(FENCE_TEMPLATE_KEY) ?? [] }
}

export function parseFenceRemoteData(raw: unknown): FenceRemoteData {
  const labels = (raw as Partial<FenceRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
