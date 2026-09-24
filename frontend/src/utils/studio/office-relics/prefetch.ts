import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { OR_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the objects its pages already show. */
export interface OrRemoteData {
  bookIds: string[]
}

/**
 * No network: every drawing is bundled. This only reads back which objects
 * the book's Office Relics pages already show (each picture carries its
 * object's id), which generate cannot see on its own, so a new page never
 * shows the typewriter from page 3 again on page 41.
 */
export async function officeRelicsPrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<OrRemoteData> {
  return { bookIds: context?.bookContentLabels(OR_TEMPLATE_KEY) ?? [] }
}

export function parseOrRemoteData(raw: unknown): OrRemoteData {
  const ids = (raw as Partial<OrRemoteData> | null | undefined)?.bookIds
  return { bookIds: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [] }
}
