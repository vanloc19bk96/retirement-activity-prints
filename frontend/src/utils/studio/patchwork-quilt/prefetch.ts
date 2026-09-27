import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { PQ_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the quilts its pages already print. */
export interface PqRemoteData {
  bookLabels: string[]
}

/**
 * No network: every quilt is pieced and proven in the browser. This only
 * reads back what the book’s Patchwork Quilt pages already print (the
 * `quilt|level|numbers` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not repeat page 2’s quilt. The collector
 * caps what it returns, so a long book costs the same.
 */
export async function patchworkQuiltPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<PqRemoteData> {
  return { bookLabels: context?.bookContentLabels(PQ_TEMPLATE_KEY) ?? [] }
}

export function parsePqRemoteData(raw: unknown): PqRemoteData {
  const labels = (raw as Partial<PqRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
