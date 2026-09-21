import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import {
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  insetBox,
  type Box,
} from '../studio-layout'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { answerParts, BLANK_TOKEN } from './validate'
import type { TitleItem } from '@/types/studio-title-complete.types'

/** Print points → editor canvas px. */
export function pt(points: number): number {
  return (points * DPI) / PDF_POINTS_PER_INCH
}

/**
 * KDP large-print target (~16pt).
 * Avoid STUDIO_BODY_SIZE*1.15 (~21pt) — too chunky in a dense title grid.
 */
export const LARGE_PRINT = pt(16)
/** Senior/KDP readability floor (~14pt) before emergency packing. */
export const MIN_LARGE_PRINT = pt(14)
/** ≈25 mm preferred blank; may clamp in a narrow cell. */
export const MIN_BLANK_W = pt(71)
export const BLANK_STROKE = 0.75
export const NUMBER_GUTTER = 36
export const AFTER_BLANK_GAP = 8
export const COLUMN_COUNT = 2
const BLANK_BAND = 8

/** Breathing room from safe edges — matches missing-vowels grids. */
export const STROKE_INSET = 16
export const CELL_PAD = 12
export const INDEX_GAP = 8
export const INDEX_W = 40
/** Tall enough for cue + blank with air; text itself stays ≤16pt. */
const PREFERRED_ROW_H = STUDIO_BODY_SIZE * 3.0
const MIN_PROMPT_SIZE = MIN_LARGE_PRINT
/** Only when 20 items on a short trim cannot hold 14pt. */
const HARD_MIN_PROMPT_SIZE = pt(13)

export function measureTextWidth(text: string, fontSize: number): number {
  if (!text) return 0
  return estimateTextBoxWidth(text, fontSize, Number.POSITIVE_INFINITY)
}

/** Glyph-run width — same metric as Fabric textbox width (avoids early soft-wrap). */
export function measureGlyphRun(text: string, fontSize: number): number {
  if (!text) return 0
  return estimateTextBoxWidth(text, fontSize, Number.POSITIVE_INFINITY)
}

/** Absolute floor for a writable blank when shrinking to stay on one line. */
export const MIN_WRITING_BLANK = pt(40)

/** Snap blank widths; clamp to the cell measure when provided. */
export function blankWidthFor(
  answer: string,
  fontSize: number,
  maxWidth?: number,
): number {
  const letters = Math.max(
    1,
    answerParts(answer).reduce((sum, p) => sum + p.length, 0),
  )
  const raw = Math.max(MIN_BLANK_W, letters * fontSize * 0.62)
  let width = Math.ceil(raw / BLANK_BAND) * BLANK_BAND
  if (maxWidth != null && maxWidth > 0) {
    // Prefer fitting beside the title — don't reserve half the cell by default.
    const capped = Math.max(MIN_WRITING_BLANK, maxWidth * 0.42)
    width = Math.min(width, capped)
  }
  return width
}

export interface BlankPlacement {
  blankW: number
  /** Blank (+ after) start on line 2 under the before cue. */
  wrapBlank: boolean
  /** After text moves to line 2; blank stays on line 1 (never soft-wrap mid-phrase). */
  afterOnLine2: boolean
}

/**
 * Choose blank width: shrink blank to keep after-text on one line;
 * only wrap at a line break when the cell edge is truly hit.
 */
export function resolveBlankPlacement(options: {
  beforeW: number
  afterW: number
  hintW: number
  preferredBlankW: number
  maxW: number
  allowWrap: boolean
}): BlankPlacement {
  const { beforeW, afterW, hintW, preferredBlankW, maxW, allowWrap } = options
  const trailing = (afterW > 0 ? AFTER_BLANK_GAP + afterW : 0) + hintW
  const roomForBlank = maxW - beforeW - trailing

  if (roomForBlank >= preferredBlankW) {
    return { blankW: preferredBlankW, wrapBlank: false, afterOnLine2: false }
  }
  if (roomForBlank >= MIN_WRITING_BLANK) {
    return { blankW: roomForBlank, wrapBlank: false, afterOnLine2: false }
  }
  // before + min-blank + after will not fit on one line.
  if (allowWrap && beforeW > 0) {
    const line2Budget = Math.max(MIN_WRITING_BLANK, maxW - trailing)
    return {
      blankW: Math.min(preferredBlankW, line2Budget),
      wrapBlank: true,
      afterOnLine2: false,
    }
  }
  if (allowWrap && afterW > 0) {
    // No before cue: keep a full blank on line 1, move the whole after phrase to line 2.
    return {
      blankW: Math.min(preferredBlankW, Math.max(MIN_WRITING_BLANK, maxW - hintW)),
      wrapBlank: false,
      afterOnLine2: true,
    }
  }
  return {
    blankW: Math.max(MIN_WRITING_BLANK * 0.6, Math.max(0, maxW - beforeW - hintW)),
    wrapBlank: false,
    afterOnLine2: false,
  }
}

/** Two-line slot height used when a blank wraps under the cue. */
export function itemBlockHeight(fontSize: number): number {
  return fontSize * 1.35 * 2
}

export interface TitleTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/** Centered n-col × m-row table — integer cells, re-centered in field. */
export function fitTitleTable(
  field: Box,
  itemCount: number,
  cols = COLUMN_COUNT,
): TitleTable {
  const rows = Math.max(1, Math.ceil(itemCount / Math.max(1, cols)))
  const cellW = Math.max(1, Math.floor(field.width / cols))
  const cellH = Math.max(
    1,
    Math.floor(Math.min(PREFERRED_ROW_H, field.height / rows)),
  )
  const gridW = cellW * cols
  const gridH = cellH * rows
  const left = Math.round(field.left + (field.width - gridW) / 2)
  const top = Math.round(field.top + (field.height - gridH) / 2)
  return {
    cols,
    rows,
    cellW,
    cellH,
    bounds: { left, top, width: gridW, height: gridH },
    cellBox: (row, col) => ({
      left: left + col * cellW,
      top: top + row * cellH,
      width: cellW,
      height: cellH,
    }),
  }
}

export function contentMaxWidth(cellW: number): number {
  return Math.max(24, cellW - CELL_PAD * 2 - INDEX_W - INDEX_GAP)
}

/** Rough one-line width of a blanked title for shared font fitting. */
export function estimateTitleRunWidth(
  item: TitleItem,
  fontSize: number,
  maxW: number,
  showHint: boolean,
): number {
  const idx = item.displayTitle.indexOf(BLANK_TOKEN)
  const before = idx < 0 ? item.displayTitle : item.displayTitle.slice(0, idx)
  const after =
    idx < 0 ? '' : item.displayTitle.slice(idx + BLANK_TOKEN.length).trimStart()
  const blankW = blankWidthFor(item.answer, fontSize, maxW)
  const hintW = showHint
    ? measureGlyphRun(`(${answerParts(item.answer).join('').length})`, fontSize * 0.7) +
      AFTER_BLANK_GAP
    : 0
  const afterW = after ? measureGlyphRun(after, fontSize) + AFTER_BLANK_GAP : 0
  return measureGlyphRun(before, fontSize) + blankW + afterW + hintW
}

function fitTitleSize(item: TitleItem, preferred: number, maxW: number, showHint: boolean): number {
  if (maxW <= 0) return HARD_MIN_PROMPT_SIZE
  let size = preferred
  while (size > MIN_PROMPT_SIZE) {
    if (estimateTitleRunWidth(item, size, maxW, showHint) <= maxW * 1.35) {
      // Allow slight overflow — wrap-before-blank handles dense titles.
      return size
    }
    size -= 1
  }
  while (size > HARD_MIN_PROMPT_SIZE) {
    if (estimateTitleRunWidth(item, size, maxW, showHint) <= maxW * 1.6) return size
    size -= 0.5
  }
  return HARD_MIN_PROMPT_SIZE
}

/** One shared size for the page — min over items, capped by cell height. */
export function sharedTitleFontSize(
  items: readonly TitleItem[],
  contentMaxW: number,
  cellH: number,
  showHint: boolean,
): number {
  // ~0.32 of cell height keeps 16pt type from filling the cell (less “chunky”).
  const preferred = Math.min(LARGE_PRINT, Math.floor(cellH * 0.32))
  let size = Math.max(MIN_LARGE_PRINT, preferred)
  for (const item of items) {
    size = Math.min(size, fitTitleSize(item, size, contentMaxW, showHint))
  }
  return Math.max(HARD_MIN_PROMPT_SIZE, size)
}

export function sharedIndexFontSize(itemCount: number, textSize: number): number {
  return fitFontSizeToWidth(`${itemCount}.`, INDEX_W, textSize * 0.9, 10)
}

export function packTitleGrid(
  field: Box,
  items: readonly TitleItem[],
  showHint: boolean,
): {
  table: TitleTable
  fontSize: number
  labelSize: number
  contentMaxW: number
  allowWrap: boolean
} {
  const tableField = insetBox(field, STROKE_INSET)
  const table = fitTitleTable(tableField, items.length, COLUMN_COUNT)
  const contentMaxW = contentMaxWidth(table.cellW)
  const fontSize = sharedTitleFontSize(items, contentMaxW, table.cellH, showHint)
  const labelSize = sharedIndexFontSize(items.length, fontSize)
  const allowWrap = table.cellH >= itemBlockHeight(fontSize) * 0.9
  return { table, fontSize, labelSize, contentMaxW, allowWrap }
}
