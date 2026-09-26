import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import type { Box } from '../studio-layout'
import { FABRIC_FONT_SIZE_MULT, fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  CONTINUED,
  CONTINUED_SHORT,
  IDEA_LINE_HEIGHT,
  boldSpec,
  rowHeight,
  writeRowHeight,
  type BlPage,
  type BlPagePlan,
  type FittedBlIdea,
} from './layout'

/** Stamped on the write-in boxes and lines, which belong to no idea. */
export const BL_WRITE_IN_KEY = 'bucketListWriteIn'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: BlPagePlan
  font: string
  tag: StudioTag
  left: number
}

/** Middle of the first line's letters, not of its line box. */
const letterMid = (top: number, fontSize: number) => top + (fontSize * FABRIC_FONT_SIZE_MULT) / 2

/** "Travel (continued)" where it fits on one line, "Travel (cont.)" where it does not. */
function headingText(ctx: DrawContext, title: string, continued: boolean): string {
  if (!continued) return title
  const long = `${title}${CONTINUED}`
  const fits =
    hugTextBoxWidth(long, ctx.plan.metrics.headingFont, Infinity, boldSpec(ctx.font)) <= ctx.plan.blockWidth
  return fits ? long : `${title}${CONTINUED_SHORT}`
}

/** "Travel", bold, with a rule under it across the list. Returns the heading's bottom. */
function drawHeading(ctx: DrawContext, title: string, continued: boolean, top: number): number {
  const { metrics, blockWidth } = ctx.plan
  const text = headingText(ctx, title, continued)
  ctx.objects.push(
    buildText(
      {
        left: ctx.left,
        top: Math.round(top),
        text,
        width: hugTextBoxWidth(text, metrics.headingFont, blockWidth, boldSpec(ctx.font)),
        fontFamily: ctx.font,
        fontSize: metrics.headingFont,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  const ruleTop = top + fabricTextHeight(1, metrics.headingFont) + metrics.headingRuleGap
  ctx.objects.push(
    buildRect(
      {
        left: ctx.left,
        top: Math.round(ruleTop),
        width: blockWidth,
        height: metrics.ruleWeight,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      ctx.tag,
      'decoration',
    ),
  )
  return ruleTop + metrics.ruleWeight + metrics.headingGapBelow
}

/**
 * One row: the box, the number and the idea (stamped so later runs can avoid
 * it). The box sits on the idea's first line, so a two-line idea still reads
 * as one item with its box. Returns the row's bottom.
 */
function drawRow(ctx: DrawContext, item: FittedBlIdea, rowTop: number): number {
  const { metrics, textLeft, textWidth } = ctx.plan
  const top = Math.round(rowTop)
  const mid = letterMid(top, metrics.font)
  ctx.objects.push(
    buildRect(
      {
        left: ctx.left,
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
  ctx.objects.push(
    buildText(
      {
        left: ctx.left + metrics.check + metrics.checkGap,
        top,
        text: `${item.number}.`,
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
        left: ctx.left + textLeft,
        top,
        text: item.lines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: IDEA_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: item.idea },
  })
  return rowTop + rowHeight(item.lines.length, metrics)
}

/** A box and a writing line for an idea of the reader's own. Returns the line's bottom. */
function drawWriteIn(ctx: DrawContext, rowTop: number): number {
  const { metrics, blockWidth } = ctx.plan
  const height = writeRowHeight(metrics)
  // The line sits where a handwritten line's baseline would; the box beside
  // it is aligned to the same writing, like the boxes on the ideas above.
  const lineTop = Math.round(rowTop + height - metrics.rowGap)
  const lineLeft = ctx.left + metrics.check + metrics.checkGap
  const data = { [BL_WRITE_IN_KEY]: true }
  ctx.objects.push({
    ...buildRect(
      {
        left: ctx.left,
        top: lineTop - metrics.check - Math.round(metrics.font * 0.1),
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
    data,
  })
  ctx.objects.push({
    ...buildRect(
      {
        left: lineLeft,
        top: lineTop,
        width: ctx.left + blockWidth - lineLeft,
        height: 1,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      ctx.tag,
      'decoration',
    ),
    data,
  })
  return rowTop + height
}

/**
 * Lay one page of the list out in its body field, top down, exactly as the
 * pagination measured it: the same spacing on every page of the list, so the
 * pages read as one continuous list.
 */
export function drawBlPage(
  objects: StudioFabricObject[],
  options: { field: Box; plan: BlPagePlan; page: BlPage; font: string; tag: StudioTag },
): void {
  const { field, plan, page, font, tag } = options
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    left: Math.round(field.left + (field.width - plan.blockWidth) / 2),
  }
  let top = field.top
  for (const block of page.blocks) {
    if (block.kind === 'heading') {
      if (top > field.top) top += plan.metrics.headingGapAbove
      top = drawHeading(ctx, block.title, block.continued, top)
    } else if (block.kind === 'row') {
      top = drawRow(ctx, block.item, top)
    } else {
      top = drawWriteIn(ctx, top)
    }
  }
}
