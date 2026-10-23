import { memo, type ComponentType } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { CanvasPageItem } from './CanvasPageItem'
import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import type { Canvas } from 'fabric'
import { EDITOR_PAGE_ROW_WIDTH_STYLE } from '@/constants/editor-zoom-css'
import { cn } from '@/lib/utils'

type PageRowProps = {
  index: number
  pageWidth: number
  pageHeight: number
  pageCount: number
  /** The page the editor is working on (last clicked or most visible). */
  isActive?: boolean
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

type PageActionButtonProps = {
  label: string
  icon: ComponentType<{ className?: string }>
  onClick: () => void
  disabled?: boolean
  isDestructive?: boolean
}

function PageActionButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  isDestructive = false,
}: PageActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-35',
        isDestructive
          ? 'hover:bg-destructive/10 hover:text-destructive-text'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

function PageRowComponent({
  index,
  pageWidth,
  pageHeight,
  pageCount,
  isActive = false,
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
      className="flex flex-col gap-2"
      style={EDITOR_PAGE_ROW_WIDTH_STYLE}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'truncate text-sm font-semibold transition-colors',
              isActive ? 'text-primary-text' : 'text-muted-foreground',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            Page {pageNumber}
          </span>
          <span
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            title={pageNumber % 2 === 0 ? 'Even page: left-hand side of a spread' : 'Odd page: right-hand side of a spread'}
          >
            {pageParity}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-sm">
          <PageActionButton
            label="Move page up"
            icon={ChevronUp}
            onClick={() => onMoveUp?.(index)}
            disabled={!canMoveUp}
          />
          <PageActionButton
            label="Move page down"
            icon={ChevronDown}
            onClick={() => onMoveDown?.(index)}
            disabled={!canMoveDown}
          />
          <PageActionButton label="Add page below" icon={Plus} onClick={() => onAddPage?.(index)} />
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <PageActionButton label="Delete page" icon={Trash2} onClick={() => onRemove(index)} isDestructive />
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
