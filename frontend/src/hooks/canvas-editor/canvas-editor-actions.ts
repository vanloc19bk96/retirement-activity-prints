import type { Canvas, FabricObject } from 'fabric'

import { alignActiveToCanvas, nudgeActiveSelection, type CanvasAlignmentAction } from '@/utils/canvas-align'
import { copyActiveSelection, pasteFromClipboard } from '@/utils/canvas-clipboard'
import { getActiveLockState, toggleLockActive } from '@/utils/canvas-lock'
import { deleteActiveSelection, getActiveSelectionTargets, groupActiveSelection, ungroupActiveSelection } from '@/utils/canvas-selection'
import { bringActiveSelectionToFront, sendActiveSelectionToBack } from '@/utils/canvas-z-order'
import type { FabricTextParagraphAlign } from '@/utils/alignment-events'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'
import { isTextObjectType } from './canvas-editor-helpers'

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

  const targets = getActiveSelectionTargets(canvas)
  const textTargets = targets.filter((t) => isTextObjectType((t as { type?: unknown }).type))
  if (textTargets.length === 0) return

  for (const obj of textTargets) {
    const o = obj as { set?: (props: Record<string, unknown>) => void; setCoords?: () => void; initDimensions?: () => void }
    o.set?.({ textAlign: args.textAlign })
    o.initDimensions?.()
    o.setCoords?.()
    canvas.fire('object:modified', { target: obj })
  }

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
