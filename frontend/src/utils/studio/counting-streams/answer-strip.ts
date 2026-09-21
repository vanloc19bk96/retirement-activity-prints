import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  columns,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  estimateSpacedRunWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import { buildText, buildRect, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { buildPhosphorIconPath } from '../studio-phosphor-icon'
import {
  STUDIO_INK,
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { isCountingIconSymbol } from './field'

const ANSWER_BOX_W = 44
const ANSWER_BOX_H = 32
const LABEL_BOX_GAP = 10
const MIN_LABEL_SIZE = 12
const HOW_MANY_PREFIX = 'How many'
const HOW_MANY_SUFFIX = '?'

/** Fit “How many X ?” on one line — NBSP so Fabric won’t wrap at the last space. */
function fitHowManyLabel(
  target: string,
  maxWidth: number,
): { text: string; fontSize: number; width: number } {
  const text = toNonBreakingSpaces(`How many ${target} ?`)
  let fontSize = STUDIO_BODY_SIZE
  while (fontSize > MIN_LABEL_SIZE) {
    const width = estimateSpacedRunWidth(text, fontSize, maxWidth, {
      glyphEm: 1,
      spaceEm: 0.35,
      padPx: 4,
    })
    if (width <= maxWidth) return { text, fontSize, width }
    fontSize -= 1
  }
  const width = estimateSpacedRunWidth(text, MIN_LABEL_SIZE, maxWidth, {
    glyphEm: 1,
    spaceEm: 0.35,
    padPx: 4,
  })
  return { text, fontSize: MIN_LABEL_SIZE, width }
}

function pushCountBox(
  objects: StudioFabricObject[],
  options: {
    left: number
    midY: number
    countText: string
    countW: number
    countFont: string
    tag: StudioTag
  },
): void {
  const { left, midY, countText, countW, countFont, tag } = options
  const boxBounds = {
    left,
    top: midY - ANSWER_BOX_H / 2,
    width: ANSWER_BOX_W,
    height: ANSWER_BOX_H,
  }
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
            left: left + ANSWER_BOX_W / 2,
            top: midY,
            text: countText,
            width: countW,
            fontFamily: countFont,
            fontSize: STUDIO_BODY_SIZE,
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

function measureIconAnswerRow(
  fontSize: number,
  iconSize: number,
): { prefixW: number; suffixW: number; gap: number; groupW: number } {
  const prefixText = toNonBreakingSpaces(HOW_MANY_PREFIX)
  const prefixW = estimateSpacedRunWidth(prefixText, fontSize, Number.POSITIVE_INFINITY, {
    glyphEm: 0.65,
    spaceEm: 0.4,
    padPx: 6,
  })
  const suffixW = estimateTextBoxWidth(HOW_MANY_SUFFIX, fontSize, 24)
  const gap = Math.max(6, Math.round(fontSize * 0.28))
  const groupW =
    prefixW + gap + iconSize + gap + suffixW + LABEL_BOX_GAP + ANSWER_BOX_W
  return { prefixW, suffixW, gap, groupW }
}

function drawIconAnswerLabel(
  objects: StudioFabricObject[],
  options: {
    col: Box
    target: string
    countText: string
    countW: number
    font: string
    countFont: string
    tag: StudioTag
  },
): void {
  const { col, target, countText, countW, font, countFont, tag } = options
  const midY = boxCenterY(col)
  const prefixText = toNonBreakingSpaces(HOW_MANY_PREFIX)
  const maxW = Math.max(72, col.width - 8)

  let fontSize = STUDIO_BODY_SIZE
  let iconSize = Math.max(12, Math.round(fontSize * 0.72))
  let metrics = measureIconAnswerRow(fontSize, iconSize)

  for (let guard = 0; guard < 16 && metrics.groupW > maxW; guard++) {
    if (fontSize > MIN_LABEL_SIZE) {
      fontSize -= 1
      iconSize = Math.max(10, Math.round(fontSize * 0.72))
    } else if (iconSize > 10) {
      iconSize -= 1
    } else {
      break
    }
    metrics = measureIconAnswerRow(fontSize, iconSize)
  }

  const { prefixW, suffixW, gap, groupW } = metrics
  let cursor = boxCenterX(col) - groupW / 2
  const minLeft = col.left + 2
  const maxLeft = col.left + col.width - groupW - 2
  if (maxLeft >= minLeft) {
    cursor = Math.min(Math.max(cursor, minLeft), maxLeft)
  } else {
    cursor = minLeft
  }

  objects.push(
    buildText(
      {
        left: cursor,
        top: midY,
        text: prefixText,
        width: prefixW,
        fontFamily: font,
        fontSize,
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
  cursor += prefixW + gap
  objects.push(
    buildPhosphorIconPath(
      target,
      { left: cursor + iconSize / 2, top: midY, size: iconSize },
      tag,
      'prompt',
    ),
  )
  cursor += iconSize + gap
  objects.push(
    buildText(
      {
        left: cursor,
        top: midY,
        text: HOW_MANY_SUFFIX,
        width: suffixW,
        fontFamily: font,
        fontSize,
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
  cursor += suffixW + LABEL_BOX_GAP
  pushCountBox(objects, { left: cursor, midY, countText, countW, countFont, tag })
}

function drawIconEqualsLabel(
  objects: StudioFabricObject[],
  options: {
    col: Box
    target: string
    countText: string
    countW: number
    countFont: string
    tag: StudioTag
  },
): void {
  const { col, target, countText, countW, countFont, tag } = options
  const midY = boxCenterY(col)
  const equalsW = estimateTextBoxWidth('=', STUDIO_BODY_SIZE, 24)
  const iconSize = Math.max(12, Math.round(STUDIO_BODY_SIZE * 0.72))
  const gap = Math.max(6, Math.round(STUDIO_BODY_SIZE * 0.28))
  const groupW = iconSize + gap + equalsW + LABEL_BOX_GAP + ANSWER_BOX_W
  let cursor = boxCenterX(col) - groupW / 2

  objects.push(
    buildPhosphorIconPath(
      target,
      { left: cursor + iconSize / 2, top: midY, size: iconSize },
      tag,
      'prompt',
    ),
  )
  cursor += iconSize + gap
  objects.push(
    buildText(
      {
        left: cursor,
        top: midY,
        text: '=',
        width: equalsW,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: STUDIO_BODY_SIZE,
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
  cursor += equalsW + LABEL_BOX_GAP
  pushCountBox(objects, { left: cursor, midY, countText, countW, countFont, tag })
}

export function drawAnswerStrip(
  objects: StudioFabricObject[],
  answerArea: Box,
  targets: string[],
  counts: Record<string, number>,
  font: string,
  countFont: string,
  tag: StudioTag,
): void {
  const boxes = columns(answerArea, targets.length, 30)
  const colWidth = boxes[0]?.width ?? answerArea.width
  const labelMaxW = Math.max(24, colWidth - ANSWER_BOX_W - LABEL_BOX_GAP)

  targets.forEach((t, i) => {
    const col = boxes[i]
    if (!col) return
    const midY = boxCenterY(col)
    const countText = String(counts[t] ?? 0)
    const countW = estimateTextBoxWidth(countText, STUDIO_BODY_SIZE, ANSWER_BOX_W)

    if (isCountingIconSymbol(t)) {
      if (targets.length === 1) {
        drawIconAnswerLabel(objects, {
          col,
          target: t,
          countText,
          countW,
          font,
          countFont,
          tag,
        })
      } else {
        drawIconEqualsLabel(objects, { col, target: t, countText, countW, countFont, tag })
      }
      return
    }

    let label: string
    let labelSize: number
    let labelW: number
    if (targets.length === 1) {
      ;({ text: label, fontSize: labelSize, width: labelW } = fitHowManyLabel(t, labelMaxW))
    } else {
      label = toNonBreakingSpaces(`${t} =`)
      labelSize = STUDIO_BODY_SIZE
      labelW = estimateTextBoxWidth(label, labelSize, labelMaxW)
    }
    const groupW = labelW + LABEL_BOX_GAP + ANSWER_BOX_W
    const groupLeft = boxCenterX(col) - groupW / 2

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
    pushCountBox(objects, {
      left: groupLeft + labelW + LABEL_BOX_GAP,
      midY,
      countText,
      countW,
      countFont,
      tag,
    })
  })
}
