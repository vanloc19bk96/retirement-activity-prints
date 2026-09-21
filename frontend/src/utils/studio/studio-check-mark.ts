import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { buildGroup, buildPolyline, type StudioTag } from './studio-fabric-builders'

export const STUDIO_CHECK_MARK_SOURCE = 'studio-check-mark'

/**
 * Vector checkmark for answer / example boxes.
 * Never emit "✓" as text — PT Serif (and many print fonts) lack the glyph;
 * canvas falls back to a system font, but PDF/JPG/PNG/SVG/PPT embed the page
 * font and show a missing-glyph box that looks like ×.
 *
 * One continuous polyline (not two Line segments) so PPT/native stroke joins
 * do not leave a butt-cap gap at the elbow.
 */
export function buildCheckMark(
  spec: {
    left: number
    top: number
    size: number
    stroke?: string
    strokeWidth?: number
  },
  tag: StudioTag,
  role: StudioRole = 'answer',
): StudioFabricObject {
  const { left, top, size } = spec
  if (!(size > 0)) throw new Error('buildCheckMark size must be > 0')

  const stroke = spec.stroke ?? STUDIO_INK
  const strokeWidth =
    spec.strokeWidth ?? Math.max(STUDIO_STROKE_NORMAL, Math.round(size * 0.14))

  // Points relative to the checkmark box origin (same convention as polygons).
  const points = [
    { x: size * 0.2, y: size * 0.52 },
    { x: size * 0.42, y: size * 0.72 },
    { x: size * 0.8, y: size * 0.28 },
  ]

  const group = buildGroup(
    [
      buildPolyline(
        {
          left,
          top,
          points,
          stroke,
          strokeWidth,
          strokeUniform: true,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
        },
        tag,
        'structure',
      ),
    ],
    { left, top, width: size, height: size },
    tag,
    role,
  )

  return {
    ...group,
    data: {
      ...(group.data ?? {}),
      source: STUDIO_CHECK_MARK_SOURCE,
    },
  }
}

export function isStudioCheckMark(obj: StudioFabricObject): boolean {
  return obj.data?.source === STUDIO_CHECK_MARK_SOURCE
}
