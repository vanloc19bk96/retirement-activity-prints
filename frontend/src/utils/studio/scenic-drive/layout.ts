import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { DRIVE_LEGEND_RUN, DRIVE_ROUTES, DRIVE_SUM_WORD, DRIVE_TWICE_WORD, driveInstruction, driveLevelSpec, driveSignText, type DriveLevel } from './content'

/**
 * Where everything on a Scenic Drive page goes.
 *
 * Top to bottom: the route's road sign, the grid (squares on a square pitch:
 * gray squares carrying the totals, split by a diagonal, and white squares
 * for the digits), and a legend (a total of 4 with the run 1, 3 after it,
 * and two 2s in a run crossed out). Squares are as large as the trim allows
 * (up to 0.8 in) and never below the level's floor; the digits grow with
 * them, never below 16 pt, and the totals never below 12 pt. The page is
 * planned from the level and the trim alone, before a grid is built, so
 * every page of a run prints at the same size and the form's help line is
 * what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const DRIVE_HEADER_AIR = 10

/** Largest square worth printing — past this a 7 × 7 is a poster. */
export const DRIVE_MAX_CELL = Math.round(inch(0.8))

/** The digits written in: half a square, 16–26 pt. */
export const DRIVE_DIGIT_MIN = ptToPx(16)
const DRIVE_DIGIT_MAX = ptToPx(26)
const DIGIT_OF_CELL = 0.5

/** The totals in the gray squares: bold, three tenths of a square, 12–18 pt. */
export const DRIVE_TOTAL_MIN = ptToPx(12)
const DRIVE_TOTAL_MAX = ptToPx(18)
const TOTAL_OF_CELL = 0.3
/** Where a total's centre sits in its half of the square, as shares of the square: far along, near across. */
export const DRIVE_TOTAL_FAR = 0.72
export const DRIVE_TOTAL_NEAR = 0.28
/** A digit's height, as a share of its size (the digit face's figures, with a hair to spare). */
export const DRIVE_DIGIT_HEIGHT = 0.74
/** Clear air a total keeps from the diagonal and the square's sides, px. */
export const DRIVE_TOTAL_AIR = 1.5

/** The grid's rules: a bold frame, black lines between squares, the diagonals of the gray squares. */
export const DRIVE_FRAME_STROKE = 2.5
/** The legend's little squares keep a lighter frame, so it never crowds their total. */
export const DRIVE_LEGEND_FRAME_STROKE = 1.5
export const DRIVE_LINE_STROKE = 1.25
export const DRIVE_DIAGONAL_STROKE = 1.25

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const DRIVE_SIGN_SIZE = ptToPx(16)
export const DRIVE_SIGN_MIN = ptToPx(14)
export const DRIVE_SIGN_PAD_X = 18
export const DRIVE_SIGN_PAD_Y = 10
/** Air under the sign, before the grid: grows with the squares so the sign never crowds them. */
export const DRIVE_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside little squares, on one row or two. */
export const DRIVE_LEGEND_SIZE = ptToPx(14)
/** A legend square, with room for a total in its gray half. */
export const DRIVE_LEGEND_SQUARE = Math.round(DRIVE_LEGEND_SIZE * 1.9)
/** The legend's sample run: its gray square, then its white ones. */
export const DRIVE_LEGEND_RUN_WIDTH = DRIVE_LEGEND_SQUARE * (DRIVE_LEGEND_RUN.length + 1)
/** The legend's two squares holding the same digit. */
export const DRIVE_LEGEND_TWIN_WIDTH = DRIVE_LEGEND_SQUARE * 2
export const DRIVE_LEGEND_ICON_GAP = 10
export const DRIVE_LEGEND_ITEM_GAP = 28
export const DRIVE_LEGEND_ROW_GAP = 10
/** Air between the grid and the legend. */
export const DRIVE_LEGEND_GAP = 24

export const driveDigitSpec = (weight = 700): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: weight })
export const driveSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const driveLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface DrivePlan {
  size: number
  /** Square pitch. */
  cell: number
  /** The grid's square: `size` pitches across and down. */
  grid: Box
  /** The digits written in white squares, px. */
  digitSize: number
  /** The totals in gray squares, px. */
  totalSize: number
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the grid. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Sign, grid and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function driveContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function drivePanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? DRIVE_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function drivePanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: DriveLevel): Box {
  const content = driveContentBox(page)
  const header = measureHeaderHeight(config, driveInstruction(config, level), content.width)
  return drivePanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const driveLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const driveTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The digits' size for a square: half of it, 16–26 pt. */
export const driveDigitSizeFor = (cell: number) => Math.max(DRIVE_DIGIT_MIN, Math.min(DRIVE_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** The totals' size for a square: three tenths of it, 12–18 pt. */
export const driveTotalSizeFor = (cell: number) => Math.max(DRIVE_TOTAL_MIN, Math.min(DRIVE_TOTAL_MAX, Math.round(cell * TOTAL_OF_CELL)))

/** How wide a total prints, as set (not the roomy textbox): the digit face's own figures. */
export const driveTotalInkWidth = (total: number, size: number) => hugTextBoxWidth(String(total), size, Number.POSITIVE_INFINITY, driveDigitSpec(700))

/**
 * True when a total of this width sits in its half of a gray square — clear
 * of the diagonal and of the square's sides by DRIVE_TOTAL_AIR. The across
 * total sits above the diagonal and the down total below it; by symmetry one
 * test serves both.
 */
export function driveTotalFits(cell: number, size: number, width: number): boolean {
  const halfW = width / 2
  const halfH = (size * DRIVE_DIGIT_HEIGHT) / 2
  const far = cell * DRIVE_TOTAL_FAR
  const near = cell * DRIVE_TOTAL_NEAR
  // The box's corner nearest the diagonal stays clear of it (measured square to the diagonal).
  const cornerGap = (far - halfW - (near + halfH)) / Math.SQRT2
  const inside = far + halfW <= cell - DRIVE_TOTAL_AIR && near - halfH >= DRIVE_TOTAL_AIR
  return cornerGap >= DRIVE_TOTAL_AIR && inside
}

/** The sign's outer width for a route at a size. */
export function driveSignWidth(text: string, size: number, font: string): number {
  return driveTextWidth(text, size, driveSignSpec(font)) + DRIVE_SIGN_PAD_X * 2
}

/** The widest sign any route makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...DRIVE_ROUTES.map((w) => driveSignWidth(driveSignText(w, lines), size, font)))

/** Each legend entry's width: icon, gap, words. */
export function driveLegendItemWidths(font: string): [number, number] {
  const words = (text: string) => driveTextWidth(text, DRIVE_LEGEND_SIZE, driveLegendSpec(font))
  return [DRIVE_LEGEND_RUN_WIDTH + DRIVE_LEGEND_ICON_GAP + words(DRIVE_SUM_WORD), DRIVE_LEGEND_TWIN_WIDTH + DRIVE_LEGEND_ICON_GAP + words(DRIVE_TWICE_WORD)]
}

/** The legend's width on one row or two. */
export function driveLegendWidth(font: string, rows: 1 | 2): number {
  const [sum, twice] = driveLegendItemWidths(font)
  return rows === 1 ? sum + DRIVE_LEGEND_ITEM_GAP + twice : Math.max(sum, twice)
}

/** One legend row's height: a little square, or a line of words, whichever is taller. */
export const driveLegendRowHeight = () => Math.max(DRIVE_LEGEND_SQUARE, Math.ceil(driveLineHeight(DRIVE_LEGEND_SIZE)))

function planAt(panel: Box, level: DriveLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): DrivePlan | null {
  const size = driveLevelSpec(level).size
  const legendRows: 1 | 2 = driveLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = driveLegendRowHeight() * legendRows + (legendRows === 2 ? DRIVE_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(driveLineHeight(signSize, signLines)) + DRIVE_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(DRIVE_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const side = size * cell
  const blockHeight = signHeight + signGap + side + DRIVE_LEGEND_GAP + legendHeight
  const widest = Math.max(side, widestSign(signSize, signLines, font), driveLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - side) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: side, height: side }
  const legendTop = gridTop + side + DRIVE_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    digitSize: driveDigitSizeFor(cell),
    totalSize: driveTotalSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: DRIVE_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planDrivePage(panel: Box, level: DriveLevel, font: string): DrivePlan | null {
  const floor = Math.ceil(driveLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [DRIVE_SIGN_SIZE, 1],
    [DRIVE_SIGN_MIN, 1],
    [DRIVE_SIGN_SIZE, 2],
    [DRIVE_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every square lands on the same pixel grid.
    for (let cell = DRIVE_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is built. */
export function drivePlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: DriveLevel; font: string }): DrivePlan | null {
  const { page, config, level, font } = options
  return planDrivePage(drivePanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function drivePrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: DriveLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = driveLevelSpec(level)
  const lead = 'Every grid is built fresh and proven to have one answer, reached by logic alone — no guessing.'
  if (!page) return lead
  const plan = drivePlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} grids at large print — choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the grid ${(plan.grid.width / DPI).toFixed(2)} in across, digits ${pxToPt(plan.digitSize)} pt, totals ${pxToPt(plan.totalSize)} pt.`
}
