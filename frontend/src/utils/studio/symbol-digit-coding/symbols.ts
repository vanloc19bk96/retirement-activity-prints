import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { buildCircle, buildPolygon, type StudioTag } from '../studio-fabric-builders'
import type { StudioRng } from '../studio-rng'
import {
  CODING_SYMBOL_IDS,
  codingSymbolParts,
  type CodingSymbolId,
} from './symbol-parts'

export { CODING_SYMBOL_IDS }
export type { CodingSymbolId }

interface SymbolCenter {
  left: number
  top: number
}

/** Seeded subset for the key — unique within a page; varies across book pages. */
export function selectCodingSymbols(rng: StudioRng, symbolCount: number): CodingSymbolId[] {
  const count = Math.min(Math.max(1, Math.floor(symbolCount)), CODING_SYMBOL_IDS.length)
  return rng.sample(CODING_SYMBOL_IDS, count)
}

export interface CodingSymbolStyle {
  stroke?: string
  /** When set, every path uses this width (uniform ink weight). */
  strokeWidth?: number
}

export function buildCodingSymbol(
  id: CodingSymbolId,
  center: SymbolCenter,
  size: number,
  tag: StudioTag,
  role: StudioRole,
  style?: CodingSymbolStyle,
): StudioFabricObject[] {
  const radius = size / 2
  const stroke = style?.stroke ?? STUDIO_INK
  // Between hairline (1) and normal (2) — readable at small cell sizes without heavy ink.
  const strokeWidth = style?.strokeWidth ?? Math.max(1.5, size * 0.055)
  const parts = codingSymbolParts(id, radius)

  return parts.map((part) => {
    if (part.kind === 'circle') {
      return buildCircle(
        {
          left: center.left + part.x,
          top: center.top + part.y,
          radius: part.radius,
          stroke,
          strokeWidth: part.filled ? 0 : strokeWidth,
          fill: part.filled ? stroke : 'transparent',
        },
        tag,
        role,
      )
    }
    return buildPolygon(
      {
        left: center.left,
        top: center.top,
        points: part.points,
        stroke,
        strokeWidth,
        fill: 'transparent',
      },
      tag,
      role,
    )
  })
}
