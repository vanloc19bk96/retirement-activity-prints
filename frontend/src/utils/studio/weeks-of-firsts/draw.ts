import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  AHEAD_TITLE,
  AHEAD_TITLE_SHORT,
  BACK_PROMPTS,
  BACK_TITLE,
  BACK_TITLE_SHORT,
  DATE_LABEL,
  DATE_LINE_MIN,
  IDEA_LINE_HEIGHT,
  WEEK_LABEL,
  baselineToTop,
  boldSpec,
  headBaseline,
  plainSpec,
  type FittedWfWeek,
  type WfBlock,
  type WfPage,
  type WfPlan,
} from './layout'

/** Stamped on every week's card frame, with its number, so a card is traceable in the editor. */
export const WF_WEEK_KEY = 'weeksOfFirstsWeek'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: WfPlan
  font: string
  tag: StudioTag
  left: number
}

/** A writing line: hairline grey for notes, ink for the date. */
function rule(ctx: DrawContext, left: number, top: number, width: number, fill = STUDIO_RULE_MEDIUM) {
  ctx.objects.push(
    buildRect(
      { left, top: Math.round(top), width: Math.round(width), height: 1, fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      'decoration',
    ),
  )
}

function frame(ctx: DrawContext, top: number, height: number, data?: Record<string, unknown>) {
  const { metrics, blockWidth } = ctx.plan
  const rect = buildRect(
    {
      left: ctx.left,
      top: Math.round(top),
      width: blockWidth,
      height: Math.round(height),
      rx: metrics.radius,
      ry: metrics.radius,
      stroke: STUDIO_INK,
      strokeWidth: STUDIO_STROKE_NORMAL,
    },
    ctx.tag,
    'structure',
  )
  ctx.objects.push(data ? { ...rect, data } : rect)
}

/**
 * A single line of text whose baseline sits at `baseline`. Spaces are locked
 * (as in the page title), so Fabric never breaks "Week 12" onto two lines.
 */
function label(
  ctx: DrawContext,
  raw: string,
  left: number,
  baseline: number,
  options: { size: number; bold?: boolean; maxWidth: number },
) {
  const spec = options.bold ? boldSpec(ctx.font) : plainSpec(ctx.font)
  const text = toNonBreakingSpaces(raw)
  const width = hugTextBoxWidth(text, options.size, options.maxWidth, spec)
  ctx.objects.push(
    buildText(
      {
        left: Math.round(left),
        top: Math.round(baselineToTop(baseline, options.size)),
        text,
        width,
        fontFamily: ctx.font,
        fontSize: options.size,
        fontWeight: options.bold ? 700 : undefined,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  return width
}

/** Where a handwritten line sits under a label's baseline. */
const lineUnder = (ctx: DrawContext, baseline: number) => baseline + Math.round(ctx.plan.metrics.font * 0.12)

/** "I began my year of firsts on: ________" */
function drawStart(ctx: DrawContext, top: number, height: number) {
  const { metrics, blockWidth, startLabel } = ctx.plan
  const lineY = top + height - 2
  const baseline = lineY - Math.round(metrics.font * 0.12)
  const width = label(ctx, startLabel, ctx.left, baseline, { size: metrics.font, bold: true, maxWidth: blockWidth })
  const lineLeft = ctx.left + width + metrics.startGap
  rule(ctx, lineLeft, lineY, ctx.left + blockWidth - lineLeft, STUDIO_INK)
}

/**
 * One week: the frame, "Week 12" and the date line across the top, the idea
 * (stamped so later runs can avoid it), then the notes lines. Everything is
 * set from the card's own top, so no part of a week can land on another page.
 */
function drawCard(ctx: DrawContext, week: FittedWfWeek, top: number, height: number, lines: number) {
  const { metrics, innerWidth, dateLabelW, dateLineW } = ctx.plan
  frame(ctx, top, height, { [WF_WEEK_KEY]: week.week })

  const inner = ctx.left + metrics.pad
  const right = inner + innerWidth
  const rowTop = top + metrics.pad
  const baseline = headBaseline(rowTop, metrics)
  label(ctx, `${WEEK_LABEL} ${week.week}`, inner, baseline, {
    size: metrics.headFont,
    bold: true,
    maxWidth: innerWidth,
  })
  const lineLeft = right - dateLineW
  label(ctx, DATE_LABEL, lineLeft - metrics.labelGap - dateLabelW, baseline, {
    size: metrics.font,
    maxWidth: dateLabelW,
  })
  rule(ctx, lineLeft, lineUnder(ctx, baseline), dateLineW, STUDIO_INK)

  // Pre-broken and set in a box exactly the measure it was broken to, so
  // Fabric has no reason to re-wrap it into a line the card did not reserve.
  const ideaTop = rowTop + metrics.headerH + metrics.headGap
  ctx.objects.push({
    ...buildText(
      {
        left: inner,
        top: Math.round(ideaTop),
        text: week.lines.join('\n'),
        width: innerWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: IDEA_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: week.idea },
  })

  const notesTop = ideaTop + fabricTextHeight(ctx.plan.ideaLines, metrics.font, IDEA_LINE_HEIGHT)
  for (let line = 1; line <= lines; line++) rule(ctx, inner, notesTop + line * metrics.pitch, innerWidth)
}

/** "Looking Back on My Year of Firsts" (or its short form where it would not fit), then lines. */
function drawBox(ctx: DrawContext, block: Extract<WfBlock, { kind: 'box' }>) {
  const { metrics, innerWidth } = ctx.plan
  frame(ctx, block.top, block.height)
  const inner = ctx.left + metrics.pad
  const [long, short] = block.role === 'ahead' ? [AHEAD_TITLE, AHEAD_TITLE_SHORT] : [BACK_TITLE, BACK_TITLE_SHORT]
  const fits = hugTextBoxWidth(long, metrics.headFont, Infinity, boldSpec(ctx.font)) <= innerWidth
  const rowTop = block.top + metrics.pad
  label(ctx, fits ? long : short, inner, headBaseline(rowTop, metrics), {
    size: metrics.headFont,
    bold: true,
    maxWidth: innerWidth,
  })

  const titleBottom = rowTop + fabricTextHeight(1, metrics.headFont)
  const prompts = block.role === 'back' ? BACK_PROMPTS : []
  for (let line = 1; line <= block.lines; line++) {
    const y = titleBottom + line * metrics.pitch
    const prompt = prompts[line - 1]
    const promptW = prompt ? hugTextBoxWidth(prompt, metrics.font, Infinity, plainSpec(ctx.font)) : 0
    if (prompt && innerWidth - promptW - metrics.labelGap >= DATE_LINE_MIN) {
      label(ctx, prompt, inner, y - Math.round(metrics.font * 0.12), { size: metrics.font, maxWidth: innerWidth })
      const lineLeft = inner + promptW + metrics.labelGap
      rule(ctx, lineLeft, y, inner + innerWidth - lineLeft)
    } else {
      rule(ctx, inner, y, innerWidth)
    }
  }
}

/**
 * Lay one page out in its body field, top down, exactly as the pagination
 * measured it: the same card shape on every page, centred in the column.
 */
export function drawWfPage(
  objects: StudioFabricObject[],
  options: { field: Box; plan: WfPlan; page: WfPage; font: string; tag: StudioTag },
): void {
  const { field, plan, page, font, tag } = options
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    left: Math.round(field.left + (field.width - plan.blockWidth) / 2),
  }
  for (const block of page.blocks) {
    const top = field.top + block.top
    if (block.kind === 'start') drawStart(ctx, top, block.height)
    else if (block.kind === 'card') drawCard(ctx, block.week, top, block.height, block.lines)
    else drawBox(ctx, { ...block, top })
  }
}
