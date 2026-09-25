import { subject, type SgSubject } from './catalog'
import { arcBand, band, blob, circle, curve, ellipse, flipX, move, path, poly, rect, rod, rotate, sketch, type Sketch } from './subject-kit'
import { arcPoints, pt, type Pt, type Ring } from './geometry'

/**
 * The garden and the outdoors: tools, blooms, birds and sunshine.
 *
 * Drawn to the rules in `subject-kit.ts`; every version of every subject here
 * is rendered alone at the smallest print size by the tests and must leave no
 * piece too small to color.
 */

const wateringCan = subject('watering-can', 'Watering Can', 'garden', 'outdoor', 'grass', { body: 2, rose: 2, handle: 2 }, (k) =>
  sketch((s) => {
    const top = k.body === 1 ? 36 : 44
    // Spout from low on the body, then its rose over the spout's end.
    s.add(band(path([54, 80], [87, 40]), 10))
    if (k.rose === 1) s.add(rotate(rect(83, 20, 16, 22, 5), 40, 91, 31))
    else s.add(ellipse(91, 34, 8, 13, 40))
    // Handle; the body covers its ends.
    if (k.handle === 1) s.add(band(curve([22, top + 12], [20, top - 22], [44, top - 28], [54, top + 12]), 9, true))
    else s.add(band(curve([20, top + 14], [2, top + 12], [-10, top + 26], [2, top + 42], [20, top + 46]), 9, true))
    s.add(rect(8, top, 60, 96 - top, [0, 9]))
    s.add(rect(8, 70, 60, 10))
    s.add(ellipse(38, top, 31, 7))
  }),
)

/** A daisy: `n` round petals about a centre that is never subdivided. */
function daisy(s: Sketch, cx: number, cy: number, r: number, n: number, turn = -90) {
  const len = r * 0.4
  const d = r - len
  for (let i = 0; i < n; i++) {
    const a = turn + (360 / n) * i
    const rad = (a * Math.PI) / 180
    s.add(ellipse(cx + d * Math.cos(rad), cy + d * Math.sin(rad), len, r * 0.35, a, 32))
  }
  s.part(circle(cx, cy, r * 0.43))
}

/** A petal with a round base at (cx, cy) and a pointed tip `h` above it, leaning `rot` degrees. */
function petal(cx: number, cy: number, w: number, h: number, rot = 0): Ring {
  const half = w / 2
  const side = (sgn: number) =>
    Array.from({ length: 10 }, (_, i) => {
      const t = (i + 1) / 10
      return pt(cx + sgn * half * Math.pow(Math.cos((t * Math.PI) / 2), 0.7), cy - h * t)
    })
  const left = side(-1)
  const right = side(1).reverse().slice(1)
  const ring = [...arcPoints(cx, cy, half, 0, 180, 12), ...left, ...right]
  return rotate(ring, rot, cx, cy)
}

/** A tulip whose cup bottom sits near (cx, cy): a tall back petal between two leaning ones. */
function tulip(s: Sketch, cx: number, cy: number) {
  s.add(petal(cx, cy - 12, 20, 30))
  s.add(petal(cx - 6, cy - 8, 19, 22, -20))
  s.add(petal(cx + 6, cy - 8, 19, 22, 20))
}

/** A leaf from its base to its tip, `w` across: an oval, or pointed at both ends. */
function leaf(x1: number, y1: number, x2: number, y2: number, w: number, pointed: boolean): Ring {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  if (!pointed) return ellipse(cx, cy, len / 2, w / 2, deg)
  const side = (sgn: number) =>
    Array.from({ length: 13 }, (_, i) => {
      const t = i / 12
      return pt(cx - len / 2 + len * t, cy + sgn * (w / 2) * Math.pow(Math.sin(Math.PI * t), 0.75))
    })
  const ring = [...side(-1), ...side(1).reverse().slice(1, -1)]
  return rotate(ring, deg, cx, cy)
}

const flowerPot = subject('flower-pot', 'Potted Flowers', 'garden', 'outdoor', 'grass', { bloom: 3, leaves: 2, pot: 2 }, (k) =>
  sketch((s) => {
    // Bloom heads: a pair of tulips, a pair of daisies, or a daisy beside a tulip.
    type Head = { x: number; y: number; base: number; kind: 'tulip' | 'daisy' }
    const heads: Head[] =
      k.bloom === 0
        ? [{ x: 27, y: 44, base: 38, kind: 'tulip' }, { x: 73, y: 52, base: 62, kind: 'tulip' }]
        : k.bloom === 1
          ? [{ x: 25, y: 22, base: 38, kind: 'daisy' }, { x: 75, y: 33, base: 62, kind: 'daisy' }]
          : [{ x: 26, y: 22, base: 38, kind: 'daisy' }, { x: 74, y: 44, base: 62, kind: 'tulip' }]
    // Stems rise from inside the pot; blooms and the rim cover their ends.
    for (const h of heads) {
      const top = h.kind === 'tulip' ? h.y - 10 : h.y
      s.add(band(curve([h.base, 84], [h.base + (h.x - h.base) * 0.4, 64], [h.x, top]), 10))
    }
    // Leaves spring from under the rim and cross the outer stems.
    const pointed = k.leaves === 1
    const inner = Math.min(...heads.map((h) => h.base))
    s.add(leaf(inner, 82, 2, 64, 14, pointed))
    s.add(leaf(100 - inner, 82, 98, 64, 14, pointed))
    for (const h of heads) {
      if (h.kind === 'daisy') daisy(s, h.x, h.y, 21, 6, (Math.atan2(84 - h.y, h.base - h.x) * 180) / Math.PI + 30)
      else tulip(s, h.x, h.y)
    }
    if (k.pot === 1) s.add(rect(22, 80, 56, 26, [0, 18]))
    else s.add(poly([22, 80], [78, 80], [70, 106], [30, 106]))
    s.add(rect(16, 72, 68, 13, 4))
  }),
)

const birdhouse = subject('birdhouse', 'Birdhouse', 'garden', 'outdoor', 'grass', { roof: 3, walls: 2, base: 2 }, (k) =>
  sketch((s) => {
    const b = k.walls === 1 ? 88 : 80
    // Post first: the house covers its top.
    s.add(rect(43, b - 10, 14, 32))
    // A gabled house, or (roof 2) an arched one.
    if (k.roof === 2) s.add([...arcPoints(50, 40, 28, 180, 360), pt(78, b), pt(22, b)])
    else s.add(poly([22, 36], [50, 12], [78, 36], [78, b], [22, b]))
    if (k.roof === 0) {
      s.add(rod(12, 42, 50, 8, 13))
      s.add(rod(50, 8, 88, 42, 13))
    } else if (k.roof === 1) {
      s.add(poly([8, 44], [50, 4], [92, 44], [80, 44], [50, 18], [20, 44]))
    } else {
      s.add(arcBand(50, 40, 40, 25, 180, 360))
    }
    if (k.base === 1) s.add(rect(15, b - 2, 70, 11, 3))
    // The round door, and the perch peg overlapping its lower edge.
    s.part(circle(50, 46, 11))
    s.part(circle(50, 60, 6))
  }),
)

/** Place a ring drawn about the origin: turned `deg` clockwise, then moved to (x, y). */
const place = (ring: Ring, deg: number, x: number, y: number): Ring => move(rotate(ring, deg, 0, 0), x, y)

const gardenTools = subject('garden-tools', 'Garden Tools', 'garden', 'outdoor', 'grass', { layout: 2, blade: 2, collar: 2 }, (k) =>
  sketch((s) => {
    // Each tool is drawn upright about its own axis, blade up, handle end at y = 104;
    // the handle (and its collar) covers the bottom of the blade.
    const handle = (top: number): Ring[] => {
      const parts: Ring[] = [rect(-9, top, 18, 104 - top, 9)]
      if (k.collar === 1) parts.push(rect(-12, top, 24, 13, 4))
      return parts
    }
    const fork = (): Ring[] => [
      ...[-20, 0, 20].map((x) => rect(x - 5, 4, 10, 42, [5, 0])),
      poly([-30, 40], [30, 40], [11, 66], [-11, 66]),
      ...handle(58),
    ]
    const trowel = (): Ring[] => [k.blade === 1 ? rect(-18, 0, 36, 62, [18, 12]) : petal(0, 42, 36, 42), ...handle(54)]
    if (k.layout === 1) {
      // Side by side, standing up.
      for (const r of fork()) s.add(move(r, 30, 0))
      for (const r of trowel()) s.add(move(r, 91, 0))
    } else {
      // Fanned out from the handles, the trowel's handle over the fork's end.
      for (const r of fork()) s.add(place(move(r, 0, -97), -24, 50, 90))
      for (const r of trowel()) s.add(place(move(r, 0, -78), 24, 50, 90))
    }
  }),
)

const wheelbarrow = subject('wheelbarrow', 'Wheelbarrow', 'garden', 'outdoor', 'grass', { load: 3, grips: 2, wheel: 2 }, (k) =>
  sketch((s) => {
    // The frame arm runs from the wheel's hub back to the handle; the wheel
    // and the tray hide all of it but the handle.
    s.add(band(path([80, 78], [70, 58], [0, 58]), 10, true))
    if (k.grips === 1) s.add(rod(-2, 58, 28, 58, 14))
    // What it carries sits behind the tray's front wall.
    if (k.load === 1) {
      s.part(rect(43, -5, 14, 16, 4))
      s.add(ellipse(50, 26, 26, 17))
      s.add(ellipse(50, 26, 11, 17))
    } else if (k.load === 2) {
      // Short stems fill the notch under each cup.
      s.add(band(path([26, 40], [26, 22]), 10))
      s.add(band(path([72, 40], [72, 22]), 10))
      tulip(s, 26, 30)
      tulip(s, 72, 30)
    }
    s.add(rod(33, 60, 31, 94, 10))
    s.add(poly([8, 34], [96, 34], [74, 67], [30, 67]))
    s.add(rect(4, 29, 96, 11, 5))
    const r = k.wheel === 1 ? 20 : 18
    s.add(circle(80, 96 - r, r))
    s.part(circle(80, 96 - r, k.wheel === 1 ? 9 : 7.5))
  }),
)

const sunflower = subject('sunflower', 'Sunflower', 'garden', 'outdoor', 'grass', { petals: 2, disk: 2, leaves: 2 }, (k) =>
  sketch((s) => {
    const cx = 50
    const cy = 38
    // Leaves first, their bases under the stem; the bloom covers the stem's top.
    const pointed = k.leaves === 1
    s.add(leaf(cx, 102, 6, 86, 20, pointed))
    s.add(leaf(cx, 98, 94, 84, 20, pointed))
    s.add(band(curve([cx, cy], [cx + 3, 74], [cx, 112]), 12))
    // Petals radiate from under the seed disk.
    const n = k.petals === 1 ? 10 : 13
    for (let i = 0; i < n; i++) {
      // A notch between two petals (not a petal) sits over the stem.
      const a = 90 + (360 / n) * (i + 0.5)
      const rad = (a * Math.PI) / 180
      s.add(petal(cx + 14 * Math.cos(rad), cy + 14 * Math.sin(rad), k.petals === 1 ? 17 : 14, 24, a + 90))
    }
    s.add(circle(cx, cy, 21))
    if (k.disk === 1) s.part(circle(cx, cy, 10))
  }),
)

const butterfly = subject('butterfly', 'Butterfly', 'garden', 'outdoor', 'none', { wings: 2, spots: 2, antennae: 2 }, (k) =>
  sketch((s) => {
    // Left wings are drawn once and mirrored; the body covers their roots.
    const upper =
      k.wings === 1
        ? blob([47, 44], [44, 22], [20, 6], [0, 2], [4, 24], [14, 46], [32, 56])
        : blob([47, 44], [44, 22], [18, 6], [4, 12], [2, 32], [12, 50], [32, 56])
    const lower = blob([47, 46], [30, 48], [12, 62], [10, 84], [24, 96], [42, 90], [54, 74])
    const both = (ring: Ring) => [ring, flipX(ring, 50)]
    // Antennae first: the head covers their roots.
    const feeler: Pt[] = k.antennae === 1 ? path([48, 20], [36, -2]) : curve([48, 20], [44, 6], [34, -2])
    for (const r of both(band(feeler, 9, true))) s.add(r)
    for (const r of [...both(lower), ...both(upper)]) s.add(r)
    if (k.spots === 1) {
      for (const r of both(ellipse(22, 28, 10, 6, 35))) s.part(r)
      for (const r of both(ellipse(27, 76, 7, 6))) s.part(r)
    } else {
      for (const r of both(circle(21, 29, 7.5))) s.part(r)
      for (const r of both(circle(27, 77, 6.5))) s.part(r)
    }
    s.add(rect(43, 30, 14, 66, 7))
    s.part(circle(50, 24, 9))
  }),
)

const songbird = subject('songbird', 'Songbird', 'garden', 'outdoor', 'none', { wing: 2, tail: 2, leaves: 2 }, (k) =>
  sketch((s) => {
    // Tail first, behind the body: a plain wedge or a forked one.
    if (k.tail === 1) s.add(poly([30, 52], [0, 40], [10, 52], [0, 64], [28, 68]))
    else s.add(poly([30, 52], [2, 38], [4, 54], [28, 68]))
    // Leaves hang from under the branch.
    const leaves: [number, number, number, number][] = [
      [30, 90, 14, 116],
      [78, 84, 96, 108],
    ]
    if (k.leaves === 1) leaves.push([54, 88, 56, 116])
    for (const [x1, y1, x2, y2] of leaves) s.add(leaf(x1, y1, x2, y2, 17, true))
    s.add(band(curve([2, 93], [50, 89], [100, 80]), 11, true))
    // The bird sits on the branch: body, wing, head.
    s.add(ellipse(46, 62, 30, 23))
    if (k.wing === 1) s.add(blob([58, 57], [40, 53], [26, 62], [36, 73], [56, 70]))
    else s.add(ellipse(42, 64, 16, 9, -10))
    s.add(circle(66, 36, 19))
    s.part(poly([80, 26], [102, 37], [80, 48]))
    s.part(circle(67, 35, 8))
  }),
)

const picnicBasket = subject('picnic-basket', 'Picnic Basket', 'garden', 'outdoor', 'grass', { lid: 2, weave: 2, handle: 2 }, (k) =>
  sketch((s) => {
    // Handle arch first: the basket and lid cover its feet.
    s.add(arcBand(50, 50, 35, 25, 180, 360))
    if (k.handle === 1) s.part(rect(40, 10, 20, 15, 5))
    s.add(rect(8, 50, 84, 46, [0, 10]))
    // Weave, lined up with the cloth's checks.
    if (k.weave === 1) for (const x of [24, 52]) s.add(rect(x, 50, 14, 46))
    else s.add(rect(8, 68, 84, 14))
    // A checked cloth hangs over the front from under the lid, its corner pointing down.
    s.part(rect(52, 46, 14, 22))
    s.part(rect(66, 46, 14, 22))
    s.part(poly([52, 68], [66, 68], [66, 86], [52, 79]))
    s.part(poly([66, 68], [80, 68], [80, 79], [66, 86]))
    if (k.lid === 1) {
      s.add(rect(4, 42, 92, 12, 4))
    } else {
      s.add(rect(4, 42, 48, 12, 4))
      s.add(rect(48, 42, 48, 12, 4))
    }
  }),
)

export const GARDEN_SUBJECTS: readonly SgSubject[] = [wateringCan, flowerPot, birdhouse, gardenTools, wheelbarrow, sunflower, butterfly, songbird, picnicBasket]
