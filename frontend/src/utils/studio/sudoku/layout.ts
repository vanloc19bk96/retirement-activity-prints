import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { snapGridInField } from '../studio-grid-rules'
import type { SudokuSize } from './solver'

/**
 * Ceiling on one cell, as a share of the page width.
 *
 * Without it a 6×6 on an 8.5 x 11 interior inflates to a seven-inch grid with
 * fifty-point digits — a wall chart, not a puzzle page. A share (rather than a
 * pixel constant) keeps the cap honest at any canvas scale: every generator
 * receives page dimensions in canvas pixels and is never told the trim in
 * inches, so the only scale-independent way to say "about three quarters of
 * the page" is to say it in page widths.
 *
 * Per grid size, because the two grids balance a sheet at different cell
 * sizes. Left on the 9×9 share, a 6×6 covers barely half the page and floats
 * in white; on the 6×6 share, a 9×9 would run past the column on every trim.
 * These two land the grid at roughly three quarters (9×9) and two thirds
 * (6×6) of the sheet on every KDP trim, which is what makes a mixed-level
 * book read as one series.
 */
const SUDOKU_MAX_CELL_RATIO: Record<SudokuSize, number> = {
  9: 0.085,
  6: 0.113,
}

/** Digit size as a share of the cell. Large-print books sit near this. */
const SUDOKU_DIGIT_CELL_RATIO = 0.62

/** Hard ceiling so a glyph never touches the rule above or below it. */
const SUDOKU_DIGIT_MAX_RATIO = 0.72

export interface SudokuGridGeometry {
  cell: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
  digitFontSize: number
}

/**
 * Shrink a field to the largest square the cap allows, keeping it centred.
 * Feeding the capped field to the shared snapper keeps one code path for
 * integer alignment and centring.
 */
function capField(field: Box, size: number, maxCell: number): Box {
  const side = maxCell * size
  const width = Math.min(field.width, side)
  const height = Math.min(field.height, side)
  return {
    left: field.left + (field.width - width) / 2,
    top: field.top + (field.height - height) / 2,
    width,
    height,
  }
}

export function sudokuGridGeometry(
  field: Box,
  size: SudokuSize,
  pageWidth: number,
): SudokuGridGeometry {
  const maxCell = Math.max(1, Math.floor(pageWidth * SUDOKU_MAX_CELL_RATIO[size]))
  const snapped = snapGridInField(capField(field, size, maxCell), size, size)
  const digitFontSize = Math.max(
    8,
    Math.min(
      Math.floor(snapped.cell * SUDOKU_DIGIT_MAX_RATIO),
      Math.round(snapped.cell * SUDOKU_DIGIT_CELL_RATIO),
    ),
  )
  return {
    cell: snapped.cell,
    bounds: snapped.bounds,
    cellBox: snapped.cellBox,
    digitFontSize,
  }
}

/** The safe printable column every Sudoku page lays out inside. */
export function sudokuContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function sudokuGridField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = sudokuContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}
