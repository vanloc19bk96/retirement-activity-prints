import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { FENCE_LOOP_WORD, FENCE_PASTURES, FENCE_SAMPLE_WORD, fenceInstruction, fenceLevelSpec, fenceSignText, type FenceLevel } from './content'

/**
 * Where everything on a Country Fence page goes.
 *
 * Top to bottom: the pasture's name board, the field (a lattice of bold
 * posts with a number in some of the squares between them), and a legend
 * (a sample square with its fenced sides, and a little closed fence).
 * Squares are as large as the trim allows (up to 0.8 in) and never below
 * the level's floor; the posts and numbers grow with them, the numbers
 * never below 16 pt. The page is planned from the level and the trim
 * alone, before a field is built, so every page of a run prints at the
 * same size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the name board. */
export const FENCE_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const FENCE_MAX_CELL = Math.round(inch(0.8))

/** The numbers: bold, half a square, 16–22 pt. */
export const FENCE_DIGIT_MIN = ptToPx(16)
const FENCE_DIGIT_MAX = ptToPx(22)
const DIGIT_OF_CELL = 0.5

/** A post's radius on the puzzle page: bold enough to find at arm's length, clear of the numbers. */
const DOT_OF_CELL = 0.06
export const FENCE_DOT_MIN = 3.5
const DOT_MAX = 5

/** The answer page's fence: its rail weight and its square posts, as shares of a square. */
const RAIL_OF_CELL = 0.08
export const FENCE_RAIL_MIN = 4
const POST_OF_CELL = 0.17
const POST_MIN = 9

/** The name board: bold, 16 pt, down to 14 pt on a narrow trim. */
export const FENCE_SIGN_SIZE = ptToPx(16)
export const FENCE_SIGN_MIN = ptToPx(14)
export const FENCE_SIGN_PAD_X = 18
export const FENCE_SIGN_PAD_Y = 10
/** Air under the board, before the field: grows with the squares so the board never crowds the posts. */
export const FENCE_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.45

/** The legend: 14 pt words beside icons a little taller, on one row or two. */
export const FENCE_LEGEND_SIZE = ptToPx(14)
export const FENCE_LEGEND_ICON = Math.round(FENCE_LEGEND_SIZE * 1.7)
export const FENCE_LEGEND_ICON_GAP = 8
export const FENCE_LEGEND_ITEM_GAP = 28
export const FENCE_LEGEND_ROW_GAP = 10
/** Air between the field and the legend. */
export const FENCE_LEGEND_GAP = 24

export const fenceDigitSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const fenceSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const fenceLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface FencePlan {
  size: number
  cell: number
  /** The squares: `size` across and down, posts on every corner. */
  grid: Box
  /** The grid with room round it for the posts and the answer page's fence. */
  field: Box
  /** How far the posts and fence reach past the grid's edge. */
  pad: number
  /** A post's radius on the puzzle page. */
  dot: number
  /** The answer page's rail weight. */
  rail: number
  /** The answer page's square post, across. */
  post: number
  /** The numbers, px. */
  digitSize: number
  signSize: number
  /** The name on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the name board and the field. */
  signGap: number
  /** The band the name board sits in (its width is the panel's; the board centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Name board, field and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function fenceContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function fencePanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? FENCE_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function fencePanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: FenceLevel): Box {
  const content = fenceContentBox(page)
  const header = measureHeaderHeight(config, fenceInstruction(config, level), content.width)
  return fencePanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const fenceLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const fenceTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The numbers' size for a square: half the square, 16–22 pt. */
export const fenceDigitSizeFor = (cell: number) => Math.max(FENCE_DIGIT_MIN, Math.min(FENCE_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** A post's radius on the puzzle page for a square. */
export const fenceDotFor = (cell: number) => Math.round(Math.max(FENCE_DOT_MIN, Math.min(DOT_MAX, cell * DOT_OF_CELL)) * 2) / 2

/** The answer page's rail weight and square post for a square. */
export const fenceRailFor = (cell: number) => Math.max(FENCE_RAIL_MIN, Math.round(cell * RAIL_OF_CELL))
export const fencePostFor = (cell: number) => Math.max(POST_MIN, Math.round(cell * POST_OF_CELL))

/** How far the posts and the fence reach past the grid, with a little air. */
export const fencePadFor = (cell: number) => Math.ceil(Math.max(fenceDotFor(cell), fencePostFor(cell) / 2, fenceRailFor(cell) / 2)) + 2

/** The name board's outer width for a pasture at a size. */
export function fenceSignWidth(text: string, size: number, font: string): number {
  return fenceTextWidth(text, size, fenceSignSpec(font)) + FENCE_SIGN_PAD_X * 2
}

/** The widest name board any pasture makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...FENCE_PASTURES.map((p) => fenceSignWidth(fenceSignText(p, lines), size, font)))

/** Each legend entry's width: icon, gap, words. */
export function fenceLegendItemWidths(font: string): [number, number] {
  const words = (text: string) => fenceTextWidth(text, FENCE_LEGEND_SIZE, fenceLegendSpec(font))
  return [FENCE_LEGEND_ICON + FENCE_LEGEND_ICON_GAP + words(FENCE_SAMPLE_WORD), FENCE_LEGEND_ICON + FENCE_LEGEND_ICON_GAP + words(FENCE_LOOP_WORD)]
}

/** The legend's width on one row or two. */
export function fenceLegendWidth(font: string, rows: 1 | 2): number {
  const [sample, loop] = fenceLegendItemWidths(font)
  return rows === 1 ? sample + FENCE_LEGEND_ITEM_GAP + loop : Math.max(sample, loop)
}

/** One legend row's height. */
export const fenceLegendRowHeight = () => Math.max(FENCE_LEGEND_ICON, Math.ceil(fenceLineHeight(FENCE_LEGEND_SIZE)))

function planAt(panel: Box, level: FenceLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): FencePlan | null {
  const size = fenceLevelSpec(level).size
  const legendRows: 1 | 2 = fenceLegendWidth(font, 1) <= panel.width ? 1 : 2
  const legendHeight = fenceLegendRowHeight() * legendRows + (legendRows === 2 ? FENCE_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(fenceLineHeight(signSize, signLines)) + FENCE_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(FENCE_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const pad = fencePadFor(cell)
  const gridSide = size * cell
  const fieldSide = gridSide + pad * 2
  const blockHeight = signHeight + signGap + fieldSide + FENCE_LEGEND_GAP + legendHeight
  const widest = Math.max(fieldSide, widestSign(signSize, signLines, font), fenceLegendWidth(font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const fieldLeft = Math.round(panel.left + (panel.width - fieldSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const fieldTop = top + signHeight + signGap
  const field: Box = { left: fieldLeft, top: fieldTop, width: fieldSide, height: fieldSide }
  const grid: Box = { left: fieldLeft + pad, top: fieldTop + pad, width: gridSide, height: gridSide }
  const legendTop = fieldTop + fieldSide + FENCE_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    field,
    pad,
    dot: fenceDotFor(cell),
    rail: fenceRailFor(cell),
    post: fencePostFor(cell),
    digitSize: fenceDigitSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: FENCE_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planFencePage(panel: Box, level: FenceLevel, font: string): FencePlan | null {
  const floor = Math.ceil(fenceLevelSpec(level).minCell)
  // The name on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [FENCE_SIGN_SIZE, 1],
    [FENCE_SIGN_MIN, 1],
    [FENCE_SIGN_SIZE, 2],
    [FENCE_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every post lands on the same pixel grid.
    for (let cell = FENCE_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a field is built. */
export function fencePlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: FenceLevel; font: string }): FencePlan | null {
  const { page, config, level, font } = options
  return planFencePage(fencePanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function fencePrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: FenceLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = fenceLevelSpec(level)
  const lead = 'Every field is built fresh and proven to have one fence, reached by logic alone, no guessing.'
  if (!page) return lead
  const plan = fencePlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} fields at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the field ${(plan.grid.width / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.digitSize)} pt.`
}
