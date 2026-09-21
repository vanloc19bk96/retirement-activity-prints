import type { StudioFabricObject } from '@/types/studio-template.types'
import type { SequenceSet } from '@/types/studio-sequence.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
} from '../studio-layout'
import { fitSharedLabelSize } from '../list-recall/table'
import { buildText, buildRect, type StudioTag } from '../studio-fabric-builders'
import { CELL_PAD, MIN_LABEL_SIZE, type ItemRhythm } from './rhythm'

/** Shared number-box + label cell. Study may show a digit; recall leaves the box blank. */
function drawNumberedCell(
  objects: StudioFabricObject[],
  options: {
    cellLeft: number
    cellTop: number
    cellHeight: number
    boxSize: number
    fontSize: number
    labelMaxW: number
    label: string
    digit?: string
    font: string
    tag: StudioTag
  },
): void {
  const {
    cellLeft,
    cellTop,
    cellHeight,
    boxSize,
    fontSize,
    labelMaxW,
    label,
    digit,
    font,
    tag,
  } = options
  const boxLeft = cellLeft + CELL_PAD
  const boxTop = cellTop + (cellHeight - boxSize) / 2
  const midY = cellTop + cellHeight / 2

  objects.push(
    buildRect(
      {
        left: boxLeft,
        top: boxTop,
        width: boxSize,
        height: boxSize,
        fill: 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
  )

  const text = toNonBreakingSpaces(label)
  objects.push(
    buildText(
      {
        left: boxLeft + boxSize + 16,
        top: midY,
        text,
        width: estimateTextBoxWidth(text, fontSize, labelMaxW),
        fontFamily: font,
        fontSize,
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )

  if (!digit) return
  const digitSize = fitFontSizeToWidth(digit, boxSize * 0.75, fontSize, MIN_LABEL_SIZE)
  objects.push(
    buildText(
      {
        left: boxLeft + boxSize / 2,
        top: midY,
        text: digit,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: digitSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        width: estimateTextBoxWidth(digit, digitSize, boxSize),
      },
      tag,
      'decoration',
    ),
  )
}

/** Study grid: show 1..n in boxes so row-major order is unambiguous. */
export function drawNumberedStudyItems(
  objects: StudioFabricObject[],
  seq: SequenceSet,
  rhythm: ItemRhythm,
  font: string,
  tag: StudioTag,
): void {
  const { table, boxSize, fontSize, labelMaxW, count } = rhythm
  for (let slot = 0; slot < count; slot++) {
    const item = seq.items[slot]
    if (!item) continue
    const row = Math.floor(slot / table.cols)
    const col = slot % table.cols
    const cell = table.cellBox(row, col)
    drawNumberedCell(objects, {
      cellLeft: cell.left,
      cellTop: cell.top,
      cellHeight: cell.height,
      boxSize,
      fontSize,
      labelMaxW,
      label: item.text,
      digit: String(slot + 1),
      font,
      tag,
    })
  }
}

export function drawNumberBoxesRecall(
  objects: StudioFabricObject[],
  seq: SequenceSet,
  perm: number[],
  rhythm: ItemRhythm,
  font: string,
  tag: StudioTag,
): void {
  const { table, boxSize, fontSize, labelMaxW, count } = rhythm

  perm.forEach((originalIndex, slot) => {
    if (slot >= count) return
    const row = Math.floor(slot / table.cols)
    const col = slot % table.cols
    const cell = table.cellBox(row, col)
    drawNumberedCell(objects, {
      cellLeft: cell.left,
      cellTop: cell.top,
      cellHeight: cell.height,
      boxSize,
      fontSize,
      labelMaxW,
      label: seq.items[originalIndex]?.text ?? '',
      font,
      tag,
    })
  })
}

/** Scrambled prompts only — blanks are drawn separately under the grid. */
export function drawWriteListPrompts(
  objects: StudioFabricObject[],
  seq: SequenceSet,
  perm: number[],
  rhythm: ItemRhythm,
  font: string,
  tag: StudioTag,
): void {
  const { table, fontSize, count } = rhythm
  const labelMaxW = Math.max(40, table.cellW - CELL_PAD * 2)
  const labels = perm
    .slice(0, count)
    .map((originalIndex) => seq.items[originalIndex]?.text ?? '')
  const size = fitSharedLabelSize(labels, labelMaxW, fontSize, table.cellH, MIN_LABEL_SIZE)

  perm.forEach((originalIndex, slot) => {
    if (slot >= count) return
    const row = Math.floor(slot / table.cols)
    const col = slot % table.cols
    const cell = table.cellBox(row, col)
    const text = toNonBreakingSpaces(seq.items[originalIndex]?.text ?? '')
    objects.push(
      buildText(
        {
          left: cell.left + CELL_PAD,
          top: boxCenterY(cell),
          text,
          width: estimateTextBoxWidth(text, size, labelMaxW),
          fontFamily: font,
          fontSize: size,
          originY: 'center',
        },
        tag,
        'prompt',
      ),
    )
  })
}

export function drawWriteListBlanks(
  objects: StudioFabricObject[],
  rhythm: ItemRhythm,
  tag: StudioTag,
): void {
  const { fontSize, count, blankTops, blankLefts, blankWidth } = rhythm
  const numberGutter = Math.min(36, Math.max(24, Math.round(blankWidth * 0.12)))
  const lineWidth = Math.max(40, blankWidth - numberGutter - CELL_PAD)

  for (let i = 0; i < count; i++) {
    const y = blankTops[i] ?? 0
    const blankLeft = blankLefts[i] ?? 0
    const prefix = `${i + 1}.`
    objects.push(
      buildText(
        {
          left: blankLeft,
          top: y,
          text: prefix,
          width: estimateTextBoxWidth(prefix, fontSize, numberGutter),
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize,
        },
        tag,
        'decoration',
      ),
    )
    objects.push(
      buildRect(
        {
          left: blankLeft + numberGutter,
          top: y + fontSize + 4,
          width: lineWidth,
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
}
