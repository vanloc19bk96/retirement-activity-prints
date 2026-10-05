import { blob, rod, steps } from '../stained-glass/subject-kit'
import { pt, type Pt, type Ring } from '../stained-glass/geometry'

/**
 * Shapes Spot the Differences draws again and again: scalloped outlines
 * traced along overlapping discs (clouds, crowns, bushes), pointed leaves,
 * five-petalled flowers, scalloped hems, a ring cut between two heights.
 */

export type XY = readonly [number, number]

/** The part of a ring between two horizontal lines (y grows downward). */
export function sliceY(ring: readonly Pt[], top: number, bottom: number): Ring {
  const clip = (pts: readonly Pt[], keep: (p: Pt) => boolean, y: number): Pt[] => {
    const cross = (a: Pt, b: Pt) => pt(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y)
    const out: Pt[] = []
    pts.forEach((b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]!
      if (keep(b)) {
        if (!keep(a)) out.push(cross(a, b))
        out.push(b)
      } else if (keep(a)) out.push(cross(a, b))
    })
    return out
  }
  return clip(
    clip(ring, (p) => p.y >= top, top),
    (p) => p.y <= bottom,
    bottom,
  )
}

/** A ring squeezed (or stretched) sideways about x = cx. */
export const scaleX = (ring: readonly Pt[], f: number, cx: number): Ring => ring.map((p) => pt(cx + (p.x - cx) * f, p.y))

/** A disc: centre x, centre y, radius. */
export type Disc = readonly [number, number, number]

/** Where two overlapping circles cross: the crossing farther from `o`. */
export function crossing(a: Disc, b: Disc, o: XY): Pt {
  const [x0, y0, r0] = a
  const [x1, y1, r1] = b
  const dx = x1 - x0
  const dy = y1 - y0
  const d = Math.hypot(dx, dy)
  const along = (d * d + r0 * r0 - r1 * r1) / (2 * d)
  const h = Math.sqrt(Math.max(0, r0 * r0 - along * along))
  const mx = x0 + (dx * along) / d
  const my = y0 + (dy * along) / d
  const p = pt(mx - (dy * h) / d, my + (dx * h) / d)
  const q = pt(mx + (dy * h) / d, my - (dx * h) / d)
  return Math.hypot(p.x - o[0], p.y - o[1]) >= Math.hypot(q.x - o[0], q.y - o[1]) ? p : q
}

/** A circle's points from angle `a0` round to `a1` (radians, clockwise on the page), about 3° apart. */
export function discArc([cx, cy, r]: Disc, a0: number, a1: number): Pt[] {
  const n = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 60)))
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return pt(cx + r * Math.cos(a), cy + r * Math.sin(a))
  })
}

export const angleAt = (c: Disc, p: Pt) => Math.atan2(p.y - c[1], p.x - c[0])

/** `a` turned by whole turns into (from, from + 2π]. */
export function past(a: number, from: number): number {
  let x = a
  while (x <= from) x += Math.PI * 2
  while (x > from + Math.PI * 2) x -= Math.PI * 2
  return x
}

/**
 * A scalloped outline traced along the outer arcs of overlapping discs, each
 * disc overlapping only its neighbours: true arcs meeting in crisp dips, the
 * way a cloud or a leafy crown is drawn by hand.
 *
 * With `base`, the discs run left to right over the top and the outline
 * closes with a flat bottom at `base` (the first and last disc should reach
 * it, ideally just touching, so the ends round smoothly into the base).
 * Without, the discs run clockwise all the way round and the outline closes
 * on itself.
 */
export function bumpRing(discs: readonly Disc[], base?: number): Ring {
  const n = discs.length
  const open = base !== undefined
  const o: XY = open
    ? [discs.reduce((t, d) => t + d[0], 0) / n, base]
    : [discs.reduce((t, d) => t + d[0], 0) / n, discs.reduce((t, d) => t + d[1], 0) / n]
  const out: Pt[] = []
  discs.forEach((c, i) => {
    const onBase = (side: -1 | 1) => {
      const s = Math.asin(Math.max(-1, Math.min(1, (base! - c[1]) / c[2])))
      return side < 0 ? Math.PI - s : s
    }
    const a0 =
      open && i === 0 ? onBase(-1) : angleAt(c, crossing(discs[(i - 1 + n) % n]!, c, o))
    const a1 = past(open && i === n - 1 ? onBase(1) : angleAt(c, crossing(c, discs[(i + 1) % n]!, o)), a0)
    const arc = discArc(c, a0, a1)
    // Each arc ends where the next begins: keep that point once.
    out.push(...(open && i === n - 1 ? arc : arc.slice(0, -1)))
  })
  return out
}

/**
 * `n` discs of radius `r` set along a dome `2 × halfWidth` wide and `height`
 * tall standing on `base` at `cx`, for `bumpRing(…, base)`: the end discs just
 * touch the base. Keep the discs no more than ~1.8 r apart and over r apart
 * two along, so each overlaps only its neighbours.
 */
export function domeDiscs(cx: number, base: number, halfWidth: number, height: number, n: number, r: number): Disc[] {
  const a = halfWidth - r
  const b = height - r
  const from = Math.asin(r / b)
  return Array.from({ length: n }, (_, i) => {
    const t = from + ((Math.PI - 2 * from) * i) / (n - 1)
    return [cx - a * Math.cos(t), base - b * Math.sin(t), r] as const
  })
}

/** `n` discs of radius `r` clockwise round an ellipse (from the top), for a closed `bumpRing`. */
export function ovalDiscs(cx: number, cy: number, rx: number, ry: number, n: number, r: number): Disc[] {
  return Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t), r] as const
  })
}

/** A pointed leaf from its stalk (x0, y0) to its tip (x1, y1), `width` across at its widest. */
export function leaf(x0: number, y0: number, x1: number, y1: number, width: number): Ring {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const nx = -(y1 - y0) / len
  const ny = (x1 - x0) / len
  const side = (sign: number) =>
    steps(13, 0, 1 / 12).map((t) => {
      const bulge = sign * (width / 2) * Math.sin(Math.PI * t) ** 0.85
      return pt(x0 + (x1 - x0) * t + nx * bulge, y0 + (y1 - y0) * t + ny * bulge)
    })
  return [...side(1), ...side(-1).reverse().slice(1, -1)]
}

/** A straight top from x0 to x1 at `top`, with `n` round scallops hanging to `hem`. */
export function scallopRing(x0: number, x1: number, top: number, hem: number, n: number, depth: number): Ring {
  const out: Pt[] = [pt(x0, top), pt(x1, top)]
  const w = (x1 - x0) / n
  for (let i = n - 1; i >= 0; i--) {
    for (let s = 8; s >= 0; s--) {
      const t = s / 8
      out.push(pt(x0 + (i + t) * w, hem + depth * Math.sin(Math.PI * t)))
    }
  }
  return out
}

/** A five-petalled flower head, one clean outline. */
export function flowerHead(cx: number, cy: number, r: number, turn = 0): Ring {
  const pts: XY[] = []
  for (let i = 0; i < 5; i++) {
    const a = i * 72 - 90 + turn
    const at = (deg: number, rr: number): XY => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)]
    pts.push(at(a - 26, r * 0.78), at(a - 12, r), at(a + 12, r), at(a + 26, r * 0.78), at(a + 36, r * 0.62))
  }
  return blob(...pts)
}

/** A rod along a clock hand: from the centre, `deg` clockwise from twelve. */
export function hand(cx: number, cy: number, deg: number, len: number, width: number): Ring {
  const a = (deg * Math.PI) / 180
  return rod(cx, cy, cx + len * Math.sin(a), cy - len * Math.cos(a), width)
}
