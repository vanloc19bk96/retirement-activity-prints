import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { SM_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the shapes and journeys its pages already show. */
export interface SmRemoteData {
  bookLabels: string[]
}

/**
 * No network: every shape is bundled and every maze is carved in the browser.
 * This only reads back the labels the book's Shaped Maze pages already carry
 * (`shape|version|start|finish`), which generate cannot see on its own, so
 * page 41 does not repeat page 3. The collector caps what it returns, so a
 * long book costs the same.
 */
export async function shapedMazePrefetch(
  _config: StudioConfig,
  _signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<SmRemoteData> {
  return { bookLabels: context?.bookContentLabels(SM_TEMPLATE_KEY) ?? [] }
}

export function parseSmRemoteData(raw: unknown): SmRemoteData {
  const labels = (raw as Partial<SmRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
