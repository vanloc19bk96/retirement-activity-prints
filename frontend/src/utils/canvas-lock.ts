import type { Canvas, FabricObject } from 'fabric'

import { isFabricActiveSelection } from '@/utils/fabric-active-selection'

type LockableObject = FabricObject & {
  lockMovementX?: boolean
  lockMovementY?: boolean
  lockScalingX?: boolean
  lockScalingY?: boolean
  lockRotation?: boolean
  hasControls?: boolean
  selectable?: boolean
  editable?: boolean
  isEditing?: boolean
  exitEditing?: () => unknown
}

export function isObjectLocked(obj: LockableObject): boolean {
  return Boolean(
    obj.lockMovementX &&
      obj.lockMovementY &&
      obj.lockScalingX &&
      obj.lockScalingY &&
      obj.lockRotation,
  )
}

export function setObjectLocked(obj: LockableObject, nextLocked: boolean): void {
  if (nextLocked && obj.isEditing && typeof obj.exitEditing === 'function') {
    obj.exitEditing()
  }

  const textLockPatch: { editable?: boolean } = {}
  if (typeof obj.editable === 'boolean') {
    textLockPatch.editable = !nextLocked
  }

  obj.set({
    lockMovementX: nextLocked,
    lockMovementY: nextLocked,
    lockScalingX: nextLocked,
    lockScalingY: nextLocked,
    lockRotation: nextLocked,
    hasControls: !nextLocked,
    // Keep selectable so user can click to unlock.
    selectable: true,
    ...textLockPatch,
  })
  obj.setCoords()
}

export function getActiveLockState(canvas: Canvas): boolean | null {
  const target = canvas.getActiveObject() as (LockableObject & { getObjects?: () => FabricObject[] }) | null
  if (!target) return null

  if (isFabricActiveSelection(target)) {
    const objects = target.getObjects() as LockableObject[]
    if (objects.length === 0) return null
    return objects.every((o) => isObjectLocked(o))
  }

  return isObjectLocked(target)
}

export function toggleLockActive(canvas: Canvas): void {
  const target = canvas.getActiveObject() as (LockableObject & { getObjects?: () => FabricObject[] }) | null
  if (!target) return

  if (isFabricActiveSelection(target)) {
    const objects = target.getObjects() as LockableObject[]
    if (objects.length === 0) return
    const shouldLock = objects.some((o) => !isObjectLocked(o))

    for (const obj of objects) setObjectLocked(obj, shouldLock)
    target.setCoords()
    canvas.requestRenderAll()
    return
  }

  setObjectLocked(target, !isObjectLocked(target))
  canvas.requestRenderAll()
}

