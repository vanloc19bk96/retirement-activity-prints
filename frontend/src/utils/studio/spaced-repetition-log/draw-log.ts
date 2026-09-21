import type { StudioConfig, StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import {
  buildRect,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import {
  COL_HEADER_SIZE,
  HELPER_SIZE,
  HEADER_RULE_STROKE,
  ROW_RULE_STROKE,
  TICK_STROKE,
  columnLeft,
  computeLogTableLayout,
  type LogTableLayout,
} from './layout'
import {
  intervalColumnLabel,
  intervalColumnLabelShort,
  intervalHelperLabel,
  intervalHelperLabelShort,
  scheduleKind,
} from './schedule'

function pushRuleBar(
  objects: StudioFabricObject[],
  y: number,
  table: Box,
  stroke: number,
  fill: string,
  tag: StudioTag,
): void {
  objects.push(
    buildRect(
      {
        left: table.left,
        top: Math.round(y - stroke / 2),
        width: table.width,
        height: stroke,
        fill,
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
  )
}

function fitsAtSize(text: string, fontSize: number, maxWidth: number): boolean {
  const natural = text.length * fontSize * 0.55 + fontSize
  return natural <= maxWidth
}

function fitLabelSize(text: string, maxWidth: number, preferred: number): number {
  if (maxWidth <= 0) return 5
  // Exact fit — never larger than what the column can hold (avoids Fabric soft-wrap).
  const fitted = maxWidth / (text.length * 0.55 + 1)
  return Math.min(preferred, fitted)
}

function pushCenteredLabel(
  objects: StudioFabricObject[],
  cell: Box,
  text: string,
  fontSize: number,
  font: string,
  tag: StudioTag,
  topOffset = 0,
): void {
  const maxW = Math.max(4, cell.width - 4)
  const size = fitLabelSize(text, maxW, fontSize)
  // NBSP keeps multi-word headers on one line (no soft-wrap into the helper).
  const oneLine = text.replace(/ /g, '\u00a0')
  objects.push(
    buildText(
      {
        left: boxCenterX(cell),
        top: cell.top + topOffset,
        text: oneLine,
        width: estimateTextBoxWidth(oneLine, size, maxW),
        fontSize: size,
        fontFamily: font,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'decoration',
    ),
  )
}

function pickTickLabel(
  schedule: string,
  interval: number,
  index: number,
  tickW: number,
): string {
  const maxW = Math.max(4, tickW - 4)
  const long = intervalColumnLabel(schedule, interval, index)
  if (fitsAtSize(long, COL_HEADER_SIZE * 0.9, maxW)) return long
  return intervalColumnLabelShort(schedule, interval, index)
}

function pickHelperLabel(
  schedule: string,
  interval: number,
  tickW: number,
): string {
  const maxW = Math.max(4, tickW - 4)
  const long = intervalHelperLabel(schedule, interval)
  if (fitsAtSize(long, HELPER_SIZE, maxW)) return long
  return intervalHelperLabelShort(schedule, interval)
}

function pushColumnHeaders(
  objects: StudioFabricObject[],
  layout: LogTableLayout,
  intervals: number[],
  schedule: string,
  showHelper: boolean,
  font: string,
  tag: StudioTag,
): void {
  const { table, columns, headerH } = layout
  const headerBand: Box = {
    left: table.left,
    top: table.top,
    width: table.width,
    height: headerH,
  }

  const itemCell: Box = {
    left: columnLeft(table, columns, 'item'),
    top: headerBand.top,
    width: columns.itemW,
    height: headerH,
  }
  pushCenteredLabel(
    objects,
    itemCell,
    'What to remember',
    COL_HEADER_SIZE,
    font,
    tag,
    headerH * 0.28,
  )

  const dateCell: Box = {
    left: columnLeft(table, columns, 'date'),
    top: headerBand.top,
    width: columns.dateW,
    height: headerH,
  }
  pushCenteredLabel(objects, dateCell, 'Started', COL_HEADER_SIZE, font, tag, headerH * 0.28)

  for (let c = 0; c < intervals.length; c++) {
    const interval = intervals[c]!
    const cell: Box = {
      left: columnLeft(table, columns, c),
      top: headerBand.top,
      width: columns.tickW,
      height: headerH,
    }
    const label = pickTickLabel(schedule, interval, c, columns.tickW)
    const labelTop = showHelper ? headerH * 0.12 : headerH * 0.28
    pushCenteredLabel(objects, cell, label, COL_HEADER_SIZE, font, tag, labelTop)
    if (showHelper) {
      const hint = pickHelperLabel(schedule, interval, columns.tickW)
      pushCenteredLabel(objects, cell, hint, HELPER_SIZE, font, tag, headerH * 0.55)
    }
  }
}

function pushTickBoxes(
  objects: StudioFabricObject[],
  layout: LogTableLayout,
  tag: StudioTag,
): void {
  const { table, columns, rows, rowH, headerH, tickSize } = layout
  for (let r = 0; r < rows; r++) {
    const rowTop = table.top + headerH + r * rowH
    for (let c = 0; c < columns.tickCount; c++) {
      const cellLeft = columnLeft(table, columns, c)
      const left = cellLeft + Math.round((columns.tickW - tickSize) / 2)
      const top = rowTop + Math.round((rowH - tickSize) / 2)
      objects.push(
        buildRect(
          {
            left,
            top,
            width: tickSize,
            height: tickSize,
            fill: 'transparent',
            stroke: STUDIO_INK,
            strokeWidth: TICK_STROKE,
          },
          tag,
          'structure',
        ),
      )
    }
  }
}

function pushRowRules(
  objects: StudioFabricObject[],
  layout: LogTableLayout,
  tag: StudioTag,
): void {
  const { table, rows, rowH, headerH } = layout
  pushRuleBar(objects, table.top + headerH, table, HEADER_RULE_STROKE, STUDIO_INK, tag)
  for (let r = 1; r <= rows; r++) {
    const y = table.top + headerH + r * rowH
    // Last rule sits on the group bottom — inset so the full bar stays inside
    // (a centered bar would clip and look thinner than the others).
    const ruleY = r === rows ? y - ROW_RULE_STROKE / 2 : y
    pushRuleBar(objects, ruleY, table, ROW_RULE_STROKE, STUDIO_RULE_MEDIUM, tag)
  }
}

/** Draw the review log table; returns the grouped block for optional use. */
export function drawLogTable(
  objects: StudioFabricObject[],
  area: Box,
  config: StudioConfig,
  intervals: number[],
  font: string,
  tag: StudioTag,
): LogTableLayout {
  const showHelper = config.showDateHelper !== false
  const schedule = scheduleKind(config)
  const requestedRows = Number(config.rowsPerPage ?? 12)

  const layout = computeLogTableLayout({
    area,
    requestedRows,
    intervals,
    showHelper,
  })

  const parts: StudioFabricObject[] = []
  pushColumnHeaders(
    parts,
    layout,
    intervals,
    schedule,
    showHelper,
    font,
    tag,
  )
  pushRowRules(parts, layout, tag)
  pushTickBoxes(parts, layout, tag)

  // Nominal table box — not unionObjectBounds — so hairline strokes cannot
  // inflate the group past the safe area.
  objects.push(buildGroup(parts, layout.table, tag))
  return layout
}
