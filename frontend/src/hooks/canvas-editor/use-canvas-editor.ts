import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Canvas } from 'fabric'

import type { CanvasEditorBindings, ShapeSelectionState, UseCanvasEditorOptions } from './canvas-editor-types'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
} from './canvas-editor-constants'
import {
  readActiveRectTargets,
  readActiveShapeTargets,
  readActiveTextObject,
} from './canvas-editor-queries'
import { useCanvasEditorPageRowBindings } from './use-canvas-editor-page-row-bindings'
import { useCanvasEditorToolbarBindings } from './use-canvas-editor-toolbar-bindings'
import type { TextToolbarState } from '@/types/text-toolbar.types'
import {
  collectReferencedFontFamiliesFromFabricCanvasJson,
  exportLiveFabricCanvasJson,
} from '@/utils/canvas-state-store'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { remeasureAllFabricEditableTextOnCanvas, upgradeInteractiveTextToTextbox } from '@/utils/canvas-text'
import { addImageToFabricCanvasAtClientPoint } from '@/utils/canvas-image'
import { resolveBookCoverImagePlacementZone } from '@/utils/book-cover-image-placement'
import {
  fetchTemplateCanvasJson,
  getCanvasLogicalSize,
  scaleTemplateObjectsToCanvas,
} from '@/utils/canvas-template'
import {
  CANVAS_ALIGNMENT_CONTEXT_CHANGED_EVENT,
  REQUEST_CANVAS_ALIGNMENT_EVENT,
  REQUEST_CANVAS_TEXT_PARAGRAPH_ALIGN_EVENT,
  type CanvasAlignmentContextChangedEventDetail,
  type RequestCanvasAlignmentEventDetail,
  type RequestCanvasTextParagraphAlignEventDetail,
} from '@/utils/alignment-events'
import {
  APPLY_TEMPLATE_TO_CANVAS_EVENT,
  type ApplyTemplateToCanvasEventDetail,
} from '@/utils/template-events'
import { dispatchCanvasThumbnailInvalidated } from '@/utils/canvas-thumbnail-events'
import { alignSelectionAction, applyTextParagraphAlignAction } from './canvas-editor-actions'
import type { AlignmentPanelTextContext } from './use-canvas-editor-page-row-bindings'

const AUTO_ADD_GENERATED_IMAGE_EVENT = 'canvas:auto-add-generated-image'
const CANVAS_ALIGNMENT_VALUES = [
  'left',
  'center',
  'right',
  'top',
  'middle',
  'bottom',
  'space-horizontal',
  'space-vertical',
  'tidy-up',
] as const

function isCanvasAlignmentValue(value: unknown): value is (typeof CANVAS_ALIGNMENT_VALUES)[number] {
  return typeof value === 'string' && CANVAS_ALIGNMENT_VALUES.includes(value as (typeof CANVAS_ALIGNMENT_VALUES)[number])
}

function restoreCanvasDimensionsAndViewport(args: {
  canvas: Canvas
  targetSize: ReturnType<typeof getCanvasLogicalSize>
  viewportTransform: [number, number, number, number, number, number] | null
}): void {
  const { canvas, targetSize, viewportTransform } = args
  const zoomX = Math.abs(viewportTransform?.[0] ?? canvas.getZoom())
  const zoomY = Math.abs(viewportTransform?.[3] ?? zoomX)

  if (
    targetSize &&
    Number.isFinite(targetSize.width) &&
    Number.isFinite(targetSize.height) &&
    targetSize.width > 0 &&
    targetSize.height > 0 &&
    Number.isFinite(zoomX) &&
    Number.isFinite(zoomY) &&
    zoomX > 0 &&
    zoomY > 0
  ) {
    canvas.setDimensions({
      width: Math.round(targetSize.width * zoomX),
      height: Math.round(targetSize.height * zoomY),
    })
  }

  if (viewportTransform) {
    canvas.setViewportTransform(viewportTransform)
  }
}

export function useCanvasEditor(options?: UseCanvasEditorOptions): CanvasEditorBindings {
  const defaultTextFontFamily = options?.defaultTextFontFamily ?? DEFAULT_TEXT_FONT_FAMILY
  const defaultTextFontSize = options?.defaultTextFontSize ?? DEFAULT_TEXT_FONT_SIZE

  const bookCoverDropRef = useRef({
    fitDroppedImagesToPage: true as boolean,
    zones: options?.bookCoverZones,
    dimensions: options?.bookCoverDimensions,
  })
  useLayoutEffect(() => {
    bookCoverDropRef.current = {
      fitDroppedImagesToPage: options?.fitDroppedImagesToPage ?? true,
      zones: options?.bookCoverZones,
      dimensions: options?.bookCoverDimensions,
    }
  }, [options?.fitDroppedImagesToPage, options?.bookCoverZones, options?.bookCoverDimensions])

  const [selectionByCanvas, setSelectionByCanvas] = useState<Record<number, boolean>>({})
  const [selectedObjectCount, setSelectedObjectCount] = useState(0)
  const [alignmentPanelTextContext, setAlignmentPanelTextContext] = useState<AlignmentPanelTextContext>({
    isEditableText: false,
    paragraphAlign: 'left',
  })
  const [, setActiveCanvasIndex] = useState<number | null>(null)
  const activeCanvasIndexRef = useRef<number | null>(null)

  const [isSelectionLocked, setIsSelectionLocked] = useState(false)
  const [textSelection, setTextSelection] = useState<TextToolbarState | null>(null)
  const [shapeSelection, setShapeSelection] = useState<ShapeSelectionState>(null)

  const [isImageSelection, setIsImageSelection] = useState(false)

  const canvasByIndexRef = useRef<Record<number, Canvas>>({})

  const hasSelection = useMemo(() => Object.values(selectionByCanvas).some(Boolean), [selectionByCanvas])

  const getActiveCanvas = useCallback((): Canvas | null => {
    const index = activeCanvasIndexRef.current
    if (index == null) return null
    return canvasByIndexRef.current[index] ?? null
  }, [])

  const clearActiveSelectionState = useCallback(() => {
    activeCanvasIndexRef.current = null
    setActiveCanvasIndex(null)
    setIsSelectionLocked(false)
    setSelectedObjectCount(0)
    setAlignmentPanelTextContext({ isEditableText: false, paragraphAlign: 'left' })
    setTextSelection(null)
    setShapeSelection(null)
    setIsImageSelection(false)
  }, [])

  const requestRender = useCallback(() => {
    getActiveCanvas()?.requestRenderAll?.()
  }, [getActiveCanvas])

  const getActiveTextObject = useCallback((): any | null => readActiveTextObject(getActiveCanvas()), [getActiveCanvas])
  const getActiveShapeTargets = useCallback(() => readActiveShapeTargets(getActiveCanvas()), [getActiveCanvas])
  const getActiveRectTargets = useCallback(() => readActiveRectTargets(getActiveCanvas()), [getActiveCanvas])

  const toolbar = useCanvasEditorToolbarBindings({
    hasSelection,
    selectionCount: selectedObjectCount,
    isSelectionLocked,
    isImageSelection,
    textSelection,
    shapeSelection,
    requestRender,
    getActiveCanvas,
    getActiveTextObject,
    getActiveShapeTargets,
    getActiveRectTargets,
    setIsSelectionLocked,
    setTextSelection,
    setShapeSelection,
  })

  const pageRowBase = useCanvasEditorPageRowBindings({
    defaultTextFontFamily,
    defaultTextFontSize,
    activeCanvasIndexRef,
    canvasByIndexRef,
    setActiveCanvasIndex,
    setIsSelectionLocked,
    setSelectionByCanvas,
    setSelectedObjectCount,
    setAlignmentPanelTextContext,
    clearActiveSelectionState,
    setIsImageSelection,
    setShapeSelection,
    setTextSelection,
  })

  const pageRow = pageRowBase

  const exportCanvasDataByIndex = useCallback(
    (canvasIndex: number): object | null => {
      const canvas = canvasByIndexRef.current[canvasIndex]
      if (!canvas) return null
      try {
        return exportLiveFabricCanvasJson(canvas)
      } catch {
        return null
      }
    },
    [],
  )

  const undoActiveCanvas = useCallback((): void => {
    const history = getFabricCanvasHistoryManager(getActiveCanvas())
    if (!history) return
    void history.undo()
  }, [getActiveCanvas])

  const redoActiveCanvas = useCallback((): void => {
    const history = getFabricCanvasHistoryManager(getActiveCanvas())
    if (!history) return
    void history.redo()
  }, [getActiveCanvas])

  const history = useMemo(
    () => ({ undoActiveCanvas, redoActiveCanvas }),
    [undoActiveCanvas, redoActiveCanvas],
  )

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<CanvasAlignmentContextChangedEventDetail>(CANVAS_ALIGNMENT_CONTEXT_CHANGED_EVENT, {
        detail: {
          selectionCount: selectedObjectCount,
          isEditableTextSelection: alignmentPanelTextContext.isEditableText,
          textParagraphAlign: alignmentPanelTextContext.paragraphAlign,
        },
      }),
    )
  }, [selectedObjectCount, alignmentPanelTextContext])

  const clearAllCanvases = useCallback((): void => {
    for (const canvas of Object.values(canvasByIndexRef.current)) {
      if (!canvas) continue
      try {
        canvas.discardActiveObject()
        const objects = canvas.getObjects()
        if (objects.length > 0) {
          canvas.remove(...objects)
        }
        canvas.requestRenderAll()
      } catch {
        // Canvas may be disposing; best-effort clear
      }
    }
    setSelectionByCanvas({})
    clearActiveSelectionState()
  }, [clearActiveSelectionState, setSelectionByCanvas])

  const clearInteriorCanvasesOnly = useCallback((): void => {
    for (const [key, canvas] of Object.entries(canvasByIndexRef.current)) {
      const index = Number(key)
      if (!Number.isFinite(index) || index < 0 || !canvas) continue
      try {
        canvas.discardActiveObject()
        const objects = canvas.getObjects()
        if (objects.length > 0) {
          canvas.remove(...objects)
        }
        canvas.requestRenderAll()
      } catch {
        // Canvas may be disposing; best-effort clear
      }
    }
    setSelectionByCanvas({})
    clearActiveSelectionState()
  }, [clearActiveSelectionState, setSelectionByCanvas])

  const clearCoverCanvasOnly = useCallback((): void => {
    const canvas = canvasByIndexRef.current[-1]
    if (canvas) {
      try {
        canvas.discardActiveObject()
        const objects = canvas.getObjects()
        if (objects.length > 0) {
          canvas.remove(...objects)
        }
        canvas.requestRenderAll()
      } catch {
        // Canvas may be disposing; best-effort clear
      }
    }
    setSelectionByCanvas({})
    clearActiveSelectionState()
  }, [clearActiveSelectionState, setSelectionByCanvas])

  useEffect(() => {
    const resolveActiveCanvas = (): Canvas | null => {
      const activeCanvasIndex = activeCanvasIndexRef.current
      if (activeCanvasIndex == null) return null
      return canvasByIndexRef.current[activeCanvasIndex] ?? null
    }

    const resolveTemplateTarget = (): { canvasIndex: number; canvas: Canvas } | null => {
      const byIndex = canvasByIndexRef.current
      const active = activeCanvasIndexRef.current
      if (typeof active === 'number' && byIndex[active]) {
        return { canvasIndex: active, canvas: byIndex[active] }
      }
      const interiorIndices = Object.keys(byIndex)
        .map(Number)
        .filter((i) => i >= 0 && byIndex[i])
        .sort((a, b) => a - b)
      const firstInterior = interiorIndices[0]
      if (firstInterior !== undefined) {
        return { canvasIndex: firstInterior, canvas: byIndex[firstInterior] }
      }
      if (byIndex[-1]) {
        return { canvasIndex: -1, canvas: byIndex[-1] }
      }
      return null
    }

    const handleApplyTemplateToCanvas = (event: Event): void => {
      const customEvent = event as CustomEvent<ApplyTemplateToCanvasEventDetail>
      const templateJsonUrl = customEvent.detail?.templateJsonUrl
      if (typeof templateJsonUrl !== 'string' || templateJsonUrl.trim().length === 0) return

      const resolved = resolveTemplateTarget()
      if (!resolved) return

      const { canvasIndex: targetCanvasIndex, canvas: targetCanvas } = resolved

      const normalizedUrl = templateJsonUrl.trim()
      void (async () => {
        const history = getFabricCanvasHistoryManager(targetCanvas)
        let didApplyTemplate = false
        history?.suspend()
        try {
          const templateJson = await fetchTemplateCanvasJson(normalizedUrl)
          if (!templateJson) return

          const referencedFontFamilies = collectReferencedFontFamiliesFromFabricCanvasJson(templateJson)
          await Promise.all(referencedFontFamilies.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)))

          const targetSize = getCanvasLogicalSize(targetCanvas)
          const viewportTransform = targetCanvas.viewportTransform
            ? ([...targetCanvas.viewportTransform] as [number, number, number, number, number, number])
            : null

          targetCanvas.discardActiveObject()
          await targetCanvas.loadFromJSON(templateJson)
          restoreCanvasDimensionsAndViewport({
            canvas: targetCanvas,
            targetSize,
            viewportTransform,
          })
          scaleTemplateObjectsToCanvas(
            targetCanvas,
            targetSize
              ? {
                  targetSize,
                }
              : undefined,
          )
          await upgradeInteractiveTextToTextbox(targetCanvas)
          remeasureAllFabricEditableTextOnCanvas(targetCanvas)
          targetCanvas.renderAll()
          didApplyTemplate = true
          setSelectionByCanvas({})
          clearActiveSelectionState()
          activeCanvasIndexRef.current = targetCanvasIndex
          setActiveCanvasIndex(targetCanvasIndex)
          if (targetCanvasIndex >= 0) {
            requestAnimationFrame(() => {
              dispatchCanvasThumbnailInvalidated(targetCanvasIndex)
            })
          }
        } catch {
          // Best-effort apply; keep editor interactive if template load fails.
        } finally {
          history?.resume()
          if (didApplyTemplate) {
            history?.recordSnapshot()
          }
        }
      })()
    }

    const handleAutoAddGeneratedImage = (event: Event): void => {
      const customEvent = event as CustomEvent<{ imageUrl?: unknown }>
      const imageUrl = customEvent.detail?.imageUrl
      if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) return
      const trimmedImageUrl = imageUrl.trim()

      const activeCanvasIndex = activeCanvasIndexRef.current
      const fallbackCanvasIndex =
        activeCanvasIndex ??
        (canvasByIndexRef.current[0] ? 0 : null) ??
        (canvasByIndexRef.current[-1] ? -1 : null) ??
        Number(Object.keys(canvasByIndexRef.current)[0] ?? NaN)
      const targetCanvas = Number.isFinite(fallbackCanvasIndex)
        ? canvasByIndexRef.current[fallbackCanvasIndex]
        : null
      if (!targetCanvas) return

      const canvasRect = targetCanvas.upperCanvasEl?.getBoundingClientRect?.()
      if (!canvasRect) return

      const clientX = canvasRect.left + canvasRect.width / 2
      const clientY = canvasRect.top + canvasRect.height / 2
      const dropOpts = bookCoverDropRef.current
      const zones = dropOpts.zones
      const dimensions = dropOpts.dimensions
      const useCoverFit =
        fallbackCanvasIndex === -1 &&
        dropOpts.fitDroppedImagesToPage &&
        zones !== undefined &&
        dimensions !== undefined
      const scenePoint = targetCanvas.getScenePoint({ clientX, clientY } as MouseEvent)
      const placementZone =
        useCoverFit && zones && dimensions
          ? resolveBookCoverImagePlacementZone(zones, dimensions, scenePoint.x)
          : undefined

      void addImageToFabricCanvasAtClientPoint({
        canvas: targetCanvas,
        src: trimmedImageUrl,
        clientX,
        clientY,
        fitMode: useCoverFit ? 'cover' : 'default',
        placementZone,
      }).catch(() => {
        // Best-effort auto add; keep generate flow uninterrupted.
      })
    }

    const handleRequestCanvasAlignment = (event: Event): void => {
      const customEvent = event as CustomEvent<RequestCanvasAlignmentEventDetail>
      const align = customEvent.detail?.align
      if (!isCanvasAlignmentValue(align)) return

      alignSelectionAction({
        getActiveCanvas: resolveActiveCanvas,
        align,
      })
    }

    const handleRequestTextParagraphAlign = (event: Event): void => {
      const customEvent = event as CustomEvent<RequestCanvasTextParagraphAlignEventDetail>
      const textAlign = customEvent.detail?.textAlign
      if (textAlign !== 'left' && textAlign !== 'center' && textAlign !== 'right') return

      applyTextParagraphAlignAction({
        getActiveCanvas: resolveActiveCanvas,
        textAlign,
      })
    }

    window.addEventListener(APPLY_TEMPLATE_TO_CANVAS_EVENT, handleApplyTemplateToCanvas)
    window.addEventListener(AUTO_ADD_GENERATED_IMAGE_EVENT, handleAutoAddGeneratedImage)
    window.addEventListener(REQUEST_CANVAS_ALIGNMENT_EVENT, handleRequestCanvasAlignment)
    window.addEventListener(REQUEST_CANVAS_TEXT_PARAGRAPH_ALIGN_EVENT, handleRequestTextParagraphAlign)
    return () => {
      window.removeEventListener(APPLY_TEMPLATE_TO_CANVAS_EVENT, handleApplyTemplateToCanvas)
      window.removeEventListener(AUTO_ADD_GENERATED_IMAGE_EVENT, handleAutoAddGeneratedImage)
      window.removeEventListener(REQUEST_CANVAS_ALIGNMENT_EVENT, handleRequestCanvasAlignment)
      window.removeEventListener(REQUEST_CANVAS_TEXT_PARAGRAPH_ALIGN_EVENT, handleRequestTextParagraphAlign)
    }
  }, [clearActiveSelectionState])

  const getCanvasByIndex = useCallback((canvasIndex: number): Canvas | null => {
    return canvasByIndexRef.current[canvasIndex] ?? null
  }, [])

  return {
    toolbar,
    pageRow,
    history,
    exportCanvasDataByIndex,
    getCanvasByIndex,
    clearAllCanvases,
    clearInteriorCanvasesOnly,
    clearCoverCanvasOnly,
  }
}
