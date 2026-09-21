import type { DragEvent, MutableRefObject, RefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
import type { Canvas } from 'fabric'

import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import { addImageToFabricCanvasAtClientPoint } from '@/utils/canvas-image'
import { resolveBookCoverImagePlacementZone } from '@/utils/book-cover-image-placement'
import {
  getDroppedImageFile,
  getDroppedImageUrl,
  IMAGE_DND_MIME,
  readDroppedImageFileAsUrl,
} from '@/utils/image-dnd'
import { addTextToFabricCanvasAtClientPoint } from '@/utils/canvas-text'
import { getDroppedTextPayload, TEXT_DND_MIME } from '@/utils/text-dnd'
import { exitActiveFabricTextEditing } from '@/utils/fabric-interaction-guards'
import { addShapeToFabricCanvasAtClientPoint } from '@/utils/canvas-shape'
import { addPanelIconToFabricCanvasAtClientPoint } from '@/utils/canvas-icon'
import { addEmojiToFabricCanvasAtClientPoint } from '@/utils/canvas-emoji'
import { getDroppedShapePayload, SHAPE_DND_MIME } from '@/utils/shape-dnd'
import { getDroppedIconPayload, ICON_DND_MIME } from '@/utils/icon-dnd'
import { getDroppedEmojiPayload, EMOJI_DND_MIME } from '@/utils/emoji-dnd'
import {
  fetchTemplateCanvasJson,
  scaleTemplateObjectsToCanvas,
} from '@/utils/canvas-template'
import {
  collectReferencedFontFamiliesFromFabricCanvasJson,
} from '@/utils/canvas-state-store'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import {
  remeasureAllFabricEditableTextOnCanvas,
  upgradeInteractiveTextToTextbox,
} from '@/utils/canvas-text'
import { getDroppedTemplatePayload, TEMPLATE_DND_MIME } from '@/utils/template-events'
import { dispatchCanvasThumbnailInvalidated } from '@/utils/canvas-thumbnail-events'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { rehydrateEraserMetadata } from '@/utils/eraser-rehydrate'

type BookCoverDropContext = {
  isBookCoverCanvas: boolean
  shouldFitBookCoverDroppedImage: boolean
  bookCoverZones: BookCoverZones
  bookCoverDimensions: BookCoverDimensions
}

type UseFabricCanvasDropHandlersOptions = {
  fabricCanvasRef: RefObject<Canvas | null>
  canvasIndex: number
  baseWidth: number
  baseHeight: number
  onActiveCanvasChangeRef: MutableRefObject<((canvasIndex: number) => void) | undefined>
  syncFabricDimensionsToZoom: () => void
  bookCover: BookCoverDropContext
}

export type FabricCanvasDropHandlers = {
  isDropTargetActive: boolean
  handleDragEnter: (event: DragEvent<HTMLDivElement>) => void
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void
  handleDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>
}

function isSupportedDrag(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types ?? [])
  return (
    types.includes(TEMPLATE_DND_MIME) ||
    types.includes(SHAPE_DND_MIME) ||
    types.includes(TEXT_DND_MIME) ||
    types.includes(IMAGE_DND_MIME) ||
    types.includes(ICON_DND_MIME) ||
    types.includes(EMOJI_DND_MIME) ||
    types.includes('text/uri-list') ||
    types.includes('text/plain') ||
    types.includes('Files')
  )
}

/**
 * Wires drag/drop events that let users drop templates, shapes, text, icons,
 * and images onto the Fabric canvas. Drop flow is best-effort; failures
 * (CORS/network) leave the editor interactive.
 */
export function useFabricCanvasDropHandlers({
  fabricCanvasRef,
  canvasIndex,
  baseWidth,
  baseHeight,
  onActiveCanvasChangeRef,
  syncFabricDimensionsToZoom,
  bookCover,
}: UseFabricCanvasDropHandlersOptions): FabricCanvasDropHandlers {
  const [isDropTargetActive, setIsDropTargetActive] = useState(false)
  const dragDepthRef = useRef(0)

  const resetDropTarget = useCallback((): void => {
    dragDepthRef.current = 0
    setIsDropTargetActive(false)
  }, [])

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>): void => {
    if (!isSupportedDrag(event.dataTransfer)) return
    dragDepthRef.current += 1
    setIsDropTargetActive(true)
  }, [])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    if (!isSupportedDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>): void => {
    if (!isSupportedDrag(event.dataTransfer)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDropTargetActive(false)
  }, [])

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>): Promise<void> => {
      if (!isSupportedDrag(event.dataTransfer)) return
      event.preventDefault()
      event.stopPropagation()
      resetDropTarget()
      const fabricCanvas = fabricCanvasRef.current
      if (!fabricCanvas) return

      exitActiveFabricTextEditing(fabricCanvas)

      const droppedTemplate = getDroppedTemplatePayload(event.dataTransfer)
      if (droppedTemplate) {
        const history = getFabricCanvasHistoryManager(fabricCanvas)
        let didApplyTemplate = false
        history?.suspend()
        try {
          const templateJson = await fetchTemplateCanvasJson(droppedTemplate.templateJsonUrl)
          if (!templateJson) return

          const referencedFontFamilies = collectReferencedFontFamiliesFromFabricCanvasJson(templateJson)
          await Promise.all(
            referencedFontFamilies.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)),
          )

          fabricCanvas.discardActiveObject()
          await fabricCanvas.loadFromJSON(templateJson)
          syncFabricDimensionsToZoom()
          const targetSize = {
            width: baseWidth,
            height: baseHeight,
          }
          scaleTemplateObjectsToCanvas(fabricCanvas, {
            targetSize,
          })
          await upgradeInteractiveTextToTextbox(fabricCanvas)
          remeasureAllFabricEditableTextOnCanvas(fabricCanvas)
          rehydrateEraserMetadata(fabricCanvas)
          fabricCanvas.renderAll()
          didApplyTemplate = true
          onActiveCanvasChangeRef.current?.(canvasIndex)
          dispatchCanvasThumbnailInvalidated(canvasIndex)
        } catch {
          // Best-effort drop; keep editor interactive when template load fails.
        } finally {
          history?.resume()
          if (didApplyTemplate) {
            history?.recordSnapshot()
          }
        }
        return
      }

      const droppedEmoji = getDroppedEmojiPayload(event.dataTransfer)
      if (droppedEmoji) {
        await addEmojiToFabricCanvasAtClientPoint({
          canvas: fabricCanvas,
          src: droppedEmoji.publicUrl,
          clientX: event.clientX,
          clientY: event.clientY,
        })
        onActiveCanvasChangeRef.current?.(canvasIndex)
        dispatchCanvasThumbnailInvalidated(canvasIndex)
        return
      }

      const droppedIcon = getDroppedIconPayload(event.dataTransfer)
      if (droppedIcon) {
        await addPanelIconToFabricCanvasAtClientPoint({
          canvas: fabricCanvas,
          iconId: droppedIcon.iconId,
          clientX: event.clientX,
          clientY: event.clientY,
        })
        onActiveCanvasChangeRef.current?.(canvasIndex)
        dispatchCanvasThumbnailInvalidated(canvasIndex)
        return
      }

      const droppedShape = getDroppedShapePayload(event.dataTransfer)
      if (droppedShape) {
        addShapeToFabricCanvasAtClientPoint({
          canvas: fabricCanvas,
          shapeType: droppedShape.shapeType,
          clientX: event.clientX,
          clientY: event.clientY,
        })
        onActiveCanvasChangeRef.current?.(canvasIndex)
        dispatchCanvasThumbnailInvalidated(canvasIndex)
        return
      }

      const droppedText = getDroppedTextPayload(event.dataTransfer)
      if (droppedText) {
        addTextToFabricCanvasAtClientPoint({
          canvas: fabricCanvas,
          text: droppedText.text,
          fontSize: droppedText.fontSize,
          fontWeight: droppedText.fontWeight,
          clientX: event.clientX,
          clientY: event.clientY,
        })
        onActiveCanvasChangeRef.current?.(canvasIndex)
        dispatchCanvasThumbnailInvalidated(canvasIndex)
        return
      }

      const droppedFile = getDroppedImageFile(event.dataTransfer)
      const url = droppedFile
        ? await readDroppedImageFileAsUrl(droppedFile)
        : getDroppedImageUrl(event.dataTransfer)
      if (url) {
        try {
          const pointer = fabricCanvas.getScenePoint({
            clientX: event.clientX,
            clientY: event.clientY,
          } as MouseEvent)
          const coverPlacementZone = bookCover.shouldFitBookCoverDroppedImage
            ? resolveBookCoverImagePlacementZone(
                bookCover.bookCoverZones,
                bookCover.bookCoverDimensions,
                pointer.x,
              )
            : undefined
          await addImageToFabricCanvasAtClientPoint({
            canvas: fabricCanvas,
            src: url,
            clientX: event.clientX,
            clientY: event.clientY,
            fitMode: bookCover.shouldFitBookCoverDroppedImage ? 'cover' : 'default',
            placementZone: coverPlacementZone,
          })
          onActiveCanvasChangeRef.current?.(canvasIndex)
          dispatchCanvasThumbnailInvalidated(canvasIndex)
        } catch {
          // Best-effort drop; if CORS blocks decode/draw we simply do nothing.
        }
        return
      }
    },
    [
      baseHeight,
      baseWidth,
      bookCover,
      canvasIndex,
      fabricCanvasRef,
      onActiveCanvasChangeRef,
      resetDropTarget,
      syncFabricDimensionsToZoom,
    ],
  )

  return {
    isDropTargetActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
