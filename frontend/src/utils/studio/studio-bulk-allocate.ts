import type { StudioTemplateDefinition } from '@/types/studio-template.types'

/** Keep in sync with `MAX_EDITOR_INTERIOR_PAGES` in CanvasPageItem. */
export const STUDIO_BULK_MAX_BOOK_PAGES = 1000

/**
 * Upper-bound pages for one instance (puzzle pages + optional answer-key pages).
 * Used for page-limit preflight; actual count comes from the first generated sheet.
 */
export function estimateStudioInstancePageCount(
  def: Pick<StudioTemplateDefinition, 'pageCount' | 'producesAnswerKey'>,
): number {
  return def.producesAnswerKey ? def.pageCount * 2 : def.pageCount
}

/** Pages to insert for a bulk run before the first sheet teaches the real stride. */
export function estimateStudioBulkInsertPages(options: {
  instanceCount: number
  pagesPerInstance: number
  mode: 'insert' | 'replace'
  /** Existing pages reused when the first instance replaces in place. */
  firstInstanceReusablePages?: number
}): number {
  const { instanceCount, pagesPerInstance, mode } = options
  if (instanceCount <= 0 || pagesPerInstance <= 0) return 0

  if (mode === 'insert') {
    return instanceCount * pagesPerInstance
  }

  const reusable = Math.max(0, options.firstInstanceReusablePages ?? 0)
  const firstInsert = Math.max(0, pagesPerInstance - reusable)
  return firstInsert + Math.max(0, instanceCount - 1) * pagesPerInstance
}
