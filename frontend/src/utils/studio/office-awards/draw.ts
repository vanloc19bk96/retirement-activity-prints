import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  buildCircle,
  buildGroup,
  buildPolygon,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { toNonBreakingSpaces, unionObjectBounds, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  AWARD_LINE_HEIGHT,
  WHY_LABEL,
  WINNER_LABEL,
  awardTextHeight,
  baselineToTop,
  plainSpec,
  rowBaseline,
  rowLineY,
  type FittedOaAward,
  type OaPage,
  type OaPlan,
} from './layout'

/** Stamped on every award title with its number, so a card is traceable in the editor. */
export const OA_AWARD_KEY = 'officeAward'
/** Stamped on every writing line: "winner" or "why". */
export const OA_LINE_KEY = 'officeAwardLine'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: OaPlan
  font: string
  tag: StudioTag
  left: number
}

/** Wraps `parts` in a group hugging their drawn extent; nothing to wrap, nothing pushed. */
function pushGroup(objects: StudioFabricObject[], parts: StudioFabricObject[], tag: StudioTag): void {
  const bounds = unionObjectBounds(parts)
  if (bounds) objects.push(buildGroup(parts, bounds, tag, 'structure'))
}

/** A writing line: mid grey, so handwriting stands out on it. */
function rule(ctx: DrawContext, left: number, top: number, width: number, kind: 'winner' | 'why') {
  ctx.objects.push({
    ...buildRect(
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
    ),
    data: { [OA_LINE_KEY]: kind },
  })
}

/** "Winner:" or "Why:" on a row's baseline. Spaces locked so Fabric never breaks it. */
function label(ctx: DrawContext, raw: string, left: number, baseline: number) {
  const size = ctx.plan.metrics.font
  const text = toNonBreakingSpaces(raw)
  ctx.objects.push(
    buildText(
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
    ),
  )
}

/**
 * The card's rosette: a ringed medal with the award's number, two ribbon
 * tails below. Outline only — paper-white inside, one ink, no fills that
 * would print as a black blob.
 */
function drawBadge(ctx: DrawContext, cx: number, cy: number, number: number) {
  const { badgeR: r, tail } = ctx.plan.metrics
  const numberFont = number >= 10 ? ctx.plan.metrics.numberFontWide : ctx.plan.metrics.numberFont
  const bottom = cy + r + tail
  const leftTail = [
    { x: cx - 0.55 * r, y: cy + 0.55 * r },
    { x: cx - 0.9 * r, y: bottom },
    { x: cx - 0.55 * r, y: bottom - 0.28 * tail },
    { x: cx - 0.2 * r, y: bottom },
    { x: cx - 0.05 * r, y: cy + 0.75 * r },
  ]
  for (const points of [leftTail, leftTail.map((p) => ({ x: 2 * cx - p.x, y: p.y }))]) {
    ctx.objects.push(
      buildPolygon(
        {
          left: 0,
          top: 0,
          points: points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
          fill: STUDIO_PAPER,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
          strokeLineJoin: 'round',
        },
        ctx.tag,
        'decoration',
      ),
    )
  }
  // Drawn over the tails' tops, so they seem to hang from behind the medal.
  ctx.objects.push(
    buildCircle(
      { left: cx, top: cy, radius: r, fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL },
      ctx.tag,
      'decoration',
    ),
    buildCircle(
      { left: cx, top: cy, radius: Math.round(r * 0.78), stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_HAIRLINE },
      ctx.tag,
      'decoration',
    ),
    buildText(
      {
        left: cx,
        top: Math.round(cy - fabricTextHeight(1, numberFont, 1) / 2),
        text: String(number),
        width: Math.round(r * 1.5),
        fontFamily: ctx.font,
        fontSize: numberFont,
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
 * One award card: the frame, the rosette, the title (stamped so later runs
 * can avoid it) and its writing rows. Everything is set from the card's own
 * top, so no part of a card can land on another page.
 *
 * The card is drawn as one group, so a seller drags or deletes a whole award
 * in the editor instead of its frame, ribbons and lines one by one. Inside it
 * the rosette is one group, and each "Winner:" / "Why:" label is grouped with
 * the line it sits on, so a hand edit cannot part a label from its line.
 */
function drawCard(outer: DrawContext, award: FittedOaAward, top: number, height: number) {
  const { metrics, cardWidth, textOffset, textWidth, lineOffset, lineW, rows } = outer.plan
  const ctx: DrawContext = { ...outer, objects: [] }
  ctx.objects.push(
    buildRect(
      {
        left: ctx.left,
        top: Math.round(top),
        width: cardWidth,
        height,
        rx: metrics.radius,
        ry: metrics.radius,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      ctx.tag,
      'structure',
    ),
  )
  const badge: DrawContext = { ...ctx, objects: [] }
  drawBadge(badge, ctx.left + metrics.padX + metrics.badgeR, top + metrics.padY + metrics.badgeR, award.number)
  pushGroup(ctx.objects, badge.objects, ctx.tag)

  const textTop = top + metrics.padY
  // Pre-broken and set in a box exactly the measure it was broken to, so
  // Fabric has no reason to re-wrap it into a line the card did not reserve.
  ctx.objects.push({
    ...buildText(
      {
        left: ctx.left + textOffset,
        top: Math.round(textTop),
        text: award.lines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: AWARD_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: award.award, [OA_AWARD_KEY]: award.number },
  })

  const labels = rows === 2 ? [WINNER_LABEL, WHY_LABEL] : [WINNER_LABEL]
  labels.forEach((text, index) => {
    const rowTop = textTop + awardTextHeight(ctx.plan, award.lines.length) + index * metrics.rowH
    const row: DrawContext = { ...ctx, objects: [] }
    label(row, text, ctx.left + textOffset, rowBaseline(rowTop, metrics))
    rule(row, ctx.left + lineOffset, rowLineY(rowTop, metrics), lineW, index === 0 ? 'winner' : 'why')
    pushGroup(ctx.objects, row.objects, ctx.tag)
  })
  pushGroup(outer.objects, ctx.objects, ctx.tag)
}

/** Lay one page out in its body field, top down, exactly as the pagination measured it. */
export function drawOaPage(
  objects: StudioFabricObject[],
  options: { field: Box; plan: OaPlan; page: OaPage; font: string; tag: StudioTag },
): void {
  const { field, plan, page, font, tag } = options
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    left: Math.round(field.left + (field.width - plan.cardWidth) / 2),
  }
  for (const block of page.blocks) drawCard(ctx, block.award, field.top + block.top, block.height)
}
