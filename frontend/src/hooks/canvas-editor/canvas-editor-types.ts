import type { CanvasAlignmentAction } from '@/utils/canvas-align'
import type { CanvasSelectionInfo, ShapeBorderStyle } from '@/utils/fabric-selection'
import type { TextToolbarState, TextToolbarStyle } from '@/types/text-toolbar.types'
import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { Canvas } from 'fabric'

export type UseCanvasEditorOptions = {
  defaultTextFontFamily?: string
  defaultTextFontSize?: number
  /** When true, images dropped on the book cover auto-fit to the front/back zone. */
  fitDroppedImagesToPage?: boolean
  bookCoverZones?: BookCoverZones
  bookCoverDimensions?: BookCoverDimensions
}

export type ShapeSelectionState = {
  strokeWidth: number
  borderStyle: ShapeBorderStyle
  strokeColor: string
  fillColor: string
  canEditCornerRadius: boolean
  cornerRadius: number
  /** Half of shorter side of the rect; valid rx/ry cannot exceed this. */
  cornerRadiusMax?: number
} | null

export type ToolbarBindings = {
  hasSelection: boolean
  selectionCount: number
  isSelectionLocked: boolean
  isImageSelection: boolean
  textSelection: TextToolbarState | null
  shapeSelection: ShapeSelectionState
  onAlign: (align: CanvasAlignmentAction) => void
  /** Canvas-space nudge in px; used for keyboard arrow moves. */
  onNudgeSelection: (deltaX: number, deltaY: number) => void
  onToggleLock: () => void
  onDeleteSelection: () => void
  onBringToFrontSelection: () => void
  onSendToBackSelection: () => void
  onCopySelection: () => void
  onPasteSelection: () => void
  onGroupSelection: () => void
  onUngroupSelection: () => void
  onFontFamilyChange: (fontFamily: string) => void
  onFontSizeChange: (fontSize: number) => void
  onTextColorChange: (textColor: string) => void
  onToggleTextStyle: (style: TextToolbarStyle) => void
  onStrokeWidthChange: (strokeWidth: number) => void
  onBorderStyleChange: (borderStyle: ShapeBorderStyle) => void
  onStrokeColorChange: (strokeColor: string) => void
  onFillColorChange: (fillColor: string) => void
  onCornerRadiusChange: (cornerRadius: number) => void
}

export type PageRowBindings = {
  onCanvasReady: (canvasIndex: number, canvas: Canvas | null) => void
  onActiveCanvasChange: (canvasIndex: number) => void
  onIsSelectionLockedChange: (canvasIndex: number, isLocked: boolean) => void
  onHasSelectionChange: (canvasIndex: number, hasSelection: boolean) => void
  onSelectionInfoChange: (canvasIndex: number, info: CanvasSelectionInfo) => void
}

export type HistoryBindings = {
  /** Roll the active canvas back to the previous snapshot; no-op when the stack is empty. */
  undoActiveCanvas: () => void
  /** Re-apply the most recently undone snapshot on the active canvas. */
  redoActiveCanvas: () => void
}

export type CanvasEditorBindings = {
  toolbar: ToolbarBindings
  pageRow: PageRowBindings
  history: HistoryBindings
  exportCanvasDataByIndex: (canvasIndex: number) => object | null
  getCanvasByIndex: (canvasIndex: number) => Canvas | null
  /** Removes every object from every mounted Fabric canvas and resets editor selection state. */
  clearAllCanvases: () => void
  /** Clears only interior canvases (`page_index >= 0`); leaves book cover (`-1`) unchanged. */
  clearInteriorCanvasesOnly: () => void
  /** Clears only the book cover canvas (`-1`); interior pages unchanged. */
  clearCoverCanvasOnly: () => void
}
