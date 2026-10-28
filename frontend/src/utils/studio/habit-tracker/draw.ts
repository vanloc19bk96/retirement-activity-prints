import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildGroup, buildPolygon, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { boxBottom, boxCenterX, boxCenterY, toNonBreakingSpaces, unionObjectBounds, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { HT_NOTES_LABEL, HT_WEEK_OF_LABEL } from './content'
import {
  GLASS_H,
  GLASS_W,
  UNIT_FONT,
  boldSpec,
  htPads,
  italicSpec,
  plainSpec,
  textHeight,
  type HtMedsPlan,
  type HtTrackerPlan,
  type HtTrackerRow,
} from './layout'

const { PAD_X, CELL_PAD, GLASS_GAP } = htPads
const TICK_STROKE = STUDIO_STROKE_HAIRLINE
const TICK_RADIUS = 3

export interface DrawContext {
  objects: StudioFabricObject[]
  tag: StudioTag
  font: string
}

/**
 * Draws into a fresh list and wraps what landed there in one group hugging it,
 * so a seller drags or deletes a whole row or the whole grid in the editor
 * instead of chasing its loose parts.
 */
function grouped(ctx: DrawContext, role: StudioRole, draw: (inner: DrawContext) => void) {
  const parts: StudioFabricObject[] = []
  draw({ ...ctx, objects: parts })
  if (parts.length === 1) {
    ctx.objects.push(parts[0]!)
    return
  }
  const bounds = unionObjectBounds(parts)
  if (bounds) ctx.objects.push(buildGroup(parts, bounds, ctx.tag, role))
}

/** A hairline, drawn as a filled strip so it prints crisp at any zoom. */
function hRule(ctx: DrawContext, left: number, top: number, width: number, fill: string) {
  ctx.objects.push(
    buildRect(
      { left: Math.round(left), top: Math.round(top), width: Math.max(1, Math.round(width)), height: 1, fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      'decoration',
    ),
  )
}

function vRule(ctx: DrawContext, left: number, top: number, height: number, fill: string) {
  ctx.objects.push(
    buildRect(
      { left: Math.round(left), top: Math.round(top), width: 1, height: Math.max(1, Math.round(height)), fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      'decoration',
    ),
  )
}

function frame(ctx: DrawContext, box: Box) {
  ctx.objects.push(buildRect({ ...box, stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_HAIRLINE }, ctx.tag, 'structure'))
}

function text(
  ctx: DrawContext,
  options: { left: number; top: number; text: string; size: number; spec?: 'plain' | 'bold' | 'italic'; fill?: string; center?: boolean },
) {
  const style = options.spec ?? 'plain'
  const spec = style === 'bold' ? boldSpec(ctx.font) : style === 'italic' ? italicSpec(ctx.font) : plainSpec(ctx.font)
  const lines = options.text.split('\n').map(toNonBreakingSpaces)
  const width = Math.max(...lines.map((line) => hugTextBoxWidth(line, options.size, Infinity, spec)))
  ctx.objects.push(
    buildText(
      {
        left: options.center ? options.left - width / 2 : options.left,
        top: options.top,
        text: lines.join('\n'),
        width,
        fontFamily: ctx.font,
        fontSize: options.size,
        fontWeight: style === 'bold' ? 700 : undefined,
        fontStyle: style === 'italic' ? 'italic' : undefined,
        fill: options.fill,
        lineHeight: 1,
        textAlign: options.center ? 'center' : 'left',
      },
      ctx.tag,
      'prompt',
    ),
  )
}

/** A write-in line with its label in front: "Week of ______". */
function labelledLine(
  ctx: DrawContext,
  options: { label: string; textLeft: number; textTop: number; size: number; lineLeft: number; lineRight: number; lineY: number },
) {
  grouped(ctx, 'structure', (line) => {
    text(line, { left: options.textLeft, top: options.textTop, text: options.label, size: options.size })
    hRule(line, options.lineLeft, options.lineY, options.lineRight - options.lineLeft, STUDIO_RULE)
  })
}

function tickBox(ctx: DrawContext, cell: Box, size: number) {
  ctx.objects.push(
    buildRect(
      {
        left: Math.round(boxCenterX(cell) - size / 2),
        top: Math.round(boxCenterY(cell) - size / 2),
        width: size,
        height: size,
        rx: TICK_RADIUS,
        ry: TICK_RADIUS,
        stroke: STUDIO_INK,
        strokeWidth: TICK_STROKE,
      },
      ctx.tag,
      'structure',
    ),
  )
}

/** A tumbler outline: wider at the rim, with a fill line a third of the way down. */
function glass(ctx: DrawContext, left: number, top: number) {
  const w = GLASS_W
  const h = GLASS_H
  ctx.objects.push(
    buildPolygon(
      {
        left,
        top,
        points: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w * 0.82, y: h },
          { x: w * 0.18, y: h },
        ],
        stroke: STUDIO_INK,
        strokeWidth: 1.2,
        strokeLineJoin: 'round',
      },
      ctx.tag,
      'structure',
    ),
  )
}

function glasses(ctx: DrawContext, cell: Box, count: number, cols: number) {
  const rows = Math.ceil(count / cols)
  const gridH = rows * GLASS_H + (rows - 1) * GLASS_GAP
  const top = boxCenterY(cell) - gridH / 2
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, count - r * cols)
    const rowW = inRow * GLASS_W + (inRow - 1) * GLASS_GAP
    const left = boxCenterX(cell) - rowW / 2
    for (let c = 0; c < inRow; c++) {
      glass(ctx, Math.round(left + c * (GLASS_W + GLASS_GAP)), Math.round(top + r * (GLASS_H + GLASS_GAP)))
    }
  }
}

function drawRow(ctx: DrawContext, plan: HtTrackerPlan, row: HtTrackerRow) {
  grouped(ctx, 'structure', (inner) => {
    const labelH = textHeight(row.lines.length, plan.labelFont)
    text(inner, {
      left: plan.table.left + PAD_X,
      top: Math.round(row.top + (row.height - labelH) / 2),
      text: row.lines.join('\n'),
      size: plan.labelFont,
    })
    for (const cell of row.cells) {
      if (row.row.kind === 'check') tickBox(inner, cell, plan.tick)
      else if (row.row.kind === 'glasses') glasses(inner, cell, plan.glasses, plan.glassCols)
      else if (row.row.unit) {
        text(inner, {
          left: boxCenterX(cell),
          top: Math.round(boxBottom(cell) - CELL_PAD - UNIT_FONT),
          text: row.row.unit,
          size: UNIT_FONT,
          fill: STUDIO_INK_MUTED,
          center: true,
        })
      }
    }
  })
}

/** One weekly page under its header: "Week of", the habits table, then notes. */
export function drawTracker(ctx: DrawContext, plan: HtTrackerPlan) {
  const { table, week } = plan
  labelledLine(ctx, {
    label: HT_WEEK_OF_LABEL,
    textLeft: week.left,
    textTop: week.top,
    size: plan.labelFont,
    lineLeft: week.lineLeft,
    lineRight: week.lineRight,
    lineY: week.lineY,
  })

  grouped(ctx, 'structure', (grid) => {
    frame(grid, table)
    const headBottom = table.top + plan.headHeight
    hRule(grid, table.left, headBottom, table.width, STUDIO_RULE)
    for (const row of plan.rows.slice(1)) hRule(grid, table.left, row.top, table.width, STUDIO_RULE_MEDIUM)
    vRule(grid, table.left + plan.labelWidth, table.top, table.height, STUDIO_RULE)
    for (let d = 1; d < 7; d++) {
      vRule(grid, table.left + plan.labelWidth + d * plan.dayWidth, table.top, table.height, STUDIO_RULE_MEDIUM)
    }
    plan.dayLabels.forEach((day, d) => {
      text(grid, {
        left: table.left + plan.labelWidth + (d + 0.5) * plan.dayWidth,
        top: Math.round(table.top + (plan.headHeight - plan.headFont) / 2),
        text: day,
        size: plan.headFont,
        spec: 'bold',
        center: true,
      })
    })
  })

  for (const row of plan.rows) drawRow(ctx, plan, row)

  if (plan.notes) {
    const { notes } = plan
    grouped(ctx, 'structure', (inner) => {
      text(inner, { left: notes.left, top: notes.top, text: HT_NOTES_LABEL, size: plan.labelFont, spec: 'italic' })
      for (const y of notes.lines) hRule(inner, notes.left, y, notes.width, STUDIO_RULE_MEDIUM)
    })
  }
}

/** The medicines list under its header: doctor and pharmacy lines, then the blank table. */
export function drawMeds(ctx: DrawContext, plan: HtMedsPlan) {
  for (const line of plan.contacts) {
    labelledLine(ctx, {
      label: line.label,
      textLeft: line.textLeft,
      textTop: line.top,
      size: plan.labelFont,
      lineLeft: line.lineLeft,
      lineRight: line.lineRight,
      lineY: line.lineY,
    })
  }

  const { table } = plan
  grouped(ctx, 'structure', (grid) => {
    frame(grid, table)
    const headBottom = table.top + plan.headHeight
    hRule(grid, table.left, headBottom, table.width, STUDIO_RULE)
    for (const y of plan.rowEdges.slice(1, -1)) hRule(grid, table.left, y, table.width, STUDIO_RULE_MEDIUM)
    for (const column of plan.columns.slice(1)) vRule(grid, column.left, table.top, table.height, STUDIO_RULE_MEDIUM)
    for (const column of plan.columns) {
      const h = textHeight(column.lines.length, plan.headFont)
      text(grid, {
        left: column.left + PAD_X,
        top: Math.round(table.top + (plan.headHeight - h) / 2),
        text: column.lines.join('\n'),
        size: plan.headFont,
        spec: 'bold',
      })
    }
  })
}
