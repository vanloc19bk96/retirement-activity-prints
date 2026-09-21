import {
  rotatePoints,
  type Point,
} from '../symbol-digit-coding/geometry'

export function rect(rx: number, ry: number): Point[] {
  return [
    { x: -rx, y: -ry },
    { x: rx, y: -ry },
    { x: rx, y: ry },
    { x: -rx, y: ry },
  ]
}

export function diamond(rx: number, ry: number): Point[] {
  return [
    { x: 0, y: -ry },
    { x: rx, y: 0 },
    { x: 0, y: ry },
    { x: -rx, y: 0 },
  ]
}

export function rightTri(radius: number, corner: 'NE' | 'NW' | 'SE' | 'SW'): Point[] {
  const r = radius * 0.9
  const map = {
    NE: [
      { x: -r, y: -r },
      { x: r, y: -r },
      { x: r, y: r },
    ],
    NW: [
      { x: r, y: -r },
      { x: -r, y: -r },
      { x: -r, y: r },
    ],
    SE: [
      { x: -r, y: r },
      { x: r, y: r },
      { x: r, y: -r },
    ],
    SW: [
      { x: r, y: r },
      { x: -r, y: r },
      { x: -r, y: -r },
    ],
  } as const
  return [...map[corner]]
}

export function trapezoid(radius: number, flip: boolean): Point[] {
  const top = radius * 0.4
  const bot = radius * 0.9
  const h = radius * 0.75
  const pts = [
    { x: -top, y: -h },
    { x: top, y: -h },
    { x: bot, y: h },
    { x: -bot, y: h },
  ]
  return flip ? rotatePoints(pts, Math.PI) : pts
}

export function parallelogram(radius: number, mirror: boolean): Point[] {
  const s = radius * 0.72
  const skew = mirror ? -radius * 0.35 : radius * 0.35
  return [
    { x: -s + skew, y: -s },
    { x: s + skew, y: -s },
    { x: s - skew, y: s },
    { x: -s - skew, y: s },
  ]
}

export function house(radius: number): Point[] {
  const w = radius * 0.78
  return [
    { x: 0, y: -radius },
    { x: w, y: -radius * 0.15 },
    { x: w, y: radius },
    { x: -w, y: radius },
    { x: -w, y: -radius * 0.15 },
  ]
}

export function kite(radius: number): Point[] {
  return [
    { x: 0, y: -radius },
    { x: radius * 0.65, y: -radius * 0.05 },
    { x: 0, y: radius },
    { x: -radius * 0.65, y: -radius * 0.05 },
  ]
}

export function parallelLines(
  count: number,
  horizontal: boolean,
  radius: number,
): [Point, Point][] {
  const span = radius * 0.9
  const gap = radius * 0.35
  const start = -((count - 1) * gap) / 2
  const lines: [Point, Point][] = []
  for (let i = 0; i < count; i++) {
    const o = start + i * gap
    lines.push(
      horizontal
        ? [
            { x: -span, y: o },
            { x: span, y: o },
          ]
        : [
            { x: o, y: -span },
            { x: o, y: span },
          ],
    )
  }
  return lines
}

export function strokeCross(radius: number): [Point, Point][] {
  const r = radius * 0.75
  return [
    [
      { x: -r, y: 0 },
      { x: r, y: 0 },
    ],
    [
      { x: 0, y: -r },
      { x: 0, y: r },
    ],
  ]
}

export function strokeDiag(radius: number): [Point, Point][] {
  const r = radius * 0.7
  return [
    [
      { x: -r, y: -r },
      { x: r, y: r },
    ],
    [
      { x: r, y: -r },
      { x: -r, y: r },
    ],
  ]
}
