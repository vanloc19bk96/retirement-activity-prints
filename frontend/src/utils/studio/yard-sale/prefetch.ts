import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { YS_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the grids its pages already print. */
export interface YsRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book’s Yard Sale pages already print (the
 * `sale|level|grid` label stamped on each puzzle), which generate cannot see
 * on its own, so page 30 does not repeat page 2’s grid. The collector caps
 * what it returns, so a long book costs the same.
 */
export async function yardSalePrefetch(_config: StudioConfig, _signal: AbortSignal, context?: StudioPrefetchContext): Promise<YsRemoteData> {
  return { bookLabels: context?.bookContentLabels(YS_TEMPLATE_KEY) ?? [] }
}

export function parseYsRemoteData(raw: unknown): YsRemoteData {
  const labels = (raw as Partial<YsRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
