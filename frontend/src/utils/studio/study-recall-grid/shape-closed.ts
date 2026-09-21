import {
  regularPolygonPoints,
  rotatePoints,
} from '../symbol-digit-coding/geometry'
import {
  diamond,
  house,
  kite,
  parallelogram,
  rect,
  rightTri,
  trapezoid,
} from './shape-helpers'
import type { ShapeParts } from './shape-parts-types'
import type { StudyRecallShapeId } from './shape-ids'

const PI = Math.PI

type Factory = (r: number) => ShapeParts

const CLOSED: Partial<Record<StudyRecallShapeId, Factory>> = {
  circle: (r) => ({ circles: [{ r: r * 0.9 }] }),
  ring: (r) => ({ circles: [{ r: r * 0.9 }, { r: r * 0.45 }] }),
  target: (r) => ({
    circles: [{ r: r * 0.95 }, { r: r * 0.62 }, { r: r * 0.28 }],
  }),
  square: (r) => ({ polygons: [rect(r * 0.85, r * 0.85)] }),
  rectH: (r) => ({ polygons: [rect(r * 0.95, r * 0.5)] }),
  rectV: (r) => ({ polygons: [rect(r * 0.5, r * 0.95)] }),
  diamond: (r) => ({ polygons: [diamond(r * 0.9, r * 0.9)] }),
  diamondWide: (r) => ({ polygons: [diamond(r * 0.95, r * 0.55)] }),
  diamondTall: (r) => ({ polygons: [diamond(r * 0.55, r * 0.95)] }),
  triangleUp: (r) => ({ polygons: [regularPolygonPoints(3, r * 0.95)] }),
  triangleDown: (r) => ({ polygons: [regularPolygonPoints(3, r * 0.95, PI / 2)] }),
  triangleLeft: (r) => ({ polygons: [regularPolygonPoints(3, r * 0.95, PI)] }),
  triangleRight: (r) => ({ polygons: [regularPolygonPoints(3, r * 0.95, 0)] }),
  rightTriNE: (r) => ({ polygons: [rightTri(r, 'NE')] }),
  rightTriNW: (r) => ({ polygons: [rightTri(r, 'NW')] }),
  rightTriSE: (r) => ({ polygons: [rightTri(r, 'SE')] }),
  rightTriSW: (r) => ({ polygons: [rightTri(r, 'SW')] }),
  triangleWide: (r) => ({
    polygons: [
      [
        { x: 0, y: -r * 0.55 },
        { x: r * 0.95, y: r * 0.75 },
        { x: -r * 0.95, y: r * 0.75 },
      ],
    ],
  }),
  triangleTall: (r) => ({
    polygons: [
      [
        { x: 0, y: -r },
        { x: r * 0.55, y: r * 0.9 },
        { x: -r * 0.55, y: r * 0.9 },
      ],
    ],
  }),
  triangleFlatL: (r) => ({
    polygons: [
      [
        { x: -r * 0.95, y: 0 },
        { x: r * 0.75, y: -r * 0.55 },
        { x: r * 0.75, y: r * 0.55 },
      ],
    ],
  }),
  triangleFlatR: (r) => ({
    polygons: [
      [
        { x: r * 0.95, y: 0 },
        { x: -r * 0.75, y: -r * 0.55 },
        { x: -r * 0.75, y: r * 0.55 },
      ],
    ],
  }),
  pentagon: (r) => ({ polygons: [regularPolygonPoints(5, r * 0.92)] }),
  pentagonFlat: (r) => ({ polygons: [regularPolygonPoints(5, r * 0.92, 0)] }),
  hexagon: (r) => ({ polygons: [regularPolygonPoints(6, r * 0.92)] }),
  hexagonFlat: (r) => ({ polygons: [regularPolygonPoints(6, r * 0.92, 0)] }),
  kite: (r) => ({ polygons: [kite(r)] }),
  house: (r) => ({ polygons: [house(r)] }),
  trapezoidN: (r) => ({ polygons: [trapezoid(r, false)] }),
  trapezoidS: (r) => ({ polygons: [trapezoid(r, true)] }),
  trapezoidE: (r) => ({ polygons: [rotatePoints(trapezoid(r, false), PI / 2)] }),
  trapezoidW: (r) => ({ polygons: [rotatePoints(trapezoid(r, false), -PI / 2)] }),
  parallelogram: (r) => ({ polygons: [parallelogram(r, false)] }),
  parallelogramMirror: (r) => ({ polygons: [parallelogram(r, true)] }),
  barH: (r) => ({ polygons: [rect(r * 0.95, r * 0.28)] }),
  barV: (r) => ({ polygons: [rect(r * 0.28, r * 0.95)] }),
}

export function closedShapeParts(
  id: StudyRecallShapeId,
  radius: number,
): ShapeParts | null {
  const factory = CLOSED[id]
  return factory ? factory(radius) : null
}
