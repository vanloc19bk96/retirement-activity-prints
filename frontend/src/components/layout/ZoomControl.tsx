import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
export const DEFAULT_ZOOM = 0.9

const SLIDER_MIN_PERCENT = MIN_ZOOM * 100
const SLIDER_MAX_PERCENT = MAX_ZOOM * 100
const SLIDER_RANGE = 100
const LOG_RATIO = Math.log(SLIDER_MAX_PERCENT / SLIDER_MIN_PERCENT)

export function clampZoom(level: number): number {
  if (Number.isNaN(level)) return DEFAULT_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level))
}

function positionToPercent(position: number): number {
  const t = Math.max(0, Math.min(SLIDER_RANGE, position)) / SLIDER_RANGE
  return SLIDER_MIN_PERCENT * Math.exp(LOG_RATIO * t)
}

function percentToPosition(percent: number): number {
  const clamped = Math.max(SLIDER_MIN_PERCENT, Math.min(SLIDER_MAX_PERCENT, percent))
  return (SLIDER_RANGE * Math.log(clamped / SLIDER_MIN_PERCENT)) / LOG_RATIO
}

export type ZoomControlProps = {
  zoomLevel: number
  onZoomChange: (level: number) => void
  currentPage?: number
  totalPages: number
  /** Interior: opens reset flow. Cover: clears cover canvas only. */
  onRemoveCanvas?: () => void
  className?: string
}

export function ZoomControl({
  zoomLevel,
  onZoomChange,
  currentPage = 1,
  totalPages,
  onRemoveCanvas,
  className,
}: ZoomControlProps) {
  // Local drag position keeps the thumb responsive while heavy parent
  // re-renders (canvas resync) are coalesced to one per animation frame.
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingZoomRef = useRef<number | null>(null)

  const propPosition = percentToPosition(zoomLevel * 100)
  const position = dragPosition ?? propPosition
  const displayPercent =
    dragPosition === null
      ? Math.round(zoomLevel * 100)
      : Math.round(positionToPercent(dragPosition))

  const flushPendingZoom = useCallback(() => {
    if (pendingZoomRef.current === null) return
    onZoomChange(pendingZoomRef.current)
    pendingZoomRef.current = null
  }, [onZoomChange])

  const handleSliderChange = (pos: number) => {
    setDragPosition(pos)
    pendingZoomRef.current = clampZoom(positionToPercent(pos) / 100)
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      flushPendingZoom()
    })
  }

  const handleSliderCommit = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    flushPendingZoom()
    setDragPosition(null)
  }

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleResetZoom = () => {
    onZoomChange(clampZoom(DEFAULT_ZOOM))
  }

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="group"
      aria-label="Zoom"
    >
      {totalPages > 0 && (
        <span
          className="min-w-[2.5rem] text-center text-xs font-medium tabular-nums text-muted-foreground"
          aria-label={`Page ${currentPage} of ${totalPages}`}
        >
          Page {currentPage} / {totalPages}
        </span>
      )}
      <span className="min-w-[2.75rem] text-right text-xs font-medium tabular-nums text-muted-foreground">
        {displayPercent}%
      </span>
      <input
        type="range"
        min={0}
        max={SLIDER_RANGE}
        step={1}
        value={Math.round(position)}
        onChange={(event) => handleSliderChange(Number(event.target.value))}
        onPointerUp={handleSliderCommit}
        onBlur={handleSliderCommit}
        className="h-2 w-28 cursor-pointer accent-[var(--color-control-accent)]"
        aria-valuemin={0}
        aria-valuemax={SLIDER_RANGE}
        aria-valuenow={Math.round(position)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={handleResetZoom}
        aria-label="Reset zoom to 90%"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
      {onRemoveCanvas ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
          onClick={onRemoveCanvas}
          aria-label="Remove canvas content"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

