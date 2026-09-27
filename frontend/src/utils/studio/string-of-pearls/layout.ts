import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { PEARL_BLACK_WORD, PEARL_NECKLACES, PEARL_WHITE_WORD, pearlInstruction, pearlLevelSpec, pearlSignText, type PearlLevel } from './content'

/**
 * Where everything on a String of Pearls page goes.
 *
 * Top to bottom: the necklace's name board, the board (softly ruled white
 * squares in a heavy frame, white and black pearls in some), and a legend
 * (a white pearl and a black pearl, with what each asks of the loop).
 * Squares are as large as the trim allows (up to 0.8 in) and never below
 * the level's floor; the pearls grow with them. The page is planned from
 * the level and the trim alone, before a board is built, so every page of
 * a run prints at the same size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the name board. */
export const PEARL_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const PEARL_MAX_CELL = Math.round(inch(0.8))
/** The board's frame, px: 3 pt. */
export const PEARL_FRAME = 4
/** A pearl's radius, as a share of its square: big enough to read at arm's length, clear of the loop's pencil line round it. */
export const PEARL_RADIUS_OF_CELL = 0.3

/** The name board: bold, 16 pt, down to 14 pt on a narrow trim. */
export const PEARL_SIGN_SIZE = ptToPx(16)
export const PEARL_SIGN_MIN = ptToPx(14)
export const PEARL_SIGN_PAD_X = 18
export const PEARL_SIGN_PAD_Y = 10
/** Air under the board, before the grid: grows with the squares so the board never crowds the grid. */
export const PEARL_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.45

/** The legend: 14 pt words beside pearls half as tall again, on one row or two. */
export const PEARL_LEGEND_SIZE = ptToPx(14)
export const PEARL_LEGEND_ICON = Math.round(PEARL_LEGEND_SIZE * 1.5)
export const PEARL_LEGEND_ICON_GAP = 8
export const PEARL_LEGEND_ITEM_GAP = 32
export const PEARL_LEGEND_ROW_GAP = 10
/** Air between the grid and the legend. */
export const PEARL_LEGEND_GAP = 24

export const pearlSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const pearlLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface PearlPlan {
  size: number
  cell: number
  /** The board: `size` squares across and down. */
  grid: Box
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the name board and the grid. */
  signGap: number
  /** The band the name board sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Name board, grid and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function pearlContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function pearlPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? PEARL_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function pearlPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: PearlLevel): Box {
  const content = pearlContentBox(page)
  const header = measureHeaderHeight(config, pearlInstruction(config, level), content.width)
  return pearlPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const pearlLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const pearlTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The name board's outer width for a necklace at a size. */
export function pearlSignWidth(text: string, size: number, font: string): number {
  return pearlTextWidth(text, size, pearlSignSpec(font)) + PEARL_SIGN_PAD_X * 2
}

/** The widest name board any necklace makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...PEARL_NECKLACES.map((h) => pearlSignWidth(pearlSignText(h, lines), size, font)))

/** Each legend entry's width: pearl, gap, words. */
export function pearlLegendItemWidths(font: string): [number, number] {
  const words = (text: string) => pearlTextWidth(text, PEARL_LEGEND_SIZE, pearlLegendSpec(font))
  return [PEARL_LEGEND_ICON + PEARL_LEGEND_ICON_GAP + words(PEARL_WHITE_WORD), PEARL_LEGEND_ICON + PEARL_LEGEND_ICON_GAP + words(PEARL_BLACK_WORD)]
}

/** The legend's width on one row or two. */
export function pearlLegendWidth(font: string, rows: 1 | 2): number {
  const [white, black] = pearlLegendItemWidths(font)
  return rows === 1 ? white + PEARL_LEGEND_ITEM_GAP + black : Math.max(white, black)
}

/** One legend row's height. */
export const pearlLegendRowHeight = () => Math.max(PEARL_LEGEND_ICON, Math.ceil(pearlLineHeight(PEARL_LEGEND_SIZE)))

function planAt(panel: Box, level: PearlLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): PearlPlan | null {
  const size = pearlLevelSpec(level).size
  const legendRows: 1 | 2 = pearlLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = pearlLegendRowHeight() * legendRows + (legendRows === 2 ? PEARL_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(pearlLineHeight(signSize, signLines)) + PEARL_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(PEARL_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + gridSide + PEARL_LEGEND_GAP + legendHeight
  const widest = Math.max(gridSide, widestSign(signSize, signLines, font), pearlLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + PEARL_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: PEARL_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planPearlPage(panel: Box, level: PearlLevel, font: string): PearlPlan | null {
  const floor = Math.ceil(pearlLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [PEARL_SIGN_SIZE, 1],
    [PEARL_SIGN_MIN, 1],
    [PEARL_SIGN_SIZE, 2],
    [PEARL_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every rule lands on the same pixel grid.
    for (let cell = PEARL_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a board is built. */
export function pearlPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: PearlLevel; font: string }): PearlPlan | null {
  const { page, config, level, font } = options
  return planPearlPage(pearlPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function pearlPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: PearlLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = pearlLevelSpec(level)
  const lead = 'Every board is built fresh and proven to have one necklace, reached by logic alone, with no guessing.'
  if (!page) return lead
  const plan = pearlPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} boards at large print. Choose a larger page in Settings or an easier level.`
  const pearl = (plan.cell * PEARL_RADIUS_OF_CELL * 2) / DPI
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the board ${((plan.cell * plan.size) / DPI).toFixed(2)} in across, pearls ${pearl.toFixed(2)} in wide.`
}
