import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { PQ_LEGEND_SAMPLE, PQ_QUILTS, pqInstruction, pqLevelSpec, pqPatchWord, pqSampleWord, pqSignText, type PqLevel } from './content'

/**
 * Where everything on a Patchwork Quilt page goes.
 *
 * Top to bottom: the quilt's label, the quilt (softly ruled squares in a
 * heavy binding, a bold number in some of them), and a legend (a sample
 * patch of two squares with what its number means, and a fabric swatch
 * with how many patches there are to sew). Squares are as large as the trim
 * allows (up to 0.8 in) and never below the level's floor; the numbers
 * grow with them and never print below 16 pt. The page is planned from the
 * level and the trim alone, before a quilt is pieced, so every page of a run
 * prints at the same size and the form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the label. */
export const PQ_HEADER_AIR = 10

/** Largest square worth printing — past this a 7 × 7 is a poster. */
export const PQ_MAX_CELL = Math.round(inch(0.8))
/** The quilt's binding, and the seams between patches on the answer page, px: 3 pt. */
export const PQ_FRAME = 4
/** The numbers: bold, a share of the square, 16–22 pt. */
export const PQ_NUMBER_MIN = ptToPx(16)
const PQ_NUMBER_MAX = ptToPx(22)
const NUMBER_OF_CELL = 0.5

/** The label: bold, 16 pt, down to 14 pt on a narrow trim. */
export const PQ_SIGN_SIZE = ptToPx(16)
export const PQ_SIGN_MIN = ptToPx(14)
export const PQ_SIGN_PAD_X = 18
export const PQ_SIGN_PAD_Y = 10
/** Air under the label, before the quilt: grows with the squares so the label never crowds the quilt. */
export const PQ_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.45

/** The legend: 14 pt words beside icons half as tall again, on one row or two. */
export const PQ_LEGEND_SIZE = ptToPx(14)
export const PQ_LEGEND_ICON = Math.round(PQ_LEGEND_SIZE * 1.5)
export const PQ_LEGEND_ICON_GAP = 8
export const PQ_LEGEND_ITEM_GAP = 32
export const PQ_LEGEND_ROW_GAP = 10
/** Air between the quilt and the legend. */
export const PQ_LEGEND_GAP = 24

export const pqNumberSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const pqSignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const pqLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface PqPlan {
  size: number
  cell: number
  /** The quilt: `size` squares across and down. */
  grid: Box
  /** The numbers in the squares, px. */
  numberSize: number
  signSize: number
  /** The label on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the label and the quilt. */
  signGap: number
  /** The band the label sits in (its width is the panel's; the label centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Label, quilt and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function pqContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function pqPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? PQ_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function pqPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: PqLevel): Box {
  const content = pqContentBox(page)
  const header = measureHeaderHeight(config, pqInstruction(config, level), content.width)
  return pqPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const pqLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const pqTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The numbers' size for a square: half the square, 16–22 pt. */
export const pqNumberSizeFor = (cell: number) => Math.max(PQ_NUMBER_MIN, Math.min(PQ_NUMBER_MAX, Math.round(cell * NUMBER_OF_CELL)))

/** The label's outer width for a quilt at a size. */
export function pqSignWidth(text: string, size: number, font: string): number {
  return pqTextWidth(text, size, pqSignSpec(font)) + PQ_SIGN_PAD_X * 2
}

/** The widest label any quilt makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...PQ_QUILTS.map((q) => pqSignWidth(pqSignText(q, lines), size, font)))

/** The most patches a quilt of the size can have (every patch at least two squares). */
export const pqMostPatches = (size: number) => Math.floor((size * size) / 2)

/** The legend's two entries' words: the sample patch, and the patches (planned at the most a quilt can have). */
export const pqLegendWords = (patches: number) => [pqSampleWord(PQ_LEGEND_SAMPLE), pqPatchWord(patches)] as const

/** The sample patch: PQ_LEGEND_SAMPLE squares in a row, each the icon's height. */
export const pqSampleIconWidth = () => PQ_LEGEND_ICON * PQ_LEGEND_SAMPLE

/** Each legend entry's width: icon, gap, words (the patch count at its widest). */
export function pqLegendItemWidths(size: number, font: string): [number, number] {
  const [sample, patches] = pqLegendWords(pqMostPatches(size))
  const words = (text: string) => pqTextWidth(text, PQ_LEGEND_SIZE, pqLegendSpec(font))
  return [pqSampleIconWidth() + PQ_LEGEND_ICON_GAP + words(sample), PQ_LEGEND_ICON + PQ_LEGEND_ICON_GAP + words(patches)]
}

/** The legend's width on one row or two. */
export function pqLegendWidth(size: number, font: string, rows: 1 | 2): number {
  const [sample, patches] = pqLegendItemWidths(size, font)
  return rows === 1 ? sample + PQ_LEGEND_ITEM_GAP + patches : Math.max(sample, patches)
}

/** One legend row's height. */
export const pqLegendRowHeight = () => Math.max(PQ_LEGEND_ICON, Math.ceil(pqLineHeight(PQ_LEGEND_SIZE)))

function planAt(panel: Box, level: PqLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): PqPlan | null {
  const size = pqLevelSpec(level).size
  const legendRows: 1 | 2 = pqLegendWidth(size, font, 1) <= panel.width ? 1 : 2
  const legendHeight = pqLegendRowHeight() * legendRows + (legendRows === 2 ? PQ_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(pqLineHeight(signSize, signLines)) + PQ_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(PQ_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + gridSide + PQ_LEGEND_GAP + legendHeight
  const widest = Math.max(gridSide, widestSign(signSize, signLines, font), pqLegendWidth(size, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + PQ_LEGEND_GAP
  return {
    size,
    cell,
    grid,
    numberSize: pqNumberSizeFor(cell),
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: PQ_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planPqPage(panel: Box, level: PqLevel, font: string): PqPlan | null {
  const floor = Math.ceil(pqLevelSpec(level).minCell)
  // The label on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [PQ_SIGN_SIZE, 1],
    [PQ_SIGN_MIN, 1],
    [PQ_SIGN_SIZE, 2],
    [PQ_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every seam lands on the same pixel grid.
    for (let cell = PQ_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a quilt is pieced. */
export function pqPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: PqLevel; font: string }): PqPlan | null {
  const { page, config, level, font } = options
  return planPqPage(pqPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — the square
 * size, or that the trim is too small.
 */
export function pqPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: PqLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = pqLevelSpec(level)
  const lead = 'Every quilt is pieced fresh and proven to have one answer, reached by logic alone — no guessing.'
  if (!page) return lead
  const plan = pqPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} quilts at large print — choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the quilt ${((plan.cell * plan.size) / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.numberSize)} pt.`
}
