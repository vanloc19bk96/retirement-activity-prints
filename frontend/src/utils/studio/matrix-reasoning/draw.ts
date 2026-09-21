import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  insetBox,
  rows,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildShape, fitUnit, SIZE_FACTOR } from './shapes'
import type { Figure, MatrixItem } from './types'

/** Air between the matrix and the strip of answers below it. */
const MATRIX_GAP = 16
const OPTION_GUTTER = 8
const LETTER_GAP = 4
const ITEM_GUTTER = 20
/** Print floor: a 3×3 at this cell is ~0.5in a side at the editor's 96 DPI. */
export const MIN_MATRIX_CELL = 46
const MAX_MATRIX_CELL = 110
const MIN_LETTER = 10
const MAX_LETTER = 15
/**
 * Never size the stack to the last pixel of the body. Header height is an
 * estimate (instruction wrapping is measured, not rendered), so a stack sized
 * exactly spills the moment the real font wraps one line differently.
 */
const STACK_EDGE_RESERVE = 20

/**
 * Below this, three shapes in one cell stop being countable on paper, so the
 * board planner is told not to use quantities of three at all.
 */
export const TRIPLE_CELL_FLOOR = 56

/**
 * Below this, an inner mark — a fifth of a figure's width — stops being a dot
 * and starts being a speck of toner, so mark rules are kept off the board.
 */
export const MARK_CELL_FLOOR = 52

export const OPTION_LETTERS = 'ABCDEF'

/** Shortest an item can be drawn before the print floors are breached. */
export function minItemHeight(): number {
  // Three grid rows, then one answer box of the *same* size — see `itemMetrics`.
  return MIN_MATRIX_CELL * 4 + MATRIX_GAP + LETTER_GAP + MIN_LETTER
}

/**
 * How many items the body can hold at readable size.
 *
 * Squeezing a third matrix onto a page is what turns a premium-looking sheet
 * into an eye test, so the count is trimmed rather than the artwork.
 */
export function fitItemCount(options: {
  bodyHeight: number
  requested: number
  floor: number
}): number {
  const { bodyHeight, requested, floor } = options
  const usable = Math.max(minItemHeight(), bodyHeight - STACK_EDGE_RESERVE)
  const per = minItemHeight()
  const fits = Math.floor((usable + ITEM_GUTTER) / (per + ITEM_GUTTER))
  return Math.max(floor, Math.min(requested, fits))
}

/** Height one item gets inside a stack of `count`. */
export function stackItemHeight(bodyHeight: number, count: number): number {
  const usable = Math.max(minItemHeight(), bodyHeight - STACK_EDGE_RESERVE)
  const gutters = ITEM_GUTTER * (count - 1)
  return Math.max(minItemHeight(), (usable - gutters) / count)
}

export interface ItemMetrics {
  /** Side of a grid cell *and* of an answer box — deliberately the same number. */
  cell: number
  letterSize: number
  gridSide: number
  stripWidth: number
  blockHeight: number
}

/**
 * The one measurement the whole puzzle hangs off.
 *
 * A grid cell and an answer box are drawn at exactly the same size, because
 * `size` is one of the rules the reader has to read off the page, and size is
 * only meaningful against a fixed frame. When the boxes below were smaller than
 * the cells above — as they were while the strip was sized independently — a
 * `small` figure in a big cell printed wider than a `medium` figure in a small
 * box, and the key pointed at a choice that looked nothing like the answer the
 * grid showed. One shared side length makes that impossible by construction,
 * not by tuning.
 */
export function itemMetrics(box: Box, optionCount: number): ItemMetrics {
  const letterSize = Math.max(MIN_LETTER, Math.min(MAX_LETTER, Math.round(box.height * 0.055)))
  const byStrip = (box.width - OPTION_GUTTER * (optionCount - 1)) / optionCount
  const byGrid = box.width / 3
  // Three grid rows plus one answer row of the same side.
  const byHeight = (box.height - MATRIX_GAP - LETTER_GAP - letterSize) / 4
  const cell = Math.max(
    MIN_MATRIX_CELL,
    Math.min(MAX_MATRIX_CELL, Math.floor(Math.min(byStrip, byGrid, byHeight))),
  )
  const gridSide = cell * 3
  return {
    cell,
    letterSize,
    gridSide,
    stripWidth: optionCount * cell + (optionCount - 1) * OPTION_GUTTER,
    blockHeight: gridSide + MATRIX_GAP + cell + LETTER_GAP + letterSize,
  }
}

/** Cell size a page will land on, before any figure is built. */
export function estimateCell(options: {
  bodyWidth: number
  bodyHeight: number
  itemCount: number
  optionCount: number
}): number {
  const { bodyWidth, bodyHeight, itemCount, optionCount } = options
  const height = stackItemHeight(bodyHeight, Math.max(1, itemCount))
  return itemMetrics({ left: 0, top: 0, width: bodyWidth, height }, optionCount).cell
}

/** The busiest cell on this puzzle — everything is scaled to fit that one. */
export function unitSlots(item: MatrixItem): number {
  return Math.max(
    1,
    ...item.cells.map((cell) => cell.count),
    ...item.options.map((option) => option.count),
  )
}

/** Side length one figure prints at inside a box of `side`, at `slots` per box. */
export function figureSide(figure: Figure, side: number, slots: number): number {
  const inner = side - 2 * Math.max(3, side * 0.12)
  if (inner <= 0) return 0
  const slot = inner / slots
  return fitUnit(Math.min(slot, inner * 0.94), slot, slots) * SIZE_FACTOR[figure.size]
}

/**
 * Lay `figure`'s shapes out inside one cell or answer box.
 *
 * `slots` is fixed per puzzle rather than per figure: dividing by each figure's
 * own count would make "two shapes" also mean "bigger shapes", so quantity and
 * size would stop being separate signals and the rule could not be read off the
 * page. Scaling to the busiest cell instead keeps a one-shape board full size.
 */
function drawFigureIn(
  parts: StudioFabricObject[],
  figure: Figure,
  box: Box,
  slots: number,
  tag: StudioTag,
  role: 'prompt' | 'answer' = 'prompt',
): void {
  const inner = insetBox(box, Math.max(3, Math.min(box.width, box.height) * 0.12))
  if (inner.width <= 0 || inner.height <= 0) return

  const slot = inner.width / slots
  const unit = fitUnit(Math.min(slot, inner.height * 0.94), slot, slots)
  const side = unit * SIZE_FACTOR[figure.size]
  const centerY = boxCenterY(inner)
  const centerX = boxCenterX(inner)

  for (let i = 0; i < figure.count; i++) {
    parts.push(
      ...buildShape(
        {
          centerX: centerX + (i - (figure.count - 1) / 2) * slot,
          centerY,
          side,
          shape: figure.shape,
          fill: figure.fill,
          mark: figure.mark,
        },
        tag,
        role,
      ),
    )
  }
}

function drawMatrix(
  parts: StudioFabricObject[],
  bounds: Box,
  cell: number,
  item: MatrixItem,
  slots: number,
  font: string,
  /** Solution page fills the gap in; the puzzle page prints a question mark. */
  revealBlank: boolean,
  tag: StudioTag,
): void {
  parts.push(
    ...drawGridLines(bounds, cell, 3, 3, tag, {
      // Bold on the frame only — interior indices are never 0 mod 3.
      boxCols: 3,
      boxRows: 3,
    }),
  )

  const cellBox = (r: number, c: number): Box => ({
    left: bounds.left + c * cell,
    top: bounds.top + r * cell,
    width: cell,
    height: cell,
  })

  for (let index = 0; index < 8; index++) {
    drawFigureIn(parts, item.cells[index]!, cellBox((index / 3) | 0, index % 3), slots, tag)
  }

  const blank = cellBox(2, 2)
  if (revealBlank) {
    drawFigureIn(parts, item.answer, blank, slots, tag)
    return
  }

  const size = Math.max(14, Math.round(cell * 0.4))
  parts.push(
    buildText(
      {
        left: boxCenterX(blank),
        top: boxCenterY(blank),
        text: '?',
        width: estimateTextBoxWidth('?', size, cell),
        fontFamily: font,
        fontSize: size,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
}

function drawOptionRow(
  parts: StudioFabricObject[],
  strip: Box,
  metrics: ItemMetrics,
  item: MatrixItem,
  slots: number,
  font: string,
  tag: StudioTag,
): void {
  const { cell, letterSize } = metrics
  const left = strip.left + (strip.width - metrics.stripWidth) / 2
  const radius = Math.max(3, Math.round(cell * 0.12))

  item.options.forEach((figure, i) => {
    const box: Box = {
      left: left + i * (cell + OPTION_GUTTER),
      top: strip.top,
      width: cell,
      height: cell,
    }

    parts.push(
      buildRect(
        {
          ...box,
          rx: radius,
          ry: radius,
          fill: 'transparent',
          stroke: STUDIO_RULE_LIGHT,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
        },
        tag,
        'structure',
      ),
    )
    drawFigureIn(parts, figure, box, slots, tag)

    if (i === item.correctIndex) {
      // Same geometry as the light box, in heavy ink: on the solution page it
      // simply darkens in place instead of adding a second, offset ring.
      parts.push(
        buildRect(
          {
            ...box,
            rx: radius,
            ry: radius,
            fill: 'transparent',
            stroke: STUDIO_INK,
            strokeWidth: STUDIO_STROKE_BOLD,
          },
          tag,
          'answer',
        ),
      )
    }

    const letter = OPTION_LETTERS[i] ?? ''
    parts.push(
      buildText(
        {
          left: boxCenterX(box),
          top: box.top + cell + LETTER_GAP,
          text: letter,
          width: estimateTextBoxWidth(letter, letterSize, cell),
          fontFamily: font,
          fontSize: letterSize,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    )
  })
}

function drawItem(
  parts: StudioFabricObject[],
  box: Box,
  item: MatrixItem,
  font: string,
  revealBlank: boolean,
  tag: StudioTag,
): void {
  const metrics = itemMetrics(box, item.options.length)
  const top = Math.round(box.top + Math.max(0, (box.height - metrics.blockHeight) / 2))
  const bounds: Box = {
    left: Math.round(box.left + (box.width - metrics.gridSide) / 2),
    top,
    width: metrics.gridSide,
    height: metrics.gridSide,
  }

  const slots = unitSlots(item)
  drawMatrix(parts, bounds, metrics.cell, item, slots, font, revealBlank, tag)
  drawOptionRow(
    parts,
    {
      ...box,
      top: top + metrics.gridSide + MATRIX_GAP,
      height: metrics.cell + LETTER_GAP + metrics.letterSize,
    },
    metrics,
    item,
    slots,
    font,
    tag,
  )
}

/** Centred vertical stack of items inside `field` — one movable group. */
export function drawItemStack(
  objects: StudioFabricObject[],
  field: Box,
  items: MatrixItem[],
  font: string,
  revealBlank: boolean,
  tag: StudioTag,
  /** Size rows from this body (puzzle page) so both pages match. */
  metricsField?: Box,
): void {
  if (items.length === 0) return

  const metrics = metricsField ?? field
  const usable = Math.max(minItemHeight(), metrics.height - STACK_EDGE_RESERVE)
  const gutters = ITEM_GUTTER * (items.length - 1)
  const itemH = stackItemHeight(metrics.height, items.length)
  const stackH = Math.min(items.length * itemH + gutters, Math.max(usable, field.height))
  const stackBox: Box = {
    left: field.left,
    top: field.top + Math.max(0, (field.height - stackH) / 2),
    width: field.width,
    height: stackH,
  }
  const itemBoxes = rows(stackBox, items.length, ITEM_GUTTER)

  const parts: StudioFabricObject[] = []
  items.forEach((item, i) => {
    const box = itemBoxes[i]
    if (!box) return
    drawItem(parts, box, item, font, revealBlank, tag)
  })

  const bounds = unionObjectBounds(parts)
  if (!bounds) return
  // Option strip is often narrower than the field — shrink-wrap then re-center
  // so the movable unit is not flush-left.
  const centeredLeft = Math.round(field.left + Math.max(0, (field.width - bounds.width) / 2))
  const centeredTop = Math.round(field.top + Math.max(0, (field.height - bounds.height) / 2))
  const dx = centeredLeft - bounds.left
  const dy = centeredTop - bounds.top
  const shifted =
    dx === 0 && dy === 0
      ? parts
      : parts.map((part) => ({
          ...part,
          left: (part.left ?? 0) + dx,
          top: (part.top ?? 0) + dy,
        }))
  objects.push(
    buildGroup(shifted, { ...bounds, left: centeredLeft, top: centeredTop }, tag, 'structure'),
  )
}
