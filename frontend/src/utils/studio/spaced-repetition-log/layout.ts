import { DPI } from '@/types/canvas-settings.types'
import type { Box } from '../studio-layout'

const MM_PER_INCH = 25.4
const PT_PER_INCH = 72

/** Millimetres → editor canvas px (logical DPI). */
export function mm(value: number): number {
  return (value * DPI) / MM_PER_INCH
}

/** Print points → editor canvas px. */
export function pt(value: number): number {
  return (value * DPI) / PT_PER_INCH
}

/** §6.1 — 7 mm minimum tick box (ceil so rounding never undershoots). */
export const MIN_TICK = Math.ceil(mm(7))
/** §6.1 — ≥3 mm between boxes when columns are wide enough. */
export const TICK_GAP = Math.ceil(mm(3))
/** §6.2 — Item column share of table width (shrinks when many tick cols). */
export const ITEM_SHARE = 0.47
export const DATE_SHARE = 0.12
/** Minimum tick column: box + side pad so strokes never spill into the next cell. */
export const MIN_TICK_COL = MIN_TICK + 4

export const MIN_ROWS = 6
/** Matches configSchema max — leave room under Page title on common trim sizes. */
export const MAX_ROWS = 14
export const HEADER_H_PLAIN = 30
export const HEADER_H_HELPER = 44
/**
 * Extra inset inside `header.body` so the log never sits flush on the safe-area
 * edge (page title shrinks the body; stretch-to-fill would otherwise touch it).
 */
export const FIELD_EDGE_CLEARANCE = 8

/** Tick stroke ~0.9 pt; header rule 1 pt; row rules ~0.75 pt (screen-visible). */
export const TICK_STROKE = Math.max(1, pt(0.9))
export const HEADER_RULE_STROKE = Math.max(1, pt(1))
export const ROW_RULE_STROKE = Math.max(1, pt(0.75))

export const COL_HEADER_SIZE = pt(9)
export const HELPER_SIZE = pt(7.5)

export interface ColumnWidths {
  itemW: number
  dateW: number
  tickW: number
  tickCount: number
}

export interface LogTableLayout {
  rows: number
  rowH: number
  headerH: number
  tickSize: number
  columns: ColumnWidths
  table: Box
}

/**
 * Prefer a readable Item share, but always reserve enough for tick columns
 * first — otherwise MIN_TICK boxes overflow into neighbours.
 */
function columnWidths(tableWidth: number, tickCount: number): ColumnWidths {
  const minDate = 32
  const minItem = Math.min(Math.round(tableWidth * 0.28), Math.round(tableWidth * 0.4))
  const minTickArea = tickCount > 0 ? MIN_TICK_COL * tickCount : 0

  let itemW = Math.round(tableWidth * ITEM_SHARE)
  let dateW = Math.round(tableWidth * DATE_SHARE)

  const steal = (from: number, floor: number, need: number): [number, number] => {
    const take = Math.min(Math.max(0, from - floor), need)
    return [from - take, need - take]
  }

  let tickArea = Math.max(0, tableWidth - itemW - dateW)
  if (tickCount > 0 && tickArea < minTickArea) {
    let need = minTickArea - tickArea
    ;[itemW, need] = steal(itemW, minItem, need)
    ;[dateW, need] = steal(dateW, minDate, need)
    if (need > 0) {
      ;[itemW, need] = steal(itemW, 72, need)
      ;[dateW, need] = steal(dateW, 28, need)
    }
    tickArea = Math.max(0, tableWidth - itemW - dateW)
  }

  if (tickCount > 0 && tickArea < minTickArea) {
    itemW = 72
    dateW = 28
    if (itemW + dateW >= tableWidth) {
      itemW = Math.max(40, tableWidth - dateW - tickCount)
    }
    tickArea = Math.max(0, tableWidth - itemW - dateW)
  }

  const tickW = tickCount > 0 ? Math.floor(tickArea / tickCount) : 0
  itemW += tickArea - tickW * tickCount
  return { itemW, dateW, tickW, tickCount }
}

/** Field box the log is drawn into, once edge clearance is taken off `area`. */
function fieldMetrics(
  area: Box,
  headerH: number,
): { fieldTop: number; fieldHeight: number; available: number } {
  // Stroke half-width + clearance so bars/ticks stay inside the safe area.
  const edgePad = Math.ceil(
    Math.max(HEADER_RULE_STROKE, ROW_RULE_STROKE, TICK_STROKE) / 2,
  )
  const inset = edgePad + FIELD_EDGE_CLEARANCE
  const fieldHeight = Math.max(0, area.height - inset * 2)
  return {
    fieldTop: area.top + inset,
    fieldHeight,
    available: Math.max(1, Math.floor(fieldHeight - headerH)),
  }
}

/**
 * Rows this area can actually print with tick boxes ≥ MIN_TICK.
 *
 * The page title shortens `area`, so the schema max is resolved through this
 * same function — otherwise the form offers 14 rows and the log draws 13.
 */
export function fitLogTableRows(options: {
  area: Box
  requestedRows: number
  showHelper: boolean
}): number {
  const headerH = options.showHelper ? HEADER_H_HELPER : HEADER_H_PLAIN
  const { available } = fieldMetrics(options.area, headerH)
  let rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(options.requestedRows)))
  const minRowH = MIN_TICK + Math.ceil(mm(3.5))
  let rowH = Math.floor(available / rows)
  // Drop below MIN_ROWS when the body is short (e.g. page title on) so ticks
  // never spill past the safe area.
  while (rows > 1 && rowH < minRowH) {
    rows -= 1
    rowH = Math.floor(available / rows)
  }
  return rows
}

/**
 * Clamp rows so tick boxes stay ≥ MIN_TICK. Returns geometry centered
 * optically in `area` with slightly more space below than above (§6.5).
 * Row height and tick columns are integer so every page matches.
 */
export function computeLogTableLayout(options: {
  area: Box
  requestedRows: number
  intervals: number[]
  showHelper: boolean
}): LogTableLayout {
  const { area, intervals, showHelper } = options
  const headerH = showHelper ? HEADER_H_HELPER : HEADER_H_PLAIN
  const tableW = Math.round(area.width)
  const columns = columnWidths(tableW, intervals.length)

  const { fieldTop, fieldHeight, available } = fieldMetrics(area, headerH)
  const rows = fitLogTableRows(options)
  // Re-fit so rowH * rows uses the inset band (equal integer rows).
  const rowH = Math.max(1, Math.floor(available / rows))
  const tableH = headerH + rows * rowH

  const tickPad = Math.ceil(mm(3.5))
  // Never draw larger than the column — forced MIN_TICK in a skinny col
  // overflows into neighbours (double-border “slivers”).
  const colFit = Math.max(1, columns.tickW - 2)
  const rowFit = Math.max(1, rowH - tickPad)
  const maxFit = Math.min(colFit, rowFit)
  const tickSize =
    maxFit >= MIN_TICK
      ? Math.min(maxFit, Math.max(MIN_TICK, columns.tickW - TICK_GAP))
      : maxFit

  // Bias slightly upward so there is a touch more space below (§6.5).
  const top = Math.round(fieldTop + Math.max(0, (fieldHeight - tableH) * 0.38))
  const left = Math.round(area.left + (area.width - tableW) / 2)
  const table: Box = {
    left,
    top,
    width: tableW,
    height: tableH,
  }

  return {
    rows,
    rowH,
    headerH,
    tickSize,
    columns,
    table,
  }
}

export function columnLeft(
  table: Box,
  columns: ColumnWidths,
  key: 'item' | 'date' | number,
): number {
  if (key === 'item') return table.left
  if (key === 'date') return table.left + columns.itemW
  return table.left + columns.itemW + columns.dateW + key * columns.tickW
}
