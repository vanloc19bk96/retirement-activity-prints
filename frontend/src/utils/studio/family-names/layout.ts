import { DPI } from '@/types/canvas-settings.types'
import { estimateTextBoxWidth, type Box } from '../studio-layout'

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

/** ≥12 mm row height for handwriting. */
export const MIN_ROW_H = Math.ceil(mm(12))

export const MIN_ROWS = 5
/** Cap so requested rows still fit at ≥12 mm on 6×9 / letter with title + instruction. */
export const MAX_ROWS = 12
export const HEADER_H = 30
/**
 * Extra inset inside `header.body` so the table never sits flush on the safe-area
 * edge (page title shrinks the body; stretch-to-fill would otherwise touch it).
 */
export const FIELD_EDGE_CLEARANCE = 8

export const HEADER_RULE_STROKE = Math.max(1, pt(1))
export const ROW_RULE_STROKE = Math.max(1, pt(0.75))
export const COL_RULE_STROKE = Math.max(1, pt(0.5))

export const COL_HEADER_SIZE = pt(9)

export type ColumnKey = 'label' | 'firstName' | 'lastName' | 'age'

export interface ColumnBand {
  key: ColumnKey
  label: string
  left: number
  width: number
  centre: number
}

export interface FamilyNamesLayout {
  rows: number
  rowH: number
  headerH: number
  columns: ColumnBand[]
  table: Box
}

const COLUMN_DEFS: { key: ColumnKey; label: string; weight: number }[] = [
  { key: 'label', label: 'Label', weight: 0.24 },
  { key: 'firstName', label: 'First name', weight: 0.3 },
  { key: 'lastName', label: 'Last name', weight: 0.3 },
  { key: 'age', label: 'Age', weight: 0.16 },
]

/** Header label must fit at COL_HEADER_SIZE — no per-column shrink. */
function headerLabelMinWidth(label: string): number {
  const oneLine = label.replace(/ /g, '\u00a0')
  return estimateTextBoxWidth(oneLine, COL_HEADER_SIZE, Number.POSITIVE_INFINITY) + 6
}

/**
 * Build four fill columns. Age stays narrow; name columns share the rest.
 * Leftover pixels go to Last name so integer widths still span the table.
 */
export function buildColumnBands(tableLeft: number, tableWidth: number): ColumnBand[] {
  const mins = COLUMN_DEFS.map((d) => headerLabelMinWidth(d.label))
  const minTotal = mins.reduce((sum, w) => sum + w, 0)
  if (minTotal >= tableWidth) {
    // Extremely narrow page — fall back to equal shares of the minima scale.
    const scale = tableWidth / minTotal
    let x = tableLeft
    let used = 0
    return COLUMN_DEFS.map((d, i) => {
      const isLast = i === COLUMN_DEFS.length - 1
      const width = isLast
        ? tableWidth - used
        : Math.max(1, Math.floor(mins[i]! * scale))
      used += width
      const band: ColumnBand = {
        key: d.key,
        label: d.label,
        left: x,
        width,
        centre: x + width / 2,
      }
      x += width
      return band
    })
  }

  let widths = COLUMN_DEFS.map((d, i) =>
    Math.max(mins[i]!, Math.round(tableWidth * d.weight)),
  )
  let used = widths.reduce((sum, w) => sum + w, 0)
  // Shrink name columns first if overweight; grow Last name if under.
  while (used > tableWidth) {
    let trimmed = false
    for (const i of [2, 1, 0, 3]) {
      if (widths[i]! > mins[i]!) {
        widths[i]! -= 1
        used -= 1
        trimmed = true
        if (used <= tableWidth) break
      }
    }
    if (!trimmed) break
  }
  widths[2]! += tableWidth - used

  let x = tableLeft
  return COLUMN_DEFS.map((d, i) => {
    const width = widths[i]!
    const band: ColumnBand = {
      key: d.key,
      label: d.label,
      left: x,
      width,
      centre: x + width / 2,
    }
    x += width
    return band
  })
}

/** Field box the table is drawn into, once edge clearance is taken off `area`. */
function fieldMetrics(area: Box): { fieldTop: number; fieldHeight: number; available: number } {
  const edgePad = Math.ceil(
    Math.max(HEADER_RULE_STROKE, ROW_RULE_STROKE, COL_RULE_STROKE) / 2,
  )
  const inset = edgePad + FIELD_EDGE_CLEARANCE
  const fieldHeight = Math.max(0, area.height - inset * 2)
  return {
    fieldTop: area.top + inset,
    fieldHeight,
    available: Math.max(1, Math.floor(fieldHeight - HEADER_H)),
  }
}

/**
 * Rows this area can actually print at ≥ MIN_ROW_H.
 *
 * The page title and instruction strip shorten `area`, so the schema max is
 * resolved through this same function — otherwise the form offers 12 rows and
 * the sheet quietly draws 11.
 */
export function fitFamilyNamesRows(area: Box, requestedRows: number): number {
  const { available } = fieldMetrics(area)
  let rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(requestedRows)))
  let rowH = Math.floor(available / rows)
  // Drop below MIN_ROWS when the body is short (e.g. page title on).
  while (rows > 1 && rowH < MIN_ROW_H) {
    rows -= 1
    rowH = Math.floor(available / rows)
  }
  return rows
}

/**
 * Clamp rows so fields stay ≥ minima. Table is optically centered in `area`
 * with edge clearance so stretch-to-fill never sits flush on the safe area.
 */
export function computeFamilyNamesLayout(options: {
  area: Box
  requestedRows: number
}): FamilyNamesLayout {
  const { area } = options
  const headerH = HEADER_H
  const tableW = Math.round(area.width)

  const { fieldTop, fieldHeight, available } = fieldMetrics(area)
  const rows = fitFamilyNamesRows(area, options.requestedRows)
  const rowH = Math.max(1, Math.floor(available / rows))
  const tableH = headerH + rows * rowH

  const relative = buildColumnBands(0, tableW)
  const top = Math.round(fieldTop + Math.max(0, (fieldHeight - tableH) / 2))
  const left = Math.round(area.left + (area.width - tableW) / 2)
  const columns = relative.map((c) => ({
    ...c,
    left: c.left + left,
    centre: c.centre + left,
  }))

  const table: Box = { left, top, width: tableW, height: tableH }

  return { rows, rowH, headerH, columns, table }
}
