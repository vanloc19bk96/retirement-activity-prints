import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { LAMP_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the houses its pages already print. */
export interface LampRemoteData {
  bookLabels: string[]
}

/**
 * No network: every house is built and proven in the browser. This only
 * reads back what the book’s Lamplighter pages already print (the
 * `home|level|house` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not repeat page 2’s house. The collector
 * caps what it returns, so a long book costs the same.
 */
export async function lamplighterPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<LampRemoteData> {
  return { bookLabels: context?.bookContentLabels(LAMP_TEMPLATE_KEY) ?? [] }
}

export function parseLampRemoteData(raw: unknown): LampRemoteData {
  const labels = (raw as Partial<LampRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
