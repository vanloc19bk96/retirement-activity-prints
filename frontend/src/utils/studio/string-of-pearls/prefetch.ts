import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { PEARL_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the boards its pages already print. */
export interface PearlRemoteData {
  bookLabels: string[]
}

/**
 * No network: every board is built and proven in the browser. This only
 * reads back what the book’s String of Pearls pages already print (the
 * `necklace|level|board` label stamped on each puzzle), which generate
 * cannot see on its own, so page 30 does not repeat page 2’s board. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function stringOfPearlsPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<PearlRemoteData> {
  return { bookLabels: context?.bookContentLabels(PEARL_TEMPLATE_KEY) ?? [] }
}

export function parsePearlRemoteData(raw: unknown): PearlRemoteData {
  const labels = (raw as Partial<PearlRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
