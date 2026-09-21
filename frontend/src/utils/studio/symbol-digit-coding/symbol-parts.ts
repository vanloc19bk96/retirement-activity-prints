import {
  archPoints,
  arrowPoints,
  capsulePoints,
  chevronPoints,
  crescentPoints,
  ellipsePoints,
  ellPoints,
  plusPoints,
  rectPoints,
  regularPolygonPoints,
  rotatePoints,
  starPoints,
  teePoints,
  uShapePoints,
  zShapePoints,
  type Point,
} from './geometry'

/** Print-safe geometric coding glyphs — large pool for book-sized variety. */
export const CODING_SYMBOL_IDS = [
  'triangleUp',
  'triangleDown',
  'triangleLeft',
  'triangleRight',
  'circle',
  'ring',
  'dot',
  'square',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'star4',
  'star6',
  'plus',
  'cross',
  'parallelogram',
  'trapezoid',
  'kite',
  'hourglass',
  'bowtie',
  'barH',
  'barV',
  'ovalH',
  'ovalV',
  'arrowUp',
  'arrowDown',
  'arrowLeft',
  'arrowRight',
  'chevronUp',
  'chevronDown',
  'chevronLeft',
  'chevronRight',
  'tee',
  'ell',
  'house',
  'teardrop',
  'crescent',
  'capsuleH',
  'capsuleV',
  'uShape',
  'zShape',
  'arch',
  'equals',
  'parallelBars',
  'twoDots',
  'threeDots',
  'squarePair',
] as const

export type CodingSymbolId = (typeof CODING_SYMBOL_IDS)[number]

/** One Fabric path — multi-path glyphs stay adjacent (no nesting). */
export type CodingSymbolPart =
  | { kind: 'circle'; x: number; y: number; radius: number; filled?: boolean }
  | { kind: 'polygon'; points: Point[] }

const poly = (points: Point[]): CodingSymbolPart[] => [{ kind: 'polygon', points }]

/** Max 4 paths; multi-path glyphs stay side-by-side. */
export function codingSymbolParts(
  id: CodingSymbolId,
  radius: number,
): CodingSymbolPart[] {
  const r = radius * 0.92

  switch (id) {
    case 'circle':
      return [{ kind: 'circle', x: 0, y: 0, radius: radius * 0.9 }]
    case 'dot':
      return [{ kind: 'circle', x: 0, y: 0, radius: radius * 0.52, filled: true }]
    case 'ring':
      return [
        { kind: 'circle', x: 0, y: 0, radius: radius * 0.9 },
        { kind: 'circle', x: 0, y: 0, radius: radius * 0.45 },
      ]
    case 'square': {
      const s = radius * 0.85
      return poly(rectPoints(0, 0, s, s))
    }
    case 'diamond':
      return poly([
        { x: 0, y: -radius },
        { x: radius, y: 0 },
        { x: 0, y: radius },
        { x: -radius, y: 0 },
      ])
    case 'triangleUp':
      return poly(regularPolygonPoints(3, radius * 0.95))
    case 'triangleDown':
      return poly(regularPolygonPoints(3, radius * 0.95, Math.PI / 2))
    case 'triangleLeft':
      return poly(regularPolygonPoints(3, radius * 0.95, Math.PI))
    case 'triangleRight':
      return poly(regularPolygonPoints(3, radius * 0.95, 0))
    case 'pentagon':
      return poly(regularPolygonPoints(5, r))
    case 'hexagon':
      return poly(regularPolygonPoints(6, r))
    case 'octagon':
      return poly(regularPolygonPoints(8, r))
    case 'star':
      return poly(starPoints(5, radius, radius * 0.42))
    case 'star4':
      return poly(starPoints(4, radius, radius * 0.4))
    case 'star6':
      return poly(starPoints(6, radius, radius * 0.48))
    case 'plus':
      return poly(plusPoints(r))
    case 'cross':
      return poly(rotatePoints(plusPoints(r), Math.PI / 4))
    case 'parallelogram': {
      const s = radius * 0.72
      const skew = radius * 0.35
      return poly([
        { x: -s + skew, y: -s },
        { x: s + skew, y: -s },
        { x: s - skew, y: s },
        { x: -s - skew, y: s },
      ])
    }
    case 'trapezoid': {
      const top = radius * 0.45
      const bot = radius * 0.9
      const h = radius * 0.75
      return poly([
        { x: -top, y: -h },
        { x: top, y: -h },
        { x: bot, y: h },
        { x: -bot, y: h },
      ])
    }
    case 'kite':
      return poly([
        { x: 0, y: -radius },
        { x: radius * 0.7, y: 0 },
        { x: 0, y: radius },
        { x: -radius * 0.7, y: 0 },
      ])
    case 'hourglass':
      return poly([
        { x: -r, y: -r },
        { x: r, y: -r },
        { x: 0, y: 0 },
        { x: r, y: r },
        { x: -r, y: r },
        { x: 0, y: 0 },
      ])
    case 'bowtie':
      return poly(
        rotatePoints(
          [
            { x: -r, y: -r },
            { x: r, y: -r },
            { x: 0, y: 0 },
            { x: r, y: r },
            { x: -r, y: r },
            { x: 0, y: 0 },
          ],
          Math.PI / 2,
        ),
      )
    case 'barH':
      return poly(rectPoints(0, 0, radius * 0.95, radius * 0.34))
    case 'barV':
      return poly(rectPoints(0, 0, radius * 0.34, radius * 0.95))
    case 'ovalH':
      return poly(ellipsePoints(radius * 0.95, radius * 0.55))
    case 'ovalV':
      return poly(ellipsePoints(radius * 0.55, radius * 0.95))
    case 'arrowUp':
      return poly(arrowPoints(r))
    case 'arrowDown':
      return poly(rotatePoints(arrowPoints(r), Math.PI))
    case 'arrowLeft':
      return poly(rotatePoints(arrowPoints(r), -Math.PI / 2))
    case 'arrowRight':
      return poly(rotatePoints(arrowPoints(r), Math.PI / 2))
    case 'chevronUp':
      return poly(chevronPoints(r))
    case 'chevronDown':
      return poly(rotatePoints(chevronPoints(r), Math.PI))
    case 'chevronLeft':
      return poly(rotatePoints(chevronPoints(r), -Math.PI / 2))
    case 'chevronRight':
      return poly(rotatePoints(chevronPoints(r), Math.PI / 2))
    case 'tee':
      return poly(teePoints(r))
    case 'ell':
      return poly(ellPoints(r))
    case 'house':
      return poly([
        { x: 0, y: -radius },
        { x: radius, y: -radius * 0.15 },
        { x: radius * 0.72, y: -radius * 0.15 },
        { x: radius * 0.72, y: radius },
        { x: -radius * 0.72, y: radius },
        { x: -radius * 0.72, y: -radius * 0.15 },
        { x: -radius, y: -radius * 0.15 },
      ])
    case 'teardrop':
      return poly([
        { x: 0, y: -radius },
        { x: radius * 0.7, y: -radius * 0.05 },
        { x: radius * 0.55, y: radius * 0.55 },
        { x: 0, y: radius },
        { x: -radius * 0.55, y: radius * 0.55 },
        { x: -radius * 0.7, y: -radius * 0.05 },
      ])
    case 'crescent':
      return poly(crescentPoints(radius))
    case 'capsuleH':
      return poly(capsulePoints(radius * 0.95, radius * 0.55))
    case 'capsuleV':
      return poly(rotatePoints(capsulePoints(radius * 0.95, radius * 0.55), Math.PI / 2))
    case 'uShape':
      return poly(uShapePoints(radius))
    case 'zShape':
      return poly(zShapePoints(radius))
    case 'arch':
      return poly(archPoints(radius))
    case 'equals': {
      const halfW = radius * 0.9
      const halfH = radius * 0.18
      const gap = radius * 0.38
      return [
        { kind: 'polygon', points: rectPoints(0, -gap, halfW, halfH) },
        { kind: 'polygon', points: rectPoints(0, gap, halfW, halfH) },
      ]
    }
    case 'parallelBars': {
      const halfW = radius * 0.18
      const halfH = radius * 0.9
      const gap = radius * 0.38
      return [
        { kind: 'polygon', points: rectPoints(-gap, 0, halfW, halfH) },
        { kind: 'polygon', points: rectPoints(gap, 0, halfW, halfH) },
      ]
    }
    case 'twoDots': {
      // Spread + radius sized so the pair fills ~same bbox as a full circle.
      const dotR = radius * 0.36
      const gap = radius * 0.48
      return [
        { kind: 'circle', x: -gap, y: 0, radius: dotR },
        { kind: 'circle', x: gap, y: 0, radius: dotR },
      ]
    }
    case 'threeDots': {
      const dotR = radius * 0.36
      const cy = radius * 0.48
      return [
        { kind: 'circle', x: 0, y: -cy * 0.75, radius: dotR },
        { kind: 'circle', x: -cy * 0.9, y: cy * 0.55, radius: dotR },
        { kind: 'circle', x: cy * 0.9, y: cy * 0.55, radius: dotR },
      ]
    }
    case 'squarePair': {
      const s = radius * 0.42
      const gap = radius * 0.52
      return [
        { kind: 'polygon', points: rectPoints(-gap, 0, s, s) },
        { kind: 'polygon', points: rectPoints(gap, 0, s, s) },
      ]
    }
    default:
      return [{ kind: 'circle', x: 0, y: 0, radius: radius * 0.9 }]
  }
}
