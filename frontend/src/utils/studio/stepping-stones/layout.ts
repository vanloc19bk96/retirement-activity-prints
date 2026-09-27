import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { STONES_ENDS_WORD, STONES_NEXT_WORD, STONES_WALKS, stonesInstruction, stonesLevelSpec, stonesSignText, type StonesLevel } from './content'

/**
 * Where everything on a Stepping Stones page goes.
 *
 * Top to bottom: the walk's signpost, the path (a square of rounded stepping
 * stones with a little lawn between them, a number on some), and a legend
 * (two neighbouring stones numbered in a row, and the double-ringed start
 * and finish stone). Stones are as large as the trim allows (up to 0.8 in
 * apart) and never below the level's floor; the numbers grow with them,
 * never below 16 pt, so two-digit numbers can be written in by hand. The
 * page is planned from the level and the trim alone, before a path is
 * built, so every page of a run prints at the same size and the form's help
 * line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the signpost. */
export const STONES_HEADER_AIR = 10

/** Largest stone pitch worth printing — past this a 6 × 6 is a poster. */
export const STONES_MAX_CELL = Math.round(inch(0.8))

/** The numbers: bold, about four tenths of a stone, 16–22 pt. */
export const STONES_DIGIT_MIN = ptToPx(16)
const STONES_DIGIT_MAX = ptToPx(22)
const DIGIT_OF_CELL = 0.42

/** The lawn between two stones, as a share of the pitch (never under 5 px). */
const GAP_OF_CELL = 0.12
export const STONES_GAP_MIN = 5
/** A stone's rounded corner, as a share of its side. */
const RADIUS_OF_STONE = 0.24

/** The answer page's trail: its width as a share of the pitch (never under 8 px). */
const TRAIL_OF_CELL = 0.3
export const STONES_TRAIL_MIN = 8

/** The signpost: bold, 16 pt, down to 14 pt on a narrow trim. */
export const STONES_SIGN_SIZE = ptToPx(16)
export const STONES_SIGN_MIN = ptToPx(14)
export const STONES_SIGN_PAD_X = 18
export const STONES_SIGN_PAD_Y = 10
/** Air under the signpost, before the path: grows with the stones so the board never crowds them. */
export const STONES_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.4

/** The legend: 14 pt words beside stones a little taller, on one row or two. */
export const STONES_LEGEND_SIZE = ptToPx(14)
export const STONES_LEGEND_ICON = Math.round(STONES_LEGEND_SIZE * 1.7)
/** The legend's two stones side by side: two icons and a sliver of lawn. */
export const STONES_LEGEND_PAIR_GAP = 4
export const STONES_LEGEND_PAIR_WIDTH = STONES_LEGEND_ICON * 2 + STONES_LEGEND_PAIR_GAP
export const STONES_LEGEND_ICON_GAP = 8
export const STONES_LEGEND_ITEM_GAP = 28
export const STONES_LEGEND_ROW_GAP = 10
/** Air between the path and the legend. */
export const STONES_LEGEND_GAP = 24

export const stonesDigitSpec = (weight = 700): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: weight })
export const stonesSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const stonesLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface StonesPlan {
  size: number
  /** Stone pitch: from one stone's left edge to the next one's. */
  cell: number
  /** The stones' square: `size` pitches across and down. */
  grid: Box
  /** A stone's side, and the lawn round it (half the gap on each side). */
  stone: number
  gap: number
  /** A stone's rounded corner. */
  radius: number
  /** The numbers, px. */
  digitSize: number
  /** The answer page's trail width. */
  trail: number
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the signpost and the path. */
  signGap: number
  /** The band the signpost sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Signpost, path and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function stonesContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function stonesPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? STONES_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function stonesPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: StonesLevel): Box {
  const content = stonesContentBox(page)
  const header = measureHeaderHeight(config, stonesInstruction(config, level), content.width)
  return stonesPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const stonesLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const stonesTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The numbers' size for a stone pitch: about four tenths of it, 16–22 pt. */
export const stonesDigitSizeFor = (cell: number) => Math.max(STONES_DIGIT_MIN, Math.min(STONES_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** The lawn between stones for a pitch. */
export const stonesGapFor = (cell: number) => Math.max(STONES_GAP_MIN, Math.round(cell * GAP_OF_CELL))

/** The answer page's trail width for a pitch. */
export const stonesTrailFor = (cell: number) => Math.max(STONES_TRAIL_MIN, Math.round(cell * TRAIL_OF_CELL))

/** The signpost's outer width for a walk at a size. */
export function stonesSignWidth(text: string, size: number, font: string): number {
  return stonesTextWidth(text, size, stonesSignSpec(font)) + STONES_SIGN_PAD_X * 2
}

/** The widest signpost any walk makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...STONES_WALKS.map((w) => stonesSignWidth(stonesSignText(w, lines), size, font)))

/** Each legend entry's width: icon, gap, words. */
export function stonesLegendItemWidths(font: string): [number, number] {
  const words = (text: string) => stonesTextWidth(text, STONES_LEGEND_SIZE, stonesLegendSpec(font))
  return [STONES_LEGEND_PAIR_WIDTH + STONES_LEGEND_ICON_GAP + words(STONES_NEXT_WORD), STONES_LEGEND_ICON + STONES_LEGEND_ICON_GAP + words(STONES_ENDS_WORD)]
}

/** The legend's width on one row or two. */
export function stonesLegendWidth(font: string, rows: 1 | 2): number {
  const [next, ends] = stonesLegendItemWidths(font)
  return rows === 1 ? next + STONES_LEGEND_ITEM_GAP + ends : Math.max(next, ends)
}

/** One legend row's height. */
export const stonesLegendRowHeight = () => Math.max(STONES_LEGEND_ICON, Math.ceil(stonesLineHeight(STONES_LEGEND_SIZE)))

function planAt(panel: Box, level: StonesLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): StonesPlan | null {
  const size = stonesLevelSpec(level).size
  const legendRows: 1 | 2 = stonesLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = stonesLegendRowHeight() * legendRows + (legendRows === 2 ? STONES_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(stonesLineHeight(signSize, signLines)) + STONES_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(STONES_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const side = size * cell
  const blockHeight = signHeight + signGap + side + STONES_LEGEND_GAP + legendHeight
  const widest = Math.max(side, widestSign(signSize, signLines, font), stonesLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - side) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: side, height: side }
  const gap = stonesGapFor(cell)
  const stone = cell - gap
  const legendTop = gridTop + side + STONES_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    stone,
    gap,
    radius: Math.round(stone * RADIUS_OF_STONE),
    digitSize: stonesDigitSizeFor(cell),
    trail: stonesTrailFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: STONES_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest stones the panel allows at the level, or null when even its floor will not fit. */
export function planStonesPage(panel: Box, level: StonesLevel, font: string): StonesPlan | null {
  const floor = Math.ceil(stonesLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [STONES_SIGN_SIZE, 1],
    [STONES_SIGN_MIN, 1],
    [STONES_SIGN_SIZE, 2],
    [STONES_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every stone lands on the same pixel grid.
    for (let cell = STONES_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a path is built. */
export function stonesPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: StonesLevel; font: string }): StonesPlan | null {
  const { page, config, level, font } = options
  return planStonesPage(stonesPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the stone
 * size, or that the trim is too small.
 */
export function stonesPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: StonesLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = stonesLevelSpec(level)
  const lead = 'Every path is built fresh and proven to have one answer, reached by logic alone — no guessing.'
  if (!page) return lead
  const plan = stonesPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} paths at large print — choose a larger page in Settings or an easier level.`
  return `${lead} Stones print ${(plan.stone / DPI).toFixed(2)} in, the path ${(plan.grid.width / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.digitSize)} pt.`
}
