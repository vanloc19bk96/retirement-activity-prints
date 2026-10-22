import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { TT_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the lines its pages already print. */
export interface TtRemoteData {
  bookLabels: string[]
}

/**
 * No network: every board is built and proven in the browser. This only
 * reads back what the book’s Train Tracks pages already print (the
 * `line|level|board` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not lay page 2’s line again. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function trainTracksPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<TtRemoteData> {
  return { bookLabels: context?.bookContentLabels(TT_TEMPLATE_KEY) ?? [] }
}

export function parseTtRemoteData(raw: unknown): TtRemoteData {
  const labels = (raw as Partial<TtRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
