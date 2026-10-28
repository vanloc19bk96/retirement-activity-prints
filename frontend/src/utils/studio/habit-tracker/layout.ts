import type { StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_INSTRUCTION_SIZE } from '@/constants/studio.constants'
import { boxBottom, contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  HT_MEDS_COLUMNS,
  HT_PAGE_TOO_SMALL_MESSAGE,
  HT_TOO_MANY_HABITS_MESSAGE,
  HT_WEEK_OF_LABEL,
  htDays,
  type HtRow,
  type HtWeekStart,
} from './content'

/**
 * Everything a Daily Habits page decides on the seller's behalf.
 *
 * A weekly page is a table: one row per habit, one column per day, a large
 * box to tick in every cell (or a glass per glass of water, or room to write
 * the hours slept). Rows are sized for an older hand and eye: large-print
 * labels, ticks no smaller than a fingertip mark, and the table stretched a
 * little so it fills the page, with what is left becoming ruled notes.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
const inch = (value: number) => Math.round(DPI * value)

/** Row labels: large print, down to 12 pt only when a long word needs it. */
export const LABEL_FONTS = [ptToPx(14), ptToPx(13), ptToPx(12)] as const
export const LABEL_FONT_MIN = LABEL_FONTS[LABEL_FONTS.length - 1]!
const LABEL_MAX_LINES = 3
/** Day names and column headings. */
export const HEAD_FONT = ptToPx(13)
const HEAD_FONT_MIN = ptToPx(11)
/** The small unit under a write-in cell ("hrs"). */
export const UNIT_FONT = ptToPx(10)

/** A tick box: big enough to hit with a shaky pen, never smaller than the minimum. */
const TICK = inch(0.24)
export const TICK_MIN = inch(0.18)
/** A glass of water to fill in. */
export const GLASS_W = inch(0.12)
export const GLASS_H = inch(0.17)
const GLASS_GAP = 3
/** Glasses may run closer to the cell edge than a tick box, so two fit side by side on a 5 x 8. */
const GLASS_PAD = 2

export const ROW_MIN = inch(0.4)
const WRITE_ROW_MIN = inch(0.5)
/** Rows grow by at most this much; the rest of the page becomes notes. */
const ROW_GROW_MAX = inch(0.2)

const PAD_X = 8
const PAD_Y = 6
const CELL_PAD = 4

const LABEL_SHARE = 0.33
const LABEL_MIN = inch(1.3)
const LABEL_MAX = inch(1.9)
/** Share of a cell's text room a label wraps at. */
const LABEL_WRAP = 0.92

/** "Week of ______" above the table. */
const WEEK_STRIP = inch(0.5)
const WEEK_LINE_MIN = inch(1.6)

export const NOTES_PITCH = inch(0.38)
const NOTES_GAP = inch(0.18)
const NOTES_MIN_LINES = 2

/** Medicines list: write-in rows tall enough for a name in pen. */
export const MEDS_ROW_MIN = inch(0.42)
export const MEDS_ROWS_MIN = 5
const CONTACT_ROW = inch(0.45)
const CONTACT_GAP = inch(0.15)
const CONTACT_LINE_MIN = inch(0.9)

/** Frame stroke is centred on its edge; keep the outer half inside the column. */
const STROKE_ROOM = 1
/** Where a letter's baseline sits below the top of its line box, so text sits on its write-in line. */
const BASELINE = 0.95

export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })
export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

export const textHeight = (lines: number, size: number) => fabricTextHeight(lines, size, 1)

/** The safe printable column every page lays out inside. */
export function htContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The how-to line, wrapped by real glyph widths so the header reserves exactly what it prints. */
export function wrapInstruction(text: string, width: number, font: string): string {
  if (!text) return ''
  const spec = plainSpec(font)
  return wrapTextToWidth(text, STUDIO_INSTRUCTION_SIZE, wrapSafeWidth(width, spec), spec).join('\n')
}

/** What heads a page: its title (blank for none) and its wrapped how-to line (blank for none). */
export interface HtPageHead {
  title: string
  instruction: string
}

/** The body under a page's header, inside the safe column. */
function bodyBox(page: StudioConfigLayoutContext, head: HtPageHead): Box {
  const content = htContentBox(page)
  const header = measureHeaderHeight({ title: head.title }, head.instruction, content.width)
  const top = content.top + header
  return { ...content, top, height: content.top + content.height - top - STROKE_ROOM }
}

/**
 * Wrap a label into at most `maxLines` lines without splitting a word, or
 * null when it cannot be done at this size.
 */
function wrapLabel(text: string, size: number, width: number, spec: FontSpec, maxLines: number): string[] | null {
  // Lines are drawn as their own hugging textboxes, so what matters is that
  // each one's box stays inside the cell; wrapping a little short leaves room
  // for the box's own slack.
  const wrap = (measure: number) => wrapTextToWidth(text, size, measure, spec)
  const full = Math.floor(width * LABEL_WRAP)
  let lines = wrap(full)
  // A word too long for the measure comes back split across lines; never print that.
  const whole = (candidate: string[]) => candidate.join(' ') === text.split(/\s+/).join(' ')
  if (!whole(lines) || lines.length > maxLines) return null
  if (lines.length > 1) {
    // Balance: the narrowest measure that keeps the line count, so a label
    // never ends on a lone word ("When I take / it").
    let lo = full / 2
    let hi = full
    while (hi - lo > 2) {
      const measure = (lo + hi) / 2
      const attempt = wrap(measure)
      if (attempt.length === lines.length && whole(attempt)) hi = measure
      else lo = measure
    }
    lines = wrap(hi)
  }
  if (lines.some((line) => hugTextBoxWidth(line, size, Infinity, spec) > width)) return null
  return lines
}

export type HtPlanResult<T> = { ok: true; plan: T } | { ok: false; message: string }

/* ------------------------------------------------------------ weekly page */

export interface HtTrackerRow {
  row: HtRow
  top: number
  height: number
  lines: string[]
  /** One cell per day, left to right. */
  cells: Box[]
}

export interface HtTrackerPlan {
  table: Box
  labelWidth: number
  dayWidth: number
  headHeight: number
  dayLabels: string[]
  labelFont: number
  headFont: number
  tick: number
  /** Glasses per row inside one day cell. */
  glassCols: number
  glasses: number
  rows: HtTrackerRow[]
  week: { left: number; top: number; lineLeft: number; lineRight: number; lineY: number }
  notes: { top: number; lines: number[]; left: number; width: number } | null
}

const glassRowsFor = (glasses: number, cols: number) => Math.ceil(glasses / cols)

/** Height a row needs before it is stretched. */
function rowNeed(row: HtRow, lines: number, labelFont: number, tick: number, glasses: number, glassCols: number) {
  const label = textHeight(lines, labelFont) + 2 * PAD_Y
  if (row.kind === 'glasses') {
    const n = glassRowsFor(glasses, glassCols)
    return Math.max(ROW_MIN, label, n * GLASS_H + (n - 1) * GLASS_GAP + 2 * PAD_Y)
  }
  if (row.kind === 'write') return Math.max(WRITE_ROW_MIN, label)
  return Math.max(ROW_MIN, label, tick + 2 * PAD_Y)
}

/** Day names in full when "Wed" fits its column, otherwise single letters. */
function dayLabelsFor(start: HtWeekStart, dayWidth: number, font: string): string[] {
  const days = htDays(start)
  const short = days.map((d) => d.slice(0, 3))
  const fits = short.every((d) => hugTextBoxWidth(d, HEAD_FONT, Infinity, boldSpec(font)) <= dayWidth - 2 * CELL_PAD)
  return fits ? short : days.map((d) => d[0]!)
}

/** One weekly page, laid out. Fails plainly when the rows will not fit the trim. */
export function planTracker(
  page: StudioConfigLayoutContext,
  options: {
    head: HtPageHead
    rows: readonly HtRow[]
    glasses: number
    weekStart: HtWeekStart
    font: string
  },
): HtPlanResult<HtTrackerPlan> {
  const { head, rows, glasses, weekStart, font } = options
  const body = bodyBox(page, head)
  const labelWidth = Math.round(Math.min(LABEL_MAX, Math.max(LABEL_MIN, body.width * LABEL_SHARE)))
  const dayWidth = Math.floor((body.width - labelWidth - 2 * STROKE_ROOM) / 7)
  const tick = Math.min(TICK, dayWidth - 2 * CELL_PAD)
  const glassCols = Math.floor((dayWidth - 2 * GLASS_PAD + GLASS_GAP) / (GLASS_W + GLASS_GAP))
  if (tick < TICK_MIN || glassCols < 1) return { ok: false, message: HT_PAGE_TOO_SMALL_MESSAGE }

  // The largest label size every row can take without splitting a word.
  const labelRoom = labelWidth - 2 * PAD_X
  let labelFont = 0
  let wrapped: string[][] = []
  for (const size of LABEL_FONTS) {
    const attempt = rows.map((r) => wrapLabel(r.label, size, labelRoom, plainSpec(font), LABEL_MAX_LINES))
    if (attempt.every((lines): lines is string[] => lines !== null)) {
      labelFont = size
      wrapped = attempt
      break
    }
  }
  if (!labelFont) return { ok: false, message: HT_PAGE_TOO_SMALL_MESSAGE }

  const tableWidth = labelWidth + 7 * dayWidth
  const left = Math.round(body.left + (body.width - tableWidth) / 2)
  const weekTop = body.top
  const tableTop = weekTop + WEEK_STRIP
  const headHeight = Math.ceil(textHeight(1, HEAD_FONT) + 2 * PAD_Y)
  const needs = rows.map((r, i) => rowNeed(r, wrapped[i]!.length, labelFont, tick, glasses, glassCols))
  const tableNeed = headHeight + needs.reduce((sum, h) => sum + h, 0)
  const extra = boxBottom(body) - tableTop - tableNeed
  if (rows.length === 0 || extra < 0) return { ok: false, message: HT_TOO_MANY_HABITS_MESSAGE }

  // Stretch the rows a little; a roomy remainder becomes notes, a thin one goes to the rows.
  const notesLabel = textHeight(1, labelFont)
  const notesMin = NOTES_GAP + notesLabel + NOTES_MIN_LINES * NOTES_PITCH
  const withNotes = extra >= notesMin
  const grow = withNotes
    ? Math.min(ROW_GROW_MAX, Math.floor((extra - notesMin) / rows.length))
    : Math.floor(extra / rows.length)

  const plannedRows: HtTrackerRow[] = []
  let y = tableTop + headHeight
  rows.forEach((row, i) => {
    const height = needs[i]! + grow
    const cells = Array.from({ length: 7 }, (_, d) => ({
      left: left + labelWidth + d * dayWidth,
      top: y,
      width: dayWidth,
      height,
    }))
    plannedRows.push({ row, top: y, height, lines: wrapped[i]!, cells })
    y += height
  })
  const table: Box = { left, top: tableTop, width: tableWidth, height: y - tableTop }

  let notes: HtTrackerPlan['notes'] = null
  if (withNotes) {
    const top = y + NOTES_GAP
    const regionTop = top + notesLabel
    const count = Math.floor((boxBottom(body) - regionTop) / NOTES_PITCH)
    const lines = Array.from({ length: count }, (_, k) => Math.round(regionTop + (k + 1) * NOTES_PITCH))
    notes = { top, lines, left, width: tableWidth }
  }

  const weekLabelWidth = Math.ceil(hugTextBoxWidth(HT_WEEK_OF_LABEL, labelFont, Infinity, plainSpec(font)))
  const lineLeft = left + weekLabelWidth + PAD_X
  const lineRight = Math.max(lineLeft + WEEK_LINE_MIN, left + Math.round(tableWidth * 0.62))
  const weekLineY = Math.round(weekTop + WEEK_STRIP - 2 * PAD_Y)
  return {
    ok: true,
    plan: {
      table,
      labelWidth,
      dayWidth,
      headHeight,
      dayLabels: dayLabelsFor(weekStart, dayWidth, font),
      labelFont,
      headFont: HEAD_FONT,
      tick,
      glassCols: Math.min(glassCols, glasses),
      glasses,
      rows: plannedRows,
      week: {
        left,
        top: Math.round(weekLineY - labelFont * BASELINE),
        lineLeft,
        lineRight: Math.min(lineRight, left + tableWidth),
        lineY: weekLineY,
      },
      notes,
    },
  }
}

/* ------------------------------------------------------- medicines page */

/** A label with a line to write on after it. */
export interface HtWriteLine {
  label: string
  /** Top of the label text, set so it sits on the line. */
  top: number
  textLeft: number
  lineLeft: number
  lineRight: number
  lineY: number
}

export interface HtMedsPlan {
  table: Box
  columns: { left: number; width: number; lines: string[] }[]
  headFont: number
  headHeight: number
  /** Top of every write-in row, then the table's bottom. */
  rowEdges: number[]
  labelFont: number
  /** Write-in lines above the table: "Doctor ____", "Phone ____"… */
  contacts: HtWriteLine[]
}

/** The medicines and supplements list: who to call, then a blank table filling the page. */
export function planMeds(
  page: StudioConfigLayoutContext,
  options: { head: HtPageHead; contacts: readonly string[]; phoneLabel: string; font: string },
): HtPlanResult<HtMedsPlan> {
  const { head, contacts, phoneLabel, font } = options
  const body = bodyBox(page, head)
  const left = body.left + STROKE_ROOM
  const width = body.width - 2 * STROKE_ROOM
  const labelFont = LABEL_FONTS[0]
  const spec = plainSpec(font)

  // Name and phone share a row where both lines stay long enough to write on;
  // on a narrow trim the phone line goes underneath instead.
  const widthOf = (label: string) => Math.ceil(hugTextBoxWidth(label, labelFont, Infinity, spec))
  const writeLine = (label: string, rowTop: number, from: number, to: number): HtWriteLine => {
    const lineY = Math.round(rowTop + CONTACT_ROW - PAD_Y)
    return {
      label,
      top: Math.round(lineY - labelFont * BASELINE),
      textLeft: from,
      lineLeft: from + widthOf(label) + PAD_X,
      lineRight: to,
      lineY,
    }
  }
  const roomy = (line: HtWriteLine) => line.lineRight - line.lineLeft >= CONTACT_LINE_MIN
  const split = left + Math.round(width * 0.56)
  const plannedContacts: HtWriteLine[] = []
  let y = body.top
  for (const label of contacts) {
    const pair = [writeLine(label, y, left, split - 2 * PAD_X), writeLine(phoneLabel, y, split, left + width)]
    if (pair.every(roomy)) {
      plannedContacts.push(...pair)
      y += CONTACT_ROW
      continue
    }
    const stacked = [writeLine(label, y, left, left + width), writeLine(phoneLabel, y + CONTACT_ROW, left, left + width)]
    if (!stacked.every(roomy)) return { ok: false, message: HT_PAGE_TOO_SMALL_MESSAGE }
    plannedContacts.push(...stacked)
    y += 2 * CONTACT_ROW
  }
  const tableTop = y + CONTACT_GAP

  // Column headings: two lines at most, shrinking only if a word will not fit.
  let headFont = 0
  let headLines: string[][] = []
  const widths = HT_MEDS_COLUMNS.map((c) => Math.floor(width * c.share))
  widths[widths.length - 1] = width - widths.slice(0, -1).reduce((sum, w) => sum + w, 0)
  for (let size = HEAD_FONT; size >= HEAD_FONT_MIN; size--) {
    const attempt = HT_MEDS_COLUMNS.map((c, i) => wrapLabel(c.label, size, widths[i]! - 2 * PAD_X, boldSpec(font), 2))
    if (attempt.every((lines): lines is string[] => lines !== null)) {
      headFont = size
      headLines = attempt
      break
    }
  }
  if (!headFont) return { ok: false, message: HT_PAGE_TOO_SMALL_MESSAGE }
  const headHeight = Math.ceil(textHeight(Math.max(...headLines.map((l) => l.length)), headFont) + 2 * PAD_Y)

  const rowsTop = tableTop + headHeight
  const room = boxBottom(body) - rowsTop
  const count = Math.floor(room / MEDS_ROW_MIN)
  if (count < MEDS_ROWS_MIN) return { ok: false, message: HT_PAGE_TOO_SMALL_MESSAGE }
  const pitch = room / count
  const rowEdges = Array.from({ length: count + 1 }, (_, k) => Math.round(rowsTop + k * pitch))

  let x = left
  const columns = widths.map((w, i) => {
    const column = { left: x, width: w, lines: headLines[i]! }
    x += w
    return column
  })
  return {
    ok: true,
    plan: {
      table: { left, top: tableTop, width, height: rowEdges.at(-1)! - tableTop },
      columns,
      headFont,
      headHeight,
      rowEdges,
      labelFont,
      contacts: plannedContacts,
    },
  }
}

export const htPads = { PAD_X, PAD_Y, CELL_PAD, GLASS_GAP }
