import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_PANEL_FOOT_AIR, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, measureRunWidth, type FontSpec } from '../studio-text-metrics'
import { TY_LETTERS, TY_PROJECTS, TY_STRAND_WORD, tyBallWord, tyInstruction, tyLevelSpec, tySignText, type TyLevel } from './content'

/**
 * Where everything on a Tangled Yarn page goes.
 *
 * Top to bottom: the project's tag, the grid (softly ruled squares in a
 * heavy frame, with the yarn balls — white balls with a bold letter in the
 * middle and a short tail of yarn), and a legend (the ball the reader
 * is given with how many pairs, and the strand they draw). Squares are as
 * large as the trim allows (up to 0.8 in) and never below the level's
 * floor; the letters grow with them and never print below 16 pt. The page
 * is planned from the level and the trim alone, before a grid is drawn, so
 * every page of a run prints at the same size and the form's help line is
 * what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the tag. */
export const TY_HEADER_AIR = 10

/** Largest square worth printing — past this a 6 × 6 is a poster. */
export const TY_MAX_CELL = Math.round(inch(0.8))
/** A yarn ball, as a share of its square. */
export const TY_BALL_OF_CELL = 0.84
/** How far a letter may reach from its ball's centre, as a share of the radius: clear white all round it. */
export const TY_LETTER_ROOM = 0.8
/** The letters: a share of the square, 16–26 pt, and always well inside their balls. */
export const TY_LETTER_MIN = ptToPx(16)
const TY_LETTER_MAX = ptToPx(26)
const LETTER_OF_CELL = 0.42
/** Cap height of a bold capital, and the width of a wide one, as shares of its size. */
const CAP_HEIGHT = 0.74
const WIDE_CAP = 0.74

/** The tag: bold, 16 pt, down to 14 pt on a narrow trim. */
export const TY_SIGN_SIZE = ptToPx(16)
export const TY_SIGN_MIN = ptToPx(14)
export const TY_SIGN_PAD_X = 18
export const TY_SIGN_PAD_Y = 10
/** Air under the tag, before the grid: grows with the squares so the tag never crowds the grid. */
export const TY_SIGN_GAP_MIN = 26
const SIGN_GAP_OF_CELL = 0.45

/** The legend: 14 pt words beside icons half as tall again, on one row or two. */
export const TY_LEGEND_SIZE = ptToPx(14)
export const TY_LEGEND_ICON = Math.round(TY_LEGEND_SIZE * 1.5)
export const TY_LEGEND_ICON_GAP = 8
export const TY_LEGEND_ITEM_GAP = 32
export const TY_LEGEND_ROW_GAP = 10
/** Air between the grid and the legend. */
export const TY_LEGEND_GAP = 22

export const tyLetterSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 700 })
export const tySignSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const tyLegendSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface TyPlan {
  size: number
  cell: number
  ballRadius: number
  letterSize: number
  /** The grid: `size` squares across and down. */
  grid: Box
  signSize: number
  /** The tag on one line, or broken between words when one line is too wide. */
  signLines: 1 | 2
  /** Air between the tag and the grid. */
  signGap: number
  /** The band the tag sits in (its width is the panel's; the tag centres in it). */
  signBand: Box
  legendSize: number
  /** Both legend entries side by side, or one over the other on a narrow trim. */
  legendRows: 1 | 2
  legendTop: number
  legendHeight: number
  /** Tag, grid and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function tyContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function tyPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? TY_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air - STUDIO_PANEL_FOOT_AIR) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function tyPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: TyLevel): Box {
  const content = tyContentBox(page)
  const header = measureHeaderHeight(config, tyInstruction(config, level), content.width)
  return tyPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const tyLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const tyTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/**
 * The widest any letter on a ball sets at a size, and how far its corner
 * reaches from the ball's centre — which must leave clear white round it.
 */
export function tyLetterReach(size: number): number {
  // Never narrower than a bold capital H: estimated widths run a little lean.
  const widest = Math.max(size * WIDE_CAP, ...[...TY_LETTERS].map((ch) => measureRunWidth(ch, size, tyLetterSpec())))
  return Math.hypot(widest / 2 + 1, (size * CAP_HEIGHT) / 2)
}

/** The tag's outer width for a project at a size. */
export function tySignWidth(text: string, size: number, font: string): number {
  return tyTextWidth(text, size, tySignSpec(font)) + TY_SIGN_PAD_X * 2
}

/** The widest tag any project makes at a size. */
const widestSign = (size: number, lines: 1 | 2, font: string) => Math.max(...TY_PROJECTS.map((p) => tySignWidth(tySignText(p, lines), size, font)))

/** The legend's two entries' words. */
export const tyLegendWords = (pairs: number) => [tyBallWord(pairs), TY_STRAND_WORD] as const

/** Each legend entry's width: icon, gap, words. */
export function tyLegendItemWidths(pairs: number, font: string): [number, number] {
  const [ball, strand] = tyLegendWords(pairs)
  const item = (words: string) => TY_LEGEND_ICON + TY_LEGEND_ICON_GAP + tyTextWidth(words, TY_LEGEND_SIZE, tyLegendSpec(font))
  return [item(ball), item(strand)]
}

/** The legend's width on one row or two. */
export function tyLegendWidth(pairs: number, font: string, rows: 1 | 2): number {
  const [ball, strand] = tyLegendItemWidths(pairs, font)
  return rows === 1 ? ball + TY_LEGEND_ITEM_GAP + strand : Math.max(ball, strand)
}

/** One legend row's height. */
export const tyLegendRowHeight = () => Math.max(TY_LEGEND_ICON, Math.ceil(tyLineHeight(TY_LEGEND_SIZE)))

function planAt(panel: Box, level: TyLevel, cell: number, signSize: number, signLines: 1 | 2, font: string): TyPlan | null {
  const spec = tyLevelSpec(level)
  const size = spec.size
  const ballRadius = Math.round(((cell * TY_BALL_OF_CELL) / 2) * 100) / 100
  const letterSize = Math.min(TY_LETTER_MAX, Math.max(TY_LETTER_MIN, Math.round(cell * LETTER_OF_CELL)))
  if (tyLetterReach(letterSize) > ballRadius * TY_LETTER_ROOM) return null

  const legendRows: 1 | 2 = tyLegendWidth(spec.maxPairs, font, 1) <= panel.width ? 1 : 2
  const legendHeight = tyLegendRowHeight() * legendRows + (legendRows === 2 ? TY_LEGEND_ROW_GAP : 0)
  const signHeight = Math.ceil(tyLineHeight(signSize, signLines)) + TY_SIGN_PAD_Y * 2
  const signGap = Math.round(Math.max(TY_SIGN_GAP_MIN, cell * SIGN_GAP_OF_CELL))
  const gridSide = size * cell
  const blockHeight = signHeight + signGap + gridSide + TY_LEGEND_GAP + legendHeight
  const widest = Math.max(gridSide, widestSign(signSize, signLines, font), tyLegendWidth(spec.maxPairs, font, legendRows))
  if (widest > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  const gridLeft = Math.round(panel.left + (panel.width - gridSide) / 2)
  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const signBand: Box = { left: panel.left, top, width: panel.width, height: signHeight }
  const gridTop = top + signHeight + signGap
  const grid: Box = { left: gridLeft, top: gridTop, width: gridSide, height: gridSide }
  const legendTop = gridTop + gridSide + TY_LEGEND_GAP
  return {
    size,
    cell,
    ballRadius,
    letterSize,
    grid,
    signSize,
    signLines,
    signGap,
    signBand,
    legendSize: TY_LEGEND_SIZE,
    legendRows,
    legendTop,
    legendHeight,
    block: { left: panel.left, top, width: panel.width, height: legendTop + legendHeight - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planTyPage(panel: Box, level: TyLevel, font: string): TyPlan | null {
  const floor = Math.ceil(tyLevelSpec(level).minCell)
  // The tag on one line if it can, smaller before it breaks, broken before the page gives up.
  const signs: [number, 1 | 2][] = [
    [TY_SIGN_SIZE, 1],
    [TY_SIGN_MIN, 1],
    [TY_SIGN_SIZE, 2],
    [TY_SIGN_MIN, 2],
  ]
  for (const [signSize, signLines] of signs) {
    // Whole pixels, so every rule lands on the same pixel grid.
    for (let cell = TY_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, signSize, signLines, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is drawn. */
export function tyPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: TyLevel; font: string }): TyPlan | null {
  const { page, config, level, font } = options
  return planTyPage(tyPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: what the trim in Settings prints — square and
 * letter sizes, or that the trim is too small.
 */
export function tyPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: TyLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = tyLevelSpec(level)
  const lead = 'Every grid is built fresh and proven to have one answer, reached by logic alone, no guessing.'
  if (!page) return lead
  const plan = tyPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} grids at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, yarn balls ${((plan.ballRadius * 2) / DPI).toFixed(2)} in across, letters at ${pxToPt(plan.letterSize)} pt.`
}
