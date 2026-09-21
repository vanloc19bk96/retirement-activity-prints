import {
  regularPolygonPoints,
  type Point,
} from '../symbol-digit-coding/geometry'
import {
  diamond,
  house,
  kite,
  parallelogram,
  rect,
  strokeCross,
  strokeDiag,
  trapezoid,
} from './shape-helpers'
import {
  cardinalAngle,
  rotateParts,
  type Cardinal,
} from './shape-rotate'
import type { ShapeParts } from './shape-parts-types'
import type { StudyRecallShapeId } from './shape-ids'

type Factory = (r: number) => ShapeParts

const PI = Math.PI
const CARDINALS: Cardinal[] = ['N', 'S', 'E', 'W']

function put(
  map: Partial<Record<StudyRecallShapeId, Factory>>,
  id: string,
  factory: Factory,
): void {
  map[id as StudyRecallShapeId] = factory
}

function putCardinals(
  map: Partial<Record<StudyRecallShapeId, Factory>>,
  prefix: string,
  facingNorth: Factory,
): void {
  for (const dir of CARDINALS) {
    put(map, `${prefix}${dir}`, (r) =>
      rotateParts(facingNorth(r), cardinalAngle(dir)),
    )
  }
}

function midLineH(span: number): [Point, Point] {
  return [
    { x: -span, y: 0 },
    { x: span, y: 0 },
  ]
}

function midLineV(span: number): [Point, Point] {
  return [
    { x: 0, y: -span },
    { x: 0, y: span },
  ]
}

function slashLine(span: number): [Point, Point] {
  return [
    { x: span, y: -span },
    { x: -span, y: span },
  ]
}

function backslashLine(span: number): [Point, Point] {
  return [
    { x: -span, y: -span },
    { x: span, y: span },
  ]
}

function leaf(r: number): Point[] {
  return [
    { x: 0, y: -r },
    { x: r * 0.55, y: -r * 0.1 },
    { x: 0, y: r },
    { x: -r * 0.55, y: -r * 0.1 },
  ]
}

function gemPoly(r: number): Point[] {
  return [
    { x: 0, y: -r },
    { x: r * 0.7, y: -r * 0.25 },
    { x: r * 0.45, y: r },
    { x: -r * 0.45, y: r },
    { x: -r * 0.7, y: -r * 0.25 },
  ]
}

function shieldPoly(r: number): Point[] {
  return [
    { x: -r * 0.75, y: -r * 0.85 },
    { x: r * 0.75, y: -r * 0.85 },
    { x: r * 0.75, y: r * 0.15 },
    { x: 0, y: r },
    { x: -r * 0.75, y: r * 0.15 },
  ]
}

function teeStem(r: number): [Point, Point][] {
  const s = r * 0.55
  return [
    [
      { x: -s, y: -s * 0.7 },
      { x: s, y: -s * 0.7 },
    ],
    [
      { x: 0, y: -s * 0.7 },
      { x: 0, y: s * 0.75 },
    ],
  ]
}

function buildExtraComposite(): Partial<Record<StudyRecallShapeId, Factory>> {
  const map: Partial<Record<StudyRecallShapeId, Factory>> = {}

  put(map, 'circleDot', (r) => ({
    circles: [{ r: r * 0.9 }, { r: r * 0.18 }],
  }))
  put(map, 'ringH', (r) => ({
    circles: [{ r: r * 0.9 }, { r: r * 0.45 }],
    lines: [midLineH(r * 0.7)],
  }))
  put(map, 'ringV', (r) => ({
    circles: [{ r: r * 0.9 }, { r: r * 0.45 }],
    lines: [midLineV(r * 0.7)],
  }))
  put(map, 'ringSlash', (r) => ({
    circles: [{ r: r * 0.9 }, { r: r * 0.45 }],
    lines: [slashLine(r * 0.5)],
  }))
  put(map, 'nestSq', (r) => ({
    polygons: [rect(r * 0.9, r * 0.9)],
    circles: [{ r: r * 0.45 }],
  }))
  put(map, 'nestDi', (r) => ({
    polygons: [diamond(r * 0.92, r * 0.92)],
    circles: [{ r: r * 0.4 }],
  }))
  put(map, 'nestHex', (r) => ({
    polygons: [regularPolygonPoints(6, r * 0.92)],
    circles: [{ r: r * 0.4 }],
  }))
  put(map, 'nestTri', (r) => ({
    circles: [{ r: r * 0.9 }],
    polygons: [regularPolygonPoints(3, r * 0.5)],
  }))
  // Stem on each circle path (not through the hollow); outline fitting
  // shortens by half-stroke so butts land on the outer rims.
  put(map, 'dumbbellH', (r) => {
    const circleR = r * 0.32
    const gap = r * 0.55
    return {
      circles: [
        { r: circleR, x: -gap },
        { r: circleR, x: gap },
      ],
      lines: [
        [
          { x: -gap + circleR, y: 0 },
          { x: gap - circleR, y: 0 },
        ],
      ],
    }
  })
  put(map, 'dumbbellV', (r) =>
    rotateParts(map.dumbbellH!(r), PI / 2),
  )

  put(map, 'hexagonH', (r) => ({
    polygons: [regularPolygonPoints(6, r * 0.9)],
    lines: [midLineH(r * 0.55)],
  }))
  put(map, 'hexagonV', (r) => ({
    polygons: [regularPolygonPoints(6, r * 0.9)],
    lines: [midLineV(r * 0.55)],
  }))
  put(map, 'hexagonSlash', (r) => ({
    polygons: [regularPolygonPoints(6, r * 0.9)],
    lines: [slashLine(r * 0.45)],
  }))
  put(map, 'hexagonPlus', (r) => ({
    polygons: [regularPolygonPoints(6, r * 0.9)],
    lines: strokeCross(r * 0.55),
  }))
  put(map, 'pentagonH', (r) => ({
    polygons: [regularPolygonPoints(5, r * 0.9)],
    lines: [midLineH(r * 0.45)],
  }))
  put(map, 'pentagonV', (r) => ({
    polygons: [regularPolygonPoints(5, r * 0.9)],
    lines: [midLineV(r * 0.45)],
  }))
  put(map, 'pentagonPlus', (r) => ({
    polygons: [regularPolygonPoints(5, r * 0.9)],
    lines: strokeCross(r * 0.5),
  }))

  put(map, 'diamondSlash', (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    lines: [slashLine(r * 0.45)],
  }))
  put(map, 'diamondBackslash', (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    lines: [backslashLine(r * 0.45)],
  }))
  put(map, 'diamondCross', (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    lines: strokeDiag(r * 0.55),
  }))
  put(map, 'diamondDot', (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    circles: [{ r: r * 0.16 }],
  }))

  // Circumradius 0.9r → inradius 0.45r. Keep chords inside that disk
  // (slash half-length ≤ inradius/√2) so tips never pierce the outline.
  const TRI_R = 0.9
  const TRI_INNER = 0.28
  const TRI_CROSS = 0.32
  const triUp = (r: number) => regularPolygonPoints(3, r * TRI_R)
  const triDown = (r: number) => regularPolygonPoints(3, r * TRI_R, PI / 2)
  const triLeft = (r: number) => regularPolygonPoints(3, r * TRI_R, PI)
  const triRight = (r: number) => regularPolygonPoints(3, r * TRI_R, 0)
  put(map, 'triangleUpH', (r) => ({
    polygons: [triUp(r)],
    lines: [midLineH(r * TRI_INNER)],
  }))
  put(map, 'triangleUpV', (r) => ({
    polygons: [triUp(r)],
    lines: [midLineV(r * TRI_INNER)],
  }))
  put(map, 'triangleUpSlash', (r) => ({
    polygons: [triUp(r)],
    lines: [slashLine(r * TRI_INNER)],
  }))
  put(map, 'triangleUpPlus', (r) => ({
    polygons: [triUp(r)],
    lines: strokeCross(r * TRI_CROSS),
  }))
  put(map, 'triangleDownH', (r) => ({
    polygons: [triDown(r)],
    lines: [midLineH(r * TRI_INNER)],
  }))
  put(map, 'triangleDownV', (r) => ({
    polygons: [triDown(r)],
    lines: [midLineV(r * TRI_INNER)],
  }))
  put(map, 'triangleDownSlash', (r) => ({
    polygons: [triDown(r)],
    lines: [slashLine(r * TRI_INNER)],
  }))
  put(map, 'triangleDownPlus', (r) => ({
    polygons: [triDown(r)],
    lines: strokeCross(r * TRI_CROSS),
  }))
  put(map, 'triangleLeftH', (r) => ({
    polygons: [triLeft(r)],
    lines: [midLineH(r * TRI_INNER)],
  }))
  put(map, 'triangleLeftV', (r) => ({
    polygons: [triLeft(r)],
    lines: [midLineV(r * TRI_INNER)],
  }))
  put(map, 'triangleLeftSlash', (r) => ({
    polygons: [triLeft(r)],
    lines: [slashLine(r * TRI_INNER)],
  }))
  put(map, 'triangleLeftPlus', (r) => ({
    polygons: [triLeft(r)],
    lines: strokeCross(r * TRI_CROSS),
  }))
  put(map, 'triangleRightH', (r) => ({
    polygons: [triRight(r)],
    lines: [midLineH(r * TRI_INNER)],
  }))
  put(map, 'triangleRightV', (r) => ({
    polygons: [triRight(r)],
    lines: [midLineV(r * TRI_INNER)],
  }))
  put(map, 'triangleRightSlash', (r) => ({
    polygons: [triRight(r)],
    lines: [slashLine(r * TRI_INNER)],
  }))
  put(map, 'triangleRightPlus', (r) => ({
    polygons: [triRight(r)],
    lines: strokeCross(r * TRI_CROSS),
  }))

  put(map, 'houseH', (r) => ({
    polygons: [house(r)],
    lines: [midLineH(r * 0.45)],
  }))
  put(map, 'houseV', (r) => ({
    polygons: [house(r)],
    lines: [midLineV(r * 0.45)],
  }))
  put(map, 'kiteH', (r) => ({
    polygons: [kite(r)],
    lines: [midLineH(r * 0.4)],
  }))
  put(map, 'kiteV', (r) => ({
    polygons: [kite(r)],
    lines: [midLineV(r * 0.5)],
  }))

  put(map, 'rectHH', (r) => ({
    polygons: [rect(r * 0.95, r * 0.5)],
    lines: [midLineH(r * 0.7)],
  }))
  put(map, 'rectHV', (r) => ({
    polygons: [rect(r * 0.95, r * 0.5)],
    lines: [midLineV(r * 0.35)],
  }))
  put(map, 'rectVH', (r) => ({
    polygons: [rect(r * 0.5, r * 0.95)],
    lines: [midLineH(r * 0.35)],
  }))
  put(map, 'rectVV', (r) => ({
    polygons: [rect(r * 0.5, r * 0.95)],
    lines: [midLineV(r * 0.7)],
  }))

  put(map, 'squareDot', (r) => ({
    polygons: [rect(r * 0.85, r * 0.85)],
    circles: [{ r: r * 0.16 }],
  }))

  put(map, 'circleDoubleH', (r) => ({
    circles: [{ r: r * 0.9 }],
    lines: [
      [
        { x: -r * 0.65, y: -r * 0.28 },
        { x: r * 0.65, y: -r * 0.28 },
      ],
      [
        { x: -r * 0.65, y: r * 0.28 },
        { x: r * 0.65, y: r * 0.28 },
      ],
    ],
  }))
  put(map, 'circleDoubleV', (r) =>
    rotateParts(map.circleDoubleH!(r), PI / 2),
  )
  put(map, 'trapNH', (r) => ({
    polygons: [trapezoid(r, false)],
    lines: [midLineH(r * 0.4)],
  }))
  put(map, 'trapNV', (r) => ({
    polygons: [trapezoid(r, false)],
    lines: [midLineV(r * 0.35)],
  }))
  put(map, 'trapSH', (r) => ({
    polygons: [trapezoid(r, true)],
    lines: [midLineH(r * 0.4)],
  }))
  put(map, 'trapSV', (r) => ({
    polygons: [trapezoid(r, true)],
    lines: [midLineV(r * 0.35)],
  }))
  put(map, 'paraH', (r) => ({
    polygons: [parallelogram(r, false)],
    lines: [midLineH(r * 0.45)],
  }))
  put(map, 'paraV', (r) => ({
    polygons: [parallelogram(r, false)],
    lines: [midLineV(r * 0.4)],
  }))

  // Stem starts on the circle path (not through the hollow). Outline fitting
  // then shortens by half-stroke so the butt lands on the outer rim.
  putCardinals(map, 'tip', (r) => {
    const circleR = r * 0.22
    const circleY = -r * 0.65
    return {
      circles: [{ r: circleR, y: circleY }],
      lines: [
        [
          { x: 0, y: circleY + circleR },
          { x: 0, y: r * 0.7 },
        ],
      ],
    }
  })
  putCardinals(map, 'circleTee', (r) => ({
    circles: [{ r: r * 0.9 }],
    lines: teeStem(r),
  }))
  putCardinals(map, 'sqTee', (r) => ({
    polygons: [rect(r * 0.85, r * 0.85)],
    lines: teeStem(r),
  }))
  putCardinals(map, 'leafVein', (r) => ({
    polygons: [leaf(r)],
    lines: [midLineV(r * 0.75)],
  }))

  put(map, 'coinH', (r) => ({
    circles: [{ r: r * 0.9 }],
    polygons: [rect(r * 0.7, r * 0.22)],
  }))
  put(map, 'coinV', (r) => ({
    circles: [{ r: r * 0.9 }],
    polygons: [rect(r * 0.22, r * 0.7)],
  }))
  put(map, 'gemH', (r) => ({
    polygons: [gemPoly(r * 0.95)],
    lines: [midLineH(r * 0.4)],
  }))
  put(map, 'gemV', (r) => ({
    polygons: [gemPoly(r * 0.95)],
    lines: [midLineV(r * 0.55)],
  }))
  put(map, 'shieldH', (r) => ({
    polygons: [shieldPoly(r)],
    lines: [midLineH(r * 0.4)],
  }))
  put(map, 'shieldV', (r) => ({
    polygons: [shieldPoly(r)],
    lines: [midLineV(r * 0.45)],
  }))
  put(map, 'stampH', (r) => ({
    polygons: [regularPolygonPoints(8, r * 0.9)],
    lines: [midLineH(r * 0.5)],
  }))

  return map
}

export const EXTRA_COMPOSITE = buildExtraComposite()

export function extraCompositeShapeParts(
  id: StudyRecallShapeId,
  radius: number,
): ShapeParts | null {
  const factory = EXTRA_COMPOSITE[id]
  return factory ? factory(radius) : null
}
