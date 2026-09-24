import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { PC_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the facts its pages already print. */
export interface PcRemoteData {
  bookKeys: string[]
}

/**
 * No network: every price is bundled. This only reads back what the book's
 * Price Check pages already ask (`series@year` labels), which generate cannot
 * see on its own, so a new page never repeats a question from page 3 on page
 * 41 — whatever the wording, and across runs and sittings.
 */
export async function priceCheckPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<PcRemoteData> {
  return { bookKeys: context?.bookContentLabels(PC_TEMPLATE_KEY) ?? [] }
}

export function parsePcRemoteData(raw: unknown): PcRemoteData {
  const keys = (raw as Partial<PcRemoteData> | null | undefined)?.bookKeys
  return { bookKeys: Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [] }
}
