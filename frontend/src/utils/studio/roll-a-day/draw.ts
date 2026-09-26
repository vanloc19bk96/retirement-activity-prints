import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { buildCircle, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import type { Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { RD_FACES, RD_HEADINGS, type RdEntry, type RdSide, type RdTable } from './content'
import {
  ACTIVITY_LINE_HEIGHT,
  HEADING_RULE,
  WRITE_IN_LABEL,
  WRITE_IN_PARTS,
  blockHeight,
  boldSpec,
  breakActivity,
  plainSpec,
  rdRowLines,
  rowHeight,
  type RdPagePlan,
} from './layout'

/** Fabric `data` key on a die's outline: which face it shows. */
export const RD_DIE_FACE_KEY = 'rollADayFace'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: RdPagePlan
  font: string
  tag: StudioTag
}

/** Row height and extra gaps once leftover height is shared out. */
export interface RdSpacing {
  rowH: number
  /** Added to every gap between blocks (the two tables, the write-in). */
  extraGap: number
}

const gapCount = (plan: RdPagePlan) => 1 + (plan.writeIn ? 1 : 0)
const ROWS = 2 * RD_FACES.length

/**
 * Rows are drawn at the lines the tallest activity actually takes (never more
 * than the plan reserved), then leftover height is shared out so a roomy page
 * breathes instead of bunching at the top: rows first (up to a third of a line
 * of padding each, so the tables stay tables), then the gaps between blocks
 * (up to a line each). Anything still left sits under the last block.
 */
export function rdSpacing(plan: RdPagePlan, rowLines: number, fieldHeight: number): RdSpacing {
  const { metrics } = plan
  const baseRowH = rowHeight(Math.min(rowLines, plan.lines), metrics)
  const usable = Math.max(0, fieldHeight - metrics.bottomGuard)
  const slack = Math.max(0, usable - blockHeight(plan, baseRowH))
  const extraPad = Math.floor(Math.min(slack / (2 * ROWS), metrics.font * 0.33))
  const rest = slack - 2 * extraPad * ROWS
  const extraGap = Math.floor(Math.min(rest / gapCount(plan), metrics.font))
  return { rowH: baseRowH + 2 * extraPad, extraGap }
}

/** Height the drawn block takes at this spacing. */
export function spacedHeight(plan: RdPagePlan, spacing: RdSpacing): number {
  return blockHeight(plan, spacing.rowH) + gapCount(plan) * spacing.extraGap
}

function rule(ctx: DrawContext, left: number, top: number, width: number, height: number, fill: string) {
  ctx.objects.push(
    buildRect(
      { left, top, width, height, fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      'decoration',
    ),
  )
}

/** Pip centres on a unit face, as on a standard die. */
const LO = 0.26
const MID = 0.5
const HI = 0.74
const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[MID, MID]],
  2: [[LO, LO], [HI, HI]],
  3: [[LO, LO], [MID, MID], [HI, HI]],
  4: [[LO, LO], [HI, LO], [LO, HI], [HI, HI]],
  5: [[LO, LO], [HI, LO], [MID, MID], [LO, HI], [HI, HI]],
  6: [[LO, LO], [LO, MID], [LO, HI], [HI, LO], [HI, MID], [HI, HI]],
}

/** A die face in black ink: a rounded square and its pips, as on the die in hand. */
function drawDie(ctx: DrawContext, left: number, top: number, face: number) {
  const size = ctx.plan.metrics.die
  ctx.objects.push({
    ...buildRect(
      {
        left,
        top,
        width: size,
        height: size,
        rx: Math.round(size * 0.18),
        ry: Math.round(size * 0.18),
        fill: STUDIO_PAPER,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      ctx.tag,
      'decoration',
    ),
    data: { [RD_DIE_FACE_KEY]: face },
  })
  const radius = Math.max(2, size * 0.09)
  for (const [x, y] of PIPS[face] ?? []) {
    ctx.objects.push(
      buildCircle(
        { left: left + x * size, top: top + y * size, radius, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 },
        ctx.tag,
        'decoration',
      ),
    )
  }
}

/**
 * One table: a bold heading ("Roll #1: Morning") over a heavy rule, then six
 * rows — a die face, its activity beside it, a hairline under each so the eye
 * tracks from face to activity. Each activity is stamped so later runs can
 * avoid it. Returns the table's bottom.
 */
function drawSection(
  ctx: DrawContext,
  side: RdSide,
  entries: readonly RdEntry[],
  left: number,
  top: number,
  spacing: RdSpacing,
): number {
  const { plan, font } = ctx
  const { metrics } = plan
  const heading = RD_HEADINGS[side]
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: heading,
        width: hugTextBoxWidth(heading, metrics.headFont, plan.blockWidth, boldSpec(font)),
        fontFamily: font,
        fontSize: metrics.headFont,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  const ruleTop = Math.round(top + metrics.headH + metrics.headGap)
  rule(ctx, left, ruleTop, plan.blockWidth, HEADING_RULE, STUDIO_INK)
  const rowsTop = ruleTop + HEADING_RULE

  entries.forEach((entry, index) => {
    const rowTop = rowsTop + index * spacing.rowH
    drawDie(ctx, left, Math.round(rowTop + (spacing.rowH - metrics.die) / 2), entry.face)
    const lines = breakActivity(entry.activity, plan, font)
    const textH = fabricTextHeight(lines.length, metrics.font, ACTIVITY_LINE_HEIGHT)
    ctx.objects.push({
      ...buildText(
        {
          left: left + metrics.die + metrics.dieGap,
          top: Math.round(rowTop + (spacing.rowH - textH) / 2),
          text: lines.join('\n'),
          width: Math.floor(plan.textWidth),
          fontFamily: font,
          fontSize: metrics.font,
          lineHeight: ACTIVITY_LINE_HEIGHT,
        },
        ctx.tag,
        'prompt',
      ),
      data: { [STUDIO_CONTENT_LABEL_KEY]: entry.activity },
    })
    rule(ctx, left, Math.round(rowTop + spacing.rowH) - 1, plan.blockWidth, 1, STUDIO_RULE_MEDIUM)
  })
  return rowsTop + entries.length * spacing.rowH
}

/** "I rolled:  Morning ☐   Afternoon ☐" — a box for each number rolled. */
function drawWriteIn(ctx: DrawContext, left: number, top: number) {
  const { metrics } = ctx.plan
  const box = metrics.writeBox
  const textTop = Math.round(top + (box - fabricTextHeight(1, metrics.font)) / 2)
  const text = (x: number, value: string, bold: boolean) => {
    const width = hugTextBoxWidth(value, metrics.font, Infinity, bold ? boldSpec(ctx.font) : plainSpec(ctx.font))
    ctx.objects.push(
      buildText(
        {
          left: x,
          top: textTop,
          text: value,
          width,
          fontFamily: ctx.font,
          fontSize: metrics.font,
          fontWeight: bold ? 700 : 400,
          lineHeight: 1,
        },
        ctx.tag,
        'decoration',
      ),
    )
    return width
  }

  let x = left + text(left, WRITE_IN_LABEL, true) + 2 * metrics.writeLabelGap
  WRITE_IN_PARTS.forEach((part, index) => {
    x += text(x, part, false) + metrics.writeLabelGap
    ctx.objects.push(
      buildRect(
        { left: Math.round(x), top, width: box, height: box, rx: 4, ry: 4, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL },
        ctx.tag,
        'decoration',
      ),
    )
    x += box + (index < WRITE_IN_PARTS.length - 1 ? metrics.writeItemGap : 0)
  })
}

/** Lay the two tables and the write-in line out in the body field. */
export function drawRdPage(
  objects: StudioFabricObject[],
  options: { field: Box; plan: RdPagePlan; table: RdTable; font: string; tag: StudioTag },
): void {
  const { field, plan, table, font, tag } = options
  const ctx: DrawContext = { objects, plan, font, tag }
  const { metrics } = plan
  const spacing = rdSpacing(plan, rdRowLines(table, plan, font), field.height)
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)

  let top = field.top + metrics.topPad
  top = drawSection(ctx, 'morning', table.morning, left, top, spacing)
  top += metrics.sectionGap + spacing.extraGap
  top = drawSection(ctx, 'afternoon', table.afternoon, left, Math.round(top), spacing)
  if (plan.writeIn) {
    top += metrics.writeInGap + spacing.extraGap
    drawWriteIn(ctx, left, Math.round(top))
  }
}
