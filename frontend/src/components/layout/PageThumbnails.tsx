import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageThumbnails } from '@/context/PageThumbnailsContext'
import { cn } from '@/lib/utils'

const RAIL_WIDTH = 132
const THUMBNAIL_WIDTH = 84
const ITEM_GAP = 12
const ITEM_CHROME_HEIGHT = 42
const OVERSCAN_ITEMS = 4
// Wait for the scroll to settle before requesting thumbnails so a fast fling
// through hundreds of pages does not spawn generation for every page it passes.
const THUMBNAIL_REQUEST_DEBOUNCE_MS = 150

type ViewportState = {
  scrollTop: number
  height: number
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, index))
}

function getVisibleRange({
  pageCount,
  scrollTop,
  viewportHeight,
  itemHeight,
}: {
  pageCount: number
  scrollTop: number
  viewportHeight: number
  itemHeight: number
}): { start: number; end: number } {
  if (pageCount <= 0 || itemHeight <= 0) return { start: 0, end: 0 }

  const start = clampIndex(Math.floor(scrollTop / itemHeight) - OVERSCAN_ITEMS, pageCount)
  const end = Math.min(
    pageCount,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + OVERSCAN_ITEMS,
  )

  return { start, end }
}

function PageThumbnailSkeleton({ previewHeight }: { previewHeight: number }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-1" aria-hidden>
      <div
        className="w-[84px] animate-pulse rounded-md border border-border bg-muted"
        style={{ height: previewHeight }}
      />
      <div className="h-3 w-14 animate-pulse rounded bg-muted" />
    </div>
  )
}

type PageThumbnailButtonProps = {
  pageIndex: number
  active: boolean
  previewHeight: number
  thumbnailUrl?: string
  onSelectPage: (pageIndex: number) => void
}

function PageThumbnailButton({
  pageIndex,
  active,
  previewHeight,
  thumbnailUrl,
  onSelectPage,
}: PageThumbnailButtonProps): JSX.Element {
  const pageNumber = pageIndex + 1

  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={`Go to page ${pageNumber}`}
      onClick={() => onSelectPage(pageIndex)}
      className={cn(
        'group flex w-full flex-col items-center gap-2 rounded-md px-2 py-1 text-left outline-none transition-colors',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      <span
        className={cn(
          'relative flex w-[84px] items-center justify-center overflow-hidden rounded-md border bg-white shadow-sm transition',
          active
            ? 'border-primary ring-2 ring-primary/40'
            : 'border-border group-hover:border-muted-foreground/40',
        )}
        style={{ height: previewHeight }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white text-muted-foreground">
            <FileText className="size-5" aria-hidden />
            <span className="text-[10px] font-medium">Preview</span>
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
        Page {pageNumber}
      </span>
    </button>
  )
}

export function PageThumbnails(): JSX.Element | null {
  const {
    isVisible,
    isLoading,
    pageCount,
    pageKeys,
    activePageIndex,
    pageWidth,
    pageHeight,
    thumbnailUrls,
    onSelectPage,
    onAddPageAfterLast,
    onRequestThumbnail,
  } = usePageThumbnails()

  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const [viewport, setViewport] = useState<ViewportState>({ scrollTop: 0, height: 0 })

  const pageAspectRatio = pageWidth > 0 && pageHeight > 0 ? pageWidth / pageHeight : 1
  const previewHeight = Math.max(64, Math.min(132, Math.round(THUMBNAIL_WIDTH / pageAspectRatio)))
  const itemHeight = previewHeight + ITEM_CHROME_HEIGHT + ITEM_GAP
  const activeIndex = clampIndex(activePageIndex, pageCount)

  const updateViewport = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    setViewport({ scrollTop: el.scrollTop, height: el.clientHeight })
  }, [])

  // Coalesce scroll events to one state update per frame to keep scrolling smooth
  // with 500–700 items (avoids setState churn on every native scroll tick).
  const handleScroll = useCallback((): void => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateViewport()
    })
  }, [updateViewport])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateViewport()

    const resizeObserver = new ResizeObserver(updateViewport)
    resizeObserver.observe(el)
    return () => {
      resizeObserver.disconnect()
    }
  }, [updateViewport, isLoading, pageCount, itemHeight])

  const visibleRange = useMemo(
    () =>
      getVisibleRange({
        pageCount,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
        itemHeight,
      }),
    [itemHeight, pageCount, viewport.height, viewport.scrollTop],
  )

  useEffect(() => {
    if (!onRequestThumbnail || isLoading) return

    const timerId = window.setTimeout(() => {
      for (let pageIndex = visibleRange.start; pageIndex < visibleRange.end; pageIndex += 1) {
        if (thumbnailUrls[pageIndex]) continue
        onRequestThumbnail(pageIndex)
      }
    }, THUMBNAIL_REQUEST_DEBOUNCE_MS)

    return () => window.clearTimeout(timerId)
  }, [isLoading, onRequestThumbnail, thumbnailUrls, visibleRange.end, visibleRange.start])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || pageCount <= 0) return

    const top = activeIndex * itemHeight
    const bottom = top + itemHeight
    const viewportTop = el.scrollTop
    const viewportBottom = viewportTop + el.clientHeight

    if (top < viewportTop + ITEM_GAP) {
      el.scrollTo({ top: Math.max(0, top - ITEM_GAP), behavior: 'smooth' })
      return
    }

    if (bottom > viewportBottom - ITEM_GAP) {
      el.scrollTo({ top: Math.max(0, bottom - el.clientHeight + ITEM_GAP), behavior: 'smooth' })
    }
  }, [activeIndex, itemHeight, pageCount])

  if (!isVisible) return null

  const totalHeight = pageCount * itemHeight
  const visibleItems = Array.from(
    { length: Math.max(0, visibleRange.end - visibleRange.start) },
    (_, offset) => visibleRange.start + offset,
  )

  return (
    <aside
      className="hidden shrink-0 flex-col border-r border-border bg-background/95 md:flex"
      style={{ width: RAIL_WIDTH }}
      aria-label="Page thumbnails"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-none">Pages</p>
          <p className="mt-1 text-[11px] leading-none text-muted-foreground">
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <PageThumbnailSkeleton key={index} previewHeight={previewHeight} />
            ))}
          </div>
        ) : (
          <div className="relative" style={{ height: totalHeight }}>
            <div
              className="absolute left-0 right-0 flex flex-col"
              style={{ transform: `translateY(${visibleRange.start * itemHeight}px)` }}
            >
              {visibleItems.map((pageIndex) => (
                <div
                  key={pageKeys[pageIndex] ?? `thumbnail-page-${pageIndex}`}
                  className="pb-3"
                  style={{ height: itemHeight }}
                >
                  <PageThumbnailButton
                    pageIndex={pageIndex}
                    active={pageIndex === activeIndex}
                    previewHeight={previewHeight}
                    thumbnailUrl={thumbnailUrls[pageIndex]}
                    onSelectPage={onSelectPage}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full justify-center gap-1.5 rounded-md text-xs"
          onClick={onAddPageAfterLast}
          disabled={isLoading || !onAddPageAfterLast}
        >
          <Plus className="size-3.5" aria-hidden />
          Add page
        </Button>
      </div>
    </aside>
  )
}
