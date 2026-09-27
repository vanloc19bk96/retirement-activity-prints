import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { CF_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the harbors its pages already print. */
export interface CfRemoteData {
  bookLabels: string[]
}

/**
 * No network: every harbor is built and proven in the browser. This only
 * reads back what the book’s Cruise Fleet pages already print (the
 * `harbor|level|fleet` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not hide page 2’s fleet again. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function cruiseFleetPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<CfRemoteData> {
  return { bookLabels: context?.bookContentLabels(CF_TEMPLATE_KEY) ?? [] }
}

export function parseCfRemoteData(raw: unknown): CfRemoteData {
  const labels = (raw as Partial<CfRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
