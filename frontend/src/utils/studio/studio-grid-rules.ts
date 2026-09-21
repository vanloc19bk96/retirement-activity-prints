import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { fitSquareGrid, type Box } from './studio-layout'
import { buildRect, type StudioTag } from './studio-fabric-builders'

export interface DrawGridLinesOptions {
  /** Bar thickness in px. Default: STUDIO_STROKE_HAIRLINE. */
  thickness?: number
  /** Bar fill color. Default: STUDIO_RULE_MEDIUM. */
  fill?: string
  /** Vertical cell pitch when cells are not square. Default: same as `cell`. */
  rowPitch?: number
  /** Box band width in cells (e.g. Sudoku 3). With `boxRows`, box edges use `boldThickness`. */
  boxCols?: number
  /** Box band height in cells (e.g. Sudoku 3). */
  boxRows?: number
  /** Thickness for box / outer band edges when `boxCols`/`boxRows` are set. Default: STUDIO_STROKE_BOLD. */
  boldThickness?: number
}

/** Filled bars (not stroked cell rects) — even weight on every edge, incl. right/bottom. */
function ruleBar(
  left: number,
  top: number,
  width: number,
  height: number,
  fill: string,
  tag: StudioTag,
): StudioFabricObject {
  return buildRect(
    {
      left,
      top,
      width,
      height,
      fill,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/** Keep outer bars flush inside bounds; center internal bars on the grid line. */
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

/** Integer-aligned grid re-centered in `field` (avoids top-left bias from rounding). */
export function snapGridInField(field: Box, cols: number, rows: number) {
  const cell = fitSquareGrid(field, cols, rows).cell
  const width = cell * cols
  const height = cell * rows
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

function lineThickness(
  index: number,
  boxStep: number | undefined,
  hairline: number,
  bold: number,
): number {
  if (!boxStep || boxStep <= 0) return hairline
  return index % boxStep === 0 ? bold : hairline
}

/**
 * One filled bar per grid line. Prefer this over per-cell stroked rects
 * (shared edges double up; right/bottom look thinner).
 * Default look matches Grid Copy: STUDIO_RULE_MEDIUM + hairline.
 */
export function drawGridLines(
  bounds: Box,
  cell: number,
  cols: number,
  rows: number,
  tag: StudioTag,
  options: DrawGridLinesOptions = {},
): StudioFabricObject[] {
  const thickness = options.thickness ?? STUDIO_STROKE_HAIRLINE
  const boldThickness = options.boldThickness ?? STUDIO_STROKE_BOLD
  const fill = options.fill ?? STUDIO_RULE_MEDIUM
  const rowPitch = options.rowPitch ?? cell
  const { left, top, width, height } = bounds
  const bars: StudioFabricObject[] = []

  for (let i = 0; i <= cols; i++) {
    const w = lineThickness(i, options.boxCols, thickness, boldThickness)
    bars.push(ruleBar(barOrigin(i, cols, left, width, cell, w), top, w, height, fill, tag))
  }
  for (let i = 0; i <= rows; i++) {
    const h = lineThickness(i, options.boxRows, thickness, boldThickness)
    bars.push(
      ruleBar(left, barOrigin(i, rows, top, height, rowPitch, h), width, h, fill, tag),
    )
  }
  return bars
}
