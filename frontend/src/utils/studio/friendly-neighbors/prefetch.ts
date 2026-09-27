import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { NEIGHBORS_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the towns its pages already print. */
export interface NeighborsRemoteData {
  bookLabels: string[]
}

/**
 * No network: every town is built and proven in the browser. This only
 * reads back what the book’s Friendly Neighbors pages already print (the
 * `street|level|town` label stamped on each puzzle), which generate
 * cannot see on its own, so page 30 does not repeat page 2’s town. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function friendlyNeighborsPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<NeighborsRemoteData> {
  return { bookLabels: context?.bookContentLabels(NEIGHBORS_TEMPLATE_KEY) ?? [] }
}

export function parseNeighborsRemoteData(raw: unknown): NeighborsRemoteData {
  const labels = (raw as Partial<NeighborsRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
