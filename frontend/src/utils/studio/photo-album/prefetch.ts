import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { PA_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the snapshots and grids its pages already print. */
export interface PaRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book’s Photo Album pages already print (the
 * `picture|way|level|grid` label stamped on each puzzle), which generate
 * cannot see on its own, so page 30 does not repeat page 2’s snapshot while
 * others wait, nor ever its grid. The collector caps what it returns, so a
 * long book costs the same.
 */
export async function photoAlbumPrefetch(_config: StudioConfig, _signal: AbortSignal, context?: StudioPrefetchContext): Promise<PaRemoteData> {
  return { bookLabels: context?.bookContentLabels(PA_TEMPLATE_KEY) ?? [] }
}

export function parsePaRemoteData(raw: unknown): PaRemoteData {
  const labels = (raw as Partial<PaRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
