import { memo } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { CanvasPageItem } from './CanvasPageItem'
import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import type { Canvas } from 'fabric'
import { EDITOR_PAGE_ROW_WIDTH_STYLE } from '@/constants/editor-zoom-css'

type PageRowProps = {
  index: number
  pageWidth: number
  pageHeight: number
  pageCount: number
  onRemove: (index: number) => void
  onAddPage?: (index: number) => void
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
  onRef: (index: number, el: HTMLDivElement | null) => void
  onHasSelectionChange: (canvasIndex: number, hasSelection: boolean) => void
  onSelectionInfoChange?: (canvasIndex: number, info: CanvasSelectionInfo) => void
  onCanvasReady?: (canvasIndex: number, canvas: Canvas | null) => void
  onActiveCanvasChange?: (canvasIndex: number) => void
  onIsSelectionLockedChange?: (canvasIndex: number, isLocked: boolean) => void
  canvasStateStore?: CanvasStateStore
  showCanvasGrid?: boolean
}

function PageRowComponent({
  index,
  pageWidth,
  pageHeight,
  pageCount,
  onRemove,
  onAddPage,
  onMoveUp,
  onMoveDown,
  onRef,
  onHasSelectionChange,
  onSelectionInfoChange,
  onCanvasReady,
  onActiveCanvasChange,
  onIsSelectionLockedChange,
  canvasStateStore,
  showCanvasGrid = false,
}: PageRowProps): JSX.Element {
  const pageNumber = index + 1
  const pageParity = pageNumber % 2 === 0 ? 'Even' : 'Odd'
  const canMoveUp = index > 0
  const canMoveDown = index < pageCount - 1

  return (
    <div
      ref={(el) => onRef(index, el)}
      data-editor-page-root
      data-page-index={index}
      className="flex flex-col gap-1"
      style={EDITOR_PAGE_ROW_WIDTH_STYLE}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Page {pageNumber} - {pageParity}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMoveUp?.(index)}
            disabled={!canMoveUp}
            className="rounded border border-border bg-card p-1 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label="Move page up"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown?.(index)}
            disabled={!canMoveDown}
            className="rounded border border-border bg-card p-1 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label="Move page down"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onAddPage?.(index)}
            className="rounded border border-border bg-card p-1 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            aria-label="Add page"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded border border-border bg-card p-1 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            aria-label="Delete page"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <CanvasPageItem
        width={pageWidth}
        height={pageHeight}
        id={`canvas-${index}`}
        totalPages={pageCount}
        canvasIndex={index}
        onCanvasReady={onCanvasReady}
        onActiveCanvasChange={onActiveCanvasChange}
        onIsSelectionLockedChange={onIsSelectionLockedChange}
        onHasSelectionChange={(hasSelection) =>
          onHasSelectionChange(index, hasSelection)
        }
        onSelectionInfoChange={(info) => onSelectionInfoChange?.(index, info)}
        canvasStateStore={canvasStateStore}
        showGrid={showCanvasGrid}
      />
    </div>
  )
}

export const PageRow = memo(PageRowComponent)
