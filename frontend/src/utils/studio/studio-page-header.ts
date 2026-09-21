import type { StudioConfig } from '@/types/studio-template.types'

/**
 * Stand-in heading for a run that auto-numbers its pages ("Game 1", "Game 2"…).
 * Only the presence of a heading changes header height — every title renders on
 * one line at STUDIO_TITLE_SIZE — so any non-empty sample measures the same.
 */
export const STUDIO_AUTO_PAGE_TITLE_SAMPLE = 'Game 1'

/** The page-header fields a run stamps onto every instance it generates. */
export interface StudioPageHeader {
  /** Page-title toggle. Book builder / bulk own this, not the per-game draft. */
  showTitle: boolean
  /** Heading to stamp; blank means the run auto-numbers. */
  title?: unknown
  /** Instruction-strip toggle. Omit to keep the draft's own value. */
  showInstructions?: unknown
}

/**
 * Merge the run's page header into a config draft that does not carry it.
 *
 * Layout-aware bounds (`maxWhen`) measure the header out of the body, so a draft
 * without it reports a max the page cannot hold: with the book builder's
 * "Number pages Game N" on, a sheet set to 10 items silently printed 9.
 */
export function withStudioPageHeader(
  config: StudioConfig,
  header: StudioPageHeader,
): StudioConfig {
  const title = header.showTitle
    ? String(header.title ?? '').trim() || STUDIO_AUTO_PAGE_TITLE_SAMPLE
    : ''
  const next: StudioConfig = { ...config, showTitle: header.showTitle, title }
  if (header.showInstructions !== undefined) {
    next.showInstructions = header.showInstructions
  }
  return next
}
