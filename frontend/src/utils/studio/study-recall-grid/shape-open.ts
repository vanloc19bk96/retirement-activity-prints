import type { Point } from '../symbol-digit-coding/geometry'
import { parallelLines, strokeCross, strokeDiag } from './shape-helpers'
import type { ShapeParts } from './shape-parts-types'
import type { StudyRecallShapeId } from './shape-ids'

function corner(radius: number, kind: 'NE' | 'NW' | 'SE' | 'SW'): [Point, Point][] {
  const r = radius * 0.85
  const c = { x: 0, y: 0 }
  if (kind === 'NE')
    return [
      [c, { x: 0, y: -r }],
      [c, { x: r, y: 0 }],
    ]
  if (kind === 'NW')
    return [
      [c, { x: 0, y: -r }],
      [c, { x: -r, y: 0 }],
    ]
  if (kind === 'SE')
    return [
      [c, { x: 0, y: r }],
      [c, { x: r, y: 0 }],
    ]
  return [
    [c, { x: 0, y: r }],
    [c, { x: -r, y: 0 }],
  ]
}

function uShape(radius: number, dir: 'N' | 'S' | 'E' | 'W'): [Point, Point][] {
  const r = radius * 0.85
  if (dir === 'N')
    return [
      [
        { x: -r, y: -r },
        { x: -r, y: r },
      ],
      [
        { x: -r, y: r },
        { x: r, y: r },
      ],
      [
        { x: r, y: r },
        { x: r, y: -r },
      ],
    ]
  if (dir === 'S')
    return [
      [
        { x: -r, y: r },
        { x: -r, y: -r },
      ],
      [
        { x: -r, y: -r },
        { x: r, y: -r },
      ],
      [
        { x: r, y: -r },
        { x: r, y: r },
      ],
    ]
  if (dir === 'E')
    return [
      [
        { x: r, y: -r },
        { x: -r, y: -r },
      ],
      [
        { x: -r, y: -r },
        { x: -r, y: r },
      ],
      [
        { x: -r, y: r },
        { x: r, y: r },
      ],
    ]
  return [
    [
      { x: -r, y: -r },
      { x: r, y: -r },
    ],
    [
      { x: r, y: -r },
      { x: r, y: r },
    ],
    [
      { x: r, y: r },
      { x: -r, y: r },
    ],
  ]
}

function bracket(radius: number, dir: 'L' | 'R' | 'U' | 'D'): [Point, Point][] {
  const r = radius * 0.85
  const t = radius * 0.35
  if (dir === 'L')
    return [
      [
        { x: -r + t, y: -r },
        { x: -r, y: -r },
      ],
      [
        { x: -r, y: -r },
        { x: -r, y: r },
      ],
      [
        { x: -r, y: r },
        { x: -r + t, y: r },
      ],
    ]
  if (dir === 'R')
    return [
      [
        { x: r - t, y: -r },
        { x: r, y: -r },
      ],
      [
        { x: r, y: -r },
        { x: r, y: r },
      ],
      [
        { x: r, y: r },
        { x: r - t, y: r },
      ],
    ]
  if (dir === 'U')
    return [
      [
        { x: -r, y: -r + t },
        { x: -r, y: -r },
      ],
      [
        { x: -r, y: -r },
        { x: r, y: -r },
      ],
      [
        { x: r, y: -r },
        { x: r, y: -r + t },
      ],
    ]
  return [
    [
      { x: -r, y: r - t },
      { x: -r, y: r },
    ],
    [
      { x: -r, y: r },
      { x: r, y: r },
    ],
    [
      { x: r, y: r },
      { x: r, y: r - t },
    ],
  ]
}

function tee(radius: number, dir: 'N' | 'S' | 'E' | 'W'): [Point, Point][] {
  const r = radius * 0.85
  if (dir === 'N')
    return [
      [
        { x: -r, y: -r },
        { x: r, y: -r },
      ],
      [
        { x: 0, y: -r },
        { x: 0, y: r },
      ],
    ]
  if (dir === 'S')
    return [
      [
        { x: -r, y: r },
        { x: r, y: r },
      ],
      [
        { x: 0, y: -r },
        { x: 0, y: r },
      ],
    ]
  if (dir === 'E')
    return [
      [
        { x: r, y: -r },
        { x: r, y: r },
      ],
      [
        { x: -r, y: 0 },
        { x: r, y: 0 },
      ],
    ]
  return [
    [
      { x: -r, y: -r },
      { x: -r, y: r },
    ],
    [
      { x: -r, y: 0 },
      { x: r, y: 0 },
    ],
  ]
}

function vee(radius: number, dir: 'N' | 'S' | 'E' | 'W'): [Point, Point][] {
  const r = radius * 0.85
  if (dir === 'N')
    return [
      [
        { x: -r, y: r * 0.6 },
        { x: 0, y: -r },
      ],
      [
        { x: 0, y: -r },
        { x: r, y: r * 0.6 },
      ],
    ]
  if (dir === 'S')
    return [
      [
        { x: -r, y: -r * 0.6 },
        { x: 0, y: r },
      ],
      [
        { x: 0, y: r },
        { x: r, y: -r * 0.6 },
      ],
    ]
  if (dir === 'E')
    return [
      [
        { x: -r * 0.6, y: -r },
        { x: r, y: 0 },
      ],
      [
        { x: r, y: 0 },
        { x: -r * 0.6, y: r },
      ],
    ]
  return [
    [
      { x: r * 0.6, y: -r },
      { x: -r, y: 0 },
    ],
    [
      { x: -r, y: 0 },
      { x: r * 0.6, y: r },
    ],
  ]
}

function wye(radius: number, dir: 'N' | 'S' | 'E' | 'W'): [Point, Point][] {
  const r = radius * 0.85
  const c = { x: 0, y: 0 }
  if (dir === 'N')
    return [
      [c, { x: 0, y: -r }],
      [c, { x: -r * 0.85, y: r * 0.7 }],
      [c, { x: r * 0.85, y: r * 0.7 }],
    ]
  if (dir === 'S')
    return [
      [c, { x: 0, y: r }],
      [c, { x: -r * 0.85, y: -r * 0.7 }],
      [c, { x: r * 0.85, y: -r * 0.7 }],
    ]
  if (dir === 'E')
    return [
      [c, { x: r, y: 0 }],
      [c, { x: -r * 0.7, y: -r * 0.85 }],
      [c, { x: -r * 0.7, y: r * 0.85 }],
    ]
  return [
    [c, { x: -r, y: 0 }],
    [c, { x: r * 0.7, y: -r * 0.85 }],
    [c, { x: r * 0.7, y: r * 0.85 }],
  ]
}

function step(radius: number, kind: 'NE' | 'NW' | 'SE' | 'SW'): [Point, Point][] {
  const r = radius * 0.8
  if (kind === 'NE')
    return [
      [
        { x: -r, y: r },
        { x: 0, y: r },
      ],
      [
        { x: 0, y: r },
        { x: 0, y: -r },
      ],
      [
        { x: 0, y: -r },
        { x: r, y: -r },
      ],
    ]
  if (kind === 'NW')
    return [
      [
        { x: r, y: r },
        { x: 0, y: r },
      ],
      [
        { x: 0, y: r },
        { x: 0, y: -r },
      ],
      [
        { x: 0, y: -r },
        { x: -r, y: -r },
      ],
    ]
  if (kind === 'SE')
    return [
      [
        { x: -r, y: -r },
        { x: 0, y: -r },
      ],
      [
        { x: 0, y: -r },
        { x: 0, y: r },
      ],
      [
        { x: 0, y: r },
        { x: r, y: r },
      ],
    ]
  return [
    [
      { x: r, y: -r },
      { x: 0, y: -r },
    ],
    [
      { x: 0, y: -r },
      { x: 0, y: r },
    ],
    [
      { x: 0, y: r },
      { x: -r, y: r },
    ],
  ]
}

function offsetParallel(
  a: Point,
  b: Point,
  offset: number,
): [Point, Point] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * offset
  const oy = (dx / len) * offset
  return [
    { x: a.x + ox, y: a.y + oy },
    { x: b.x + ox, y: b.y + oy },
  ]
}

type Factory = (r: number) => ShapeParts

const OPEN: Partial<Record<StudyRecallShapeId, Factory>> = {
  lineH: (r) => ({
    lines: [
      [
        { x: -r * 0.9, y: 0 },
        { x: r * 0.9, y: 0 },
      ],
    ],
  }),
  lineV: (r) => ({
    lines: [
      [
        { x: 0, y: -r * 0.9 },
        { x: 0, y: r * 0.9 },
      ],
    ],
  }),
  slash: (r) => ({
    lines: [
      [
        { x: r * 0.75, y: -r * 0.75 },
        { x: -r * 0.75, y: r * 0.75 },
      ],
    ],
  }),
  backslash: (r) => ({
    lines: [
      [
        { x: -r * 0.75, y: -r * 0.75 },
        { x: r * 0.75, y: r * 0.75 },
      ],
    ],
  }),
  doubleH: (r) => ({ lines: parallelLines(2, true, r) }),
  doubleV: (r) => ({ lines: parallelLines(2, false, r) }),
  tripleH: (r) => ({ lines: parallelLines(3, true, r) }),
  tripleV: (r) => ({ lines: parallelLines(3, false, r) }),
  doubleSlash: (r) => {
    const a = { x: r * 0.75, y: -r * 0.75 }
    const b = { x: -r * 0.75, y: r * 0.75 }
    return { lines: [[a, b], offsetParallel(a, b, r * 0.22)] }
  },
  doubleBackslash: (r) => {
    const a = { x: -r * 0.75, y: -r * 0.75 }
    const b = { x: r * 0.75, y: r * 0.75 }
    return { lines: [[a, b], offsetParallel(a, b, r * 0.22)] }
  },
  plusLine: (r) => ({ lines: strokeCross(r) }),
  crossLine: (r) => ({ lines: strokeDiag(r) }),
  // Three diameters (6 tips) — stays within the ≤3-stroke redraw budget.
  asterisk: (r) => {
    const s = r * 0.85
    return {
      lines: [0, Math.PI / 3, (2 * Math.PI) / 3].map((angle) => {
        const c = Math.cos(angle)
        const sY = Math.sin(angle)
        return [
          { x: s * c, y: s * sY },
          { x: -s * c, y: -s * sY },
        ]
      }),
    }
  },
  teeN: (r) => ({ lines: tee(r, 'N') }),
  teeS: (r) => ({ lines: tee(r, 'S') }),
  teeE: (r) => ({ lines: tee(r, 'E') }),
  teeW: (r) => ({ lines: tee(r, 'W') }),
  vN: (r) => ({ lines: vee(r, 'N') }),
  vS: (r) => ({ lines: vee(r, 'S') }),
  vE: (r) => ({ lines: vee(r, 'E') }),
  vW: (r) => ({ lines: vee(r, 'W') }),
  yN: (r) => ({ lines: wye(r, 'N') }),
  yS: (r) => ({ lines: wye(r, 'S') }),
  yE: (r) => ({ lines: wye(r, 'E') }),
  yW: (r) => ({ lines: wye(r, 'W') }),
  cornerNE: (r) => ({ lines: corner(r, 'NE') }),
  cornerNW: (r) => ({ lines: corner(r, 'NW') }),
  cornerSE: (r) => ({ lines: corner(r, 'SE') }),
  cornerSW: (r) => ({ lines: corner(r, 'SW') }),
  uN: (r) => ({ lines: uShape(r, 'N') }),
  uS: (r) => ({ lines: uShape(r, 'S') }),
  uE: (r) => ({ lines: uShape(r, 'E') }),
  uW: (r) => ({ lines: uShape(r, 'W') }),
  bracketL: (r) => ({ lines: bracket(r, 'L') }),
  bracketR: (r) => ({ lines: bracket(r, 'R') }),
  bracketU: (r) => ({ lines: bracket(r, 'U') }),
  bracketD: (r) => ({ lines: bracket(r, 'D') }),
  stepNE: (r) => ({ lines: step(r, 'NE') }),
  stepNW: (r) => ({ lines: step(r, 'NW') }),
  stepSE: (r) => ({ lines: step(r, 'SE') }),
  stepSW: (r) => ({ lines: step(r, 'SW') }),
  tickH: (r) => ({
    lines: [
      [
        { x: -r * 0.9, y: 0 },
        { x: r * 0.9, y: 0 },
      ],
      [
        { x: r * 0.9, y: -r * 0.35 },
        { x: r * 0.9, y: r * 0.35 },
      ],
    ],
  }),
  tickV: (r) => ({
    lines: [
      [
        { x: 0, y: -r * 0.9 },
        { x: 0, y: r * 0.9 },
      ],
      [
        { x: -r * 0.35, y: r * 0.9 },
        { x: r * 0.35, y: r * 0.9 },
      ],
    ],
  }),
  notEqual: (r) => ({
    lines: [
      ...parallelLines(2, true, r * 0.85),
      [
        { x: r * 0.55, y: -r * 0.75 },
        { x: -r * 0.55, y: r * 0.75 },
      ],
    ],
  }),
  portalH: (r) => ({ lines: [...bracket(r, 'L'), ...bracket(r, 'R')] }),
  portalV: (r) => ({ lines: [...bracket(r, 'U'), ...bracket(r, 'D')] }),
}

export function openShapeParts(
  id: StudyRecallShapeId,
  radius: number,
): ShapeParts | null {
  const factory = OPEN[id]
  return factory ? factory(radius) : null
}
