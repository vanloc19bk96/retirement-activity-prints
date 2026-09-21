import {
  arrowPoints,
  chevronPoints,
  ellPoints,
  regularPolygonPoints,
  rotatePoints,
  teePoints,
} from '../symbol-digit-coding/geometry'
import { diamond, rect } from './shape-helpers'
import {
  cardinalAngle,
  rotateParts,
  type Cardinal,
  type Corner,
} from './shape-rotate'
import type { ShapeParts } from './shape-parts-types'
import type { StudyRecallShapeId } from './shape-ids'

type Factory = (r: number) => ShapeParts

const PI = Math.PI
const CARDINALS: Cardinal[] = ['N', 'S', 'E', 'W']
const CORNERS: Corner[] = ['NE', 'NW', 'SE', 'SW']

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

function leaf(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: 0, y: -r },
        { x: r * 0.55, y: -r * 0.1 },
        { x: 0, y: r },
        { x: -r * 0.55, y: -r * 0.1 },
      ],
    ],
  }
}

function tag(r: number): ShapeParts {
  const w = r * 0.7
  const h = r * 0.85
  return {
    polygons: [
      [
        { x: -w, y: -h },
        { x: w * 0.35, y: -h },
        { x: w, y: 0 },
        { x: w * 0.35, y: h },
        { x: -w, y: h },
      ],
    ],
  }
}

function shield(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: -r * 0.75, y: -r * 0.85 },
        { x: r * 0.75, y: -r * 0.85 },
        { x: r * 0.75, y: r * 0.15 },
        { x: 0, y: r },
        { x: -r * 0.75, y: r * 0.15 },
      ],
    ],
  }
}

function boat(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: -r * 0.95, y: -r * 0.15 },
        { x: r * 0.95, y: -r * 0.15 },
        { x: r * 0.65, y: r * 0.75 },
        { x: -r * 0.65, y: r * 0.75 },
      ],
    ],
  }
}

function gem(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: 0, y: -r },
        { x: r * 0.7, y: -r * 0.25 },
        { x: r * 0.45, y: r },
        { x: -r * 0.45, y: r },
        { x: -r * 0.7, y: -r * 0.25 },
      ],
    ],
  }
}

function pill(rx: number, ry: number): ShapeParts {
  // Elongated hex reads as a capsule at worksheet scale.
  return {
    polygons: [
      [
        { x: -rx * 0.55, y: -ry },
        { x: rx * 0.55, y: -ry },
        { x: rx, y: 0 },
        { x: rx * 0.55, y: ry },
        { x: -rx * 0.55, y: ry },
        { x: -rx, y: 0 },
      ],
    ],
  }
}

function crest(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: -r * 0.9, y: r * 0.55 },
        { x: -r * 0.9, y: -r * 0.15 },
        { x: -r * 0.45, y: -r * 0.55 },
        { x: 0, y: -r * 0.15 },
        { x: r * 0.45, y: -r * 0.55 },
        { x: r * 0.9, y: -r * 0.15 },
        { x: r * 0.9, y: r * 0.55 },
      ],
    ],
  }
}

function arch(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: -r * 0.85, y: r * 0.85 },
        { x: -r * 0.85, y: -r * 0.15 },
        { x: -r * 0.35, y: -r * 0.85 },
        { x: r * 0.35, y: -r * 0.85 },
        { x: r * 0.85, y: -r * 0.15 },
        { x: r * 0.85, y: r * 0.85 },
      ],
    ],
  }
}

function mountain(r: number): ShapeParts {
  return {
    polygons: [
      [
        { x: -r, y: r * 0.75 },
        { x: -r * 0.45, y: -r * 0.35 },
        { x: 0, y: r * 0.15 },
        { x: r * 0.45, y: -r * 0.75 },
        { x: r, y: r * 0.75 },
      ],
    ],
  }
}

function buildExtraClosed(): Partial<Record<StudyRecallShapeId, Factory>> {
  const map: Partial<Record<StudyRecallShapeId, Factory>> = {}

  put(map, 'octagon', (r) => ({
    polygons: [regularPolygonPoints(8, r * 0.9)],
  }))
  put(map, 'octagonFlat', (r) => ({
    polygons: [regularPolygonPoints(8, r * 0.9, 0)],
  }))

  putCardinals(map, 'arrowHead', (r) => ({
    polygons: [arrowPoints(r * 0.9)],
  }))
  putCardinals(map, 'wedge', (r) => ({
    polygons: [
      [
        { x: 0, y: -r * 0.35 },
        { x: r, y: r * 0.8 },
        { x: -r, y: r * 0.8 },
      ],
    ],
  }))
  putCardinals(map, 'leaf', leaf)
  putCardinals(map, 'spike', (r) => ({
    polygons: [
      [
        { x: 0, y: -r },
        { x: r * 0.35, y: r * 0.95 },
        { x: -r * 0.35, y: r * 0.95 },
      ],
    ],
  }))
  putCardinals(map, 'tag', tag)
  putCardinals(map, 'teePoly', (r) => ({ polygons: [teePoints(r * 0.9)] }))
  putCardinals(map, 'chevPoly', (r) => ({
    polygons: [chevronPoints(r * 0.9)],
  }))

  // ellPoints is an L anchored at SW (└); rotate from that base.
  const blockFromSw: Record<Corner, number> = {
    SW: 0,
    SE: -PI / 2,
    NE: PI,
    NW: PI / 2,
  }
  for (const corner of CORNERS) {
    put(map, `block${corner}`, (r) =>
      rotateParts(
        { polygons: [ellPoints(r * 0.9)] },
        blockFromSw[corner],
      ),
    )
  }

  put(map, 'shield', shield)
  put(map, 'boat', boat)
  put(map, 'gem', gem)
  put(map, 'pillH', (r) => pill(r * 0.95, r * 0.45))
  put(map, 'pillV', (r) => pill(r * 0.45, r * 0.95))
  put(map, 'bladeH', (r) => ({ polygons: [diamond(r * 0.95, r * 0.28)] }))
  put(map, 'bladeV', (r) => ({ polygons: [diamond(r * 0.28, r * 0.95)] }))
  put(map, 'trapFlatN', (r) => ({
    polygons: [
      [
        { x: -r * 0.35, y: -r * 0.55 },
        { x: r * 0.35, y: -r * 0.55 },
        { x: r * 0.95, y: r * 0.55 },
        { x: -r * 0.95, y: r * 0.55 },
      ],
    ],
  }))
  put(map, 'trapFlatS', (r) => ({
    polygons: [
      rotatePoints(
        [
          { x: -r * 0.35, y: -r * 0.55 },
          { x: r * 0.35, y: -r * 0.55 },
          { x: r * 0.95, y: r * 0.55 },
          { x: -r * 0.95, y: r * 0.55 },
        ],
        PI,
      ),
    ],
  }))
  put(map, 'barPlus', (r) => ({
    polygons: [rect(r * 0.95, r * 0.28), rect(r * 0.28, r * 0.95)],
  }))
  put(map, 'barX', (r) => {
    const s = r * 0.72
    const skew = r * 0.38
    return {
      polygons: [
        [
          { x: -s + skew, y: -s },
          { x: s + skew, y: -s },
          { x: s - skew, y: s },
          { x: -s - skew, y: s },
        ],
        [
          { x: -s - skew, y: -s },
          { x: s - skew, y: -s },
          { x: s + skew, y: s },
          { x: -s + skew, y: s },
        ],
      ],
    }
  })
  put(map, 'crestN', crest)
  put(map, 'crestS', (r) => rotateParts(crest(r), PI))
  put(map, 'archN', arch)
  put(map, 'archS', (r) => rotateParts(arch(r), PI))
  put(map, 'mountain', mountain)
  put(map, 'hexWide', (r) => ({
    polygons: [
      regularPolygonPoints(6, r * 0.85, 0).map((p) => ({
        x: p.x * 1.12,
        y: p.y * 0.72,
      })),
    ],
  }))
  put(map, 'hexTall', (r) => ({
    polygons: [
      regularPolygonPoints(6, r * 0.85).map((p) => ({
        x: p.x * 0.72,
        y: p.y * 1.12,
      })),
    ],
  }))
  put(map, 'pentaWide', (r) => ({
    polygons: [
      regularPolygonPoints(5, r * 0.85).map((p) => ({
        x: p.x * 1.15,
        y: p.y * 0.78,
      })),
    ],
  }))
  put(map, 'pentaTall', (r) => ({
    polygons: [
      regularPolygonPoints(5, r * 0.85).map((p) => ({
        x: p.x * 0.78,
        y: p.y * 1.15,
      })),
    ],
  }))

  return map
}

export const EXTRA_CLOSED = buildExtraClosed()

export function extraClosedShapeParts(
  id: StudyRecallShapeId,
  radius: number,
): ShapeParts | null {
  const factory = EXTRA_CLOSED[id]
  return factory ? factory(radius) : null
}
