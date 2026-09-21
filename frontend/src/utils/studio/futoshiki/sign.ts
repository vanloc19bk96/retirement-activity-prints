import type { StudioFabricObject } from '@/types/studio-template.types'
import { buildPolyline, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import type { FutoshikiSign } from './types'

/**
 * Stroked chevron for a Futoshiki inequality — geometry survives PDF/SVG
 * outline export. Unicode ∧/∨ (and some font subsets of </> ) become "?" tofu.
 */
export function buildInequalitySign(
  sign: FutoshikiSign,
  left: number,
  top: number,
  size: number,
  tag: StudioTag,
): StudioFabricObject {
  const arm = Math.max(3, size * 0.36)
  return buildPolyline(
    {
      left,
      top,
      points: chevronPoints(sign, arm),
      fill: 'transparent',
      stroke: STUDIO_INK,
      strokeWidth: STUDIO_STROKE_NORMAL,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      strokeUniform: true,
    },
    tag,
    'structure',
  )
}

/** Open/wide side faces the larger number (same convention as `signGlyph`). */
function chevronPoints(
  sign: FutoshikiSign,
  arm: number,
): { x: number; y: number }[] {
  const isHorizontal = sign.a.r === sign.b.r
  if (isHorizontal) {
    // `<` tip left; `>` tip right.
    return sign.relation === '<'
      ? [
          { x: arm, y: -arm },
          { x: -arm, y: 0 },
          { x: arm, y: arm },
        ]
      : [
          { x: -arm, y: -arm },
          { x: arm, y: 0 },
          { x: -arm, y: arm },
        ]
  }

  // Vertical: tip points toward the smaller cell (∨ when top is larger).
  const topIsLarger = sign.relation === '>'
  return topIsLarger
    ? [
        { x: -arm, y: -arm },
        { x: 0, y: arm },
        { x: arm, y: -arm },
      ]
    : [
        { x: -arm, y: arm },
        { x: 0, y: -arm },
        { x: arm, y: arm },
      ]
}
