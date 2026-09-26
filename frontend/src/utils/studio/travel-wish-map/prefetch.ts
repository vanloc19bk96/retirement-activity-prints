import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { TWM_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the destinations its travel lists already print. */
export interface TwmRemoteData {
  bookLabels: string[]
}

/**
 * No network: every destination is bundled. This only reads back what the
 * book's earlier Travel Wish Map pages print (`countries:Portugal`,
 * `places:A lighthouse`), which generate cannot see on its own, so a second
 * country list in the same book deals different countries — across runs and
 * sittings. Bounded by the shared label collector.
 */
export async function travelWishMapPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<TwmRemoteData> {
  return { bookLabels: context?.bookContentLabels(TWM_TEMPLATE_KEY) ?? [] }
}

export function parseTwmRemoteData(raw: unknown): TwmRemoteData {
  const labels = (raw as Partial<TwmRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
