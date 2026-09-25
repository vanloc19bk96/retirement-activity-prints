import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { DTD_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the pictures its pages already show. */
export interface DtdRemoteData {
  bookLabels: string[]
}

/**
 * No network: every subject is bundled and every picture is dotted in the
 * browser. This only reads back the pictures the book's Dot to Dot pages
 * already carry (`subject|shape|version`, stamped on each picture), which
 * generate cannot see on its own, so page 41 is not page 3 again. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function dotToDotPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<DtdRemoteData> {
  return { bookLabels: context?.bookContentLabels(DTD_TEMPLATE_KEY) ?? [] }
}

export function parseDtdRemoteData(raw: unknown): DtdRemoteData {
  const labels = (raw as Partial<DtdRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
