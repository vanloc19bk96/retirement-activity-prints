import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { TY_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the projects and grids its pages already print. */
export interface TyRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book's Tangled Yarn pages already print (the
 * `project|level|grid` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not knit page 2's scarf again. The
 * collector caps what it returns, so a long book costs the same.
 */
export async function tangledYarnPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<TyRemoteData> {
  return { bookLabels: context?.bookContentLabels(TY_TEMPLATE_KEY) ?? [] }
}

export function parseTyRemoteData(raw: unknown): TyRemoteData {
  const labels = (raw as Partial<TyRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
