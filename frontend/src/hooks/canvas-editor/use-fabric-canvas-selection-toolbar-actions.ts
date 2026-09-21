import type { MutableRefObject, RefObject } from 'react'
import { useCallback } from 'react'
import type { Canvas } from 'fabric'

import type { CanvasSelectionInfo } from '@/utils/fabric-selection'
import { getCanvasSelectionSnapshot } from '@/utils/fabric-selection'
import {
  deleteActiveSelection,
  groupActiveSelection,
  ungroupActiveSelection,
} from '@/utils/canvas-selection'
import { toggleLockActive } from '@/utils/canvas-lock'
import {
  getCanvasSelectionFloatingToolbarPosition,
  getCanvasSelectionGroupingCapabilities,
} from '@/utils/fabric-canvas-floating-toolbar-ui'
import type { useFabricSelectionContextMenu } from '@/hooks/use-fabric-selection-context-menu'
import type { SelectionFloatingToolbarStateApi } from './use-fabric-canvas-selection-toolbar-state'
import type { FabricCanvasCoverFitApi } from './use-fabric-canvas-cover-fit'

type SelectionCallbacksRefs = {
  fabricCanvasRef: RefObject<Canvas | null>
  selectionContextMenuRef: MutableRefObject<ReturnType<typeof useFabricSelectionContextMenu>>
  latestCanvasIndexRef: MutableRefObject<number>
  onActiveCanvasChangeRef: MutableRefObject<((canvasIndex: number) => void) | undefined>
  onHasSelectionChangeRef: MutableRefObject<((hasSelection: boolean) => void) | null>
  onSelectionInfoChangeRef: MutableRefObject<((info: CanvasSelectionInfo) => void) | null>
  onIsSelectionLockedChangeRef: MutableRefObject<
    ((canvasIndex: number, isLocked: boolean) => void) | undefined
  >
}

type UseFabricCanvasSelectionToolbarActionsOptions = {
  refs: SelectionCallbacksRefs
  toolbarState: SelectionFloatingToolbarStateApi
  coverFit: FabricCanvasCoverFitApi
}

export type FabricCanvasSelectionToolbarActions = {
  handleDelete: () => void
  handleGroup: () => void
  handleUngroup: () => void
  handleToggleLock: () => void
  handleOpenContextMenu: (clientX: number, clientY: number) => void
  /** Emit selection callbacks + sync floating toolbar from the live canvas. */
  syncFromCanvas: (canvas: Canvas) => void
}

export function useFabricCanvasSelectionToolbarActions({
  refs,
  toolbarState,
  coverFit,
}: UseFabricCanvasSelectionToolbarActionsOptions): FabricCanvasSelectionToolbarActions {
  const {
    fabricCanvasRef,
    selectionContextMenuRef,
    latestCanvasIndexRef,
    onActiveCanvasChangeRef,
    onHasSelectionChangeRef,
    onSelectionInfoChangeRef,
    onIsSelectionLockedChangeRef,
  } = refs
  const { patch: patchToolbarState, reset: resetToolbarState } = toolbarState

  const syncFromCanvas = useCallback(
    (canvas: Canvas): void => {
      const snapshot = getCanvasSelectionSnapshot(canvas)
      if (snapshot.hasSelection) {
        onActiveCanvasChangeRef.current?.(latestCanvasIndexRef.current)
      }
      onHasSelectionChangeRef.current?.(snapshot.hasSelection)
      onSelectionInfoChangeRef.current?.(snapshot.selectionInfo)
      onIsSelectionLockedChangeRef.current?.(latestCanvasIndexRef.current, snapshot.isLocked)

      if (!snapshot.hasSelection) {
        resetToolbarState()
        return
      }

      const groupingCapabilities = getCanvasSelectionGroupingCapabilities(canvas, snapshot.isLocked)
      patchToolbarState({
        position: getCanvasSelectionFloatingToolbarPosition(canvas),
        canDelete: !snapshot.isLocked,
        canGroup: groupingCapabilities.canGroup,
        canUngroup: groupingCapabilities.canUngroup,
        isLocked: snapshot.isLocked,
        isTextSelection: snapshot.selectionInfo.isText,
      })
    },
    [
      latestCanvasIndexRef,
      onActiveCanvasChangeRef,
      onHasSelectionChangeRef,
      onIsSelectionLockedChangeRef,
      onSelectionInfoChangeRef,
      patchToolbarState,
      resetToolbarState,
    ],
  )

  const handleDelete = useCallback((): void => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const snapshot = getCanvasSelectionSnapshot(canvas)
    if (!snapshot.hasSelection || snapshot.isLocked) return

    deleteActiveSelection(canvas)
    selectionContextMenuRef.current.close()
    resetToolbarState()
  }, [fabricCanvasRef, resetToolbarState, selectionContextMenuRef])

  const handleGroup = useCallback((): void => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const snapshot = getCanvasSelectionSnapshot(canvas)
    if (!snapshot.hasSelection || snapshot.isLocked) return

    const groupingCapabilities = getCanvasSelectionGroupingCapabilities(canvas, snapshot.isLocked)
    if (!groupingCapabilities.canGroup) return

    groupActiveSelection(canvas)
    selectionContextMenuRef.current.close()
    syncFromCanvas(canvas)
  }, [fabricCanvasRef, selectionContextMenuRef, syncFromCanvas])

  const handleUngroup = useCallback((): void => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const snapshot = getCanvasSelectionSnapshot(canvas)
    if (!snapshot.hasSelection || snapshot.isLocked) return

    const groupingCapabilities = getCanvasSelectionGroupingCapabilities(canvas, snapshot.isLocked)
    if (!groupingCapabilities.canUngroup) return

    ungroupActiveSelection(canvas)
    selectionContextMenuRef.current.close()
    syncFromCanvas(canvas)
  }, [fabricCanvasRef, selectionContextMenuRef, syncFromCanvas])

  const handleToggleLock = useCallback((): void => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const snapshot = getCanvasSelectionSnapshot(canvas)
    if (!snapshot.hasSelection) return

    toggleLockActive(canvas)

    const nextSnapshot = getCanvasSelectionSnapshot(canvas)
    if (nextSnapshot.hasSelection) {
      onActiveCanvasChangeRef.current?.(latestCanvasIndexRef.current)
    }
    onHasSelectionChangeRef.current?.(nextSnapshot.hasSelection)
    onSelectionInfoChangeRef.current?.(nextSnapshot.selectionInfo)
    onIsSelectionLockedChangeRef.current?.(latestCanvasIndexRef.current, nextSnapshot.isLocked)

    const groupingCapabilities = nextSnapshot.hasSelection
      ? getCanvasSelectionGroupingCapabilities(canvas, nextSnapshot.isLocked)
      : { canGroup: false, canUngroup: false }
    patchToolbarState({
      position: nextSnapshot.hasSelection ? getCanvasSelectionFloatingToolbarPosition(canvas) : null,
      canDelete: nextSnapshot.hasSelection && !nextSnapshot.isLocked,
      canGroup: groupingCapabilities.canGroup,
      canUngroup: groupingCapabilities.canUngroup,
      isLocked: nextSnapshot.hasSelection && nextSnapshot.isLocked,
      isTextSelection: nextSnapshot.hasSelection && nextSnapshot.selectionInfo.isText,
    })
  }, [
    fabricCanvasRef,
    latestCanvasIndexRef,
    onActiveCanvasChangeRef,
    onHasSelectionChangeRef,
    onIsSelectionLockedChangeRef,
    onSelectionInfoChangeRef,
    patchToolbarState,
  ])

  const handleOpenContextMenu = useCallback(
    (clientX: number, clientY: number): void => {
      const canvas = fabricCanvasRef.current
      if (!canvas) return

      const snapshot = getCanvasSelectionSnapshot(canvas)
      if (!snapshot.hasSelection) {
        selectionContextMenuRef.current.openAt(clientX, clientY, {
          canCopy: false,
          canDelete: false,
        })
        return
      }

      coverFit.updateCapabilitiesFromSnapshot(snapshot)

      selectionContextMenuRef.current.openAt(clientX, clientY, {
        canCopy: true,
        canDelete: !snapshot.isLocked,
      })
    },
    [coverFit, fabricCanvasRef, selectionContextMenuRef],
  )

  return {
    handleDelete,
    handleGroup,
    handleUngroup,
    handleToggleLock,
    handleOpenContextMenu,
    syncFromCanvas,
  }
}
