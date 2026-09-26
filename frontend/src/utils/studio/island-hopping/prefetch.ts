import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { IH_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the chains and charts its pages already print. */
export interface IhRemoteData {
  bookLabels: string[]
}

/**
 * No network: every chart is built and proven in the browser. This only
 * reads back what the book's Island Hopping pages already print (the
 * `chain|level|chart` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not sail to page 2's islands again. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function islandHoppingPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<IhRemoteData> {
  return { bookLabels: context?.bookContentLabels(IH_TEMPLATE_KEY) ?? [] }
}

export function parseIhRemoteData(raw: unknown): IhRemoteData {
  const labels = (raw as Partial<IhRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
