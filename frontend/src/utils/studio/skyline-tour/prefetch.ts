import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { SKY_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the cities its pages already print. */
export interface SkyRemoteData {
  bookLabels: string[]
}

/**
 * No network: every city is built and proven in the browser. This only
 * reads back what the book’s Skyline Tour pages already print (the
 * `city|level|puzzle` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not repeat page 2’s city. The collector
 * caps what it returns, so a long book costs the same.
 */
export async function skylineTourPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<SkyRemoteData> {
  return { bookLabels: context?.bookContentLabels(SKY_TEMPLATE_KEY) ?? [] }
}

export function parseSkyRemoteData(raw: unknown): SkyRemoteData {
  const labels = (raw as Partial<SkyRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
