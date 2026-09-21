import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { buildCheckMark } from '../studio-check-mark'
import { snapGridInField } from '../studio-grid-rules'
import {
  boxCenterX,
  boxCenterY,
  columns,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  insetBox,
  rows,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { interiorSegments, outlineLoops, type GridPoint } from './outline'
import { extentOf } from './polyomino'
import type { Figure, Format, Item } from './types'

const LABEL_W = 36
const ROW_GUTTER = 8
const MIN_ROW_H = 34
/** Print legibility floor: a shorter row shrinks 10-cell blocks below ~4mm a cell. */
const MAX_ROW_H = 108
const CHECK_SIZE = 14
/** With no frame drawn, the block only needs to clear its neighbour's gutter. */
const FIGURE_PAD = 2
const FIGURE_INNER_PAD = 2
/**
 * Never let the stack grow into the last of the body. The header height is an
 * estimate (instruction wrapping is measured, not rendered), so a stack sized to
 * the pixel spills past the safe area as soon as the real font wraps differently.
 */
const STACK_EDGE_RESERVE = 24
/** One weight for the whole silhouette — outline and cell grid read as one drawing. */
const FIGURE_STROKE = STUDIO_STROKE_NORMAL
/** Vertical space a tick box claims out of a pick-matches row. */
const TICK_RESERVE = CHECK_SIZE + 2
/** Smallest cell we will print: 13px at DPI 96 ≈ 3.4mm. */
export const MIN_CELL_PX = 13

/** Row height needed for the tallest block this tier can draw at MIN_CELL_PX. */
function minRowHeightFor(format: Format, blockSpan: number): number {
  const chrome = 2 * (FIGURE_PAD + FIGURE_INNER_PAD)
  const ticks = format === 'pick-matches' ? TICK_RESERVE : 0
  return blockSpan * MIN_CELL_PX + chrome + ticks
}

/**
 * How many rows the body can hold without pushing any cell below MIN_CELL_PX.
 *
 * Rows used to compress down to MIN_ROW_H, so a 12-item pick-matches page on a 6×9
 * trim printed cells under 1mm. Capping the count keeps every page shippable.
 */
export function fitItemCount(options: {
  bodyHeight: number
  format: Format
  blockSpan: number
  requested: number
  floor: number
}): number {
  const { bodyHeight, format, blockSpan, requested, floor } = options
  const usableH = Math.max(MIN_ROW_H, bodyHeight - STACK_EDGE_RESERVE)
  const rowH = minRowHeightFor(format, blockSpan)
  const fits = Math.floor((usableH + ROW_GUTTER) / (rowH + ROW_GUTTER))
  return Math.max(floor, Math.min(requested, fits))
}

function squareIn(box: Box, maxH: number): Box {
  const side = Math.min(box.width, maxH)
  return {
    left: box.left + (box.width - side) / 2,
    top: box.top + Math.max(0, (maxH - side) / 2),
    width: side,
    height: side,
  }
}

/**
 * Filled ink bar centered on a grid segment. Ends extend by half-thickness so
 * corners meet without gaps (same idea as studio-grid-rules bars).
 */
function segmentBar(
  from: GridPoint,
  to: GridPoint,
  toX: (x: number) => number,
  toY: (y: number) => number,
  thickness: number,
  tag: StudioTag,
): StudioFabricObject {
  const x1 = toX(from.x)
  const y1 = toY(from.y)
  const x2 = toX(to.x)
  const y2 = toY(to.y)
  const half = Math.floor(thickness / 2)
  if (y1 === y2) {
    return buildRect(
      {
        left: Math.min(x1, x2) - half,
        top: y1 - half,
        width: Math.abs(x2 - x1) + thickness,
        height: thickness,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'prompt',
    )
  }
  return buildRect(
    {
      left: x1 - half,
      top: Math.min(y1, y2) - half,
      width: thickness,
      height: Math.abs(y2 - y1) + thickness,
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'prompt',
  )
}

function drawFigure(
  objects: StudioFabricObject[],
  fig: Figure,
  box: Box,
  tag: StudioTag,
): void {
  // No frame around the block — whitespace separates the reference from the
  // candidates, and a boxed-in silhouette reads as clutter on a printed page.
  const field = insetBox(box, FIGURE_PAD)
  const parts: StudioFabricObject[] = []

  if (fig.cells.length > 0) {
    const { rows: rowCount, cols } = extentOf(fig.cells)
    const inner = insetBox(field, FIGURE_INNER_PAD)
    // Integer cell + re-center — float unit*index made every edge land on a
    // different sub-pixel, so squares looked different sizes and lines jogged.
    const grid = snapGridInField(inner, cols, rowCount)
    if (grid.cell >= 1) {
      const toX = (x: number): number => grid.bounds.left + x * grid.cell
      const toY = (y: number): number => grid.bounds.top + y * grid.cell

      // Accent fill only — a stroke would grow past the cell and look oversized.
      parts.push(
        buildRect(
          {
            ...grid.cellBox(fig.accent.r, fig.accent.c),
            fill: STUDIO_INK,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'prompt',
        ),
      )

      for (const [from, to] of interiorSegments(fig.cells)) {
        parts.push(segmentBar(from, to, toX, toY, FIGURE_STROKE, tag))
      }

      // One traced outline per boundary loop — this is what makes the shape readable.
      for (const loop of outlineLoops(fig.cells)) {
        for (let i = 0; i < loop.length; i++) {
          const from = loop[i]!
          const to = loop[(i + 1) % loop.length]!
          parts.push(segmentBar(from, to, toX, toY, FIGURE_STROKE, tag))
        }
      }
    }
  }

  const bounds = unionObjectBounds(parts) ?? field
  objects.push(buildGroup(parts, bounds, tag))
}

function drawSameDifferentAnswer(
  objects: StudioFabricObject[],
  box: Box,
  answer: 'SAME' | 'MIRROR',
  font: string,
  tag: StudioTag,
): void {
  // Inset so the answer oval stays inside the safe area.
  const field = insetBox(box, 4)
  const half = field.width / 2
  const sameBox: Box = { ...field, width: half }
  const mirrorBox: Box = { ...field, left: field.left + half, width: half }
  const fontSize = Math.max(11, Math.min(STUDIO_BODY_SIZE * 0.75, field.height * 0.35))

  for (const [label, target] of [
    ['SAME', sameBox],
    ['MIRROR', mirrorBox],
  ] as const) {
    const textW = estimateTextBoxWidth(label, fontSize, target.width - 4)
    objects.push(
      buildText(
        {
          left: boxCenterX(target),
          top: boxCenterY(target),
          text: label,
          width: textW,
          fontFamily: font,
          fontSize,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'structure',
      ),
    )
  }

  const label = answer
  const target = answer === 'SAME' ? sameBox : mirrorBox
  const textW = estimateTextBoxWidth(label, fontSize, target.width - 4)
  // Oval sized to the glyph run so SAME / MIRROR are fully enclosed (circle was too small).
  const padX = Math.max(8, fontSize * 0.45)
  const padY = Math.max(4, fontSize * 0.35)
  const ringW = Math.min(target.width - 2, textW + padX * 2)
  const ringH = Math.min(field.height - 2, fontSize + padY * 2)
  const rx = ringH / 2
  objects.push(
    buildRect(
      {
        left: boxCenterX(target),
        top: boxCenterY(target),
        width: ringW,
        height: ringH,
        rx,
        ry: rx,
        originX: 'center',
        originY: 'center',
        fill: 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'answer',
    ),
  )
}

function drawPickMatchTicks(
  objects: StudioFabricObject[],
  candidateSlots: Box[],
  correctIndices: number[],
  tag: StudioTag,
): void {
  candidateSlots.forEach((slot, i) => {
    const bx = boxCenterX(slot) - CHECK_SIZE / 2
    const by = slot.top + slot.height - CHECK_SIZE - 2
    objects.push(
      buildRect(
        {
          left: bx,
          top: by,
          width: CHECK_SIZE,
          height: CHECK_SIZE,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
          fill: 'transparent',
        },
        tag,
        'structure',
      ),
    )
    if (!correctIndices.includes(i)) return
    objects.push(
      buildCheckMark({ left: bx, top: by, size: CHECK_SIZE }, tag, 'answer'),
    )
  })
}

function drawItemRow(
  objects: StudioFabricObject[],
  box: Box,
  item: Item,
  index: number,
  format: Format,
  font: string,
  tag: StudioTag,
): void {
  const label = `${index})`
  const labelMaxW = LABEL_W - 4
  const labelSize = fitFontSizeToWidth(
    label,
    labelMaxW,
    Math.min(STUDIO_BODY_SIZE * 0.8, box.height * 0.4),
    10,
  )
  objects.push(
    buildText(
      {
        left: box.left,
        top: boxCenterY(box),
        text: label,
        width: estimateTextBoxWidth(label, labelSize, labelMaxW),
        fontFamily: font,
        fontSize: labelSize,
        fill: STUDIO_INK_MUTED,
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  const content: Box = {
    left: box.left + LABEL_W,
    top: box.top,
    width: box.width - LABEL_W,
    height: box.height,
  }

  if (format === 'same-different') {
    // Wider answer band so the MIRROR oval can fully enclose the word.
    const gutter = 10
    const answerW = Math.min(content.width * 0.38, 220)
    const figBandW = content.width - answerW - gutter
    const figSlots = columns(
      { ...content, width: figBandW },
      2,
      gutter,
    )
    const answerSlot: Box = {
      left: content.left + figBandW + gutter,
      top: content.top,
      width: answerW,
      height: content.height,
    }
    drawFigure(objects, item.ref, squareIn(figSlots[0]!, content.height), tag)
    drawFigure(objects, item.candidates[0]!, squareIn(figSlots[1]!, content.height), tag)
    drawSameDifferentAnswer(objects, answerSlot, item.answer ?? 'SAME', font, tag)
    return
  }

  // pick-matches: ref + 4 candidates; ticks under candidates (full column boxes).
  const slots = columns(content, 5, 8)
  const figH = content.height - TICK_RESERVE
  drawFigure(objects, item.ref, squareIn(slots[0]!, figH), tag)
  item.candidates.forEach((cand, i) => {
    const col = slots[i + 1]
    if (!col) return
    drawFigure(objects, cand, squareIn(col, figH), tag)
  })
  drawPickMatchTicks(objects, slots.slice(1), item.correctIndices ?? [], tag)
}

/** Centered vertical stack of item rows inside `field` — one movable group. */
export function drawItemStack(
  objects: StudioFabricObject[],
  field: Box,
  items: Item[],
  format: Format,
  font: string,
  tag: StudioTag,
): void {
  const itemCount = items.length
  if (itemCount === 0) return

  // Size against a shortened field so the last row always clears the safe-area edge.
  const usableH = Math.max(MIN_ROW_H, field.height - STACK_EDGE_RESERVE)
  const gutters = ROW_GUTTER * Math.max(0, itemCount - 1)
  const rowH = Math.min(
    MAX_ROW_H,
    Math.max(MIN_ROW_H, (usableH - gutters) / itemCount),
  )
  const stackH = Math.min(itemCount * rowH + gutters, usableH)
  const stackBox: Box = {
    left: field.left,
    top: field.top + Math.max(0, (usableH - stackH) / 2),
    width: field.width,
    height: stackH,
  }
  const rowBoxes = rows(stackBox, itemCount, ROW_GUTTER)

  const parts: StudioFabricObject[] = []
  items.forEach((item, i) => {
    const row = rowBoxes[i]
    if (!row) return
    drawItemRow(parts, row, item, i + 1, format, font, tag)
  })
  const bounds = unionObjectBounds(parts)
  if (!bounds) return
  // Shrink-wrap then center — solution page (no instruction) reuses this path.
  const centeredLeft = Math.round(
    field.left + Math.max(0, (field.width - bounds.width) / 2),
  )
  const dx = centeredLeft - bounds.left
  const shifted =
    dx === 0
      ? parts
      : parts.map((part) => ({
          ...part,
          left: (part.left ?? 0) + dx,
        }))
  objects.push(
    buildGroup(shifted, { ...bounds, left: centeredLeft }, tag, 'structure'),
  )
}
