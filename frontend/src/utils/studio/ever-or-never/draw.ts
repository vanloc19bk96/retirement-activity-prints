import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import type { Box } from '../studio-layout'
import { FABRIC_FONT_SIZE_MULT, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { EON_EVER, EON_NEVER } from './content'
import type { FittedEonStatement } from './fit'
import {
  STATEMENT_LINE_HEIGHT,
  TALLY_LABEL,
  answerHeight,
  boldSpec,
  rowContentHeight,
  rowHeight,
  statementHeight,
  statementSpec,
  tallyHeight,
  tallyOutOf,
  type EonPagePlan,
} from './layout'

/** Written before the writing line when the seller asked for one. */
export const STORY_LABEL = 'The story:'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: EonPagePlan
  font: string
  tag: StudioTag
}

function rule(ctx: DrawContext, left: number, top: number, width: number, fill = STUDIO_INK) {
  ctx.objects.push(
    buildRect(
      { left, top, width, height: 1, fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      'decoration',
    ),
  )
}

/** Middle of the first line's letters, not of its line box. */
const letterMid = (top: number, fontSize: number) => top + (fontSize * FABRIC_FONT_SIZE_MULT) / 2

/** "☐ Ever   ☐ Never", starting at `left` with the labels' tops at `top`. */
function drawAnswers(ctx: DrawContext, left: number, top: number) {
  const { metrics } = ctx.plan
  const mid = letterMid(top, metrics.font)
  let x = left
  for (const [label, width] of [
    [EON_EVER, metrics.everW],
    [EON_NEVER, metrics.neverW],
  ] as const) {
    ctx.objects.push(
      buildRect(
        {
          left: x,
          top: Math.round(mid - metrics.check / 2),
          width: metrics.check,
          height: metrics.check,
          rx: 2,
          ry: 2,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_NORMAL,
        },
        ctx.tag,
        'structure',
      ),
    )
    x += metrics.check + metrics.checkGap
    ctx.objects.push(
      buildText(
        {
          left: x,
          top,
          text: label,
          width,
          fontFamily: ctx.font,
          fontSize: metrics.font,
          fontWeight: 700,
          lineHeight: 1,
        },
        ctx.tag,
        'decoration',
      ),
    )
    x += width + metrics.answerGap
  }
}

/** "The story: ______" across the statement column, tall enough to write on. */
function drawStory(ctx: DrawContext, left: number, top: number, right: number) {
  const { metrics } = ctx.plan
  const baseline = top + metrics.storyH
  const spec = boldSpec(ctx.font)
  const labelW = hugTextBoxWidth(STORY_LABEL, metrics.font, right - left, spec)
  ctx.objects.push(
    buildText(
      {
        left,
        top: baseline - Math.round(metrics.font * 0.15),
        text: STORY_LABEL,
        width: labelW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: 1,
        originY: 'bottom',
      },
      ctx.tag,
      'decoration',
    ),
  )
  const ruleLeft = left + labelW + metrics.checkGap
  rule(ctx, ruleLeft, baseline - 1, right - ruleLeft)
}

/**
 * One row: the number, the statement (stamped so later runs can avoid it),
 * the two answers, and the story line. Returns the row's bottom.
 */
function drawRow(
  ctx: DrawContext,
  item: FittedEonStatement,
  index: number,
  left: number,
  top: number,
  padY: number,
): number {
  const { plan } = ctx
  const { metrics } = plan
  const lines = item.lines.length
  const content = rowContentHeight(lines, plan)
  const textH = statementHeight(lines, metrics)
  const inline = plan.arrangement === 'inline'
  // Inline, the answers are centred on the statement beside them, so a
  // two-line row reads as one unit rather than boxes hanging off its top.
  const textTop = Math.round(top + padY + (inline ? (content - textH) / 2 : 0))
  const textLeft = left + plan.textLeft

  const number = `${index + 1}.`
  ctx.objects.push(
    buildText(
      {
        left,
        top: textTop,
        text: number,
        width: metrics.numberW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: 1,
        textAlign: 'right',
      },
      ctx.tag,
      'decoration',
    ),
  )

  // Pre-broken and set in a box exactly the measure it was broken to, so
  // Fabric has no reason to re-wrap it into a line the row did not reserve.
  ctx.objects.push({
    ...buildText(
      {
        left: textLeft,
        top: textTop,
        text: item.lines.join('\n'),
        width: plan.textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: STATEMENT_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: item.statement },
  })

  if (inline) {
    const answersTop = Math.round(top + padY + (content - answerHeight(metrics)) / 2)
    drawAnswers(ctx, left + plan.blockWidth - metrics.answersW, answersTop)
  } else {
    drawAnswers(ctx, textLeft, Math.round(textTop + textH + metrics.answerRowGap))
  }

  if (plan.storyLine) {
    drawStory(ctx, textLeft, top + padY + content + metrics.storyGap, left + plan.blockWidth)
  }
  return top + rowHeight(lines, plan) + 2 * (padY - metrics.padY)
}

/** "Total Evers: ____ out of 8", right-aligned under the list. */
function drawTally(ctx: DrawContext, right: number, top: number) {
  const { metrics, count } = ctx.plan
  const bold = boldSpec(ctx.font)
  const plain = statementSpec(ctx.font)
  const outOf = tallyOutOf(count)
  const labelW = hugTextBoxWidth(TALLY_LABEL, metrics.font, Infinity, bold)
  const outOfW = hugTextBoxWidth(outOf, metrics.font, Infinity, plain)
  const ruleW = Math.round(metrics.font * 3)
  let x = right - (labelW + metrics.checkGap + ruleW + metrics.checkGap + outOfW)
  ctx.objects.push(
    buildText(
      {
        left: x,
        top,
        text: TALLY_LABEL,
        width: labelW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  x += labelW + metrics.checkGap
  rule(ctx, x, Math.round(top + metrics.font * FABRIC_FONT_SIZE_MULT) - 2, ruleW)
  x += ruleW + metrics.checkGap
  ctx.objects.push(
    buildText(
      {
        left: x,
        top,
        text: outOf,
        width: outOfW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

/**
 * Lay the ruled list out in the body field.
 *
 * Rows are only as tall as their statements need. Leftover height is spread
 * into the rows' padding (up to half a line each), so a page of short
 * statements breathes rather than bunching at the top; anything still left
 * goes under the tally — centring the whole list reads as a missing row.
 */
export function drawEonPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: EonPagePlan
    items: readonly FittedEonStatement[]
    font: string
    tag: StudioTag
  },
): void {
  const { field, plan, items, font, tag } = options
  if (items.length === 0) return
  const ctx: DrawContext = { objects, plan, font, tag }
  const { metrics } = plan

  const usable = Math.max(0, field.height - plan.bottomGuard)
  const natural =
    items.reduce((sum, item) => sum + rowHeight(item.lines.length, plan), 0) + tallyHeight(metrics)
  const slack = Math.max(0, usable - natural)
  const extraPad = Math.min(slack / items.length, metrics.font) / 2
  const padY = metrics.padY + extraPad
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = Math.round(field.top + Math.min(slack - 2 * extraPad * items.length, metrics.font * 0.4))

  rule(ctx, left, top, plan.blockWidth, STUDIO_RULE_MEDIUM)
  items.forEach((item, index) => {
    top = drawRow(ctx, item, index, left, top, padY)
    rule(ctx, left, Math.round(top) - 1, plan.blockWidth, STUDIO_RULE_MEDIUM)
  })
  drawTally(ctx, left + plan.blockWidth, Math.round(top + metrics.tallyGap))
}
