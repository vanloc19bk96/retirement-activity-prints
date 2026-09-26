import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { WW_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the looks and prompts its earlier Well Wishes pages print. */
export interface WwRemoteData {
  bookLabels: string[]
}

/**
 * No network: every word is bundled. This only reads back what the book's
 * earlier Well Wishes pages print (`h:retirement-wishes`, `p:a-favorite-memory`,
 * `d:rounded/tab/from`), which generate cannot see on its own, so a second set
 * in the same book takes a different heading, frame and prompts — across runs
 * and sittings. Bounded by the shared label collector.
 */
export async function wellWishesPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<WwRemoteData> {
  return { bookLabels: context?.bookContentLabels(WW_TEMPLATE_KEY) ?? [] }
}

export function parseWwRemoteData(raw: unknown): WwRemoteData {
  const labels = (raw as Partial<WwRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
