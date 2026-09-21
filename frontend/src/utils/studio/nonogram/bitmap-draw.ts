import type { Bitmap } from './types'

export function emptyBitmap(size: number): Bitmap {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => false))
}

export function setCell(bitmap: Bitmap, r: number, c: number, filled = true): void {
  if (r < 0 || c < 0 || r >= bitmap.length || c >= bitmap[0]!.length) return
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

export function mirrorHorizontal(bitmap: Bitmap): void {
  const size = bitmap.length
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < Math.floor(size / 2); c++) {
      bitmap[r]![size - 1 - c] = bitmap[r]![c]!
    }
  }
}

export function mirrorVertical(bitmap: Bitmap): void {
  const size = bitmap.length
  for (let r = 0; r < Math.floor(size / 2); r++) {
    for (let c = 0; c < size; c++) {
      bitmap[size - 1 - r]![c] = bitmap[r]![c]!
    }
  }
}

export function bitmapToRows(bitmap: Bitmap): string[] {
  return bitmap.map((row) => row.map((cell) => (cell ? '#' : '.')).join(''))
}

export function transpose(bitmap: Bitmap): Bitmap {
  const size = bitmap.length
  return Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => bitmap[c]![r]!),
  )
}

export function flipHorizontal(bitmap: Bitmap): Bitmap {
  return bitmap.map((row) => [...row].reverse())
}

/** The 8 symmetries of the square. `index` is taken mod 8. */
export function dihedralTransform(bitmap: Bitmap, index: number): Bitmap {
  let out = bitmap.map((row) => [...row])
  const i = ((index % 8) + 8) % 8
  // 0-3 rotations, 4-7 the same rotations of the mirrored bitmap.
  if (i >= 4) out = flipHorizontal(out)
  for (let turn = 0; turn < i % 4; turn++) {
    out = flipHorizontal(transpose(out))
  }
  return out
}

/**
 * Rotation/reflection-invariant identity for a bitmap.
 *
 * Two puzzles that differ only by a turn of the page are the same puzzle to a
 * buyer, so book-level and cross-account duplicate checks compare this, not the
 * raw grid.
 */
export function canonicalBitmapKey(bitmap: Bitmap): string {
  let best: string | null = null
  for (let i = 0; i < 8; i++) {
    const key = bitmapToRows(dihedralTransform(bitmap, i)).join('/')
    if (best === null || key < best) best = key
  }
  return best!
}

