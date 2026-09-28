import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { PA_CAPTION_PROMPT, PA_LEGEND_LINES, paInstruction, paLevelPictures, paLevelSpec, type PaLevel } from './content'

/**
 * Where everything on a Photo Album page goes.
 *
 * Top to bottom: the snapshot and the legend. The snapshot is an instant
 * photo: the grid (soft gray lines between the squares, a little heavier
 * every five, a bold black edge) set in a white border that is broad at the
 * bottom, where the caption asks "What’s in the snapshot?" over a line to
 * write on, and held by four black album corners. Under it, the legend works
 * one block of nine. Squares are as large as the trim allows (up to 0.5 in)
 * and never below the level's floor; the numbers grow with them, never below
 * 12 pt. The page is planned from the level and the trim alone, before a
 * grid is built, so every page of a run prints at the same size and the
 * form's help line is what prints.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round(((px * PDF_POINTS_PER_INCH) / DPI) * 2) / 2
const inch = (n: number) => n * DPI

/** Air between the heading and the snapshot. */
export const PA_HEADER_AIR = 12

/** Largest square worth printing — past this a 10 × 10 is a poster. */
export const PA_MAX_CELL = Math.round(inch(0.5))
/** The grid's bold edge, px. */
export const PA_EDGE = 3

/** The numbers: a little over half a square, 12–20 pt, centred in their squares. */
export const PA_DIGIT_MIN = ptToPx(12)
const PA_DIGIT_MAX = ptToPx(20)
const DIGIT_OF_CELL = 0.56
/** A digit's ink, top to foot, as a share of its size (lining figures). */
export const PA_DIGIT_INK = 0.74
/** Air kept between a number's ink and its square's lines, top and bottom, px (and never under a sixth of the square). */
export const PA_DIGIT_AIR = 3
export const paDigitAirNeeded = (cell: number) => Math.max(PA_DIGIT_AIR, cell / 6)

/** The snapshot's white border round the grid: grows with the squares. */
export const PA_BORDER_MIN = 14
const PA_BORDER_MAX = 24
const BORDER_OF_CELL = 0.55
/** The snapshot's outline, px, and the rounding of its corners. */
export const PA_FRAME_STROKE = 2
export const PA_FRAME_RADIUS = 6

/** The album corners: how far they reach past the snapshot's edge, and their longest leg. */
export const PA_CORNER_OUT = 4
const PA_CORNER_MAX = 34
/** Air kept between an album corner and the grid, measured across the corner, px. */
export const PA_CORNER_CLEAR = 6

/** The caption: a 14 pt question over a line, and the answer's name, 16 pt bold, written on it. */
export const PA_PROMPT_SIZE = ptToPx(14)
export const PA_NAME_SIZE = ptToPx(16)
const PROMPT_GAP = 8
/** Room above the line for a name written by hand. */
const WRITE_ROOM = Math.round(PA_NAME_SIZE * 1.35)
export const PA_LINE_WEIGHT = 1.5
/** The shortest writing line, and the widest share of the grid it takes. */
const LINE_MIN = inch(2)
const LINE_OF_GRID = 0.78

/**
 * The legend: a little block of nine beside three lines of 14 pt (12 pt on
 * a tight page). Where even 12 pt would push the squares below the level's
 * floor, the page leaves it off: the how-to line says the same in words.
 */
export const PA_LEGEND_SQUARE = 24
export const PA_LEGEND_SIZE = ptToPx(14)
export const PA_LEGEND_SIZE_MIN = ptToPx(12)
export const PA_LEGEND_NUMBER_SIZE = ptToPx(12)
export const PA_LEGEND_ICON_GAP = 14
/** Air between the snapshot (its album corners) and the legend. */
export const PA_LEGEND_GAP = 24

export const paDigitSpec = (): FontSpec => ({ fontFamily: STUDIO_DIGIT_FONT, fontWeight: 400 })
export const paTextSpec = (font: string, weight: 400 | 700 = 400): FontSpec => ({ fontFamily: font, fontWeight: weight })

export interface PaCaptionPlan {
  /** Top of the question, centred on the snapshot. */
  promptTop: number
  /** Where the line is ruled (its top edge), and its ends. */
  lineTop: number
  lineLeft: number
  lineRight: number
  /** Top of the answer's name written on the line. */
  nameTop: number
}

export interface PaLegendPlan {
  box: Box
  /** The words' size, px. */
  size: number
  /** Top of the words, set against the little block's middle. */
  textTop: number
  textLeft: number
}

export interface PaPlan {
  size: number
  cell: number
  /** The grid: `size` squares across and down. */
  grid: Box
  /** The numbers, px. */
  digitSize: number
  /** The white border round the grid (sides and top). */
  border: number
  /** The snapshot's outline, grid, border and caption. */
  frame: Box
  caption: PaCaptionPlan
  /** An album corner's legs. */
  cornerLeg: number
  /** The worked block of nine, or null on a page too tight for it. */
  legend: PaLegendPlan | null
  /** Snapshot (with its corners) and legend together. */
  block: Box
}

/** The page's own column: the safe area, less the shared side inset. */
export function paContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function paPanelInBody(body: Box, headed: boolean): Box {
  const air = headed ? PA_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** The panel on a page, measured without drawing (for the form and the page). */
export function paPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, level: PaLevel): Box {
  const content = paContentBox(page)
  const header = measureHeaderHeight(config, paInstruction(config, level), content.width)
  return paPanelInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** Height of one or more lines of text at a size. */
export const paLineHeight = (size: number, lines = 1) => fabricTextHeight(lines, size, 1)

/**
 * Width of a one-line textbox for its words, with room to spare: if the
 * page's font is still loading when the page is built, its words are
 * estimated, and a box that is a hair too narrow wraps a word onto a second
 * line.
 */
export const paTextWidth = (text: string, size: number, spec: FontSpec) => Math.ceil(hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) * 1.12)

/** The numbers' size for a square size. */
export const paDigitSizeFor = (cell: number) => Math.max(PA_DIGIT_MIN, Math.min(PA_DIGIT_MAX, Math.round(cell * DIGIT_OF_CELL)))

/** Air between a number's ink and its square's top and bottom lines, px (negative when it would touch them). */
export const paDigitAir = (cell: number, digitSize: number) => (cell - digitSize * PA_DIGIT_INK) / 2 - PA_EDGE / 2

/** The white border for a square size. */
export const paBorderFor = (cell: number) => Math.max(PA_BORDER_MIN, Math.min(PA_BORDER_MAX, Math.round(cell * BORDER_OF_CELL)))

/** An album corner's legs for a border: as long as they can be and still clear the grid. */
export const paCornerLegFor = (border: number) => Math.min(PA_CORNER_MAX, 2 * (border + PA_CORNER_OUT) - PA_CORNER_CLEAR * 2)

/** Air left between an album corner's slant and the grid's corner, measured across the corner, px. */
export const paCornerClearance = (border: number, leg: number) => (2 * (border + PA_CORNER_OUT) - leg) / Math.SQRT2

/** The widest a name of the level sets, bold, on the caption line. */
export const paWidestName = (level: PaLevel, font: string) =>
  Math.max(...paLevelPictures(level).map((p) => paTextWidth(p.name, PA_NAME_SIZE, paTextSpec(font, 700))))

/** The caption line's length: long enough for any name at the level, so it never gives the answer's length away. */
export const paLineLength = (level: PaLevel, font: string, gridWidth: number) =>
  Math.round(Math.min(gridWidth, Math.max(LINE_MIN, gridWidth * LINE_OF_GRID, paWidestName(level, font) + 24)))

/** The caption band under the grid: air, the question, room to write, the line, and the border again. */
export const paCaptionHeight = (border: number) =>
  paCaptionAir(border) + Math.ceil(paLineHeight(PA_PROMPT_SIZE)) + PROMPT_GAP + WRITE_ROOM + PA_LINE_WEIGHT + border

/** Air between the grid and the caption's question. */
const paCaptionAir = (border: number) => Math.round(border * 0.7)

/** The legend's words' width at a size. */
export const paLegendTextWidth = (size: number, font: string) => Math.max(...PA_LEGEND_LINES.map((line) => paTextWidth(line, size, paTextSpec(font))))

/** The legend's width at a size: the little block, the gap, the words. */
export const paLegendWidth = (size: number, font: string) => PA_LEGEND_SQUARE * 3 + PA_LEGEND_ICON_GAP + paLegendTextWidth(size, font)

/** The legend's height at a size: the little block or the words, whichever is taller. */
export const paLegendHeight = (size: number) => Math.max(PA_LEGEND_SQUARE * 3, Math.ceil(paLineHeight(size, PA_LEGEND_LINES.length)))

function planAt(panel: Box, level: PaLevel, cell: number, legendSize: number | null, font: string): PaPlan | null {
  const size = paLevelSpec(level).size
  const side = size * cell
  const border = paBorderFor(cell)
  const captionHeight = paCaptionHeight(border)
  const frameWidth = side + border * 2
  const frameHeight = border + side + captionHeight
  const legendWidth = legendSize === null ? 0 : paLegendWidth(legendSize, font)
  const legendHeight = legendSize === null ? 0 : paLegendHeight(legendSize)
  const blockWidth = Math.max(frameWidth + PA_CORNER_OUT * 2, legendWidth)
  const blockHeight = PA_CORNER_OUT + frameHeight + PA_CORNER_OUT + (legendSize === null ? 0 : PA_LEGEND_GAP + legendHeight)
  if (blockWidth > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null
  // The question and the line must fit inside the snapshot's bottom border.
  if (paTextWidth(PA_CAPTION_PROMPT, PA_PROMPT_SIZE, paTextSpec(font)) > side + 1e-6) return null

  const top = Math.round(panel.top + Math.max(0, panel.height - blockHeight) * 0.35)
  const centre = panel.left + panel.width / 2
  const frame: Box = { left: Math.round(centre - frameWidth / 2), top: top + PA_CORNER_OUT, width: frameWidth, height: frameHeight }
  const grid: Box = { left: frame.left + border, top: frame.top + border, width: side, height: side }

  const promptTop = grid.top + side + paCaptionAir(border)
  const lineTop = promptTop + Math.ceil(paLineHeight(PA_PROMPT_SIZE)) + PROMPT_GAP + WRITE_ROOM
  const line = paLineLength(level, font, side)
  const lineLeft = Math.round(grid.left + (side - line) / 2)
  const caption: PaCaptionPlan = {
    promptTop,
    lineTop,
    lineLeft,
    lineRight: lineLeft + line,
    nameTop: Math.round(lineTop - paLineHeight(PA_NAME_SIZE) - 3),
  }

  const legendTop = frame.top + frame.height + PA_CORNER_OUT + PA_LEGEND_GAP
  const legendLeft = Math.round(Math.max(panel.left, Math.min(centre - legendWidth / 2, panel.left + panel.width - legendWidth)))
  const legend: PaLegendPlan | null =
    legendSize === null
      ? null
      : {
          box: { left: legendLeft, top: legendTop, width: legendWidth, height: legendHeight },
          size: legendSize,
          textLeft: legendLeft + PA_LEGEND_SQUARE * 3 + PA_LEGEND_ICON_GAP,
          textTop: Math.round(legendTop + (legendHeight - paLineHeight(legendSize, PA_LEGEND_LINES.length)) / 2),
        }

  const frameBottom = frame.top + frame.height + PA_CORNER_OUT
  const left = Math.min(frame.left - PA_CORNER_OUT, legend ? legendLeft : Infinity)
  const right = Math.max(frame.left + frame.width + PA_CORNER_OUT, legend ? legendLeft + legendWidth : -Infinity)
  return {
    size,
    cell,
    grid,
    digitSize: paDigitSizeFor(cell),
    border,
    frame,
    caption,
    cornerLeg: paCornerLegFor(border),
    legend,
    block: { left, top, width: right - left, height: (legend ? legendTop + legendHeight : frameBottom) - top },
  }
}

/** The largest squares the panel allows at the level, or null when even its floor will not fit. */
export function planPaPage(panel: Box, level: PaLevel, font: string): PaPlan | null {
  const floor = Math.ceil(paLevelSpec(level).minCell)
  // The legend at 14 pt if it can, 12 pt next, and left off before the page gives up.
  for (const legendSize of [PA_LEGEND_SIZE, PA_LEGEND_SIZE_MIN, null]) {
    // Whole pixels, so every line lands on the same pixel grid.
    for (let cell = PA_MAX_CELL; cell >= floor; cell--) {
      const plan = planAt(panel, level, cell, legendSize, font)
      if (plan) return plan
    }
  }
  return null
}

/** The page these settings make, measured before a grid is built. */
export function paPlanFor(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: PaLevel; font: string }): PaPlan | null {
  const { page, config, level, font } = options
  return planPaPage(paPanelFor(page, config, level), level, font)
}

/**
 * The level's help line: how many snapshots it deals, and what the trim in
 * Settings prints — the square size and the numbers' — or that the trim is
 * too small.
 */
export function paPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: PaLevel; font: string }): string {
  const { page, config, level, font } = options
  const spec = paLevelSpec(level)
  const count = paLevelPictures(level).length
  const lead = `${count} hand-drawn snapshots; every grid is built fresh and proven to have one answer, reached by logic alone, no guessing.`
  if (!page) return lead
  const plan = paPlanFor({ page, config, level, font })
  if (!plan) return `This page size is too small for ${spec.gridLabel} snapshots at large print. Choose a larger page in Settings or an easier level.`
  return `${lead} Squares print ${(plan.cell / DPI).toFixed(2)} in, the grid ${(plan.grid.width / DPI).toFixed(2)} in across, numbers ${pxToPt(plan.digitSize)} pt.`
}
