import { emptyBitmap } from './bitmap'
import type { Axis, Bitmap, Segment } from './types'

export { emptyBitmap }

/** Left half → full grid (vertical axis). */
export function reflectHorizontal(half: Bitmap, rows: number, halfCols: number): Bitmap {
  const full = emptyBitmap(rows, halfCols * 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < halfCols; c++) {
      const filled = half[r]![c]!
      full[r]![c] = filled
      full[r]![halfCols * 2 - 1 - c] = filled
    }
  }
  return full
}

/** Top half → full grid (horizontal axis). */
export function reflectVertical(half: Bitmap, halfRows: number, cols: number): Bitmap {
  const full = emptyBitmap(halfRows * 2, cols)
  for (let r = 0; r < halfRows; r++) {
    for (let c = 0; c < cols; c++) {
      const filled = half[r]![c]!
      full[r]![c] = filled
      full[halfRows * 2 - 1 - r]![c] = filled
    }
  }
  return full
}

/** Top-left quadrant → full grid (both axes). */
export function reflectBoth(quadrant: Bitmap, half: number): Bitmap {
  const full = emptyBitmap(half * 2, half * 2)
  for (let r = 0; r < half; r++) {
    for (let c = 0; c < half; c++) {
      const filled = quadrant[r]![c]!
      full[r]![c] = filled
      full[r]![half * 2 - 1 - c] = filled
      full[half * 2 - 1 - r]![c] = filled
      full[half * 2 - 1 - r]![half * 2 - 1 - c] = filled
    }
  }
  return full
}

export function reflectFor(axis: Axis, given: Bitmap, size: number): Bitmap {
  const half = size / 2
  if (axis === 'vertical') return reflectHorizontal(given, size, half)
  if (axis === 'horizontal') return reflectVertical(given, half, size)
  return reflectBoth(given, half)
}

export function isGivenSide(r: number, c: number, size: number, axis: Axis): boolean {
  const half = size / 2
  if (axis === 'vertical') return c < half
  if (axis === 'horizontal') return r < half
  return r < half && c < half
}

export function reflectSegmentVertical(seg: Segment, size: number): Segment {
  return {
    r1: seg.r1,
    c1: size - seg.c1,
    r2: seg.r2,
    c2: size - seg.c2,
  }
}

export function reflectSegmentHorizontal(seg: Segment, size: number): Segment {
  return {
    r1: size - seg.r1,
    c1: seg.c1,
    r2: size - seg.r2,
    c2: seg.c2,
  }
}

export function reflectSegmentBoth(seg: Segment, size: number): Segment[] {
  const v = reflectSegmentVertical(seg, size)
  const h = reflectSegmentHorizontal(seg, size)
  const vh = reflectSegmentHorizontal(v, size)
  return [v, h, vh]
}

export function segmentKey(seg: Segment): string {
  const a = `${seg.r1},${seg.c1}`
  const b = `${seg.r2},${seg.c2}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Given half segments → full set (given + mirrored answers). */
export function reflectSegments(axis: Axis, given: Segment[], size: number): Segment[] {
  const seen = new Set<string>()
  const out: Segment[] = []
  const push = (seg: Segment) => {
    const key = segmentKey(seg)
    if (seen.has(key)) return
    if (seg.r1 === seg.r2 && seg.c1 === seg.c2) return
    seen.add(key)
    out.push(seg)
  }

  for (const seg of given) {
    push(seg)
    if (axis === 'vertical') {
      push(reflectSegmentVertical(seg, size))
    } else if (axis === 'horizontal') {
      push(reflectSegmentHorizontal(seg, size))
    } else {
      for (const mirrored of reflectSegmentBoth(seg, size)) push(mirrored)
    }
  }
  return out
}

export function isGivenSegment(seg: Segment, size: number, axis: Axis): boolean {
  const half = size / 2
  const maxR = Math.max(seg.r1, seg.r2)
  const maxC = Math.max(seg.c1, seg.c2)
  const minR = Math.min(seg.r1, seg.r2)
  const minC = Math.min(seg.c1, seg.c2)
  if (axis === 'vertical') return maxC <= half
  if (axis === 'horizontal') return maxR <= half
  return maxR <= half && maxC <= half && minR <= half && minC <= half
}

/** Left-half bitmap → top-half bitmap (for horizontal axis from library). */
export function transposeHalf(half: Bitmap): Bitmap {
  const rows = half.length
  const cols = half[0]?.length ?? 0
  const out = emptyBitmap(cols, rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[c]![r] = half[r]![c]!
    }
  }
  return out
}

/** Top-left quadrant of a vertical left-half (for both-axes mode). */
export function topLeftQuadrant(leftHalf: Bitmap, size: number): Bitmap {
  const half = size / 2
  const out = emptyBitmap(half, half)
  for (let r = 0; r < half; r++) {
    for (let c = 0; c < half; c++) {
      out[r]![c] = leftHalf[r]?.[c] ?? false
    }
  }
  return out
}
