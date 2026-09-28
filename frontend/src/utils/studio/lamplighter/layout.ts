import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_PANEL_FOOT_AIR, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { LAMP_HOMES, LAMP_LEGEND_SAMPLE, lampCountWord, lampInstruction, lampLevelSpec, lampSampleWord, lampSignText, type LampLevel } from './content'

/**
 * Where everything on a Lamplighter page goes.
 *
 * Top to bottom: the home's name board, the house (softly ruled white
 * squares and solid black walls in a heavy frame, a bold white number on
 * some walls), and a legend (a lamp with how many there are to place, and a
 * sample wall with what its number means). Squares are as large as the trim
 * allows (up to 0.8 in) and never below the level's floor; the numbers grow
 * with them and never print below 16 pt. The page is planned from the level
 * and the trim alone, before a house is built, so every page of a run
 * prints at the same size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the name board. */
export const LAMP_HEADER_AIR = 10

/** Largest square worth printing — past this a 7 × 7 is a poster. */
export const LAMP_MAX_CELL = Math.round(inch(0.8))
/** The house's frame, px: 3 pt. */
export const LAMP_FRAME = 4
/** The numbers on the walls: bold, a share of the square, 16–22 pt. */
export const LAMP_NUMBER_MIN = ptToPx(16)
const LAMP_NUMBER_MAX = ptToPx(22)
const NUMBER_OF_CELL = 0.5

/** The name board: bold, 16 pt, down to 14 pt on a narrow trim. */
export const LAMP_SIGN_SIZE = ptToPx(16)
export const LAMP_SIGN_MIN = ptToPx(14)
export const LAMP_SIGN_PAD_X = 18
export const LAMP_SIGN_PAD_Y = 10
/** Air under the board, before the house: grows with the squares so the board never crowds the house. */
export const LAMP_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.45

/** The legend: 14 pt words beside icons half as tall again, on one row or two. */
export const LAMP_LEGEND_SIZE = ptToPx(14)
export const LAMP_LEGEND_ICON = Math.round(LAMP_LEGEND_SIZE * 1.5)
export const LAMP_LEGEND_ICON_GAP = 8
export const LAMP_LEGEND_ITEM_GAP = 32
export const LAMP_LEGEND_ROW_GAP = 10
/** Air between the house and the legend. */
export const LAMP_LEGEND_GAP = 24

export const lampNumberSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const lampSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const lampLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface LampPlan {
  size: number
  cell: number
  /** The house: `size` squares across and down. */
  grid: Box
  /** The numbers on the walls, px. */
  numberSize: number
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the board and the house. */
  signGap: number
  /** The band the board sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Board, house and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function lampContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function lampPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? LAMP_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air - STUDIO_PANEL_FOOT_AIR) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function lampPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: LampLevel): Box {
  const content = lampContentBox(page)
  const header = measureHeaderHeight(config, lampInstruction(config, level), content.width)
  return lampPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const lampLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const lampTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The numbers' size for a square: half the square, 16–22 pt. */
export const lampNumberSizeFor = (cell: number) => Math.max(LAMP_NUMBER_MIN, Math.min(LAMP_NUMBER_MAX, Math.round(cell * NUMBER_OF_CELL)))

/** The board's outer width for a home at a size. */
export function lampSignWidth(text: string, size: number, font: string): number {
  return lampTextWidth(text, size, lampSignSpec(font)) + LAMP_SIGN_PAD_X * 2
}

/** The widest board any home makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...LAMP_HOMES.map((h) => lampSignWidth(lampSignText(h, lines), size, font)))

/** The most lamps a house of the size can need (no two in one square's row and column run: at most one per square in a checkerboard's half). */
export const lampMostLamps = (size: number) => Math.ceil((size * size) / 2)

/** The legend's two entries' words: the lamps (planned at the most a house can need), and the sample wall. */
export const lampLegendWords = (lamps: number) => [lampCountWord(lamps), lampSampleWord(LAMP_LEGEND_SAMPLE)] as const

/** Each legend entry's width: icon, gap, words (the lamp count at its widest). */
export function lampLegendItemWidths(size: number, font: string): [number, number] {
  const [count, sample] = lampLegendWords(lampMostLamps(size))
  const words = (text: string) => lampTextWidth(text, LAMP_LEGEND_SIZE, lampLegendSpec(font))
  return [LAMP_LEGEND_ICON + LAMP_LEGEND_ICON_GAP + words(count), LAMP_LEGEND_ICON + LAMP_LEGEND_ICON_GAP + words(sample)]
}

/** The legend's width on one row or two. */
export function lampLegendWidth(size: number, font: string, rows: 1 | 2): number {
  const [count, sample] = lampLegendItemWidths(size, font)
  return rows === 1 ? count + LAMP_LEGEND_ITEM_GAP + sample : Math.max(count, sample)
}

/** One legend row's height. */
export const lampLegendRowHeight = () => Math.max(LAMP_LEGEND_ICON, Math.ceil(lampLineHeight(LAMP_LEGEND_SIZE)))

function planAt(panel: Box, level: LampLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): LampPlan | null {
  const size = lampLevelSpec(level).size
  const legendRows: 1 | 2 = lampLegendWidth(size, font, 1) <= panel.width ? 1 : 2
  const legendHeight = lampLegendRowHeight() * legendRows + (legendRows === 2 ? LAMP_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(lampLineHeight(signSize, signLines)) + LAMP_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(LAMP_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + gridSide + LAMP_LEGEND_GAP + legendHeight
  const widest = Math.max(gridSide, widestSign(signSize, signLines, font), lampLegendWidth(size, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + LAMP_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    numberSize: lampNumberSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: LAMP_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planLampPage(panel: Box, level: LampLevel, font: string): LampPlan | null {
  const floor = Math.ceil(lampLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [LAMP_SIGN_SIZE, 1],
    [LAMP_SIGN_MIN, 1],
    [LAMP_SIGN_SIZE, 2],
    [LAMP_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every rule lands on the same pixel grid.
    for (let cell = LAMP_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a house is built. */
export function lampPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: LampLevel; font: string }): LampPlan | null {
  const { page, config, level, font } = options
  return planLampPage(lampPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function lampPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: LampLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = lampLevelSpec(level)
  const lead = 'Every house is built fresh and proven to have one answer, reached by logic alone, with no guessing.'
  if (!page) return lead
  const plan = lampPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} houses at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the house ${((plan.cell * plan.size) / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.numberSize)} pt.`
}
