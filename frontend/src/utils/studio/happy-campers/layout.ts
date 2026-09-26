import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { HC_CAMPGROUNDS, HC_TREE_WORD, hcInstruction, hcLevelSpec, hcSignText, hcTentWord, type HcLevel } from './content'

/**
 * Where everything on a Happy Campers page goes.
 *
 * Top to bottom: the campground's sign, the column numbers, the grid with
 * the row numbers to its left, and a one-line legend (the tree the reader
 * is given, the tent they draw, and how many to pitch). Squares are as large
 * as the trim allows (up to 0.8 in) and never below the level's floor; the
 * numbers grow with them and never print below 16 pt. The page is planned
 * from the level and the trim alone, before a grid is drawn, so every page
 * of a run prints at the same size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const HC_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const HC_MAX_CELL = Math.round(inch(0.8))
/** The row and column numbers: a share of the square, 16–22 pt. */
export const HC_COUNT_MIN = ptToPx(16)
const HC_COUNT_MAX = ptToPx(22)
const COUNT_OF_CELL = 0.55

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const HC_SIGN_SIZE = ptToPx(16)
export const HC_SIGN_MIN = ptToPx(14)
export const HC_SIGN_PAD_X = 16
export const HC_SIGN_PAD_Y = 7
const SIGN_GAP = 18

/** The legend: 14 pt words beside icons half as tall again. */
export const HC_LEGEND_SIZE = ptToPx(14)
export const HC_LEGEND_ICON = Math.round(HC_LEGEND_SIZE * 1.5)
export const HC_LEGEND_ICON_GAP = 6
export const HC_LEGEND_ITEM_GAP = 28
const LEGEND_GAP = 18

export const hcCountSpec = (): FontSpec => ({ fontWeight: 700 })
export const hcSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const hcLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface HcPlan {
  size: number
  cell: number
  countSize: number
  /** Between the numbers and the grid. */
  countGap: number
  rowCountWidth: number
  colCountHeight: number
  grid: Box
  signSize: number
  /** The sign on one line, or the name over "Campground" when one line is too wide. */
  signLines: 1 | 2
  /** The band the sign sits in (its width is the panel's; the sign centres in it). */
  signBand: Box
  legendSize: number
  legendTop: number
  legendHeight: number
  /** Sign, numbers, grid and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function hcContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function hcPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? HC_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function hcPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: HcLevel): Box {
  const content = hcContentBox(page)
  const header = measureHeaderHeight(config, hcInstruction(config, level), content.width)
  return hcPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const hcLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps "Campground" onto a
 * second line.
 */
export const hcTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a campground at a size. */
export function hcSignWidth(text: string, size: number, font: string): number {
  return hcTextWidth(text, size, hcSignSpec(font)) + HC_SIGN_PAD_X * 2
}

/** The widest sign any campground makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...HC_CAMPGROUNDS.map((c) => hcSignWidth(hcSignText(c, lines), size, font)))

/** One legend entry's words, and their width. */
export const hcLegendWords = (tents: number) => [HC_TREE_WORD, hcTentWord(tents)] as const
export function hcLegendWidth(tents: number, font: string): number {
  const [tree, tent] = hcLegendWords(tents)
  const words = hcTextWidth(tree, HC_LEGEND_SIZE, hcLegendSpec(font)) + hcTextWidth(tent, HC_LEGEND_SIZE, hcLegendSpec(font))
  return HC_LEGEND_ICON * 2 + HC_LEGEND_ICON_GAP * 2 + HC_LEGEND_ITEM_GAP + words
}

function planAt(panel: Box, level: HcLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): HcPlan | null {
  const spec = hcLevelSpec(level)
  const size = spec.size
  const countSize = Math.min(HC_COUNT_MAX, Math.max(HC_COUNT_MIN, Math.round(cell * COUNT_OF_CELL)))
  if (countSize > cell * 0.8) return null
  const countGap = Math.max(6, Math.round(countSize * 0.35))
  const rowCountWidth = Math.ceil(countSize * 1.2)
  const colCountHeight = Math.ceil(hcLineHeight(countSize))

  const signHeight = Math.ceil(hcLineHeight(signSize, signLines)) + HC_SIGN_PAD_Y * 2
  const legendHeight = Math.max(HC_LEGEND_ICON, Math.ceil(hcLineHeight(HC_LEGEND_SIZE)))
  const gridSide = size * cell
  const blockHeight = signHeight + SIGN_GAP + colCountHeight + countGap + gridSide + LEGEND_GAP + legendHeight
  const puzzleWidth = rowCountWidth + countGap + gridSide
  const widest = Math.max(puzzleWidth, widestSign(signSize, signLines, font), hcLegendWidth(spec.maxTents, font))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  // The grid is what the eye centres on; the row numbers take the room to
  // its left unless that would push them off the panel.
  let gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  gridLeft = Math.max(gridLeft, Math.ceil(panel.left + rowCountWidth + countGap))
  gridLeft = Math.min(gridLeft, Math.floor(panel.left + panel.width - gridSide))
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + SIGN_GAP + colCountHeight + countGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + LEGEND_GAP
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
    signBand,
    legendSize: HC_LEGEND_SIZE,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planHcPage(panel: Box, level: HcLevel, font: string): HcPlan | null {
  const floor = Math.ceil(hcLevelSpec(level).minCell)
  // The sign on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [HC_SIGN_SIZE, 1],
    [HC_SIGN_MIN, 1],
    [HC_SIGN_SIZE, 2],
    [HC_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every rule lands on the same grid.
    for (let cell = HC_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is drawn. */
export function hcPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: HcLevel; font: string }): HcPlan | null {
  const { page, config, level, font } = options
  return planHcPage(hcPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — square and
 * number sizes, or that the trim is too small.
 */
export function hcPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: HcLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = hcLevelSpec(level)
  const lead = 'Every grid is built fresh and proven to have one answer, reached by logic alone — no guessing.'
  if (!page) return lead
  const plan = hcPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} grids at large print — choose a larger page in Settings or an easier level.`
  return `${lead} Squares print at ${(plan.cell / DPI).toFixed(2)} in, numbers at ${pxToPt(plan.countSize)} pt.`
}
