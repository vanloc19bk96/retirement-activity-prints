import { ActiveSelection, Group, type Canvas } from 'fabric'

import { normalizeFontFamilyForToolbar } from '@/constants/font-families'
import { isFabricActiveSelection } from '@/utils/fabric-active-selection'
import { isLucideIconGroup } from '@/utils/lucide-fabric'
import {
  isPhosphorIconGroup,
  readPhosphorPrimaryFill,
  readPhosphorSecondaryFill,
} from '@/utils/phosphor-fabric'
import {
  isStudioShapeGroup,
  readStudioShapeGroupInkChild,
} from '@/utils/studio-shape-group'

export type ShapeBorderStyle = 'solid' | 'dash' | 'dot'

export type CanvasSelectionInfo = {
  hasSelection: boolean
  selectionCount: number
  isText: boolean
  isImage: boolean
  isShape: boolean
  /** Lucide icon group (e.g. from IconPanel). */
  isLucideIconSelection: boolean
  /** Fabric `textAlign` when the selection is editable text. */
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  fontFamily?: string
  fontSize?: number
  textColor?: string
  isBold?: boolean
  isItalic?: boolean
  isUnderline?: boolean
  strokeWidth?: number
  borderStyle?: ShapeBorderStyle
  strokeColor?: string
  fillColor?: string
  canEditCornerRadius?: boolean
  cornerRadius?: number
  /** Upper bound for rx/ry on the selected rect (half of the shorter side). */
  cornerRadiusMax?: number
}

export type CanvasSelectionSnapshot = {
  hasSelection: boolean
  selectionInfo: CanvasSelectionInfo
  isLocked: boolean
}

/** `textbox`: wraps when width < text (Fabric Textbox). `i-text`: legacy; upgraded on canvas restore. */
const TEXT_OBJECT_TYPES = ['textbox', 'i-text', 'text'] as const

const isTextTarget = (obj: unknown): boolean => {
  const type = (obj as any)?.type
  if (!type) return false
  return TEXT_OBJECT_TYPES.includes(String(type) as (typeof TEXT_OBJECT_TYPES)[number])
}

const isImageTarget = (obj: unknown): boolean => String((obj as any)?.type ?? '') === 'image'

const isGroupTarget = (obj: unknown): boolean => obj instanceof Group && !(obj instanceof ActiveSelection)

const isEditableIconGroup = (obj: unknown): boolean =>
  isLucideIconGroup(obj) || isPhosphorIconGroup(obj) || isStudioShapeGroup(obj)

const isShapeTarget = (obj: unknown): boolean =>
  !isTextTarget(obj) && !isImageTarget(obj) && (!isGroupTarget(obj) || isEditableIconGroup(obj))

const isShapeSelectionTarget = (target: any): boolean => {
  if (isFabricActiveSelection(target)) {
    const objects = (target.getObjects?.() ?? []) as unknown[]
    return objects.length > 0 && objects.every(isShapeTarget)
  }

  return isShapeTarget(target)
}

const selectionIncludesLucideIcon = (target: any): boolean => {
  if (!target) return false
  if (isFabricActiveSelection(target)) {
    return ((target.getObjects?.() ?? []) as unknown[]).some((o) => isLucideIconGroup(o))
  }
  return isLucideIconGroup(target)
}

const readStrokeWidth = (obj: any): number | undefined => {
  // Phosphor duotone is fill geometry — stroke width does not drive appearance.
  if (isPhosphorIconGroup(obj)) return 0
  if (isLucideIconGroup(obj)) {
    const firstChild = (obj.getObjects?.() ?? [])[0] as any
    const groupValue = firstChild?.strokeWidth
    return typeof groupValue === 'number' && Number.isFinite(groupValue) ? groupValue : undefined
  }
  if (isStudioShapeGroup(obj)) {
    const ink = readStudioShapeGroupInkChild(obj) as { strokeWidth?: unknown } | null
    const groupValue = ink?.strokeWidth
    return typeof groupValue === 'number' && Number.isFinite(groupValue) ? groupValue : undefined
  }
  const value = obj?.strokeWidth
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const readStrokeColor = (obj: any): string | undefined => {
  if (isPhosphorIconGroup(obj)) return readPhosphorPrimaryFill(obj)
  if (isLucideIconGroup(obj)) {
    const firstChild = (obj.getObjects?.() ?? [])[0] as any
    const groupStroke = firstChild?.stroke
    return typeof groupStroke === 'string' && groupStroke.length > 0 ? groupStroke : undefined
  }
  if (isStudioShapeGroup(obj)) {
    const ink = readStudioShapeGroupInkChild(obj) as { stroke?: unknown } | null
    const groupStroke = ink?.stroke
    return typeof groupStroke === 'string' && groupStroke.length > 0 ? groupStroke : undefined
  }
  const stroke = obj?.stroke
  return typeof stroke === 'string' && stroke.length > 0 ? stroke : undefined
}

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((x) => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('')

const readFillColor = (obj: any): string | undefined => {
  if (isLucideIconGroup(obj)) return undefined
  if (isPhosphorIconGroup(obj)) return readPhosphorSecondaryFill(obj)
  if (isStudioShapeGroup(obj)) {
    const ink = readStudioShapeGroupInkChild(obj) as { fill?: unknown } | null
    return readPlainFillColor(ink?.fill)
  }
  return readPlainFillColor(obj?.fill)
}

const readPlainFillColor = (fill: unknown): string | undefined => {
  if (typeof fill !== 'string' || fill.length === 0) return undefined
  if (fill === 'transparent' || /rgba?\s*\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(fill)) return undefined
  if (/^#[0-9A-Fa-f]{6}$/.test(fill)) return fill
  const m = fill.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (m) return rgbToHex(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))
  return fill
}

/**
 * Max corner radius in **canvas pixels** (half of shorter side after scale).
 * Same rule as dot2dot-maker: rx/ry must convert to this cap when applied with scaleX/scaleY.
 */
export function getMaxCornerRadiusForFabricRect(obj: unknown): number {
  const o = obj as { width?: unknown; height?: unknown; scaleX?: unknown; scaleY?: unknown }
  const w = Number(o?.width)
  const h = Number(o?.height)
  const sx =
    typeof o?.scaleX === 'number' && Number.isFinite(o.scaleX) && o.scaleX !== 0
      ? Math.abs(o.scaleX)
      : 1
  const sy =
    typeof o?.scaleY === 'number' && Number.isFinite(o.scaleY) && o.scaleY !== 0
      ? Math.abs(o.scaleY)
      : 1
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0
  const aw = w * sx
  const ah = h * sy
  return Math.min(aw, ah) / 2
}

const readCornerRadius = (obj: any): number | undefined => {
  const rx = obj?.rx
  const ry = obj?.ry
  const scaleX =
    typeof obj?.scaleX === 'number' && Number.isFinite(obj.scaleX) && obj.scaleX !== 0
      ? Math.abs(obj.scaleX)
      : 1
  const scaleY =
    typeof obj?.scaleY === 'number' && Number.isFinite(obj.scaleY) && obj.scaleY !== 0
      ? Math.abs(obj.scaleY)
      : 1

  let visual: number | undefined
  if (typeof rx === 'number' && Number.isFinite(rx) && typeof ry === 'number' && Number.isFinite(ry)) {
    visual = Math.min(rx * scaleX, ry * scaleY)
  } else if (typeof rx === 'number' && Number.isFinite(rx)) {
    visual = rx * scaleX
  } else if (typeof ry === 'number' && Number.isFinite(ry)) {
    visual = ry * scaleY
  } else {
    return undefined
  }

  const maxV = getMaxCornerRadiusForFabricRect(obj)
  return Math.round(Math.min(visual, maxV))
}

const canEditCornerRadius = (obj: any): boolean => String(obj?.type ?? '') === 'rect'

const readBorderStyle = (obj: any): ShapeBorderStyle | undefined => {
  if (isPhosphorIconGroup(obj)) return 'solid'
  const dash = isLucideIconGroup(obj)
    ? (obj.getObjects?.() ?? [])[0]?.strokeDashArray
    : isStudioShapeGroup(obj)
      ? (readStudioShapeGroupInkChild(obj) as { strokeDashArray?: unknown } | null)?.strokeDashArray
      : obj?.strokeDashArray
  if (!Array.isArray(dash) || dash.length === 0) return 'solid'

  const first = dash[0]
  if (typeof first !== 'number') return 'solid'

  // Heuristic: short dash = dot, otherwise dash.
  return first <= 3 ? 'dot' : 'dash'
}

/**
 * Uniform scale used for text rendering (matches read path for toolbar font size).
 * Fabric applies scale to the whole text object; effective size ≈ fontSize × textScale.
 */
export function getFabricTextScale(target: { scaleX?: number; scaleY?: number }): number {
  const scaleX =
    typeof target.scaleX === 'number' && Number.isFinite(target.scaleX) ? Math.abs(target.scaleX) : 1
  const scaleY =
    typeof target.scaleY === 'number' && Number.isFinite(target.scaleY) ? Math.abs(target.scaleY) : 1
  const textScale = scaleY > 0 ? scaleY : scaleX
  return textScale > 0 ? textScale : 1
}

/** Convert toolbar “visual” font size to raw Fabric `fontSize` while preserving object scale. */
export function effectiveFontSizeToRawFontSize(
  effectiveFontSize: number,
  target: { scaleX?: number; scaleY?: number },
): number {
  const textScale = getFabricTextScale(target)
  return Math.max(1, effectiveFontSize / textScale)
}

const readShapeTarget = (target: any): any | null => {
  if (!target) return null
  if (isFabricActiveSelection(target)) {
    const objects = (target.getObjects?.() ?? []) as any[]
    return objects[0] ?? null
  }
  return target
}

const readLocked = (obj: any): boolean =>
  Boolean(
    obj?.lockMovementX &&
      obj?.lockMovementY &&
      obj?.lockScalingX &&
      obj?.lockScalingY &&
      obj?.lockRotation,
  )

const readSelectionCount = (target: any | null, activeSelectionCount: number): number => {
  if (activeSelectionCount > 0) return activeSelectionCount
  if (!target) return 0
  if (isFabricActiveSelection(target)) {
    return ((target.getObjects?.() ?? []) as unknown[]).length
  }
  return 1
}

const readTextParagraphAlign = (target: any): 'left' | 'center' | 'right' | 'justify' => {
  const a = target?.textAlign
  if (a === 'center' || a === 'right' || a === 'justify') return a
  return 'left'
}

const readSelectionInfo = (
  target: any | null,
  hasSelection: boolean,
  selectionCount: number,
): CanvasSelectionInfo => {
  if (!hasSelection || !target) {
    return {
      hasSelection: false,
      selectionCount: 0,
      isText: false,
      isImage: false,
      isShape: false,
      isLucideIconSelection: false,
    }
  }

  if (!isTextTarget(target)) {
    const isImage = isImageTarget(target)
    const isShape = !isImage && isShapeSelectionTarget(target)
    const isLucideIconSelection = selectionIncludesLucideIcon(target)
    const shapeTarget = isShape ? readShapeTarget(target) : null
    const canEditRadius = isShape && canEditCornerRadius(shapeTarget)
    return {
      hasSelection: true,
      selectionCount,
      isText: false,
      isImage,
      isShape,
      isLucideIconSelection,
      strokeWidth: isShape ? readStrokeWidth(shapeTarget) : undefined,
      borderStyle: isShape ? readBorderStyle(shapeTarget) : undefined,
      strokeColor: isShape ? readStrokeColor(shapeTarget) : undefined,
      fillColor: isShape ? readFillColor(shapeTarget) : undefined,
      canEditCornerRadius: canEditRadius,
      cornerRadius: canEditRadius ? readCornerRadius(shapeTarget) : undefined,
      cornerRadiusMax: canEditRadius ? Math.round(getMaxCornerRadiusForFabricRect(shapeTarget)) : undefined,
    }
  }

  const rawFontFamily = typeof target.fontFamily === 'string' ? target.fontFamily : undefined
  const fontFamily = normalizeFontFamilyForToolbar(rawFontFamily) ?? rawFontFamily
  const rawFontSize = typeof target.fontSize === 'number' ? target.fontSize : undefined
  const textScale = getFabricTextScale(target)
  const fontSize =
    typeof rawFontSize === 'number' ? Math.max(1, Math.round(rawFontSize * textScale)) : undefined
  const fontWeight = target.fontWeight
  const fontStyle = target.fontStyle
  const underline = target.underline
  const textColor = readFillColor(target)

  return {
    hasSelection: true,
    selectionCount,
    isText: true,
    isImage: false,
    isShape: false,
    isLucideIconSelection: false,
    textAlign: readTextParagraphAlign(target),
    fontFamily,
    fontSize,
    textColor,
    isBold: fontWeight === 'bold' || fontWeight === 700,
    isItalic: fontStyle === 'italic',
    isUnderline: Boolean(underline),
  }
}

const readIsLocked = (target: any | null): boolean => {
  if (!target) return false

  if (isFabricActiveSelection(target)) {
    const objects = (target.getObjects?.() ?? []) as any[]
    return objects.length > 0 ? objects.every(readLocked) : false
  }

  return readLocked(target)
}

const isActiveSelectionGroup = (obj: unknown): obj is { getObjects: () => unknown[] } =>
  typeof obj === 'object' &&
  obj !== null &&
  'multiSelectionStacking' in obj &&
  typeof (obj as { getObjects?: unknown }).getObjects === 'function'

/** True when the pointer target is the active object or a member of the active selection. */
export function isEventTargetInCurrentSelection(canvas: Canvas, fabricTarget: unknown): boolean {
  if (fabricTarget == null) return false
  const activeObject = canvas.getActiveObject?.() as unknown
  if (!activeObject) return false
  if (activeObject === fabricTarget) return true
  if (isActiveSelectionGroup(activeObject)) {
    const objects = activeObject.getObjects() ?? []
    return objects.includes(fabricTarget)
  }
  return false
}

export function getCanvasSelectionSnapshot(canvas: Canvas): CanvasSelectionSnapshot {
  const activeObject = canvas.getActiveObject?.() as any
  const activeSelection = (canvas as any).getActiveObjects?.() ?? []
  const hasSelection = Boolean(activeObject) || activeSelection.length > 0
  const selectionCount = readSelectionCount(activeObject, activeSelection.length)
  const selectionInfo = readSelectionInfo(activeObject, hasSelection, selectionCount)
  const isLocked = hasSelection ? readIsLocked(activeObject) : false

  return { hasSelection, selectionInfo, isLocked }
}
