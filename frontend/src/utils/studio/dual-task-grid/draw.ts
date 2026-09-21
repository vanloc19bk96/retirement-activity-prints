import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  columns,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  rows,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildRect,
  buildCircle,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { buildPhosphorIconPath, hasPhosphorIcon } from '../studio-phosphor-icon'
import { STUDIO_INK, STUDIO_INK_MUTED, STUDIO_BODY_SIZE, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import {
  type DualTaskSheet,
  type DualItem,
  type Difficulty,
  answerVerb,
  itemsPerRowFor,
} from './streams'

const ANSWER_BOX_W = 56
const ANSWER_BOX_H = 32
const LABEL_BOX_GAP = 10

/** Match Counting Streams — arrows render as Phosphor duotone icons, not glyphs. */
const ARROW_ICONS: Record<string, string> = {
  '↑': 'arrow-up',
  '↓': 'arrow-down',
}

/**
 * "Count a symbol" tokens also render as Phosphor duotone icons, not glyphs —
 * catalog fonts lack dingbat characters so PDF/SVG outline export would show
 * a missing-glyph fallback. Triangle orientations reuse one icon, rotated.
 */
const SHAPE_ICONS: Record<string, { icon: string; angle?: number }> = {
  'triangle-up': { icon: 'triangle' },
  'triangle-right': { icon: 'triangle', angle: 90 },
  'triangle-down': { icon: 'triangle', angle: 180 },
  'triangle-left': { icon: 'triangle', angle: 270 },
  circle: { icon: 'circle' },
  square: { icon: 'square' },
  diamond: { icon: 'diamond' },
}

for (const iconName of Object.values(ARROW_ICONS)) {
  if (!hasPhosphorIcon(iconName)) {
    throw new Error(`dual-task-grid: missing Phosphor duotone icon "${iconName}"`)
  }
}
for (const { icon } of Object.values(SHAPE_ICONS)) {
  if (!hasPhosphorIcon(icon)) {
    throw new Error(`dual-task-grid: missing Phosphor duotone icon "${icon}"`)
  }
}
const FRAME_MAX = 32

export function drawMutedLine(
  objects: StudioFabricObject[],
  box: Box,
  text: string,
  font: string,
  tag: StudioTag,
): void {
  // Legend is a single strip — shrink to fit rather than wrap onto the grid.
  const size = fitFontSizeToWidth(text, box.width, Math.round(STUDIO_BODY_SIZE * 0.75), 11)
  objects.push(
    buildText(
      {
        left: boxCenterX(box),
        top: boxCenterY(box),
        text,
        width: estimateTextBoxWidth(text, size, box.width),
        fontFamily: font,
        fontSize: size,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )
}

export function drawItemGrid(
  objects: StudioFabricObject[],
  fieldArea: Box,
  sheet: DualTaskSheet,
  difficulty: Difficulty,
  font: string,
  tag: StudioTag,
): void {
  const itemsPerRow = itemsPerRowFor(difficulty)
  const rowCount = Math.ceil(sheet.items.length / itemsPerRow)
  const rowBoxes = rows(fieldArea, rowCount, 8)
  const parts: StudioFabricObject[] = []

  sheet.items.forEach((item, i) => {
    const rowIdx = Math.floor(i / itemsPerRow)
    const colIdx = i % itemsPerRow
    const rowBox = rowBoxes[rowIdx]
    if (!rowBox) return
    const cellW = rowBox.width / itemsPerRow
    const cx = rowBox.left + cellW * (colIdx + 0.5)
    const cy = boxCenterY(rowBox)
    const frame = Math.min(FRAME_MAX, Math.floor(Math.min(cellW, rowBox.height) * 0.7))
    pushToken(parts, item, cx, cy, frame, font, tag)
  })

  const bounds = unionObjectBounds(parts) ?? fieldArea
  objects.push(buildGroup(parts, bounds, tag, 'structure'))
}

function pushToken(
  parts: StudioFabricObject[],
  item: DualItem,
  cx: number,
  cy: number,
  frame: number,
  font: string,
  tag: StudioTag,
): void {
  const half = frame / 2
  const radius = half + 1
  const isSquare = item.stream === 'A'

  if (isSquare) {
    parts.push(
      buildRect(
        {
          left: cx - half,
          top: cy - half,
          width: frame,
          height: frame,
          stroke: STUDIO_INK,
        },
        tag,
        'structure',
      ),
    )
  } else {
    parts.push(
      buildCircle(
        { left: cx, top: cy, radius, stroke: STUDIO_INK },
        tag,
        'structure',
      ),
    )
  }

  const arrowIcon = ARROW_ICONS[item.token]
  const shapeIcon = SHAPE_ICONS[item.token]
  if (arrowIcon || shapeIcon) {
    const iconSize = Math.max(10, Math.min(STUDIO_BODY_SIZE * 1.4, frame * 0.62))
    parts.push(
      buildPhosphorIconPath(
        arrowIcon ?? shapeIcon!.icon,
        { left: cx, top: cy, size: iconSize, angle: shapeIcon?.angle },
        tag,
        'prompt',
      ),
    )
    return
  }

  const fontSize = Math.max(10, Math.min(STUDIO_BODY_SIZE, frame * 0.55))
  const isNumeric = /^\d+$/.test(item.token)
  parts.push(
    buildText(
      {
        left: cx,
        top: cy,
        text: item.token,
        width: estimateTextBoxWidth(item.token, fontSize, frame),
        fontFamily: isNumeric ? STUDIO_DIGIT_FONT : font,
        fontSize,
        fill: STUDIO_INK,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
}

export function drawAnswerStrip(
  objects: StudioFabricObject[],
  answerArea: Box,
  sheet: DualTaskSheet,
  font: string,
  tag: StudioTag,
): void {
  const answerBoxes = columns(answerArea, 2, 40)
  const labelA = `Task A ${answerVerb(sheet.taskALabel)}:`
  const labelB = `Task B ${answerVerb(sheet.taskBLabel)}:`
  // One shared size fitted to the longer label keeps both halves aligned.
  const labelMaxW = Math.max(24, answerBoxes[0]!.width - ANSWER_BOX_W - LABEL_BOX_GAP)
  const labelSize = Math.min(
    fitFontSizeToWidth(labelA, labelMaxW, STUDIO_BODY_SIZE, 12),
    fitFontSizeToWidth(labelB, labelMaxW, STUDIO_BODY_SIZE, 12),
  )
  drawAnswer(objects, answerBoxes[0]!, {
    label: labelA,
    labelSize,
    answer: sheet.answerA,
    font,
    tag,
  })
  drawAnswer(objects, answerBoxes[1]!, {
    label: labelB,
    labelSize,
    answer: sheet.answerB,
    font,
    tag,
  })
}

interface DualAnswerSpec {
  label: string
  labelSize: number
  answer: string
  font: string
  tag: StudioTag
}

function drawAnswer(
  objects: StudioFabricObject[],
  box: Box,
  spec: DualAnswerSpec,
): void {
  const { label, labelSize, answer, font, tag } = spec
  const labelW = estimateTextBoxWidth(
    label,
    labelSize,
    box.width - ANSWER_BOX_W - LABEL_BOX_GAP,
  )
  const groupW = labelW + LABEL_BOX_GAP + ANSWER_BOX_W
  const groupLeft = boxCenterX(box) - groupW / 2
  const midY = boxCenterY(box)
  const rectLeft = groupLeft + labelW + LABEL_BOX_GAP

  objects.push(
    buildText(
      {
        left: groupLeft,
        top: midY,
        text: label,
        width: labelW,
        fontFamily: font,
        fontSize: labelSize,
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )

  const boxBounds = {
    left: rectLeft,
    top: midY - ANSWER_BOX_H / 2,
    width: ANSWER_BOX_W,
    height: ANSWER_BOX_H,
  }
  const isNumericAnswer = /^\d+$/.test(answer)
  const answerSize = fitFontSizeToWidth(answer, ANSWER_BOX_W - 6, STUDIO_BODY_SIZE, 10)
  const answerW = estimateTextBoxWidth(answer, answerSize, ANSWER_BOX_W)
  objects.push(
    buildGroup(
      [
        buildRect(
          {
            left: boxBounds.left,
            top: boxBounds.top,
            width: boxBounds.width,
            height: boxBounds.height,
            stroke: STUDIO_INK,
          },
          tag,
          'structure',
        ),
        buildText(
          {
            left: rectLeft + ANSWER_BOX_W / 2,
            top: midY,
            text: answer,
            width: answerW,
            fontFamily: isNumericAnswer ? STUDIO_DIGIT_FONT : font,
            fontSize: answerSize,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
          },
          tag,
          'answer',
        ),
      ],
      boxBounds,
      tag,
    ),
  )
}
