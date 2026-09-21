import { rotatePoints, type Point } from '../symbol-digit-coding/geometry'
import type { ShapeParts } from './shape-parts-types'

export type Cardinal = 'N' | 'S' | 'E' | 'W'
export type Corner = 'NE' | 'NW' | 'SE' | 'SW'

const PI = Math.PI

/** Radians to rotate a north-facing glyph into `dir`. */
export function cardinalAngle(dir: Cardinal): number {
  if (dir === 'N') return 0
  if (dir === 'E') return PI / 2
  if (dir === 'S') return PI
  return -PI / 2
}

/** Radians to rotate a NE-facing glyph into `corner`. */
export function cornerAngle(corner: Corner): number {
  if (corner === 'NE') return 0
  if (corner === 'SE') return PI / 2
  if (corner === 'SW') return PI
  return -PI / 2
}

export function rotateParts(parts: ShapeParts, radians: number): ShapeParts {
  if (radians === 0) return parts
  return {
    circles: parts.circles?.map((c) => {
      const [p] = rotatePoints([{ x: c.x ?? 0, y: c.y ?? 0 }], radians)
      return { r: c.r, x: p!.x, y: p!.y }
    }),
    polygons: parts.polygons?.map((poly) => rotatePoints(poly, radians)),
    lines: parts.lines?.map(([a, b]) => {
      const [a2, b2] = rotatePoints([a, b], radians)
      return [a2!, b2!] as [Point, Point]
    }),
  }
}
