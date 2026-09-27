import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { SM_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the grids its pages already print. */
export interface SmRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book’s Sun & Moon pages already print (the
 * `day|level|grid` label stamped on each puzzle), which generate cannot see
 * on its own, so page 30 does not repeat page 2’s grid. The collector caps
 * what it returns, so a long book costs the same.
 */
export async function sunAndMoonPrefetch(_config: StudioConfig, _signal: AbortSignal, context?: StudioPrefetchContext): Promise<SmRemoteData> {
  return { bookLabels: context?.bookContentLabels(SM_TEMPLATE_KEY) ?? [] }
}

export function parseSmRemoteData(raw: unknown): SmRemoteData {
  const labels = (raw as Partial<SmRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
