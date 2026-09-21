import { diamond, rect, strokeCross, strokeDiag } from './shape-helpers'
import type { ShapeParts } from './shape-parts-types'
import type { StudyRecallShapeId } from './shape-ids'

type Factory = (r: number) => ShapeParts

const COMPOSITE: Partial<Record<StudyRecallShapeId, Factory>> = {
  circleH: (r) => ({
    circles: [{ r: r * 0.9 }],
    lines: [
      [
        { x: -r * 0.7, y: 0 },
        { x: r * 0.7, y: 0 },
      ],
    ],
  }),
  circleV: (r) => ({
    circles: [{ r: r * 0.9 }],
    lines: [
      [
        { x: 0, y: -r * 0.7 },
        { x: 0, y: r * 0.7 },
      ],
    ],
  }),
  circleSlash: (r) => ({
    circles: [{ r: r * 0.9 }],
    lines: [
      [
        { x: r * 0.55, y: -r * 0.55 },
        { x: -r * 0.55, y: r * 0.55 },
      ],
    ],
  }),
  circleBackslash: (r) => ({
    circles: [{ r: r * 0.9 }],
    lines: [
      [
        { x: -r * 0.55, y: -r * 0.55 },
        { x: r * 0.55, y: r * 0.55 },
      ],
    ],
  }),
  circlePlus: (r) => ({ circles: [{ r: r * 0.9 }], lines: strokeCross(r * 0.85) }),
  circleCross: (r) => {
    // Keep X tips inside the ring: |a|√2 < circleR (stroke still clears the rim).
    const circleR = r * 0.9
    const a = circleR * 0.55
    return {
      circles: [{ r: circleR }],
      lines: [
        [
          { x: -a, y: -a },
          { x: a, y: a },
        ],
        [
          { x: a, y: -a },
          { x: -a, y: a },
        ],
      ],
    }
  },
  squareH: (r) => {
    const s = r * 0.85
    return {
      polygons: [rect(s, s)],
      lines: [
        [
          { x: -s * 0.75, y: 0 },
          { x: s * 0.75, y: 0 },
        ],
      ],
    }
  },
  squareV: (r) => {
    const s = r * 0.85
    return {
      polygons: [rect(s, s)],
      lines: [
        [
          { x: 0, y: -s * 0.75 },
          { x: 0, y: s * 0.75 },
        ],
      ],
    }
  },
  squareSlash: (r) => {
    const s = r * 0.85
    return {
      polygons: [rect(s, s)],
      lines: [
        [
          { x: s * 0.65, y: -s * 0.65 },
          { x: -s * 0.65, y: s * 0.65 },
        ],
      ],
    }
  },
  squareBackslash: (r) => {
    const s = r * 0.85
    return {
      polygons: [rect(s, s)],
      lines: [
        [
          { x: -s * 0.65, y: -s * 0.65 },
          { x: s * 0.65, y: s * 0.65 },
        ],
      ],
    }
  },
  squarePlus: (r) => {
    const s = r * 0.85
    return { polygons: [rect(s, s)], lines: strokeCross(s) }
  },
  squareCross: (r) => {
    const s = r * 0.85
    return { polygons: [rect(s, s)], lines: strokeDiag(s) }
  },
  diamondH: (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    lines: [
      [
        { x: -r * 0.55, y: 0 },
        { x: r * 0.55, y: 0 },
      ],
    ],
  }),
  diamondV: (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    lines: [
      [
        { x: 0, y: -r * 0.55 },
        { x: 0, y: r * 0.55 },
      ],
    ],
  }),
  diamondPlus: (r) => ({
    polygons: [diamond(r * 0.9, r * 0.9)],
    lines: strokeCross(r * 0.7),
  }),
}

export function compositeShapeParts(
  id: StudyRecallShapeId,
  radius: number,
): ShapeParts | null {
  const factory = COMPOSITE[id]
  return factory ? factory(radius) : null
}
