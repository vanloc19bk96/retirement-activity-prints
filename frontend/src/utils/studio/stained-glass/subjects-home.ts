import { subject, type SgSubject } from './catalog'
import { pt, type Pt, type Ring } from './geometry'
import { band, blob, circle, curve, ellipse, path, poly, rect, rod, rotate, sketch, wedge } from './subject-kit'

/**
 * Home comforts: the chair, the cup, the quiet pleasures of a morning in.
 *
 * Drawn to the rules in `subject-kit.ts`; every version of every subject here
 * is rendered alone at the smallest print size by the tests and must leave no
 * piece too small to color.
 */

const rockingChair = subject('rocking-chair', 'Rocking Chair', 'home', 'indoor', 'none', { back: 3, rocker: 2, arm: 2 }, (k) =>
  sketch((s) => {
    const lift = k.rocker === 1 ? 8 : 0
    // Legs (and the arm post) first: the seat and the rocker cover their ends.
    s.add(rod(30, 96, 30, 62, 10))
    s.add(rod(70, 96, 70, 62, 10))
    if (k.arm === 1) s.add(rod(77, 64, 77, 36, 13))
    // The arm runs under the back panel, so only its front shows.
    if (k.arm === 1) s.add(band(curve([30, 33], [56, 29], [86, 32]), 10, true))
    else s.add(band(curve([30, 40], [58, 35], [76, 42], [77, 64]), 10, true))
    // Back panel, leaning back.
    const tilt = (ring: ReturnType<typeof rect>) => rotate(ring, -10, 32, 64)
    s.add(tilt(rect(14, 2, 36, 64, 10)))
    if (k.back === 0) s.add(tilt(rect(26, 14, 12, 36, 6)))
    else if (k.back === 1) for (const y of [11, 31]) s.add(tilt(rect(22, y, 20, 12, 5)))
    else s.add(tilt(blob([32, 14], [42, 28], [32, 44], [22, 28])))
    s.add(rect(14, 58, 72, 15, 5))
    // The rocker runner: the one cue no other chair has.
    s.add(band(curve([-2, 82 - lift], [22, 96], [52, 101], [82, 97], [104, 84 - lift]), 10, true))
  }),
)

const coffeeMug = subject('coffee-mug', 'Coffee Mug', 'home', 'indoor', 'none', { steam: 3, body: 2, band: 3 }, (k) =>
  sketch((s) => {
    const w = k.body === 1 ? 58 : 50
    const x = 44 - w / 2
    const mid = x + w / 2
    // Steam first, rising from under the rim: gentle S-curls.
    const curls = k.steam === 0 ? [mid] : k.steam === 1 ? [mid - 11, mid + 11] : [mid - 16, mid, mid + 16]
    curls.forEach((cx, i) => {
      const top = i % 2 === 0 ? 0 : 6
      s.add(band(curve([cx, 42], [cx - 4, 31], [cx, 21], [cx + 4, 11], [cx, top]), 8, true))
    })
    // Handle, so the body covers its ends.
    s.add(band(curve([x + w - 6, 52], [x + w + 18, 54], [x + w + 20, 72], [x + w - 6, 84]), 10, true))
    s.add(rect(x, 43, w, 53, [0, 10]))
    if (k.band === 1) s.add(rect(x, 63, w, 13))
    else if (k.band === 2) s.part(blob([mid, 86], [mid - 13, 72], [mid - 7, 64], [mid, 69], [mid + 7, 64], [mid + 13, 72]))
    s.add(ellipse(mid, 43, w / 2 + 1, 8))
    s.part(ellipse(mid, 43, w / 2 - 8, 4))
  }),
)


/* Shared helpers for turned and tapered shapes. */

/** A body symmetric about x = cx, `hw(y)` wide each side, from y0 down to y1 (sampled every unit). */
function turned(cx: number, y0: number, y1: number, hw: (y: number) => number): Ring {
  const n = Math.max(2, Math.round(y1 - y0))
  const right = Array.from({ length: n + 1 }, (_, i) => {
    const y = y0 + ((y1 - y0) * i) / n
    return pt(cx + hw(y), y)
  })
  return [...right, ...right.map((p) => pt(2 * cx - p.x, p.y)).reverse()]
}

/** Half-width of an ellipse at height y (0 outside it). */
const ellipseHalf = (cy: number, rx: number, ry: number) => (y: number) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2))

/** A thick line whose width runs from w0 at its start to w1 at its end, ends cut square. */
function taper(line: readonly Pt[], w0: number, w1: number): Ring {
  const n = line.length
  const lengths = [0]
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y))
  const total = lengths[n - 1] || 1
  const side = (sign: number) =>
    line.map((p, i) => {
      const a = line[Math.max(0, i - 1)]!
      const b = line[Math.min(n - 1, i + 1)]!
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const half = (w0 + ((w1 - w0) * lengths[i]!) / total) / 2
      return pt(p.x - (sign * (b.y - a.y) * half) / len, p.y + (sign * (b.x - a.x) * half) / len)
    })
  return [...side(1), ...side(-1).reverse()]
}

/** A five-petalled flower silhouette with round petals. */
const flower = (cx: number, cy: number, r: number): Ring =>
  blob(
    ...Array.from({ length: 5 }, (_, i) => {
      const a = i * 72 - 90
      const at = (deg: number, rr: number) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)] as const
      return [at(a - 20, r * 0.84), at(a - 9, r), at(a + 9, r), at(a + 20, r * 0.84), at(a + 36, r * 0.6)]
    }).flat(),
  )


/** The part of `ring` inside the convex ring `clip` (Sutherland-Hodgman). */
function clipConvex(ring: readonly Pt[], clip: readonly Pt[]): Ring {
  let area = 0
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    area += a.x * b.y - b.x * a.y
  }
  const sign = Math.sign(area)
  let out: Pt[] = [...ring]
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    const side = (p: Pt) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!
      const q = input[(j + 1) % input.length]!
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) out.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        out.push(pt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t))
      }
    }
  }
  return out
}

/** The run of a line that lies inside a circle, its ends exactly on the rim (for strands drawn across a ball). */
function insideCircle(line: readonly Pt[], cx: number, cy: number, r: number): Pt[] {
  const inside = (p: Pt) => Math.hypot(p.x - cx, p.y - cy) <= r
  const edge = (a: Pt, b: Pt) => {
    // a inside, b outside: bisect for the crossing.
    let lo = 0
    let hi = 1
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (inside(pt(a.x + (b.x - a.x) * mid, a.y + (b.y - a.y) * mid))) lo = mid
      else hi = mid
    }
    return pt(a.x + (b.x - a.x) * lo, a.y + (b.y - a.y) * lo)
  }
  const first = line.findIndex(inside)
  if (first < 0) return []
  let last = first
  while (last + 1 < line.length && inside(line[last + 1]!)) last++
  const run = line.slice(first, last + 1)
  if (first > 0) run.unshift(edge(line[first]!, line[first - 1]!))
  if (last + 1 < line.length) run.push(edge(line[last]!, line[last + 1]!))
  return run
}

/** A leaf from its base along `deg` (clockwise from 3 o'clock); `round` for a fuller, softer leaf. */
function leafSides(bx: number, by: number, deg: number, length: number, width: number, round: boolean): [Pt[], Pt[]] {
  const a = (deg * Math.PI) / 180
  const n = 40
  const at = (u: number, v: number) => pt(bx + u * Math.cos(a) - v * Math.sin(a), by + u * Math.sin(a) + v * Math.cos(a))
  const upper: Pt[] = []
  const lower: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const h = (width / 2) * (round ? Math.sqrt(Math.sin(Math.PI * t)) : Math.sin(Math.PI * t) ** 0.8)
    upper.push(at(t * length, -h))
    lower.push(at(t * length, h))
  }
  return [upper, lower]
}

const leaf = (bx: number, by: number, deg: number, length: number, width: number, round: boolean): Ring => {
  const [upper, lower] = leafSides(bx, by, deg, length, width, round)
  return [...upper, ...lower.slice(1, -1).reverse()]
}

/** One half of a leaf, split along its midrib. */
const halfLeaf = (bx: number, by: number, deg: number, length: number, width: number, round: boolean): Ring => {
  const [upper] = leafSides(bx, by, deg, length, width, round)
  return upper
}

const teacup = subject('teacup', 'Teacup and Saucer', 'home', 'indoor', 'none', { steam: 3, pattern: 3, shape: 2 }, (k) =>
  sketch((s) => {
    const cx = 50
    const top = k.shape === 1 ? 36 : 40
    const bot = 86
    const hw =
      k.shape === 1
        ? (y: number) => 31 - 11 * ((y - top) / (bot - top)) ** 2
        : (y: number) => 34 * Math.sqrt(1 - 0.72 * ((y - top) / (bot - top)) ** 2)
    // Steam rises from under the rim.
    const curls = k.steam === 0 ? [] : k.steam === 1 ? [cx] : [cx - 12, cx + 12]
    curls.forEach((x, i) => s.add(band(curve([x, top + 2], [x - 4, top - 9], [x, top - 19], [x + 4, top - 29], [x, i % 2 ? 4 : 0]), 10, true)))
    // Saucer, then the foot, then the handle, so the bowl covers their ends.
    s.add(ellipse(cx, 94, 50, 13))
    s.add(poly([36, 80], [64, 80], [70, 96], [30, 96]))
    const edge = (y: number) => cx + hw(y)
    s.add(band(curve([edge(top + 8) - 6, top + 8], [edge(top + 6) + 12, top + 5], [edge(top + 18) + 20, top + 18], [edge(top + 30) + 12, top + 31], [edge(top + 32) - 8, top + 32]), 10, true))
    s.add(turned(cx, top, bot, hw))
    if (k.pattern === 1) s.add(turned(cx, 59, 71, hw))
    else if (k.pattern === 2) s.part(flower(cx, 66, 12))
    s.add(ellipse(cx, top, hw(top) + 1, 8))
    s.part(ellipse(cx, top, hw(top) - 11, 4.5))
  }),
)

const teapot = subject('teapot', 'Teapot', 'home', 'indoor', 'none', { spout: 2, pattern: 3, body: 2 }, (k) =>
  sketch((s) => {
    const cx = 56
    const [rx, ry] = k.body === 1 ? [36, 24] : [32, 27]
    const cy = 87 - ry
    const top = cy - ry
    const half = ellipseHalf(cy, rx, ry)
    // Spout and handle first, so the body covers their roots.
    const spout = k.spout === 0 ? curve([48, cy + 8], [26, cy + 10], [11, cy - 2], [3, cy - 26]) : path([48, cy + 8], [2, cy - 24])
    s.add(taper(spout, 22, 12))
    const right = cx + rx
    s.add(band(curve([right - 12, cy - 13], [right + 10, cy - 15], [right + 20, cy + 1], [right + 10, cy + 17], [right - 14, cy + 16]), 10, true))
    s.add(poly([40, 80], [72, 80], [76, 97], [36, 97]))
    // The lid's dome, the body, the lid's rim resting on it, and the knob on top.
    s.add(ellipse(cx, top - 1, 19, 17))
    s.add(ellipse(cx, cy, rx, ry))
    if (k.pattern === 1) s.add(turned(cx, cy - 4, cy + 8, half))
    else if (k.pattern === 2) s.part(flower(cx, cy + 4, 13))
    s.add(ellipse(cx, top + 4, 21, 5))
    s.part(ellipse(cx, top - 19, 9, 6.5))
  }),
)

const bookAndGlasses = subject('book-and-glasses', 'Book and Glasses', 'home', 'indoor', 'none', { lens: 2, ribbon: 2, tilt: 2 }, (k) =>
  sketch((s) => {
    if (k.ribbon === 1) s.add(poly([43, 90], [57, 90], [57, 122], [50, 114], [43, 122]))
    // The cover shows as a margin round the open pages.
    s.add([...curve([0, 28], [26, 22], [50, 34], [74, 22], [100, 28]), ...curve([100, 96], [72, 92], [50, 100], [28, 92], [0, 96])])
    // Both pages as one sheet: the dips top and bottom mark the spine.
    s.add([...curve([10, 22], [30, 14], [50, 24]).slice(0, -1), ...curve([50, 24], [70, 14], [90, 22]), ...curve([90, 84], [70, 78], [50, 88]).slice(0, -1), ...curve([50, 88], [30, 78], [10, 84])])
    // Spine above the glasses; the bridge covers its lower end.
    s.stroke(path([50, 24], [50, 50]))
    // The glasses, straight or set down at a slant.
    const tilt = (ring: Ring) => (k.tilt === 1 ? rotate(ring, -9, 50, 52) : ring)
    const lens = (x: number) => (k.lens === 1 ? rect(x - 13, 45, 26, 23, 8) : circle(x, 56, 13))
    s.add(tilt(band(curve([38, 53], [50, 43], [62, 53]), 10)))
    s.add(tilt(lens(31)))
    s.add(tilt(lens(69)))
  }),
)


const houseplant = subject('houseplant', 'Houseplant', 'home', 'indoor', 'none', { leaf: 2, pot: 3, spread: 2 }, (k) =>
  sketch((s) => {
    const round = k.leaf === 1
    // Back leaves first, front leaves last; every base is buried under the pot's rim.
    const leaves: [number, number, number, number][] =
      k.spread === 1
        ? [
            [-110, 58, 30, -4],
            [-70, 58, 30, 4],
            [-150, 46, 28, -10],
            [-30, 46, 28, 10],
          ]
        : [
            [-90, 58, 26, 0],
            [-124, 50, 26, -6],
            [-56, 50, 26, 6],
            [-154, 42, 24, -10],
            [-26, 42, 24, 10],
          ]
    for (const [deg, len, wid, dx] of leaves) {
      s.add(leaf(50 + dx, 66, deg, len, wid, round))
      if (!round) s.add(halfLeaf(50 + dx, 66, deg, len, wid, round))
    }
    const hw =
      k.pot === 2
        ? (y: number) => 24 + 6 * Math.sin((Math.PI * (y - 64)) / 36) - 6 * ((y - 64) / 36)
        : (y: number) => 25 - (6 * (y - 64)) / 36
    s.add(turned(50, 64, 100, hw))
    if (k.pot === 1) s.add(rect(20, 94, 60, 12, [3, 6]))
    s.add(rect(20, 56, 60, 14, 4))
  }),
)

const yarnBasket = subject('yarn-basket', 'Yarn Basket', 'home', 'indoor', 'none', { balls: 2, needles: 2, basket: 2 }, (k) =>
  sketch((s) => {
    // A tapered basket or a round-bellied one.
    const hw = k.basket === 1 ? (y: number) => 44 * Math.sqrt(1 - 0.6 * ((y - 60) / 34) ** 2) : (y: number) => 40 - (6 * (y - 60)) / 36
    const bottom = k.basket === 1 ? 94 : 96
    // Needles stuck in the right-hand ball, their far ends capped with knobs.
    if (k.needles === 1) {
      const tips = k.balls === 1 ? [[44, 12, 22, -20], [56, 12, 78, -20]] : [[70, 40, 96, 6], [62, 40, 42, 4]]
      for (const [x1, y1, x2, y2] of tips) s.add(rod(x1!, y1!, x2!, y2!, 9))
      for (const [, , x2, y2] of tips) s.part(circle(x2!, y2!, 8))
    }
    // Balls of yarn, each wound with one strand.
    const balls: [number, number, number, number][] =
      k.balls === 1
        ? [
            [50, 16, 20, 0],
            [31, 44, 20, 150],
            [67, 44, 20, 30],
          ]
        : [
            [31, 43, 21, 150],
            [69, 42, 21, 30],
          ]
    for (const [cx, cy, r, deg] of balls) {
      s.add(circle(cx, cy, r, 48))
      // Two wound strands, arcs about a centre off to one side of the ball.
      const a = (deg * Math.PI) / 180
      const ox = cx + 1.6 * r * Math.cos(a)
      const oy = cy + 1.6 * r * Math.sin(a)
      for (const d of cy < 30 ? [-0.15] : [-0.32, 0.32]) {
        const R = 1.6 * r + d * r
        const arc = Array.from({ length: 121 }, (_, i) => {
          const t = a + Math.PI + ((i - 60) * Math.PI) / 180
          return pt(ox + R * Math.cos(t), oy + R * Math.sin(t))
        })
        s.stroke(insideCircle(arc, cx, cy, r))
      }
    }
    s.add(turned(50, 60, bottom, hw))
    s.add(turned(50, 76, 86, hw))
    s.add(rect(4, 52, 92, 14, 7))
  }),
)

const sleepingCat = subject('sleeping-cat', 'Sleeping Cat', 'home', 'indoor', 'none', { cushion: 3, coat: 3 }, (k) =>
  sketch((s) => {
    const cx = 60
    const cy = 58
    const rx = 38
    const ry = 22
    // A square cushion, a footstool on stubby legs, or an oval bed.
    if (k.cushion === 1) for (const x of [18, 78]) s.add(rect(x, 86, 16, 28, [0, 6]))
    s.add(k.cushion === 2 ? ellipse(56, 82, 56, 18) : rect(2, 64, 108, 34, 14))
    const body = ellipse(cx, cy, rx, ry, 0, 64)
    s.add(body)
    if (k.coat === 1)
      for (const x of [56, 75]) s.add(clipConvex(band(curve([x - 8, cy - 28], [x + 2, cy - 8], [x - 2, cy + 8]), 10), body))
    else if (k.coat === 2) s.add(clipConvex(blob([72, 32], [100, 44], [98, 62], [76, 58], [64, 44]), body))
    // Tail wrapped round the front, following the body's lower edge; the head covers its tip.
    const tail = Array.from({ length: 19 }, (_, i) => {
      const a = ((-12 + (i * 157) / 18) * Math.PI) / 180
      return pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
    })
    s.add(band(tail, 12, true))
    // Ears, then the head resting on its chin.
    const hx = 28
    const hy = 58
    s.add(poly([hx - 20, hy - 5], [hx - 17, hy - 35], [hx + 1, hy - 19]))
    s.add(poly([hx - 1, hy - 20], [hx + 17, hy - 34], [hx + 20, hy - 4]))
    s.part(circle(hx, hy, 19))
  }),
)


const vintageRadio = subject('vintage-radio', 'Vintage Radio', 'home', 'indoor', 'none', { cabinet: 2, grille: 3, dial: 2 }, (k) =>
  sketch((s) => {
    // Stubby feet under a rounded cabinet, or a domed one.
    for (const x of [14, 80]) s.add(rect(x, 76, 18, 22, [0, 6]))
    s.add(k.cabinet === 1 ? rect(0, -6, 112, 94, [44, 12]) : rect(0, 10, 112, 78, 16))
    // The speaker grille: slats, bars, or a round speaker.
    if (k.grille === 2) {
      s.add(circle(39, 50, 25))
      s.part(circle(39, 50, 11))
    } else {
      s.add(rect(12, 22, 54, 56, 12))
      if (k.grille === 0) for (const x of [24, 44]) s.add(rect(x, 32, 10, 36, 5))
      else for (const y of [33, 57]) s.add(rect(22, y, 34, 10, 5))
    }
    // Tuning dial and a knob, or a slide-rule window over two knobs.
    if (k.dial === 1) {
      s.part(wedge(89, 47, 14, 180, 360))
      s.part(circle(89, 68, 8))
    } else {
      s.part(circle(89, 36, 13))
      s.part(circle(89, 68, 8))
    }
  }),
)

const freshPie = subject('fresh-pie', 'Fresh-Baked Pie', 'home', 'indoor', 'none', { steam: 3, crimp: 2, plate: 2 }, (k) =>
  sketch((s) => {
    const cx = 58
    const cy = 60
    // Steam first, rising from behind the crust.
    const curls = k.steam === 0 ? [] : k.steam === 1 ? [cx - 14, cx + 14] : [cx - 24, cx, cx + 24]
    curls.forEach((x, i) => {
      const lift = i % 2 ? 0 : 4
      s.add(band(curve([x, cy - 30], [x - 4, cy - 40 - lift], [x + 1, cy - 50 - lift], [x + 3, cy - 59 - lift]), 10, true))
    })
    // A plate under the dish, then the dish, its top hidden under the crust.
    if (k.plate === 1) s.add(ellipse(cx, cy + 50, 56, 11))
    s.add(turned(cx, cy, cy + 50, (y) => 54 - (10 * (y - cy)) / 50))
    // Crust: crimped (scalloped) or a smooth rolled edge.
    const bumps = 16
    const crust =
      k.crimp === 1
        ? ellipse(cx, cy, 56, 38, 0, 72)
        : blob(
            ...Array.from({ length: bumps * 2 }, (_, i) => {
              const a = (i * Math.PI) / bumps
              const out = i % 2 === 0 ? 4 : 0
              return [cx + (53 + out) * Math.cos(a), cy + (37 + out) * Math.sin(a)] as const
            }),
          )
    s.add(crust)
    const filling = ellipse(cx, cy, 44, 28, 0, 72)
    s.add(filling)
    // The lattice: two pairs of strips crossing in a diamond, trimmed to the filling.
    // The side crossings sit well inside the filling and the top and bottom ones
    // just beyond it, so no strip leaves a stub.
    const p = 22
    const q = 30
    const strip = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1
      const dy = y2 - y1
      const line = path([cx + x1 - dx, cy + y1 - dy], [cx + x2 + dx, cy + y2 + dy])
      s.add(clipConvex(band(line, 10), filling))
    }
    strip(-p, 0, 0, -q)
    strip(p, 0, 0, q)
    strip(-p, 0, 0, q)
    strip(p, 0, 0, -q)
  }),
)

export const HOME_SUBJECTS: readonly SgSubject[] = [
  rockingChair,
  coffeeMug,
  teacup,
  teapot,
  bookAndGlasses,
  houseplant,
  yarnBasket,
  sleepingCat,
  vintageRadio,
  freshPie,
]
