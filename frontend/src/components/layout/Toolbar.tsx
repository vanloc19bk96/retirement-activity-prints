import {
  MoreHorizontal,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TextToolbarState, TextToolbarStyle } from '@/types/text-toolbar.types'
import type { ShapeBorderStyle } from '@/utils/fabric-selection'
import { ToolbarControls } from './ToolbarControls'
import type { ToolbarControlsProps } from './ToolbarControls'
import { ToolbarPrimaryControls } from './ToolbarPrimaryControls'
import { ToolbarOverflowControls } from './ToolbarOverflowControls'

type ToolbarProps = {
  hasSelection: boolean
  isSelectionLocked?: boolean
  isImageSelection?: boolean
  isEraseToolActive?: boolean
  eraseBrushSize?: number
  onEraseBrushSizeChange?: (size: number) => void
  isBookCoverMode?: boolean
  bookCoverGuideOpacity?: number
  onBookCoverGuideOpacityChange?: (opacity: number) => void
  textSelection?: TextToolbarState | null
  shapeSelection?:
    | {
        strokeWidth: number
        borderStyle: ShapeBorderStyle
        strokeColor: string
        fillColor: string
        canEditCornerRadius: boolean
        cornerRadius: number
        cornerRadiusMax?: number
      }
    | null
  onBringToFrontSelection?: () => void
  onSendToBackSelection?: () => void
  onFontFamilyChange?: (fontFamily: string) => void
  onFontSizeChange?: (fontSize: number) => void
  onTextColorChange?: (textColor: string) => void
  onToggleTextStyle?: (style: TextToolbarStyle) => void
  onStrokeWidthChange?: (strokeWidth: number) => void
  onBorderStyleChange?: (borderStyle: ShapeBorderStyle) => void
  onStrokeColorChange?: (strokeColor: string) => void
  onFillColorChange?: (fillColor: string) => void
  onCornerRadiusChange?: (cornerRadius: number) => void
  onOpenAlignmentPanel?: () => void
}

export function Toolbar({
  hasSelection,
  isSelectionLocked = false,
  isImageSelection = false,
  isEraseToolActive = false,
  eraseBrushSize = 24,
  onEraseBrushSizeChange,
  isBookCoverMode = false,
  bookCoverGuideOpacity = 1,
  onBookCoverGuideOpacityChange,
  textSelection = null,
  shapeSelection = null,
  onBringToFrontSelection,
  onSendToBackSelection,
  onFontFamilyChange,
  onFontSizeChange,
  onTextColorChange,
  onToggleTextStyle,
  onStrokeWidthChange,
  onBorderStyleChange,
  onStrokeColorChange,
  onFillColorChange,
  onCornerRadiusChange,
  onOpenAlignmentPanel,
}: ToolbarProps): JSX.Element {
  const toolbarWidthRef = useRef<HTMLDivElement | null>(null)
  const toolbarMeasureRef = useRef<HTMLDivElement | null>(null)
  const [isCompact, setIsCompact] = useState(false)
  const guideOpacity = Math.max(0, Math.min(1, bookCoverGuideOpacity))
  const isCompactRef = useRef(isCompact)
  isCompactRef.current = isCompact
  const bookCoverGuideOpacityControl = (
    <label
      className="flex items-center gap-2 text-sm text-muted-foreground"
      aria-label="Book cover guide opacity"
    >
      <span className="sr-only">Book cover guide opacity</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={guideOpacity}
        onChange={(e) => {
          const nextValue = Number(e.target.value)
          onBookCoverGuideOpacityChange?.(Math.max(0, Math.min(1, nextValue)))
        }}
        aria-label="Book cover guide opacity"
        className="h-2 w-32 cursor-pointer accent-[var(--color-control-accent)]"
      />
      <span className="w-10 text-right text-xs text-muted-foreground">{Math.round(guideOpacity * 100)}%</span>
    </label>
  )
  const eraseBrushSizeControl = (
    <div className="flex h-8 items-center gap-2 rounded-md border border-border/80 bg-background/70 px-2">
      <label
        className="flex h-full items-center gap-2 text-sm text-muted-foreground leading-none"
        aria-label="Erase brush size"
      >
        <span className="whitespace-nowrap text-xs text-muted-foreground">Brush size</span>
        <input
          type="range"
          min={4}
          max={120}
          step={1}
          value={eraseBrushSize}
          onChange={(event) => onEraseBrushSizeChange?.(Number(event.target.value))}
          aria-label="Erase brush size"
          className="m-0 block h-2 w-24 translate-y-px self-center cursor-pointer align-middle accent-[var(--color-primary)]"
        />
        <span className="w-10 text-right text-xs text-muted-foreground">{eraseBrushSize}px</span>
      </label>
    </div>
  )

  const toolbarControlsProps: ToolbarControlsProps = {
    textSelection,
    shapeSelection,
    isImageSelection,
    isEraseToolActive,
    eraseBrushSize,
    onEraseBrushSizeChange,
    isSelectionLocked,
    isBookCoverMode,
    bookCoverGuideOpacityControl,
    onBringToFrontSelection,
    onSendToBackSelection,
    onFontFamilyChange,
    onFontSizeChange,
    onTextColorChange,
    onToggleTextStyle,
    onStrokeWidthChange,
    onBorderStyleChange,
    onStrokeColorChange,
    onFillColorChange,
    onCornerRadiusChange,
    onOpenAlignmentPanel,
  }

  const selectionControls = <ToolbarControls {...toolbarControlsProps} />
  const primaryControls = <ToolbarPrimaryControls {...toolbarControlsProps} />
  const overflowControls = <ToolbarOverflowControls {...toolbarControlsProps} />
  const isShapeToolbarMode = Boolean(shapeSelection && !textSelection && !isImageSelection)
  const isTextToolbarMode = Boolean(textSelection)

  useLayoutEffect(() => {
    if (!hasSelection) {
      if (isCompactRef.current) setIsCompact(false)
      return
    }

    const containerEl = toolbarWidthRef.current
    const measureEl = toolbarMeasureRef.current
    if (!containerEl || !measureEl) return

    const updateCompactState = () => {
      const clientWidth = containerEl.clientWidth
      const contentScrollWidth = measureEl.scrollWidth
      const isOverflowing = contentScrollWidth > clientWidth + 24

      if (isOverflowing && !isCompactRef.current) setIsCompact(true)
      if (!isOverflowing && isCompactRef.current) setIsCompact(false)
    }

    updateCompactState()

    const observer = new ResizeObserver(() => {
      updateCompactState()
    })
    observer.observe(containerEl)

    return () => observer.disconnect()
  }, [
    hasSelection,
    isImageSelection,
    isBookCoverMode,
    isSelectionLocked,
    textSelection,
    shapeSelection,
    bookCoverGuideOpacity,
  ])

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-12 w-full min-w-0 items-center justify-start border-b border-border bg-card px-4">
      {!hasSelection ? (
        isBookCoverMode ? (
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div aria-hidden="true" />
            <span className="text-sm text-muted-foreground">Select an object to see options</span>
            <div className="justify-self-end">{bookCoverGuideOpacityControl}</div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-start gap-3">
            {!isEraseToolActive ? (
              <span className="text-sm text-muted-foreground">Select an object to see options</span>
            ) : null}
            {isEraseToolActive ? eraseBrushSizeControl : null}
          </div>
        )
      ) : (
        <div
          ref={toolbarWidthRef}
          className="relative min-w-0 flex w-full items-center gap-3"
          role="toolbar"
          aria-label="Canvas toolbar"
        >
          <div
            ref={toolbarMeasureRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 flex w-full min-w-0 items-center gap-3 opacity-0"
          >
            {selectionControls}
          </div>
          {!isCompact ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">{selectionControls}</div>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-3">{primaryControls}</div>
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="More toolbar options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align={isShapeToolbarMode || isTextToolbarMode ? 'start' : 'end'}
                  side="bottom"
                  sideOffset={8}
                  role="menu"
                  aria-label="Toolbar options"
                className="min-w-[10rem] max-w-[70vw] border-border bg-background p-2 data-[state=open]:opacity-100 data-[state=closed]:opacity-100 !opacity-100 data-[state=open]:animate-none data-[state=closed]:animate-none"
                style={{ backgroundColor: 'var(--color-background)', opacity: 1 }}
                >
                  <div className="max-h-[70vh] w-auto overflow-auto pr-1">
                    <div className="flex max-w-full flex-wrap items-center gap-3">{overflowControls}</div>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      )}
      </div>
    </TooltipProvider>
  )
}
