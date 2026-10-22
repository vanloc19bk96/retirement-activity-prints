import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_PANEL_FOOT_AIR, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { TT_LEGEND_WORD, TT_LINES, ttInstruction, ttLevelSpec, ttSignText, type TtLevel } from './content'
import { TT_PIECES } from './solver'

/**
 * Where everything on a Train Tracks page goes.
 *
 * Top to bottom: the line's station sign, the column numbers, the board
 * with the row numbers to its right (where a Train Tracks reader looks for
 * them), and the legend (the six pieces of track a square can hold, each
 * drawn in its square). The legend leads with its words when the trim has
 * room, and drops them before the page gives up.
 * Squares are as large as the trim allows (up to 0.8 in) and never below
 * the level's floor; the numbers grow with them and never print below
 * 16 pt. The page is planned from the level and the trim alone, before a
 * board is built, so every page of a run prints at the same size and the
 * form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const TT_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const TT_MAX_CELL = Math.round(inch(0.8))
/** The board's frame, px: 3 pt, twice the soft rules inside and more. */
export const TT_FRAME = 4
/** The row and column numbers: a share of the square, 16–22 pt. */
export const TT_COUNT_MIN = ptToPx(16)
const TT_COUNT_MAX = ptToPx(22)
const COUNT_OF_CELL = 0.55

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const TT_SIGN_SIZE = ptToPx(16)
export const TT_SIGN_MIN = ptToPx(14)
export const TT_SIGN_PAD_X = 18
export const TT_SIGN_PAD_Y = 10
/** Air under the sign, before the column numbers: grows with the squares so the sign never crowds the board. */
export const TT_SIGN_GAP_MIN = 24
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words, then the six pieces in squares a little over a third of an inch. */
export const TT_LEGEND_SIZE = ptToPx(14)
export const TT_LEGEND_ICON = Math.round(inch(0.34))
export const TT_LEGEND_ICON_GAP = 10
export const TT_LEGEND_WORD_GAP = 14
/** Air between the board and the legend. */
export const TT_LEGEND_GAP = 20

export const ttCountSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const ttSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const ttLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface TtLegendPlan {
  /** Whether the legend leads with its words. */
  words: boolean
  width: number
  height: number
  top: number
}

export interface TtPlan {
  size: number
  cell: number
  countSize: number
  /** Between the numbers and the board. */
  countGap: number
  rowCountWidth: number
  colCountHeight: number
  grid: Box
  signSize: number
  /** The sign on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the column numbers. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the sign centres in it). */
  signBand: Box
  legend: TtLegendPlan
  /** Sign, numbers, board and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function ttContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function ttPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? TT_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air - STUDIO_PANEL_FOOT_AIR) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function ttPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: TtLevel): Box {
  const content = ttContentBox(page)
  const header = measureHeaderHeight(config, ttInstruction(config, level), content.width)
  return ttPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const ttLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const ttTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a line's name at a size. */
export function ttSignWidth(text: string, size: number, font: string): number {
  return ttTextWidth(text, size, ttSignSpec(font)) + TT_SIGN_PAD_X * 2
}

/** The widest sign any line makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...TT_LINES.map((l) => ttSignWidth(ttSignText(l, lines), size, font)))

/** The legend's width: its words if it leads with them, then the six pieces side by side. */
export function ttLegendWidth(font: string, words: boolean): number {
  const icons = TT_PIECES.length * TT_LEGEND_ICON + (TT_PIECES.length - 1) * TT_LEGEND_ICON_GAP
  return words ? ttTextWidth(TT_LEGEND_WORD, TT_LEGEND_SIZE, ttLegendSpec(font)) + TT_LEGEND_WORD_GAP + icons : icons
}

/** The legend on a panel this wide: with its words if they fit, without them if not; null when even the pieces do not. */
export function planTtLegend(width: number, font: string): Omit<TtLegendPlan, 'top'> | null {
  const height = Math.max(TT_LEGEND_ICON, Math.ceil(ttLineHeight(TT_LEGEND_SIZE)))
  for (const words of [true, false]) {
    const legendWidth = ttLegendWidth(font, words)
    if (legendWidth <= width + 1e-6) return { words, width: legendWidth, height }
  }
  return null
}

function planAt(panel: Box, level: TtLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): TtPlan | null {
  const size = ttLevelSpec(level).size
  const countSize = Math.min(TT_COUNT_MAX, Math.max(TT_COUNT_MIN, Math.round(cell * COUNT_OF_CELL)))
  if (countSize > cell * 0.8) return null
  const countGap = Math.max(6, Math.round(countSize * 0.35))
  const rowCountWidth = Math.ceil(countSize * 1.2)
  const colCountHeight = Math.ceil(ttLineHeight(countSize))
  const legend = planTtLegend(panel.width, font)
  if (!legend) return null

  const signHeight = Math.ceil(ttLineHeight(signSize, signLines)) + TT_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(TT_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + colCountHeight + countGap + gridSide + TT_LEGEND_GAP + legend.height
  const puzzleWidth = gridSide + countGap + rowCountWidth
  const widest = Math.max(puzzleWidth, widestSign(signSize, signLines, font), legend.width)
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  // The board is what the eye centres on; the row numbers take the room to
  // its right unless that would push them off the panel.
  let gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  gridLeft = Math.min(gridLeft, Math.floor(panel.left + panel.width - gridSide - countGap - rowCountWidth))
  gridLeft = Math.max(gridLeft, Math.ceil(panel.left))
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap + colCountHeight + countGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + TT_LEGEND_GAP
  return {
    size,
    cell,
    countSize,
    countGap,
    rowCountWidth,
    colCountHeight,
    grid,
    signSize,
    signLines,
    signGap,
    signBand,
    legend: { ...legend, top: legendTop },
    block: { left: panel.left, top, width: panel.width, height: legendTop + legend.height - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planTtPage(panel: Box, level: TtLevel, font: string): TtPlan | null {
  const floor = Math.ceil(ttLevelSpec(level).minCell)
  // The sign on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [TT_SIGN_SIZE, 1],
    [TT_SIGN_MIN, 1],
    [TT_SIGN_SIZE, 2],
    [TT_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every rule lands on the same grid.
    for (let cell = TT_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a board is built. */
export function ttPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: TtLevel; font: string }): TtPlan | null {
  const { page, config, level, font } = options
  return planTtPage(ttPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — square and
 * number sizes, or that the trim is too small.
 */
export function ttPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: TtLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = ttLevelSpec(level)
  const lead = 'Every board is built fresh and proven to have one answer, reached by logic alone, with no guessing.'
  if (!page) return lead
  const plan = ttPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} boards at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, numbers ${pxToPt(plan.countSize)} pt.`
}
