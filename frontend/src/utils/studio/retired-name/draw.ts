import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import type { Box } from '../studio-layout'
import { FABRIC_FONT_SIZE_MULT, fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { RnEntry, RnExample, RnTable } from './content'
import {
  EXAMPLE_LINE_HEIGHT,
  HEADING_RULE,
  WRITE_IN_LABEL,
  blockHeight,
  boldSpec,
  exampleLines,
  type RnPagePlan,
  type RnSection,
} from './layout'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: RnPagePlan
  font: string
  tag: StudioTag
}

/** Row height and extra gaps once leftover height is shared out. */
export interface RnSpacing {
  padY: number
  rowH: number
  /** Added to every gap between blocks (tables, example, write-in). */
  extraGap: number
}

const gapCount = (plan: RnPagePlan) =>
  (plan.arrangement === 'stacked' ? 1 : 0) + (plan.example ? 1 : 0) + (plan.writeIn ? 1 : 0)

/**
 * Share leftover height out so a roomy page breathes instead of bunching at
 * the top: rows first (up to a quarter line each, so the tables stay tables),
 * then the gaps between blocks (up to a line each). Anything still left sits
 * under the last block.
 */
export function rnSpacing(plan: RnPagePlan, fieldHeight: number): RnSpacing {
  const { metrics } = plan
  const usable = Math.max(0, fieldHeight - metrics.bottomGuard)
  const slack = Math.max(0, usable - plan.height)
  const rows =
    plan.arrangement === 'side'
      ? Math.max(plan.letters.rows, plan.months.rows)
      : plan.letters.rows + plan.months.rows
  const extraPad = Math.floor(Math.min(slack / (2 * rows), metrics.font * 0.25))
  const rest = slack - 2 * extraPad * rows
  const gaps = gapCount(plan)
  const extraGap = gaps ? Math.floor(Math.min(rest / gaps, metrics.font)) : 0
  return { padY: metrics.padY + extraPad, rowH: metrics.rowH + 2 * extraPad, extraGap }
}

/** Height the drawn block takes at this spacing. */
export function spacedHeight(plan: RnPagePlan, spacing: RnSpacing): number {
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

/**
 * One lookup table: a bold heading over a heavy rule, then the entries filled
 * down each column in turn (A–I, J–R, S–Z), a hairline under every row so the
 * eye tracks from key to name. Each name is stamped so later runs can avoid
 * it. Returns the table's bottom.
 */
function drawSection(
  ctx: DrawContext,
  section: RnSection,
  entries: readonly RnEntry[],
  keyLabels: readonly string[],
  options: { left: number; top: number; spacing: RnSpacing; centerKeys: boolean },
): number {
  const { metrics } = ctx.plan
  const { left, top, spacing, centerKeys } = options
  const bold = boldSpec(ctx.font)

  ctx.objects.push(
    buildText(
      {
        left,
        top: top + Math.round((metrics.headH - fabricTextHeight(1, section.headFont)) / 2),
        text: section.heading,
        width: hugTextBoxWidth(section.heading, section.headFont, section.width, bold),
        fontFamily: ctx.font,
        fontSize: section.headFont,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  const ruleTop = Math.round(top + metrics.headH + metrics.headGap)
  rule(ctx, left, ruleTop, section.width, HEADING_RULE, STUDIO_INK)
  const rowsTop = ruleTop + HEADING_RULE

  entries.forEach((entry, index) => {
    const col = Math.floor(index / section.rows)
    const row = index % section.rows
    const cellLeft = Math.round(left + col * (section.colWidth + metrics.gutter))
    const textTop = Math.round(rowsTop + row * spacing.rowH + spacing.padY)
    ctx.objects.push(
      buildText(
        {
          left: cellLeft,
          top: textTop,
          text: keyLabels[index]!,
          width: section.keyW,
          fontFamily: ctx.font,
          fontSize: metrics.font,
          fontWeight: 700,
          lineHeight: 1,
          textAlign: centerKeys ? 'center' : 'left',
        },
        ctx.tag,
        'decoration',
      ),
    )
    ctx.objects.push({
      ...buildText(
        {
          left: cellLeft + section.keyW + metrics.keyGap,
          top: textTop,
          text: entry.name,
          width: Math.floor(section.valueW),
          fontFamily: ctx.font,
          fontSize: metrics.font,
          lineHeight: 1,
        },
        ctx.tag,
        'prompt',
      ),
      data: { [STUDIO_CONTENT_LABEL_KEY]: entry.name },
    })
  })

  for (let row = 1; row <= section.rows; row++) {
    rule(ctx, left, Math.round(rowsTop + row * spacing.rowH) - 1, section.width, 1, STUDIO_RULE_MEDIUM)
  }
  return rowsTop + section.rows * spacing.rowH
}

/** The worked example, framed: the reader sees the lookup done once. */
function drawExample(ctx: DrawContext, example: RnExample, left: number, top: number) {
  const { plan } = ctx
  const box = plan.example!
  const { metrics } = plan
  const lines = exampleLines(example, { metrics, example: box }, ctx.font)
  ctx.objects.push(
    buildRect(
      {
        left,
        top,
        width: plan.blockWidth,
        height: box.height,
        rx: 8,
        ry: 8,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      ctx.tag,
      'decoration',
    ),
  )

  // Fewer lines than reserved: centre what there is in the frame.
  const reserved = box.height - 2 * metrics.exPadY
  const used =
    fabricTextHeight(lines.lead.length, metrics.font, EXAMPLE_LINE_HEIGHT) +
    metrics.exLineGap +
    fabricTextHeight(lines.result.length, metrics.font, EXAMPLE_LINE_HEIGHT)
  const leadTop = Math.round(top + metrics.exPadY + (reserved - used) / 2)
  const centerX = left + plan.blockWidth / 2
  const parts = [
    { lines: lines.lead, top: leadTop, weight: 400 },
    {
      lines: lines.result,
      top: Math.round(
        leadTop +
          fabricTextHeight(lines.lead.length, metrics.font, EXAMPLE_LINE_HEIGHT) +
          metrics.exLineGap,
      ),
      weight: 700,
    },
  ]
  for (const part of parts) {
    ctx.objects.push(
      buildText(
        {
          left: centerX,
          top: part.top,
          text: part.lines.join('\n'),
          width: box.innerWidth,
          fontFamily: ctx.font,
          fontSize: metrics.font,
          fontWeight: part.weight,
          lineHeight: EXAMPLE_LINE_HEIGHT,
          textAlign: 'center',
          originX: 'center',
        },
        ctx.tag,
        'decoration',
      ),
    )
  }
}

/** "My retired name: ______________" across the block. */
function drawWriteIn(ctx: DrawContext, left: number, top: number) {
  const { metrics, blockWidth } = ctx.plan
  const labelW = hugTextBoxWidth(WRITE_IN_LABEL, metrics.font, blockWidth, boldSpec(ctx.font))
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: WRITE_IN_LABEL,
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
  const ruleLeft = left + labelW + Math.round(metrics.font * 0.5)
  const baseline = Math.round(top + metrics.font * FABRIC_FONT_SIZE_MULT) - 2
  rule(ctx, ruleLeft, baseline, left + blockWidth - ruleLeft, 1, STUDIO_INK)
}

/** Lay the tables, the example and the write-in line out in the body field. */
export function drawRnPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: RnPagePlan
    table: RnTable
    example: RnExample | null
    font: string
    tag: StudioTag
  },
): void {
  const { field, plan, table, example, font, tag } = options
  const ctx: DrawContext = { objects, plan, font, tag }
  const { metrics } = plan
  const spacing = rnSpacing(plan, field.height)
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = field.top + metrics.topPad

  const letters = (sectionTop: number) =>
    drawSection(ctx, plan.letters, table.letters, table.letters.map((entry) => entry.key), {
      left: left + plan.letters.left,
      top: sectionTop,
      spacing,
      centerKeys: true,
    })
  const months = (sectionTop: number) =>
    drawSection(ctx, plan.months, table.months, plan.monthLabels, {
      left: left + plan.months.left,
      top: sectionTop,
      spacing,
      centerKeys: false,
    })

  if (plan.arrangement === 'side') {
    top = Math.max(letters(top), months(top))
  } else {
    top = letters(top) + metrics.sectionGap + spacing.extraGap
    top = months(top)
  }

  if (plan.example && example) {
    top += metrics.exampleGap + spacing.extraGap
    drawExample(ctx, example, left, Math.round(top))
    top += plan.example.height
  }
  if (plan.writeIn) {
    top += metrics.writeInGap + spacing.extraGap
    drawWriteIn(ctx, left, Math.round(top))
  }
}
