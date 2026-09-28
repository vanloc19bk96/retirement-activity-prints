import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_PANEL_FOOT_AIR } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { SM_ALIKE_WORD, SM_DAYS, SM_OPPOSITE_WORD, smInstruction, smLevelSpec, smSignText, type SmLevel } from './content'

/**
 * Where everything on a Sun & Moon page goes.
 *
 * Top to bottom: the day's sign, the grid (soft gray lines in a black
 * frame, printed squares tinted pale gray, the signs = and × sitting on the
 * lines between squares), and a legend (two squares joined by =, both suns,
 * and two joined by ×, a sun and a moon). Squares are as large as the trim
 * allows (up to 0.8 in) and never below the level's floor; suns, moons and
 * signs grow with them. The page is planned from the level and the trim
 * alone, before a grid is built, so every page of a run prints at the same
 * size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const SM_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const SM_MAX_CELL = Math.round(inch(0.8))
/** A sun or a moon, as a share of its square: room all round for the signs on the lines. */
export const SM_SYMBOL_OF_CELL = 0.5
/** A sign's white disc on the line, as a share of the square (radius), and never under 8 px: = and × must read at arm's length. */
export const SM_BADGE_OF_CELL = 0.19
export const SM_BADGE_MIN = 8
/** The frame round the grid, px. */
export const SM_FRAME = 3

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const SM_SIGN_SIZE = ptToPx(16)
export const SM_SIGN_MIN = ptToPx(14)
export const SM_SIGN_PAD_X = 18
export const SM_SIGN_PAD_Y = 10
/** Air under the sign, before the grid: grows with the squares so the sign never crowds the grid. */
export const SM_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside two little joined squares, on one row or two. */
export const SM_LEGEND_SIZE = ptToPx(14)
/** A legend square: roomy enough for its sun or moon. */
export const SM_LEGEND_SQUARE = Math.round(SM_LEGEND_SIZE * 1.8)
/** The legend's two joined squares, side by side. */
export const SM_LEGEND_PAIR_WIDTH = SM_LEGEND_SQUARE * 2
export const SM_LEGEND_ICON_GAP = 10
export const SM_LEGEND_ITEM_GAP = 32
export const SM_LEGEND_ROW_GAP = 10
/** Air between the grid and the legend. */
export const SM_LEGEND_GAP = 24

export const smSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const smLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface SmPlan {
  size: number
  cell: number
  /** The grid: `size` squares across and down. */
  grid: Box
  /** A sun or a moon's box side. */
  symbol: number
  /** A sign's white disc, radius. */
  badge: number
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
export function smContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function smPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? SM_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air - STUDIO_PANEL_FOOT_AIR) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function smPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: SmLevel): Box {
  const content = smContentBox(page)
  const header = measureHeaderHeight(config, smInstruction(config, level), content.width)
  return smPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const smLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const smTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a day at a size. */
export function smSignWidth(text: string, size: number, font: string): number {
  return smTextWidth(text, size, smSignSpec(font)) + SM_SIGN_PAD_X * 2
}

/** The widest sign any day makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...SM_DAYS.map((d) => smSignWidth(smSignText(d, lines), size, font)))

/** Each legend entry's width: two joined squares, gap, words. */
export function smLegendItemWidths(font: string): [number, number] {
  const item = (words: string) => SM_LEGEND_PAIR_WIDTH + SM_LEGEND_ICON_GAP + smTextWidth(words, SM_LEGEND_SIZE, smLegendSpec(font))
  return [item(SM_ALIKE_WORD), item(SM_OPPOSITE_WORD)]
}

/** The legend's width on one row or two. */
export function smLegendWidth(font: string, rows: 1 | 2): number {
  const [alike, opposite] = smLegendItemWidths(font)
  return rows === 1 ? alike + SM_LEGEND_ITEM_GAP + opposite : Math.max(alike, opposite)
}

/** One legend row's height: a little square, or a line of words, whichever is taller. */
export const smLegendRowHeight = () => Math.max(SM_LEGEND_SQUARE, Math.ceil(smLineHeight(SM_LEGEND_SIZE)))

/** A sign's white disc for a square size. */
export const smBadgeFor = (cell: number) => Math.max(SM_BADGE_MIN, Math.round(cell * SM_BADGE_OF_CELL * 2) / 2)

function planAt(panel: Box, level: SmLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): SmPlan | null {
  const size = smLevelSpec(level).size
  const legendRows: 1 | 2 = smLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = smLegendRowHeight() * legendRows + (legendRows === 2 ? SM_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(smLineHeight(signSize, signLines)) + SM_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(SM_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const side = size * cell
  const blockHeight = signHeight + signGap + side + SM_LEGEND_GAP + legendHeight
  const widest = Math.max(side, widestSign(signSize, signLines, font), smLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - side) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: side, height: side }
  const legendTop = gridTop + side + SM_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    symbol: Math.round(cell * SM_SYMBOL_OF_CELL),
    badge: smBadgeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: SM_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planSmPage(panel: Box, level: SmLevel, font: string): SmPlan | null {
  const floor = Math.ceil(smLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [SM_SIGN_SIZE, 1],
    [SM_SIGN_MIN, 1],
    [SM_SIGN_SIZE, 2],
    [SM_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every line lands on the same pixel grid.
    for (let cell = SM_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is built. */
export function smPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: SmLevel; font: string }): SmPlan | null {
  const { page, config, level, font } = options
  return planSmPage(smPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function smPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: SmLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = smLevelSpec(level)
  const lead = 'Every grid is built fresh and proven to have one answer, reached by logic alone, no guessing.'
  if (!page) return lead
  const plan = smPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} grids at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the grid ${(plan.grid.width / DPI).toFixed(2)} in across.`
}
