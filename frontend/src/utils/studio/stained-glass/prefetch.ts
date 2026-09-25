import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { SG_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the designs its pages already show. */
export interface SgRemoteData {
  bookLabels: string[]
}

/**
 * No network: every subject is bundled and every design is built in the
 * browser. This only reads back the designs the book's Stained Glass pages
 * already carry (`subject|version|composition`, stamped on each panel), which
 * generate cannot see on its own, so page 41 is not page 3 again.
 */
export async function stainedGlassPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<SgRemoteData> {
  return { bookLabels: context?.bookContentLabels(SG_TEMPLATE_KEY) ?? [] }
}

export function parseSgRemoteData(raw: unknown): SgRemoteData {
  const labels = (raw as Partial<SgRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
