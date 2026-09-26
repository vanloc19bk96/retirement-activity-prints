import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { CR_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the wording and looks its earlier certificates print. */
export interface CrRemoteData {
  bookLabels: string[]
}

/**
 * No network: every word is bundled. This only reads back what the book's
 * earlier certificates print (`t:chief-leisure-officer`, `h:license`,
 * `d:double/laurel/beaded/italic`), which generate cannot see on its own, so
 * a second certificate in the same book — one per retiree in a team book —
 * takes a different title, heading and look. Bounded by the shared collector.
 */
export async function retirementCertificatePrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<CrRemoteData> {
  return { bookLabels: context?.bookContentLabels(CR_TEMPLATE_KEY) ?? [] }
}

export function parseCrRemoteData(raw: unknown): CrRemoteData {
  const labels = (raw as Partial<CrRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
