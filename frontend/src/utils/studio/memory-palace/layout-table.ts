import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  rows,
  columns,
  splitLeft,
  boxCenterY,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildLine, buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'

const ROW_GAP = 14
const COL_GAP = 40
const NUM_COL_W = 60
const LABEL_SIZE = 14

function drawWriteField(
  objects: StudioFabricObject[],
  col: Box,
  label: string,
  font: string,
  tag: StudioTag,
): void {
  const labelTop = col.top + 2
  objects.push(
    buildText(
      {
        left: col.left + 4,
        top: labelTop,
        text: label,
        width: estimateTextBoxWidth(label, LABEL_SIZE, Math.max(20, col.width - 8)),
        fontFamily: font,
        fontSize: LABEL_SIZE,
        fill: STUDIO_INK_MUTED,
      },
      tag,
      'decoration',
    ),
  )

  const fieldTop = labelTop + LABEL_SIZE + 4
  const fieldHeight = Math.max(16, col.top + col.height - fieldTop - 4)
  const fieldBox: Box = {
    left: col.left + 4,
    top: fieldTop,
    width: Math.max(20, col.width - 8),
    height: fieldHeight,
  }

  const lineY = fieldBox.top + fieldBox.height * 0.65
  objects.push(
    buildLine(
      {
        x1: fieldBox.left,
        y1: lineY,
        x2: fieldBox.left + fieldBox.width,
        y2: lineY,
        stroke: STUDIO_RULE_MEDIUM,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'decoration',
    ),
  )
}

export function drawLociTable(
  objects: StudioFabricObject[],
  tableBox: Box,
  lociCount: number,
  font: string,
  tag: StudioTag,
): void {
  const gap = Math.min(ROW_GAP, Math.max(6, Math.floor(tableBox.height / lociCount / 6)))
  const tableRows = rows(tableBox, lociCount, gap)
  const numColW = Math.max(36, Math.min(NUM_COL_W, Math.floor(tableBox.width * 0.12)))
  const numSize = Math.min(STUDIO_BODY_SIZE, Math.max(16, Math.floor((tableRows[0]?.height ?? 28) * 0.55)))

  tableRows.forEach((rowBox, i) => {
    const [numCol, writeRow] = splitLeft(rowBox, numColW)
    const numText = String(i + 1)
    const numW = estimateTextBoxWidth(numText, numSize, numCol.width)
    objects.push(
      buildText(
        {
          left: numCol.left + (numCol.width - numW) / 2,
          top: boxCenterY(numCol) - numSize / 2,
          text: numText,
          width: numW,
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: numSize,
          fontWeight: 700,
          textAlign: 'center',
          originX: 'left',
          originY: 'top',
        },
        tag,
        'decoration',
      ),
    )

    const colGap = Math.min(COL_GAP, Math.floor(writeRow.width * 0.06))
    const [locCol, itemCol] = columns(writeRow, 2, colGap)
    drawWriteField(objects, locCol, 'Location', font, tag)
    drawWriteField(objects, itemCol, 'Item', font, tag)
  })
}
