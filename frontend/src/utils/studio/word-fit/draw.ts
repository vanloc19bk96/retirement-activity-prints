/**
 * Word Fit-In — page ink.
 *
 * The lattice is the crossword's, drawn from `_shared/lattice-grid` so the two
 * templates print the identical object: white cells outlined with even-weight
 * bars that merge on every shared edge. No numbers are printed — a fill-in has
 * no clue list to number *to*, and a numbered grid invites the reader to look
 * for clues that are not there.
 */

import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_PAPER,
} from '@/constants/studio.constants'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitSquareGrid,
  insetBox,
  type Box,
} from '../studio-layout'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import {
  drawWhiteCellEdges,
  occupiedLattice,
  paintBoxHeight,
  sliceOccupied,
  snapGridInField,
  TEXT_PAINT_HEIGHT_RATIO,
  type GridVAlign,
} from '../_shared/lattice-grid'
import { delta } from '../crossword/types'
import { bankGlyphs, glyphFor, type WordFitPuzzle } from './types'

/** Letter height as a share of the cell. Matches the crossword's grid. */
const LETTER_CELL_RATIO = 0.46

/**
 * Smallest cell the reader can write a letter into, in canvas pixels at 96 DPI.
 *
 * Sized for handwriting, not for type. A fill-in grid prints *empty* — every
 * letter but the starters is answer-key ink the reader never sees on the puzzle
 * page — so what the cell has to accommodate is a pen, and 26px is 0.27in,
 * matching the cell a large-print crossword ships at.
 *
 * Worth stating plainly, because the obvious-looking alternative is wrong: the
 * card pack's 12pt glyph floor (`MIN_INDEX_PX`) would demand a 35px cell, and
 * no 15x15 grid fits that on a 6x9 trim. That floor governs a card's corner
 * index, which is type the reader must read at a glance; it is not the right
 * rule for a square someone writes in.
 */
export const MIN_WORD_FIT_CELL = 26

/** Air between the grid and the bank below it. */
const GRID_BANK_GAP = 18

/** 18px is 13.5pt — a secondary label, clear of the 12pt small-glyph floor. */
export const BANK_LABEL_SIZE = 18
/** 21px is 15.75pt — the bank is the clue set, so it stays near body size. */
export const BANK_ENTRY_SIZE = 21
const BANK_LINE_GAP = 4
const BANK_COLUMN_GAP = 14

function letterMetrics(cell: number): { fontSize: number; boxHeight: number } {
  // Same floor the crossword grid uses: these glyphs are answer-key ink, set
  // inside a cell whose size is already governed by `MIN_WORD_FIT_CELL`.
  const fontSize = Math.max(11, Math.floor(cell * LETTER_CELL_RATIO))
  return { fontSize, boxHeight: paintBoxHeight(fontSize) }
}

/**
 * The cell size a field would print at — without building any ink.
 *
 * The layout has to ask "does this fit?" several times while it balances the
 * grid against the bank, and answering by drawing the whole lattice and
 * throwing it away both costs the packer's time and burns object ids.
 */
export function wordFitCellSize(field: Box, puzzle: WordFitPuzzle): number {
  const region = occupiedLattice(puzzle.grid, puzzle.size)
  return fitSquareGrid(insetBox(field, 4), region.cols, region.rows).cell
}

/**
 * The lattice.
 *
 * Every solution letter is emitted as a hidden `answer` object, so the solution
 * page is produced by the Studio's own answer-key pass rather than by a second
 * layout routine that could drift from this one. Starter words are the same
 * glyphs promoted to visible `prompt` ink.
 */
export function drawWordFitGrid(options: {
  field: Box
  puzzle: WordFitPuzzle
  font: string
  tag: StudioTag
  vAlign: GridVAlign
}): { object: StudioFabricObject; bounds: Box } | null {
  const { field, puzzle, font, tag, vAlign } = options
  const gridField = insetBox(field, 4)
  const region = occupiedLattice(puzzle.grid, puzzle.size)
  const grid = sliceOccupied(puzzle.grid, region)
  const floated = fitSquareGrid(gridField, region.cols, region.rows)
  if (floated.cell < MIN_WORD_FIT_CELL) return null

  const snapped = snapGridInField(gridField, floated.cell, region, vAlign)
  const letter = letterMetrics(snapped.cell)
  const parts: StudioFabricObject[] = []

  /** Cells whose glyph is printed on the puzzle page, not just on the key. */
  const revealed = new Set<string>()
  for (const slotId of puzzle.starters) {
    const slot = puzzle.slots[slotId]
    if (!slot) continue
    const step = delta(slot.dir)
    for (let i = 0; i < slot.length; i++) {
      revealed.add(`${slot.row + step.dr * i},${slot.col + step.dc * i}`)
    }
  }

  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) {
      const cell = grid[r]![c]
      if (cell === null) continue
      const box = snapped.cellBox(r, c)
      parts.push(
        buildRect(
          {
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            fill: STUDIO_PAPER,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'structure',
        ),
      )

      const isStarter = revealed.has(`${r + region.minR},${c + region.minC}`)
      const glyph = glyphFor(puzzle.mode, cell)
      parts.push(
        buildText(
          {
            left: boxCenterX(box),
            top: boxCenterY(box),
            text: glyph,
            fontFamily: puzzle.mode === 'numbers' ? STUDIO_DIGIT_FONT : font,
            fontSize: letter.fontSize,
            width: estimateTextBoxWidth(glyph, letter.fontSize, box.width),
            height: letter.boxHeight,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
            fill: STUDIO_INK,
          },
          tag,
          // A starter is printed; every other letter is the answer key, hidden
          // until the solution page reveals it.
          isStarter ? 'prompt' : 'answer',
        ),
      )
    }
  }

  parts.push(...drawWhiteCellEdges(grid, snapped.bounds, snapped.cell, tag))

  return {
    object: buildGroup(parts, snapped.bounds, tag),
    bounds: snapped.bounds,
  }
}

interface BankColumn {
  label: string
  entries: string[]
}

/** The bank, grouped by length — which is the only clue a fill-in gives. */
export function bankColumns(puzzle: WordFitPuzzle): BankColumn[] {
  const byLength = new Map<number, string[]>()
  for (const word of puzzle.words) {
    byLength.set(word.length, [...(byLength.get(word.length) ?? []), bankGlyphs(puzzle.mode, word)])
  }
  const unit = puzzle.mode === 'numbers' ? 'digits' : 'letters'
  return [...byLength.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([length, entries]) => ({
      label: `${length} ${unit}`,
      entries: [...entries].sort((a, b) => a.localeCompare(b)),
    }))
}

/** One line of bank ink — a group heading, or one entry. */
const BANK_LINE_STEP = BANK_ENTRY_SIZE * TEXT_PAINT_HEIGHT_RATIO + BANK_LINE_GAP
/** Air after a group, before the next heading in the same column. */
const BANK_GROUP_GAP = 4

export interface BankPlan {
  columns: BankColumn[]
  /** Groups assigned to each column, in reading order. */
  lanes: BankColumn[][]
  columnWidth: number
  height: number
}

function groupLines(group: BankColumn): number {
  return 1 + group.entries.length
}

/**
 * Deal the length groups into `count` columns, balanced and in order.
 *
 * Slicing the groups evenly by *count* rather than by height is what made the
 * bank twice as tall as it needed to be: with five groups over three columns,
 * one column took the two largest and another took a single three-word group,
 * so the band was sized for a ten-line column beside a two-line one. Sizing to
 * a running target keeps the tallest column near the average, and the height
 * the band reserves is the tallest column — so this is the difference between
 * the grid getting 480pt of the page and getting 320.
 */
function dealLanes(columns: BankColumn[], count: number): BankColumn[][] {
  const lanes: BankColumn[][] = Array.from({ length: count }, () => [])
  const totalLines = columns.reduce((sum, group) => sum + groupLines(group), 0)
  const target = Math.ceil(totalLines / count)

  let lane = 0
  let used = 0
  for (const group of columns) {
    const lines = groupLines(group)
    // Move on when this group would overshoot the target, unless the column is
    // still empty (a group taller than the target must go somewhere) or this is
    // the last column.
    if (used > 0 && used + lines > target && lane < count - 1) {
      lane++
      used = 0
    }
    lanes[lane]!.push(group)
    used += lines
  }
  return lanes
}

function laneHeight(lane: readonly BankColumn[]): number {
  if (lane.length === 0) return 0
  const lines = lane.reduce((sum, group) => sum + groupLines(group), 0)
  return lines * BANK_LINE_STEP + (lane.length - 1) * BANK_GROUP_GAP
}

/**
 * How the bank will be laid out in a field of `fieldWidth`, and how tall it is.
 *
 * Planning and drawing share this so the band the page reserves is exactly the
 * band the bank uses — reserving a guess and then drawing something taller is
 * how ink ends up past the bottom safe margin.
 */
export function planWordBank(options: {
  fieldWidth: number
  puzzle: WordFitPuzzle
}): BankPlan {
  const { fieldWidth, puzzle } = options
  const columns = bankColumns(puzzle)
  if (columns.length === 0) {
    return { columns, lanes: [], columnWidth: 0, height: 0 }
  }

  const widest = Math.max(
    ...columns.flatMap((group) => [
      estimateTextBoxWidth(group.label, BANK_LABEL_SIZE, fieldWidth),
      ...group.entries.map((entry) =>
        estimateTextBoxWidth(entry, BANK_ENTRY_SIZE, fieldWidth),
      ),
    ]),
  )
  const columnWidth = Math.ceil(widest + BANK_COLUMN_GAP)
  const count = Math.max(
    1,
    Math.min(columns.length, Math.floor(fieldWidth / Math.max(1, columnWidth))),
  )
  const lanes = dealLanes(columns, count)

  return {
    columns,
    lanes,
    columnWidth,
    height: Math.ceil(Math.max(1, ...lanes.map(laneHeight))),
  }
}

/**
 * The bank height to plan around before the puzzle exists.
 *
 * The lattice cap has to be chosen before there is a bank to measure, so this
 * models what `dealLanes` actually produces: the entries plus one heading per
 * length group, balanced over three columns. Three rather than the four a wide
 * body usually fits, so the estimate leans high without leaning so high that it
 * starves the packer — an over-tight cap is what made pages come back empty.
 */
export function estimateBankHeight(wordCount: number): number {
  const groups = Math.min(wordCount, 6)
  const lines = Math.ceil((wordCount + groups) / 3)
  return Math.ceil(lines * BANK_LINE_STEP + groups * BANK_GROUP_GAP)
}

/** The bank, grouped by length — the only clue a fill-in gives. */
export function drawWordBank(options: {
  field: Box
  plan: BankPlan
  puzzle: WordFitPuzzle
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const { field, plan, puzzle, font, tag } = options
  if (plan.lanes.length === 0) return null

  const entryFont = puzzle.mode === 'numbers' ? STUDIO_DIGIT_FONT : font
  const parts: StudioFabricObject[] = []
  const used = plan.lanes.length * plan.columnWidth
  const originX = field.left + Math.max(0, (field.width - used) / 2)
  let bottom = field.top

  plan.lanes.forEach((lane, index) => {
    const left = originX + index * plan.columnWidth
    let top = field.top
    for (const group of lane) {
      parts.push(
        buildText(
          {
            left,
            top,
            text: group.label,
            fontFamily: font,
            fontSize: BANK_LABEL_SIZE,
            width: estimateTextBoxWidth(group.label, BANK_LABEL_SIZE, plan.columnWidth),
            height: paintBoxHeight(BANK_LABEL_SIZE),
            fill: STUDIO_INK_MUTED,
            lineHeight: 1,
          },
          tag,
          'decoration',
        ),
      )
      top += BANK_LINE_STEP
      for (const entry of group.entries) {
        parts.push(
          buildText(
            {
              left,
              top,
              text: entry,
              fontFamily: entryFont,
              fontSize: BANK_ENTRY_SIZE,
              width: estimateTextBoxWidth(entry, BANK_ENTRY_SIZE, plan.columnWidth),
              height: paintBoxHeight(BANK_ENTRY_SIZE),
              fill: STUDIO_INK,
              lineHeight: 1,
            },
            tag,
            'prompt',
          ),
        )
        top += BANK_LINE_STEP
      }
      top += BANK_GROUP_GAP
    }
    bottom = Math.max(bottom, top)
  })

  return buildGroup(
    parts,
    {
      left: originX,
      top: field.top,
      width: used,
      height: Math.max(1, bottom - field.top),
    },
    tag,
  )
}

export { GRID_BANK_GAP }
