import type { StudioFabricObject } from '@/types/studio-template.types'
import { estimateTextBoxWidth, type Box } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK_MUTED, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import type { Point } from './clear-path'

export const MARKER_FONT_SIZE = 14
/** Gap between circle outer stroke and start/end label. */
export const MARKER_GAP = 10
/** Vertical/horizontal room around the scatter field for endpoint labels. */
export const MARKER_CLEARANCE = MARKER_FONT_SIZE + MARKER_GAP + 6

type MarkerSide = 'above' | 'below' | 'left' | 'right'

interface MarkerBox {
  left: number
  top: number
  width: number
  height: number
}

function outerRadius(radius: number): number {
  return radius + STUDIO_STROKE_NORMAL / 2
}

function markerSize(text: string): { width: number; height: number } {
  const maxW = Math.ceil(MARKER_FONT_SIZE * text.length)
  return {
    width: estimateTextBoxWidth(text, MARKER_FONT_SIZE, maxW),
    // lineHeight 1 — matches the textbox we emit (no extra leading into the rim).
    height: MARKER_FONT_SIZE,
  }
}

function boxForSide(
  side: MarkerSide,
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
): MarkerBox {
  const rim = outerRadius(radius)
  switch (side) {
    case 'above':
      return {
        left: x - width / 2,
        top: y - rim - MARKER_GAP - height,
        width,
        height,
      }
    case 'below':
      return {
        left: x - width / 2,
        top: y + rim + MARKER_GAP,
        width,
        height,
      }
    case 'left':
      return {
        left: x - rim - MARKER_GAP - width,
        top: y - height / 2,
        width,
        height,
      }
    case 'right':
      return {
        left: x + rim + MARKER_GAP,
        top: y - height / 2,
        width,
        height,
      }
  }
}

/** Negative when the label AABB intersects the circle (+ gap). */
function clearanceToCircle(box: MarkerBox, cx: number, cy: number, radius: number): number {
  const rim = outerRadius(radius)
  const qx = Math.max(box.left, Math.min(cx, box.left + box.width))
  const qy = Math.max(box.top, Math.min(cy, box.top + box.height))
  return Math.hypot(cx - qx, cy - qy) - rim
}

function isInsideField(box: MarkerBox, field: Box, slack = 2): boolean {
  return (
    box.left >= field.left - slack &&
    box.top >= field.top - slack &&
    box.left + box.width <= field.left + field.width + slack &&
    box.top + box.height <= field.top + field.height + slack
  )
}

function sidesForPreference(preferred: MarkerSide): MarkerSide[] {
  const order: MarkerSide[] = ['above', 'below', 'left', 'right']
  return [preferred, ...order.filter((s) => s !== preferred)]
}

/**
 * Place start/end so the label clears every circle stroke (not only its own).
 * Prefers above for start / below for end; falls back to left/right when crowded.
 */
export function buildEndpointMarker(options: {
  text: string
  x: number
  y: number
  radius: number
  font: string
  tag: StudioTag
  preferred: MarkerSide
  circles: Point[]
  field: Box
}): StudioFabricObject {
  const { text, x, y, radius, font, tag, preferred, circles, field } = options
  const { width, height } = markerSize(text)
  const minClearance = MARKER_GAP

  let best: { side: MarkerSide; box: MarkerBox; score: number } | null = null
  for (const side of sidesForPreference(preferred)) {
    const box = boxForSide(side, x, y, radius, width, height)
    let minClear = Infinity
    for (const c of circles) {
      minClear = Math.min(minClear, clearanceToCircle(box, c.x, c.y, radius))
    }
    if (minClear < minClearance) continue
    if (!isInsideField(box, field)) continue
    // Prefer the requested side; among equals, more clearance wins.
    const score = (side === preferred ? 1000 : 0) + minClear
    if (!best || score > best.score) best = { side, box, score }
  }

  // Last resort: preferred side — nudge until every circle is clear.
  if (!best) {
    const box = boxForSide(preferred, x, y, radius, width, height)
    for (let step = 0; step < 12; step++) {
      let worstClear = Infinity
      for (const c of circles) {
        worstClear = Math.min(worstClear, clearanceToCircle(box, c.x, c.y, radius))
      }
      if (worstClear >= minClearance) break
      const push = minClearance - worstClear + 2
      if (preferred === 'above') box.top -= push
      else if (preferred === 'below') box.top += push
      else if (preferred === 'left') box.left -= push
      else box.left += push
    }
    best = { side: preferred, box, score: 0 }
  }

  return buildText(
    {
      left: best.box.left + best.box.width / 2,
      top: best.box.top,
      text,
      width: best.box.width,
      fontFamily: font,
      fontSize: MARKER_FONT_SIZE,
      lineHeight: 1,
      fill: STUDIO_INK_MUTED,
      textAlign: 'center',
      originX: 'center',
      originY: 'top',
    },
    tag,
    'decoration',
  )
}

export function fieldWithMarkerClearance(field: Box): Box {
  return {
    left: field.left + MARKER_CLEARANCE,
    top: field.top + MARKER_CLEARANCE,
    width: Math.max(0, field.width - MARKER_CLEARANCE * 2),
    height: Math.max(0, field.height - MARKER_CLEARANCE * 2),
  }
}
