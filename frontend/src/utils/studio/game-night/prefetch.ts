import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { GN_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the grids its pages already print. */
export interface GnRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book’s Game Night pages already print (the
 * `night|level|grid` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not repeat page 2’s grid. The collector
 * caps what it returns, so a long book costs the same.
 */
export async function gameNightPrefetch(_config: StudioConfig, _signal: AbortSignal, context?: StudioPrefetchContext): Promise<GnRemoteData> {
  return { bookLabels: context?.bookContentLabels(GN_TEMPLATE_KEY) ?? [] }
}

export function parseGnRemoteData(raw: unknown): GnRemoteData {
  const labels = (raw as Partial<GnRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
