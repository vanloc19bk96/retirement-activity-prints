/**
 * Painting a codeword page: the numbered grid, the starter line, and the key.
 *
 * Three blocks, and the order they are sized in is the whole design. The key
 * strip has a hard floor — it is where the solver writes, so its boxes cannot
 * shrink below a hand — and the starter line has a hard ceiling, because it is
 * one line that may never wrap. The grid takes what is left. Sizing the grid
 * first and giving the remainder to the key is how a page ends up with lovely
 * fat cells above a row of boxes nobody can write a capital into.
 */

import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  boxBottom,
  boxCenterX,
  boxCenterY,
  insetBox,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  hugTextBoxWidth,
  measureRunWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  TEXT_PAINT_HEIGHT_RATIO,
  drawWhiteCellEdges,
  occupiedLattice,
  paintBoxHeight,
  sliceOccupied,
  snapGridInField,
  type GridVAlign,
} from '../_shared/lattice-grid'
import { ptToPx } from '../retirement-word-search/layout'
import type { CodewordPuzzle } from './build'

/* -------------------------------------------------------------------------- *
 * Shared metrics
 * -------------------------------------------------------------------------- */

/** Air between the grid and the block under it. */
export const GRID_KEY_GAP = 22
/** Keeps the grid off the column edges so a bar never sits on the safe area. */
const GRID_FIELD_INSET = 2

/**
 * Where the number sits in its cell, and how much room is left to write in.
 *
 * A crossword tucks its clue number into a corner because only a handful of
 * cells carry one. Every cell of a codeword carries one, and twenty-six corner
 * numerals read as clutter rather than as a clue — so the number is centred in
 * a band along the foot of the cell, with the writing space above it. That also
 * puts the one thing the solver must read at a size they can read it at: the
 * cell can be small before the number is.
 */
const NUMBER_CELL_RATIO = 0.3
const LETTER_CELL_RATIO = 0.44
const CELL_BOTTOM_PAD_RATIO = 0.05
/** Nothing in this grid may print smaller than this, on any trim. */
export const NUMBER_MIN_SIZE = ptToPx(8)

/* -------------------------------------------------------------------------- *
 * The grid
 * -------------------------------------------------------------------------- */

export interface CodewordCellMetrics {
  numberSize: number
  numberBoxHeight: number
  letterSize: number
  letterBoxHeight: number
  /** Offset from the cell centre to the centre of the written letter. */
  letterOffsetY: number
  /** Offset from the cell centre to the centre of the printed number. */
  numberOffsetY: number
}

export function codewordCellMetrics(cell: number): CodewordCellMetrics {
  const numberSize = Math.max(NUMBER_MIN_SIZE, Math.floor(cell * NUMBER_CELL_RATIO))
  const numberBoxHeight = paintBoxHeight(numberSize)
  const bottomPad = Math.max(2, Math.round(cell * CELL_BOTTOM_PAD_RATIO))
  const numberBand = bottomPad + numberBoxHeight
  const letterField = Math.max(1, cell - numberBand - 1)
  const letterSize = Math.max(
    8,
    Math.min(
      Math.floor(cell * LETTER_CELL_RATIO),
      Math.floor(letterField / TEXT_PAINT_HEIGHT_RATIO),
    ),
  )
  return {
    numberSize,
    numberBoxHeight,
    letterSize,
    letterBoxHeight: paintBoxHeight(letterSize),
    letterOffsetY: letterField / 2 - cell / 2,
    numberOffsetY: cell / 2 - bottomPad - numberBoxHeight / 2,
  }
}

export interface CodewordGridGeometry {
  cell: number
  rows: number
  cols: number
  bounds: Box
}

/**
 * Largest cell this field allows for this grid, never above `maxCell`.
 *
 * The build is cropped to its used cells, so a grid that packed into a narrow
 * rectangle gets bigger squares rather than a square field with empty rows.
 */
export function codewordGridGeometry(
  puzzle: CodewordPuzzle,
  field: Box,
  maxCell: number,
  vAlign: GridVAlign,
): CodewordGridGeometry {
  const gridField = insetBox(field, GRID_FIELD_INSET)
  const region = occupiedLattice(puzzle.grid, puzzle.size)
  const cell = Math.max(
    1,
    Math.floor(
      Math.min(gridField.width / region.cols, gridField.height / region.rows, maxCell),
    ),
  )
  const snapped = snapGridInField(gridField, cell, region, vAlign)
  return { cell, rows: region.rows, cols: region.cols, bounds: snapped.bounds }
}

/**
 * One group holding the whole lattice.
 *
 * Every cell prints its number as `prompt`. The letter is drawn in every cell
 * too, but only a starter's is `prompt` — the rest are hidden `answer` objects,
 * which is what lets the solution page reveal the finished grid without a
 * second layout pass, and lets the editor reveal one sheet in place.
 *
 * Cells are painted white rather than the field being painted black: solid
 * black squares double the ink on an interior page, read heavy in print-on-
 * demand, and an open lattice is the friendlier page to write on.
 */
function drawGrid(options: {
  puzzle: CodewordPuzzle
  field: Box
  font: string
  tag: StudioTag
  maxCell: number
  vAlign: GridVAlign
}): StudioFabricObject | null {
  const { puzzle, field, font, tag, maxCell, vAlign } = options
  const gridField = insetBox(field, GRID_FIELD_INSET)
  const region = occupiedLattice(puzzle.grid, puzzle.size)
  const grid = sliceOccupied(puzzle.grid, region)
  const geometry = codewordGridGeometry(puzzle, field, maxCell, vAlign)
  const snapped = snapGridInField(gridField, geometry.cell, region, vAlign)
  const metrics = codewordCellMetrics(geometry.cell)
  const parts: StudioFabricObject[] = []

  for (let r = 0; r < region.rows; r++) {
    for (let c = 0; c < region.cols; c++) {
      const letter = grid[r]![c]
      if (letter === null) continue
      const cellBox = snapped.cellBox(r, c)
      const centerX = boxCenterX(cellBox)
      const centerY = boxCenterY(cellBox)

      parts.push(
        buildRect(
          {
            left: cellBox.left,
            top: cellBox.top,
            width: cellBox.width,
            height: cellBox.height,
            fill: STUDIO_PAPER,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'structure',
        ),
      )

      const number = String(puzzle.letterToNumber.get(letter) ?? '')
      parts.push(
        buildText(
          {
            left: centerX,
            top: centerY + metrics.numberOffsetY,
            text: number,
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: metrics.numberSize,
            fontWeight: 'normal',
            width: hugTextBoxWidth(number, metrics.numberSize, cellBox.width, {
              fontFamily: STUDIO_DIGIT_FONT,
            }),
            height: metrics.numberBoxHeight,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
          },
          tag,
          'prompt',
        ),
      )

      const isStarter = puzzle.starters.has(letter)
      parts.push(
        buildText(
          {
            left: centerX,
            top: centerY + metrics.letterOffsetY,
            text: letter,
            fontFamily: font,
            fontSize: metrics.letterSize,
            fontWeight: isStarter ? 700 : 'normal',
            width: hugTextBoxWidth(letter, metrics.letterSize, cellBox.width, {
              fontFamily: font,
            }),
            height: metrics.letterBoxHeight,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
          },
          tag,
          isStarter ? 'prompt' : 'answer',
        ),
      )
    }
  }

  if (parts.length === 0) return null
  // Bars last, so every edge keeps the same weight over the white fills.
  parts.push(...drawWhiteCellEdges(grid, snapped.bounds, geometry.cell, tag))
  return buildGroup(parts, snapped.bounds, tag, 'structure')
}

/* -------------------------------------------------------------------------- *
 * The starter line
 * -------------------------------------------------------------------------- */

export const STARTER_CAPTION_LABEL = 'Starter letters:'
export const STARTER_CAPTION_MAX_SIZE = ptToPx(14)
export const STARTER_CAPTION_MIN_SIZE = ptToPx(10)
export const STARTER_CAPTION_GAP = 14

/**
 * The pairs the puzzle is opened with, in number order.
 *
 * Read as "3 = A", never "A = 3": the solver meets the number first — it is
 * what is printed in the cells — and the letter is what they are being told.
 */
export function starterPairs(puzzle: CodewordPuzzle): string[] {
  return [...puzzle.starters]
    .map((letter) => ({ letter, number: puzzle.letterToNumber.get(letter) ?? 0 }))
    .sort((a, b) => a.number - b.number)
    .map((pair) => `${pair.number} = ${pair.letter}`)
}

/** The widest way the line can be set: label, wide gaps, every pair. */
export function starterCaptionText(puzzle: CodewordPuzzle): string {
  return `${STARTER_CAPTION_LABEL}    ${starterPairs(puzzle).join('        ')}`
}

/**
 * How the line may be set, roomiest first.
 *
 * Two or three pairs on one line is the shape a reader recognises as "here is
 * what you are given"; the same pairs broken over two lines read as a list of
 * something else — and, because the page reserves one line of height for them,
 * a second line would print on top of the number key. So air is given up before
 * the label is, and the label before the line is allowed to wrap at all.
 */
function starterCaptionCandidates(puzzle: CodewordPuzzle): string[] {
  const pairs = starterPairs(puzzle)
  return [
    starterCaptionText(puzzle),
    `${STARTER_CAPTION_LABEL}  ${pairs.join('    ')}`,
    pairs.join('        '),
    pairs.join('    '),
  ]
}

function starterCaptionSpec(font: string): FontSpec {
  return { fontFamily: font, fontWeight: 700 }
}

/**
 * Largest size at which `text` still sets on one line inside `width`.
 *
 * Measured rather than estimated, the way `fitHeaderTitle` measures a heading:
 * bold serif caps run wider than the shared per-glyph estimate, and this line
 * is nothing but caps and digits. Returns the floor when nothing fits, which is
 * the caller's signal to try a shorter form of the line.
 */
export function starterCaptionSize(
  text: string,
  width: number,
  font: string,
): number {
  const spec = starterCaptionSpec(font)
  for (let size = STARTER_CAPTION_MAX_SIZE; size > STARTER_CAPTION_MIN_SIZE; size--) {
    if (hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec) <= width) return size
  }
  return STARTER_CAPTION_MIN_SIZE
}

export interface StarterCaption {
  text: string
  fontSize: number
  /** False when even the tightest form overruns — preflight refuses the page. */
  fitsOneLine: boolean
}

/** The starter line as it will print: one line, as roomy as the column allows. */
export function resolveStarterCaption(
  puzzle: CodewordPuzzle,
  width: number,
  font: string,
): StarterCaption {
  const spec = starterCaptionSpec(font)
  const candidates = starterCaptionCandidates(puzzle)
  for (const text of candidates) {
    const fontSize = starterCaptionSize(text, width, font)
    if (hugTextBoxWidth(text, fontSize, Number.POSITIVE_INFINITY, spec) <= width) {
      return { text, fontSize, fitsOneLine: true }
    }
  }
  return {
    text: candidates[candidates.length - 1]!,
    fontSize: STARTER_CAPTION_MIN_SIZE,
    fitsOneLine: false,
  }
}

export function starterCaptionHeight(fontSize: number): number {
  return paintBoxHeight(fontSize) + STARTER_CAPTION_GAP
}

function drawStarterCaption(
  caption: StarterCaption,
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const text = toNonBreakingSpaces(caption.text)
  return [
    buildText(
      {
        left: boxCenterX(area),
        top: area.top,
        text,
        fontFamily: font,
        fontSize: caption.fontSize,
        fontWeight: 700,
        width: hugTextBoxWidth(text, caption.fontSize, area.width, {
          fontFamily: font,
          fontWeight: 700,
        }),
        height: paintBoxHeight(caption.fontSize),
        textAlign: 'center',
        originX: 'center',
        lineHeight: 1,
        fill: STUDIO_INK,
      },
      tag,
      // Puzzle information, not ornament: the answer key drops decoration, and
      // these pairs are part of how the page is read.
      'prompt',
    ),
  ]
}

/* -------------------------------------------------------------------------- *
 * The key strip
 * -------------------------------------------------------------------------- */

/**
 * The working area: one box per number, with the number printed under it.
 *
 * This is the block that makes a codeword solvable on paper. Without it a
 * solver has to hold the code in their head or write it in a margin, and the
 * margin of a KDP interior is a quarter of an inch. The starters are printed
 * into their own boxes, so the strip doubles as the statement of what was
 * given; every other box is an `answer`, so the solution page fills the whole
 * code in without a second layout.
 */
export const KEY_FONT_MIN = ptToPx(9)
export const KEY_FONT_MAX = ptToPx(12)
/** Writing box as a multiple of its number label — a capital needs the room. */
const KEY_BOX_RATIO = 2
const KEY_LETTER_RATIO = 0.6
const KEY_MIN_GUTTER = 8
const KEY_BOX_LABEL_GAP = 3
const KEY_ROW_GAP = 10
/**
 * Thirteen is the alphabet in two even rows — the shape a reader recognises as
 * a complete code rather than as a table that happens to have run out.
 */
const KEY_MAX_COLUMNS = 13
/** Largest code this page can print, used to reserve the strip before it exists. */
export const KEY_MAX_ITEMS = 26

export interface CodewordKeyItem {
  number: number
  letter: string
  /** True when this pair is one of the starters, printed before the solver begins. */
  given: boolean
}

export interface CodewordKeyPlan {
  fontSize: number
  boxSide: number
  letterSize: number
  /** Width of one item column — uniform, so the numbers line up down the strip. */
  cellWidth: number
  columnCount: number
  rowCount: number
  gutter: number
  rowHeight: number
  items: CodewordKeyItem[]
  blockWidth: number
  /** Height the drawn strip occupies. */
  height: number
}

function keyBoxSide(fontSize: number): number {
  return Math.round(fontSize * KEY_BOX_RATIO)
}

function keyRowHeight(fontSize: number): number {
  return keyBoxSide(fontSize) + KEY_BOX_LABEL_GAP + paintBoxHeight(fontSize)
}

function keyStripHeight(rowCount: number, fontSize: number): number {
  const rows = Math.max(1, rowCount)
  return rows * keyRowHeight(fontSize) + Math.max(0, rows - 1) * KEY_ROW_GAP
}

/** Widest label any code of `itemCount` numbers can print, in pixels. */
function widestLabelWidth(itemCount: number, fontSize: number): number {
  const widest = itemCount >= 10 ? '26' : String(Math.max(1, itemCount))
  return Math.ceil(
    measureRunWidth(widest, fontSize, { fontFamily: STUDIO_DIGIT_FONT }),
  )
}

function keyCellWidth(itemCount: number, fontSize: number): number {
  return Math.max(keyBoxSide(fontSize), widestLabelWidth(itemCount, fontSize))
}

function keyColumnsFor(bandWidth: number, cellWidth: number, itemCount: number): number {
  if (cellWidth > bandWidth) return 0
  const fits = Math.floor((bandWidth + KEY_MIN_GUTTER) / (cellWidth + KEY_MIN_GUTTER))
  return Math.max(1, Math.min(fits, KEY_MAX_COLUMNS, Math.max(1, itemCount)))
}

/**
 * Gutter that spreads the columns across the band.
 *
 * Bounded by the box itself so a short code (say fourteen numbers on a wide
 * trim) reads as a row of boxes rather than as boxes scattered down a page.
 */
function keyGutterFor(
  bandWidth: number,
  cellWidth: number,
  columnCount: number,
): number {
  if (columnCount <= 1) return 0
  const spread = Math.floor((bandWidth - cellWidth * columnCount) / (columnCount - 1))
  return Math.max(KEY_MIN_GUTTER, Math.min(spread, cellWidth))
}

/**
 * Shortest the strip can ever be, for the largest code this page could print.
 *
 * This is what `layout.ts` subtracts before it sizes the grid, so it has to be
 * a floor for every puzzle the page might draw — hence twenty-six items at the
 * smallest type. Null means one box is wider than the whole column, and the
 * form says the page is too small rather than printing a strip off the margin.
 */
export function minCodewordKeyHeight(bandWidth: number): number | null {
  const cellWidth = keyCellWidth(KEY_MAX_ITEMS, KEY_FONT_MIN)
  const columnCount = keyColumnsFor(bandWidth, cellWidth, KEY_MAX_ITEMS)
  if (columnCount === 0) return null
  return keyStripHeight(Math.ceil(KEY_MAX_ITEMS / columnCount), KEY_FONT_MIN)
}

function planKeyAtSize(options: {
  items: readonly CodewordKeyItem[]
  bandWidth: number
  fontSize: number
}): CodewordKeyPlan | null {
  const { items, bandWidth, fontSize } = options
  const cellWidth = keyCellWidth(items.length, fontSize)
  const columnCount = keyColumnsFor(bandWidth, cellWidth, items.length)
  if (columnCount === 0) return null
  const rowCount = Math.ceil(items.length / columnCount)
  const gutter = keyGutterFor(bandWidth, cellWidth, columnCount)
  return {
    fontSize,
    boxSide: keyBoxSide(fontSize),
    letterSize: Math.max(8, Math.round(keyBoxSide(fontSize) * KEY_LETTER_RATIO)),
    cellWidth,
    columnCount,
    rowCount,
    gutter,
    rowHeight: keyRowHeight(fontSize),
    items: [...items],
    blockWidth: cellWidth * columnCount + gutter * (columnCount - 1),
    height: keyStripHeight(rowCount, fontSize),
  }
}

/** Largest size at which the whole strip fits `maxHeight`, or null. */
export function planCodewordKey(options: {
  items: readonly CodewordKeyItem[]
  bandWidth: number
  maxHeight: number
}): CodewordKeyPlan | null {
  const { items, bandWidth, maxHeight } = options
  if (items.length === 0) return null
  for (let fontSize = KEY_FONT_MAX; fontSize >= KEY_FONT_MIN; fontSize--) {
    const plan = planKeyAtSize({ items, bandWidth, fontSize })
    if (plan && plan.height <= maxHeight) return plan
  }
  return null
}

/** Every number this puzzle prints, in the order the strip runs. */
export function codewordKeyItems(puzzle: CodewordPuzzle): CodewordKeyItem[] {
  return [...puzzle.numberToLetter.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, letter]) => ({
      number,
      letter,
      given: puzzle.starters.has(letter),
    }))
}

function drawKeyStrip(
  plan: CodewordKeyPlan,
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const objects: StudioFabricObject[] = []
  const cellWidth = plan.cellWidth
  const left = area.left + Math.max(0, Math.round((area.width - plan.blockWidth) / 2))
  let top = area.top

  for (let row = 0; row < plan.rowCount; row++) {
    const slice = plan.items.slice(row * plan.columnCount, (row + 1) * plan.columnCount)
    if (slice.length === 0) continue
    const parts: StudioFabricObject[] = []

    slice.forEach((item, column) => {
      const cellLeft = left + column * (cellWidth + plan.gutter)
      const boxLeft = cellLeft + Math.round((cellWidth - plan.boxSide) / 2)

      parts.push(
        buildRect(
          {
            left: boxLeft,
            top,
            width: plan.boxSide,
            height: plan.boxSide,
            fill: 'transparent',
            stroke: STUDIO_RULE_MEDIUM,
            strokeWidth: STUDIO_STROKE_HAIRLINE,
          },
          tag,
          'structure',
        ),
      )

      parts.push(
        buildText(
          {
            left: boxLeft + plan.boxSide / 2,
            top: top + plan.boxSide / 2,
            text: item.letter,
            fontFamily: font,
            fontSize: plan.letterSize,
            fontWeight: item.given ? 700 : 'normal',
            width: hugTextBoxWidth(item.letter, plan.letterSize, plan.boxSide, {
              fontFamily: font,
            }),
            height: paintBoxHeight(plan.letterSize),
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
            fill: STUDIO_INK,
          },
          tag,
          item.given ? 'prompt' : 'answer',
        ),
      )

      const label = String(item.number)
      parts.push(
        buildText(
          {
            left: cellLeft + cellWidth / 2,
            top: top + plan.boxSide + KEY_BOX_LABEL_GAP,
            text: label,
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: plan.fontSize,
            fontWeight: 'normal',
            width: hugTextBoxWidth(label, plan.fontSize, cellWidth, {
              fontFamily: STUDIO_DIGIT_FONT,
            }),
            height: paintBoxHeight(plan.fontSize),
            textAlign: 'center',
            originX: 'center',
            lineHeight: 1,
            fill: STUDIO_INK,
          },
          tag,
          'prompt',
        ),
      )
    })

    const bounds = unionObjectBounds(parts)
    if (bounds) objects.push(buildGroup(parts, bounds, tag, 'structure'))
    top += plan.rowHeight + KEY_ROW_GAP
  }

  return objects
}

/* -------------------------------------------------------------------------- *
 * The page
 * -------------------------------------------------------------------------- */

export interface CodewordDrawnPage {
  objects: StudioFabricObject[]
  key: CodewordKeyPlan
  gridCell: number
  /** Null on the solution page, which prints the whole code instead. */
  starterCaption: StarterCaption | null
}

/**
 * Grid over starter line over key strip, as one optically centred stack.
 *
 * The key is measured first because it is the block with the hard floor, and
 * the grid then takes what is left — the same order the crossword sizes its
 * clue list in, for the same reason. The whole stack is then centred, so a
 * compact grid does not leave the page bottom-heavy.
 *
 * `forAnswerKey` drops the starter line. On the solution page every pair is
 * filled in, so a line repeating two of them says nothing the strip below it
 * does not already say, and the height is better spent on the strip itself.
 */
export function drawCodewordPuzzle(options: {
  field: Box
  puzzle: CodewordPuzzle
  font: string
  tag: StudioTag
  maxCell: number
  minCell: number
  forAnswerKey?: boolean
}): CodewordDrawnPage | null {
  const { field, puzzle, font, tag, maxCell, minCell, forAnswerKey = false } = options
  const region = occupiedLattice(puzzle.grid, puzzle.size)
  const items = codewordKeyItems(puzzle)

  const caption = forAnswerKey ? null : resolveStarterCaption(puzzle, field.width, font)
  const captionBlock = caption ? starterCaptionHeight(caption.fontSize) : 0

  // Reserve what the grid needs before offering the rest to the key, inset
  // included — the two pixels the lattice gives up to the field edge are what
  // put a cell a hair under the writable floor.
  const keyBudget = Math.max(
    0,
    field.height -
      (region.rows * minCell + GRID_FIELD_INSET * 2) -
      GRID_KEY_GAP -
      captionBlock,
  )
  const key = planCodewordKey({ items, bandWidth: field.width, maxHeight: keyBudget })
  if (!key) return null

  const gridField: Box = {
    ...field,
    height: Math.max(
      minCell + GRID_FIELD_INSET * 2,
      field.height - captionBlock - key.height - GRID_KEY_GAP,
    ),
  }
  const geometry = codewordGridGeometry(puzzle, gridField, maxCell, 'top')

  // The lattice sits `GRID_FIELD_INSET` inside the box it is given, so the stack
  // is that much taller than the sum of its blocks. Counting it keeps the centre
  // honest and keeps the bottom of the key strip inside the field.
  const stackHeight =
    geometry.bounds.height +
    GRID_FIELD_INSET * 2 +
    GRID_KEY_GAP +
    captionBlock +
    key.height
  const offsetY = Math.max(0, Math.floor((field.height - stackHeight) / 2))

  const drawnGridField: Box = { ...gridField, top: field.top + offsetY }
  const grid = drawGrid({
    puzzle,
    field: drawnGridField,
    font,
    tag,
    maxCell,
    vAlign: 'top',
  })
  if (!grid) return null

  const objects: StudioFabricObject[] = [grid]
  // Measured off the lattice that was actually drawn, not off the box it was
  // offered: the two are a hairline apart, and the caption sits on that line.
  let cursor =
    boxBottom(codewordGridGeometry(puzzle, drawnGridField, maxCell, 'top').bounds) +
    GRID_KEY_GAP

  if (caption) {
    objects.push(
      ...drawStarterCaption(
        caption,
        { ...field, top: cursor, height: captionBlock },
        font,
        tag,
      ),
    )
    cursor += captionBlock
  }

  objects.push(
    ...drawKeyStrip(key, { ...field, top: cursor, height: key.height }, font, tag),
  )

  return { objects, key, gridCell: geometry.cell, starterCaption: caption }
}
