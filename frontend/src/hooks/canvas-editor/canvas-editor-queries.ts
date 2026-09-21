import { ActiveSelection, Group, type Canvas } from 'fabric'

import { isFabricActiveSelection } from '@/utils/fabric-active-selection'
import { isLucideIconGroup } from '@/utils/lucide-fabric'
import { isPhosphorIconGroup } from '@/utils/phosphor-fabric'
import { isStudioShapeGroup } from '@/utils/studio-shape-group'
import { isImageObjectType, isTextObjectType } from './canvas-editor-helpers'

function isGroupObjectType(target: unknown): boolean {
  return target instanceof Group && !(target instanceof ActiveSelection)
}

function isEditableIconGroup(target: unknown): boolean {
  return isLucideIconGroup(target) || isPhosphorIconGroup(target) || isStudioShapeGroup(target)
}

function isShapeObjectTarget(target: any): boolean {
  if (!target) return false
  if (isGroupObjectType(target)) return isEditableIconGroup(target)
  return !isTextObjectType(target.type) && !isImageObjectType(target.type)
}

export function readActiveTextObject(canvas: Canvas | null): any | null {
  if (!canvas) return null

  const target = canvas.getActiveObject?.() as any
  if (!target) return null
  if (!isTextObjectType(target.type)) return null
  return target
}

export function readActiveImageObject(canvas: Canvas | null): any | null {
  if (!canvas) return null

  const target = canvas.getActiveObject?.() as any
  if (!target) return null
  if (String(target.type ?? '') !== 'image') return null
  return target
}

export function readActiveShapeTargets(canvas: Canvas | null): any[] {
  if (!canvas) return []

  const activeObject = canvas.getActiveObject?.() as any
  if (!activeObject) return []

  if (isFabricActiveSelection(activeObject)) {
    const activeObjects = (canvas as any).getActiveObjects?.() as any[] | undefined
    if (!Array.isArray(activeObjects) || activeObjects.length === 0) return []
    return activeObjects.every(isShapeObjectTarget) ? activeObjects : []
  }

  return isShapeObjectTarget(activeObject) ? [activeObject] : []
}

export function readActiveRectTargets(canvas: Canvas | null): any[] {
  const targets = readActiveShapeTargets(canvas)
  return targets.filter((t) => String(t?.type ?? '') === 'rect')
}
