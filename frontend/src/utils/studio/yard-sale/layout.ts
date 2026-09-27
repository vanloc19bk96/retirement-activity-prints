import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { YS_LEGEND_PAIR, YS_LEGEND_TWINS, YS_REPEAT_WORD, YS_SALES, YS_TOUCH_WORD, ysInstruction, ysLevelSpec, ysSignText, type YsLevel } from './content'

/**
 * Where everything on a Yard Sale page goes.
 *
 * Top to bottom: the sale's sign, the grid (soft gray lines in a black
 * frame, a bold number in every square), and a legend (two squares, 4 4,
 * with one 4 shaded — "shade one" — and two shaded squares side by side,
 * crossed out — "never touch"). Squares are as large as the trim allows
 * (up to 0.8 in) and never below the level's floor; the numbers grow with
 * them, never below 16 pt. The page is planned from the level and the trim
 * alone, before a grid is built, so every page of a run prints at the same
 * size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const YS_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const YS_MAX_CELL = Math.round(inch(0.8))
/** The frame round the grid, px. */
export const YS_FRAME = 3

/** The numbers: bold, a little under half a square, 16–26 pt. */
export const YS_DIGIT_MIN = ptToPx(16)
const YS_DIGIT_MAX = ptToPx(26)
const DIGIT_OF_CELL = 0.46

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const YS_SIGN_SIZE = ptToPx(16)
export const YS_SIGN_MIN = ptToPx(14)
export const YS_SIGN_PAD_X = 18
export const YS_SIGN_PAD_Y = 10
/** Air under the sign, before the grid: grows with the squares so the sign never crowds the grid. */
export const YS_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside little squares, on one row or two. */
export const YS_LEGEND_SIZE = ptToPx(14)
/** A legend square: roomy enough for its number. */
export const YS_LEGEND_SQUARE = Math.round(YS_LEGEND_SIZE * 1.8)
/** The legend's sample repeat, and its two shaded squares. */
export const YS_LEGEND_PAIR_WIDTH = YS_LEGEND_SQUARE * YS_LEGEND_PAIR.length
export const YS_LEGEND_TWINS_WIDTH = YS_LEGEND_SQUARE * YS_LEGEND_TWINS.length
export const YS_LEGEND_ICON_GAP = 10
export const YS_LEGEND_ITEM_GAP = 28
export const YS_LEGEND_ROW_GAP = 10
/** Air between the grid and the legend. */
export const YS_LEGEND_GAP = 24

export const ysDigitSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const ysSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const ysLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface YsPlan {
  size: number
  cell: number
  /** The grid: `size` squares across and down. */
  grid: Box
  /** The numbers, px. */
  digitSize: number
  signSize: number
  /** The sign on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the grid. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the sign centres in it). */
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
export function ysContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function ysPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? YS_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function ysPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: YsLevel): Box {
  const content = ysContentBox(page)
  const header = measureHeaderHeight(config, ysInstruction(config, level), content.width)
  return ysPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const ysLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const ysTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a sale at a size. */
export function ysSignWidth(text: string, size: number, font: string): number {
  return ysTextWidth(text, size, ysSignSpec(font)) + YS_SIGN_PAD_X * 2
}

/** The widest sign any sale makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...YS_SALES.map((s) => ysSignWidth(ysSignText(s, lines), size, font)))

/** Each legend entry's width: its little squares, gap, words. */
export function ysLegendItemWidths(font: string): [number, number] {
  const words = (text: string) => YS_LEGEND_ICON_GAP + ysTextWidth(text, YS_LEGEND_SIZE, ysLegendSpec(font))
  return [YS_LEGEND_PAIR_WIDTH + words(YS_REPEAT_WORD), YS_LEGEND_TWINS_WIDTH + words(YS_TOUCH_WORD)]
}

/** The legend's width on one row or two. */
export function ysLegendWidth(font: string, rows: 1 | 2): number {
  const [repeat, touch] = ysLegendItemWidths(font)
  return rows === 1 ? repeat + YS_LEGEND_ITEM_GAP + touch : Math.max(repeat, touch)
}

/** One legend row's height: a little square, or a line of words, whichever is taller. */
export const ysLegendRowHeight = () => Math.max(YS_LEGEND_SQUARE, Math.ceil(ysLineHeight(YS_LEGEND_SIZE)))

/** The numbers' size for a square size. */
export const ysDigitSizeFor = (cell: number) => Math.max(YS_DIGIT_MIN, Math.min(YS_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

function planAt(panel: Box, level: YsLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): YsPlan | null {
  const size = ysLevelSpec(level).size
  const legendRows: 1 | 2 = ysLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = ysLegendRowHeight() * legendRows + (legendRows === 2 ? YS_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(ysLineHeight(signSize, signLines)) + YS_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(YS_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const side = size * cell
  const blockHeight = signHeight + signGap + side + YS_LEGEND_GAP + legendHeight
  const widest = Math.max(side, widestSign(signSize, signLines, font), ysLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - side) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: side, height: side }
  const legendTop = gridTop + side + YS_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    digitSize: ysDigitSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: YS_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planYsPage(panel: Box, level: YsLevel, font: string): YsPlan | null {
  const floor = Math.ceil(ysLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [YS_SIGN_SIZE, 1],
    [YS_SIGN_MIN, 1],
    [YS_SIGN_SIZE, 2],
    [YS_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every line lands on the same pixel grid.
    for (let cell = YS_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is built. */
export function ysPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: YsLevel; font: string }): YsPlan | null {
  const { page, config, level, font } = options
  return planYsPage(ysPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size and the numbers', or that the trim is too small.
 */
export function ysPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: YsLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = ysLevelSpec(level)
  const lead = 'Every grid is built fresh and proven to have one answer, reached by logic alone, with no guessing.'
  if (!page) return lead
  const plan = ysPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} grids at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the grid ${(plan.grid.width / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.digitSize)} pt.`
}
