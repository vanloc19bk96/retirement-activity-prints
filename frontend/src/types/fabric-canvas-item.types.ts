import type { Canvas } from 'fabric'
import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

export type CanvasLogicalSize = {
  width: number
  height: number
}

export type CoverPlacementZone = {
  x: number
  y: number
  width: number
  height: number
}

export type CoverPlacementKind = 'back' | 'spine' | 'front'

/**
 * Fabric image-like object extended with the editor-specific `_coverZone`
 * metadata used to remember the book-cover fit area for repositioning.
 */
export type CoverFittableImage = {
  type?: string
  width?: number
  height?: number
  left?: number
  _coverZone?: {
    x: number
    y: number
    width: number
    height: number
  }
  _coverPlacementKind?: CoverPlacementKind
  set: (options: Record<string, unknown>) => void
  setCoords: () => void
}

export type FabricCanvasItemProps = {
  width?: number
  height?: number
  id?: string
  zoomLevel?: number
  totalPages?: number
  canvasIndex?: number
  isLoading?: boolean
  isBookCover?: boolean
  bookCoverGuideOpacity?: number
  onHasSelectionChange?: (hasSelection: boolean) => void
  onSelectionInfoChange?: (info: CanvasSelectionInfo) => void
  onCanvasReady?: (canvasIndex: number, canvas: Canvas | null) => void
  onActiveCanvasChange?: (canvasIndex: number) => void
  onIsSelectionLockedChange?: (canvasIndex: number, isLocked: boolean) => void
  canvasStateStore?: CanvasStateStore
  /** Editor-only overlay; not part of Fabric export/download */
  showGrid?: boolean
}
