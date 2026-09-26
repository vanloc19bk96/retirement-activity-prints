import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { IH_BRIDGE_WORD, IH_CHAINS, ihInstruction, ihIslandWord, ihLevelSpec, ihSignText, type IhLevel } from './content'

/**
 * Where everything on an Island Hopping page goes.
 *
 * Top to bottom: the island chain's sign, the chart (a square of sea with a
 * faint dot on every open lattice point, so bridges are easy to draw
 * straight, and the islands as numbered circles), and a legend (the island
 * the reader is given with how many to join, and the bridge they draw).
 * Lattice spacing is as large as the trim allows (up to 0.8 in) and never
 * below the level's floor; the numbers grow with it and never print below
 * 16 pt. The page is planned from the level and the trim alone, before a
 * chart is drawn, so every page of a run prints at the same size and the
 * form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const IH_HEADER_AIR = 10

/** Widest lattice spacing worth printing — past this a 7 × 7 is a poster. */
export const IH_MAX_CELL = Math.round(inch(0.8))
/** Open sea between the outermost lattice points' squares and the chart's frame, as a share of the spacing. */
const PAD_OF_CELL = 0.15
/** An island's circle, as a share of the spacing. */
export const IH_ISLAND_OF_CELL = 0.78
/** The islands' numbers: a share of the spacing, 16–26 pt, and always inside the circle. */
export const IH_NUMBER_MIN = ptToPx(16)
const IH_NUMBER_MAX = ptToPx(26)
const NUMBER_OF_CELL = 0.46
const NUMBER_OF_ISLAND = 0.8

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const IH_SIGN_SIZE = ptToPx(16)
export const IH_SIGN_MIN = ptToPx(14)
export const IH_SIGN_PAD_X = 16
export const IH_SIGN_PAD_Y = 9
/** Air under the sign, before the chart: grows with the spacing so the sign never crowds the islands. */
export const IH_SIGN_GAP_MIN = 20
const SIGN_GAP_OF_CELL = 0.3

/** The legend: 14 pt words beside icons half as tall again, on one row or two. */
export const IH_LEGEND_SIZE = ptToPx(14)
export const IH_LEGEND_ICON = Math.round(IH_LEGEND_SIZE * 1.5)
export const IH_LEGEND_ICON_GAP = 8
export const IH_LEGEND_ITEM_GAP = 28
export const IH_LEGEND_ROW_GAP = 10
const LEGEND_GAP = 18

export const ihNumberSpec = (): FontSpec => ({ fontWeight: 700 })
export const ihSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const ihLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface IhPlan {
  size: number
  /** Lattice spacing: one island's square of sea. */
  cell: number
  /** Open sea inside the frame, round the lattice. */
  pad: number
  islandRadius: number
  numberSize: number
  /** The chart's frame: `size` squares of sea across and down (an island at the centre of any), and the pad round them. */
  grid: Box
  signSize: number
  /** The sign on one line, or the name over "Islands" when one line is too wide. */
  signLines: 1 | 2
  /** Air between the sign and the chart. */
  signGap: number
  /** The band the sign sits in (its width is the panel's; the sign centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Sign, chart and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function ihContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function ihPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? IH_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function ihPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: IhLevel): Box {
  const content = ihContentBox(page)
  const header = measureHeaderHeight(config, ihInstruction(config, level), content.width)
  return ihPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const ihLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps "Islands" onto a
 * second line.
 */
export const ihTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a chain at a size. */
export function ihSignWidth(text: string, size: number, font: string): number {
  return ihTextWidth(text, size, ihSignSpec(font)) + IH_SIGN_PAD_X * 2
}

/** The widest sign any chain makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...IH_CHAINS.map((c) => ihSignWidth(ihSignText(c, lines), size, font)))

/** The legend's two entries' words. */
export const ihLegendWords = (islands: number) => [ihIslandWord(islands), IH_BRIDGE_WORD] as const

/** Each legend entry's width: icon, gap, words. */
export function ihLegendItemWidths(islands: number, font: string): [number, number] {
  const [island, bridge] = ihLegendWords(islands)
  const item = (words: string) => IH_LEGEND_ICON + IH_LEGEND_ICON_GAP + ihTextWidth(words, IH_LEGEND_SIZE, ihLegendSpec(font))
  return [item(island), item(bridge)]
}

/** The legend's width on one row or two. */
export function ihLegendWidth(islands: number, font: string, rows: 1 | 2): number {
  const [island, bridge] = ihLegendItemWidths(islands, font)
  return rows === 1 ? island + IH_LEGEND_ITEM_GAP + bridge : Math.max(island, bridge)
}

/** One legend row's height. */
export const ihLegendRowHeight = () => Math.max(IH_LEGEND_ICON, Math.ceil(ihLineHeight(IH_LEGEND_SIZE)))

function planAt(panel: Box, level: IhLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): IhPlan | null {
  const spec = ihLevelSpec(level)
  const size = spec.size
  const islandRadius = Math.round(((cell * IH_ISLAND_OF_CELL) / 2) * 100) / 100
  const numberSize = Math.min(IH_NUMBER_MAX, Math.max(IH_NUMBER_MIN, Math.round(cell * NUMBER_OF_CELL)))
  if (numberSize > islandRadius * 2 * NUMBER_OF_ISLAND) return null

  const legendRows: 1 | 2 = ihLegendWidth(spec.maxIslands, font, 1) <= panel.width ? 1 : 2
  const legendHeight = ihLegendRowHeight() * legendRows + (legendRows === 2 ? IH_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(ihLineHeight(signSize, signLines)) + IH_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(IH_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const pad = Math.round(cell * PAD_OF_CELL)
  const gridSide = size * cell + pad * 2
  const blockHeight = signHeight + signGap + gridSide + LEGEND_GAP + legendHeight
  const widest = Math.max(gridSide, widestSign(signSize, signLines, font), ihLegendWidth(spec.maxIslands, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + LEGEND_GAP
  return {
    size,
    cell,
    pad,
    islandRadius,
    numberSize,
    grid,
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: IH_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The widest spacing the panel allows at the level, or null when even its floor will not fit. */
export function planIhPage(panel: Box, level: IhLevel, font: string): IhPlan | null {
  const floor = Math.ceil(ihLevelSpec(level).minCell)
  // The sign on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [IH_SIGN_SIZE, 1],
    [IH_SIGN_MIN, 1],
    [IH_SIGN_SIZE, 2],
    [IH_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every island lands on the same lattice.
    for (let cell = IH_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a chart is drawn. */
export function ihPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: IhLevel; font: string }): IhPlan | null {
  const { page, config, level, font } = options
  return planIhPage(ihPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — island and
 * number sizes, or that the trim is too small.
 */
export function ihPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: IhLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = ihLevelSpec(level)
  const lead = 'Every chart is built fresh and proven to have one answer, reached by logic alone — no guessing.'
  if (!page) return lead
  const plan = ihPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} charts at large print — choose a larger page in Settings or an easier level.`
  return `${lead} Islands print ${((plan.islandRadius * 2) / DPI).toFixed(2)} in across, ${(plan.cell / DPI).toFixed(2)} in apart, numbers at ${pxToPt(plan.numberSize)} pt.`
}
