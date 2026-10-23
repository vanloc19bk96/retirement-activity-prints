import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'

/** A page once laid out: kept as it is (`from` only), changed (`from` and `json`) or new (`json` only). */
export interface LaidOutPage {
  from?: number
  json?: object
}

export const REWRITE_INTERIOR_PAGES_EVENT = 'editor:rewrite-interior-pages'

/** The interior after a rewrite, page by page (`LaidOutPage`), and the page to show once it is in. */
export interface InteriorPagesRewrite {
  layout: LaidOutPage[]
  /** Page to open afterwards (0-based); the open page stays open when left out. */
  focus?: number
}

/**
 * Lays the interior out anew from its pages (Fabric JSON per page, the live canvases saved into them first)
 * and the open page; null when there is nothing to change.
 */
export type RewriteInteriorPages = (
  pages: ReadonlyArray<object | null>,
  context: { activePageIndex: number; size: CanvasLogicalSize },
) => InteriorPagesRewrite | null

export interface RewriteInteriorPagesEventDetail {
  rewrite: RewriteInteriorPages
  /** Set by the editor when it takes the request. */
  handled: boolean
  /** Resolves with the number of pages added or changed (0 when nothing changed). */
  resolve: (changed: number) => void
  reject: (error: unknown) => void
}

/** Ask the editor to apply `rewrite` to the interior pages: copies, backgrounds, objects repeated across pages. */
export function requestInteriorPagesRewrite(rewrite: RewriteInteriorPages): Promise<number> {
  return new Promise((resolve, reject) => {
    const detail: RewriteInteriorPagesEventDetail = { rewrite, handled: false, resolve, reject }
    window.dispatchEvent(new CustomEvent<RewriteInteriorPagesEventDetail>(REWRITE_INTERIOR_PAGES_EVENT, { detail }))
    if (!detail.handled) reject(new Error('Open the editor to change the pages.'))
  })
}

export const READ_INTERIOR_PAGES_EVENT = 'editor:read-interior-pages'

export interface ReadInteriorPagesEventDetail {
  /** Set by the editor when it takes the request. */
  handled: boolean
  resolve: (pages: Array<object | null>) => void
  reject: (error: unknown) => void
}

/** The interior pages as they are now (Fabric JSON per page, the live canvases' edits included), to read only. */
export function requestInteriorPages(): Promise<Array<object | null>> {
  return new Promise((resolve, reject) => {
    const detail: ReadInteriorPagesEventDetail = { handled: false, resolve, reject }
    window.dispatchEvent(new CustomEvent<ReadInteriorPagesEventDetail>(READ_INTERIOR_PAGES_EVENT, { detail }))
    if (!detail.handled) reject(new Error('Open the editor to check the book.'))
  })
}
