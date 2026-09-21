import type { StudioFabricObject } from '@/types/studio-template.types'
import type { PairSet } from '@/types/studio-pairs.types'
import {
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  unionObjectBounds,
  boxCenterX,
  boxCenterY,
  estimateSpacedRunWidth,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildLine,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { cueOf, partnerOf, type ResolvedDirection } from './direction'
import {
  drawPairConnector,
  drawWordRect,
  placeObjects,
} from './draw-pair-link'
import {
  MC_CONNECTOR_W,
  MIN_BLANK_W,
  type PairGeometry,
} from './geometry'

function drawBlankCell(options: {
  parts: StudioFabricObject[]
  cell: Box
  answer: string
  font: string
  fontSize: number
  tag: StudioTag
}): void {
  const { parts, cell, answer, font, fontSize, tag } = options
  const padX = 16
  const blankLen = Math.max(MIN_BLANK_W, cell.width - padX * 2)
  const blankX = cell.left + (cell.width - blankLen) / 2
  const baseline = boxCenterY(cell) + fontSize * 0.35

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
    // Same ink weight/color as Grid Copy cell rules (studio-grid-rules).
    buildLine(
      {
        x1: blankX,
        y1: baseline,
        x2: blankX + blankLen,
        y2: baseline,
        stroke: STUDIO_RULE_MEDIUM,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
    buildText(
      {
        left: boxCenterX(cell),
        top: boxCenterY(cell),
        text: answer,
        width: estimateSpacedRunWidth(answer, fontSize, blankLen),
        fontFamily: font,
        fontSize,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'answer',
    ),
  )
}

/** Write-in recall: cue card + connector + blank card, grouped and centered. */
export function drawWriteIn(
  objects: StudioFabricObject[],
  set: PairSet,
  directions: ResolvedDirection[],
  geom: PairGeometry,
  font: string,
  tag: StudioTag,
): void {
  const pairs = set.pairs.slice(0, geom.count)
  const gridW = Math.min(geom.field.width, Math.floor(geom.field.width * 0.92))
  const cellW = Math.floor((gridW - MC_CONNECTOR_W) / 2)
  const cellH = geom.blockH
  const rowGap = geom.gap
  const parts: StudioFabricObject[] = []

  pairs.forEach((pair, i) => {
    const top = i * (cellH + rowGap)
    const leftCell: Box = { left: 0, top, width: cellW, height: cellH }
    const rightCell: Box = {
      left: cellW + MC_CONNECTOR_W,
      top,
      width: cellW,
      height: cellH,
    }
    const dir = directions[i] ?? 'forward'
    const cue = cueOf(pair, dir).toUpperCase()
    const partner = partnerOf(pair, dir).toUpperCase()

    drawWordRect({
      parts,
      cell: leftCell,
      label: cue,
      font,
      fontSize: geom.fontSize,
      tag,
    })
    drawBlankCell({
      parts,
      cell: rightCell,
      answer: partner,
      font,
      fontSize: geom.fontSize,
      tag,
    })
    drawPairConnector(parts, leftCell, rightCell, tag)
  })

  const rawBounds = unionObjectBounds(parts) ?? {
    left: 0,
    top: 0,
    width: gridW,
    height: pairs.length * cellH + Math.max(0, pairs.length - 1) * rowGap,
  }
  const originLeft =
    geom.field.left + Math.max(0, (geom.field.width - rawBounds.width) / 2) - rawBounds.left
  const originTop =
    geom.field.top + Math.max(0, (geom.field.height - rawBounds.height) / 2) - rawBounds.top
  const placed = placeObjects(parts, originLeft, originTop)
  const bounds = unionObjectBounds(placed) ?? {
    left: geom.field.left,
    top: geom.field.top,
    width: rawBounds.width,
    height: rawBounds.height,
  }
  objects.push(buildGroup(placed, bounds, tag, 'decoration'))
}
