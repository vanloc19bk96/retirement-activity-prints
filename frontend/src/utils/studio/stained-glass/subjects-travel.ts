import { subject, type SgSubject } from './catalog'
import { pt, type Pt, type Ring } from './geometry'
import { band, blob, circle, curve, ellipse, path, poly, rect, rod, rotate, sketch, steps, wedge, type Sketch } from './subject-kit'

/**
 * Travel and getaways: boats, roads, trains and the places they go.
 *
 * Drawn to the rules in `subject-kit.ts`; every version of every subject here
 * is rendered alone at the smallest print size by the tests and must leave no
 * piece too small to color.
 */

type XY = readonly [number, number]

/** Fillet points for a corner at `v` between neighbours `a` and `b`. */
function fillet(a: XY, v: XY, b: XY, r: number): Pt[] {
  const la = Math.hypot(a[0] - v[0], a[1] - v[1]) || 1
  const lb = Math.hypot(b[0] - v[0], b[1] - v[1]) || 1
  const d = Math.min(r, la / 2, lb / 2)
  if (d <= 0) return [pt(v[0], v[1])]
  const p1: XY = [v[0] + ((a[0] - v[0]) / la) * d, v[1] + ((a[1] - v[1]) / la) * d]
  const p2: XY = [v[0] + ((b[0] - v[0]) / lb) * d, v[1] + ((b[1] - v[1]) / lb) * d]
  const out: Pt[] = []
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    const u = 1 - t
    out.push(pt(u * u * p1[0] + 2 * u * t * v[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * v[1] + t * t * p2[1]))
  }
  return out
}

/** A polygon with rounded corners; `r` is one radius or one per corner. */
function roundPoly(r: number | readonly number[], ...points: XY[]): Ring {
  const n = points.length
  return points.flatMap((v, i) => fillet(points[(i + n - 1) % n]!, v, points[(i + 1) % n]!, typeof r === 'number' ? r : (r[i] ?? 0)))
}

/** An open polyline with rounded bends (for bands). */
function roundPath(r: number, ...points: XY[]): Pt[] {
  return points.flatMap((v, i) => (i === 0 || i === points.length - 1 ? [pt(v[0], v[1])] : fillet(points[i - 1]!, v, points[i + 1]!, r)))
}

/** A wheel: tyre, then the hub on top of it. */
function wheel(s: Sketch, cx: number, cy: number, r: number, hub: number): void {
  s.add(circle(cx, cy, r))
  s.part(circle(cx, cy, hub))
}

const sailboat = subject('sailboat', 'Sailboat', 'travel', 'outdoor', 'water', { sails: 2, hull: 2, flag: 2 }, (k) =>
  sketch((s) => {
    // Sails first, reaching down into the hull; the mast covers their inner edges.
    if (k.flag === 1) s.part(poly([50, 2], [72, 6], [72, 18], [50, 22]))
    s.add(poly([50, 8], [92, 80], [50, 80]))
    if (k.sails === 1) {
      s.add(poly([50, 20], [22, 80], [50, 80]))
    } else {
      s.add(poly([50, 12], [10, 80], [50, 80]))
    }
    s.add(rod(50, 2, 50, 82, 10))
    const hull = k.hull === 1 ? poly([2, 72], [98, 72], [84, 94], [16, 94]) : blob([4, 72], [50, 75], [96, 72], [80, 94], [20, 94])
    s.add(hull)
    s.add(rect(14, 77, 72, 8, 4))
  }),
)

const motorhome = subject('motorhome', 'Motorhome', 'travel', 'outdoor', 'grass', { bunk: 2, windows: 2, roof: 2 }, (k) =>
  sketch((s) => {
    // The body's underside sits well above the wheels' feet, clear of where a
    // hill's skyline may cross the drawing (the same holds for every vehicle here).
    // Windshield first: the hood, the body and the bunk cover all but its slanted glass.
    s.part(k.bunk === 1 ? poly([72, 4], [84, 4], [100, 30], [100, 34], [72, 34]) : poly([72, 10], [86, 10], [100, 30], [100, 34], [72, 34]))
    s.part(roundPoly([0, 0, 4, 5, 0], [72, 30], [100, 30], [103, 36], [103, 44], [72, 44]))
    if (k.roof === 1) s.add(rect(14, -10, 40, 16, [5, 0]))
    if (k.bunk === 1) s.add(roundPoly([6, 7, 5, 0, 0, 3], [2, 0], [96, 0], [96, 14], [80, 14], [80, 44], [2, 44]))
    else s.add(roundPoly([6, 6, 0, 3], [2, 0], [80, 0], [80, 44], [2, 44]))
    if (k.windows === 1) s.add(rect(8, 10, 48, 16, 4))
    else {
      s.add(rect(8, 10, 20, 16, 4))
      s.add(rect(38, 10, 18, 16, 4))
    }
    s.add(roundPoly([4, 0, 0, 0], [66, 12], [80, 12], [80, 44], [66, 44]))
    wheel(s, 24, 56, 15, 7)
    wheel(s, 79, 56, 15, 7)
  }),
)

const camperTrailer = subject('camper-trailer', 'Camper Trailer', 'travel', 'outdoor', 'grass', { roof: 2, window: 2, skirt: 2 }, (k) =>
  sketch((s) => {
    // Tongue first; the body covers its back end.
    s.add(rod(104, 45, 104, 72, 10))
    s.add(poly([70, 24], [104, 40], [104, 50], [70, 34]))
    s.part(circle(104, 45, 8))
    const top = k.roof === 1 ? 28 : 16
    s.add(rect(4, 0, 76, 50, [top, 8]))
    if (k.skirt === 1) s.add(rect(4, 33, 76, 17, [0, 8]))
    if (k.window === 1) {
      s.add(rect(38, 11, 26, 12, 5))
    } else {
      s.part(circle(43, 16, 7))
      s.part(circle(63, 16, 7))
    }
    s.add(roundPoly([6, 6, 0, 0], [16, 11], [30, 11], [30, 50], [16, 50]))
    wheel(s, 51, 62, 15, 7)
  }),
)

const suitcase = subject('suitcase', 'Suitcase', 'travel', 'indoor', 'none', { straps: 2, stickers: 3, feet: 2 }, (k) =>
  sketch((s) => {
    // Handle and feet first; the case covers their ends.
    s.add(band(roundPath(8, [36, 28], [36, 2], [64, 2], [64, 28]), 10))
    if (k.feet === 1) {
      s.add(rect(10, 76, 16, 20, 4))
      s.add(rect(74, 76, 16, 20, 4))
    }
    s.add(rect(4, 20, 92, 64, 9))
    if (k.straps === 1) {
      for (const x of [14, 74]) {
        s.add(rect(x, 20, 12, 64))
        s.part(rect(x - 3, 46, 18, 14, 3))
      }
    }
    const lo = k.straps === 1 ? 36 : 16
    const hi = k.straps === 1 ? 64 : 84
    if (k.stickers === 0) {
      s.part(circle(lo + 7, 41, 8))
      s.part(rotate(rect(hi - 16, 58, 16, 13, 3), -10, hi - 8, 64))
    } else if (k.stickers === 1) {
      s.part(poly([lo + 8, 30], [lo + 16, 42], [lo + 8, 54], [lo, 42]))
      s.part(circle(hi - 9, 64, 9))
    } else {
      s.part(rotate(rect(lo - 2, 32, 20, 14, 3), 8, lo + 8, 39))
      s.part(circle(hi - 8, 64, 8))
    }
  }),
)

/** The part of a ring between two horizontal lines (y grows downward). */
function sliceY(ring: readonly Pt[], top: number, bottom: number): Ring {
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
const scaleX = (ring: readonly Pt[], f: number, cx: number): Ring => ring.map((p) => pt(cx + (p.x - cx) * f, p.y))

const cruiseShip = subject('cruise-ship', 'Cruise Ship', 'travel', 'outdoor', 'water', { decks: 2, funnels: 2, hull: 2, lifeboats: 2 }, (k) =>
  sketch((s) => {
    const tall = k.decks === 1
    const top = tall ? 12 : 20
    // Funnels first, raked back and standing in the top deck; a colored cap on each.
    const funnels = k.funnels === 1 ? (tall ? [28, 52] : [30, 54]) : [42]
    for (const x of funnels) {
      const f = poly([x - 4, top - 22], [x + 10, top - 22], [x + 14.5, top + 5], [x + 0.5, top + 5])
      s.add(f)
      s.part(sliceY(f, top - 23, top - 10))
    }
    // Decks, top one first: each lower deck covers the foot of the one above.
    if (tall) {
      s.add(rect(22, 12, 52, 20, [5, 0]))
      s.add(rect(14, 24, 68, 20, [5, 0]))
    } else {
      s.add(rect(18, 20, 60, 22, [5, 0]))
    }
    const lowerTop = tall ? 36 : 34
    s.add(rect(6, lowerTop, 84, 52 - lowerTop, [5, 0]))
    // Hull with a raised, raked bow. Only the round-bottomed rudder reaches the
    // waterline: a flat keel lying along a wave's edge would pinch off slivers.
    s.add(roundPoly([0, 0, 7, 7], [-2, 58], [17, 58], [17, 78], [2, 78]))
    s.add(poly([0, 48], [84, 48], [100, 40], [88, 70], [8, 70]))
    if (k.hull === 1) s.add(poly([4, 59], [92.9, 59], [88, 70], [8, 70]))
    else for (const x of [22, 46, 70]) s.part(circle(x, 59, 6.5))
    if (k.lifeboats === 1) for (const x of [34, 60]) s.part(ellipse(x, lowerTop, 8, 5.5))
  }),
)

const hotAirBalloon = subject('hot-air-balloon', 'Hot Air Balloon', 'travel', 'outdoor', 'none', { gores: 2, band: 2, basket: 2 }, (k) =>
  sketch((s) => {
    // Ropes first: the skirt and the basket rim cover their ends.
    s.stroke(path([45, 70], [40, 92]))
    s.stroke(path([55, 70], [60, 92]))
    const env = blob([50, 0], [78, 9], [86, 32], [74, 54], [58, 68], [42, 68], [26, 54], [14, 32], [22, 9])
    s.add(env)
    // Gores: the envelope squeezed about its middle, narrower each time.
    for (const f of k.gores === 1 ? [0.62, 0.22] : [0.4]) s.add(scaleX(env, f, 50))
    if (k.band === 1) s.add(sliceY(env, 30, 42))
    s.add(sliceY(env, -1, 11))
    s.add(poly([38, 62], [62, 62], [58, 76], [42, 76]))
    if (k.basket === 1) {
      s.part(circle(32, 101, 7.5))
      s.part(circle(68, 101, 7.5))
    }
    s.add(rect(36, 90, 28, 16, [0, 5]))
    s.add(rect(33, 88, 34, 8, 3))
  }),
)

const beachChair = subject('beach-chair', 'Beach Chair and Umbrella', 'travel', 'outdoor', 'sand', { stripes: 2, panels: 2, ball: 2 }, (k) =>
  sketch((s) => {
    // Umbrella: the pole first, so the canopy covers its top.
    s.add(rod(56, 2, 70, 100, 10))
    const n = k.panels === 1 ? 6 : 4
    const joints = steps(n + 1, 8, 96 / n)
    const y0 = 20
    const apex = pt(56, -6)
    const dome = curve([8, y0], [20, 4], [56, -6], [92, 4], [104, y0])
    const scallop = (from: number, to: number): Pt[] => steps(9, 0, 1 / 8).map((t) => pt(from + (to - from) * t, y0 + 24 * t * (1 - t)))
    const hem: Pt[] = []
    for (let i = n; i > 0; i--) hem.push(...scallop(joints[i]!, joints[i - 1]!).slice(i === n ? 1 : 0, -1))
    s.add([...dome, ...hem])
    for (let i = 1; i < n; i += 2) s.add([apex, ...scallop(joints[i]!, joints[i + 1]!)])
    s.part(circle(56, -8, 7.5))
    // Chair: legs under the seat, and a striped back leaning away.
    s.add(rod(12, 78, 4, 100, 9))
    s.add(rod(38, 78, 46, 100, 9))
    const tilt = (ring: Ring) => rotate(ring, -18, 18, 76)
    s.add(tilt(rect(8, 36, 20, 40, 5)))
    // Stripes as [top, bottom] pairs along the back.
    const bands = k.stripes === 1 ? [46, 55, 64, 76] : [50, 61]
    for (let i = 0; i < bands.length; i += 2) s.add(tilt(rect(8, bands[i]!, 20, bands[i + 1]! - bands[i]!)))
    s.add(rect(2, 72, 42, 10, 4))
    // A beach ball in front of the umbrella's foot.
    if (k.ball === 1) {
      s.add(circle(80, 88, 12))
      s.part(wedge(80, 88, 12, -60, 120))
    }
  }),
)

/** The part of `ring` inside the convex polygon `hull` (Sutherland–Hodgman). */
function clipConvex(ring: readonly Pt[], hull: readonly Pt[]): Ring {
  let area = 0
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length]!
    area += a.x * b.y - b.x * a.y
  })
  const sign = Math.sign(area)
  let out: Pt[] = [...ring]
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length]!
    const side = (p: Pt) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))
    const src = out
    out = []
    src.forEach((q, j) => {
      const p = src[(j + src.length - 1) % src.length]!
      const sp = side(p)
      const sq = side(q)
      const cross = () => {
        const t = sp / (sp - sq)
        return pt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)
      }
      if (sq >= 0) {
        if (sp < 0) out.push(cross())
        out.push(q)
      } else if (sp >= 0) out.push(cross())
    })
  })
  return out
}

const lighthouse = subject('lighthouse', 'Lighthouse', 'travel', 'outdoor', 'water', { stripes: 3, beams: 2, rocks: 2 }, (k) =>
  sketch((s) => {
    // Light beams first: the lantern and the dome cover their inner ends.
    if (k.beams === 1) {
      s.add(poly([50, 22], [100, -6], [100, 16]))
      s.add(poly([50, 22], [0, -6], [0, 16]))
    }
    const tower = poly([33, 36], [67, 36], [76, 100], [24, 100])
    s.add(tower)
    // Stripes (plain bands, or one wound round the tower); the lowest runs down behind the rocks.
    if (k.stripes === 2) s.add(clipConvex(poly([0, 57], [100, 47], [100, 60], [0, 70]), tower))
    else {
      // Bands as [top, bottom] pairs.
      const bands = k.stripes === 1 ? [55, 68] : [51, 61, 71, 100]
      for (let i = 0; i < bands.length; i += 2) s.add(sliceY(tower, bands[i]!, bands[i + 1]!))
    }
    s.add(rect(39, 10, 22, 24))
    s.add(sliceY(ellipse(50, 16, 15, 13), 0, 16))
    s.part(circle(50, 2, 7))
    s.add(rect(29, 30, 42, 10, 3))
    // A rocky islet round the foot, meeting the tower well above the waterline.
    s.add(blob([0, 102], [8, 90], [30, 82], [50, 80], [70, 82], [92, 90], [100, 102]))
    if (k.rocks === 1) s.add(blob([4, 102], [10, 93], [24, 89], [38, 95], [42, 102]))
  }),
)

const steamTrain = subject('steam-train', 'Steam Train', 'travel', 'outdoor', 'grass', { front: 2, smoke: 2, bands: 2 }, (k) =>
  sketch((s) => {
    // Smoke first, trailing back from the chimney.
    const puffs: [number, number, number, number][] =
      k.smoke === 1
        ? [
            [42, -12, 13, 10],
            [62, -8, 12, 9],
            [80, -2, 11, 8],
          ]
        : [
            [60, -8, 13, 10],
            [80, -2, 11, 8],
          ]
    s.add(poly([72, 4], [90, 4], [86, 13], [85, 30], [77, 30], [76, 13]))
    for (const [x, y, rx, ry] of puffs) s.add(ellipse(x, y, rx, ry))
    s.add(circle(58, 28, 12))
    s.add(roundPoly([0, 9, 0, 0], [34, 26], [96, 26], [96, 50], [34, 50]))
    for (const x of k.bands === 1 ? [52, 76] : [60]) s.add(rect(x - 4, 26, 8, 24))
    // Cab and roof over the boiler's back end.
    s.add(rect(4, 14, 34, 36))
    s.part(rect(12, 26, 16, 14, 3))
    s.add(rect(0, 8, 42, 10, 4))
    // The cowcatcher hangs from under the running board.
    if (k.front === 1) s.add(poly([86, 52], [96, 52], [105, 83], [86, 83]))
    s.add(rect(2, 46, 96, 12, 3))
    wheel(s, 19, 70.5, 15.5, 7)
    wheel(s, 60, 70.5, 15.5, 7)
    // Or a small leading wheel, hung from the running board on a bracket.
    if (k.front === 0) {
      s.add(rect(89, 52, 12, 24, [0, 3]))
      s.part(circle(95, 77, 9))
    }
  }),
)

export const TRAVEL_SUBJECTS: readonly SgSubject[] = [
  sailboat,
  motorhome,
  camperTrailer,
  suitcase,
  cruiseShip,
  hotAirBalloon,
  beachChair,
  lighthouse,
  steamTrain,
]
