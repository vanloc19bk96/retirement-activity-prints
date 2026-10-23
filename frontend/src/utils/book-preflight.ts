/**
 * The print check for the whole interior at once, from the pages' Fabric JSON rather than live canvases:
 * every page goes through the same rules as the open page (kdp-preflight.ts), and the book itself is
 * checked for what no single page shows: too few pages and blank pages.
 */
import { StaticCanvas, type Canvas } from 'fabric'

import {
  collectPreflightItems,
  evaluatePreflight,
  PREFLIGHT_IMAGE_KEY,
  type PreflightIssue,
  type PreflightSeverity,
  type PreflightSurface,
} from '@/utils/kdp-preflight'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

/** Fewest pages KDP prints a paperback with. */
export const KDP_MIN_PAGES = 24

export type BookIssueId = 'too-few-pages' | 'blank-pages'

/** A finding about the book as a whole, with the pages (0-based) it concerns. */
export interface BookIssue {
  id: BookIssueId
  severity: PreflightSeverity
  title: string
  detail: string
  pages: number[]
}

export interface PageCheck {
  /** 0-based page index. */
  index: number
  issues: PreflightIssue[]
}

export interface BookCheckReport {
  pageCount: number
  bookIssues: BookIssue[]
  /** Only the pages with something to report, in page order. */
  pages: PageCheck[]
}

type ObjectJson = { type?: unknown; visible?: unknown; objects?: unknown; data?: Record<string, unknown> | null; [key: string]: unknown }

const objectsOf = (node: unknown): ObjectJson[] => {
  const objects = (node as { objects?: unknown } | null)?.objects
  return Array.isArray(objects) ? (objects as ObjectJson[]) : []
}

/** A page with nothing that prints: no objects, or only hidden ones. */
export function isBlankPage(page: object | null): boolean {
  return objectsOf(page).every((obj) => obj.visible === false)
}

/** "page 4", "pages 4 and 9", "pages 4, 9, 12 and 3 more" (1-based for the reader). */
export function describePages(indexes: readonly number[], shown = 3): string {
  const numbers = indexes.map((index) => String(index + 1))
  if (numbers.length === 1) return `page ${numbers[0]}`
  if (numbers.length <= shown) return `pages ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
  return `pages ${numbers.slice(0, shown).join(', ')} and ${numbers.length - shown} more`
}

/** What is wrong with the book as a whole: its length and its blank pages. */
export function bookLevelIssues(pages: ReadonlyArray<object | null>): BookIssue[] {
  const issues: BookIssue[] = []
  if (pages.length < KDP_MIN_PAGES) {
    issues.push({
      id: 'too-few-pages',
      severity: 'error',
      title: `Only ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`,
      detail: `KDP prints paperbacks from ${KDP_MIN_PAGES} pages. Add ${KDP_MIN_PAGES - pages.length} more.`,
      pages: [],
    })
  }

  const blank = pages.flatMap((page, index) => (isBlankPage(page) ? [index] : []))
  if (blank.length) {
    issues.push({
      id: 'blank-pages',
      severity: blank.length > Math.max(2, pages.length * 0.1) ? 'warning' : 'info',
      title: `${blank.length} blank ${blank.length === 1 ? 'page' : 'pages'}`,
      detail: `Nothing prints on ${describePages(blank)}. KDP can question books with many blank pages; delete the ones you don't need.`,
      pages: blank,
    })
  }

  return issues
}

/**
 * `node` (a page or a group, Fabric JSON) with every image swapped for a rectangle of the same size and
 * scale tagged as an image, so a page can be checked (bounds, print resolution) without downloading images.
 */
export function withImageStandIns<T>(node: T): T {
  const swap = (obj: ObjectJson): ObjectJson => {
    if (String(obj.type).toLowerCase() === 'image') {
      const { src: _src, filters: _filters, resizeFilter: _resize, crossOrigin: _cross, ...rest } = obj
      return {
        ...rest,
        type: 'Rect',
        fill: '#000000',
        layerName: typeof obj.layerName === 'string' ? obj.layerName : 'Image',
        data: { ...(obj.data ?? {}), [PREFLIGHT_IMAGE_KEY]: true },
      }
    }
    const children = objectsOf(obj)
    return children.length ? { ...obj, objects: children.map(swap) } : obj
  }
  const objects = objectsOf(node)
  return (objects.length ? { ...node, objects: objects.map(swap) } : node) as T
}

/**
 * Check every page of the book (Fabric JSON per page) against its own print surface, then the book as
 * a whole. Yields between pages; `onProgress` reports pages checked; stops early when `signal` aborts.
 */
export async function checkBook(
  pages: ReadonlyArray<object | null>,
  surfaceFor: (index: number) => PreflightSurface,
  { onProgress, signal }: { onProgress?: (checked: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<BookCheckReport> {
  const first = surfaceFor(0).page
  const canvas = new StaticCanvas(document.createElement('canvas'), {
    width: first.right - first.left,
    height: first.bottom - first.top,
    renderOnAddRemove: false,
  })
  const checked: PageCheck[] = []
  try {
    for (const [index, page] of pages.entries()) {
      if (signal?.aborted) throw new DOMException('The book check was stopped.', 'AbortError')
      if (page && !isBlankPage(page)) {
        canvas.clear()
        try {
          await canvas.loadFromJSON(withImageStandIns(page))
          const issues = evaluatePreflight(collectPreflightItems(canvas as unknown as Canvas), surfaceFor(index))
          if (issues.length) checked.push({ index, issues })
        } catch {
          // A page Fabric cannot read is not one the check can judge; the editor shows it as it is.
        }
      }
      onProgress?.(index + 1, pages.length)
      await yieldToMainThread()
    }
  } finally {
    void canvas.dispose()
  }
  return { pageCount: pages.length, bookIssues: bookLevelIssues(pages), pages: checked }
}
