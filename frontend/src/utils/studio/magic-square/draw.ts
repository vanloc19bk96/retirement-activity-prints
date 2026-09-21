import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  rows,
  columns,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  fitSquareGrid,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { drawGridLines } from '../studio-grid-rules'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import type { MagicPuzzle } from './types'

const BANNER_H = 32
const BANNER_PREFERRED = Math.round(STUDIO_BODY_SIZE * 0.7)
const BANNER_MIN_SIZE = 11
/**
 * Fabric’s Inter metrics run wider than textAdvanceUnits — without this pad the
 * banner soft-wraps (“…to” / “5832”) and the group clips the first line.
 */
const BANNER_WIDTH_PAD = 1.12
const BLOCK_GUTTER = 28
const FIELD_INSET = 4
/** Keep the bottom square clear of the page safe-area edge. */
const BODY_BOTTOM_CLEARANCE = 18

/** Even slots for 1–4 squares — stack, 2+1, or 2×2 so cells stay legible. */
export function layoutBlocks(body: Box, count: number): Box[] {
  const field: Box = {
    ...body,
    height: Math.max(1, body.height - BODY_BOTTOM_CLEARANCE),
  }
  if (count <= 1) return [field]
  if (count === 2) return rows(field, 2, BLOCK_GUTTER)
  // 2 on top + 1 centered below — same slot size as 2×2 (3 stacked rows shrink cells).
  if (count === 3) {
    const [top, bot] = rows(field, 2, BLOCK_GUTTER)
    const topSlots = columns(top!, 2, BLOCK_GUTTER)
    const slot = topSlots[0]!
    const bottomSlot: Box = {
      left: bot!.left + (bot!.width - slot.width) / 2,
      top: bot!.top + Math.max(0, (bot!.height - slot.height) / 2),
      width: slot.width,
      height: Math.min(slot.height, bot!.height),
    }
    return [...topSlots, bottomSlot]
  }
  const [top, bot] = rows(field, 2, BLOCK_GUTTER)
  return [...columns(top!, 2, BLOCK_GUTTER), ...columns(bot!, 2, BLOCK_GUTTER)]
}

export function bannerFor(
  puzzle: MagicPuzzle,
  hideConstant: boolean,
  index: number | null,
): string {
  const prefix = index === null ? '' : `Square ${index}: `
  const verb = puzzle.operation === 'multiply' ? 'multiplies' : 'adds'
  const noun = puzzle.operation === 'multiply' ? 'product' : 'total'
  return hideConstant
    ? `${prefix}work out the line ${noun}`
    : `${prefix}each line ${verb} to ${puzzle.constant}`
}

/** Cell size a square would use if drawn in `area` (banner band reserved). */
export function cellForArea(area: Box, order: number): number {
  const field = insetBox(area, FIELD_INSET)
  return fitSquareGrid(
    {
      left: field.left,
      top: field.top,
      width: field.width,
      height: Math.max(1, field.height - BANNER_H),
    },
    order,
    order,
  ).cell
}

export function drawSquare(options: {
  area: Box
  puzzle: MagicPuzzle
  hideConstant: boolean
  /** null hides the “Square N” prefix — used when the page holds one square. */
  index: number | null
  font: string
  tag: StudioTag
  /**
   * Cap cell size (solution page). Keeps the grid the same size as the puzzle
   * page while still centering in a taller no-instruction body.
   */
  maxCell?: number
}): StudioFabricObject {
  const { area, puzzle, hideConstant, index, font, tag, maxCell } = options
  const { order, grid, blank } = puzzle
  const field = insetBox(area, FIELD_INSET)

  // Fit the square in the slot with a banner band reserved above it, then
  // pack banner+grid and center the unit so puzzle and solution pages match.
  const fittedCell = cellForArea(area, order)
  const cell =
    maxCell !== undefined ? Math.max(1, Math.min(fittedCell, Math.floor(maxCell))) : fittedCell
  const gridW = cell * order
  const gridH = cell * order
  const packH = BANNER_H + gridH
  const packTop = Math.round(field.top + Math.max(0, (field.height - packH) / 2))
  const gridLeft = Math.round(field.left + (field.width - gridW) / 2)
  const gridTop = packTop + BANNER_H
  const bounds: Box = {
    left: gridLeft,
    top: gridTop,
    width: gridW,
    height: gridH,
  }
  const cellBox = (r: number, c: number): Box => ({
    left: gridLeft + c * cell,
    top: gridTop + r * cell,
    width: cell,
    height: cell,
  })

  // Banner sits in the reserved band above the grid. Fit + pad width so the
  // line never soft-wraps — a wrapped banner gets clipped by the group box.
  const banner: Box = {
    left: field.left,
    top: packTop,
    width: field.width,
    height: BANNER_H,
  }
  const bannerText = bannerFor(puzzle, hideConstant, index)
  const bannerSize = fitFontSizeToWidth(
    bannerText,
    banner.width,
    BANNER_PREFERRED,
    BANNER_MIN_SIZE,
  )
  const bannerBoxW = Math.min(
    banner.width,
    Math.ceil(estimateTextBoxWidth(bannerText, bannerSize, banner.width) * BANNER_WIDTH_PAD),
  )
  const parts: StudioFabricObject[] = [
    buildText(
      {
        left: boxCenterX(banner),
        top: boxCenterY(banner),
        text: bannerText,
        fontFamily: font,
        fontSize: bannerSize,
        fill: STUDIO_INK_MUTED,
        width: bannerBoxW,
        height: bannerSize,
        lineHeight: 1,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
    // Same even-weight mid-gray bars as Grid Copy (not black bold outer frame).
    ...drawGridLines(bounds, cell, order, order, tag),
  ]

  // Size for the widest value on the page — stepped and multiplicative sets
  // reach three digits, and they must not spill out of the cell.
  const widest = String(Math.max(...grid.flat())).length
  const fontSize = Math.max(
    10,
    Math.min(Math.round(cell * 0.42), Math.floor(cell / (widest * 0.55 + 0.4))),
  )

  for (let r = 0; r < order; r++) {
    for (let c = 0; c < order; c++) {
      const box = cellBox(r, c)
      const text = String(grid[r]![c]!)
      parts.push(
        buildText(
          {
            left: Math.round(box.left + box.width / 2),
            top: Math.round(box.top + box.height / 2),
            text,
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize,
            fontWeight: 'normal',
            width: estimateTextBoxWidth(text, fontSize, box.width),
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
          },
          tag,
          blank[r]![c] ? 'answer' : 'prompt',
        ),
      )
    }
  }

  return buildGroup(
    parts,
    unionObjectBounds(parts) ?? {
      left: gridLeft,
      top: packTop,
      width: bounds.width,
      height: packH,
    },
    tag,
  )
}
