import type { StudioRng } from '../studio-rng'
import { emptyBitmap } from './bitmap'
import { segmentKey } from './reflect'
import { drawThemedHalf, passesHalfQuality } from './shapes'
import type { Axis, Bitmap, GridSize, MirrorTheme, Segment } from './types'

/**
 * Trace outer edges of a left-half pixel silhouette into grid-dot segments.
 * `left` is always size × (size/2) (vertical-axis authorship).
 */
export function outlineSegmentsFromLeftHalf(left: Bitmap, size: number): Segment[] {
  const half = size / 2
  const filled = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < size && c < half && Boolean(left[r]?.[c])

  const seen = new Set<string>()
  const out: Segment[] = []
  const push = (seg: Segment) => {
    const key = segmentKey(seg)
    if (seen.has(key)) return
    seen.add(key)
    out.push(seg)
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < half; c++) {
      if (!filled(r, c)) continue
      if (!filled(r - 1, c)) push({ r1: r, c1: c, r2: r, c2: c + 1 })
      if (!filled(r + 1, c)) push({ r1: r + 1, c1: c, r2: r + 1, c2: c + 1 })
      if (!filled(r, c - 1)) push({ r1: r, c1: c, r2: r + 1, c2: c })
      if (!filled(r, c + 1)) push({ r1: r, c1: c + 1, r2: r + 1, c2: c + 1 })
    }
  }
  return out
}

/** Adapt left-half segments to the active symmetry axis. */
export function adaptSegmentsForAxis(segs: Segment[], size: number, axis: Axis): Segment[] {
  const half = size / 2
  if (axis === 'vertical') {
    return segs.filter((s) => Math.max(s.c1, s.c2) <= half)
  }
  if (axis === 'horizontal') {
    return segs
      .map((s) => ({ r1: s.c1, c1: s.r1, r2: s.c2, c2: s.r2 }))
      .filter((s) => Math.max(s.r1, s.r2) <= half)
  }
  return segs.filter(
    (s) => Math.max(s.r1, s.r2) <= half && Math.max(s.c1, s.c2) <= half,
  )
}

/** Seeded line figure from a themed silhouette outline. */
export function tryThemedLineSegments(
  size: GridSize,
  theme: MirrorTheme,
  axis: Axis,
  rng: StudioRng,
  attempts = 48,
): Segment[] | null {
  for (let i = 0; i < attempts; i++) {
    const { half } = drawThemedHalf(size, theme, rng)
    if (!passesHalfQuality(half, size)) continue
    const segments = adaptSegmentsForAxis(outlineSegmentsFromLeftHalf(half, size), size, axis)
    if (segments.length >= 3) return segments
  }
  return null
}

export function emptyLineGrid(size: number): Bitmap {
  return emptyBitmap(size, size)
}
