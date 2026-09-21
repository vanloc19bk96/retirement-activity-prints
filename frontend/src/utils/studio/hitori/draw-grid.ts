import type { StudioFabricObject } from '@/types/studio-template.types'
import { fitSquareGrid, insetBox, type Box } from '../studio-layout'
import { buildRect, buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_BOLD,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import type { HitoriPuzzle } from './types'

/** Breathing room from safe edges — same as Grid Copy / Number Snake. */
const FIELD_INSET = 16

/** Cell size the grid would use if drawn in `area`. */
export function cellForField(area: Box, size: number): number {
  return fitSquareGrid(insetBox(area, FIELD_INSET), size, size).cell
}

function ruleBar(
  left: number,
  top: number,
  width: number,
  height: number,
  tag: StudioTag,
): StudioFabricObject {
  return buildRect(
    {
      left,
      top,
      width,
      height,
      // Match Grid Copy / drawGridLines default — mid gray, not pure black.
      fill: STUDIO_RULE_MEDIUM,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/** Integer-aligned grid re-centered in `field`. */
function snapGridInField(field: Box, cell: number, size: number) {
  const width = cell * size
  const height = cell * size
  const left = Math.round(field.left + (field.width - width) / 2)
  const top = Math.round(field.top + (field.height - height) / 2)
  const bounds: Box = { left, top, width, height }
  return {
    cell,
    bounds,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * cell,
      top: top + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

function barOrigin(
  index: number,
  count: number,
  start: number,
  span: number,
  step: number,
  thickness: number,
): number {
  if (index === 0) return start
  if (index === count) return start + span - thickness
  return start + index * step - Math.floor(thickness / 2)
}

function lineThickness(index: number, size: number): number {
  if (index === 0 || index === size) return STUDIO_STROKE_BOLD
  return STUDIO_STROKE_HAIRLINE
}

function drawGridBars(
  g: ReturnType<typeof snapGridInField>,
  size: number,
  tag: StudioTag,
): StudioFabricObject[] {
  const bars: StudioFabricObject[] = []
  const { left, top, width, height } = g.bounds
  const cell = g.cell

  for (let line = 0; line <= size; line++) {
    const thickness = lineThickness(line, size)
    bars.push(
      ruleBar(
        barOrigin(line, size, left, width, cell, thickness),
        top,
        thickness,
        height,
        tag,
      ),
    )
  }

  for (let line = 0; line <= size; line++) {
    const thickness = lineThickness(line, size)
    bars.push(
      ruleBar(
        left,
        barOrigin(line, size, top, height, cell, thickness),
        width,
        thickness,
        tag,
      ),
    )
  }

  return bars
}

export function drawHitoriGrid(options: {
  field: Box
  puzzle: HitoriPuzzle
  tag: StudioTag
  /**
   * Cap cell size (solution page). Keeps the grid the same size as the puzzle
   * page while still centering in a taller no-instruction body.
   */
  maxCell?: number
}): StudioFabricObject {
  const { puzzle, tag, maxCell } = options
  // Inset before fit — with a page title the body shrinks and a full-bleed
  // square otherwise lands flush on (or past) the safe-area guide.
  const field = insetBox(options.field, FIELD_INSET)
  const { size, grid, shading } = puzzle
  const fittedCell = fitSquareGrid(field, size, size).cell
  const cell =
    maxCell !== undefined ? Math.max(1, Math.min(fittedCell, Math.floor(maxCell))) : fittedCell
  const g = snapGridInField(field, cell, size)
  const parts: StudioFabricObject[] = [...drawGridBars(g, size, tag)]

  /**
   * Identical top-left boxes for every digit — never originY:"center".
   * Centering each glyph bbox makes some digits sit higher and look larger
   * after Fabric remeasures (group children + per-glyph metrics).
   */
  const digitSize = Math.max(12, Math.round(g.cell * 0.5))
  const boxW = g.cell
  const boxH = digitSize
  const inset = Math.max(1, Math.round(g.cell * 0.1))
  // Nudge up: glyphs sit on the baseline in the lower part of the em box.
  const opticalLift = Math.round(digitSize * 0.08)

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = g.cellBox(r, c)
      const left = Math.round(cell.left + (cell.width - boxW) / 2)
      const top = Math.round(cell.top + (cell.height - boxH) / 2 - opticalLift)
      parts.push(
        buildText(
          {
            left,
            top,
            width: boxW,
            height: boxH,
            lineHeight: 1,
            text: String(grid[r]![c]),
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: digitSize,
            fontWeight: 'normal',
            textAlign: 'center',
            originX: 'left',
            originY: 'top',
            editable: false,
          },
          tag,
          'prompt',
        ),
      )

      if (!shading[r]![c]) continue
      parts.push(
        buildRect(
          {
            left: cell.left + inset,
            top: cell.top + inset,
            width: cell.width - inset * 2,
            height: cell.height - inset * 2,
            fill: STUDIO_INK,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'answer',
        ),
      )
    }
  }

  return buildGroup(parts, g.bounds, tag)
}
