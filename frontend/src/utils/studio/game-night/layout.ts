import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { GN_NIGHTS, gnInstruction, gnLegendEntries, gnLevelSpec, gnSignText, type GnLevel } from './content'
import { GN_MAX_PRODUCT } from './puzzle'

/**
 * Where everything on a Game Night page goes.
 *
 * Top to bottom: the night's sign, the grid (soft gray lines between the
 * squares, bold black walls round every box, each box's clue in its top-left
 * corner), and a legend — one worked box for every sign the level prints
 * ("2 + 3 = 5"). Squares are as large as the trim allows (up to 0.8 in) and
 * never below the level's floor; the clues and the answer's numbers grow
 * with them, never below 12 pt and 16 pt. The page is planned from the level
 * and the trim alone, before a grid is built, so every page of a run prints
 * at the same size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const GN_HEADER_AIR = 10

/** Largest square worth printing — past this a 5 × 5 is a poster. */
export const GN_MAX_CELL = Math.round(inch(0.8))
/** The frame round the grid and the walls round every box, px. */
export const GN_WALL = 3

/** A box's clue: bold, about a quarter of a square, 12–16 pt, tucked into its top-left corner. */
export const GN_CLUE_MIN = ptToPx(12)
const GN_CLUE_MAX = ptToPx(16)
const CLUE_OF_CELL = 0.26
/** Air between a clue and the walls of its corner, px. */
export const GN_CLUE_INSET = 4
/** Air kept between a clue's last figure and the wall to its right, px. */
export const GN_CLUE_TAIL = 1

/** The answer page's numbers: a little over a third of a square, 16–24 pt, set low in the square, clear of the clue. */
export const GN_DIGIT_MIN = ptToPx(16)
const GN_DIGIT_MAX = ptToPx(24)
const DIGIT_OF_CELL = 0.42
/** Where an answer's number sits, down its square. */
export const GN_DIGIT_DROP = 0.64

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const GN_SIGN_SIZE = ptToPx(16)
export const GN_SIGN_MIN = ptToPx(14)
export const GN_SIGN_PAD_X = 18
export const GN_SIGN_PAD_Y = 10
/** Air under the sign, before the grid: grows with the squares so the sign never crowds the grid. */
export const GN_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside little boxes of two squares. */
export const GN_LEGEND_SIZE = ptToPx(14)
/** A legend square: roomy enough for a 12 pt clue over a 14 pt number. */
export const GN_LEGEND_SQUARE = 46
export const GN_LEGEND_CLUE_SIZE = ptToPx(12)
/** Where a legend number sits, down its little square: low enough to clear the clue. */
export const GN_LEGEND_DIGIT_DROP = 0.66
export const GN_LEGEND_BOX_WIDTH = GN_LEGEND_SQUARE * 2
export const GN_LEGEND_ICON_GAP = 10
export const GN_LEGEND_ITEM_GAP = 28
export const GN_LEGEND_ROW_GAP = 10
/** Air between the grid and the legend. */
export const GN_LEGEND_GAP = 26

export const gnDigitSpec = (weight: 400 | 700 = 700): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: weight })
export const gnSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const gnLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface GnPlan {
  size: number
  cell: number
  /** The grid: `size` squares across and down. */
  grid: Box
  /** The boxes' clues, px. */
  clueSize: number
  /** The answer page's numbers, px. */
  digitSize: number
  signSize: number
  /** The sign on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the grid. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the sign centres in it). */
  signBand: Box
  legendSize: number
  /** Every legend entry on one row, shared over two on a narrow trim, or one to a row on the narrowest. */
  legendRows: number
  legendTop: number
  legendHeight: number
  /** Sign, grid and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function gnContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function gnPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? GN_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function gnPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: GnLevel): Box {
  const content = gnContentBox(page)
  const header = measureHeaderHeight(config, gnInstruction(config, level), content.width)
  return gnPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const gnLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const gnTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The width a clue's figures and sign set in, without the spare room. */
export const gnClueInk = (text: string, size: number) => hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, gnDigitSpec())

/** The widest clue a level may print: its largest product, or sum, with its sign. */
export function gnWidestClue(level: GnLevel): string {
  const { size, ops } = gnLevelSpec(level)
  return ops.includes('*') ? `${GN_MAX_PRODUCT}×` : `${size * 4}+`
}

/** The sign's outer width for a night at a size. */
export function gnSignWidth(text: string, size: number, font: string): number {
  return gnTextWidth(text, size, gnSignSpec(font)) + GN_SIGN_PAD_X * 2
}

/** The widest sign any night makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...GN_NIGHTS.map((s) => gnSignWidth(gnSignText(s, lines), size, font)))

/** Each legend entry's width: its little box, gap, words. */
export function gnLegendItemWidths(level: GnLevel, font: string): number[] {
  return gnLegendEntries(level).map((e) => GN_LEGEND_BOX_WIDTH + GN_LEGEND_ICON_GAP + gnTextWidth(e.words, GN_LEGEND_SIZE, gnLegendSpec(font)))
}

/** Entries per legend row. */
export const gnLegendPerRow = (level: GnLevel, rows: number) => Math.ceil(gnLegendEntries(level).length / rows)

/** The ways the legend may be set, fewest rows first: one row, two, or one entry to a row. */
export const gnLegendRowChoices = (level: GnLevel): number[] => [...new Set([1, 2, gnLegendEntries(level).length])].filter((r) => r <= gnLegendEntries(level).length)

/** The legend's columns: each as wide as its widest entry. */
export function gnLegendColumns(level: GnLevel, font: string, rows: number): number[] {
  const widths = gnLegendItemWidths(level, font)
  const per = gnLegendPerRow(level, rows)
  const cols = new Array<number>(per).fill(0)
  widths.forEach((w, k) => (cols[k % per] = Math.max(cols[k % per]!, w)))
  return cols
}

/** The legend's width set in this many rows. */
export function gnLegendWidth(level: GnLevel, font: string, rows: number): number {
  const cols = gnLegendColumns(level, font, rows)
  return cols.reduce((a, b) => a + b, 0) + GN_LEGEND_ITEM_GAP * (cols.length - 1)
}

/** One legend row's height: a little square, or a line of words, whichever is taller. */
export const gnLegendRowHeight = () => Math.max(GN_LEGEND_SQUARE, Math.ceil(gnLineHeight(GN_LEGEND_SIZE)))

/** The width a clue may take in its square: from its inset to just short of the wall on its right. */
export const gnClueRoom = (cell: number) => cell - GN_WALL - GN_CLUE_INSET - GN_CLUE_TAIL

/** The clues' size for a square size: as large as fits, never above a quarter-ish of the square. */
export function gnClueSizeFor(cell: number, level: GnLevel): number {
  const room = gnClueRoom(cell)
  let size = Math.max(GN_CLUE_MIN, Math.min(GN_CLUE_MAX, Math.round(cell * CLUE_OF_CELL)))
  while (size > GN_CLUE_MIN && gnClueInk(gnWidestClue(level), size) > room) size--
  return size
}

/** The answer's numbers' size for a square size. */
export const gnDigitSizeFor = (cell: number) => Math.max(GN_DIGIT_MIN, Math.min(GN_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** Where a clue's top sits below its square's top edge. */
export const gnClueTop = () => GN_WALL / 2 + GN_CLUE_INSET - 1

/** Air between a clue's foot and the top of the answer's number in the same square, px (negative when they would meet). */
export function gnClueDigitAir(cell: number, clueSize: number, digitSize: number): number {
  const clueFoot = gnClueTop() + clueSize * 0.9
  const digitHead = cell * GN_DIGIT_DROP - digitSize * 0.38
  return digitHead - clueFoot
}

function planAt(panel: Box, level: GnLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): GnPlan | null {
  const size = gnLevelSpec(level).size
  const choices = gnLegendRowChoices(level)
  const legendRows = choices.find((rows) => gnLegendWidth(level, font, rows) <= panel.width) ?? choices[choices.length - 1]!
  const legendHeight = gnLegendRowHeight() * legendRows + GN_LEGEND_ROW_GAP * (legendRows - 1)
  const signHeight = Math.ceil(gnLineHeight(signSize, signLines)) + GN_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(GN_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const side = size * cell
  const blockHeight = signHeight + signGap + side + GN_LEGEND_GAP + legendHeight
  const widest = Math.max(side, widestSign(signSize, signLines, font), gnLegendWidth(level, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - side) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: side, height: side }
  const legendTop = gridTop + side + GN_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    clueSize: gnClueSizeFor(cell, level),
    digitSize: gnDigitSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: GN_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planGnPage(panel: Box, level: GnLevel, font: string): GnPlan | null {
  const floor = Math.ceil(gnLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [GN_SIGN_SIZE, 1],
    [GN_SIGN_MIN, 1],
    [GN_SIGN_SIZE, 2],
    [GN_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every line lands on the same pixel grid.
    for (let cell = GN_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is built. */
export function gnPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: GnLevel; font: string }): GnPlan | null {
  const { page, config, level, font } = options
  return planGnPage(gnPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size and the clues', or that the trim is too small.
 */
export function gnPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: GnLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = gnLevelSpec(level)
  const lead = 'Every grid is built fresh and proven to have one answer, reached by logic alone, no guessing.'
  if (!page) return lead
  const plan = gnPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} grids at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the grid ${(plan.grid.width / DPI).toFixed(2)} in across, clues ${pxToPt(plan.clueSize)} pt.`
}
