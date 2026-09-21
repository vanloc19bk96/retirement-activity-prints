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
import {
  buildPhosphorIconPath,
  hasPhosphorIcon,
} from '../studio-phosphor-icon'
import {
  STUDIO_INK,
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'

const ANSWER_BOX_W = 44
const ANSWER_BOX_H = 32
const LABEL_BOX_GAP = 10
const MIN_LABEL_SIZE = 14
const HOW_MANY_PREFIX = 'How many'
const HOW_MANY_SUFFIX = '?'

function isIconSymbol(symbol: string): boolean {
  return hasPhosphorIcon(symbol)
}

/**
 * Targets legend — label + each symbol as its own centered box so mixed
 * Phosphor icons / glyphs share one midline.
 */
export function drawTargetsBanner(options: {
  objects: StudioFabricObject[]
  banner: Box
  bannerY: number
  targets: string[]
  font: string
  symbolFont: string
  tag: StudioTag
}): void {
  const { objects, banner, bannerY, targets, font, symbolFont, tag } = options
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
    if (isIconSymbol(sym)) {
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
            fontWeight: 700,
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

/** Fit “How many X ?” on one line — glyphs are ~1em wide. */
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
    tag: StudioTag
  },
): void {
  const { left, midY, countText, countW, tag } = options
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
            fontFamily: STUDIO_DIGIT_FONT,
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
    tag: StudioTag
  },
): void {
  const { col, target, countText, countW, font, tag } = options
  const midY = boxCenterY(col)
  const prefixText = toNonBreakingSpaces(HOW_MANY_PREFIX)
  // Keep the row inside this column so the icon never spills onto the next “How many”.
  const maxW = Math.max(72, col.width - 8)

  let fontSize = STUDIO_BODY_SIZE
  // Cap icon below text height so multi-target columns stay clear.
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
      {
        left: cursor + iconSize / 2,
        top: midY,
        size: iconSize,
      },
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
  pushCountBox(objects, { left: cursor, midY, countText, countW, tag })
}

export function drawAnswerStrip(
  objects: StudioFabricObject[],
  answerArea: Box,
  targets: string[],
  counts: Record<string, number>,
  font: string,
  tag: StudioTag,
): void {
  const boxes = columns(answerArea, targets.length, 40)
  targets.forEach((t, i) => {
    const col = boxes[i]
    if (!col) return
    const midY = boxCenterY(col)
    const countText = String(counts[t] ?? 0)
    const countW = estimateTextBoxWidth(countText, STUDIO_BODY_SIZE, ANSWER_BOX_W)

    if (isIconSymbol(t)) {
      drawIconAnswerLabel(objects, { col, target: t, countText, countW, font, tag })
      return
    }

    const maxLabelW = Math.max(48, col.width - ANSWER_BOX_W - LABEL_BOX_GAP)
    const { text: label, fontSize: labelSize, width: labelW } = fitHowManyLabel(t, maxLabelW)
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
      tag,
    })
  })
}
