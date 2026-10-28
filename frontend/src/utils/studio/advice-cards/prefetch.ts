import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { AC_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the looks and prompts its earlier advice cards print. */
export interface AcRemoteData {
  bookLabels: string[]
}

/**
 * No network: every word is bundled. This only reads back what the book's
 * earlier advice cards print (`h:words-of-wisdom`, `p:always-say-yes-to`,
 * `f:rounded`), which generate cannot see on its own, so a second set in the
 * same book takes a different heading, frame and prompts — across runs and
 * sittings. Bounded by the shared label collector.
 */
export async function adviceCardsPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<AcRemoteData> {
  return { bookLabels: context?.bookContentLabels(AC_TEMPLATE_KEY) ?? [] }
}

export function parseAcRemoteData(raw: unknown): AcRemoteData {
  const labels = (raw as Partial<AcRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
