import type React from 'react'
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { setIconDragData } from '@/utils/icon-dnd'
import {
  getCachedPhosphorIconSvg,
  loadPhosphorIconSvg,
  PHOSPHOR_PANEL_ICONS,
} from '@/utils/phosphor-dynamic-icons'

const ALL_ICONS = PHOSPHOR_PANEL_ICONS

const COLS = 5
const ROW_HEIGHT_PX = 30
/** Vertical gap between icon rows (virtual stride includes this). */
const ROW_GAP_PX = 8
const ROW_STRIDE_PX = ROW_HEIGHT_PX + ROW_GAP_PX
/** Extra scroll space so the last row is not clipped by the container edge. */
const BOTTOM_PAD_PX = 8

function chunkRows<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols) as T[])
  }
  return rows
}

const PhosphorIconTile = memo(function PhosphorIconTile({ name }: { name: string }): JSX.Element {
  const [svg, setSvg] = useState<string | null>(() => getCachedPhosphorIconSvg(name))

  useEffect(() => {
    const cached = getCachedPhosphorIconSvg(name)
    if (cached) {
      setSvg(cached)
      return
    }

    let cancelled = false
    void loadPhosphorIconSvg(name).then((loaded) => {
      if (!cancelled && loaded) setSvg(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [name])

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>): void => {
    setIconDragData(event.dataTransfer, { iconId: name, label: name })
  }

  return (
    <div
      draggable={Boolean(svg)}
      aria-label={name}
      onDragStart={handleDragStart}
      className={`flex size-full min-h-0 min-w-0 items-center justify-center rounded-md border border-border bg-card p-0.5 transition-colors hover:border-primary/50 hover:bg-accent/40 active:cursor-grabbing ${svg ? 'cursor-grab' : 'cursor-wait opacity-70'}`}
    >
      {svg ? (
        <span
          className="inline-flex size-4 shrink-0 text-muted-foreground [&_svg]:block [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
          aria-hidden
        />
      ) : (
        <span className="size-4 shrink-0 rounded bg-muted/80" aria-hidden />
      )}
    </div>
  )
})

export function IconPanel(): JSX.Element {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const pendingScrollTopRef = useRef(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(360)

  const normalizedQuery = deferredQuery.trim().toLowerCase()

  const filteredIcons = useMemo(() => {
    if (!normalizedQuery) return ALL_ICONS
    return ALL_ICONS.filter((icon) => icon.searchHaystack.includes(normalizedQuery))
  }, [normalizedQuery])

  const rows = useMemo(() => chunkRows(filteredIcons, COLS), [filteredIcons])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [normalizedQuery])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

  const totalRows = rows.length
  const totalHeight =
    totalRows === 0 ? 0 : (totalRows - 1) * ROW_STRIDE_PX + ROW_HEIGHT_PX + BOTTOM_PAD_PX
  const overscan = 4
  const visibleRowsApprox = Math.ceil(viewportH / ROW_STRIDE_PX) + overscan * 2
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_STRIDE_PX) - overscan)
  const endRow = Math.min(totalRows, startRow + visibleRowsApprox)
  const visibleRows = rows.slice(startRow, endRow)
  const offsetY = startRow * ROW_STRIDE_PX

  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      setScrollTop(pendingScrollTopRef.current)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <label className="sr-only" htmlFor="icon-panel-search">
        Search icons
      </label>
      <input
        id="icon-panel-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons (e.g. heart, arrow)"
        autoComplete="off"
        spellCheck={false}
        className="w-full shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
      />
      <p className="shrink-0 text-[11px] text-muted-foreground">
        {filteredIcons.length === ALL_ICONS.length
          ? `${ALL_ICONS.length} icons, drag onto canvas`
          : `${filteredIcons.length} / ${ALL_ICONS.length} icons`}
      </p>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-md"
        onScroll={handleScroll}
      >
        {totalRows === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">No icons match your search.</p>
        ) : (
          <div className="relative" style={{ height: totalHeight }}>
            <div
              className="absolute left-0 right-0 flex flex-col"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {visibleRows.map((row, rowIdx) => {
                const globalRowIndex = startRow + rowIdx
                return (
                  <div
                    key={globalRowIndex}
                    className="grid w-full shrink-0 gap-1"
                    style={{
                      height: ROW_HEIGHT_PX,
                      marginBottom: globalRowIndex < totalRows - 1 ? ROW_GAP_PX : 0,
                      gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                    }}
                  >
                    {row.map((icon) => (
                      <PhosphorIconTile key={icon.name} name={icon.name} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
