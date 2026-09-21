import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  estimateSpacedRunWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
  boxCenterX,
  boxCenterY,
  boxRight,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildLine,
  buildRect,
  buildCircle,
  type StudioTag,
} from '../studio-fabric-builders'
import { MC_CIRCLE_R } from './geometry'

/** Draw-target circles on the facing edges of a matching row (no pre-drawn link). */
export function drawMatchTerminals(
  parts: StudioFabricObject[],
  leftCell: Box,
  rightCell: Box,
  tag: StudioTag,
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const midY = Math.round(boxCenterY(leftCell))
  const leftX = Math.round(boxRight(leftCell) + MC_CIRCLE_R + 4)
  const rightX = Math.round(rightCell.left - MC_CIRCLE_R - 4)
  parts.push(
    buildCircle(
      {
        left: leftX,
        top: midY,
        radius: MC_CIRCLE_R,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
    buildCircle(
      {
        left: rightX,
        top: midY,
        radius: MC_CIRCLE_R,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
  )
  return {
    left: { x: leftX, y: midY },
    right: { x: rightX, y: midY },
  }
}

/** Circle — line — circle between two cells on the same row. */
export function drawPairConnector(
  parts: StudioFabricObject[],
  leftCell: Box,
  rightCell: Box,
  tag: StudioTag,
): void {
  const midY = Math.round(boxCenterY(leftCell))
  const leftX = Math.round(boxRight(leftCell) + MC_CIRCLE_R + 6)
  const rightX = Math.round(rightCell.left - MC_CIRCLE_R - 6)
  parts.push(
    buildCircle(
      {
        left: leftX,
        top: midY,
        radius: MC_CIRCLE_R,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
    buildCircle(
      {
        left: rightX,
        top: midY,
        radius: MC_CIRCLE_R,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
    buildLine(
      {
        x1: leftX + MC_CIRCLE_R,
        y1: midY,
        x2: rightX - MC_CIRCLE_R,
        y2: midY,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
  )
}

/** Rounded rect + centered label (optional hidden answer outline). */
export function drawWordRect(options: {
  parts: StudioFabricObject[]
  cell: Box
  label: string
  font: string
  fontSize: number
  tag: StudioTag
  role?: 'prompt' | 'structure'
}): void {
  const { parts, cell, font, tag } = options
  const role = options.role ?? 'prompt'
  const label = toNonBreakingSpaces(options.label)
  const maxLabelW = Math.max(8, cell.width - 20)
  const size = fitFontSizeToWidth(label, maxLabelW, options.fontSize, 12)
  const labelW = estimateSpacedRunWidth(label, size, maxLabelW)

  parts.push(
    buildRect(
      {
        left: cell.left,
        top: cell.top,
        width: cell.width,
        height: cell.height,
        rx: 8,
        ry: 8,
        fill: 'transparent',
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
    buildText(
      {
        left: boxCenterX(cell),
        top: boxCenterY(cell),
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: size,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      role,
    ),
  )
}

export function placeObjects(
  parts: StudioFabricObject[],
  originLeft: number,
  originTop: number,
): StudioFabricObject[] {
  return parts.map((obj) => {
    const next: StudioFabricObject = { ...obj }
    if (typeof next.left === 'number') next.left += originLeft
    if (typeof next.top === 'number') next.top += originTop
    if (obj.type === 'line' && obj.originX !== 'center') {
      if (typeof next.x1 === 'number') next.x1 += originLeft
      if (typeof next.x2 === 'number') next.x2 += originLeft
      if (typeof next.y1 === 'number') next.y1 += originTop
      if (typeof next.y2 === 'number') next.y2 += originTop
    }
    return next
  })
}
