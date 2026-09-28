import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_PANEL_FOOT_AIR, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { SKY_CITIES, SKY_LEGEND_SAMPLE, skyHeightsWord, skyInstruction, skyLevelSpec, skySampleWord, skySignText, type SkyLevel } from './content'

/**
 * Where everything on a Skyline Tour page goes.
 *
 * Top to bottom: the skyline's name board, the city (softly ruled plots in
 * a heavy frame, a few given heights in bold, and the clues standing in a
 * band all round it), and a legend (a little skyline with the heights to
 * place, and a sample clue with what it means). Plots are as large as the
 * trim allows (up to 0.8 in) and never below the level's floor; the clues
 * and givens grow with them and never print below 16 pt. The page is
 * planned from the level and the trim alone, before a city is built, so
 * every page of a run prints at the same size and the form's help line is
 * what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the name board. */
export const SKY_HEADER_AIR = 10

/** Largest plot worth printing — past this a 5 × 5 is a poster. */
export const SKY_MAX_CELL = Math.round(inch(0.8))
/** The city's frame, px: 3 pt. */
export const SKY_FRAME = 4

/** The clues and given heights: bold, half a plot, 16–22 pt. */
export const SKY_DIGIT_MIN = ptToPx(16)
const SKY_DIGIT_MAX = ptToPx(22)
const DIGIT_OF_CELL = 0.5

/** The heights on the answer page's buildings: a third of a plot, 12–18 pt. */
export const SKY_ANSWER_MIN = ptToPx(12)
const SKY_ANSWER_MAX = ptToPx(18)
const ANSWER_OF_CELL = 0.34

/** The band the clues stand in, round the city: most of a plot, and always room for a clue with air. */
const BAND_OF_CELL = 0.7
const BAND_AIR = 14

/** The name board: bold, 16 pt, down to 14 pt on a narrow trim. */
export const SKY_SIGN_SIZE = ptToPx(16)
export const SKY_SIGN_MIN = ptToPx(14)
export const SKY_SIGN_PAD_X = 18
export const SKY_SIGN_PAD_Y = 10
/** Air under the board, before the top clues: grows with the plots so the board never crowds them. */
export const SKY_SIGN_GAP_MIN = 18
const SIGN_GAP_OF_CELL = 0.25

/** The legend: 14 pt words beside icons half as tall again, on one row or two. */
export const SKY_LEGEND_SIZE = ptToPx(14)
export const SKY_LEGEND_ICON = Math.round(SKY_LEGEND_SIZE * 1.5)
/** The sample clue's icon: the number and an arrow looking in. */
export const SKY_LEGEND_CLUE_ICON = Math.round(SKY_LEGEND_ICON * 1.5)
export const SKY_LEGEND_ICON_GAP = 8
export const SKY_LEGEND_ITEM_GAP = 32
export const SKY_LEGEND_ROW_GAP = 10
/** Air between the bottom clues and the legend. */
export const SKY_LEGEND_GAP = 20

export const skyDigitSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const skySignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const skyLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface SkyPlan {
  size: number
  cell: number
  /** The clue band's depth on every side of the plots. */
  band: number
  /** The plots: `size` across and down. */
  grid: Box
  /** The plots with their clue bands round them. */
  city: Box
  /** The clues and given heights, px. */
  digitSize: number
  /** The heights on the answer page's buildings, px. */
  answerSize: number
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the board and the top clues. */
  signGap: number
  /** The band the board sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Board, city and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function skyContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function skyPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? SKY_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air - STUDIO_PANEL_FOOT_AIR) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function skyPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: SkyLevel): Box {
  const content = skyContentBox(page)
  const header = measureHeaderHeight(config, skyInstruction(config, level), content.width)
  return skyPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const skyLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const skyTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The clues' and givens' size for a plot: half the plot, 16–22 pt. */
export const skyDigitSizeFor = (cell: number) => Math.max(SKY_DIGIT_MIN, Math.min(SKY_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** The answer heights' size for a plot: a third of the plot, 12–18 pt. */
export const skyAnswerSizeFor = (cell: number) => Math.max(SKY_ANSWER_MIN, Math.min(SKY_ANSWER_MAX, Math.round(cell * ANSWER_OF_CELL)))

/** The clue band's depth for a plot. */
export const skyBandFor = (cell: number) => Math.max(Math.round(cell * BAND_OF_CELL), skyDigitSizeFor(cell) + BAND_AIR)

/** The board's outer width for a skyline at a size. */
export function skySignWidth(text: string, size: number, font: string): number {
  return skyTextWidth(text, size, skySignSpec(font)) + SKY_SIGN_PAD_X * 2
}

/** The widest board any skyline makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...SKY_CITIES.map((c) => skySignWidth(skySignText(c, lines), size, font)))

/** The legend's two entries' words: the heights, and the sample clue. */
export const skyLegendWords = (size: number) => [skyHeightsWord(size), skySampleWord(SKY_LEGEND_SAMPLE)] as const

/** Each legend entry's width: icon, gap, words. */
export function skyLegendItemWidths(size: number, font: string): [number, number] {
  const [heights, sample] = skyLegendWords(size)
  const words = (text: string) => skyTextWidth(text, SKY_LEGEND_SIZE, skyLegendSpec(font))
  return [SKY_LEGEND_ICON + SKY_LEGEND_ICON_GAP + words(heights), SKY_LEGEND_CLUE_ICON + SKY_LEGEND_ICON_GAP + words(sample)]
}

/** The legend's width on one row or two. */
export function skyLegendWidth(size: number, font: string, rows: 1 | 2): number {
  const [heights, sample] = skyLegendItemWidths(size, font)
  return rows === 1 ? heights + SKY_LEGEND_ITEM_GAP + sample : Math.max(heights, sample)
}

/** One legend row's height. */
export const skyLegendRowHeight = () => Math.max(SKY_LEGEND_ICON, Math.ceil(skyLineHeight(SKY_LEGEND_SIZE)))

function planAt(panel: Box, level: SkyLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): SkyPlan | null {
  const size = skyLevelSpec(level).size
  const legendRows: 1 | 2 = skyLegendWidth(size, font, 1) <= panel.width ? 1 : 2
  const legendHeight = skyLegendRowHeight() * legendRows + (legendRows === 2 ? SKY_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(skyLineHeight(signSize, signLines)) + SKY_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(SKY_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const band = skyBandFor(cell)
  const gridSide = size * cell
  const citySide = gridSide + band * 2
  const blockHeight = signHeight + signGap + citySide + SKY_LEGEND_GAP + legendHeight
  const widest = Math.max(citySide, widestSign(signSize, signLines, font), skyLegendWidth(size, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const cityLeft = Math.round(panel.left + (panel.width - citySide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const cityTop = top + signHeight + signGap
  const city: Box = { left: cityLeft, top: cityTop, width: citySide, height: citySide }
  const grid: Box = { left: cityLeft + band, top: cityTop + band, width: gridSide, height: gridSide }
  const legendTop = cityTop + citySide + SKY_LEGEND_GAP
  return {
    size,
    cell,
    band,
    grid,
    city,
    digitSize: skyDigitSizeFor(cell),
    answerSize: skyAnswerSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: SKY_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest plots the panel allows at the level, or null when even its floor will not fit. */
export function planSkyPage(panel: Box, level: SkyLevel, font: string): SkyPlan | null {
  const floor = Math.ceil(skyLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [SKY_SIGN_SIZE, 1],
    [SKY_SIGN_MIN, 1],
    [SKY_SIGN_SIZE, 2],
    [SKY_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every rule lands on the same pixel grid.
    for (let cell = SKY_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a city is built. */
export function skyPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: SkyLevel; font: string }): SkyPlan | null {
  const { page, config, level, font } = options
  return planSkyPage(skyPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the plot size,
 * or that the trim is too small.
 */
export function skyPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: SkyLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = skyLevelSpec(level)
  const lead = 'Every city is built fresh and proven to have one answer, reached by logic alone, with no guessing.'
  if (!page) return lead
  const plan = skyPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} cities at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Plots print ${(plan.cell / DPI).toFixed(2)} in, the city ${(plan.city.width / DPI).toFixed(2)} in across with its clues, numbers ${pxToPt(plan.digitSize)} pt.`
}
