import type { StudioFabricObject } from '@/types/studio-template.types'
import { estimateTextBoxWidth, toNonBreakingSpaces } from '../studio-layout'
import { buildText, buildLine, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK, STUDIO_RULE_LIGHT } from '@/constants/studio.constants'
import { BLANK_TOKEN, answerParts } from './validate'
import {
  AFTER_BLANK_GAP,
  BLANK_STROKE,
  blankWidthFor,
  measureTextWidth,
} from './layout'

/** Draw further blank tokens on the same line (legacy multi-blank titles). */
export function drawRemainingBlanks(
  objects: StudioFabricObject[],
  after: string,
  startX: number,
  top: number,
  maxRight: number,
  font: string,
  tag: StudioTag,
  fontSize: number,
  answer: string,
): void {
  if (!after.includes(BLANK_TOKEN)) return

  const remainingAnswers = answerParts(answer).slice(1)
  let cursor = startX
  let rest = after
  let answerIdx = 0

  while (rest.includes(BLANK_TOKEN) && answerIdx < remainingAnswers.length) {
    const idx = rest.indexOf(BLANK_TOKEN)
    const leadTrim = rest.slice(0, idx).trimStart()
    if (leadTrim) {
      const leadText = toNonBreakingSpaces(leadTrim)
      const leadW = measureTextWidth(leadText, fontSize)
      objects.push(
        buildText(
          {
            left: cursor,
            top,
            text: leadText,
            fontFamily: font,
            fontSize,
            width: estimateTextBoxWidth(leadText, fontSize, Number.POSITIVE_INFINITY),
            fill: STUDIO_INK,
            lineHeight: 1,
          },
          tag,
          'prompt',
        ),
      )
      cursor += leadW + AFTER_BLANK_GAP
    }

    const part = remainingAnswers[answerIdx]!
    const bw = blankWidthFor(part, fontSize)
    const end = Math.min(cursor + bw, maxRight)
    objects.push(
      buildLine(
        {
          x1: cursor,
          y1: top + fontSize,
          x2: end,
          y2: top + fontSize,
          stroke: STUDIO_RULE_LIGHT,
          strokeWidth: BLANK_STROKE,
        },
        tag,
        'structure',
      ),
    )
    cursor = end + AFTER_BLANK_GAP
    rest = rest.slice(idx + BLANK_TOKEN.length)
    answerIdx += 1
  }

  const trailing = rest.trimStart()
  if (!trailing) return
  const trailingText = toNonBreakingSpaces(trailing)

  objects.push(
    buildText(
      {
        left: cursor,
        top,
        text: trailingText,
        fontFamily: font,
        fontSize,
        width: estimateTextBoxWidth(trailingText, fontSize, Number.POSITIVE_INFINITY),
        fill: STUDIO_INK,
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
  )
}
