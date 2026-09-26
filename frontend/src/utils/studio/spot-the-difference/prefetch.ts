import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { SD_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the scenes its pages already show. */
export interface SdRemoteData {
  bookLabels: string[]
}

/**
 * No network: every scene is drawn in the browser. This only reads back the
 * scenes the book's Spot the Differences pages already carry
 * (`recipe|kinds|changes`, stamped on each page), which generate cannot see
 * on its own, so page 41 is not page 3 again. The collector caps what it
 * returns, so a long book costs the same.
 */
export async function spotTheDifferencePrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<SdRemoteData> {
  return { bookLabels: context?.bookContentLabels(SD_TEMPLATE_KEY) ?? [] }
}

export function parseSdRemoteData(raw: unknown): SdRemoteData {
  const labels = (raw as Partial<SdRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
