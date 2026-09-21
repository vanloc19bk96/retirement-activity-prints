import type { Canvas } from 'fabric'

import { getActiveSelectionTargets } from '@/utils/canvas-selection'

export function bringActiveSelectionToFront(canvas: Canvas): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return

  for (const target of targets) {
    canvas.bringObjectToFront(target)
  }

  canvas.requestRenderAll()
}

export function sendActiveSelectionToBack(canvas: Canvas): void {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return

  for (let index = targets.length - 1; index >= 0; index -= 1) {
    canvas.sendObjectToBack(targets[index])
  }

  canvas.requestRenderAll()
}
