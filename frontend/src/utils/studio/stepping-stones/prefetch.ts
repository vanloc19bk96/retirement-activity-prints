import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { STONES_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the paths its pages already print. */
export interface StonesRemoteData {
  bookLabels: string[]
}

/**
 * No network: every path is built and proven in the browser. This only
 * reads back what the book’s Stepping Stones pages already print (the
 * `walk|level|path` label stamped on each puzzle), which generate
 * cannot see on its own, so page 30 does not repeat page 2’s path. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function steppingStonesPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<StonesRemoteData> {
  return { bookLabels: context?.bookContentLabels(STONES_TEMPLATE_KEY) ?? [] }
}

export function parseStonesRemoteData(raw: unknown): StonesRemoteData {
  const labels = (raw as Partial<StonesRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
