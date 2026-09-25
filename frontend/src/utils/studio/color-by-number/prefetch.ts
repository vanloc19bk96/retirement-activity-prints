import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { CBN_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the designs its pages already show. */
export interface CbnRemoteData {
  bookLabels: string[]
}

/**
 * No network: every subject is bundled and every scene is built in the
 * browser. This only reads back the designs the book's Color by Number pages
 * already carry (`subject|version|composition|palette`, stamped on each
 * scene), which generate cannot see on its own, so page 41 is not page 3
 * again. The collector caps what it returns, so a long book costs the same.
 */
export async function colorByNumberPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<CbnRemoteData> {
  return { bookLabels: context?.bookContentLabels(CBN_TEMPLATE_KEY) ?? [] }
}

export function parseCbnRemoteData(raw: unknown): CbnRemoteData {
  const labels = (raw as Partial<CbnRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
