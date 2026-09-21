import type { ShapeBorderStyle } from '@/utils/fabric-selection'
import { getMaxCornerRadiusForFabricRect } from '@/utils/fabric-selection'

export const isTextObjectType = (type: unknown): boolean => {
  const value = String(type ?? '')
  return value === 'textbox' || value === 'i-text' || value === 'text'
}

export const isImageObjectType = (type: unknown): boolean => String(type ?? '') === 'image'

export function readFabricImageSrc(imageObject: unknown): string | null {
  if (!imageObject) return null

  const anyObject = imageObject as any
  if (typeof anyObject.getSrc === 'function') {
    const src = anyObject.getSrc?.()
    if (typeof src === 'string' && src.length > 0) return src
  }

  const src = anyObject.src
  if (typeof src === 'string' && src.length > 0) return src

  return null
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

/** Max corner radius in canvas pixels (half of shorter side after scale). */
export function getRectMaxVisualCornerRadius(rect: {
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
}): number {
  return getMaxCornerRadiusForFabricRect(rect)
}

/**
 * Fabric stores rx/ry in local space before scale; toolbar uses canvas-space (visual) radius.
 */
export function applyVisualCornerRadiusToRect(
  rect: { set?: (props: Record<string, unknown>) => void; scaleX?: number; scaleY?: number },
  visualRadius: number,
): void {
  const sx =
    typeof rect.scaleX === 'number' && Number.isFinite(rect.scaleX) && rect.scaleX !== 0
      ? Math.abs(rect.scaleX)
      : 1
  const sy =
    typeof rect.scaleY === 'number' && Number.isFinite(rect.scaleY) && rect.scaleY !== 0
      ? Math.abs(rect.scaleY)
      : 1
  const clamped = Math.max(0, visualRadius)
  rect.set?.({ rx: clamped / sx, ry: clamped / sy })
}

export function getDashArray(borderStyle: ShapeBorderStyle): number[] | null {
  if (borderStyle === 'solid') return null
  if (borderStyle === 'dot') return [2, 6]
  return [12, 6]
}

