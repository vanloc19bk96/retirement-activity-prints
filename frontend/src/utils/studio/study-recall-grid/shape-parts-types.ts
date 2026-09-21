import type { Point } from '../symbol-digit-coding/geometry'

export interface CirclePart {
  r: number
  x?: number
  y?: number
}

export interface ShapeParts {
  circles?: CirclePart[]
  polygons?: Point[][]
  lines?: [Point, Point][]
}
