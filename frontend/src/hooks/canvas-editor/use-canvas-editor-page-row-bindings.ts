import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { Canvas } from 'fabric'

import type { PageRowBindings, ShapeSelectionState } from './canvas-editor-types'
import type { TextToolbarState } from '@/types/text-toolbar.types'
import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import {
  deriveIsImageSelection,
  deriveShapeSelectionFromInfo,
  deriveTextSelectionFromInfo,
} from './canvas-editor-selection-derivations'

export type AlignmentPanelTextContext = {
  isEditableText: boolean
  paragraphAlign: 'left' | 'center' | 'right' | 'justify'
}

type UseCanvasEditorPageRowBindingsArgs = {
  defaultTextFontFamily: string
  defaultTextFontSize: number

  activeCanvasIndexRef: MutableRefObject<number | null>
  canvasByIndexRef: MutableRefObject<Record<number, Canvas>>
  setActiveCanvasIndex: (value: number | null) => void

  setIsSelectionLocked: (value: boolean) => void
  setSelectionByCanvas: Dispatch<SetStateAction<Record<number, boolean>>>
  setSelectedObjectCount: (value: number) => void
  setAlignmentPanelTextContext: (value: AlignmentPanelTextContext) => void
  clearActiveSelectionState: () => void

  setIsImageSelection: (value: boolean) => void
  setShapeSelection: Dispatch<SetStateAction<ShapeSelectionState>>
  setTextSelection: Dispatch<SetStateAction<TextToolbarState | null>>
}

export function useCanvasEditorPageRowBindings(args: UseCanvasEditorPageRowBindingsArgs): PageRowBindings {
  const handleCanvasReady = useCallback(
    (canvasIndex: number, canvas: Canvas | null) => {
      if (!canvas) {
        delete args.canvasByIndexRef.current[canvasIndex]
        return
      }
      args.canvasByIndexRef.current[canvasIndex] = canvas
      const currentActiveCanvasIndex = args.activeCanvasIndexRef.current
      const shouldSetDefaultActive =
        currentActiveCanvasIndex == null
          ? canvasIndex >= 0
          : currentActiveCanvasIndex === -1 && canvasIndex >= 0
      if (shouldSetDefaultActive) {
        args.activeCanvasIndexRef.current = canvasIndex
        args.setActiveCanvasIndex(canvasIndex)
      }
    },
    [args.activeCanvasIndexRef, args.canvasByIndexRef, args.setActiveCanvasIndex],
  )

  const handleActiveCanvasChange = useCallback(
    (canvasIndex: number) => {
      args.activeCanvasIndexRef.current = canvasIndex
      args.setActiveCanvasIndex(canvasIndex)
    },
    [args.activeCanvasIndexRef, args.setActiveCanvasIndex],
  )

  const handleIsSelectionLockedChange = useCallback(
    (canvasIndex: number, nextLocked: boolean) => {
      if (args.activeCanvasIndexRef.current !== canvasIndex) return
      args.setIsSelectionLocked(nextLocked)
    },
    [args.activeCanvasIndexRef, args.setIsSelectionLocked],
  )

  const handleHasSelectionChange = useCallback(
    (canvasIndex: number, nextHasSelection: boolean) => {
      args.setSelectionByCanvas((prev) => {
        if (prev[canvasIndex] === nextHasSelection) return prev
        return { ...prev, [canvasIndex]: nextHasSelection }
      })

      if (!nextHasSelection && args.activeCanvasIndexRef.current === canvasIndex) {
        // Keep active canvas so actions that target active canvas
        // (e.g. apply template) still work on an empty canvas.
        args.setIsSelectionLocked(false)
        args.setIsImageSelection(false)
        args.setSelectedObjectCount(0)
        args.setAlignmentPanelTextContext({ isEditableText: false, paragraphAlign: 'left' })
        args.setShapeSelection(null)
        args.setTextSelection(null)
      }
    },
    [
      args.activeCanvasIndexRef,
      args.setAlignmentPanelTextContext,
      args.setIsImageSelection,
      args.setIsSelectionLocked,
      args.setSelectionByCanvas,
      args.setSelectedObjectCount,
      args.setShapeSelection,
      args.setTextSelection,
    ],
  )

  const handleSelectionInfoChange = useCallback(
    (canvasIndex: number, info: CanvasSelectionInfo) => {
      if (args.activeCanvasIndexRef.current !== canvasIndex) return

      args.setSelectedObjectCount(info.selectionCount)
      args.setAlignmentPanelTextContext({
        isEditableText: Boolean(info.hasSelection && info.isText),
        paragraphAlign: info.textAlign ?? 'left',
      })

      const isImageSelection = deriveIsImageSelection(info)
      args.setIsImageSelection(isImageSelection)

      args.setShapeSelection(deriveShapeSelectionFromInfo(info))

      if (!info.hasSelection || !info.isText) {
        args.setTextSelection(null)
        return
      }

      args.setTextSelection(
        deriveTextSelectionFromInfo(info, args.defaultTextFontFamily, args.defaultTextFontSize),
      )
    },
    [
      args.activeCanvasIndexRef,
      args.defaultTextFontFamily,
      args.defaultTextFontSize,
      args.setAlignmentPanelTextContext,
      args.setIsImageSelection,
      args.setSelectedObjectCount,
      args.setShapeSelection,
      args.setTextSelection,
    ],
  )

  return {
    onCanvasReady: handleCanvasReady,
    onActiveCanvasChange: handleActiveCanvasChange,
    onIsSelectionLockedChange: handleIsSelectionLockedChange,
    onHasSelectionChange: handleHasSelectionChange,
    onSelectionInfoChange: handleSelectionInfoChange,
  }
}
