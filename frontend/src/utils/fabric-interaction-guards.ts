import type { Canvas } from 'fabric'

const EDITABLE_TEXT_TYPES = new Set(['textbox', 'i-text', 'text'])

export function isFabricEditableTextType(type: string | undefined): boolean {
  return Boolean(type && EDITABLE_TEXT_TYPES.has(type))
}

/** End inline edit so a canvas drop does not paste drag data into the hidden textarea. */
export function exitActiveFabricTextEditing(canvas: Canvas): void {
  const active = canvas.getActiveObject() as
    | { isEditing?: boolean; exitEditing?: () => void }
    | undefined
  if (active?.isEditing && typeof active.exitEditing === 'function') {
    active.exitEditing()
  }
}

/**
 * Fabric `SelectableCanvas._currentTransform.action` values where the scene-space AABB
 * moves without `object:moving` (scale / skew / textbox width). `object:scaling` only
 * fires when scale values change, so we also refresh guides from `mouse:move` while
 * these run.
 */
export function isFabricSceneBboxTransformAction(action: string | undefined): boolean {
  if (!action) return false
  return (
    action === 'scale' ||
    action === 'scaleX' ||
    action === 'scaleY' ||
    action === 'skewX' ||
    action === 'skewY' ||
    action === 'resizing'
  )
}
