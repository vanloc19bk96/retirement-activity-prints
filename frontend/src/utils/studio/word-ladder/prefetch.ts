import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { WL_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the ladders its pages already print. */
export interface WlRemoteData {
  bookLabels: string[]
}

/**
 * No network: every ladder and clue is bundled and every page proven in
 * the browser. This only reads back the ladders the book's Word Ladder
 * pages already print (the ladder id stamped on each ladder), which
 * generate cannot see on its own, so page 30 does not repeat page 2. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function wordLadderPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<WlRemoteData> {
  return { bookLabels: context?.bookContentLabels(WL_TEMPLATE_KEY) ?? [] }
}

export function parseWlRemoteData(raw: unknown): WlRemoteData {
  const labels = (raw as Partial<WlRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
