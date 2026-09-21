/**
 * Shared geometry and ink for interlocking letter lattices.
 *
 * A crossword and a fill-in print the same object: white cells on an implicit
 * black field, outlined with even-weight bars that merge wherever two cells
 * share an edge. That bar-merging is the fiddly part — drawn cell by cell, an
 * internal edge gets painted twice and prints heavier than the outer frame,
 * which is exactly the kind of uneven rule that reads as "cheap" in POD.
 *
 * Extracted from `crossword/draw.ts` so crossword pages share one lattice
 * helper rather than a second implementation that drifts.
 */

import type { StudioFabricObject } from '@/types/studio-template.types'
import { buildRect, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'

/** Fabric Textbox paints taller than `fontSize`; every cell metric allows for it. */
export const TEXT_PAINT_HEIGHT_RATIO = 1.35

export function paintBoxHeight(fontSize: number): number {
  return Math.ceil(fontSize * TEXT_PAINT_HEIGHT_RATIO)
}

/** A letter grid: `null` is a gap in the lattice, a string is a white cell. */
export type LatticeGrid = (string | null)[][]

export type GridVAlign = 'top' | 'center'

export interface LatticeRegion {
  minR: number
  minC: number
  rows: number
  cols: number
}

export interface SnappedLattice {
  cell: number
  bounds: Box
  cellBox: (r: number, c: number) => Box
}

/**
 * Place a `cols × rows` lattice of `cell`-sized squares inside `field`.
 *
 * Puzzle pages top-align so the slack falls below the grid, where the clue or
 * word list lives; solution pages centre, because there is nothing under them.
 */
export function snapGridInField(
  field: Box,
  cell: number,
  lattice: { cols: number; rows: number },
  vAlign: GridVAlign,
): SnappedLattice {
  const width = cell * lattice.cols
  const height = cell * lattice.rows
  const left = Math.round(field.left + (field.width - width) / 2)
  const top =
    vAlign === 'center'
      ? Math.round(field.top + (field.height - height) / 2)
      : Math.round(field.top)
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

/** Tight lattice of occupied cells — crops the empty pad rows/cols off a square build. */
export function occupiedLattice(grid: LatticeGrid, size: number): LatticeRegion {
  let minR = size
  let maxR = -1
  let minC = size
  let maxC = -1
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]![c] === null) continue
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
    }
  }
  if (maxR < 0) return { minR: 0, minC: 0, rows: size, cols: size }
  return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 }
}

export function sliceOccupied(grid: LatticeGrid, region: LatticeRegion): LatticeGrid {
  return Array.from({ length: region.rows }, (_, r) =>
    Array.from(
      { length: region.cols },
      (_, c) => grid[region.minR + r]![region.minC + c] ?? null,
    ),
  )
}

/** Same filled-bar style as Grid Copy / studio-grid-rules. */
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
      fill: STUDIO_RULE_MEDIUM,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    'structure',
  )
}

/** Keep outer bars flush; center internal bars on the grid line. */
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

/** Span from line `from` through the far edge of line `to` so L-corners share ink. */
function runSpan(
  from: number,
  to: number,
  origin: (index: number) => number,
  thickness: number,
): { start: number; length: number } {
  const start = origin(from)
  return { start, length: origin(to) + thickness - start }
}

export function isWhiteCell(grid: LatticeGrid, r: number, c: number): boolean {
  const cols = grid[0]?.length ?? 0
  return r >= 0 && r < grid.length && c >= 0 && c < cols && grid[r]![c] !== null
}

/**
 * Outline the white cells with even-weight bars.
 *
 * Contiguous edges merge into one bar, so a shared edge between two cells and
 * the outer frame print at the same weight — drawing four sides per cell paints
 * every internal line twice and doubles its ink.
 */
export function drawWhiteCellEdges(
  grid: LatticeGrid,
  bounds: Box,
  cell: number,
  tag: StudioTag,
): StudioFabricObject[] {
  const parts: StudioFabricObject[] = []
  const stroke = STUDIO_STROKE_HAIRLINE
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const xOf = (index: number) =>
    barOrigin(index, cols, bounds.left, bounds.width, cell, stroke)
  const yOf = (index: number) =>
    barOrigin(index, rows, bounds.top, bounds.height, cell, stroke)

  for (let i = 0; i <= rows; i++) {
    let runStart = -1
    for (let c = 0; c <= cols; c++) {
      const need = c < cols && (isWhiteCell(grid, i - 1, c) || isWhiteCell(grid, i, c))
      if (need) {
        if (runStart < 0) runStart = c
        continue
      }
      if (runStart < 0) continue
      const span = runSpan(runStart, c, xOf, stroke)
      parts.push(ruleBar(span.start, yOf(i), span.length, stroke, tag))
      runStart = -1
    }
  }

  for (let i = 0; i <= cols; i++) {
    let runStart = -1
    for (let r = 0; r <= rows; r++) {
      const need = r < rows && (isWhiteCell(grid, r, i - 1) || isWhiteCell(grid, r, i))
      if (need) {
        if (runStart < 0) runStart = r
        continue
      }
      if (runStart < 0) continue
      const span = runSpan(runStart, r, yOf, stroke)
      parts.push(ruleBar(xOf(i), span.start, stroke, span.length, tag))
      runStart = -1
    }
  }

  return parts
}
