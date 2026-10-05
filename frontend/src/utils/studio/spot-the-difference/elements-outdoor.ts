import { subject, type SgSubject } from '../stained-glass/catalog'
import { arcBand, band, blob, circle, curve, ellipse, path, poly, rect, rod, rotate, sketch, type Sketch } from '../stained-glass/subject-kit'
import { pt, type Pt, type Ring } from '../stained-glass/geometry'
import { flowerHead, leaf, scallopRing, sliceY, type XY } from './element-kit'

/**
 * More of the outdoors for Spot the Differences: a vegetable patch (raised
 * beds, a scarecrow, pumpkins, a crate of apples, tools in the soil), a
 * garden's rose arch and bird feeder, a washing line, a picnic table, the
 * seaside's palm, beach hut, shells and crab, and a lakeside canoe.
 *
 * The same rules as `elements.ts`: plain geometry stacked back to front,
 * generic things with no text, logos or brands, nothing traced. Every knob
 * is a change a reader can name, and none moves the thing's foot.
 */

/* ------------------------------------------------------------------ *
 * Small shared shapes
 * ------------------------------------------------------------------ */

/**
 * A long leaf that bends as it goes (a palm frond, a carrot top): from
 * (x, y) at `deg` (clockwise from 3 o'clock), `len` long, `width` at its
 * widest, drooping by `droop` at the tip. Returns the outline and its midrib.
 */
function frond(x: number, y: number, deg: number, len: number, width: number, droop: number): { ring: Ring; rib: Pt[] } {
  const a = (deg * Math.PI) / 180
  const n = 16
  const mid = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    return pt(x + Math.cos(a) * len * t, y + Math.sin(a) * len * t + droop * t * t)
  })
  const side = (sign: number) =>
    mid.map((p, i) => {
      const q = mid[Math.min(n, i + 1)]!
      const o = mid[Math.max(0, i - 1)]!
      const dx = q.x - o.x
      const dy = q.y - o.y
      const d = Math.hypot(dx, dy) || 1
      const w = (sign * width * Math.sin(Math.PI * (i / n)) ** 0.7) / 2
      return pt(p.x - (dy / d) * w, p.y + (dx / d) * w)
    })
  return { ring: [...side(1), ...side(-1).reverse().slice(1, -1)], rib: mid.slice(0, n - 1) }
}

/** A small perched bird facing left, its feet at (x, y). */
function perchedBird(s: Sketch, x: number, y: number, size: number) {
  const f = size / 20
  const at = (dx: number, dy: number): XY => [x + dx * f, y + dy * f]
  s.add(poly(at(8, -8), at(20, -4), at(18, -1), at(8, -4)))
  s.add(blob(at(-6, -10), at(2, -15), at(10, -10), at(8, -3), at(-2, 0), at(-7, -4)))
  s.add(circle(x - 6 * f, y - 15 * f, 5.5 * f))
  s.add(poly(at(-11, -16), at(-16, -14.5), at(-11, -13)))
  s.part(circle(x - 7 * f, y - 16 * f, 1.2 * f, 12))
}

/** A five-armed star with round tips, `r` to its arm tips. */
function starfish(cx: number, cy: number, r: number): Ring {
  const pts: XY[] = []
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.45
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
  }
  return blob(...pts)
}

/** A ribbed pumpkin standing on `foot`, `r` across from its middle. */
function pumpkin(s: Sketch, cx: number, foot: number, r: number) {
  const cy = foot - r * 0.78
  s.add(band(curve([cx, cy - r * 0.6], [cx + r * 0.08, cy - r * 0.9], [cx + r * 0.3, cy - r * 1.02]), r * 0.18))
  s.add(ellipse(cx - r * 0.45, cy, r * 0.55, r * 0.76))
  s.add(ellipse(cx + r * 0.45, cy, r * 0.55, r * 0.76))
  s.add(ellipse(cx, cy, r * 0.5, r * 0.78))
}

/* ------------------------------------------------------------------ *
 * Garden and vegetable patch
 * ------------------------------------------------------------------ */

const roseArch = subject('sd-arch', 'Rose Arch', 'garden', 'outdoor', 'grass', { roses: 3, gate: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(4, 54, 12, 106, 1))
    s.add(rect(104, 54, 12, 106, 1))
    s.add(arcBand(60, 58, 56, 44, 180, 360))
    s.add(rect(0, 54, 20, 8, 2))
    s.add(rect(100, 54, 20, 8, 2))
    // Roses climbing the arch: a few, or all the way round.
    const spots = k.roses === 1 ? [200, 270, 340] : k.roses === 2 ? [190, 222, 254, 286, 318, 350] : []
    for (const deg of spots) {
      const a = (deg * Math.PI) / 180
      const x = 60 + 50 * Math.cos(a)
      const y = 58 + 50 * Math.sin(a)
      s.add(leaf(x, y, x + 10 * Math.cos(a + 1.2), y + 10 * Math.sin(a + 1.2), 6))
      s.add(flowerHead(x, y, 8, deg))
      s.part(circle(x, y, 2.6))
    }
    // A low picket gate between the posts.
    if (k.gate === 1) {
      s.add(rect(18, 124, 84, 5))
      s.add(rect(18, 146, 84, 5))
      for (let x = 21; x < 100; x += 13) s.add(poly([x, 160], [x, 120], [x + 4.5, 114], [x + 9, 120], [x + 9, 160]))
    }
  }),
)

const feeder = subject('sd-feeder', 'Bird Feeder', 'garden', 'outdoor', 'grass', { roof: 2, bird: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(26, 58, 8, 92))
    s.add(rect(12, 28, 36, 26, 1))
    s.add(rect(20, 36, 20, 14, [10, 0]))
    s.add(k.roof === 1 ? rect(2, 16, 56, 14, [7, 1]) : poly([0, 32], [30, 6], [60, 32]))
    s.add(rect(4, 52, 52, 7, 2))
    if (k.bird === 1) perchedBird(s, 12, 52, 20)
  }),
)

const vegBed = subject('sd-veg-bed', 'Vegetable Bed', 'garden', 'outdoor', 'grass', { crop: 3 }, (k) =>
  sketch((s) => {
    if (k.crop === 0) {
      // Cabbages: round heads with a leaf curling over.
      for (const x of [22, 56, 90, 124] as const) {
        s.add(circle(x, 26, 15))
        s.stroke(curve([x - 9, 20], [x - 2, 14], [x + 8, 18]))
        s.stroke(curve([x - 10, 30], [x - 2, 24], [x + 6, 26]))
      }
    } else if (k.crop === 1) {
      // Carrot tops: feathery leaves in rows.
      for (const x of [16, 38, 60, 82, 104, 126] as const) {
        for (const deg of [-125, -90, -55]) {
          const f = frond(x, 32, deg, 22, 7, 0)
          s.add(f.ring)
        }
        s.add(sliceY(ellipse(x, 32, 6, 6), 26, 32))
      }
    } else {
      // Tomatoes on canes.
      for (const x of [24, 70, 116] as const) {
        s.add(rod(x, -2, x, 32, 3))
        for (const [dx, dy] of [
          [-10, 8],
          [10, 16],
          [-9, 24],
        ] as const)
          s.add(leaf(x, dy, x + dx * 1.4, dy - 6, 6))
        for (const [dx, dy] of [
          [7, 6],
          [-6, 16],
          [6, 25],
        ] as const)
          s.add(circle(x + dx, dy, 5))
      }
    }
    s.add(rect(0, 30, 140, 15, 1))
    s.add(rect(0, 44, 140, 16, 1))
    s.add(rect(-3, 28, 8, 32, 1))
    s.add(rect(135, 28, 8, 32, 1))
  }),
)

const pumpkins = subject('sd-pumpkins', 'Pumpkins', 'garden', 'outdoor', 'grass', { count: 2, vine: 2 }, (k) =>
  sketch((s) => {
    pumpkin(s, 34, 64, 30)
    // A leaf and a curling tendril on the ground in front.
    if (k.vine === 1) {
      s.add(leaf(30, 62, 4, 50, 16))
      s.stroke(curve([30, 62], [44, 58], [50, 50], [44, 46], [40, 52]))
    }
    if (k.count === 1) pumpkin(s, 80, 64, 19)
  }),
)

const scarecrow = subject('sd-scarecrow', 'Scarecrow', 'garden', 'outdoor', 'grass', { hat: 2, patch: 2, crow: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(37, 60, 6, 100))
    // Straw at the cuffs, then the shirt with its arms out along the cross bar.
    for (const [x, dir] of [
      [6, -1],
      [74, 1],
    ] as const)
      s.add(poly([x, 56], [x + dir * 10, 50], [x + dir * 7, 58], [x + dir * 11, 64], [x, 66]))
    s.add(poly([6, 54], [30, 48], [50, 48], [74, 54], [74, 68], [54, 66], [56, 110], [24, 110], [26, 66], [6, 68]))
    if (k.patch === 1) s.add(rect(30, 78, 12, 12, 1))
    for (const y of [60, 72, 84, 96]) s.part(circle(40, y, 1.8, 12))
    s.add(circle(40, 36, 14))
    for (const x of [35, 45]) s.part(circle(x, 34, 2, 12))
    s.stroke(path([33, 41], [35, 43], [37, 41.5], [40, 43.5], [43, 41.5], [45, 43], [47, 41]))
    // A wide straw hat, or a tuft of straw.
    if (k.hat === 1) {
      s.add(rect(28, 12, 24, 14, [8, 0]))
      s.add(ellipse(40, 25, 24, 4.5))
    } else s.add(poly([30, 26], [32, 16], [36, 23], [40, 13], [44, 23], [48, 16], [50, 26]))
    if (k.crow === 1) perchedBird(s, 66, 49, 18)
  }),
)

const snail = subject('sd-snail', 'Snail', 'garden', 'outdoor', 'grass', { shell: 2 }, (k) =>
  sketch((s) => {
    for (const [x0, x1] of [
      [8, 2],
      [14, 12],
    ] as const) {
      s.stroke(curve([x0 + 2, 26], [x0, 16], [x1, 8]))
      s.part(circle(x1, 7, 2.2, 12))
    }
    s.add(blob([4, 34], [6, 22], [14, 18], [22, 26], [30, 34], [64, 34], [70, 40], [8, 40]))
    s.add(circle(44, 22, 18))
    if (k.shell === 1) {
      // A spiral.
      const spiral = Array.from({ length: 60 }, (_, i) => {
        const t = (i / 59) * Math.PI * 3.6
        const r = 2 + t * 1.3
        return pt(44 + r * Math.cos(t + 2), 22 + r * Math.sin(t + 2))
      })
      s.stroke(spiral)
    } else {
      s.add(circle(44, 22, 11))
      s.add(circle(44, 22, 4.5))
    }
  }),
)

const tools = subject('sd-tools', 'Garden Tools', 'garden', 'outdoor', 'grass', { pair: 3 }, (k) =>
  sketch((s) => {
    const spade = (x: number, lean: number) => {
      const r = (ring: Ring) => s.add(rotate(ring, lean, x, 130))
      r(rect(x - 3, 20, 6, 96))
      r(rect(x - 9, 10, 18, 12, 4))
      r(rect(x - 5, 14, 10, 6, 2))
      r(rect(x - 10, 112, 20, 26, [2, 6]))
    }
    const fork = (x: number, lean: number) => {
      const r = (ring: Ring) => s.add(rotate(ring, lean, x, 130))
      r(rect(x - 3, 20, 6, 92))
      r(rect(x - 9, 10, 18, 12, 4))
      r(rect(x - 5, 14, 10, 6, 2))
      for (const dx of [-9, -3, 3, 9]) r(rod(x + dx, 116, x + dx, 138, 3.5))
      r(rect(x - 11, 110, 22, 7, 2))
    }
    const rake = (x: number, lean: number) => {
      const r = (ring: Ring) => s.add(rotate(ring, lean, x, 130))
      r(rod(x, 18, x, 136, 6))
      for (let dx = -14; dx <= 14; dx += 7) r(rod(x + dx, 18, x + dx, 28, 3))
      r(rect(x - 17, 12, 34, 7, 2))
    }
    const [a, b] = [
      [spade, fork],
      [spade, rake],
      [rake, fork],
    ][k.pair] ?? [spade, fork]
    a!(26, -8)
    b!(56, 9)
    s.add(sliceY(ellipse(40, 140, 40, 12), 130, 140))
  }),
)

/** A shirt, a towel, a pair of socks… hung from the line at x, its top at y. */
const WASH: Record<string, (s: Sketch, x: number, y: number) => number> = {
  shirt: (s, x, y) => {
    s.add(poly([x, y], [x + 12, y - 1], [x + 15, y + 4], [x + 21, y - 1], [x + 33, y], [x + 40, y + 12], [x + 32, y + 18], [x + 30, y + 14], [x + 30, y + 44], [x + 6, y + 44], [x + 6, y + 14], [x + 4, y + 18], [x - 4, y + 12]))
    return 36
  },
  towel: (s, x, y) => {
    s.add(rect(x, y, 30, 44, [1, 2]))
    s.add(rect(x, y + 32, 30, 5))
    return 30
  },
  socks: (s, x, y) => {
    for (const dx of [0, 13]) s.add(poly([x + dx, y], [x + dx + 9, y], [x + dx + 9, y + 20], [x + dx + 14, y + 26], [x + dx + 10, y + 30], [x + dx, y + 24]))
    return 26
  },
  dress: (s, x, y) => {
    s.add(poly([x + 8, y], [x + 22, y], [x + 22, y + 12], [x + 32, y + 46], [x - 2, y + 46], [x + 8, y + 12]))
    return 30
  },
}

const WASH_SETS: readonly (readonly string[])[] = [
  ['shirt', 'towel', 'socks'],
  ['towel', 'dress', 'shirt'],
  ['shirt', 'socks', 'dress', 'towel'],
]

const washingLine = subject('sd-washing', 'Washing Line', 'garden', 'outdoor', 'grass', { wash: 3 }, (k) =>
  sketch((s) => {
    const sag = (x: number) => 26 + 12 * Math.sin((Math.PI * (x - 8)) / 184)
    s.stroke(Array.from({ length: 33 }, (_, i) => pt(8 + (184 * i) / 32, sag(8 + (184 * i) / 32))))
    for (const x of [4, 188]) {
      s.add(rect(x, 22, 8, 98))
      s.add(rect(x - 10, 18, 28, 7, 2))
    }
    const set = WASH_SETS[k.wash] ?? WASH_SETS[0]!
    const widths = set.map((name) => ({ shirt: 36, towel: 30, socks: 26, dress: 30 })[name] ?? 30)
    const free = 160 - widths.reduce((t, w) => t + w, 0)
    let x = 20 + free / (set.length + 1)
    set.forEach((name, i) => {
      const y = sag(x + widths[i]! / 2)
      WASH[name]!(s, x, y - 1)
      s.add(rect(x + widths[i]! / 2 - 2, y - 4, 4, 8, 1))
      x += widths[i]! + free / (set.length + 1)
    })
  }),
)

const picnicTable = subject('sd-picnic-table', 'Picnic Table', 'garden', 'outdoor', 'grass', { cloth: 2, bench: 2 }, (k) =>
  sketch((s) => {
    for (const x of [34, 126]) {
      s.add(rod(x, 6, x - 18, 66, 7))
      s.add(rod(x, 6, x + 18, 66, 7))
    }
    s.add(rect(0, 0, 160, 9, 2))
    if (k.cloth === 1) s.add(scallopRing(-3, 163, -1, 16, 8, 6))
    if (k.bench === 1) {
      s.add(rect(-8, 40, 176, 7, 2))
      s.add(rect(4, 46, 6, 24))
      s.add(rect(150, 46, 6, 24))
    }
  }),
)

const crate = subject('sd-crate', 'Crate of Fruit', 'garden', 'outdoor', 'grass', { fruit: 2, grip: 2 }, (k) =>
  sketch((s) => {
    if (k.fruit === 0) {
      for (const [x, y] of [
        [16, 18],
        [34, 14],
        [52, 15],
        [68, 19],
        [25, 8],
        [44, 5],
        [60, 9],
      ] as const)
        s.add(circle(x, y + 4, 9))
    } else {
      // Pears, stalks up.
      for (const [x, y] of [
        [16, 22],
        [40, 20],
        [64, 22],
        [28, 12],
        [52, 12],
      ] as const) {
        s.stroke(path([x, y - 17], [x + 2, y - 23]))
        s.add(blob([x, y - 20], [x + 5, y - 12], [x + 10, y], [x, y + 6], [x - 10, y], [x - 5, y - 12]))
      }
    }
    for (const y of [20, 32, 44]) s.add(rect(0, y, 80, 12, 1))
    if (k.grip === 1) s.add(rect(30, 23, 20, 6, 3))
    s.add(rect(0, 20, 6, 36))
    s.add(rect(74, 20, 6, 36))
  }),
)

/* ------------------------------------------------------------------ *
 * The seaside
 * ------------------------------------------------------------------ */

const palm = subject('sd-palm', 'Palm Tree', 'travel', 'outdoor', 'sand', { fronds: 2, coconuts: 2 }, (k) =>
  sketch((s) => {
    const trunk = curve([52, 160], [54, 120], [62, 80], [74, 44])
    s.add(band(trunk, 13, true))
    for (let i = 3; i < trunk.length - 2; i += 3) {
      const p = trunk[i]!
      const q = trunk[i + 1]!
      const d = Math.hypot(q.x - p.x, q.y - p.y) || 1
      const nx = -(q.y - p.y) / d
      const ny = (q.x - p.x) / d
      s.stroke(curve([p.x - nx * 6, p.y - ny * 6], [p.x + ((q.x - p.x) / d) * 2.5, p.y + ((q.y - p.y) / d) * 2.5], [p.x + nx * 6, p.y + ny * 6]))
    }
    if (k.coconuts === 1)
      for (const [x, y] of [
        [68, 50],
        [80, 52],
        [74, 58],
      ] as const)
        s.add(circle(x, y, 6))
    const fans: readonly (readonly [number, number, number])[] =
      k.fronds === 1
        ? [
            [-150, 52, 34],
            [-115, 44, 14],
            [-65, 44, 14],
            [-30, 52, 34],
            [-175, 50, 40],
            [-5, 50, 40],
            [-90, 40, 6],
          ]
        : [
            [-140, 54, 34],
            [-40, 54, 34],
            [-175, 50, 42],
            [-5, 50, 42],
            [-90, 42, 8],
          ]
    for (const [deg, len, droop] of fans) {
      const f = frond(74, 42, deg, len * 1.3, 18, droop * 1.3)
      s.add(f.ring)
      s.stroke(f.rib)
    }
  }),
)

const beachHut = subject('sd-beach-hut', 'Beach Hut', 'travel', 'outdoor', 'sand', { stripes: 2, flag: 2, window: 2 }, (k) =>
  sketch((s) => {
    if (k.flag === 1) {
      s.stroke(path([40, 12], [40, -14]))
      s.add(poly([40, -14], [56, -9], [40, -4]))
    }
    s.add(rect(10, 110, 6, 10))
    s.add(rect(64, 110, 6, 10))
    s.add(rect(6, 40, 68, 74, 1))
    if (k.stripes === 1) for (let x = 14; x < 70; x += 16) s.add(rect(x, 40, 8, 74))
    s.add(poly([-2, 46], [40, 8], [82, 46], [76, 48], [40, 16], [4, 48]))
    s.add(poly([4, 46], [40, 15], [76, 46]))
    if (k.window === 1) {
      s.add(circle(40, 34, 7))
      s.add(circle(40, 34, 4))
    }
    s.add(rect(26, 62, 28, 52, [2, 0]))
    s.part(circle(48, 90, 2.4))
    s.add(rect(2, 112, 76, 5, 2))
  }),
)

const shells = subject('sd-shells', 'Seashells', 'travel', 'outdoor', 'sand', { set: 3 }, (k) =>
  sketch((s) => {
    const scallop = (x: number) => {
      // A fan of ribs with a scalloped edge, and the two ears at its hinge.
      const pts: Pt[] = []
      for (let i = 0; i <= 5; i++) {
        const a0 = Math.PI * (1.1 + (0.8 * i) / 6)
        const a1 = Math.PI * (1.1 + (0.8 * (i + 1)) / 6)
        for (let j = 0; j <= 6; j++) {
          const a = a0 + ((a1 - a0) * j) / 6
          const r = 22 + 2.5 * Math.sin((Math.PI * j) / 6)
          pts.push(pt(x + r * Math.cos(a), 38 + r * Math.sin(a)))
        }
      }
      s.add([pt(x, 40), ...pts])
      for (let i = 1; i <= 5; i++) {
        const a = Math.PI * (1.1 + (0.8 * i) / 6)
        s.stroke(path([x, 38], [x + 21 * Math.cos(a), 38 + 21 * Math.sin(a)]))
      }
      s.add(poly([x - 8, 40], [x - 7, 34], [x + 7, 34], [x + 8, 40]))
    }
    const star = (x: number) => {
      s.add(starfish(x, 24, 17))
      for (const [dx, dy] of [
        [0, -6],
        [5, 2],
        [-5, 2],
      ] as const)
        s.part(circle(x + dx, 24 + dy, 1.6, 12))
    }
    const conch = (x: number) => {
      // A round sea snail's shell, its spiral winding in to the middle.
      s.add(blob([x - 16, 40], [x - 16, 24], [x, 10], [x + 16, 22], [x + 12, 38]))
      s.stroke(
        Array.from({ length: 50 }, (_, i) => {
          const t = (i / 49) * Math.PI * 3.2
          const r = 12 - t * 1.05
          return pt(x + r * Math.cos(t + 0.6), 27 + r * Math.sin(t + 0.6))
        }),
      )
    }
    const sets = [
      [scallop, star],
      [scallop, conch],
      [star, conch],
    ][k.set] ?? [scallop, star]
    sets[0]!(24)
    sets[1]!(70)
  }),
)

const crab = subject('sd-crab', 'Crab', 'travel', 'outdoor', 'sand', { claws: 2, spots: 2 }, (k) =>
  sketch((s) => {
    for (const dir of [-1, 1]) {
      // Three legs each side, fanning out and down.
      for (const [y, reach, drop] of [
        [28, 34, 38],
        [34, 32, 45],
        [40, 27, 50],
      ] as const)
        s.stroke(curve([40 + dir * 16, y], [40 + dir * (reach - 4), y - 2], [40 + dir * reach, drop]))
      // Claws: held up high, or down at its sides.
      const up = k.claws === 1
      const [hx, hy] = up ? [40 + dir * 26, 6] : [40 + dir * 36, 22]
      s.add(band(curve([40 + dir * 16, 26], [40 + dir * (up ? 24 : 28), up ? 18 : 26], [hx, hy + 6]), 4.5, true))
      s.add(blob([hx - dir * 4, hy + 8], [hx - dir * 7, hy - 2], [hx - dir * 2, hy - 8], [hx, hy - 1], [hx + dir * 3, hy - 9], [hx + dir * 7, hy + 1], [hx + dir * 3, hy + 8]))
      s.add(rod(40 + dir * 6, 22, 40 + dir * 8, 10, 3))
      s.add(circle(40 + dir * 8, 9, 4, 20))
      s.part(circle(40 + dir * 8, 9, 1.5, 12))
    }
    s.add(ellipse(40, 32, 21, 13))
    s.stroke(curve([35, 34], [40, 37], [45, 34]))
    if (k.spots === 1)
      for (const [x, y] of [
        [31, 27],
        [49, 27],
        [40, 24],
      ] as const)
        s.part(circle(x, y, 2.4, 14))
  }),
)

const flipFlops = subject('sd-flip-flops', 'Flip-Flops', 'travel', 'outdoor', 'sand', { pair: 2, flower: 2 }, (k) =>
  sketch((s) => {
    const one = (x: number, turn: number) => {
      const at = (r: Ring) => rotate(r, turn, x, 60)
      s.add(at(blob([x, 2], [x + 9, 6], [x + 11, 20], [x + 8, 36], [x + 9, 50], [x, 60], [x - 9, 50], [x - 8, 36], [x - 11, 20], [x - 9, 6])))
      s.add(at(band(curve([x - 10, 28], [x - 4, 18], [x, 12]), 3.5, true)))
      s.add(at(band(curve([x + 10, 28], [x + 4, 18], [x, 12]), 3.5, true)))
      if (k.flower === 1) {
        s.add(at(flowerHead(x, 13, 5.5, turn)))
        s.part(at(circle(x, 13, 1.8, 12)))
      } else s.part(at(circle(x, 12, 2.4, 12)))
    }
    one(16, -8)
    if (k.pair === 1) one(44, 8)
  }),
)

const coolBox = subject('sd-cool-box', 'Cool Box', 'travel', 'outdoor', 'sand', { handle: 2, stripe: 2 }, (k) =>
  sketch((s) => {
    if (k.handle === 1) s.add(band(curve([14, 14], [16, 0], [64, 0], [66, 14]), 5, true))
    s.add(rect(4, 20, 72, 40, [2, 5]))
    if (k.stripe === 1) s.add(rect(4, 38, 72, 8))
    if (k.handle === 0) {
      s.add(rect(-2, 28, 7, 12, 2))
      s.add(rect(75, 28, 7, 12, 2))
    }
    s.add(rect(0, 10, 80, 12, 3))
    s.add(rect(34, 18, 12, 8, 2))
  }),
)

/* ------------------------------------------------------------------ *
 * The lake and the campsite
 * ------------------------------------------------------------------ */

const canoe = subject('sd-canoe', 'Canoe', 'travel', 'outdoor', 'water', { paddle: 2, stripe: 2 }, (k) =>
  sketch((s) => {
    const top = (x: number) => 4 + 10 * Math.sin((Math.PI * x) / 160)
    const bottom = (x: number) => 4 + 34 * Math.sin((Math.PI * x) / 160) ** 0.7
    const xs = Array.from({ length: 41 }, (_, i) => (160 * i) / 40)
    if (k.paddle === 1) {
      s.add(rod(46, 26, 116, -8, 4))
      s.add(rotate(ellipse(124, -12, 13, 5.5), -26, 124, -12))
    }
    const hull = [...xs.map((x) => pt(x, top(x))), ...xs.slice(1, -1).reverse().map((x) => pt(x, bottom(x)))]
    s.add(hull)
    s.stroke(xs.slice(2, -2).map((x) => pt(x, top(x) + 4)))
    if (k.stripe === 1) {
      const span = xs.slice(8, -8)
      s.add([...span.map((x) => pt(x, top(x) + 9)), ...span.reverse().map((x) => pt(x, top(x) + 14))])
    }
  }),
)

const backpack = subject('sd-backpack', 'Backpack', 'travel', 'outdoor', 'grass', { pocket: 2, roll: 2 }, (k) =>
  sketch((s) => {
    if (k.roll === 1) {
      s.add(rect(2, 4, 56, 16, 8))
      s.add(ellipse(52, 12, 5, 8))
    }
    s.add(band(curve([18, 22], [30, 10], [42, 22]), 4, true))
    s.add(rect(6, 18, 48, 62, [18, 6]))
    s.add(blob([8, 26], [20, 18], [40, 18], [52, 26], [52, 40], [30, 44], [8, 40]))
    s.add(rect(27, 38, 6, 8, 1))
    if (k.pocket === 1) {
      s.add(rect(14, 52, 32, 24, [4, 6]))
      s.add(rect(14, 52, 32, 7, [4, 0]))
    }
  }),
)

const stump = subject('sd-stump', 'Tree Stump', 'travel', 'outdoor', 'grass', { rings: 2, mushrooms: 2 }, (k) =>
  sketch((s) => {
    s.add(blob([10, 60], [16, 50], [16, 20], [64, 20], [64, 50], [72, 60]))
    s.stroke(curve([30, 26], [28, 40], [32, 52]))
    s.stroke(curve([52, 28], [54, 42], [50, 50]))
    s.add(ellipse(40, 20, 24, 7))
    if (k.rings === 1) {
      s.add(ellipse(40, 20, 15, 4.2))
      s.add(ellipse(40, 20, 6, 1.8))
    }
    if (k.mushrooms === 1)
      for (const [x, h, r] of [
        [72, 18, 9],
        [84, 12, 6],
      ] as const) {
        s.add(rect(x - 2.5, 60 - h, 5, h, 1))
        s.add(sliceY(ellipse(x, 60 - h, r, r * 0.8), 60 - h - r, 60 - h))
      }
  }),
)

/** Every new outdoor element. */
export const SD_OUTDOOR_ELEMENTS: readonly SgSubject[] = [
  roseArch,
  feeder,
  vegBed,
  pumpkins,
  scarecrow,
  snail,
  tools,
  washingLine,
  picnicTable,
  crate,
  palm,
  beachHut,
  shells,
  crab,
  flipFlops,
  coolBox,
  canoe,
  backpack,
  stump,
]
