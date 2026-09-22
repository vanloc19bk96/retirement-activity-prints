import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { fabricTextHeight } from '../studio-text-metrics'
import type { CrosswordLevel } from './levels'

/**
 * Everything this page's geometry decides on the seller's behalf.
 *
 * A crossword page is two stacked blocks competing for one column: a square
 * grid that has to stay legible, and a clue list that has to stay large print.
 * Both are driven by the answer count, which is why the old form's "Number of
 * answers (advanced)" select could not be answered honestly — the same eleven
 * answers are a comfortable page on 8.5 x 11 and a squint on 5 x 8.
 *
 * So the count is derived here instead: start from the level's target and step
 * down until the clue list still sets at the large-print floor and the grid
 * still has room for cells at GRID_MIN_CELL. The form shows the seller what
 * came out (crosswordPrintNote), and generate lays out against the same
 * numbers, so the note and the printed page can never disagree.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

export function pxToPt(px: number): number {
  return Math.round((px * PDF_POINTS_PER_INCH) / DPI)
}

/**
 * Large-print floor for clue text. KDP will print anything; an activity book
 * sold to readers in their seventies that sets its clues at nine point comes
 * back as a one-star review about the type, not about the puzzles.
 */
export const CLUE_MIN_SIZE = ptToPx(11)
/** Past this the two clue columns start to read as a poster. */
export const CLUE_MAX_SIZE = ptToPx(14)

/** Leading inside one clue, and the space between two clues. */
export const CLUE_LINE_HEIGHT = 1.2
export const CLUE_BLOCK_GAP = 8
/** Gap under the ACROSS / DOWN heading. */
export const CLUE_TITLE_GAP = 10
export const CLUE_COLUMN_GUTTER = 28
/** Air between the grid and the clue lists. */
export const GRID_CLUE_GAP = 28

/**
 * A letter is drawn at this share of the cell, under the clue number's band.
 */
export const GRID_LETTER_RATIO = 0.42

/**
 * Smallest cell a reader can still write a letter into, in inches.
 *
 * The grid on a puzzle page is empty: its cells are writing space, not type,
 * so the floor is set by a pen and an older hand rather than by a point size.
 * Three tenths of an inch is about where a capital written with a ballpoint
 * stops touching the rules on either side.
 */
const GRID_MIN_CELL_INCHES = 0.3

export const GRID_MIN_CELL = Math.round(DPI * GRID_MIN_CELL_INCHES)

/**
 * Ceiling on one cell as a share of page width, matching the Sudoku cap: left
 * uncapped, a seven-answer grid on an 8.5 x 11 interior inflates into a wall
 * chart with half a page of white under it.
 */
const GRID_MAX_CELL_RATIO = 0.085

/** The packer's canvas never exceeds this, so clue numbers stay short. */
export const GRID_MAX_SIDE = 15
/** Below this an interlocking grid cannot hold a publishable answer count. */
export const GRID_MIN_SIDE = 9

/**
 * Answers a square interlocking grid of `side` cells holds comfortably.
 *
 * Mirrors what the packer actually achieves: it crops to the used bounds, and
 * a run of N answers of four to nine letters settles at roughly N + 2 cells a
 * side. Asking for more than that is how a build ends up short of its target
 * and retries until it gives up.
 */
function answersForGridSide(side: number): number {
  return Math.max(6, Math.min(14, side - 2))
}

/** The safe printable column every crossword page lays out inside. */
export function crosswordContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function crosswordBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = crosswordContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

export function clueColumnWidth(fieldWidth: number): number {
  return Math.max(1, (fieldWidth - CLUE_COLUMN_GUTTER) / 2)
}

export function clueTitleSize(clueFontSize: number): number {
  return Math.max(ptToPx(12), clueFontSize + 1)
}

/**
 * Height one clue occupies, including the gap under it.
 * `lines` is a measured count at draw time and a budget estimate at plan time.
 */
export function clueBlockHeight(lines: number, fontSize: number): number {
  return Math.ceil(fabricTextHeight(lines, fontSize, CLUE_LINE_HEIGHT)) + CLUE_BLOCK_GAP
}

/**
 * Planning estimate for the taller of the two clue columns.
 *
 * Deliberately pessimistic on both counts the real text decides: the
 * across/down split is treated as 60/40 rather than even, and a clue is
 * budgeted at 1.45 lines rather than one. An answer count chosen against those
 * numbers still fits once the real clues are measured, which is what keeps the
 * form's note and the printed page in agreement.
 */
function estimateClueBandHeight(answers: number, fontSize: number): number {
  const rows = Math.max(1, Math.ceil(answers * 0.6))
  return clueTitleSize(fontSize) + CLUE_TITLE_GAP + rows * clueBlockHeight(1.45, fontSize)
}

export interface CrosswordPagePlan {
  /** Column left for the puzzle once the header is measured out. */
  field: Box
  /** Answers this page prints — the level's target, lowered to fit. */
  answerCount: number
  /** Cells a side the packer may use. */
  maxGridSide: number
  /** Size the clue list is expected to set at. */
  clueFontSize: number
  /** Cell the grid is expected to print at. */
  gridCell: number
  /** True when the page forced the level's target down. */
  reducedByPage: boolean
}

function gridCellFor(
  field: Box,
  side: number,
  clueBand: number,
  pageWidth: number,
): number {
  const available = Math.max(0, field.height - clueBand - GRID_CLUE_GAP)
  const maxCell = Math.max(1, Math.floor(pageWidth * GRID_MAX_CELL_RATIO))
  return Math.floor(Math.min(field.width / side, available / side, maxCell))
}

/**
 * Resolve answer count, grid ceiling and type sizes for one page.
 *
 * Walks the level's target downwards; the first count whose clue list fits at
 * a large-print size *and* leaves cells at or above GRID_MIN_CELL wins. If
 * nothing fits — a small trim with a wide gutter and a two-line instruction —
 * the roomiest near-miss is returned rather than nothing, and the print note
 * tells the seller to move up a page size.
 */
export function crosswordPagePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: CrosswordLevel
}): CrosswordPagePlan {
  const { page, config, instruction, level } = options
  const field = crosswordBodyField(page, config, instruction)
  const floor = Math.max(6, Math.min(level.minAnswers, level.targetAnswers))

  let fallback: CrosswordPagePlan | null = null

  for (let answers = level.targetAnswers; answers >= floor; answers--) {
    const side = Math.max(
      GRID_MIN_SIDE,
      Math.min(GRID_MAX_SIDE, answers + 2, level.maxLetters + 4),
    )
    if (answersForGridSide(side) < answers) continue

    for (let fontSize = CLUE_MAX_SIZE; fontSize >= CLUE_MIN_SIZE; fontSize--) {
      const clueBand = estimateClueBandHeight(answers, fontSize)
      const cell = gridCellFor(field, side, clueBand, page.pageWidth)
      const candidate: CrosswordPagePlan = {
        field,
        answerCount: answers,
        maxGridSide: side,
        clueFontSize: fontSize,
        gridCell: cell,
        reducedByPage: answers < level.targetAnswers,
      }
      if (cell >= GRID_MIN_CELL) return candidate
      // Remember the roomiest near-miss in case no count fits at all.
      if (!fallback || cell > fallback.gridCell) fallback = candidate
    }
  }

  return (
    fallback ?? {
      field,
      answerCount: floor,
      maxGridSide: GRID_MIN_SIDE,
      clueFontSize: CLUE_MIN_SIZE,
      gridCell: GRID_MIN_CELL,
      reducedByPage: floor < level.targetAnswers,
    }
  )
}

/** The plain sentence the form owes the seller in place of the knobs it dropped. */
export function crosswordPrintNote(
  level: CrosswordLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  if (!page) {
    return `About ${level.targetAnswers} answers with across and down clues, plus a matching answer page.`
  }

  const plan = crosswordPagePlan({ page, config, instruction, level })
  const shape = `${plan.answerCount} answers with across and down clues`
  const cluePt = pxToPt(plan.clueFontSize)

  if (plan.gridCell < GRID_MIN_CELL) {
    return `${shape}, clues at ${cluePt} pt — this page size is tight for a crossword, so a larger one in Settings gives a roomier grid.`
  }
  if (plan.reducedByPage) {
    return `${shape} — trimmed to fit this page size — with clues at ${cluePt} pt, plus a matching answer page.`
  }
  return `${shape}, clues at ${cluePt} pt, plus a matching answer page.`
}
