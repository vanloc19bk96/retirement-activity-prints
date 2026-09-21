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

/** §5.1 — 7 mm minimum tick / scale circle (ceil so rounding never undershoots). */
export const MIN_TICK = Math.ceil(mm(7))
/** §5.1 — ≥12 mm row height. */
export const MIN_ROW_H = Math.ceil(mm(12))
/** §5.1 — Notes writing band ≥10 mm (row height covers this). */
export const MIN_NOTES_H = Math.ceil(mm(10))

export const MIN_ROWS = 5
/** Cap so requested rows still fit at ≥12 mm on 6×9 / letter with the page title on. */
export const MAX_ROWS = 14
export const HEADER_H = 30
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

/** Digits drawn inside Enjoyed circles (fill-in scale). */
export const ENJOYED_SCALE_MARKS = ['1', '2', '3'] as const

export type ColumnKey = 'date' | 'puzzle' | 'time' | 'done' | 'enjoyed' | 'notes'

export interface ColumnBand {
  key: ColumnKey
  label: string
  left: number
  width: number
  centre: number
}

export interface PuzzleLogLayout {
  rows: number
  rowH: number
  headerH: number
  tickSize: number
  circleDiameter: number
  columns: ColumnBand[]
  table: Box
}

export interface ColumnOptions {
  showTime: boolean
  showEnjoy: boolean
  wideNotes: boolean
}

function columnGap(): number {
  return Math.ceil(mm(1.5))
}

/** Header label must fit at COL_HEADER_SIZE — no per-column shrink. */
function headerLabelMinWidth(label: string): number {
  const oneLine = label.replace(/ /g, '\u00a0')
  return estimateTextBoxWidth(oneLine, COL_HEADER_SIZE, Number.POSITIVE_INFINITY) + 6
}

/**
 * §5.2 — reserve interactive minima first, then give Notes the largest
 * share of what remains so it stays the widest column.
 */
export function buildColumnBands(
  tableLeft: number,
  tableWidth: number,
  opts: ColumnOptions,
): ColumnBand[] {
  const gap = columnGap()
  const minDone = Math.max(MIN_TICK + gap * 2, headerLabelMinWidth('Done'))
  // 3×7 mm circles + side/inter gaps — and room for “Enjoyed?” header.
  const minEnjoy = opts.showEnjoy
    ? Math.max(3 * MIN_TICK + gap * 2, headerLabelMinWidth('Enjoyed?'))
    : 0
  const minTime = opts.showTime ? headerLabelMinWidth('Time taken') : 0
  const minDate = Math.max(Math.ceil(mm(14)), headerLabelMinWidth('Date'))
  // Keep “Puzzle / page” on one line even when Notes is wide.
  const minPuzzle = Math.max(Math.ceil(mm(18)), headerLabelMinWidth('Puzzle / page'))
  const minNotes = headerLabelMinWidth('Notes')

  let doneW = minDone
  let enjoyedW = minEnjoy
  let dateW = Math.max(minDate, Math.round(tableWidth * 0.11))
  const timeW = minTime

  // Equal Done/Enjoyed only when Notes still has room to show wide vs standard.
  const NOTES_VARIATION_SLACK = Math.ceil(mm(12))
  if (opts.showEnjoy) {
    const equal = Math.max(minDone, minEnjoy)
    const fixed = equal * 2 + minTime + minDate + minPuzzle + minNotes + NOTES_VARIATION_SLACK
    if (fixed <= tableWidth) {
      doneW = equal
      enjoyedW = equal
    }
  }

  let remaining = tableWidth - (doneW + enjoyedW + timeW + dateW)
  if (remaining < minPuzzle + minNotes + 4) {
    const overflow = minPuzzle + minNotes + 4 - remaining
    dateW -= Math.min(Math.max(0, overflow), dateW - minDate)
    remaining = tableWidth - (doneW + enjoyedW + timeW + dateW)
  }

  // Wide = Notes takes almost all surplus; standard = share more with Puzzle.
  let puzzleW = minPuzzle
  let notesW = Math.max(minNotes, remaining - puzzleW)
  if (!opts.wideNotes) {
    const maxOther = Math.max(dateW, timeW, doneW, enjoyedW)
    const notesFloor = Math.max(minNotes, maxOther + 1)
    // Standard keeps Notes widest but hands surplus to Puzzle / page.
    const targetNotes = Math.max(notesFloor, Math.round(remaining * 0.42))
    if (notesW > targetNotes) {
      const transfer = notesW - targetNotes
      notesW -= transfer
      puzzleW += transfer
    }
  }

  // Notes must be strictly widest (§5.2 / §5.7) — steal from puzzle, then date.
  const ensureNotesWidest = () => {
    const maxOther = () => Math.max(dateW, puzzleW, timeW, doneW, enjoyedW)
    while (notesW <= maxOther() && puzzleW > minPuzzle) {
      puzzleW -= 1
      notesW += 1
    }
    while (notesW <= maxOther() && dateW > minDate) {
      dateW -= 1
      notesW += 1
    }
  }
  ensureNotesWidest()

  // Integer reconcile — leftover to Notes.
  const used = dateW + puzzleW + timeW + doneW + enjoyedW + notesW
  notesW += tableWidth - used
  ensureNotesWidest()

  const keys: { key: ColumnKey; label: string; width: number }[] = [
    { key: 'date', label: 'Date', width: dateW },
    { key: 'puzzle', label: 'Puzzle / page', width: puzzleW },
  ]
  if (opts.showTime) keys.push({ key: 'time', label: 'Time taken', width: timeW })
  keys.push({ key: 'done', label: 'Done', width: doneW })
  if (opts.showEnjoy) keys.push({ key: 'enjoyed', label: 'Enjoyed?', width: enjoyedW })
  keys.push({ key: 'notes', label: 'Notes', width: notesW })

  let x = tableLeft
  return keys.map((k) => {
    const band: ColumnBand = {
      key: k.key,
      label: k.label,
      left: x,
      width: k.width,
      centre: x + k.width / 2,
    }
    x += k.width
    return band
  })
}

export function columnByKey(columns: ColumnBand[], key: ColumnKey): ColumnBand {
  const col = columns.find((c) => c.key === key)
  if (!col) throw new Error(`Missing column: ${key}`)
  return col
}

/** Field box the log is drawn into, once edge clearance is taken off `area`. */
function fieldMetrics(area: Box): { fieldTop: number; fieldHeight: number; available: number } {
  // Stroke half-width + clearance so bars/ticks stay inside the safe area.
  const edgePad = Math.ceil(
    Math.max(HEADER_RULE_STROKE, ROW_RULE_STROKE, TICK_STROKE) / 2,
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
 * The page title shortens `area`, so the schema max is resolved through this
 * same function — otherwise the form offers 14 rows and the log draws 13.
 */
export function fitPuzzleLogRows(area: Box, requestedRows: number): number {
  const { available } = fieldMetrics(area)
  let rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(requestedRows)))
  const minRowH = Math.max(MIN_ROW_H, MIN_TICK + Math.ceil(mm(3.5)), MIN_NOTES_H)
  let rowH = Math.floor(available / rows)
  // Drop below MIN_ROWS when the body is short (e.g. page title on).
  while (rows > 1 && rowH < minRowH) {
    rows -= 1
    rowH = Math.floor(available / rows)
  }
  return rows
}

/**
 * Clamp rows so fields stay ≥ minima. Table is optically centered in `area`
 * with edge clearance so stretch-to-fill never sits flush on the safe area.
 */
export function computePuzzleLogLayout(options: {
  area: Box
  requestedRows: number
  showTime: boolean
  showEnjoy: boolean
  wideNotes: boolean
}): PuzzleLogLayout {
  const { area, showTime, showEnjoy, wideNotes } = options
  const headerH = HEADER_H
  const tableW = Math.round(area.width)

  const { fieldTop, fieldHeight, available } = fieldMetrics(area)
  const rows = fitPuzzleLogRows(area, options.requestedRows)
  const rowH = Math.max(1, Math.floor(available / rows))
  const tableH = headerH + rows * rowH

  const relative = buildColumnBands(0, tableW, { showTime, showEnjoy, wideNotes })
  const top = Math.round(fieldTop + Math.max(0, (fieldHeight - tableH) / 2))
  const left = Math.round(area.left + (area.width - tableW) / 2)
  const columns = relative.map((c) => ({
    ...c,
    left: c.left + left,
    centre: c.centre + left,
  }))

  const doneCol = columnByKey(columns, 'done')
  const enjoyCol = showEnjoy ? columnByKey(columns, 'enjoyed') : null
  const tickSize = Math.max(
    MIN_TICK,
    Math.min(
      Math.floor(doneCol.width - columnGap() * 2),
      rowH - Math.ceil(mm(3.5)),
      28,
    ),
  )

  let circleDiameter = tickSize
  if (enjoyCol) {
    const fit = Math.floor((enjoyCol.width - columnGap() * 4) / 3)
    circleDiameter = Math.max(MIN_TICK, Math.min(tickSize, fit))
  }

  const table: Box = { left, top, width: tableW, height: tableH }

  return {
    rows,
    rowH,
    headerH,
    tickSize,
    circleDiameter,
    columns,
    table,
  }
}
