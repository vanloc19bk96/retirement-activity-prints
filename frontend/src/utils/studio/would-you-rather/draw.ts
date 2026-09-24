import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { buildCircle, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import { FABRIC_FONT_SIZE_MULT, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { WYR_LEAD, WYR_OR, pairLabel } from './content'
import { pairLines, type FittedWyrPair } from './fit'
import {
  OPTION_LINE_HEIGHT,
  blockHeight,
  boxHeight,
  leadHeight,
  leadSpec,
  optionTextHeight,
  type WyrPagePlan,
} from './layout'

/** Written before the writing line when the seller asked for one. */
export const REASON_LABEL = 'Why?'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: WyrPagePlan
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

/** "1.  Would you rather…" — stamped with the pair so later runs can avoid it. */
function drawLead(ctx: DrawContext, pair: FittedWyrPair, index: number, left: number, top: number) {
  const { metrics, blockWidth } = ctx.plan
  const text = toNonBreakingSpaces(`${index + 1}.  ${WYR_LEAD}`)
  ctx.objects.push({
    ...buildText(
      {
        left,
        top,
        text,
        width: hugTextBoxWidth(text, metrics.font, blockWidth, leadSpec(ctx.font)),
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: pairLabel(pair) },
  })
}

/**
 * One choice: a rounded box, an empty tick box, and the text centred in the
 * height both boxes of the question share — so a one-line choice does not
 * look lighter than a two-line one above or below it.
 */
function drawChoice(ctx: DrawContext, box: Box, lines: readonly string[], reserved: number) {
  const { metrics, textWidth } = ctx.plan
  ctx.objects.push(
    buildRect(
      {
        ...box,
        rx: metrics.radius,
        ry: metrics.radius,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      ctx.tag,
      'structure',
    ),
  )

  const centring = (optionTextHeight(reserved, metrics) - optionTextHeight(lines.length, metrics)) / 2
  const textTop = Math.round(box.top + metrics.padY + centring)
  // Level with the first line's letters, not the top of its line box.
  const firstLineMid = textTop + (metrics.font * FABRIC_FONT_SIZE_MULT) / 2
  ctx.objects.push(
    buildRect(
      {
        left: box.left + metrics.padX,
        top: Math.round(firstLineMid - metrics.check / 2),
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
  // Pre-broken and set in a box exactly the measure it was broken to, so
  // Fabric has no reason to re-wrap it into a line the box did not reserve.
  ctx.objects.push(
    buildText(
      {
        left: box.left + metrics.padX + metrics.check + metrics.checkGap,
        top: textTop,
        text: lines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: OPTION_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
  )
}

/** The round "OR" badge, centred on (cx, cy). */
function drawOr(ctx: DrawContext, cx: number, cy: number) {
  const { metrics } = ctx.plan
  ctx.objects.push(
    buildCircle(
      {
        left: cx,
        top: cy,
        radius: metrics.orDiameter / 2,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      ctx.tag,
      'decoration',
    ),
  )
  const spec = { fontFamily: ctx.font, fontWeight: 700 }
  ctx.objects.push(
    buildText(
      {
        left: cx,
        top: Math.round(cy - (metrics.orFont * FABRIC_FONT_SIZE_MULT) / 2),
        text: WYR_OR,
        width: hugTextBoxWidth(WYR_OR, metrics.orFont, metrics.orDiameter, spec),
        fontFamily: ctx.font,
        fontSize: metrics.orFont,
        fontWeight: 700,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
      },
      ctx.tag,
      'decoration',
    ),
  )
}

/** "Why? ______" across the block, on a line tall enough to write on. */
function drawReason(ctx: DrawContext, left: number, top: number) {
  const { metrics, blockWidth } = ctx.plan
  const baseline = top + metrics.reasonH
  const spec = { fontFamily: ctx.font, fontWeight: 700 }
  const labelW = hugTextBoxWidth(REASON_LABEL, metrics.font, blockWidth, spec)
  ctx.objects.push(
    buildText(
      {
        left,
        top: baseline - Math.round(metrics.font * 0.15),
        text: REASON_LABEL,
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
  rule(ctx, ruleLeft, baseline - 1, left + blockWidth - ruleLeft)
}

/** Choice A, the OR divider, choice B — both boxes one size. Returns the bottom. */
function drawChoices(ctx: DrawContext, pair: FittedWyrPair, left: number, top: number): number {
  const { metrics, blockWidth } = ctx.plan
  const reserved = pairLines(pair)
  const height = boxHeight(reserved, metrics)
  drawChoice(ctx, { left, top, width: blockWidth, height }, pair.linesA, reserved)

  const orTop = top + height
  const cx = Math.round(left + blockWidth / 2)
  const cy = Math.round(orTop + metrics.orBand / 2)
  // Hairlines either side of the badge make the OR read as a divider.
  const reach = Math.round(blockWidth * 0.28)
  const gap = Math.round(metrics.orDiameter / 2 + metrics.checkGap)
  rule(ctx, cx - gap - reach, cy, reach, STUDIO_RULE_MEDIUM)
  rule(ctx, cx + gap, cy, reach, STUDIO_RULE_MEDIUM)
  drawOr(ctx, cx, cy)

  const secondTop = orTop + metrics.orBand
  drawChoice(ctx, { left, top: secondTop, width: blockWidth, height }, pair.linesB, reserved)
  return secondTop + height
}

/**
 * Lay the question blocks out in the body field.
 *
 * Leftover height is spread between the blocks (up to one gap each), then the
 * stack drops at most part of a line below the header and any remaining white
 * goes under it — centring the whole stack reads as a missing question. Blocks
 * are capped in width and centred.
 */
export function drawWyrPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: WyrPagePlan
    pairs: readonly FittedWyrPair[]
    font: string
    tag: StudioTag
  },
): void {
  const { field, plan, pairs, font, tag } = options
  if (pairs.length === 0) return
  const ctx: DrawContext = { objects, plan, font, tag }
  const { metrics } = plan

  const heights = pairs.map((pair) => blockHeight(pairLines(pair), plan))
  const usable = Math.max(0, field.height - plan.bottomGuard)
  const content = heights.reduce((sum, h) => sum + h, 0)
  const gaps = pairs.length - 1
  const slack = Math.max(0, usable - content - metrics.blockGap * gaps)
  const gap = metrics.blockGap + (gaps > 0 ? Math.min(slack / (gaps + 1), metrics.blockGap) : 0)
  const stack = content + gap * gaps
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = Math.round(field.top + Math.min(Math.max(0, usable - stack), metrics.font))

  pairs.forEach((pair, index) => {
    drawLead(ctx, pair, index, left, top)
    const boxesTop = top + leadHeight(metrics) + metrics.leadGap
    const boxesBottom = drawChoices(ctx, pair, left, boxesTop)
    if (plan.reasonLine) drawReason(ctx, left, boxesBottom + metrics.reasonGap)
    top += heights[index]! + gap
  })
}
