import type { Canvas } from 'fabric'

import {
  refreshFabricEditableTextMetricsAfterFontsReady,
  stripPerCharacterFontFamilyFromFabricText,
} from '@/utils/canvas-text'
import { isFabricEditableTextType } from '@/utils/fabric-interaction-guards'
import {
  applyFabricTextboxWidthAfterMetricChange,
  shouldRefitFabricTextboxToUnwrappedLine,
} from '@/utils/fabric-textbox-width'

type TextEventTarget = {
  type?: string
  text?: string
  width?: number
  minWidth?: number
  fontFamily?: string
  hasControls?: boolean
  hasBorders?: boolean
  selectable?: boolean
  evented?: boolean
  isEditing?: boolean
  canvas?: {
    discardActiveObject?: () => void
    setActiveObject?: (obj: unknown) => void
    requestRenderAll?: () => void
    remove?: (obj: unknown) => void
  }
  calcTextWidth?: () => number
  initDimensions?: () => void
  setCoords?: () => void
  set?: (key: string | Record<string, unknown>, value?: unknown) => void
}

export type FabricCanvasTextEventHandlers = {
  handleTextChanged: (event: { target?: unknown }) => void
  handleTextEditingEntered: (event: { target?: unknown }) => void
  handleTextEditingExited: (event: { target?: unknown }) => void
}

type BuildFabricCanvasTextEventHandlersOptions = {
  canvas: Canvas
  /** Called after any text mutation so selection info stays in sync with typing. */
  onSelectionStateChanged: () => void
}

/**
 * Paste copies source `fontFamily` into per-char styles and can leave
 * stale dimensions; we normalize the textbox on every change, adjust
 * width, and ensure selection stays responsive.
 */
function handleTextChanged(
  target: TextEventTarget | undefined,
  canvas: Canvas,
  onSelectionStateChanged: () => void,
): void {
  if (!target || !isFabricEditableTextType(target.type)) return
  stripPerCharacterFontFamilyFromFabricText(target)

  if (target.type === 'textbox' && !target.isEditing) {
    const hasHardBreaks = typeof target.text === 'string' && target.text.includes('\n')
    if (!hasHardBreaks) {
      // Labels / collapsed boxes grow to the full run; soft-wrapped paragraphs keep width.
      applyFabricTextboxWidthAfterMetricChange(
        target,
        shouldRefitFabricTextboxToUnwrappedLine(target),
      )
    } else if (typeof target.calcTextWidth === 'function') {
      const measuredWidth = target.calcTextWidth()
      const minWidth = typeof target.minWidth === 'number' && target.minWidth > 0 ? target.minWidth : 1
      const hasText = typeof target.text === 'string' ? target.text.trim().length > 0 : true
      const nextWidth =
        Number.isFinite(measuredWidth) && measuredWidth > 0 && hasText
          ? Math.max(minWidth, Math.ceil(measuredWidth) + 2)
          : minWidth
      if (typeof target.width !== 'number' || Math.abs(target.width - nextWidth) > 0.5) {
        target.set?.('width', nextWidth)
      }
    }
  }
  if (typeof target.initDimensions === 'function') {
    target.initDimensions()
  }
  target.set?.({
    hasControls: true,
    hasBorders: true,
    selectable: true,
    evented: true,
    // Disable bitmap caching for editable text so zoom doesn't blur.
    objectCaching: false,
    noScaleCache: true,
  })
  target.setCoords?.()
  const isEmptyText = typeof target.text === 'string' && target.text.trim().length === 0
  if (isEmptyText && !target.isEditing) {
    // Re-activate after text becomes empty so all resize/rotate handles are drawn.
    target.canvas?.discardActiveObject?.()
    target.canvas?.setActiveObject?.(target)
  }
  canvas.requestRenderAll()
  onSelectionStateChanged()
}

function handleTextEditingEntered(
  target: TextEventTarget | undefined,
  canvas: Canvas,
): void {
  if (!target || !isFabricEditableTextType(target.type)) return
  void refreshFabricEditableTextMetricsAfterFontsReady(target).then(() => {
    canvas.requestRenderAll()
  })
}

function handleTextEditingExited(
  target: TextEventTarget | undefined,
  canvas: Canvas,
  onSelectionStateChanged: () => void,
): void {
  if (!target || !isFabricEditableTextType(target.type)) return
  const isEmptyText = typeof target.text === 'string' && target.text.trim().length === 0
  if (isEmptyText) {
    target.canvas?.remove?.(target)
    target.canvas?.requestRenderAll?.()
    onSelectionStateChanged()
    return
  }
  target.set?.({
    hasControls: true,
    hasBorders: true,
    selectable: true,
    evented: true,
    objectCaching: false,
    noScaleCache: true,
  })
  target.setCoords?.()
  // Force selection cycle so custom control visibility/styles are re-applied.
  target.canvas?.discardActiveObject?.()
  target.canvas?.setActiveObject?.(target)
  canvas.requestRenderAll()
  onSelectionStateChanged()
}

export function buildFabricCanvasTextEventHandlers({
  canvas,
  onSelectionStateChanged,
}: BuildFabricCanvasTextEventHandlersOptions): FabricCanvasTextEventHandlers {
  return {
    handleTextChanged: (event) =>
      handleTextChanged(event.target as TextEventTarget | undefined, canvas, onSelectionStateChanged),
    handleTextEditingEntered: (event) =>
      handleTextEditingEntered(event.target as TextEventTarget | undefined, canvas),
    handleTextEditingExited: (event) =>
      handleTextEditingExited(
        event.target as TextEventTarget | undefined,
        canvas,
        onSelectionStateChanged,
      ),
  }
}
