import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import { FABRIC_FONT_SIZE_MULT, fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { WHY_LABEL } from './content'
import {
  CONTINUED,
  CONTINUED_SHORT,
  baselineToTop,
  boldSpec,
  entryHeight,
  nameRowHeight,
  writeInHeight,
  type TwmPage,
  type TwmPlan,
} from './layout'

/** Stamped on every destination name with its heading's key, so an entry is traceable in the editor. */
export const TWM_GROUP_KEY = 'travelWishMapGroup'
/** Stamped on the write-in entries, which belong to no destination. */
export const TWM_WRITE_IN_KEY = 'travelWishMapWriteIn'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: TwmPlan
  font: string
  tag: StudioTag
  left: number
  /** Book label per printed name, for sampled lists; null for fixed ones. */
  labelFor: ((name: string) => string) | null
}

/** Middle of the first line's letters, not of its line box. */
const letterMid = (top: number, fontSize: number) => top + (fontSize * FABRIC_FONT_SIZE_MULT) / 2

function rule(ctx: DrawContext, left: number, top: number, width: number, data?: Record<string, unknown>) {
  const rect = buildRect(
    {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: 1,
      fill: STUDIO_RULE_MEDIUM,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    ctx.tag,
    'decoration',
  )
  ctx.objects.push(data ? { ...rect, data } : rect)
}

function checkbox(ctx: DrawContext, top: number, data?: Record<string, unknown>) {
  const { check } = ctx.plan.metrics
  const rect = buildRect(
    {
      left: ctx.left,
      top: Math.round(top),
      width: check,
      height: check,
      rx: 2,
      ry: 2,
      stroke: STUDIO_INK,
      strokeWidth: STUDIO_STROKE_NORMAL,
    },
    ctx.tag,
    'structure',
  )
  ctx.objects.push(data ? { ...rect, data } : rect)
}

/** "Travel (continued)" where it fits on one line, "Travel (cont.)" where it does not. */
function headingText(ctx: DrawContext, title: string, continued: boolean): string {
  if (!continued) return title
  const long = `${title}${CONTINUED}`
  const fits =
    hugTextBoxWidth(long, ctx.plan.metrics.headingFont, Infinity, boldSpec(ctx.font)) <= ctx.plan.blockWidth
  return fits ? long : `${title}${CONTINUED_SHORT}`
}

/** The heading, bold, with a rule under it across the list. Returns its bottom. */
function drawHeading(ctx: DrawContext, title: string, continued: boolean, top: number): number {
  const { metrics, blockWidth } = ctx.plan
  const text = toNonBreakingSpaces(headingText(ctx, title, continued))
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
 * The writing lines under a destination, the first opening with "Why I want
 * to go:" set on the line as handwriting would be. `firstLineY` is the first
 * line's own y.
 */
function drawWhyLines(ctx: DrawContext, firstLineY: number, data?: Record<string, unknown>) {
  const { metrics, textLeft, textWidth, labelWidth, lines } = ctx.plan
  const left = ctx.left + textLeft
  const baseline = firstLineY - Math.round(metrics.labelFont * 0.14)
  const label = toNonBreakingSpaces(WHY_LABEL)
  const text = buildText(
    {
      left,
      top: Math.round(baselineToTop(baseline, metrics.labelFont)),
      text: label,
      width: labelWidth,
      fontFamily: ctx.font,
      fontSize: metrics.labelFont,
      lineHeight: 1,
    },
    ctx.tag,
    'decoration',
  )
  ctx.objects.push(data ? { ...text, data } : text)
  const lineLeft = left + labelWidth + metrics.labelGap
  rule(ctx, lineLeft, firstLineY, left + textWidth - lineLeft, data)
  for (let n = 1; n < lines; n++) rule(ctx, left, firstLineY + n * metrics.pitch, textWidth, data)
}

/**
 * One destination: the box beside the name's letters, the name in bold on one
 * line (stamped so later lists in the book can avoid it), then its lines.
 * Returns the entry's bottom.
 */
function drawEntry(ctx: DrawContext, name: string, group: string, entryTop: number): number {
  const { metrics, textLeft, textWidth } = ctx.plan
  const top = Math.round(entryTop)
  checkbox(ctx, letterMid(top, metrics.font) - metrics.check / 2)
  const text = toNonBreakingSpaces(name)
  const data: Record<string, unknown> = { [TWM_GROUP_KEY]: group }
  if (ctx.labelFor) data[STUDIO_CONTENT_LABEL_KEY] = ctx.labelFor(name)
  ctx.objects.push({
    ...buildText(
      {
        left: ctx.left + textLeft,
        top,
        text,
        width: hugTextBoxWidth(text, metrics.font, textWidth, boldSpec(ctx.font)),
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'prompt',
    ),
    data,
  })
  const firstLineY = top + nameRowHeight(metrics) + metrics.nameGap + metrics.pitch
  drawWhyLines(ctx, firstLineY)
  return entryTop + entryHeight(ctx.plan)
}

/** A box and a line for a place of the reader's own, then the same lines. Returns its bottom. */
function drawWriteIn(ctx: DrawContext, entryTop: number): number {
  const { metrics, textLeft, textWidth } = ctx.plan
  const data = { [TWM_WRITE_IN_KEY]: true }
  const nameLineY = Math.round(entryTop + metrics.pitch)
  // The box sits on the line the way the boxes above sit beside their names.
  checkbox(ctx, nameLineY - metrics.check - Math.round(metrics.font * 0.1), data)
  ctx.objects.push({
    ...buildRect(
      {
        left: ctx.left + textLeft,
        top: nameLineY,
        width: textWidth,
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
  drawWhyLines(ctx, nameLineY + metrics.pitch, data)
  return entryTop + writeInHeight(ctx.plan)
}

/**
 * Lay one page out in its body field, top down, exactly as the pagination
 * measured it: the same entry shape on every page, centred in the column.
 */
export function drawTwmPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: TwmPlan
    page: TwmPage
    font: string
    tag: StudioTag
    labelFor: ((name: string) => string) | null
  },
): void {
  const { field, plan, page, font, tag, labelFor } = options
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    labelFor,
    left: Math.round(field.left + (field.width - plan.blockWidth) / 2),
  }
  let top = field.top
  for (const block of page.blocks) {
    if (block.kind === 'heading') {
      if (top > field.top) top += plan.metrics.headingGapAbove
      top = drawHeading(ctx, block.title, block.continued, top)
    } else if (block.kind === 'entry') {
      top = drawEntry(ctx, block.name, block.group, top)
    } else {
      top = drawWriteIn(ctx, top)
    }
  }
}
