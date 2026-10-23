import type { Canvas, FabricObject } from 'fabric'

import { clampCoverImagePosition, clampImageMaxScale } from '@/utils/canvas-image'
import { getLayerKind, getLayerName, type LayerKind } from '@/utils/canvas-layers'
import { getActiveLockState } from '@/utils/canvas-lock'
import { getActiveSelectionTargets } from '@/utils/canvas-selection'
import { isFabricActiveSelection } from '@/utils/fabric-active-selection'
import {
  applyFabricTextboxWidthAfterMetricChange,
  shouldRefitFabricTextboxToUnwrappedLine,
} from '@/utils/fabric-textbox-width'
import { keepLucideIconStrokeWidthStableOnScale } from '@/utils/lucide-icon-stroke-width'

export type TextParagraphAlign = 'left' | 'center' | 'right' | 'justify'

export type SelectionTextProperties = {
  lineHeight: number
  /** Fabric `charSpacing` is in 1/1000 em; shown as a percentage of the font size, like Figma. */
  letterSpacingPercent: number
  textAlign: TextParagraphAlign
}

/** What the Design tab shows for the current canvas selection. Sizes are canvas pixels (96 per inch). */
export type SelectionProperties = {
  count: number
  /** Null when several objects are selected. */
  kind: LayerKind | null
  name: string
  x: number
  y: number
  width: number
  height: number
  /** Null for a multi-selection: its angle resets every time it's made, so it means nothing to the user. */
  angle: number | null
  /** 0–1; null when the selected objects differ. */
  opacity: number | null
  flipX: boolean
  flipY: boolean
  isLocked: boolean
  /** A textbox reflows when its width changes and its height follows the text. */
  isTextbox: boolean
  text: SelectionTextProperties | null
}

type TextLike = FabricObject & {
  text?: unknown
  lineHeight?: number
  charSpacing?: number
  textAlign?: string
  initDimensions?: () => void
}

const MIN_SIZE_PX = 1

function isTextObject(object: FabricObject | null | undefined): object is TextLike {
  const type = String(object?.type ?? '').toLowerCase()
  return type === 'textbox' || type === 'i-text' || type === 'text'
}

function readTextAlign(value: unknown): TextParagraphAlign {
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left'
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function readSelectionProperties(canvas: Canvas): SelectionProperties | null {
  const target = canvas.getActiveObject()
  if (!target) return null

  const targets = getActiveSelectionTargets(canvas)
  const isMulti = isFabricActiveSelection(target) && targets.length > 1
  const single = isMulti ? null : (targets[0] ?? target)
  const bounds = target.getBoundingRect()

  const opacities = targets.map((object) => object.opacity ?? 1)
  const isSameOpacity = opacities.every((value) => value === opacities[0])

  return {
    count: Math.max(1, targets.length),
    kind: single ? getLayerKind(single) : null,
    name: single ? getLayerName(single) : `${targets.length} objects`,
    x: round(bounds.left),
    y: round(bounds.top),
    width: round(target.getScaledWidth()),
    height: round(target.getScaledHeight()),
    angle: isMulti ? null : round(target.angle ?? 0, 2),
    opacity: isSameOpacity ? (opacities[0] ?? 1) : null,
    flipX: Boolean(target.flipX),
    flipY: Boolean(target.flipY),
    isLocked: getActiveLockState(canvas) === true,
    isTextbox: !isMulti && String(target.type) === 'textbox',
    text:
      single && isTextObject(single)
        ? {
            lineHeight: round(single.lineHeight ?? 1.16, 2),
            letterSpacingPercent: round((single.charSpacing ?? 0) / 10, 1),
            textAlign: readTextAlign(single.textAlign),
          }
        : null,
  }
}

export function areSelectionPropertiesEqual(a: SelectionProperties | null, b: SelectionProperties | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.count === b.count &&
    a.kind === b.kind &&
    a.name === b.name &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.angle === b.angle &&
    a.opacity === b.opacity &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY &&
    a.isLocked === b.isLocked &&
    a.isTextbox === b.isTextbox &&
    a.text?.lineHeight === b.text?.lineHeight &&
    a.text?.letterSpacingPercent === b.text?.letterSpacingPercent &&
    a.text?.textAlign === b.text?.textAlign
  )
}

/** The active object when it may be edited; locked selections are left alone, as on the toolbar. */
function getEditableTarget(canvas: Canvas): FabricObject | null {
  const target = canvas.getActiveObject()
  if (!target || getActiveLockState(canvas)) return null
  return target
}

/** Programmatic edits don't emit object:modified; history, thumbnails and the toolbar listen for it. */
function commit(canvas: Canvas, target: FabricObject): void {
  target.setCoords()
  canvas.fire('object:modified', { target })
  canvas.requestRenderAll()
}

/** Keeps cover images inside their zone, as dragging and scaling them on the canvas does. */
function applyCanvasConstraints(target: FabricObject): void {
  clampImageMaxScale(target)
  clampCoverImagePosition(target)
}

/** X/Y are the top-left of the on-canvas bounding box, so they match what the user sees. */
export function setSelectionPosition(canvas: Canvas, axis: 'x' | 'y', value: number): void {
  const target = getEditableTarget(canvas)
  if (!target || !Number.isFinite(value)) return
  const bounds = target.getBoundingRect()
  if (axis === 'x') target.set('left', (target.left ?? 0) + (value - bounds.left))
  else target.set('top', (target.top ?? 0) + (value - bounds.top))
  target.setCoords()
  applyCanvasConstraints(target)
  commit(canvas, target)
}

/**
 * Resizes around the top-left corner of the bounding box (the way Figma does). A textbox gets a new
 * wrap width instead of being stretched, so its text keeps its font size.
 */
export function setSelectionSize(
  canvas: Canvas,
  dimension: 'width' | 'height',
  value: number,
  keepAspectRatio: boolean,
): void {
  const target = getEditableTarget(canvas)
  if (!target || !Number.isFinite(value)) return
  const nextValue = Math.max(MIN_SIZE_PX, value)
  const current = dimension === 'width' ? target.getScaledWidth() : target.getScaledHeight()
  if (!(current > 0)) return

  const before = target.getBoundingRect()
  const isTextbox = String(target.type) === 'textbox' && !isFabricActiveSelection(target)

  if (isTextbox && dimension === 'width') {
    const scaleX = Math.abs(target.scaleX ?? 1) || 1
    target.set('width', Math.max(MIN_SIZE_PX, nextValue / scaleX))
    ;(target as TextLike).initDimensions?.()
  } else {
    const factor = nextValue / current
    const scaleX = target.scaleX ?? 1
    const scaleY = target.scaleY ?? 1
    if (dimension === 'width') {
      target.set({ scaleX: scaleX * factor, ...(keepAspectRatio ? { scaleY: scaleY * factor } : {}) })
    } else {
      target.set({ scaleY: scaleY * factor, ...(keepAspectRatio ? { scaleX: scaleX * factor } : {}) })
    }
    keepLucideIconStrokeWidthStableOnScale(target)
  }

  target.setCoords()
  const after = target.getBoundingRect()
  target.set({
    left: (target.left ?? 0) + (before.left - after.left),
    top: (target.top ?? 0) + (before.top - after.top),
  })
  target.setCoords()
  applyCanvasConstraints(target)
  commit(canvas, target)
}

export function setSelectionAngle(canvas: Canvas, angle: number): void {
  const target = getEditableTarget(canvas)
  if (!target || !Number.isFinite(angle) || isFabricActiveSelection(target)) return
  const normalized = ((angle % 360) + 360) % 360
  target.rotate(normalized)
  commit(canvas, target)
}

/**
 * `isFinal` false only previews (slider drag); true records the change. A multi-selection
 * applies to every object, since opacity on the temporary selection itself isn't saved.
 */
export function setSelectionOpacity(canvas: Canvas, opacity: number, isFinal: boolean): void {
  const target = getEditableTarget(canvas)
  if (!target || !Number.isFinite(opacity)) return
  const value = Math.min(1, Math.max(0, opacity))
  for (const object of getActiveSelectionTargets(canvas)) object.set('opacity', value)
  if (isFinal) commit(canvas, target)
  else canvas.requestRenderAll()
}

export function toggleSelectionFlip(canvas: Canvas, axis: 'x' | 'y'): void {
  const target = getEditableTarget(canvas)
  if (!target || isFabricActiveSelection(target)) return
  if (axis === 'x') target.set('flipX', !target.flipX)
  else target.set('flipY', !target.flipY)
  commit(canvas, target)
}

export function setSelectionTextProperties(
  canvas: Canvas,
  patch: { lineHeight?: number; letterSpacingPercent?: number },
): void {
  const target = getEditableTarget(canvas)
  if (!target || !isTextObject(target)) return
  const changes: Record<string, number> = {}
  if (patch.lineHeight !== undefined && Number.isFinite(patch.lineHeight)) {
    changes.lineHeight = Math.min(5, Math.max(0.5, patch.lineHeight))
  }
  if (patch.letterSpacingPercent !== undefined && Number.isFinite(patch.letterSpacingPercent)) {
    changes.charSpacing = Math.min(1000, Math.max(-50, patch.letterSpacingPercent)) * 10
  }
  if (Object.keys(changes).length === 0) return

  // A one-line textbox grows with wider letter spacing instead of wrapping its last word.
  const shouldRefit = shouldRefitFabricTextboxToUnwrappedLine(target as never)
  target.set(changes)
  applyFabricTextboxWidthAfterMetricChange(target as never, shouldRefit)
  commit(canvas, target)
}

/** Paragraph alignment inside every selected text box. */
export function setSelectionTextAlign(canvas: Canvas, textAlign: TextParagraphAlign): void {
  const target = getEditableTarget(canvas)
  if (!target) return
  const textTargets = getActiveSelectionTargets(canvas).filter(isTextObject)
  if (textTargets.length === 0) return
  for (const text of textTargets) {
    text.set('textAlign', textAlign)
    text.initDimensions?.()
    text.setCoords()
  }
  commit(canvas, target)
}
