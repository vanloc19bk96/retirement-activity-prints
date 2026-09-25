import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { LG_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the scenes and patterns its pages already print. */
export interface LgRemoteData {
  bookLabels: string[]
}

/**
 * No network: every puzzle is built in the browser. This only reads back the
 * labels earlier Farewell Party pages stamped, which generate cannot see on
 * its own, so a new puzzle never repeats a deduction pattern the book already
 * prints and steers clear of scenes it has used — across runs and sittings.
 */
export async function farewellLogicGridPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<LgRemoteData> {
  return { bookLabels: context?.bookContentLabels(LG_TEMPLATE_KEY) ?? [] }
}

export function parseLgRemoteData(raw: unknown): LgRemoteData {
  const labels = (raw as Partial<LgRemoteData> | null | undefined)?.bookLabels
  return {
    bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [],
  }
}
