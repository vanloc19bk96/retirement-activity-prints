import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_PANEL_FOOT_AIR, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { CF_HARBORS, CF_WATER_SHORT, CF_WATER_WORD, cfFleetEntries, cfInstruction, cfLevelSpec, cfShipCount, cfShipWord, cfSignText, type CfLevel } from './content'

/**
 * Where everything on a Cruise Fleet page goes.
 *
 * Top to bottom: the harbor's sign, the column numbers, the harbor with the
 * row numbers to its left, and the legend (every ship of the fleet drawn to
 * scale with how many there are, and the wave that marks open water). The
 * legend names the ships ("2 ferries") and sets its entries in as few,
 * as even, rows as fit; on a trim too short for that at the level's
 * smallest squares it counts them instead ("× 2").
 * Squares are as large as the trim allows (up to 0.8 in) and never below
 * the level's floor; the numbers grow with them and never print below
 * 16 pt. The page is planned from the level and the trim alone, before a
 * harbor is built, so every page of a run prints at the same size and the
 * form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the sign. */
export const CF_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const CF_MAX_CELL = Math.round(inch(0.8))
/** The harbor's frame, px: 3 pt, twice the soft rules inside and more. */
export const CF_FRAME = 4
/** The row and column numbers: a share of the square, 16–22 pt. */
export const CF_COUNT_MIN = ptToPx(16)
const CF_COUNT_MAX = ptToPx(22)
const COUNT_OF_CELL = 0.55

/** The sign: bold, 16 pt, down to 14 pt on a narrow trim. */
export const CF_SIGN_SIZE = ptToPx(16)
export const CF_SIGN_MIN = ptToPx(14)
export const CF_SIGN_PAD_X = 18
export const CF_SIGN_PAD_Y = 10
/** Air under the sign, before the column numbers: grows with the squares so the sign never crowds the harbor. */
export const CF_SIGN_GAP_MIN = 24
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside ships drawn on squares a little taller than the words. */
export const CF_LEGEND_SIZE = ptToPx(14)
export const CF_LEGEND_SEG = Math.round(CF_LEGEND_SIZE * 1.15)
export const CF_LEGEND_ICON_GAP = 8
export const CF_LEGEND_ITEM_GAP = 28
export const CF_LEGEND_ROW_GAP = 10
/** Air between the harbor and the legend. */
export const CF_LEGEND_GAP = 26

export const cfCountSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const cfSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const cfLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

/** How the legend words its ships: by name ("2 ferries"), or by count ("× 2") where room is short. */
export type CfLegendStyle = 'named' | 'counted'

/** One entry of the legend: a ship of a length and how many, or open water. */
export interface CfLegendEntry {
  kind: 'ship' | 'water'
  /** Squares long (0 for water). */
  length: number
  count: number
  words: string
  /** Icon, gap and words. */
  width: number
}

export interface CfLegendPlan {
  style: CfLegendStyle
  entries: CfLegendEntry[]
  /** The entries of each row, in order, and the row's width. */
  rows: { items: number[]; width: number }[]
  rowHeight: number
  /** The widest row. */
  width: number
  height: number
  top: number
}

export interface CfPlan {
  size: number
  cell: number
  countSize: number
  /** Between the numbers and the harbor. */
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
  legend: CfLegendPlan
  /** Sign, numbers, harbor and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function cfContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function cfPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? CF_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air - STUDIO_PANEL_FOOT_AIR) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function cfPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: CfLevel): Box {
  const content = cfContentBox(page)
  const header = measureHeaderHeight(config, cfInstruction(config, level), content.width)
  return cfPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const cfLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const cfTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The sign's outer width for a harbor at a size. */
export function cfSignWidth(text: string, size: number, font: string): number {
  return cfTextWidth(text, size, cfSignSpec(font)) + CF_SIGN_PAD_X * 2
}

/** The widest sign any harbor makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...CF_HARBORS.map((h) => cfSignWidth(cfSignText(h, lines), size, font)))

/** The legend's entries for a fleet: each length, longest first, then open water. */
export function cfLegendEntries(fleet: readonly number[], style: CfLegendStyle, font: string): CfLegendEntry[] {
  const entry = (kind: 'ship' | 'water', length: number, count: number, words: string): CfLegendEntry => ({
    kind,
    length,
    count,
    words,
    width: Math.max(1, length) * CF_LEGEND_SEG + CF_LEGEND_ICON_GAP + cfTextWidth(words, CF_LEGEND_SIZE, cfLegendSpec(font)),
  })
  return [
    ...cfFleetEntries(fleet).map(({ length, count }) => entry('ship', length, count, style === 'named' ? cfShipWord(length, count) : cfShipCount(count))),
    entry('water', 0, 0, style === 'named' ? CF_WATER_WORD : CF_WATER_SHORT),
  ]
}

/** Every way to cut a list of this many entries into this many runs, each run's first index. */
function* cuts(count: number, runs: number, from = 0): Generator<number[]> {
  if (runs === 1) {
    yield [from]
    return
  }
  for (let next = from + 1; next <= count - runs + 1; next++) for (const rest of cuts(count, runs - 1, next)) yield [from, ...rest]
}

/**
 * The legend on a panel this wide: its entries in order, in as few rows as
 * fit, cut so the rows come out as even as they can. Null when an entry is
 * wider than the panel.
 */
export function planCfLegend(fleet: readonly number[], width: number, font: string, style: CfLegendStyle = 'named'): Omit<CfLegendPlan, 'top'> | null {
  const entries = cfLegendEntries(fleet, style, font)
  const rowHeight = Math.max(CF_LEGEND_SEG, Math.ceil(cfLineHeight(CF_LEGEND_SIZE)))
  const rowWidth = (items: number[]) => items.reduce((sum, i) => sum + entries[i]!.width, 0) + (items.length - 1) * CF_LEGEND_ITEM_GAP
  for (let runs = 1; runs <= entries.length; runs++) {
    let best: { items: number[]; width: number }[] | null = null
    for (const starts of cuts(entries.length, runs)) {
      const rows = starts.map((start, k) => {
        const items = Array.from({ length: (starts[k + 1] ?? entries.length) - start }, (_, j) => start + j)
        return { items, width: rowWidth(items) }
      })
      const widest = Math.max(...rows.map((r) => r.width))
      if (widest > width + 1e-6) continue
      if (!best || widest < Math.max(...best.map((r) => r.width))) best = rows
    }
    if (best) {
      return { style, entries, rows: best, rowHeight, width: Math.max(...best.map((r) => r.width)), height: runs * rowHeight + (runs - 1) * CF_LEGEND_ROW_GAP }
    }
  }
  return null
}

function planAt(panel: Box, level: CfLevel, cell: number, signSize: number, signLines: 1 | 2, style: CfLegendStyle, font: string): CfPlan | null {
  const spec = cfLevelSpec(level)
  const size = spec.size
  const countSize = Math.min(CF_COUNT_MAX, Math.max(CF_COUNT_MIN, Math.round(cell * COUNT_OF_CELL)))
  if (countSize > cell * 0.8) return null
  const countGap = Math.max(6, Math.round(countSize * 0.35))
  const rowCountWidth = Math.ceil(countSize * 1.2)
  const colCountHeight = Math.ceil(cfLineHeight(countSize))
  const legend = planCfLegend(spec.fleet, panel.width, font, style)
  if (!legend) return null

  const signHeight = Math.ceil(cfLineHeight(signSize, signLines)) + CF_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(CF_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + colCountHeight + countGap + gridSide + CF_LEGEND_GAP + legend.height
  const puzzleWidth = rowCountWidth + countGap + gridSide
  const widest = Math.max(puzzleWidth, widestSign(signSize, signLines, font), legend.width)
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  // The harbor is what the eye centres on; the row numbers take the room to
  // its left unless that would push them off the panel.
  let gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  gridLeft = Math.max(gridLeft, Math.ceil(panel.left + rowCountWidth + countGap))
  gridLeft = Math.min(gridLeft, Math.floor(panel.left + panel.width - gridSide))
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap + colCountHeight + countGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + CF_LEGEND_GAP
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
export function planCfPage(panel: Box, level: CfLevel, font: string): CfPlan | null {
  const floor = Math.ceil(cfLevelSpec(level).minCell)
  // The sign on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [CF_SIGN_SIZE, 1],
    [CF_SIGN_MIN, 1],
    [CF_SIGN_SIZE, 2],
    [CF_SIGN_MIN, 2],
  ]
  // The ships by name if the page allows, counted before the page gives up.
  for (const style of ['named', 'counted'] as const) {
    for (const [signSize, signLines] of signs) {
      // Whole pixels, so every rule lands on the same grid.
      for (let cell = CF_MAX_CELL; cell >= floor; cell--) {
        const plan = planAt(panel, level, cell, signSize, signLines, style, font)
        if (plan) return plan
      }
    }
  }
  return null
}

/** The page these settings make, measured before a harbor is built. */
export function cfPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: CfLevel; font: string }): CfPlan | null {
  const { page, config, level, font } = options
  return planCfPage(cfPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — square and
 * number sizes, or that the trim is too small.
 */
export function cfPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: CfLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = cfLevelSpec(level)
  const lead = 'Every harbor is built fresh and proven to have one answer, reached by logic alone, with no guessing.'
  if (!page) return lead
  const plan = cfPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} harbors at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, numbers ${pxToPt(plan.countSize)} pt.`
}
