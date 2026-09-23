import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { STUDIO_AUTO_PAGE_TITLE_SAMPLE } from '../studio-page-header'
import { TEXT_PAINT_HEIGHT_RATIO } from '../_shared/lattice-grid'
import { COLUMN_FLEX, type FallenPhraseLevel } from './levels'

/**
 * Everything a Fallen Phrase page decides on the seller's behalf.
 *
 * The number that governs this page is not a point size — it is how wide a box
 * has to be before an older hand can write a capital into it. Everything else
 * is derived from that: the cell sets the letter size, the letter size sets
 * the bank of fallen letters under the grid, and the column count is whatever
 * the trim can hold at a writable cell.
 *
 * Columns are clamped to the trim rather than stretched to fill it. A wide
 * page could carry eighteen narrow columns, but eighteen columns is a
 * different, easier puzzle than the level asked for — so a big trim prints the
 * level's grid in bigger boxes, centred, rather than a wider grid in the same
 * ones. That is also why none of this is on the form: a seller cannot answer
 * "how many columns" without knowing the trim, the heading and how the saying
 * happens to wrap, so the page works it out and `fallenPhrasePrintNote`
 * reports what came out.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

export function pxToPt(px: number): number {
  return Math.round((px * PDF_POINTS_PER_INCH) / DPI)
}

/**
 * Smallest box a reader can still write a capital into, in inches.
 *
 * Measured the way the crossword and the codeword measure theirs: not from
 * type, but from a ballpoint and an older hand. Below about three tenths of an
 * inch the letters a solver writes start touching the rules either side.
 */
const CELL_MIN_INCHES = 0.3

/**
 * Widest a box may grow, in inches.
 *
 * Generous, because this page is unusually short for its trim: the grid is
 * only three to six rows deep and the letters under it no deeper, so on an
 * 8.5 x 11 interior the column runs out of width long before it runs out of
 * height. Capping tightly there would have printed a modest grid marooned in
 * half a page of white. Past this, though, a short saying stops reading as a
 * puzzle and starts reading as a wall chart.
 */
const CELL_MAX_INCHES = 0.56

export const FALLEN_PHRASE_MIN_CELL = Math.round(DPI * CELL_MIN_INCHES)
export const FALLEN_PHRASE_MAX_CELL = Math.round(DPI * CELL_MAX_INCHES)

/**
 * Columns a grid may use, floor and ceiling.
 *
 * The floor is also the longest word `content.ts` will accept, because a word
 * is never broken across rows. The ceiling is where the columns of fallen
 * letters under the grid get too close together to tell apart at a glance,
 * which is the one thing this puzzle cannot afford to be unclear about.
 */
export const FALLEN_PHRASE_MIN_COLS = 10
export const FALLEN_PHRASE_MAX_COLS = 16

/** Letter size inside a box, as a share of the box. */
const LETTER_CELL_RATIO = 0.58
/** Nothing on this page prints smaller than this, on any trim. */
export const FALLEN_PHRASE_MIN_LETTER = ptToPx(12)

/** Air between the grid and the fallen letters, as a share of the cell. */
const BANK_GAP_RATIO = 0.6
/** Pitch from one fallen letter to the next, as a share of the cell. */
const BANK_PITCH_RATIO = 0.88
/**
 * Fallen letters set a shade larger than the boxes above them.
 *
 * They are the only printed glyphs on the puzzle page, and they are read
 * rather than written over, so they can afford the ink that an empty box
 * cannot. It also stops the bank reading as a second, fainter grid.
 */
const BANK_LETTER_RATIO = 0.64

export interface FallenPhraseMetrics {
  /** Pitch from one grid box to the next, and the box's own size. */
  cell: number
  /** Size of a letter written into (or, on the key, printed in) a box. */
  letterSize: number
  bankGap: number
  bankPitch: number
  bankLetterSize: number
}

function fitLetterSize(cell: number, ratio: number): number {
  return Math.max(
    1,
    Math.min(
      Math.floor(cell * ratio),
      // Fabric paints a textbox taller than its font size; a glyph that fills
      // the box on paper overflows it on the canvas.
      Math.floor(Math.max(1, cell - 2) / TEXT_PAINT_HEIGHT_RATIO),
    ),
  )
}

export function fallenPhraseMetrics(cell: number): FallenPhraseMetrics {
  const bankPitch = Math.round(cell * BANK_PITCH_RATIO)
  return {
    cell,
    letterSize: fitLetterSize(cell, LETTER_CELL_RATIO),
    bankGap: Math.round(cell * BANK_GAP_RATIO),
    bankPitch,
    bankLetterSize: fitLetterSize(bankPitch, BANK_LETTER_RATIO),
  }
}

/** The safe printable column every Fallen Phrase page lays out inside. */
export function fallenPhraseContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/**
 * The heading this page will really carry.
 *
 * A draft with "Page title" on and the text left blank is not an untitled
 * page: generate falls back to the theme, and a book run stamps "Game N".
 * Measuring the draft as written would let the form promise a grid the printed
 * page — one title line shorter — cannot hold, and the smallest trims are
 * exactly where that line is the difference.
 */
function headerConfig(config: StudioConfig): StudioConfig {
  if (config.showTitle === false) return config
  if (String(config.title ?? '').trim()) return config
  return { ...config, title: STUDIO_AUTO_PAGE_TITLE_SAMPLE }
}

/** What is left of the column once the title and instruction have been set. */
export function fallenPhraseBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = fallenPhraseContentBox(page)
  const headerHeight = measureHeaderHeight(headerConfig(config), instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The most columns this trim can print at a box a hand can write in.
 *
 * Zero means the page cannot hold the narrowest grid this puzzle has, and the
 * caller prints a "choose a larger page" card rather than a grid nobody can
 * write in.
 */
export function fallenPhraseMaxColumns(field: Box): number {
  const widest = Math.min(
    FALLEN_PHRASE_MAX_COLS,
    Math.floor(field.width / FALLEN_PHRASE_MIN_CELL),
  )
  return widest < FALLEN_PHRASE_MIN_COLS ? 0 : widest
}

/**
 * Grid widths this level may use on this trim, narrowest first.
 *
 * The level names a width; the trim caps it; the flex either side is what lets
 * one saying of a band settle where another of the same band would leave
 * holes. Narrowest first so a tie in the builder's score falls to the grid
 * with the bigger boxes.
 */
export function fallenPhraseColumnCandidates(
  field: Box,
  level: FallenPhraseLevel,
): number[] {
  const widest = fallenPhraseMaxColumns(field)
  if (widest === 0) return []
  const preferred = Math.max(
    FALLEN_PHRASE_MIN_COLS,
    Math.min(widest, level.preferredCols),
  )
  const candidates: number[] = []
  for (let cols = preferred - COLUMN_FLEX; cols <= preferred + COLUMN_FLEX; cols++) {
    if (cols >= FALLEN_PHRASE_MIN_COLS && cols <= widest) candidates.push(cols)
  }
  return candidates
}

/** The width the form's note is measured at — the level's own, capped by the trim. */
export function fallenPhraseNoteColumns(field: Box, level: FallenPhraseLevel): number {
  const widest = fallenPhraseMaxColumns(field)
  if (widest === 0) return 0
  return Math.max(FALLEN_PHRASE_MIN_COLS, Math.min(widest, level.preferredCols))
}

export interface FallenPhrasePagePlan {
  cols: number
  rowCount: number
  /** Tallest stack of fallen letters the bank has to hold. */
  bankRows: number
  metrics: FallenPhraseMetrics
  gridHeight: number
  bankHeight: number
  /** Grid, gap and bank together — what gets centred in the body column. */
  blockHeight: number
}

/**
 * The roomiest boxes this grid prints in, or nothing.
 *
 * Steps down from the ceiling rather than solving for a size, because three
 * separate floors (box, written letter, fallen letter) have to clear at once
 * and each is rounded to whole pixels. A dozen iterations settles it.
 */
export function planFallenPhrasePage(options: {
  field: Box
  cols: number
  rowCount: number
  bankRows: number
}): FallenPhrasePagePlan | null {
  const { field, cols, rowCount, bankRows } = options
  if (cols <= 0 || rowCount <= 0) return null

  const widest = Math.min(FALLEN_PHRASE_MAX_CELL, Math.floor(field.width / cols))
  for (let cell = widest; cell >= FALLEN_PHRASE_MIN_CELL; cell--) {
    const metrics = fallenPhraseMetrics(cell)
    if (metrics.letterSize < FALLEN_PHRASE_MIN_LETTER) continue
    if (metrics.bankLetterSize < FALLEN_PHRASE_MIN_LETTER) continue

    const gridHeight = rowCount * cell
    const bankHeight = bankRows * metrics.bankPitch
    const blockHeight = gridHeight + (bankRows > 0 ? metrics.bankGap + bankHeight : 0)
    if (blockHeight > field.height) continue

    return {
      cols,
      rowCount,
      bankRows,
      metrics,
      gridHeight,
      bankHeight,
      blockHeight,
    }
  }
  return null
}

/**
 * The page this level makes, measured before a single saying exists.
 *
 * Probed at the level's own row count, since that is what the page aims for
 * and what it reaches on all but the narrowest trims. The note says "about"
 * for the one case it cannot promise: a grid clamped narrow by a small page
 * takes a row more.
 */
export function fallenPhraseProbePlan(options: {
  level: FallenPhraseLevel
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
}): FallenPhrasePagePlan | null {
  const { level, page, config, instruction } = options
  const field = fallenPhraseBodyField(page, config, instruction)
  const cols = fallenPhraseNoteColumns(field, level)
  if (cols === 0) return null
  return planFallenPhrasePage({
    field,
    cols,
    rowCount: level.rows,
    // A column can hold at most one letter per row, so this is the tallest
    // bank any saying could hand the page at this shape.
    bankRows: level.rows,
  })
}

/** What this level prints on the page size currently set in Settings. */
export function fallenPhrasePrintNote(options: {
  level: FallenPhraseLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
}): string {
  const { level, page, config, instruction } = options
  if (!page) {
    return `A ${level.rows}-row grid of large write-in boxes, plus a matching answer page.`
  }

  const plan = fallenPhraseProbePlan({ level, page, config, instruction })
  if (!plan) {
    return 'This page size is too small for a Fallen Phrase grid — choose a larger one in Settings.'
  }

  const grid = `About a ${plan.cols} x ${plan.rowCount} grid`
  const size = `boxes ${(plan.metrics.cell / DPI).toFixed(2)} in across, letters at ${pxToPt(
    plan.metrics.bankLetterSize,
  )} pt`
  return `${grid}, ${size}, plus a matching answer page.`
}
