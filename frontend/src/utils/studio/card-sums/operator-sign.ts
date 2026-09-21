import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { buildLine, type StudioTag } from '../studio-fabric-builders'

/**
 * Plus / minus as stroked crosses — light secondary marks between cards.
 * Filled block bars read as icons; digit-font glyphs can tofu on export.
 * Matches Futoshiki inequality weight (NORMAL + round caps).
 */
export function buildOperatorSign(
  sign: number,
  left: number,
  top: number,
  size: number,
  tag: StudioTag,
): StudioFabricObject[] {
  const arm = Math.max(3, Math.round(size / 2))
  const stroke = {
    stroke: STUDIO_INK,
    strokeWidth: STUDIO_STROKE_NORMAL,
    strokeLineCap: 'round' as const,
    strokeUniform: true,
  }

  const horizontal = buildLine(
    { x1: left - arm, y1: top, x2: left + arm, y2: top, ...stroke },
    tag,
    'prompt',
  )
  if (sign < 0) return [horizontal]

  return [
    horizontal,
    buildLine(
      { x1: left, y1: top - arm, x2: left, y2: top + arm, ...stroke },
      tag,
      'prompt',
    ),
  ]
}
