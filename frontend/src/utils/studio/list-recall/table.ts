import { fitFontSizeToWidth, type Box } from '../studio-layout'

export interface ListTable {
  cols: number
  rows: number
  cellW: number
  cellH: number
  bounds: Box
  cellBox: (row: number, col: number) => Box
}

/**
 * Choose study-list columns that maximize cell size inside `field`.
 * Exact divisors only — every cell gets an item (grid-copy / picture-recognition style).
 */
export function resolveStudyColumns(field: Box, itemCount: number): number {
  const n = Math.max(1, itemCount)
  let best = { cols: 1, cell: 0 }

  for (let cols = 1; cols <= n; cols++) {
    if (n % cols !== 0) continue
    const rows = n / cols
    const cell = Math.floor(Math.min(field.width / cols, field.height / rows))
    if (cell > best.cell) best = { cols, cell }
  }

  return best.cols
}

/** Centered rectangular table of equal cells inside `body`. */
export function fitListTable(
  body: Box,
  itemCount: number,
  cols: number,
  preferredCellW: number,
  preferredCellH: number,
): ListTable {
  const rows = Math.max(1, Math.ceil(itemCount / cols))
  // Integer cells + re-center so stroke edges stay crisp and inside the field.
  const cellW = Math.max(1, Math.floor(Math.min(preferredCellW, body.width / cols)))
  const cellH = Math.max(1, Math.floor(Math.min(preferredCellH, body.height / rows)))
  const gridW = cellW * cols
  const gridH = cellH * rows
  const left = Math.round(body.left + (body.width - gridW) / 2)
  const top = Math.round(body.top + (body.height - gridH) / 2)

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

/** One shared size so every label stays on a single line inside the cell. */
export function fitSharedLabelSize(
  labels: string[],
  maxWidth: number,
  preferred: number,
  cellH: number,
  minimum = 10,
): number {
  // Leave vertical pad so centered glyphs clear the cell stroke.
  const byHeight = Math.floor(cellH * 0.5)
  let size = Math.min(preferred, byHeight)
  for (const label of labels) {
    size = Math.min(size, fitFontSizeToWidth(label, maxWidth, size, minimum))
  }
  return Math.max(minimum, size)
}
