import type { StudioFabricObject } from '@/types/studio-template.types'
import type { StudioSolutionPlacement } from './studio-solution-placement'

export const STUDIO_WRITE_PAGE_EVENT = 'studio:write-page'
export const STUDIO_GENERATION_DONE_EVENT = 'studio:generation-done'
export const STUDIO_ARRANGE_SOLUTIONS_EVENT = 'studio:arrange-solutions'

export type StudioWritePageOptions = {
  /** When false, only persist to the store (bulk). Default true. */
  syncLive?: boolean
}

export interface StudioWritePageDetail {
  pageIndex: number
  objects: StudioFabricObject[]
  mode: 'replace' | 'append'
  /**
   * When false, store was already updated — skip live Fabric enliven during bulk.
   * Defaults to true for single-sheet generate.
   */
  syncLive?: boolean
}

export interface StudioGenerationDoneDetail {
  instanceId: string
  pageIndices: number[]
  /** Bulk deferred live sync — pull store into mounted Fabric rows. */
  restoreLiveFromStore?: boolean
}

export function dispatchStudioWritePage(detail: StudioWritePageDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_WRITE_PAGE_EVENT, { detail }))
}

export function onStudioWritePage(
  handler: (detail: StudioWritePageDetail) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<StudioWritePageDetail>).detail)
  window.addEventListener(STUDIO_WRITE_PAGE_EVENT, listener)
  return () => window.removeEventListener(STUDIO_WRITE_PAGE_EVENT, listener)
}

export function dispatchStudioGenerationDone(detail: StudioGenerationDoneDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_GENERATION_DONE_EVENT, { detail }))
}

export function onStudioGenerationDone(
  handler: (detail: StudioGenerationDoneDetail) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<StudioGenerationDoneDetail>).detail)
  window.addEventListener(STUDIO_GENERATION_DONE_EVENT, listener)
  return () => window.removeEventListener(STUDIO_GENERATION_DONE_EVENT, listener)
}

export interface StudioArrangeSolutionsDetail {
  placement: StudioSolutionPlacement
}

/** Move the book's existing solution pages to match `placement` (settings Apply). */
export function dispatchStudioArrangeSolutions(detail: StudioArrangeSolutionsDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_ARRANGE_SOLUTIONS_EVENT, { detail }))
}

export function onStudioArrangeSolutions(
  handler: (detail: StudioArrangeSolutionsDetail) => void,
): () => void {
  const listener = (e: Event) =>
    handler((e as CustomEvent<StudioArrangeSolutionsDetail>).detail)
  window.addEventListener(STUDIO_ARRANGE_SOLUTIONS_EVENT, listener)
  return () => window.removeEventListener(STUDIO_ARRANGE_SOLUTIONS_EVENT, listener)
}
