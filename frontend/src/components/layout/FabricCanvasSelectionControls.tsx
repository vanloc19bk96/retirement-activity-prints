import { CanvasSelectionContextMenu } from './CanvasSelectionContextMenu'
import { CanvasSelectionFloatingToolbar } from './CanvasSelectionFloatingToolbar'

import type { SelectionFloatingToolbarState } from '@/hooks/canvas-editor/use-fabric-canvas-selection-toolbar-state'
import type { FabricCanvasSelectionToolbarActions } from '@/hooks/canvas-editor/use-fabric-canvas-selection-toolbar-actions'
import type { FabricCanvasCoverFitApi } from '@/hooks/canvas-editor/use-fabric-canvas-cover-fit'
import type { useFabricSelectionContextMenu } from '@/hooks/use-fabric-selection-context-menu'

type FabricCanvasSelectionControlsProps = {
  toolbarState: SelectionFloatingToolbarState
  toolbarActions: FabricCanvasSelectionToolbarActions
  coverFit: FabricCanvasCoverFitApi
  selectionContextMenu: ReturnType<typeof useFabricSelectionContextMenu>
}

/**
 * Combines the floating selection toolbar and the right-click context menu,
 * both bound to the current selection/cover-fit state and action handlers.
 */
export function FabricCanvasSelectionControls({
  toolbarState,
  toolbarActions,
  coverFit,
  selectionContextMenu,
}: FabricCanvasSelectionControlsProps): JSX.Element {
  return (
    <>
      <CanvasSelectionFloatingToolbar
        position={toolbarState.position}
        canDelete={toolbarState.canDelete}
        canGroup={toolbarState.canGroup}
        canUngroup={toolbarState.canUngroup}
        isLocked={toolbarState.isLocked}
        isTextSelection={toolbarState.isTextSelection}
        onDelete={toolbarActions.handleDelete}
        onGroup={toolbarActions.handleGroup}
        onUngroup={toolbarActions.handleUngroup}
        onToggleLock={toolbarActions.handleToggleLock}
        onOpenMenu={toolbarActions.handleOpenContextMenu}
      />

      <CanvasSelectionContextMenu
        isOpen={selectionContextMenu.isOpen}
        onOpenChange={selectionContextMenu.setOpen}
        anchorPoint={selectionContextMenu.anchorPoint}
        canPaste={selectionContextMenu.canPaste}
        canCopy={selectionContextMenu.canCopy}
        canDelete={selectionContextMenu.canDelete}
        canFitFullFront={coverFit.canFitFullFront}
        canFitFullBack={coverFit.canFitFullBack}
        onCopy={selectionContextMenu.onCopy}
        onPaste={selectionContextMenu.onPaste}
        onDelete={selectionContextMenu.onDelete}
        onFitFullFront={coverFit.handleFitFullFront}
        onFitFullBack={coverFit.handleFitFullBack}
      />
    </>
  )
}
