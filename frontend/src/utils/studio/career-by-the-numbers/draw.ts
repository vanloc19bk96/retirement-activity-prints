import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { buildCircle, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { buildIconPath } from '../studio-icon'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { createRng } from '../studio-rng'
import { CBN_SALT } from './content'
import {
  ABOUT_LABEL,
  PROMPT_LINE_HEIGHT,
  baselineToTop,
  firstLineHeight,
  plainSpec,
  questionTextHeight,
  rowBaseline,
  rowLineY,
  textInset,
  type CbnPage,
  type CbnPlan,
  type FittedCbnQuestion,
} from './layout'

/** Stamped on every question with its number, so a row is traceable in the editor. */
export const CBN_QUESTION_KEY = 'careerQuestion'
/** Stamped on every writing line. */
export const CBN_LINE_KEY = 'careerAnswerLine'
/** Stamped on every unit printed after a line. */
export const CBN_UNIT_KEY = 'careerUnit'
/** Stamped on the closing motif row's icons. */
export const CBN_MOTIF_KEY = 'careerMotif'

/**
 * Line-art motifs for the closing row: the workday's coffee, alarm clock,
 * paperclip and pencil, and a sunrise for the next chapter. Outlines only,
 * one ink, each a single simple shape that stays crisp at a small size.
 */
export const CBN_MOTIF_ICONS: readonly string[] = ['coffee', 'alarm-clock', 'paperclip', 'pencil', 'sunrise']

/** Three different motifs, in a seeded order, so books do not all close alike. */
export function pickMotifIcons(seed: number): string[] {
  return createRng((seed ^ CBN_SALT ^ 0x5a5a) >>> 0)
    .shuffle([...CBN_MOTIF_ICONS])
    .slice(0, 3)
}

interface DrawContext {
  objects: StudioFabricObject[]
  plan: CbnPlan
  font: string
  tag: StudioTag
  left: number
  lineW: number
}

/** Text on a row's baseline. Spaces locked so Fabric never breaks it. */
function word(ctx: DrawContext, raw: string, left: number, baseline: number, data?: Record<string, unknown>) {
  const size = ctx.plan.metrics.font
  const text = toNonBreakingSpaces(raw)
  const built = buildText(
    {
      left: Math.round(left),
      top: Math.round(baselineToTop(baseline, size)),
      text,
      width: hugTextBoxWidth(text, size, ctx.plan.textWidth, plainSpec(ctx.font)),
      fontFamily: ctx.font,
      fontSize: size,
      lineHeight: 1,
    },
    ctx.tag,
    'decoration',
  )
  ctx.objects.push(data ? { ...built, data } : built)
}

/** The writing line: mid grey, so handwriting stands out on it. */
function rule(ctx: DrawContext, left: number, top: number, number: number) {
  ctx.objects.push({
    ...buildRect(
      {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(ctx.lineW),
        height: 1,
        fill: STUDIO_RULE_MEDIUM,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      ctx.tag,
      'decoration',
    ),
    data: { [CBN_LINE_KEY]: number },
  })
}

/** The row's number in a thin ring. Outline only — paper-white inside, one ink. */
function drawBadge(ctx: DrawContext, cx: number, cy: number, number: number) {
  const { badgeR: r, numberFont, numberFontWide } = ctx.plan.metrics
  const size = number >= 10 ? numberFontWide : numberFont
  ctx.objects.push(
    buildCircle(
      { left: cx, top: cy, radius: r, fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL },
      ctx.tag,
      'decoration',
    ),
    buildText(
      {
        left: cx,
        top: Math.round(cy - fabricTextHeight(1, size, 1) / 2),
        text: String(number),
        width: Math.round(r * 1.6),
        fontFamily: ctx.font,
        fontSize: size,
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

/**
 * One row: the ring, the question (stamped so later runs can avoid it), then
 * "About", the writing line and the unit on one baseline. Everything is set
 * from the row's own top, so no part of a row can land on another page.
 */
function drawRow(ctx: DrawContext, q: FittedCbnQuestion, top: number) {
  const { metrics, textOffset, textWidth, lineOffset } = ctx.plan
  const textTop = top + textInset(metrics)
  drawBadge(ctx, ctx.left + metrics.badgeR, Math.round(textTop + firstLineHeight(metrics) / 2), q.number)

  // Pre-broken and set in a box exactly the measure it was broken to, so
  // Fabric has no reason to re-wrap it into a line the row did not reserve.
  ctx.objects.push({
    ...buildText(
      {
        left: ctx.left + textOffset,
        top: Math.round(textTop),
        text: q.lines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: PROMPT_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: q.question, [CBN_QUESTION_KEY]: q.number },
  })

  const rowTop = textTop + questionTextHeight(ctx.plan, q.lines.length)
  const baseline = rowBaseline(rowTop, metrics)
  word(ctx, ABOUT_LABEL, ctx.left + textOffset, baseline)
  rule(ctx, ctx.left + lineOffset, rowLineY(rowTop, metrics), q.number)
  word(ctx, q.unit, ctx.left + lineOffset + ctx.lineW + metrics.labelGap, baseline, {
    [CBN_UNIT_KEY]: q.number,
  })
}

/** A small centred row of work motifs: a quiet full stop to the activity. */
function drawMotif(ctx: DrawContext, top: number, icons: readonly string[], columnWidth: number) {
  const { motif } = ctx.plan.metrics
  const step = motif * 2.2
  const centre = ctx.left + columnWidth / 2
  icons.forEach((name, i) => {
    const built = buildIconPath(
      name,
      {
        left: Math.round(centre + (i - (icons.length - 1) / 2) * step),
        top: Math.round(top + motif / 2),
        size: motif,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      ctx.tag,
      'decoration',
    )
    ctx.objects.push({ ...built, data: { ...(built.data ?? {}), [CBN_MOTIF_KEY]: name } })
  })
}

/** Lay one page out in its body field, top down, exactly as the pagination measured it. */
export function drawCbnPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: CbnPlan
    page: CbnPage
    font: string
    tag: StudioTag
    lineW: number
    motifIcons: readonly string[]
  },
): void {
  const { field, plan, page, font, tag, lineW, motifIcons } = options
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    lineW,
    left: Math.round(field.left + (field.width - plan.columnWidth) / 2),
  }
  for (const block of page.blocks) drawRow(ctx, block.question, field.top + block.top)
  if (page.motifTop !== null) drawMotif(ctx, field.top + page.motifTop, motifIcons, plan.columnWidth)
}
