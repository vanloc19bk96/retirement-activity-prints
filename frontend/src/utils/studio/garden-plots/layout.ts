import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { GP_GARDENS, gpBedWord, gpFlowerWord, gpInstruction, gpLevelSpec, gpSignText, type GpLevel } from './content'

/**
 * Where everything on a Garden Plots page goes.
 *
 * Top to bottom: the garden's sign, the garden (softly ruled squares, each
 * bed tinted and walled in by heavy lines), and a legend (a garden bed with
 * how many there are, and the flower the reader plants). Squares are as
 * large as the trim allows (up to 0.8 in) and never below the level's
 * floor. The page is planned from the level and the trim alone, before a
 * garden is grown, so every page of a run prints at the same size and the
 * form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const GP_HEADER_AIR = 10

/** Largest square worth printing — past this a 7 × 7 is a poster. */
export const GP_MAX_CELL = Math.round(inch(0.8))
/** A flower on the answer page, as a share of its square. */
export const GP_FLOWER_OF_CELL = 0.72
/** The heavy lines round every bed (and round the garden), px: 3 pt, twice the soft rules inside a bed and more. */
export const GP_WALL = 4

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const GP_SIGN_SIZE = ptToPx(16)
export const GP_SIGN_MIN = ptToPx(14)
export const GP_SIGN_PAD_X = 18
export const GP_SIGN_PAD_Y = 10
/** Air under the sign, before the garden: grows with the squares so the sign never crowds the garden. */
export const GP_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.45

/** The legend: 14 pt words beside icons half as tall again, on one row or two. */
export const GP_LEGEND_SIZE = ptToPx(14)
export const GP_LEGEND_ICON = Math.round(GP_LEGEND_SIZE * 1.5)
export const GP_LEGEND_ICON_GAP = 8
export const GP_LEGEND_ITEM_GAP = 32
export const GP_LEGEND_ROW_GAP = 10
/** Air between the garden and the legend. */
export const GP_LEGEND_GAP = 22

export const gpSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const gpLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface GpPlan {
  size: number
  cell: number
  /** The garden: `size` squares across and down. */
  grid: Box
  signSize: number
  /** The sign on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the garden. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the sign centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Sign, garden and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function gpContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function gpPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? GP_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function gpPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: GpLevel): Box {
  const content = gpContentBox(page)
  const header = measureHeaderHeight(config, gpInstruction(config, level), content.width)
  return gpPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const gpLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const gpTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a garden at a size. */
export function gpSignWidth(text: string, size: number, font: string): number {
  return gpTextWidth(text, size, gpSignSpec(font)) + GP_SIGN_PAD_X * 2
}

/** The widest sign any garden makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...GP_GARDENS.map((g) => gpSignWidth(gpSignText(g, lines), size, font)))

/** The legend's two entries' words: the bed the reader is given, the flower they plant. */
export const gpLegendWords = (size: number) => [gpBedWord(size), gpFlowerWord(size)] as const

/** Each legend entry's width: icon, gap, words. */
export function gpLegendItemWidths(size: number, font: string): [number, number] {
  const [bed, flower] = gpLegendWords(size)
  const item = (words: string) => GP_LEGEND_ICON + GP_LEGEND_ICON_GAP + gpTextWidth(words, GP_LEGEND_SIZE, gpLegendSpec(font))
  return [item(bed), item(flower)]
}

/** The legend's width on one row or two. */
export function gpLegendWidth(size: number, font: string, rows: 1 | 2): number {
  const [bed, flower] = gpLegendItemWidths(size, font)
  return rows === 1 ? bed + GP_LEGEND_ITEM_GAP + flower : Math.max(bed, flower)
}

/** One legend row's height. */
export const gpLegendRowHeight = () => Math.max(GP_LEGEND_ICON, Math.ceil(gpLineHeight(GP_LEGEND_SIZE)))

function planAt(panel: Box, level: GpLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): GpPlan | null {
  const size = gpLevelSpec(level).size
  const legendRows: 1 | 2 = gpLegendWidth(size, font, 1) <= panel.width ? 1 : 2
  const legendHeight = gpLegendRowHeight() * legendRows + (legendRows === 2 ? GP_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(gpLineHeight(signSize, signLines)) + GP_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(GP_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + gridSide + GP_LEGEND_GAP + legendHeight
  const widest = Math.max(gridSide, widestSign(signSize, signLines, font), gpLegendWidth(size, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + GP_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: GP_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planGpPage(panel: Box, level: GpLevel, font: string): GpPlan | null {
  const floor = Math.ceil(gpLevelSpec(level).minCell)
  // The sign on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [GP_SIGN_SIZE, 1],
    [GP_SIGN_MIN, 1],
    [GP_SIGN_SIZE, 2],
    [GP_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every wall lands on the same pixel grid.
    for (let cell = GP_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a garden is grown. */
export function gpPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: GpLevel; font: string }): GpPlan | null {
  const { page, config, level, font } = options
  return planGpPage(gpPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function gpPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: GpLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = gpLevelSpec(level)
  const lead = 'Every garden is grown fresh and proven to have one answer, reached by logic alone, no guessing.'
  if (!page) return lead
  const plan = gpPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} gardens at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the garden ${((plan.cell * plan.size) / DPI).toFixed(2)} in across.`
}
