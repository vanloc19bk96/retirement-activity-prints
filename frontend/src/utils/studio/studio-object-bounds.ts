/**
 * Bounds of the plain-JSON Fabric objects generators emit.
 *
 * These numbers are not cosmetic. Fabric rasterises a cached object into a
 * canvas sized from its own `width`/`height` (`_getCacheCanvasDimensions`, plus
 * a 2px aliasing allowance), and `Group.fromObject` restores the serialized
 * width/height verbatim through a `NoopLayoutManager`. So a group whose box is
 * a pixel short of its children does not merely get a tight selection
 * rectangle — it *clips* them. A standalone `FabricText` escapes this because
 * it pads its own cache by a full `fontSize`; a text object nested in a group
 * gets no such padding, which is how descenders lost their tails on the bottom
 * row of every generated grid.
 */

import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from './studio-layout'
import {
  fabricTextHeight,
  measureRunWidth,
  wrapTextToWidth,
  type FontSpec,
} from './studio-text-metrics'

export interface Extent {
  left: number
  top: number
  right: number
  bottom: number
}

/** Fabric `FabricText.ownDefaults.lineHeight` — applies whenever we omit it. */
const FABRIC_DEFAULT_LINE_HEIGHT = 1

const TEXT_TYPES = new Set(['textbox', 'text', 'i-text', 'itext'])

export function isTextObject(o: StudioFabricObject): boolean {
  return TEXT_TYPES.has(String(o.type))
}

function fontSpecOf(o: StudioFabricObject): FontSpec {
  return {
    fontFamily: o.fontFamily,
    fontWeight: o.fontWeight,
    fontStyle: o.fontStyle,
  }
}

/** Extra advance Fabric adds per glyph for `charSpacing` (1/1000 em). */
function charSpacingWidth(o: StudioFabricObject, text: string): number {
  const charSpacing = o.charSpacing ?? 0
  if (!charSpacing) return 0
  const longest = text
    .split('\n')
    .reduce((max, line) => Math.max(max, [...line].length), 0)
  return (charSpacing / 1000) * (o.fontSize ?? 0) * longest
}

/**
 * Width Fabric will settle on. A Textbox never breaks a word: when one is wider
 * than the declared box, `initDimensions` grows the box to `dynamicMinWidth`
 * instead — so the rendered object can be wider than the width we asked for.
 */
function textObjectWidth(o: StudioFabricObject): number {
  const fontSize = o.fontSize ?? 0
  const text = String(o.text ?? '')
  const spec = fontSpecOf(o)
  const declared = typeof o.width === 'number' ? o.width : 0
  let longestWord = 0
  for (const word of text.split(/\s+/)) {
    if (word) longestWord = Math.max(longestWord, measureRunWidth(word, fontSize, spec))
  }
  const extra = charSpacingWidth(o, text)
  if (declared > 0) return Math.max(declared, Math.ceil(longestWord + extra))
  // No declared width: the box hugs its longest line.
  let longestLine = 0
  for (const line of text.split('\n')) {
    longestLine = Math.max(longestLine, measureRunWidth(line, fontSize, spec))
  }
  return Math.ceil(Math.max(longestLine, longestWord) + extra)
}

/**
 * Height Fabric will render, wrapped lines included — `calcTextHeight()`:
 * a full `fontSize x mult x lineHeight` pitch for every line but the last,
 * which contributes only its `fontSize x mult` glyph box.
 */
export function textObjectHeight(o: StudioFabricObject): number {
  const fontSize = o.fontSize ?? 0
  if (fontSize <= 0) return 0
  const lineHeight = o.lineHeight ?? FABRIC_DEFAULT_LINE_HEIGHT
  const text = String(o.text ?? '')
  const wrapWidth = textObjectWidth(o)
  const lines =
    o.type === 'textbox' && wrapWidth > 0
      ? wrapTextToWidth(text, fontSize, wrapWidth, fontSpecOf(o)).length
      : Math.max(1, text.split('\n').length)
  return Math.ceil(fabricTextHeight(lines, fontSize, lineHeight))
}

/**
 * AABB of a w x h box anchored at (left, top) by its origin and spun `angle`
 * degrees about that same anchor — the order Fabric applies them. Ignoring the
 * rotation is not conservative in either direction: a long capsule laid at 45°
 * reads far wider than it draws, which pushes a group's box sideways.
 */
function orientedExtent(
  left: number,
  top: number,
  width: number,
  height: number,
  originX: StudioFabricObject['originX'],
  originY: StudioFabricObject['originY'],
  angle: number,
): Extent {
  const x0 = originX === 'center' ? -width / 2 : originX === 'right' ? -width : 0
  const y0 = originY === 'center' ? -height / 2 : originY === 'bottom' ? -height : 0
  if (!angle) {
    return { left: left + x0, top: top + y0, right: left + x0 + width, bottom: top + y0 + height }
  }
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [cx, cy] of [
    [x0, y0],
    [x0 + width, y0],
    [x0, y0 + height],
    [x0 + width, y0 + height],
  ]) {
    const rx = cx * cos - cy * sin
    const ry = cx * sin + cy * cos
    if (rx < minX) minX = rx
    if (rx > maxX) maxX = rx
    if (ry < minY) minY = ry
    if (ry > maxY) maxY = ry
  }
  return { left: left + minX, top: top + minY, right: left + maxX, bottom: top + maxY }
}

/** Axis-aligned bounds of one Fabric JSON object (handles line / circle / origin). */
export function objectExtent(o: StudioFabricObject): Extent {
  if (o.type === 'line') {
    // Center-origin lines: x1/y1 are relative to left/top (Fabric 7 native).
    // Legacy lines: x1/y1 are absolute canvas coordinates.
    const relative = o.originX === 'center'
    const x1 = relative ? o.left + (o.x1 ?? 0) : (o.x1 ?? o.left)
    const y1 = relative ? o.top + (o.y1 ?? 0) : (o.y1 ?? o.top)
    const x2 = relative ? o.left + (o.x2 ?? 0) : (o.x2 ?? o.left)
    const y2 = relative ? o.top + (o.y2 ?? 0) : (o.y2 ?? o.top)
    const pad = (o.strokeWidth ?? 0) / 2
    return {
      left: Math.min(x1, x2) - pad,
      top: Math.min(y1, y2) - pad,
      right: Math.max(x1, x2) + pad,
      bottom: Math.max(y1, y2) + pad,
    }
  }

  const isText = isTextObject(o)
  // Apply scale — Phosphor icons use viewBox 256 with scaleX << 1.
  const scaleX = o.scaleX ?? 1
  const scaleY = o.scaleY ?? 1
  const fontSize = o.fontSize ?? 0
  const width =
    (isText
      ? textObjectWidth(o)
      : (o.width ?? (o.radius != null ? o.radius * 2 : 0))) * scaleX
  // Fabric recomputes a text object's height from its own metrics on enliven,
  // so a serialized `height` is never what gets drawn — always measure.
  const height =
    (isText
      ? textObjectHeight(o)
      : (o.height ?? (o.radius != null ? o.radius * 2 : fontSize || 0))) * scaleY
  const pad = (o.strokeWidth ?? 0) / 2
  const box = orientedExtent(
    o.left,
    o.top,
    width,
    height,
    o.originX,
    o.originY,
    o.angle ?? 0,
  )
  return {
    left: box.left - pad,
    top: box.top - pad,
    right: box.right + pad,
    bottom: box.bottom + pad,
  }
}

/** Tight box around drawn objects — use for buildGroup so selection matches content. */
export function unionObjectBounds(objects: StudioFabricObject[]): Box | null {
  if (objects.length === 0) return null
  let minL = Infinity
  let minT = Infinity
  let maxR = -Infinity
  let maxB = -Infinity
  for (const o of objects) {
    const e = objectExtent(o)
    if (e.left < minL) minL = e.left
    if (e.top < minT) minT = e.top
    if (e.right > maxR) maxR = e.right
    if (e.bottom > maxB) maxB = e.bottom
  }
  if (!Number.isFinite(minL)) return null
  return { left: minL, top: minT, width: maxR - minL, height: maxB - minT }
}
