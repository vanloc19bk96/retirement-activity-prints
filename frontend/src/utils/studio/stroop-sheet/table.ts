import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import type { StroopVariant } from './items'

export interface StroopTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/** Count-word runs need wider cells — prefer 2 cols; other variants prefer 3. */
export function columnCountFor(variant: StroopVariant): number {
  return variant === 'count-word' ? 2 : 3
}

/** Preferred row pitch before clamping to the field. */
export function preferredCellHeight(variant: StroopVariant): number {
  // Count-word needs taller rows so the longer prompt can print larger.
  return variant === 'count-word' ? STUDIO_BODY_SIZE * 3.2 : STUDIO_BODY_SIZE * 2.2
}

/** Centered rectangular table of equal cells (integer snap + re-center). */
export function fitStroopTable(
  field: Box,
  itemCount: number,
  cols: number,
  preferredCellH: number,
): StroopTable {
  const rows = Math.max(1, Math.ceil(itemCount / cols))
  const cellW = Math.max(1, Math.floor(field.width / cols))
  const cellH = Math.max(
    1,
    Math.floor(Math.min(preferredCellH, field.height / rows)),
  )
  const gridW = cellW * cols
  const gridH = cellH * rows
  const left = Math.round(field.left + (field.width - gridW) / 2)
  const top = Math.round(field.top + (field.height - gridH) / 2)

  return {
    cols,
    rows,
    cellW,
    cellH,
    bounds: { left, top, width: gridW, height: gridH },
    cellBox: (row, col) => ({
      left: left + col * cellW,
      top: top + row * cellH,
      width: cellW,
      height: cellH,
    }),
  }
}
