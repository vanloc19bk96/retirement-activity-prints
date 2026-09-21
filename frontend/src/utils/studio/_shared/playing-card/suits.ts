/**
 * Original suit artwork.
 *
 * The four suit *symbols* are public-domain shapes, but the drawings in any
 * given commercial deck are that publisher's artwork (§2.3). These are ours:
 * every outline is generated from the parametric definitions below, not traced
 * from a deck, and nothing here embeds a font.
 *
 * Each glyph is expressed as one or two closed polygons in a unit box
 * ([0,1] x [0,1], y down) plus a natural aspect ratio, so all three card sizes
 * share one definition. Polygons rather than SVG paths because the Studio
 * Fabric layer already round-trips `polygon` bounds and origins correctly —
 * Fabric recomputes a Path's bounding box on enliven and repositions it from
 * the path data, which would put a pip somewhere other than where layout put it.
 */

import type { Suit } from './types'

export interface Pt {
  x: number
  y: number
}

export interface SuitGlyph {
  /** Main lobe of the symbol. */
  blob: Pt[]
  /** Stem / foot, drawn as a second closed polygon (spades and clubs only). */
  stem?: Pt[]
  /** Natural width / height, so a pip drawn in a square box keeps its shape. */
  aspect: number
}

/**
 * Segment counts. Enough that a 62px-tall pip at 300 DPI has ~1px chords, and
 * few enough that a 16-card page does not carry 20,000 vertices — the content
 * fingerprint serialises every point, so vertex count is a real cost.
 */
const LOBE_SEGMENTS = 40
const UNION_SEGMENTS = 54
const FLARE_SEGMENTS = 8

const round3 = (value: number): number => Math.round(value * 1000) / 1000

function bounds(points: readonly Pt[]) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY, width: maxX - minX || 1, height: maxY - minY || 1 }
}

/**
 * Rescale a lobe into a box of height 1 and width `aspect`, top-left at origin.
 * Suit proportions are a deliberate design choice, not whatever the underlying
 * curve happens to produce, so aspect is set here rather than inherited.
 */
function fitLobe(points: readonly Pt[], aspect: number): Pt[] {
  const b = bounds(points)
  return points.map((p) => ({
    x: ((p.x - b.minX) / b.width) * aspect,
    y: (p.y - b.minY) / b.height,
  }))
}

/** Final pass: fit blob + stem together into the unit box and record the aspect. */
function composeGlyph(blob: Pt[], stem?: Pt[]): SuitGlyph {
  const all = stem ? [...blob, ...stem] : blob
  const b = bounds(all)
  const place = (points: Pt[]): Pt[] =>
    points.map((p) => ({
      x: round3((p.x - b.minX) / b.width),
      y: round3((p.y - b.minY) / b.height),
    }))
  return {
    blob: place(blob),
    ...(stem ? { stem: place(stem) } : {}),
    aspect: round3(b.width / b.height),
  }
}

/** Classic sextic heart curve, returned in canvas orientation (y down). */
function heartCurve(segments: number): Pt[] {
  const points: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const sin = Math.sin(t)
    points.push({
      x: 16 * sin * sin * sin,
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    })
  }
  return points
}

/**
 * Outline of the union of several circles, traced by casting rays from a point
 * inside every one of them. A union of convex sets sharing an interior point is
 * star-shaped about that point, so one radius per angle describes it exactly.
 */
function circleUnionOutline(
  circles: readonly { cx: number; cy: number; r: number }[],
  origin: Pt,
  segments: number,
): Pt[] {
  for (const c of circles) {
    const d = Math.hypot(c.cx - origin.x, c.cy - origin.y)
    if (d >= c.r) {
      throw new Error('circleUnionOutline: origin must lie inside every circle')
    }
  }
  const points: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const dx = Math.cos(theta)
    const dy = Math.sin(theta)
    let far = 0
    for (const c of circles) {
      const ox = c.cx - origin.x
      const oy = c.cy - origin.y
      const proj = dx * ox + dy * oy
      const disc = proj * proj - (ox * ox + oy * oy - c.r * c.r)
      if (disc < 0) continue
      const t = proj + Math.sqrt(disc)
      if (t > far) far = t
    }
    points.push({ x: origin.x + dx * far, y: origin.y + dy * far })
  }
  return points
}

/**
 * Concave-flared foot shared by spades and clubs, in lobe-height units:
 * y = 0 is the top of the lobe, y = 1 its bottom.
 */
function stemPolygon(options: {
  centerX: number
  topY: number
  topHalfWidth: number
  baseY: number
  baseHalfWidth: number
}): Pt[] {
  const { centerX, topY, topHalfWidth, baseY, baseHalfWidth } = options
  // Control point held high, which is what waists the foot instead of
  // letting it read as a plain triangle.
  const controlY = baseY - (baseY - topY) * 0.18
  const flare = (side: 1 | -1): Pt[] => {
    const out: Pt[] = []
    for (let i = 0; i <= FLARE_SEGMENTS; i++) {
      const t = i / FLARE_SEGMENTS
      const inv = 1 - t
      const x =
        inv * inv * (side * topHalfWidth) +
        2 * inv * t * (side * topHalfWidth) +
        t * t * (side * baseHalfWidth)
      const y = inv * inv * topY + 2 * inv * t * controlY + t * t * baseY
      out.push({ x: centerX + x, y })
    }
    return out
  }
  return [...flare(-1), ...flare(1).reverse()]
}

function buildSpade(): SuitGlyph {
  // Heart lobe turned point-up, narrowed at the shoulders.
  const lobe = fitLobe(
    heartCurve(LOBE_SEGMENTS).map((p) => ({ x: p.x, y: -p.y })),
    0.95,
  )
  const stem = stemPolygon({
    centerX: 0.95 / 2,
    topY: 0.74,
    topHalfWidth: 0.05,
    baseY: 1.22,
    baseHalfWidth: 0.26,
  })
  return composeGlyph(lobe, stem)
}

function buildHeart(): SuitGlyph {
  return composeGlyph(fitLobe(heartCurve(LOBE_SEGMENTS), 0.98))
}

function buildDiamond(): SuitGlyph {
  return {
    blob: [
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 },
    ],
    aspect: 0.7,
  }
}

function buildClub(): SuitGlyph {
  const r = 0.3
  const lobe = fitLobe(
    circleUnionOutline(
      [
        { cx: 0.5, cy: 0.28, r },
        { cx: 0.26, cy: 0.64, r },
        { cx: 0.74, cy: 0.64, r },
      ],
      { x: 0.5, y: 0.52 },
      UNION_SEGMENTS,
    ),
    1.05,
  )
  const stem = stemPolygon({
    centerX: 1.05 / 2,
    topY: 0.8,
    topHalfWidth: 0.055,
    baseY: 1.2,
    baseHalfWidth: 0.25,
  })
  return composeGlyph(lobe, stem)
}

/** Indexed by `Suit`: 0 spades, 1 hearts, 2 diamonds, 3 clubs. */
const GLYPHS: Record<Suit, SuitGlyph> = {
  0: buildSpade(),
  1: buildHeart(),
  2: buildDiamond(),
  3: buildClub(),
}

/** Unit-box outline for one suit. Shared and immutable — never mutate it. */
export function suitGlyph(suit: Suit): SuitGlyph {
  return GLYPHS[suit]
}

/**
 * Suit outline scaled to `size` tall and centred on (cx, cy).
 * One polygon for hearts and diamonds, two for spades and clubs.
 */
export function suitPolygons(suit: Suit, cx: number, cy: number, size: number): Pt[][] {
  const glyph = GLYPHS[suit]
  const height = size
  const width = size * glyph.aspect
  const left = cx - width / 2
  const top = cy - height / 2
  const place = (points: readonly Pt[]): Pt[] =>
    points.map((p) => ({
      x: Math.round((left + p.x * width) * 100) / 100,
      y: Math.round((top + p.y * height) * 100) / 100,
    }))
  return glyph.stem ? [place(glyph.blob), place(glyph.stem)] : [place(glyph.blob)]
}
