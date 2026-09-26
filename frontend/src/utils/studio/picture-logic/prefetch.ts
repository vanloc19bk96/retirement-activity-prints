import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { PL_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the pictures its pages already show. */
export interface PlRemoteData {
  bookLabels: string[]
}

/**
 * No network: every picture is bundled and every puzzle proven in the
 * browser. This only reads back the pictures the book's Picture Logic pages
 * already carry (`id|m` or `id|n`, stamped on each puzzle), which generate
 * cannot see on its own, so page 30 is not page 2 again. The collector caps
 * what it returns, so a long book costs the same.
 */
export async function pictureLogicPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<PlRemoteData> {
  return { bookLabels: context?.bookContentLabels(PL_TEMPLATE_KEY) ?? [] }
}

export function parsePlRemoteData(raw: unknown): PlRemoteData {
  const labels = (raw as Partial<PlRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
