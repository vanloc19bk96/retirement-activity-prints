import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { CanvasAlignmentAction } from '@/utils/canvas-align'
import {
  stripPerCharacterFillFromFabricText,
  stripPerCharacterTextStyleFromFabricText,
  stripPerCharacterFontFamilyFromFabricText,
} from '@/utils/canvas-text'
import type { Canvas } from 'fabric'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { effectiveFontSizeToRawFontSize, type ShapeBorderStyle } from '@/utils/fabric-selection'
import {
  applyFabricTextboxWidthAfterMetricChange,
  shouldRefitFabricTextboxToUnwrappedLine,
} from '@/utils/fabric-textbox-width'
import { isLucideIconGroup, isLucideViewBoxFrame } from '@/utils/lucide-fabric'
import {
  applyPhosphorPrimaryFill,
  applyPhosphorSecondaryFill,
  isPhosphorIconGroup,
  isPhosphorViewBoxFrame,
} from '@/utils/phosphor-fabric'
import { isStudioShapeGroup } from '@/utils/studio-shape-group'
import type { TextToolbarState, TextToolbarStyle } from '@/types/text-toolbar.types'
import { findFontFamilyOption } from '@/constants/font-families'
import {
  clearFabricTextCharWidthCachesForFontFamily,
  refreshFabricEditableTextMetricsAfterFontsReady,
} from '@/utils/canvas-text'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'

import {
  DEFAULT_RECT_CORNER_RADIUS,
  DEFAULT_SHAPE_BORDER_STYLE,
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH,
} from './canvas-editor-constants'
import type { ShapeSelectionState, ToolbarBindings } from './canvas-editor-types'
import { getActiveLockState } from '@/utils/canvas-lock'
import {
  applyVisualCornerRadiusToRect,
  clampNumber,
  getDashArray,
  getRectMaxVisualCornerRadius,
} from './canvas-editor-helpers'
import {
  alignSelectionAction,
  copySelectionAction,
  nudgeSelectionAction,
  deleteSelectionAction,
  pasteSelectionAction,
  bringToFrontSelectionAction,
  fireCanvasObjectModified,
  fireCanvasObjectsModified,
  groupSelectionAction,
  sendToBackSelectionAction,
  toggleLockSelectionAction,
  ungroupSelectionAction,
} from './canvas-editor-actions'

type UseCanvasEditorToolbarBindingsArgs = {
  hasSelection: boolean
  selectionCount: number
  isSelectionLocked: boolean
  isImageSelection: boolean
  textSelection: TextToolbarState | null
  shapeSelection: ShapeSelectionState

  requestRender: () => void

  getActiveCanvas: () => Canvas | null
  getActiveTextObject: () => any | null
  getActiveShapeTargets: () => any[]
  getActiveRectTargets: () => any[]

  setIsSelectionLocked: (value: boolean) => void

  setTextSelection: Dispatch<SetStateAction<TextToolbarState | null>>
  setShapeSelection: Dispatch<SetStateAction<ShapeSelectionState>>
}

function applyToShapeStrokeTargets(target: any, fn: (strokeTarget: any) => void): void {
  if (isLucideIconGroup(target) || isPhosphorIconGroup(target) || isStudioShapeGroup(target)) {
    const children = target.getObjects?.() ?? []
    for (const child of children) {
      if (isLucideViewBoxFrame(child) || isPhosphorViewBoxFrame(child)) continue
      fn(child)
    }
    return
  }
  fn(target)
}

/** Coalesce rapid property changes (slider/picker scrub) into one undo step. */
const HISTORY_PROPERTY_CHANGE_DEBOUNCE_MS = 300

function recordPropertyChangeHistorySnapshot(canvas: Canvas | null): void {
  getFabricCanvasHistoryManager(canvas)?.recordSnapshot({
    debounceMs: HISTORY_PROPERTY_CHANGE_DEBOUNCE_MS,
  })
}

function clearFontFamilyCharWidthCaches(canvasFamily: string, optionValue?: string): void {
  clearFabricTextCharWidthCachesForFontFamily(canvasFamily)
  if (optionValue) clearFabricTextCharWidthCachesForFontFamily(optionValue)
}

function applyFontFamilyToTextTarget(target: any, canvasFamily: string): void {
  const shouldRefit = shouldRefitFabricTextboxToUnwrappedLine(target)
  stripPerCharacterFontFamilyFromFabricText(target)
  target.set?.('fontFamily', canvasFamily)
  applyFabricTextboxWidthAfterMetricChange(target, shouldRefit)
  target.dirty = true
  target.setCoords?.()
}

export function useCanvasEditorToolbarBindings(args: UseCanvasEditorToolbarBindingsArgs): ToolbarBindings {
  const {
    hasSelection,
    selectionCount,
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
  } = args

  const onAlign = useCallback(
    (align: CanvasAlignmentAction) => {
      alignSelectionAction({
        getActiveCanvas,
        align,
      })
    },
    [getActiveCanvas],
  )

  const onNudgeSelection = useCallback(
    (deltaX: number, deltaY: number) => {
      nudgeSelectionAction({
        getActiveCanvas,
        deltaX,
        deltaY,
      })
    },
    [getActiveCanvas],
  )

  const onToggleLock = useCallback(() => {
    const isLocked = toggleLockSelectionAction({ getActiveCanvas })
    setIsSelectionLocked(isLocked)
    recordPropertyChangeHistorySnapshot(getActiveCanvas())
  }, [getActiveCanvas, setIsSelectionLocked])

  const onDeleteSelection = useCallback(() => {
    deleteSelectionAction({
      getActiveCanvas,
    })
  }, [getActiveCanvas])

  const onBringToFrontSelection = useCallback(() => {
    bringToFrontSelectionAction({
      getActiveCanvas,
    })
  }, [getActiveCanvas])

  const onSendToBackSelection = useCallback(() => {
    sendToBackSelectionAction({
      getActiveCanvas,
    })
  }, [getActiveCanvas])

  const onCopySelection = useCallback(() => {
    copySelectionAction({ getActiveCanvas })
  }, [getActiveCanvas])

  const onPasteSelection = useCallback(() => {
    pasteSelectionAction({ getActiveCanvas })
  }, [getActiveCanvas])

  const onGroupSelection = useCallback(() => {
    groupSelectionAction({ getActiveCanvas })
  }, [getActiveCanvas])

  const onUngroupSelection = useCallback(() => {
    ungroupSelectionAction({ getActiveCanvas })
  }, [getActiveCanvas])

  const onFontFamilyChange = useCallback(
    (fontFamily: string) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const option = findFontFamilyOption(fontFamily)
      const canvasFamily = option?.canvasFontFamily ?? fontFamily
      clearFontFamilyCharWidthCaches(canvasFamily, option?.value)

      const loadPromise = kickOffFontFamilyLoading(fontFamily)

      const textTarget = getActiveTextObject()
      if (!textTarget) return
      applyFontFamilyToTextTarget(textTarget, canvasFamily)
      fireCanvasObjectModified(canvas, textTarget)

      requestRender()
      setTextSelection((prev) => (prev ? { ...prev, fontFamily } : prev))
      recordPropertyChangeHistorySnapshot(canvas)

      void loadPromise.then(async () => {
        clearFontFamilyCharWidthCaches(canvasFamily, option?.value)

        const refreshedTextTarget = getActiveTextObject()
        if (refreshedTextTarget) {
          applyFontFamilyToTextTarget(refreshedTextTarget, canvasFamily)
          await refreshFabricEditableTextMetricsAfterFontsReady(refreshedTextTarget)
          fireCanvasObjectModified(canvas, refreshedTextTarget)
        }

        requestRender()
      })
    },
    [
      getActiveCanvas,
      getActiveTextObject,
      requestRender,
      setTextSelection,
    ],
  )

  const onFontSizeChange = useCallback(
    (effectiveFontSize: number) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const target = getActiveTextObject()
      if (!target) return
      stripPerCharacterFontFamilyFromFabricText(target)
      // Capture wrap state before metrics change — after a size bump a tight
      // instruction can look multi-line and must still expand to one line.
      const shouldRefit = shouldRefitFabricTextboxToUnwrappedLine(target)
      const rawFontSize = effectiveFontSizeToRawFontSize(effectiveFontSize, target)
      target.set?.('fontSize', rawFontSize)
      applyFabricTextboxWidthAfterMetricChange(target, shouldRefit)
      target.dirty = true
      target.setCoords?.()
      requestRender()
      fireCanvasObjectModified(canvas, target)
      setTextSelection((prev) => (prev ? { ...prev, fontSize: effectiveFontSize } : prev))
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveTextObject, requestRender, setTextSelection],
  )

  const onTextColorChange = useCallback(
    (textColor: string) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const target = getActiveTextObject()
      if (!target) return
      const nextColor = textColor.trim()
      if (!nextColor) return
      stripPerCharacterFillFromFabricText(target)
      target.set?.('fill', nextColor)
      requestRender()
      fireCanvasObjectModified(canvas, target)
      setTextSelection((prev) => (prev ? { ...prev, textColor: nextColor } : prev))
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveTextObject, requestRender, setTextSelection],
  )

  const onToggleTextStyle = useCallback(
    (style: TextToolbarStyle) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const target = getActiveTextObject()
      if (!target) return

      if (style === 'bold') {
        const nextBold = !(target.fontWeight === 'bold' || target.fontWeight === 700)
        const shouldRefit = shouldRefitFabricTextboxToUnwrappedLine(target)
        stripPerCharacterTextStyleFromFabricText(target)
        target.set?.('fontWeight', nextBold ? 'bold' : 'normal')
        applyFabricTextboxWidthAfterMetricChange(target, shouldRefit)
        target.dirty = true
        target.setCoords?.()
        requestRender()
        fireCanvasObjectModified(canvas, target)
        setTextSelection((prev) => (prev ? { ...prev, isBold: nextBold } : prev))
        recordPropertyChangeHistorySnapshot(canvas)
        return
      }

      if (style === 'italic') {
        const nextItalic = target.fontStyle !== 'italic'
        const shouldRefit = shouldRefitFabricTextboxToUnwrappedLine(target)
        stripPerCharacterTextStyleFromFabricText(target)
        target.set?.('fontStyle', nextItalic ? 'italic' : 'normal')
        applyFabricTextboxWidthAfterMetricChange(target, shouldRefit)
        target.dirty = true
        target.setCoords?.()
        requestRender()
        fireCanvasObjectModified(canvas, target)
        setTextSelection((prev) => (prev ? { ...prev, isItalic: nextItalic } : prev))
        recordPropertyChangeHistorySnapshot(canvas)
        return
      }

      const nextUnderline = !Boolean(target.underline)
      stripPerCharacterTextStyleFromFabricText(target)
      target.set?.('underline', nextUnderline)
      requestRender()
      fireCanvasObjectModified(canvas, target)
      setTextSelection((prev) => (prev ? { ...prev, isUnderline: nextUnderline } : prev))
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveTextObject, requestRender, setTextSelection],
  )

  const onStrokeWidthChange = useCallback(
    (strokeWidth: number) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const targets = getActiveShapeTargets()
      if (targets.length === 0) return

      const nextStrokeWidth = clampNumber(strokeWidth, 0, 200)
      for (const target of targets) {
        applyToShapeStrokeTargets(target, (strokeTarget) => {
          strokeTarget.set?.('strokeWidth', nextStrokeWidth)
          strokeTarget.set?.('strokeUniform', true)
        })
      }

      requestRender()
      fireCanvasObjectsModified(canvas, targets)
      setShapeSelection((prev) =>
        prev
          ? { ...prev, strokeWidth: nextStrokeWidth }
          : {
              strokeWidth: nextStrokeWidth,
              borderStyle: DEFAULT_SHAPE_BORDER_STYLE,
              strokeColor: DEFAULT_SHAPE_STROKE_COLOR,
              fillColor: DEFAULT_SHAPE_FILL_COLOR,
              canEditCornerRadius: false,
              cornerRadius: DEFAULT_RECT_CORNER_RADIUS,
            },
      )
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveShapeTargets, requestRender, setShapeSelection],
  )

  const onBorderStyleChange = useCallback(
    (borderStyle: ShapeBorderStyle) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const targets = getActiveShapeTargets()
      if (targets.length === 0) return

      const dash = getDashArray(borderStyle)
      for (const target of targets) {
        applyToShapeStrokeTargets(target, (strokeTarget) => {
          strokeTarget.set?.('strokeDashArray', dash)
        })
      }

      requestRender()
      fireCanvasObjectsModified(canvas, targets)
      setShapeSelection((prev) =>
        prev
          ? { ...prev, borderStyle }
          : {
              strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH,
              borderStyle,
              strokeColor: DEFAULT_SHAPE_STROKE_COLOR,
              fillColor: DEFAULT_SHAPE_FILL_COLOR,
              canEditCornerRadius: false,
              cornerRadius: DEFAULT_RECT_CORNER_RADIUS,
            },
      )
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveShapeTargets, requestRender, setShapeSelection],
  )

  const onStrokeColorChange = useCallback(
    (strokeColor: string) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const targets = getActiveShapeTargets()
      if (targets.length === 0) return

      const rawColor = strokeColor.trim()
      if (!rawColor) return
      const nextColor = rawColor

      for (const target of targets) {
        if (isPhosphorIconGroup(target)) {
          applyPhosphorPrimaryFill(target, nextColor)
          continue
        }
        applyToShapeStrokeTargets(target, (strokeTarget) => {
          strokeTarget.set?.('stroke', nextColor)
        })
      }

      requestRender()
      fireCanvasObjectsModified(canvas, targets)
      setShapeSelection((prev) =>
        prev
          ? { ...prev, strokeColor: nextColor }
          : {
              strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH,
              borderStyle: DEFAULT_SHAPE_BORDER_STYLE,
              strokeColor: nextColor,
              fillColor: DEFAULT_SHAPE_FILL_COLOR,
              canEditCornerRadius: false,
              cornerRadius: DEFAULT_RECT_CORNER_RADIUS,
            },
      )
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveShapeTargets, requestRender, setShapeSelection],
  )

  const onFillColorChange = useCallback(
    (fillColor: string) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const targets = getActiveShapeTargets()
      if (targets.length === 0) return

      const rawColor = fillColor.trim()
      if (!rawColor) return
      const nextColor = rawColor

      for (const target of targets) {
        if (isPhosphorIconGroup(target)) {
          applyPhosphorSecondaryFill(target, nextColor)
          continue
        }
        applyToShapeStrokeTargets(target, (strokeTarget) => {
          strokeTarget.set?.('fill', nextColor)
        })
      }

      requestRender()
      fireCanvasObjectsModified(canvas, targets)
      setShapeSelection((prev) =>
        prev
          ? { ...prev, fillColor: nextColor }
          : {
              strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH,
              borderStyle: DEFAULT_SHAPE_BORDER_STYLE,
              strokeColor: DEFAULT_SHAPE_STROKE_COLOR,
              fillColor: nextColor,
              canEditCornerRadius: false,
              cornerRadius: DEFAULT_RECT_CORNER_RADIUS,
            },
      )
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveShapeTargets, requestRender, setShapeSelection],
  )

  const onCornerRadiusChange = useCallback(
    (cornerRadius: number) => {
      const canvas = getActiveCanvas()
      if (!canvas || getActiveLockState(canvas)) return

      const targets = getActiveRectTargets()
      if (targets.length === 0) return

      const requested = clampNumber(cornerRadius, 0, 1_000_000)
      const maxPerRect = targets.map((t) => getRectMaxVisualCornerRadius(t))
      const globalCap = Math.min(...maxPerRect)
      const visualRadius = Math.min(requested, globalCap)

      for (const target of targets) {
        applyVisualCornerRadiusToRect(target, visualRadius)
      }

      requestRender()
      fireCanvasObjectsModified(canvas, targets)
      setShapeSelection((prev) =>
        prev
          ? {
              ...prev,
              cornerRadius: Math.round(visualRadius),
              cornerRadiusMax: Math.round(globalCap),
            }
          : prev,
      )
      recordPropertyChangeHistorySnapshot(canvas)
    },
    [getActiveCanvas, getActiveRectTargets, requestRender, setShapeSelection],
  )

  return {
    hasSelection,
    selectionCount,
    isSelectionLocked,
    isImageSelection,
    textSelection,
    shapeSelection,
    onAlign,
    onNudgeSelection,
    onToggleLock,
    onDeleteSelection,
    onBringToFrontSelection,
    onSendToBackSelection,
    onCopySelection,
    onPasteSelection,
    onGroupSelection,
    onUngroupSelection,
    onFontFamilyChange,
    onFontSizeChange,
    onTextColorChange,
    onToggleTextStyle,
    onStrokeWidthChange,
    onBorderStyleChange,
    onStrokeColorChange,
    onFillColorChange,
    onCornerRadiusChange,
  }
}
