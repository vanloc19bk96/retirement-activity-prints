import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildRect,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import {
  STUDIO_INK,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { isGivenSide } from './reflect'
import { drawLineFigure, lineInkThickness } from './draw-lines'
import type { Axis, Bitmap, DrawStyle, Segment } from './types'

const COORD_GUTTER = 18
/** Dash / gap lengths for the symmetry axis (filled bars, not stroked Line). */
const AXIS_DASH = 8
const AXIS_GAP = 6

/** Same placement as studio-grid-rules — outer flush, internal centered. */
function barOrigin(
  index: number,
  count: number,
  start: number,
  span: number,
  step: number,
  thickness: number,
): number {
  if (index === 0) return start
  if (index === count) return start + span - thickness
  return start + index * step - Math.floor(thickness / 2)
}

function inkBar(
  left: number,
  top: number,
  width: number,
  height: number,
  tag: StudioTag,
): StudioFabricObject {
  return buildRect(
    {
      left,
      top,
      width,
      height,
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/**
 * Symmetry axis as filled dash bars, centered on the mid grid hairline and
 * inset inside the outer rules (avoids Fabric Line stroke bias / overflow).
 */
function drawAxisDashBars(
  bounds: Box,
  cell: number,
  size: number,
  axis: Axis,
  tag: StudioTag,
): StudioFabricObject[] {
  const half = size / 2
  const thickness = STUDIO_STROKE_BOLD
  const inset = STUDIO_STROKE_HAIRLINE
  const bars: StudioFabricObject[] = []

  if (axis === 'vertical' || axis === 'both') {
    const hairLeft = barOrigin(
      half,
      size,
      bounds.left,
      bounds.width,
      cell,
      STUDIO_STROKE_HAIRLINE,
    )
    const centerX = hairLeft + STUDIO_STROKE_HAIRLINE / 2
    const left = Math.round(centerX - thickness / 2)
    const yStart = bounds.top + inset
    const yEnd = bounds.top + bounds.height - inset
    for (let y = yStart; y < yEnd; y += AXIS_DASH + AXIS_GAP) {
      const h = Math.min(AXIS_DASH, yEnd - y)
      if (h < 2) break
      bars.push(inkBar(left, Math.round(y), thickness, Math.round(h), tag))
    }
  }

  if (axis === 'horizontal' || axis === 'both') {
    const hairTop = barOrigin(
      half,
      size,
      bounds.top,
      bounds.height,
      cell,
      STUDIO_STROKE_HAIRLINE,
    )
    const centerY = hairTop + STUDIO_STROKE_HAIRLINE / 2
    const top = Math.round(centerY - thickness / 2)
    const xStart = bounds.left + inset
    const xEnd = bounds.left + bounds.width - inset
    for (let x = xStart; x < xEnd; x += AXIS_DASH + AXIS_GAP) {
      const w = Math.min(AXIS_DASH, xEnd - x)
      if (w < 2) break
      bars.push(inkBar(Math.round(x), top, Math.round(w), thickness, tag))
    }
  }

  return bars
}

function drawFilledCells(
  g: ReturnType<typeof snapGridInField>,
  full: Bitmap,
  size: number,
  axis: Axis,
  tag: StudioTag,
): StudioFabricObject[] {
  const parts: StudioFabricObject[] = []
  const pad = Math.max(1, Math.floor(g.cell * 0.08))
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!full[r]![c]) continue
      const cell = g.cellBox(r, c)
      const role = isGivenSide(r, c, size, axis) ? 'prompt' : 'answer'
      parts.push(
        buildRect(
          {
            left: cell.left + pad,
            top: cell.top + pad,
            width: cell.width - pad * 2,
            height: cell.height - pad * 2,
            fill: STUDIO_INK,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          role,
        ),
      )
    }
  }
  return parts
}

function drawCoordinates(
  g: ReturnType<typeof snapGridInField>,
  size: number,
  _font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const parts: StudioFabricObject[] = []
  // Two-digit coordinates must still fit the gutter — size to the widest label.
  const fontSize = fitFontSizeToWidth(
    String(size),
    COORD_GUTTER,
    Math.max(9, Math.min(14, Math.round(g.cell * 0.45))),
    7,
  )
  for (let i = 0; i < size; i++) {
    const label = String(i + 1)
    const width = estimateTextBoxWidth(label, fontSize, COORD_GUTTER)
    const colCell = g.cellBox(0, i)
    parts.push(
      buildText(
        {
          left: boxCenterX(colCell),
          top: g.bounds.top - COORD_GUTTER / 2,
          text: label,
          width,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'decoration',
      ),
    )
    const rowCell = g.cellBox(i, 0)
    parts.push(
      buildText(
        {
          left: g.bounds.left - COORD_GUTTER / 2,
          top: boxCenterY(rowCell),
          text: label,
          width,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'decoration',
      ),
    )
  }
  return parts
}

function fieldInset(showCoordinates: boolean, linePad = 0): number {
  return 6 + (showCoordinates ? COORD_GUTTER : 0) + linePad
}

function snapMirrorGrid(
  area: Box,
  size: number,
  showCoordinates: boolean,
  style: DrawStyle,
  maxCell?: number,
): ReturnType<typeof snapGridInField> {
  const base = fieldInset(showCoordinates)
  const fitted = snapWithMaxCell(insetBox(area, base), size, maxCell)
  if (style !== 'line') return fitted
  const pad = Math.ceil(lineInkThickness(fitted.cell) / 2) + 1
  return snapWithMaxCell(insetBox(area, base + pad), size, maxCell)
}

/** Largest cell that fits a size×size grid in `area` (same inset as draw). */
export function cellForMirrorArea(
  area: Box,
  size: number,
  showCoordinates: boolean,
  style: DrawStyle = 'pixel',
): number {
  return snapMirrorGrid(area, size, showCoordinates, style).cell
}

function snapWithMaxCell(
  field: Box,
  size: number,
  maxCell?: number,
): ReturnType<typeof snapGridInField> {
  const fitted = snapGridInField(field, size, size)
  if (maxCell === undefined || fitted.cell <= maxCell) return fitted
  const cell = Math.max(1, Math.floor(maxCell))
  const width = cell * size
  const height = cell * size
  const left = Math.round(field.left + (field.width - width) / 2)
  const top = Math.round(field.top + (field.height - height) / 2)
  const bounds: Box = { left, top, width, height }
  return {
    cell,
    bounds,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * cell,
      top: top + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

export function drawMirrorPuzzle(options: {
  area: Box
  full: Bitmap
  segments: Segment[]
  style: DrawStyle
  size: number
  axis: Axis
  showCoordinates: boolean
  font: string
  tag: StudioTag
  /** Cap cell size so the answer key matches the puzzle footprint. */
  maxCell?: number
}): StudioFabricObject {
  const {
    area,
    full,
    segments,
    style,
    size,
    axis,
    showCoordinates,
    font,
    tag,
    maxCell,
  } = options
  const g = snapMirrorGrid(area, size, showCoordinates, style, maxCell)

  // Grid color/weight matches Grid Copy (STUDIO_RULE_MEDIUM hairlines).
  const parts: StudioFabricObject[] = [
    ...drawGridLines(g.bounds, g.cell, size, size, tag),
    ...drawAxisDashBars(g.bounds, g.cell, size, axis, tag),
  ]

  if (style === 'line') {
    parts.push(...drawLineFigure(g, segments, size, axis, tag))
  } else {
    parts.push(...drawFilledCells(g, full, size, axis, tag))
  }

  if (showCoordinates) {
    parts.push(...drawCoordinates(g, size, font, tag))
  }

  // Frame the full grid (both mirror halves). Line ink joints extend half a
  // stroke past the outer rules — pad so Fabric group cache does not clip them.
  const inkPad =
    style === 'line' ? Math.ceil(lineInkThickness(g.cell) / 2) + 1 : 0
  const gridFrame: Box = {
    left: g.bounds.left - inkPad,
    top: g.bounds.top - inkPad,
    width: g.bounds.width + inkPad * 2,
    height: g.bounds.height + inkPad * 2,
  }
  const contentBounds = unionObjectBounds(parts)
  const groupBounds = contentBounds
    ? {
        left: Math.min(gridFrame.left, contentBounds.left),
        top: Math.min(gridFrame.top, contentBounds.top),
        width:
          Math.max(
            gridFrame.left + gridFrame.width,
            contentBounds.left + contentBounds.width,
          ) - Math.min(gridFrame.left, contentBounds.left),
        height:
          Math.max(
            gridFrame.top + gridFrame.height,
            contentBounds.top + contentBounds.height,
          ) - Math.min(gridFrame.top, contentBounds.top),
      }
    : gridFrame
  return buildGroup(parts, groupBounds, tag)
}
