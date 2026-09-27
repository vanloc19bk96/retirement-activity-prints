import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { GP_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the gardens its pages already print. */
export interface GpRemoteData {
  bookLabels: string[]
}

/**
 * No network: every garden is grown and proven in the browser. This only
 * reads back what the book’s Garden Plots pages already print (the
 * `garden|level|beds` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not replant page 2’s garden. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function gardenPlotsPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<GpRemoteData> {
  return { bookLabels: context?.bookContentLabels(GP_TEMPLATE_KEY) ?? [] }
}

export function parseGpRemoteData(raw: unknown): GpRemoteData {
  const labels = (raw as Partial<GpRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
