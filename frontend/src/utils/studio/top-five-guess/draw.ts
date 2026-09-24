import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import type { Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { TOP_FIVE_ANSWER_COUNT, TOP_FIVE_POINTS } from './content'
import { ANSWER_INSET, answerLineText, type FittedTopFiveSet } from './fit'
import {
  POINTS_LABEL,
  QUESTION_LINE_HEIGHT,
  RULE_HEIGHT,
  TOTAL_WORD,
  blockHeight,
  pointsText,
  questionHeight,
  questionSpec,
  totalLabel,
  type TopFivePagePlan,
} from './layout'

/**
 * `puzzle` — guess lines, a score blank per line and a total; answers hidden.
 * `answers` — the same blocks with the ranked answers and their points written in.
 */
export type TopFiveDrawMode = 'puzzle' | 'answers'

interface BlockGeometry {
  left: number
  bandLeft: number
  scoreLeft: number
  top: number
}

interface DrawContext {
  objects: StudioFabricObject[]
  plan: TopFivePagePlan
  font: string
  tag: StudioTag
  mode: TopFiveDrawMode
}

function rule(ctx: DrawContext, left: number, top: number, width: number, fill = STUDIO_INK) {
  ctx.objects.push(
    buildRect(
      { left, top, width, height: RULE_HEIGHT, fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      fill === STUDIO_INK ? 'structure' : 'decoration',
    ),
  )
}

/** A single-line label whose baseline box sits on `bottom`. */
function label(
  ctx: DrawContext,
  options: {
    text: string
    left: number
    bottom: number
    size: number
    bold?: boolean
    muted?: boolean
    alignRight?: boolean
    maxWidth: number
    role: 'prompt' | 'answer' | 'decoration'
  },
) {
  const { text, left, bottom, size, bold, muted, alignRight, maxWidth, role } = options
  const spec = { fontFamily: ctx.font, fontWeight: bold ? 700 : undefined }
  ctx.objects.push(
    buildText(
      {
        left,
        top: bottom,
        text,
        width: hugTextBoxWidth(text, size, maxWidth, spec),
        fontFamily: ctx.font,
        fontSize: size,
        fontWeight: bold ? 700 : undefined,
        fill: muted ? STUDIO_INK_MUTED : STUDIO_INK,
        textAlign: alignRight ? 'right' : 'left',
        originX: alignRight ? 'right' : 'left',
        originY: 'bottom',
        lineHeight: 1,
      },
      ctx.tag,
      role,
    ),
  )
}

function drawQuestion(ctx: DrawContext, set: FittedTopFiveSet, index: number, at: BlockGeometry) {
  const { metrics, bandWidth } = ctx.plan
  const spec = questionSpec(ctx.font)
  if (metrics.indexW > 0) {
    const number = `${index + 1}.`
    ctx.objects.push(
      buildText(
        {
          left: at.left,
          top: at.top,
          text: number,
          width: hugTextBoxWidth(number, metrics.questionFont, metrics.indexW, spec),
          fontFamily: ctx.font,
          fontSize: metrics.questionFont,
          fontWeight: 700,
          lineHeight: QUESTION_LINE_HEIGHT,
        },
        ctx.tag,
        'prompt',
      ),
    )
  }
  // Pre-broken to the band and set in a box as wide as the band, so Fabric has
  // no reason to re-wrap the question into a line the block did not reserve.
  ctx.objects.push(
    buildText(
      {
        left: at.bandLeft,
        top: at.top,
        text: set.questionLines.join('\n'),
        width: bandWidth,
        fontFamily: ctx.font,
        fontSize: metrics.questionFont,
        fontWeight: 700,
        lineHeight: QUESTION_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
  )
}

/**
 * Five lines. The ranked answers are drawn on both pages — hidden on the
 * puzzle, so the editor can reveal a sheet in place, and written in on the
 * answer page, where the points replace the score blanks.
 */
function drawAnswerRows(ctx: DrawContext, set: FittedTopFiveSet, at: BlockGeometry, rowsTop: number) {
  const { metrics, answerLineW, answerFont, scoreColumnW } = ctx.plan
  const lift = Math.round(metrics.pitch * 0.12)

  for (let rank = 0; rank < TOP_FIVE_ANSWER_COUNT; rank++) {
    const ruleY = rowsTop + (rank + 1) * metrics.pitch - RULE_HEIGHT
    rule(ctx, at.bandLeft, ruleY, answerLineW)
    label(ctx, {
      text: answerLineText(rank, set.answers[rank]!),
      left: at.bandLeft + ANSWER_INSET,
      bottom: ruleY - lift,
      size: answerFont,
      maxWidth: answerLineW - ANSWER_INSET,
      role: 'answer',
    })

    if (ctx.mode === 'answers') {
      label(ctx, {
        text: pointsText(TOP_FIVE_POINTS[rank]!),
        left: at.scoreLeft + scoreColumnW,
        bottom: ruleY - lift,
        size: metrics.textFont,
        bold: true,
        alignRight: true,
        maxWidth: scoreColumnW,
        role: 'answer',
      })
      continue
    }
    rule(ctx, at.scoreLeft, ruleY, metrics.scoreRuleW)
    label(ctx, {
      text: POINTS_LABEL,
      left: at.scoreLeft + metrics.scoreRuleW + metrics.labelGap,
      bottom: ruleY - lift,
      size: metrics.textFont,
      muted: true,
      maxWidth: scoreColumnW,
      role: 'decoration',
    })
  }
}

/** "Total ___ / 15" under the score blanks — the reader's running tally. */
function drawTotal(ctx: DrawContext, at: BlockGeometry, top: number) {
  const { metrics, scoreColumnW } = ctx.plan
  const baseline = top + fabricTextHeight(1, metrics.textFont)
  label(ctx, {
    text: TOTAL_WORD,
    left: at.scoreLeft - metrics.labelGap,
    bottom: baseline,
    size: metrics.textFont,
    bold: true,
    alignRight: true,
    maxWidth: scoreColumnW,
    role: 'decoration',
  })
  rule(ctx, at.scoreLeft, baseline - RULE_HEIGHT, metrics.scoreRuleW)
  label(ctx, {
    text: totalLabel(),
    left: at.scoreLeft + metrics.scoreRuleW + metrics.labelGap,
    bottom: baseline,
    size: metrics.textFont,
    muted: true,
    maxWidth: scoreColumnW,
    role: 'decoration',
  })
}

/**
 * Lay the question blocks out in the body field.
 *
 * Leftover height is spread between the blocks (up to one gap each), then the
 * stack drops at most part of a line below the header and any remaining white goes
 * under it. Centring the whole stack left a hand's width of paper between the
 * instruction and the first question, which reads as a missing block. Blocks
 * are capped in width and centred, so a letter-size page does not run guess
 * lines six inches across.
 */
export function drawTopFivePage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: TopFivePagePlan
    sets: readonly FittedTopFiveSet[]
    font: string
    tag: StudioTag
    mode: TopFiveDrawMode
  },
): void {
  const { field, plan, sets, font, tag, mode } = options
  if (sets.length === 0) return
  const ctx: DrawContext = { objects, plan, font, tag, mode }
  const { metrics } = plan

  const heights = sets.map((set) => blockHeight(set.questionLines.length, metrics))
  const usable = Math.max(0, field.height - plan.bottomGuard)
  const content = heights.reduce((sum, h) => sum + h, 0)
  const gaps = sets.length - 1
  const slack = Math.max(0, usable - content - metrics.blockGap * gaps)
  const gap = metrics.blockGap + (gaps > 0 ? Math.min(slack / (gaps + 1), metrics.blockGap) : 0)
  const stack = content + gap * gaps
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = Math.round(field.top + Math.min(Math.max(0, usable - stack), metrics.pitch * 0.6))

  sets.forEach((set, index) => {
    const bandLeft = left + metrics.indexW
    const at: BlockGeometry = {
      left,
      bandLeft,
      scoreLeft: bandLeft + plan.bandWidth - plan.scoreColumnW,
      top,
    }
    drawQuestion(ctx, set, index, at)
    const rowsTop = top + questionHeight(set.questionLines.length, metrics) + metrics.questionGap
    drawAnswerRows(ctx, set, at, rowsTop)
    if (mode === 'puzzle') {
      drawTotal(ctx, at, rowsTop + TOP_FIVE_ANSWER_COUNT * metrics.pitch + metrics.totalGap)
    }

    top += heights[index]!
    if (index < gaps) {
      // A light rule halfway down the gap keeps two questions from reading as one.
      rule(ctx, left, Math.round(top + gap / 2), plan.blockWidth, STUDIO_RULE_MEDIUM)
      top += gap
    }
  })
}
