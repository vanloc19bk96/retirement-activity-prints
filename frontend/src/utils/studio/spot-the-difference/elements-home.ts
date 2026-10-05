import { subject, type SgSubject } from '../stained-glass/catalog'
import { band, blob, circle, curve, ellipse, path, poly, rect, rod, rotate, sketch, type Sketch } from '../stained-glass/subject-kit'
import { pt, type Ring } from '../stained-glass/geometry'
import { flowerHead, hand, leaf, sliceY } from './element-kit'

/**
 * More of home for Spot the Differences: a sofa and a fireplace, a
 * grandfather clock and a bookcase, a dog by the fire, and a kitchen to bake
 * in (a counter, a wall cupboard, a rail of utensils, a mixing bowl, bread,
 * jars).
 *
 * The same rules as `elements.ts`: plain geometry stacked back to front,
 * generic things with no text, logos or brands, nothing traced. Every knob
 * is a change a reader can name, and none moves the thing's foot.
 */

/* ------------------------------------------------------------------ *
 * Small shared shapes
 * ------------------------------------------------------------------ */

/** A heart, `r` across from its middle, point down. */
function heart(cx: number, cy: number, r: number): Ring {
  const f = r / 17
  return Array.from({ length: 48 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2
    return pt(cx + 16 * Math.sin(t) ** 3 * f, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * f)
  })
}

/** A candle in a candlestick standing on `foot`, its flame lit or not. */
function candlestick(s: Sketch, x: number, foot: number, lit: boolean, tall = 1) {
  const top = foot - 22 - 28 * tall
  if (lit) s.add(leaf(x, top - 2, x, top - 15, 8))
  else s.stroke(path([x, top], [x, top - 5]))
  s.add(rect(x - 3.5, top, 7, 28 * tall + 1, 1))
  s.add(rect(x - 2.5, foot - 22, 5, 19))
  s.add(ellipse(x, foot - 22, 7.5, 2.5))
  s.add(ellipse(x, foot - 3, 9.5, 3))
}

/**
 * A bowl seen a little from above: the front of its rim curving down, then
 * its round body. Returns the body; the back of the rim is `ellipse(cx, rim, rx, lip)`.
 */
function bowlBody(cx: number, rim: number, rx: number, lip: number, depth: number): Ring {
  const front = Array.from({ length: 25 }, (_, i) => {
    const t = Math.PI - (Math.PI * i) / 24
    return pt(cx + rx * Math.cos(t), rim + lip * Math.sin(t))
  })
  const under = Array.from({ length: 25 }, (_, i) => {
    const t = (Math.PI * i) / 24
    return pt(cx + rx * Math.cos(t), rim + depth * Math.sin(t))
  })
  return [...front, ...under.slice(1, -1)]
}

/** A short clock face: a ring, four ticks and two hands. */
function clockFace(s: Sketch, cx: number, cy: number, r: number, time: number) {
  s.add(circle(cx, cy, r))
  for (const a of [0, 90, 180, 270]) s.add(rotate(rect(cx - r * 0.06, cy - r * 0.86, r * 0.12, r * 0.22), a, cx, cy))
  const [hour, minute] = TIMES[time] ?? TIMES[0]!
  s.add(hand(cx, cy, hour, r * 0.5, r * 0.17))
  s.add(hand(cx, cy, minute, r * 0.7, r * 0.12))
  s.part(circle(cx, cy, r * 0.13))
}

/** Hand angles (hour, minute), degrees clockwise from twelve: 3:00, 10:10, 7:30. */
const TIMES: readonly (readonly [number, number])[] = [
  [90, 0],
  [305, 60],
  [225, 180],
]

/* ------------------------------------------------------------------ *
 * The living room
 * ------------------------------------------------------------------ */

const sofa = subject('sd-sofa', 'Sofa', 'home', 'indoor', 'none', { back: 2, cushions: 2, legs: 2, pillow: 2 }, (k) =>
  sketch((s) => {
    if (k.legs === 1) {
      s.add(rod(24, 84, 17, 97, 6))
      s.add(rod(176, 84, 183, 97, 6))
    } else {
      s.add(rect(16, 84, 14, 16, [0, 4]))
      s.add(rect(170, 84, 14, 16, [0, 4]))
    }
    // A straight back, or a camel back rising in the middle.
    s.add(k.back === 1 ? blob([18, 70], [18, 34], [44, 26], [74, 24], [100, 12], [126, 24], [156, 26], [182, 34], [182, 70]) : rect(18, 22, 164, 52, 12))
    const n = 2 + k.cushions
    const w = 148 / n
    for (let i = 0; i < n; i++) s.add(rect(26 + i * w, 58, w, 18, 6))
    s.add(rect(10, 72, 180, 18, 5))
    if (k.pillow === 1) s.add(rotate(rect(30, 34, 30, 28, 8), -12, 45, 48))
    s.add(rect(0, 44, 32, 46, [14, 4]))
    s.add(rect(168, 44, 32, 46, [14, 4]))
  }),
)

/** A pair of crossed logs on a hearth, from x0 to x1 at `y`. */
function logs(s: Sketch, x0: number, x1: number, y: number) {
  s.add(rod(x0, y, x1, y - 8, 9))
  s.add(rod(x0, y - 8, x1, y, 9))
}

const fireplace = subject('sd-fireplace', 'Fireplace', 'home', 'indoor', 'none', { opening: 2, fire: 2, guard: 2, mantel: 3 }, (k) =>
  sketch((s) => {
    // On the mantel shelf (y = 0): a pair of candlesticks, or a mantel clock.
    if (k.mantel === 1) {
      candlestick(s, 20, 1, false, 0.6)
      candlestick(s, 120, 1, false, 0.6)
    } else if (k.mantel === 2) {
      s.add(rect(50, -38, 40, 38, [20, 1]))
      clockFace(s, 70, -20, 13, 1)
    }
    s.add(rect(10, 8, 120, 116, 1))
    s.add(rect(0, 0, 140, 10, 2))
    // The opening: an arch, or square.
    s.add(k.opening === 1 ? rect(38, 48, 64, 76, [32, 0]) : rect(32, 52, 76, 72, 2))
    if (k.fire === 1) {
      for (const [x, y, w] of [
        [58, 84, 14],
        [72, 74, 16],
        [86, 88, 13],
      ] as const)
        s.add(leaf(x, 114, x + (x < 70 ? -3 : 3), y, w))
    }
    logs(s, 48, 92, 118)
    // A fire guard in front: a frame and its bars, drawn as lines over the fire.
    if (k.guard === 1) {
      const frame = rect(34, 94, 72, 30, [10, 0])
      s.stroke([...frame, frame[0]!])
      for (let x = 46; x < 100; x += 12) s.stroke(path([x, 94], [x, 124]))
    }
    s.add(rect(-6, 122, 152, 10, 2))
  }),
)

const grandfatherClock = subject('sd-tall-clock', 'Grandfather Clock', 'home', 'indoor', 'none', { top: 2, time: 3, door: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(8, 190, 10, 10, [0, 2]))
    s.add(rect(38, 190, 10, 10, [0, 2]))
    s.add(rect(6, 170, 44, 22, 2))
    s.add(rect(12, 70, 32, 102, 1))
    if (k.door === 0) {
      // A glass door with the pendulum swinging behind it.
      s.add(rect(18, 82, 20, 80, 10))
      s.add(rod(28, 84, 28, 140, 2.5))
      s.add(circle(28, 146, 7))
    } else {
      s.add(rect(18, 84, 20, 46, 3))
      s.add(rect(18, 136, 20, 26, 3))
    }
    // The hood: arched, or square under a pointed crown.
    if (k.top === 1) s.add(rect(4, 4, 48, 68, [24, 1]))
    else {
      s.add(poly([0, 14], [28, 0], [56, 14]))
      s.add(rect(4, 12, 48, 60, 1))
    }
    clockFace(s, 28, 40, 16, k.time)
    s.add(rect(2, 68, 52, 6, 2))
  }),
)

/** Books standing on a shelf at `bottom`, up to `top`, from x0 to x1, in one of three arrangements. */
function shelfBooks(s: Sketch, x0: number, x1: number, bottom: number, top: number, arrangement: number) {
  const h = bottom - top
  const widths = [12, 9, 13, 10, 12, 9, 13, 10]
  const heights = [0.9, 0.74, 0.84, 0.94, 0.7, 0.86, 0.78, 0.92, 0.72, 0.88]
  // Arrangement 1 leaves a gap with one book leaning; 2 lays a short pile flat at the end.
  const end = arrangement === 2 ? x1 - 30 : x1
  let x = x0
  for (let i = 0; x + widths[i % widths.length]! <= end - (arrangement === 1 ? 16 : 0); i++) {
    const w = widths[i % widths.length]!
    s.add(rect(x, bottom - h * heights[i % heights.length]!, w, h * heights[i % heights.length]!, 1))
    x += w + 0.8
  }
  if (arrangement === 1) s.add(rotate(rect(x + 2, bottom - h * 0.82, 8, h * 0.82, 1), 24, x + 2, bottom))
  if (arrangement === 2) for (let i = 0; i < 3; i++) s.add(rect(x1 - 28 + i * 1.5, bottom - (i + 1) * 7, 26 - i * 3, 7, 1))
}

const bookcase = subject('sd-bookcase', 'Bookcase', 'home', 'indoor', 'none', { books: 3, top: 3, doors: 2 }, (k) =>
  sketch((s) => {
    // On top: a potted plant, or a globe.
    if (k.top === 1) {
      for (const [x, y] of [
        [10, -18],
        [20, -26],
        [30, -16],
      ] as const)
        s.add(leaf(20, -10, x, y, 8))
      s.add(poly([12, -12], [28, -12], [26, 0], [14, 0]))
    } else if (k.top === 2) {
      s.add(poly([62, 0], [78, 0], [73, -6], [67, -6]))
      s.add(circle(70, -17, 11))
      s.stroke(curve([70, -28], [64, -17], [70, -6]))
      s.stroke(path([59.5, -17], [80.5, -17]))
    }
    s.add(rect(0, 0, 90, 144, 2))
    s.add(rect(0, 46, 90, 4))
    s.add(rect(0, 90, 90, 4))
    shelfBooks(s, 9, 81, 46, 10, k.books)
    shelfBooks(s, 9, 81, 90, 54, 2)
    if (k.doors === 1) {
      s.add(rect(8, 96, 36, 40, 2))
      s.add(rect(46, 96, 36, 40, 2))
      s.part(circle(39, 116, 2.5))
      s.part(circle(51, 116, 2.5))
    } else shelfBooks(s, 9, 81, 138, 98, 1)
    s.add(rect(-2, 138, 94, 12, 2))
  }),
)

const dog = subject('sd-dog', 'Dog', 'home', 'indoor', 'none', { ears: 2, patch: 2, mat: 2, collar: 2 }, (k) =>
  sketch((s) => {
    // Lying down facing left, head up, front paws out in front.
    if (k.mat === 1) s.add(rect(0, 86, 156, 14, 7))
    if (k.ears === 1) s.add(poly([39, 48], [45, 26], [55, 44]))
    s.add(band(curve([118, 84], [132, 88], [146, 94]), 7, true))
    s.add(blob([40, 90], [42, 70], [66, 58], [100, 57], [120, 66], [126, 84], [118, 95], [60, 95]))
    if (k.patch === 1) s.add(blob([72, 62], [90, 59], [94, 71], [80, 77], [68, 71]))
    // The hind leg: a haunch line and a paw tucked forward on the floor.
    s.stroke(curve([90, 94], [91, 78], [104, 70], [118, 76]))
    s.add(rod(88, 95.5, 112, 95.5, 9))
    // Front paws, one a little behind the other.
    s.add(rod(30, 90, 58, 90, 10))
    s.add(rod(16, 95, 54, 95, 10))
    for (const x of [19, 23]) s.stroke(path([x, 91], [x, 95]))
    if (k.collar === 1) {
      s.add(band(curve([50, 46], [57, 58], [58, 72]), 6))
      s.add(circle(57, 76, 4))
    }
    s.add(blob([24, 58], [30, 44], [44, 40], [56, 48], [58, 62], [48, 72], [30, 72]))
    s.add(ellipse(20, 64, 14, 9))
    s.part(ellipse(7, 61, 4, 3))
    s.part(circle(34, 53, 2.4, 16))
    if (k.ears === 0) s.add(blob([44, 42], [56, 44], [60, 58], [54, 70], [47, 60]))
  }),
)

const candles = subject('sd-candles', 'Candlesticks', 'home', 'indoor', 'none', { count: 3, lit: 2 }, (k) =>
  sketch((s) => {
    const xs = [[30], [18, 42], [12, 30, 48]][k.count] ?? [30]
    xs.forEach((x, i) => candlestick(s, x, 70, k.lit === 1, xs.length === 3 && i === 1 ? 1.25 : 1))
  }),
)

const fruitBowl = subject('sd-fruit', 'Fruit Bowl', 'home', 'indoor', 'none', { fruit: 3, bowl: 2 }, (k) =>
  sketch((s) => {
    const raised = k.bowl === 1
    const rim = raised ? 30 : 38
    s.add(ellipse(45, rim, 42, 5))
    if (k.fruit === 0) {
      // Apples.
      for (const [x, y, r] of [
        [45, rim - 15, 12],
        [28, rim - 6, 11],
        [62, rim - 6, 11],
      ] as const) {
        s.stroke(path([x, y - r + 2], [x + 2, y - r - 5]))
        s.add(circle(x, y, r))
      }
      s.add(leaf(47, rim - 31, 57, rim - 36, 5))
    } else if (k.fruit === 1) {
      // An apple and an orange, with a bunch of grapes over the rim.
      s.stroke(path([30, rim - 21], [32, rim - 27]))
      s.add(circle(30, rim - 9, 13))
      s.add(circle(52, rim - 8, 12))
      s.part(circle(52, rim - 19, 1.8, 12))
    } else {
      // Pears.
      const pear = (x: number, y: number) => blob([x, y - 22], [x + 6, y - 14], [x + 11, y], [x, y + 7], [x - 11, y], [x - 6, y - 14])
      s.stroke(path([33, rim - 31], [35, rim - 37]))
      s.add(pear(33, rim - 9))
      s.stroke(path([57, rim - 29], [55, rim - 35]))
      s.add(pear(57, rim - 7))
    }
    s.add(bowlBody(45, rim, 42, 5, raised ? 16 : 26))
    if (k.fruit === 1) {
      s.stroke(curve([70, rim - 14], [72, rim - 8], [70, rim - 4]))
      s.add(leaf(71, rim - 10, 82, rim - 16, 6))
      const rows: readonly (readonly number[])[] = [[62, 70, 78], [66, 74], [70]]
      rows.forEach((xs, i) => xs.forEach((x) => s.add(circle(x, rim - 1 + i * 7, 4.6, 20))))
    }
    if (raised) {
      s.add(rect(40, 44, 10, 14))
      s.add(rect(30, 56, 30, 8, 2))
    }
  }),
)

const cactus = subject('sd-cactus', 'Potted Cactus', 'home', 'indoor', 'none', { arms: 3, flower: 2 }, (k) =>
  sketch((s) => {
    if (k.arms >= 1) s.add(band(curve([24, 50], [12, 48], [10, 30]), 10, true))
    if (k.arms === 2) s.add(band(curve([36, 42], [48, 40], [50, 22]), 10, true))
    s.add(rect(21, 12, 18, 62, [9, 0]))
    s.stroke(path([30, 18], [30, 66]))
    if (k.flower === 1) {
      s.add(flowerHead(30, 12, 8))
      s.part(circle(30, 12, 2.5))
    }
    s.add(poly([12, 72], [48, 72], [44, 100], [16, 100]))
    s.add(rect(9, 66, 42, 9, 2))
  }),
)

const photoFrame = subject('sd-photo', 'Photo Frame', 'home', 'indoor', 'none', { shape: 2, art: 3 }, (k) =>
  sketch((s) => {
    const oval = k.shape === 1
    s.add(oval ? ellipse(25, 30, 22, 27) : rect(3, 3, 44, 54, 3))
    s.add(oval ? ellipse(25, 30, 15, 20) : rect(9, 9, 32, 42, 1))
    if (k.art === 0) s.add(heart(25, 30, 9))
    else if (k.art === 1) {
      s.add(flowerHead(25, 26, 8))
      s.part(circle(25, 26, 2.5))
      s.add(band(path([25, 33], [25, 44]), 2.5))
    } else {
      s.add(circle(31, 22, 3.5))
      s.add(poly([12, 44], [21, 28], [27, 36], [33, 30], [40, 44]))
    }
    s.add(rect(10, 55, 30, 6, 2))
  }),
)

const mirror = subject('sd-mirror', 'Wall Mirror', 'home', 'indoor', 'none', { shape: 3, glints: 2 }, (k) =>
  sketch((s) => {
    // Round, oval or arched, its glass marked by a glint or two of light.
    const [outer, inner] =
      k.shape === 1
        ? [ellipse(30, 40, 24, 36), ellipse(30, 40, 18, 30)]
        : k.shape === 2
          ? [rect(4, 4, 52, 72, [26, 3]), rect(10, 10, 40, 60, [20, 1])]
          : [circle(30, 40, 30, 56), circle(30, 40, 23, 56)]
    s.add(outer)
    s.add(inner)
    s.stroke(path([20, 46], [34, 28]))
    if (k.glints === 1) s.stroke(path([25, 52], [39, 34]))
  }),
)

/* ------------------------------------------------------------------ *
 * The kitchen
 * ------------------------------------------------------------------ */

const counter = subject('sd-counter', 'Kitchen Counter', 'home', 'indoor', 'none', { doors: 2, handles: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(4, 8, 252, 84, 1))
    const bar = k.handles === 1
    const door = (x: number, side: -1 | 1) => {
      s.add(rect(x, 16, 54, 68, 2))
      const hx = side < 0 ? x + 7 : x + 47
      s.add(bar ? rod(hx, 26, hx, 42, 3.5) : circle(hx, 30, 3.2))
    }
    const drawer = (y: number) => {
      s.add(rect(136, y, 116, 32, 2))
      s.add(bar ? rod(184, y + 10, 204, y + 10, 3.5) : circle(194, y + 10, 3.2))
    }
    // Four doors, or two doors and a pair of wide drawers.
    door(12, 1)
    door(74, -1)
    if (k.doors === 0) {
      door(136, 1)
      door(198, -1)
    } else for (const y of [16, 52]) drawer(y)
    s.add(rect(0, 0, 260, 9, 2))
  }),
)

const mixingBowl = subject('sd-mixing-bowl', 'Mixing Bowl', 'home', 'indoor', 'none', { tool: 3, stripe: 2 }, (k) =>
  sketch((s) => {
    s.add(ellipse(40, 26, 38, 6))
    if (k.tool === 1) {
      // A wooden spoon.
      s.add(rod(46, 26, 68, -10, 5))
      s.add(ellipse(44, 28, 5, 7, 30))
    } else if (k.tool === 2) {
      // A whisk: its wires fanning down into the bowl from the handle.
      for (const dx of [-9, -3, 3, 9]) s.stroke(curve([52, 8], [52 + dx * 0.7, 18], [52 + dx, 30]))
      s.add(rod(52, 9, 62, -14, 6))
    }
    const body = bowlBody(40, 26, 38, 6, 28)
    s.add(body)
    if (k.stripe === 1) s.add(sliceY(body, 36, 42))
    s.add(rect(26, 50, 28, 6, 2))
  }),
)

const bread = subject('sd-bread', 'Bread', 'home', 'indoor', 'none', { loaf: 2, slice: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(84, 42, 26, 6, 3))
    s.add(rect(0, 40, 92, 10, 3))
    if (k.loaf === 0) {
      s.add(blob([8, 40], [12, 24], [28, 14], [62, 14], [78, 24], [82, 40]))
      for (const x of [26, 44, 62]) s.stroke(curve([x - 6, 28], [x, 22], [x + 6, 19]))
    } else {
      s.add(blob([14, 40], [16, 22], [45, 8], [74, 22], [76, 40]))
      s.stroke(path([33, 26], [57, 16]))
      s.stroke(path([33, 16], [57, 26]))
    }
    if (k.slice === 1) s.add(rotate(rect(80, 16, 8, 26, [4, 1]), 14, 84, 40))
  }),
)

const jars = subject('sd-jars', 'Storage Jars', 'home', 'indoor', 'none', { count: 2, lids: 2 }, (k) =>
  sketch((s) => {
    const all: readonly [number, number, number][] = [
      [4, 24, 44],
      [32, 26, 58],
      [62, 22, 36],
    ]
    for (const [x, w, h] of all.slice(0, 2 + k.count)) {
      const top = 70 - h
      if (k.lids === 1) s.part(circle(x + w / 2, top - 9, 3.5))
      s.add(rect(x, top, w, h, [3, 5]))
      s.add(rect(x + 4, top + h * 0.4, w - 8, h * 0.3, 2))
      s.add(k.lids === 1 ? rect(x - 2, top - 7, w + 4, 8, [4, 1]) : rect(x - 2, top - 6, w + 4, 7, 2))
    }
  }),
)

/** The tools a utensil rail can hold, hanging from (x, 8). */
const TOOLS: Record<string, (s: Sketch, x: number) => void> = {
  ladle: (s, x) => {
    s.add(rod(x, 10, x, 48, 4))
    s.add(sliceY(circle(x - 3, 52, 10), 50, 62))
    s.add(rect(x - 13, 49, 20, 3, 1))
  },
  spatula: (s, x) => {
    s.add(rod(x, 10, x, 40, 4))
    s.add(rect(x - 7, 40, 14, 22, [2, 4]))
  },
  whisk: (s, x) => {
    for (const w of [4, 8]) {
      const loop = ellipse(x, 46, w, 16)
      s.stroke([...loop, loop[0]!])
    }
    s.add(rect(x - 3, 10, 6, 22, 2))
  },
  spoon: (s, x) => {
    s.add(rod(x, 10, x, 44, 4))
    s.add(ellipse(x, 51, 6, 9))
  },
  pan: (s, x) => {
    s.add(rod(x, 10, x, 30, 5))
    s.add(circle(x, 46, 16))
    s.add(circle(x, 46, 11))
  },
}

const TOOL_SETS: readonly (readonly string[])[] = [
  ['ladle', 'whisk', 'spatula', 'spoon'],
  ['ladle', 'whisk', 'pan'],
  ['spatula', 'ladle', 'whisk'],
]

const utensils = subject('sd-utensils', 'Utensil Rail', 'home', 'indoor', 'none', { tools: 3 }, (k) =>
  sketch((s) => {
    const set = TOOL_SETS[k.tools] ?? TOOL_SETS[0]!
    const gap = 92 / set.length
    set.forEach((name, i) => {
      const x = 4 + gap * (i + 0.5)
      s.stroke(curve([x - 2, 6], [x - 3, 10], [x, 12]))
      TOOLS[name]!(s, x)
    })
    s.add(rod(2, 5, 98, 5, 5))
    s.part(circle(2, 5, 4))
    s.part(circle(98, 5, 4))
  }),
)

const cupboard = subject('sd-cupboard', 'Wall Cupboard', 'home', 'indoor', 'none', { glass: 2, handles: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(2, 6, 86, 60, 2))
    for (const x of [7, 47]) {
      s.add(rect(x, 12, 36, 48, 1))
      if (k.glass === 1) {
        // Glass in four panes.
        s.add(rect(x + 5, 17, 26, 38, 1))
        s.add(rect(x + 16.5, 17, 3, 38))
        s.add(rect(x + 5, 34.5, 26, 3))
      }
    }
    const bar = k.handles === 1
    for (const x of [39, 51]) s.add(bar ? rod(x, 30, x, 44, 3.5) : circle(x, 37, 2.8))
    s.add(rect(-2, 0, 94, 8, 2))
    s.add(rect(0, 64, 90, 6, 2))
  }),
)

/** Every new home element. */
export const SD_HOME_ELEMENTS: readonly SgSubject[] = [
  sofa,
  fireplace,
  grandfatherClock,
  bookcase,
  dog,
  candles,
  fruitBowl,
  cactus,
  photoFrame,
  mirror,
  counter,
  mixingBowl,
  bread,
  jars,
  utensils,
  cupboard,
]
