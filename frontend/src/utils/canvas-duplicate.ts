import { ActiveSelection, type Canvas, type FabricObject } from 'fabric'

import { getActiveSelectionTargets } from '@/utils/canvas-selection'

type CloneableObject = FabricObject & {
  clone?: (callback?: (cloned: FabricObject | null) => void) => Promise<FabricObject> | void
}

const DUPLICATE_OFFSET_PX = 16

async function cloneFabricObject(target: CloneableObject): Promise<FabricObject | null> {
  if (!target?.clone) return null

  try {
    const promiseClone = await target.clone()
    if (promiseClone) return promiseClone
  } catch {
    // Fallback to callback API used by older Fabric versions.
  }

  return await new Promise((resolve) => {
    try {
      target.clone?.((cloned) => resolve(cloned ?? null))
    } catch {
      resolve(null)
    }
  })
}

function offsetClonedObject(target: FabricObject): void {
  const left = typeof target.left === 'number' ? target.left : 0
  const top = typeof target.top === 'number' ? target.top : 0
  target.set({
    left: left + DUPLICATE_OFFSET_PX,
    top: top + DUPLICATE_OFFSET_PX,
  })
  target.setCoords?.()
}

export function duplicateActiveSelection(canvas: Canvas): void {
  const targets = getActiveSelectionTargets(canvas) as CloneableObject[]
  if (targets.length === 0) return

  void (async () => {
    const duplicatedTargets: FabricObject[] = []

    for (const target of targets) {
      const cloned = await cloneFabricObject(target)
      if (!cloned) continue
      offsetClonedObject(cloned)
      canvas.add(cloned)
      duplicatedTargets.push(cloned)
    }

    if (duplicatedTargets.length === 0) return

    if (duplicatedTargets.length === 1) {
      canvas.setActiveObject(duplicatedTargets[0])
      canvas.requestRenderAll()
      return
    }

    const duplicatedSelection = new ActiveSelection(duplicatedTargets, { canvas })
    canvas.setActiveObject(duplicatedSelection)
    canvas.requestRenderAll()
  })()
}
