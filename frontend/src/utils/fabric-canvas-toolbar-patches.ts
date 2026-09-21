import type { Canvas } from 'fabric'

import type { CanvasSelectionSnapshot } from '@/utils/fabric-selection'
import {
  getCanvasSelectionFloatingToolbarPosition,
  getCanvasSelectionGroupingCapabilities,
} from '@/utils/fabric-canvas-floating-toolbar-ui'
import type { SelectionFloatingToolbarStateApi } from '@/hooks/canvas-editor/use-fabric-canvas-selection-toolbar-state'

/**
 * Apply the floating toolbar patch that corresponds to the canvas selection
 * snapshot. When an object interaction is active we hide the toolbar position
 * (so it doesn't flash during drag/scale/rotate) but still update its button
 * capabilities.
 */
export function patchFloatingToolbarForSelectionSnapshot(
  canvas: Canvas,
  snapshot: CanvasSelectionSnapshot,
  patchToolbarState: SelectionFloatingToolbarStateApi['patch'],
  options: { isObjectInteractionActive: boolean },
): void {
  if (!snapshot.hasSelection) {
    patchToolbarState({
      position: null,
      canDelete: false,
      canGroup: false,
      canUngroup: false,
      isLocked: false,
      isTextSelection: false,
    })
    return
  }

  const groupingCapabilities = getCanvasSelectionGroupingCapabilities(canvas, snapshot.isLocked)
  const commonPatch = {
    canDelete: !snapshot.isLocked,
    canGroup: groupingCapabilities.canGroup,
    canUngroup: groupingCapabilities.canUngroup,
    isLocked: snapshot.isLocked,
    isTextSelection: snapshot.selectionInfo.isText,
  }

  if (options.isObjectInteractionActive) {
    patchToolbarState({ position: null, ...commonPatch })
    return
  }

  patchToolbarState({
    position: getCanvasSelectionFloatingToolbarPosition(canvas),
    ...commonPatch,
  })
}

/**
 * Hide the floating toolbar (position = null) while keeping capability flags
 * that reflect the current selection, so the toolbar re-appears in the right
 * configuration once the interaction completes.
 */
export function patchFloatingToolbarForObjectInteraction(
  snapshot: CanvasSelectionSnapshot,
  patchToolbarState: SelectionFloatingToolbarStateApi['patch'],
): void {
  patchToolbarState({
    position: null,
    canDelete: snapshot.hasSelection && !snapshot.isLocked,
    isLocked: snapshot.hasSelection && snapshot.isLocked,
    isTextSelection: snapshot.hasSelection && snapshot.selectionInfo.isText,
  })
}

/** Toolbar state used by `handleSelectionCleared`: resets core flags. */
export function patchFloatingToolbarForSelectionCleared(
  patchToolbarState: SelectionFloatingToolbarStateApi['patch'],
): void {
  patchToolbarState({
    position: null,
    canDelete: false,
    canGroup: false,
    canUngroup: false,
    isLocked: false,
    isTextSelection: false,
  })
}
