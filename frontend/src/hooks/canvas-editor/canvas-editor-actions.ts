import type { Canvas, FabricObject } from 'fabric'

import { alignActiveToCanvas, nudgeActiveSelection, type CanvasAlignmentAction } from '@/utils/canvas-align'
import { copyActiveSelection, pasteFromClipboard } from '@/utils/canvas-clipboard'
import { getActiveLockState, toggleLockActive } from '@/utils/canvas-lock'
import { deleteActiveSelection, getActiveSelectionTargets, groupActiveSelection, ungroupActiveSelection } from '@/utils/canvas-selection'
import { bringActiveSelectionToFront, sendActiveSelectionToBack } from '@/utils/canvas-z-order'
import type { FabricTextParagraphAlign } from '@/utils/alignment-events'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { collectFabricTextObjects } from '@/utils/fabric-selection'

/** Fabric doesn't broadcast modified for z-order / lock / align; tell history explicitly. */
function recordCanvasHistorySnapshot(canvas: Canvas): void {
  getFabricCanvasHistoryManager(canvas)?.recordSnapshot()
}

/** Programmatic toolbar edits do not emit object:modified; thumbnail rail listens for it. */
export function fireCanvasObjectModified(canvas: Canvas, target: unknown): void {
  if (!target) return
  canvas.fire('object:modified', { target: target as FabricObject })
}

export function fireCanvasObjectsModified(canvas: Canvas, targets: unknown[]): void {
  for (const target of targets) {
    fireCanvasObjectModified(canvas, target)
  }
}

/**
 * Texts inside a group (a word search grid) have no canvas listener of their
 * own: repaint their parents and report the change on the selected object.
 */
export function fireTextTargetsModified(canvas: Canvas, textTargets: any[]): void {
  for (const target of textTargets) {
    let parent = target.group
    while (parent) {
      parent.dirty = true
      parent = parent.group
    }
  }
  const active = canvas.getActiveObject?.()
  if (active && !textTargets.includes(active)) {
    fireCanvasObjectModified(canvas, active)
    return
  }
  fireCanvasObjectsModified(canvas, textTargets)
}

function isActiveObjectLocked(canvas: Canvas): boolean {
  return getActiveLockState(canvas) === true
}

type AlignSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
  align: CanvasAlignmentAction
}

export function alignSelectionAction(args: AlignSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  alignActiveToCanvas(canvas, args.align)
  recordCanvasHistorySnapshot(canvas)
}

type NudgeSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
  deltaX: number
  deltaY: number
}

export function nudgeSelectionAction(args: NudgeSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  const activeTargets = getActiveSelectionTargets(canvas)
  if (activeTargets.length === 0) return

  nudgeActiveSelection(canvas, args.deltaX, args.deltaY)

  for (const obj of activeTargets) {
    canvas.fire('object:modified', { target: obj })
  }
}

type ApplyTextParagraphAlignArgs = {
  getActiveCanvas: () => Canvas | null
  textAlign: FabricTextParagraphAlign
}

export function applyTextParagraphAlignAction(args: ApplyTextParagraphAlignArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return

  const textTargets = collectFabricTextObjects(canvas.getActiveObject?.())
  if (textTargets.length === 0) return

  for (const obj of textTargets) {
    obj.set?.({ textAlign: args.textAlign })
    obj.initDimensions?.()
    obj.setCoords?.()
  }
  fireTextTargetsModified(canvas, textTargets)

  canvas.requestRenderAll()
}

type ToggleLockSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function toggleLockSelectionAction(args: ToggleLockSelectionActionArgs): boolean {
  const canvas = args.getActiveCanvas()
  if (!canvas) return false
  toggleLockActive(canvas)
  recordCanvasHistorySnapshot(canvas)
  return getActiveLockState(canvas) ?? false
}

type DeleteSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function deleteSelectionAction(args: DeleteSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  deleteActiveSelection(canvas)
}

type BringToFrontSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function bringToFrontSelectionAction(args: BringToFrontSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return
  bringActiveSelectionToFront(canvas)
  fireCanvasObjectsModified(canvas, targets)
  recordCanvasHistorySnapshot(canvas)
}

type SendToBackSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function sendToBackSelectionAction(args: SendToBackSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return
  sendActiveSelectionToBack(canvas)
  fireCanvasObjectsModified(canvas, targets)
  recordCanvasHistorySnapshot(canvas)
}

type GroupSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function groupSelectionAction(args: GroupSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  groupActiveSelection(canvas)
}

type UngroupSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function ungroupSelectionAction(args: UngroupSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas || isActiveObjectLocked(canvas)) return
  ungroupActiveSelection(canvas)
}

type CopySelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function copySelectionAction(args: CopySelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas) return
  copyActiveSelection(canvas)
}

type PasteSelectionActionArgs = {
  getActiveCanvas: () => Canvas | null
}

export function pasteSelectionAction(args: PasteSelectionActionArgs): void {
  const canvas = args.getActiveCanvas()
  if (!canvas) return
  pasteFromClipboard(canvas)
}
