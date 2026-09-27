import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import { DRIVE_TEMPLATE_KEY } from './content'

/** What generate needs from the book: the grids its pages already print. */
export interface DriveRemoteData {
  bookLabels: string[]
}

/**
 * No network: every grid is built and proven in the browser. This only
 * reads back what the book’s Scenic Drive pages already print (the
 * `route|level|grid` label stamped on each puzzle), which generate cannot
 * see on its own, so page 30 does not repeat page 2’s grid. The collector
 * caps what it returns, so a long book costs the same.
 */
export async function scenicDrivePrefetch(_config: StudioConfig, _signal: AbortSignal, context?: StudioPrefetchContext): Promise<DriveRemoteData> {
  return { bookLabels: context?.bookContentLabels(DRIVE_TEMPLATE_KEY) ?? [] }
}

export function parseDriveRemoteData(raw: unknown): DriveRemoteData {
  const labels = (raw as Partial<DriveRemoteData> | null | undefined)?.bookLabels
  return { bookLabels: Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [] }
}
