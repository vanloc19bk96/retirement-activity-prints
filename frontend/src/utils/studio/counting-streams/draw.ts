import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildText, buildRect, type StudioTag } from '../studio-fabric-builders'
import { buildPhosphorIconPath } from '../studio-phosphor-icon'
import {
  STUDIO_BODY_SIZE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { STREAM_GUTTER, isCountingIconSymbol } from './field'

function drawCellSymbol(
  sym: string,
  cell: Box,
  fontSize: number,
  cellFont: string,
  tag: StudioTag,
): StudioFabricObject {
  const cx = boxCenterX(cell)
  const cy = boxCenterY(cell)
  if (isCountingIconSymbol(sym)) {
    const size = Math.max(10, Math.min(fontSize, Math.min(cell.width, cell.height) * 0.72))
    return buildPhosphorIconPath(sym, { left: cx, top: cy, size }, tag, 'prompt')
  }
  return buildText(
    {
      left: cx,
      top: cy,
      text: sym,
      width: estimateTextBoxWidth(sym, fontSize, cell.width),
      fontFamily: cellFont,
      fontSize,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    },
    tag,
    'prompt',
  )
}

/**
 * Targets legend — label bold; each target as Phosphor icon or glyph text.
 */
export function drawTargetsBanner(options: {
  objects: StudioFabricObject[]
  banner: Box
  targets: string[]
  font: string
  symbolFont: string
  tag: StudioTag
}): void {
  const { objects, banner, targets, font, symbolFont, tag } = options
  const bannerY = boxCenterY(banner)
  const bannerSize = Math.round(STUDIO_BODY_SIZE * 0.85)
  const label = 'Targets:'
  const labelW = estimateTextBoxWidth(label, bannerSize, banner.width)
  const symbolSlot = Math.ceil(bannerSize * 1.15)
  const labelGap = Math.ceil(bannerSize * 0.65)
  const symbolGap = Math.ceil(bannerSize * 0.55)
  const symbolsW =
    targets.length * symbolSlot + Math.max(0, targets.length - 1) * symbolGap
  const totalW = labelW + (targets.length > 0 ? labelGap + symbolsW : 0)
  let cursor = boxCenterX(banner) - totalW / 2

  objects.push(
    buildText(
      {
        left: cursor,
        top: bannerY,
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: bannerSize,
        fontWeight: 700,
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
  cursor += labelW + labelGap

  for (const sym of targets) {
    const cx = cursor + symbolSlot / 2
    if (isCountingIconSymbol(sym)) {
      objects.push(
        buildPhosphorIconPath(
          sym,
          { left: cx, top: bannerY, size: bannerSize },
          tag,
          'prompt',
        ),
      )
    } else {
      objects.push(
        buildText(
          {
            left: cx,
            top: bannerY,
            text: sym,
            width: symbolSlot,
            fontFamily: symbolFont,
            fontSize: bannerSize,
            fontWeight: 'normal',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
          },
          tag,
          'prompt',
        ),
      )
    }
    cursor += symbolSlot + symbolGap
  }
}

/**
 * Horizontal stream bands with gutters + hairlines — reads as flowing rows,
 * not a packed Symbol Hunt lattice.
 */
export function drawStreams(options: {
  box: Box
  cells: string[]
  cols: number
  rowCount: number
  cellFont: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { box, cells, cols, rowCount, cellFont, tag } = options
  const gutterTotal = STREAM_GUTTER * Math.max(0, rowCount - 1)
  const rowH = Math.floor((box.height - gutterTotal) / rowCount)
  const cellW = Math.floor(box.width / cols)
  const blockH = rowCount * rowH + gutterTotal
  const blockW = cellW * cols
  const originX = Math.round(box.left + (box.width - blockW) / 2)
  const originY = Math.round(box.top + (box.height - blockH) / 2)
  const fontSize = Math.max(12, Math.min(Math.min(cellW, rowH) * 0.7, STUDIO_BODY_SIZE))

  const out: StudioFabricObject[] = []
  for (let r = 0; r < rowCount; r++) {
    const streamTop = originY + r * (rowH + STREAM_GUTTER)
    const streamBand: Box = {
      left: originX,
      top: streamTop,
      width: blockW,
      height: rowH,
    }

    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const sym = cells[i]
      if (sym == null) continue
      const cell: Box = {
        left: originX + c * cellW,
        top: streamTop,
        width: cellW,
        height: rowH,
      }
      out.push(drawCellSymbol(sym, cell, fontSize, cellFont, tag))
    }

    const ruleTop = Math.round(streamBand.top + streamBand.height - STUDIO_STROKE_HAIRLINE)
    out.push(
      buildRect(
        {
          left: streamBand.left,
          top: ruleTop,
          width: streamBand.width,
          height: STUDIO_STROKE_HAIRLINE,
          fill: STUDIO_RULE_MEDIUM,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        tag,
        'structure',
      ),
    )
  }

  return out
}
