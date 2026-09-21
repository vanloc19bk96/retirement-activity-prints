import type { StudioRng } from '../studio-rng'
import type { Bitmap } from './types'

export function emptyBitmap(rows: number, cols: number): Bitmap {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
}

export function setCell(bitmap: Bitmap, r: number, c: number, filled = true): void {
  if (r < 0 || c < 0 || r >= bitmap.length || c >= (bitmap[0]?.length ?? 0)) return
  bitmap[r]![c] = filled
}

export function fillRect(
  bitmap: Bitmap,
  r0: number,
  c0: number,
  h: number,
  w: number,
  filled = true,
): void {
  for (let r = r0; r < r0 + h; r++) {
    for (let c = c0; c < c0 + w; c++) setCell(bitmap, r, c, filled)
  }
}

export function fillDisk(
  bitmap: Bitmap,
  cr: number,
  cc: number,
  radius: number,
  filled = true,
): void {
  const r2 = radius * radius
  for (let r = Math.floor(cr - radius); r <= Math.ceil(cr + radius); r++) {
    for (let c = Math.floor(cc - radius); c <= Math.ceil(cc + radius); c++) {
      const dr = r + 0.5 - cr
      const dc = c + 0.5 - cc
      if (dr * dr + dc * dc <= r2) setCell(bitmap, r, c, filled)
    }
  }
}

/** Make full grid exactly left↔right symmetric from the left half. */
export function forceMirrorFromLeft(bitmap: Bitmap): void {
  const rows = bitmap.length
  const cols = bitmap[0]?.length ?? 0
  const half = Math.floor(cols / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < half; c++) {
      bitmap[r]![cols - 1 - c] = bitmap[r]![c]!
    }
  }
}

export function extractLeftHalf(bitmap: Bitmap): Bitmap {
  const rows = bitmap.length
  const cols = bitmap[0]?.length ?? 0
  const half = cols / 2
  const out = emptyBitmap(rows, half)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < half; c++) out[r]![c] = bitmap[r]![c]!
  }
  return out
}

export function bitmapToRows(bitmap: Bitmap): string[] {
  return bitmap.map((row) => row.map((cell) => (cell ? '#' : '.')).join(''))
}

export function filledCount(bitmap: Bitmap): number {
  let n = 0
  for (const row of bitmap) for (const cell of row) if (cell) n++
  return n
}

/** Light seeded noise that keeps silhouette readable. */
export function sprinkleLeft(bitmap: Bitmap, rng: StudioRng, chance: number): void {
  const rows = bitmap.length
  const half = Math.floor((bitmap[0]?.length ?? 0) / 2)
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < half - 1; c++) {
      if (!rng.chance(chance)) continue
      const neighbors =
        Number(bitmap[r - 1]![c]) +
        Number(bitmap[r + 1]![c]) +
        Number(bitmap[r]![c - 1]) +
        Number(bitmap[r]![c + 1])
      if (neighbors >= 2) bitmap[r]![c] = true
    }
  }
}

export function shiftVertical(bitmap: Bitmap, dr: number): Bitmap {
  const rows = bitmap.length
  const cols = bitmap[0]?.length ?? 0
  const out = emptyBitmap(rows, cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (bitmap[r]![c]) setCell(out, r + dr, c, true)
    }
  }
  return out
}
