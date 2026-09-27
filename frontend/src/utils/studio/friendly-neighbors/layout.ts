import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import {
  NEIGHBORS_BLOCK_WORD,
  NEIGHBORS_LEGEND_BLOCK,
  NEIGHBORS_STREETS,
  NEIGHBORS_TOUCH_WORD,
  neighborsInstruction,
  neighborsLevelSpec,
  neighborsSignText,
  type NeighborsLevel,
} from './content'

/**
 * Where everything on a Friendly Neighbors page goes.
 *
 * Top to bottom: the street's sign, the town (houses on a square pitch,
 * gathered into rounded blocks with a street between every two blocks), and
 * a legend (a block of three houses numbered 1, 2, 3, and two houses either
 * side of a street that may not match). Houses are as large as the trim allows (up
 * to 0.8 in apart) and never below the level's floor; the numbers grow with
 * them, never below 16 pt. The page is planned from the level and the trim
 * alone, before a town is built, so every page of a run prints at the same
 * size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const NEIGHBORS_HEADER_AIR = 10

/** Largest house pitch worth printing — past this a 6 × 6 is a poster. */
export const NEIGHBORS_MAX_CELL = Math.round(inch(0.8))

/** The numbers: bold, a little under half a house, 16–24 pt. */
export const NEIGHBORS_DIGIT_MIN = ptToPx(16)
const NEIGHBORS_DIGIT_MAX = ptToPx(24)
const DIGIT_OF_CELL = 0.46

/** The street between two blocks, as a share of the pitch (never under 6 px). */
const STREET_OF_CELL = 0.16
export const NEIGHBORS_STREET_MIN = 6
/** A block's rounded outer corner, as a share of a house. */
const RADIUS_OF_HOUSE = 0.2

/** A block's outline, and the fine lines between its houses. */
export const NEIGHBORS_BLOCK_STROKE = 2.5
export const NEIGHBORS_HOUSE_STROKE = 1.5

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const NEIGHBORS_SIGN_SIZE = ptToPx(16)
export const NEIGHBORS_SIGN_MIN = ptToPx(14)
export const NEIGHBORS_SIGN_PAD_X = 18
export const NEIGHBORS_SIGN_PAD_Y = 10
/** Air under the sign, before the town: grows with the houses so the sign never crowds them. */
export const NEIGHBORS_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside little houses, on one row or two. */
export const NEIGHBORS_LEGEND_SIZE = ptToPx(14)
/** A legend house, with room round its number. */
export const NEIGHBORS_LEGEND_HOUSE = Math.round(NEIGHBORS_LEGEND_SIZE * 1.6)
/** The street round the legend's block of three. */
export const NEIGHBORS_LEGEND_STREET = 6
/** The street between the legend's two neighbours: wide enough to cross out. */
export const NEIGHBORS_LEGEND_TWIN_STREET = 12
/** The legend's sample block: three houses in a row. */
export const NEIGHBORS_LEGEND_BLOCK_WIDTH = NEIGHBORS_LEGEND_HOUSE * NEIGHBORS_LEGEND_BLOCK.length
/** The legend's two houses side by side, a street apart. */
export const NEIGHBORS_LEGEND_TWIN_WIDTH = NEIGHBORS_LEGEND_HOUSE * 2 + NEIGHBORS_LEGEND_TWIN_STREET
export const NEIGHBORS_LEGEND_ICON_GAP = 10
export const NEIGHBORS_LEGEND_ITEM_GAP = 28
export const NEIGHBORS_LEGEND_ROW_GAP = 10
/** Air between the town and the legend. */
export const NEIGHBORS_LEGEND_GAP = 24

export const neighborsDigitSpec = (weight = 700): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: weight })
export const neighborsSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const neighborsLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface NeighborsPlan {
  size: number
  /** House pitch: from one house's left edge to the next one's, street included. */
  cell: number
  /** The town's square: `size` pitches across and down. */
  grid: Box
  /** The street between two blocks (half of it falls to each side). */
  street: number
  /** A block's rounded outer corner, and its inner corner (never wider than half a street). */
  radius: number
  inner: number
  /** The numbers, px. */
  digitSize: number
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the town. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Sign, town and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function neighborsContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function neighborsPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? NEIGHBORS_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function neighborsPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: NeighborsLevel): Box {
  const content = neighborsContentBox(page)
  const header = measureHeaderHeight(config, neighborsInstruction(config, level), content.width)
  return neighborsPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const neighborsLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const neighborsTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The numbers' size for a house pitch: a little under half of it, 16–24 pt. */
export const neighborsDigitSizeFor = (cell: number) => Math.max(NEIGHBORS_DIGIT_MIN, Math.min(NEIGHBORS_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** The street between blocks for a pitch. */
export const neighborsStreetFor = (cell: number) => Math.max(NEIGHBORS_STREET_MIN, Math.round(cell * STREET_OF_CELL))

/** The sign's outer width for a street at a size. */
export function neighborsSignWidth(text: string, size: number, font: string): number {
  return neighborsTextWidth(text, size, neighborsSignSpec(font)) + NEIGHBORS_SIGN_PAD_X * 2
}

/** The widest sign any street makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...NEIGHBORS_STREETS.map((w) => neighborsSignWidth(neighborsSignText(w, lines), size, font)))

/** Each legend entry's width: icon, gap, words. */
export function neighborsLegendItemWidths(font: string): [number, number] {
  const words = (text: string) => neighborsTextWidth(text, NEIGHBORS_LEGEND_SIZE, neighborsLegendSpec(font))
  return [
    NEIGHBORS_LEGEND_BLOCK_WIDTH + NEIGHBORS_LEGEND_ICON_GAP + words(NEIGHBORS_BLOCK_WORD),
    NEIGHBORS_LEGEND_TWIN_WIDTH + NEIGHBORS_LEGEND_ICON_GAP + words(NEIGHBORS_TOUCH_WORD),
  ]
}

/** The legend's width on one row or two. */
export function neighborsLegendWidth(font: string, rows: 1 | 2): number {
  const [block, touch] = neighborsLegendItemWidths(font)
  return rows === 1 ? block + NEIGHBORS_LEGEND_ITEM_GAP + touch : Math.max(block, touch)
}

/** One legend row's height: a little house, or a line of words, whichever is taller. */
export const neighborsLegendRowHeight = () => Math.max(NEIGHBORS_LEGEND_HOUSE, Math.ceil(neighborsLineHeight(NEIGHBORS_LEGEND_SIZE)))

function planAt(panel: Box, level: NeighborsLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): NeighborsPlan | null {
  const size = neighborsLevelSpec(level).size
  const legendRows: 1 | 2 = neighborsLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = neighborsLegendRowHeight() * legendRows + (legendRows === 2 ? NEIGHBORS_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(neighborsLineHeight(signSize, signLines)) + NEIGHBORS_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(NEIGHBORS_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const side = size * cell
  const blockHeight = signHeight + signGap + side + NEIGHBORS_LEGEND_GAP + legendHeight
  const widest = Math.max(side, widestSign(signSize, signLines, font), neighborsLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - side) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: side, height: side }
  const street = neighborsStreetFor(cell)
  const legendTop = gridTop + side + NEIGHBORS_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    street,
    radius: Math.round((cell - street) * RADIUS_OF_HOUSE),
    inner: Math.floor(street / 2),
    digitSize: neighborsDigitSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: NEIGHBORS_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest houses the panel allows at the level, or null when even its floor will not fit. */
export function planNeighborsPage(panel: Box, level: NeighborsLevel, font: string): NeighborsPlan | null {
  const floor = Math.ceil(neighborsLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [NEIGHBORS_SIGN_SIZE, 1],
    [NEIGHBORS_SIGN_MIN, 1],
    [NEIGHBORS_SIGN_SIZE, 2],
    [NEIGHBORS_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every house lands on the same pixel grid.
    for (let cell = NEIGHBORS_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a town is built. */
export function neighborsPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: NeighborsLevel; font: string }): NeighborsPlan | null {
  const { page, config, level, font } = options
  return planNeighborsPage(neighborsPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the house
 * size, or that the trim is too small.
 */
export function neighborsPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: NeighborsLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = neighborsLevelSpec(level)
  const lead = 'Every town is built fresh and proven to have one answer, reached by logic alone — no guessing.'
  if (!page) return lead
  const plan = neighborsPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} towns at large print — choose a larger page in Settings or an easier level.`
  return `${lead} Houses print ${(plan.cell / DPI).toFixed(2)} in apart, the town ${(plan.grid.width / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.digitSize)} pt.`
}
