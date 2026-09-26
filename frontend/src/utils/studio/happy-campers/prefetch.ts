import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { HC_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the campgrounds and grids its pages already print. */
export interface HcRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book's Happy Campers pages already print (the
 * `campground|level|grid` label stamped on each puzzle), which generate
 * cannot see on its own, so page 30 does not visit page 2's campground
 * again. The collector caps what it returns, so a long book costs the same.
 */
export async function happyCampersPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<HcRemoteData> {
  return { bookLabels: context?.bookContentLabels(HC_TEMPLATE_KEY) ?? [] }
}

export function parseHcRemoteData(raw: unknown): HcRemoteData {
  const labels = (raw as Partial<HcRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
