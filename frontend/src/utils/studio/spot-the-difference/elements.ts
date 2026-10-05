import { subject, type SgSubject } from '../stained-glass/catalog'
import { arcBand, band, blob, circle, curve, ellipse, path, poly, rect, rod, rotate, sketch, steps } from '../stained-glass/subject-kit'
import { pt, type Pt, type Ring } from '../stained-glass/geometry'
import { SD_HOME_ELEMENTS } from './elements-home'
import { SD_OUTDOOR_ELEMENTS } from './elements-outdoor'
import { bumpRing, discArc, domeDiscs, flowerHead, hand, leaf, ovalDiscs, scaleX, scallopRing, sliceY, type Disc, type XY } from './element-kit'

/**
 * The things a scene needs that the shared retirement library does not draw:
 * the window and the clock on the wall, the clouds and the sun, the fence,
 * the beach umbrella, the tea table.
 *
 * Drawn with the same kit and rules as the library (`stained-glass/
 * subject-kit.ts`): plain geometry, closed shapes stacked back to front,
 * generic objects with no text, logos or brands, nothing traced from a photo,
 * a product or another activity book.
 *
 * Every knob is a change a reader can name â€” the clock's hands point
 * elsewhere, the fence has one picket more, the window has curtains â€” so a
 * knob dealt differently in the two pictures is one fair difference. Knobs
 * change what is added to a thing, never where the thing stands: its foot
 * (or, for things that hang, its top) is the same in every version, so a
 * changed version never looks nudged or floating.
 */

/* ------------------------------------------------------------------ *
 * Indoors
 * ------------------------------------------------------------------ */

const windowPane = subject('sd-window', 'Window', 'home', 'indoor', 'none', { top: 2, panes: 3, curtains: 3, box: 2 }, (k) =>
  sketch((s) => {
    const arch = k.top === 1
    s.add(rect(10, 8, 60, 78, arch ? [30, 0] : 3))
    s.add(rect(16, 14, 48, 66, arch ? [24, 0] : 1))
    // Glazing bars: the upright always, the cross bars as many as the knob says.
    if (k.panes !== 2) s.add(rect(38, 14, 4, 66))
    const rails = k.panes === 0 ? [48] : k.panes === 1 ? (arch ? [44, 62] : [34, 56]) : [50]
    for (const y of rails) s.add(rect(16, y, 48, 4))
    s.add(rect(4, 84, 72, 7, 2))
    if (k.box === 1) {
      s.add(rect(12, 91, 56, 11, [0, 3]))
      for (const x of [24, 40, 56]) s.add(flowerHead(x, 86, 6.5, x))
    }
    if (k.curtains === 1) {
      s.add(rod(0, 4, 80, 4, 4))
      s.add(blob([1, 6], [20, 6], [16, 30], [22, 62], [18, 86], [3, 88], [1, 50]))
      s.add(blob([79, 6], [60, 6], [64, 30], [58, 62], [62, 86], [77, 88], [79, 50]))
    } else if (k.curtains === 2) {
      s.add(rod(0, 4, 80, 4, 4))
      s.add(scallopRing(2, 78, 5, 16, 4, 7))
    }
  }),
)

const picture = subject('sd-picture', 'Picture', 'home', 'indoor', 'none', { frame: 2, art: 4, hanger: 2 }, (k) =>
  sketch((s) => {
    const oval = k.frame === 1
    if (k.hanger === 1) {
      s.stroke(path([10, 26], [40, 3], [70, 26]))
      s.part(circle(40, 3, 3.5))
    }
    s.add(oval ? ellipse(40, 44, 38, 30) : rect(2, 14, 76, 60, 3))
    s.add(oval ? ellipse(40, 44, 31, 23) : rect(9, 21, 62, 46, 1))
    if (k.art === 0) {
      s.add(circle(28, 36, 5.5))
      s.add(poly([18, 58], [30, 40], [38, 49], [50, 34], [62, 58]))
    } else if (k.art === 1) {
      s.add(poly([22, 56], [58, 56], [52, 62], [28, 62]))
      s.add(poly([41, 30], [41, 53], [56, 53]))
      s.add(poly([38, 35], [38, 53], [27, 53]))
    } else if (k.art === 2) {
      s.add(band(path([40, 50], [40, 36]), 3))
      s.add(flowerHead(40, 32, 9))
      s.part(circle(40, 32, 3))
      s.add(blob([40, 47], [48, 52], [46, 62], [34, 62], [32, 52]))
    } else {
      s.add(poly([16, 60], [28, 52], [52, 52], [64, 60]))
      s.add(rect(38, 42, 4, 12))
      s.add(circle(40, 36, 10))
    }
  }),
)

/** Hand angles (hour, minute), degrees clockwise from twelve: 3:00, 10:10, 7:30. */
const CLOCK_TIMES: readonly (readonly [number, number])[] = [
  [90, 0],
  [305, 60],
  [225, 180],
]

const wallClock = subject('sd-clock', 'Clock', 'home', 'indoor', 'none', { case: 2, rim: 2, time: 3 }, (k) =>
  sketch((s) => {
    if (k.case === 1) s.add(rect(4, 4, 62, 62, 12))
    else s.add(circle(35, 35, 31))
    s.add(circle(35, 35, 25))
    if (k.rim === 1) s.add(circle(35, 35, 21))
    for (const a of [0, 90, 180, 270]) s.add(rotate(rect(33.5, 12, 3, 7), a, 35, 35))
    const [hour, minute] = CLOCK_TIMES[k.time] ?? CLOCK_TIMES[0]!
    s.add(hand(35, 35, hour, 12, 5))
    s.add(hand(35, 35, minute, 17, 3.5))
    s.part(circle(35, 35, 3.5))
  }),
)

const BOOK_HEIGHTS = [38, 31, 42, 29, 36]
const BOOK_WIDTHS = [10, 8, 11, 9, 10]

const shelf = subject('sd-shelf', 'Shelf', 'home', 'indoor', 'none', { books: 3, lean: 2, end: 3 }, (k) =>
  sketch((s) => {
    s.add(poly([12, 66], [24, 66], [12, 80]))
    s.add(poly([88, 66], [76, 66], [88, 80]))
    s.add(rect(0, 60, 100, 6, 1))
    const n = 3 + k.books
    let x = 6
    for (let i = 0; i < n; i++) {
      const w = BOOK_WIDTHS[i]!
      const h = BOOK_HEIGHTS[i]!
      const book = rect(x, 60 - h, w, h, 1)
      const spine = rect(x + 1.5, 60 - h + 6, w - 3, 3.5)
      if (k.lean === 1 && i === n - 1) {
        s.add(rotate(book, 16, x, 60))
        s.add(rotate(spine, 16, x, 60))
      } else {
        s.add(book)
        s.add(spine)
      }
      x += w + 1
    }
    if (k.end === 1) s.add(blob([80, 60], [73, 54], [74, 44], [79, 38], [85, 44], [86, 54]))
    else if (k.end === 2) {
      s.add(blob([80, 44], [72, 30], [78, 26], [82, 36]))
      s.add(blob([80, 44], [88, 28], [92, 34], [84, 44]))
      s.add(poly([72, 60], [71, 44], [89, 44], [88, 60]))
    }
  }),
)

const sideTable = subject('sd-side-table', 'Side Table', 'home', 'indoor', 'none', { legs: 2, drawer: 2, shelf: 2 }, (k) =>
  sketch((s) => {
    if (k.legs === 1) {
      s.add(rod(16, 16, 7, 100, 7))
      s.add(rod(84, 16, 93, 100, 7))
    } else {
      s.add(rod(12, 16, 12, 100, 7))
      s.add(rod(88, 16, 88, 100, 7))
    }
    if (k.shelf === 1) s.add(rect(6, 66, 88, 7, 1))
    s.add(rect(4, 6, 92, 16, 1))
    if (k.drawer === 1) {
      s.add(rect(30, 9, 40, 10, 2))
      s.part(circle(50, 14, 2.5))
    }
    s.add(rect(0, 0, 100, 8, 2))
  }),
)

const teaTable = subject('sd-tea-table', 'Table', 'home', 'indoor', 'none', { cloth: 3, legs: 2 }, (k) =>
  sketch((s) => {
    if (k.legs === 0) {
      s.add(rod(85, 8, 85, 64, 12))
      s.add(ellipse(85, 66, 30, 5))
    } else {
      s.add(rod(58, 8, 58, 66, 7))
      s.add(rod(112, 8, 112, 66, 7))
      s.add(rod(20, 8, 15, 70, 8))
      s.add(rod(150, 8, 155, 70, 8))
    }
    s.add(rect(0, 0, 170, 9, 3))
    if (k.cloth === 1) s.add(poly([-4, -1], [174, -1], [178, 34], [-8, 34]))
    else if (k.cloth === 2) s.add(scallopRing(-4, 174, -1, 28, 7, 8))
  }),
)

const rug = subject('sd-rug', 'Rug', 'home', 'indoor', 'none', { shape: 2, border: 2, fringe: 2 }, (k) =>
  sketch((s) => {
    const oval = k.shape === 1
    if (k.fringe === 1) {
      const comb = (x: number, dir: number) => {
        const pts: XY[] = [[x, 1]]
        for (let y = 1; y <= 23; y += 4) pts.push([x + dir * 7, y + 1], [x, y + 3])
        return poly(...pts)
      }
      s.add(comb(oval ? 3 : 1, -1))
      s.add(comb(oval ? 97 : 99, 1))
    }
    s.add(oval ? ellipse(50, 12, 50, 12) : rect(0, 0, 100, 24, 3))
    if (k.border === 1) s.add(oval ? ellipse(50, 12, 40, 7) : rect(7, 4, 86, 16, 2))
  }),
)

const vase = subject('sd-vase', 'Vase of Flowers', 'home', 'indoor', 'none', { vase: 2, blooms: 3, leaves: 2 }, (k) =>
  sketch((s) => {
    const heads: XY[][] = [[[40, 20]], [[30, 24], [52, 16]], [[25, 26], [42, 12], [58, 26]]]
    const set = heads[k.blooms] ?? heads[0]!
    for (const [x, y] of set) s.add(band(path([40, 56], [x, y + 6]), 3.5))
    if (k.leaves === 1) {
      s.add(leaf(39, 54, 20, 38, 10))
      s.add(leaf(41, 54, 60, 38, 10))
    }
    set.forEach(([x, y], i) => {
      s.add(flowerHead(x, y, 10, i * 20))
      s.part(circle(x, y, 3.5))
    })
    if (k.vase === 1) s.add(rect(31, 52, 18, 42, [3, 5]))
    else s.add(blob([40, 52], [51, 60], [55, 78], [47, 94], [33, 94], [25, 78], [29, 60]))
  }),
)

const floorLamp = subject('sd-floor-lamp', 'Floor Lamp', 'home', 'indoor', 'none', { shade: 2, pull: 2, base: 2 }, (k) =>
  sketch((s) => {
    s.add(rod(30, 28, 30, 194, 5))
    if (k.base === 1) s.add(rect(14, 190, 32, 10, 4))
    else s.add(ellipse(30, 196, 18, 4))
    if (k.pull === 1) {
      s.stroke(path([42, 30], [42, 56]))
      s.part(circle(42, 58, 3))
    }
    s.add(k.shade === 1 ? poly([16, 0], [44, 0], [56, 32], [4, 32]) : rect(8, 0, 44, 32, 3))
  }),
)

const cookies = subject('sd-cookies', 'Plate of Cookies', 'home', 'indoor', 'none', { count: 3, rim: 2 }, (k) =>
  sketch((s) => {
    s.add(ellipse(50, 30, 48, 9))
    if (k.rim === 1) s.add(ellipse(50, 29, 38, 6))
    const piles: XY[][] = [
      [[38, 24], [62, 24]],
      [[36, 24], [64, 24], [50, 15]],
      [[28, 24], [50, 25], [72, 24], [50, 15]],
    ]
    for (const [x, y] of piles[k.count] ?? piles[0]!) s.add(ellipse(x, y, 14, 6))
  }),
)

const cake = subject('sd-cake', 'Cake', 'home', 'indoor', 'none', { stand: 2, tiers: 2, top: 3 }, (k) =>
  sketch((s) => {
    const base = k.stand === 1 ? 82 : 94
    if (k.stand === 1) {
      s.add(poly([40, 100], [60, 100], [55, 84], [45, 84]))
      s.add(ellipse(50, 84, 42, 5))
    } else s.add(ellipse(50, 96, 46, 5))
    s.add(rect(14, base - 30, 72, 30, 3))
    s.add(scallopRing(14, 86, base - 30, base - 24, 6, 5))
    let top = base - 30
    if (k.tiers === 1) {
      s.add(rect(27, base - 54, 46, 24, 3))
      s.add(scallopRing(27, 73, base - 54, base - 49, 4, 4))
      top = base - 54
    }
    const cherries = k.top === 1 ? [50] : k.top === 2 ? [38, 50, 62] : []
    for (const x of cherries) {
      s.stroke(path([x, top - 7], [x + 4, top - 15]))
      s.add(circle(x, top - 5, 5))
    }
  }),
)

const easel = subject('sd-easel', 'Easel', 'hobbies', 'indoor', 'none', { art: 3, tray: 2 }, (k) =>
  sketch((s) => {
    s.add(rod(40, 14, 40, 146, 4))
    s.add(rod(32, 6, 14, 150, 5))
    s.add(rod(48, 6, 66, 150, 5))
    s.add(rect(8, 16, 64, 62, 1))
    if (k.art === 1) {
      s.add(circle(55, 32, 6))
      s.add(blob([14, 72], [14, 58], [32, 50], [50, 58], [66, 52], [66, 72]))
    } else if (k.art === 2) {
      s.add(band(path([40, 60], [40, 40]), 3))
      s.add(flowerHead(40, 36, 11))
      s.part(circle(40, 36, 3.5))
      s.add(blob([40, 58], [49, 63], [47, 73], [33, 73], [31, 63]))
    }
    s.add(rect(4, 80, 72, 6, 2))
    if (k.tray === 1) s.add(rod(28, 78, 58, 74, 3.5))
  }),
)

const footstool = subject('sd-footstool', 'Footstool', 'home', 'indoor', 'none', { legs: 2, buttons: 2 }, (k) =>
  sketch((s) => {
    if (k.legs === 1) {
      s.add(rod(14, 34, 9, 54, 6))
      s.add(rod(66, 34, 71, 54, 6))
    } else {
      s.add(circle(16, 49, 5))
      s.add(circle(64, 49, 5))
    }
    s.add(rect(4, 14, 72, 30, 8))
    s.add(rect(1, 8, 78, 12, 6))
    if (k.buttons === 1) for (const x of [26, 40, 54]) s.part(circle(x, 30, 2.5))
  }),
)

const pendant = subject('sd-pendant', 'Hanging Lamp', 'home', 'indoor', 'none', { shade: 3, cord: 2 }, (k) =>
  sketch((s) => {
    // Hangs from its top: the ceiling rose is the anchor in every version.
    s.add(rect(38, 0, 24, 6, 2))
    // A plain cord, or a chain of links.
    if (k.cord === 1) for (const y of [11, 20, 29, 36]) s.add(ellipse(50, y, 3.5, 5))
    else s.add(rod(50, 6, 50, 40, 3))
    if (k.shade === 1) s.add(sliceY(ellipse(50, 66, 34, 28), 38, 66))
    else if (k.shade === 2) s.add(rect(26, 38, 48, 26, 3))
    else s.add(poly([40, 38], [60, 38], [78, 66], [22, 66]))
    s.add(sliceY(circle(50, 66, 9), 66, 76))
  }),
)

const slippers = subject('sd-slippers', 'Slippers', 'home', 'indoor', 'none', { pair: 2, pom: 2 }, (k) =>
  sketch((s) => {
    // Seen from above, toes up, as slippers are always drawn: a foot-shaped
    // sole and a puffy cover over the toes, the pair splayed a little.
    const one = (x: number, turn: number) => {
      const at = (r: Ring) => rotate(r, turn, x, 60)
      s.add(at(blob([x, 6], [x + 9, 10], [x + 11, 24], [x + 9, 40], [x + 8, 54], [x, 60], [x - 8, 54], [x - 9, 40], [x - 11, 24], [x - 9, 10])))
      s.add(at(blob([x - 12.5, 31], [x - 12, 16], [x - 7, 6], [x, 3], [x + 7, 6], [x + 12, 16], [x + 12.5, 31], [x, 35])))
      if (k.pom === 1) s.add(at(circle(x, 20, 5.5)))
    }
    one(16, -7)
    if (k.pair === 1) one(46, 7)
  }),
)

const bookStack = subject('sd-books', 'Stack of Books', 'home', 'indoor', 'none', { count: 3, top: 2 }, (k) =>
  sketch((s) => {
    const n = 2 + k.count
    const widths = [80, 70, 76, 62, 68]
    const shifts = [0, 6, -3, 8, 2]
    for (let i = 0; i < n; i++) {
      const y = 100 - (i + 1) * 13
      const x = 10 + shifts[i]! + (80 - widths[i]!) / 2
      s.add(rect(x, y, widths[i]!, 13, 2))
      s.add(rect(x + widths[i]! - 12, y + 3, 5, 7))
    }
    if (k.top === 1) {
      const y = 100 - n * 13
      s.add(ellipse(48, y - 6, 12, 7))
      s.add(rod(58, y - 8, 70, y - 14, 3))
    }
  }),
)

/* ------------------------------------------------------------------ *
 * The sky
 * ------------------------------------------------------------------ */

const sun = subject('sd-sun', 'Sun', 'garden', 'outdoor', 'none', { rays: 3 }, (k) =>
  sketch((s) => {
    if (k.rays === 1) {
      for (let i = 0; i < 8; i++) {
        const a = ((i * 45) * Math.PI) / 180
        const at = (r: number, off: number) => [50 + r * Math.cos(a + off), 50 + r * Math.sin(a + off)] as const
        s.add(poly(at(35, 0), at(22, 0.2), at(22, -0.2)))
      }
    } else if (k.rays === 2) {
      for (let i = 0; i < 12; i++) {
        const a = ((i * 30 + 15) * Math.PI) / 180
        s.add(rod(50 + 24 * Math.cos(a), 50 + 24 * Math.sin(a), 50 + 31 * Math.cos(a), 50 + 31 * Math.sin(a), 3.5))
      }
    }
    s.add(circle(50, 50, 19))
  }),
)

/**
 * A cloud's bumps, left to right: big ones in the middle, the end ones just
 * touching the flat base (y = 45), so each end rounds smoothly into it.
 */
const CLOUD_PUFFS: readonly (readonly Disc[])[] = [
  [
    [20, 33, 12],
    [46, 23, 19],
    [74, 30, 15],
  ],
  [
    [16, 35, 10],
    [34, 25, 15],
    [58, 20, 18],
    [82, 32, 13],
  ],
  [
    [12, 37, 8],
    [26, 28, 12],
    [45, 21, 16],
    [65, 24, 15],
    [84, 34, 11],
  ],
]

const cloud = subject('sd-cloud', 'Cloud', 'garden', 'outdoor', 'none', { puffs: 3 }, (k) =>
  sketch((s) => {
    s.add(bumpRing(CLOUD_PUFFS[k.puffs] ?? CLOUD_PUFFS[0]!, 45))
  }),
)

/** A gull in flight: two arched wings meeting in a point, one line. */
function gull(x: number, y: number, size: number, deep: boolean): Pt[] {
  const lift = deep ? 0.55 : 0.32
  const wing = (dir: number) => curve([x + dir * size, y - size * 0.05], [x + dir * size * 0.5, y - size * lift], [x + dir * size * 0.12, y - size * 0.12], [x, y])
  return [...wing(-1), ...wing(1).reverse().slice(1)]
}

const birds = subject('sd-birds', 'Birds', 'garden', 'outdoor', 'none', { count: 2, wings: 2 }, (k) =>
  sketch((s) => {
    const flock: XY[] = k.count === 1 ? [[16, 26], [46, 12], [78, 24]] : [[22, 24], [60, 14]]
    const sizes = [14, 12, 10]
    flock.forEach(([x, y], i) => s.stroke(gull(x, y, sizes[i]!, k.wings === 1)))
  }),
)

/** A bow on a kite's tail: two rounded wings and a knot. */
function bow(s: { add: (r: Ring) => unknown; part: (r: Ring) => unknown }, x: number, y: number) {
  s.add(blob([x, y], [x - 6, y - 5], [x - 10, y - 5], [x - 10, y + 5], [x - 6, y + 5]))
  s.add(blob([x, y], [x + 6, y - 5], [x + 10, y - 5], [x + 10, y + 5], [x + 6, y + 5]))
  s.part(circle(x, y, 2.5, 20))
}

const kite = subject('sd-kite', 'Kite', 'hobbies', 'outdoor', 'none', { bows: 3, shape: 2 }, (k) =>
  sketch((s) => {
    // The classic kite (cross spar a third of the way down) or a square-set diamond.
    const [top, left, bottom, right] =
      k.shape === 1
        ? ([[50, 0], [12, 42], [50, 84], [88, 42]] as const)
        : ([[50, 0], [18, 30], [50, 88], [82, 30]] as const)
    const tail = curve([50, bottom[1]], [40, bottom[1] + 16], [58, bottom[1] + 36], [42, bottom[1] + 56], [56, bottom[1] + 76], [48, bottom[1] + 86])
    s.stroke(tail)
    // Four panels meeting at the spars: each spar prints as one clean line.
    const mid: XY = [50, left[1]]
    s.add(poly(top, left, mid))
    s.add(poly(top, mid, right))
    s.add(poly(left, bottom, mid))
    s.add(poly(mid, bottom, right))
    const n = 2 + k.bows
    for (let i = 0; i < n; i++) {
      const p = tail[Math.round(((i + 0.6) / (n + 0.1)) * (tail.length - 1))]!
      bow(s, p.x, p.y)
    }
  }),
)

/* ------------------------------------------------------------------ *
 * Garden and grounds
 * ------------------------------------------------------------------ */

/** A broad tree's crown: big round lobes, clockwise from the top, balanced either side of x = 50. */
const TREE_LOBES: readonly Disc[] = [
  [50, 22, 20],
  [74, 34, 18],
  [80, 60, 17],
  [63, 80, 16],
  [37, 80, 16],
  [20, 60, 17],
  [26, 34, 18],
]

const tree = subject('sd-tree', 'Tree', 'garden', 'outdoor', 'grass', { crown: 3, fruit: 2, branch: 2 }, (k) =>
  sketch((s) => {
    // Two boughs forking up into the crown, either side alike.
    if (k.branch === 1) {
      s.add(band(curve([50, 122], [41, 106], [33, 84]), 8, true))
      s.add(band(curve([50, 122], [59, 106], [67, 84]), 8, true))
    }
    // The trunk flares into roots at the foot; its top is hidden in the crown.
    const side = (dir: number) => curve([50 + dir * 15, 150], [50 + dir * 7, 145], [50 + dir * 5.5, 130], [50 + dir * 5.5, 100], [50 + dir * 6.5, 74])
    s.add([...side(-1), ...side(1).reverse()])
    // Round and leafy, broad and lobed, or tall and narrow like a poplar.
    s.add(
      k.crown === 1
        ? bumpRing(TREE_LOBES)
        : k.crown === 2
          ? bumpRing(ovalDiscs(50, 56, 26, 44, 14, 10))
          : bumpRing(ovalDiscs(50, 52, 33, 33, 11, 12)),
    )
    if (k.fruit === 1) for (const [x, y] of [[56, 30], [34, 48], [62, 64]] as const) s.add(circle(x, y, 5.5))
  }),
)

const pine = subject('sd-pine', 'Pine Tree', 'garden', 'outdoor', 'grass', { tiers: 3, trunk: 2 }, (k) =>
  sketch((s) => {
    const w = k.trunk === 1 ? 16 : 10
    s.add(rect(50 - w / 2, 124, w, 26))
    const n = 2 + k.tiers
    const span = 128 / n
    for (let i = 0; i < n; i++) {
      // Bottom tier first; each one up covers the foot of the next.
      const bottom = 130 - i * span * 0.86
      const top = bottom - span * 1.5
      const half = 40 - i * (22 / n)
      s.add(poly([50 - half, bottom], [50, Math.max(0, top)], [50 + half, bottom]))
    }
  }),
)

/** A bush's leafy edge: how many scallops round the dome, and how big. */
const BUSH_LOBES: readonly (readonly [number, number])[] = [
  [7, 12],
  [9, 10],
  [11, 8.5],
]

/**
 * A rounded shrub on the ground: a dome with a close leafy edge (many small
 * scallops, where a cloud has a few big puffs and a flat underside) and
 * sprigs of leaves inside, so it never reads as a cloud fallen to the grass.
 */
const bush = subject('sd-bush', 'Bush', 'garden', 'outdoor', 'grass', { lobes: 3, flowers: 2 }, (k) =>
  sketch((s) => {
    const [n, r] = BUSH_LOBES[k.lobes] ?? BUSH_LOBES[0]!
    s.add(bumpRing(domeDiscs(50, 60, 49, 50, n, r), 60))
    if (k.flowers === 1) for (const [x, y] of [[30, 40], [54, 26], [70, 44]] as const) s.add(flowerHead(x, y, 7, x))
    else
      for (const [x, y] of [[26, 46], [48, 30], [70, 38], [56, 54], [36, 58]] as const) {
        s.add(leaf(x, y, x - 8, y - 9, 6))
        s.add(leaf(x, y, x + 8, y - 9, 6))
      }
  }),
)

const fence = subject('sd-fence', 'Fence', 'garden', 'outdoor', 'grass', { pickets: 3, top: 2 }, (k) =>
  sketch((s) => {
    const n = 4 + k.pickets
    const width = n * 16
    s.add(rect(-2, 20, width, 6))
    s.add(rect(-2, 42, width, 6))
    for (let i = 0; i < n; i++) {
      const x = i * 16
      s.add(k.top === 1 ? rect(x, 6, 11, 56, [5.5, 0]) : poly([x, 62], [x, 12], [x + 5.5, 3], [x + 11, 12], [x + 11, 62]))
    }
  }),
)

const flowers = subject('sd-flowers', 'Flowers', 'garden', 'outdoor', 'grass', { heads: 3, leaves: 2 }, (k) =>
  sketch((s) => {
    const all: readonly XY[] = [
      [18, 22],
      [40, 10],
      [62, 20],
      [82, 14],
    ]
    const heads = all.slice(0, 2 + k.heads)
    for (const [x, y] of heads) s.add(band(path([x, 60], [x, y + 6]), 3.5))
    if (k.leaves === 1) {
      s.add(leaf(19, 56, 4, 38, 9))
      s.add(leaf(41, 56, 56, 38, 9))
    }
    heads.forEach(([x, y], i) => {
      s.add(flowerHead(x, y, 10, i * 17))
      s.part(circle(x, y, 3.5))
    })
  }),
)

const bunker = subject('sd-bunker', 'Sand Trap', 'hobbies', 'outdoor', 'grass', { shape: 2, rake: 2 }, (k) =>
  sketch((s) => {
    s.add(k.shape === 1 ? blob([0, 14], [30, 2], [70, 6], [120, 2], [128, 16], [80, 26], [30, 26]) : ellipse(64, 14, 62, 13))
    if (k.rake === 1) {
      s.add(rod(34, 18, 92, 10, 3))
      s.add(rotate(rect(88, 4, 6, 14, 1), -8, 91, 11))
    }
  }),
)

const blanket = subject('sd-blanket', 'Picnic Blanket', 'garden', 'outdoor', 'grass', { pattern: 3 }, (k) =>
  sketch((s) => {
    s.add(poly([16, 0], [124, 0], [140, 30], [0, 30]))
    if (k.pattern === 0) s.add(poly([24, 4], [116, 4], [128, 26], [12, 26]))
    else if (k.pattern === 1) {
      s.add(poly([10, 10], [130, 10], [133, 16], [7, 16]))
      s.add(poly([4, 20], [135, 20], [137, 25], [2, 25]))
    } else {
      for (let row = 0; row < 2; row++) {
        for (let col = row % 2; col < 6; col += 2) {
          const y0 = row * 15
          const y1 = y0 + 15
          const at = (c: number, y: number) => [16 - (16 * y) / 30 + c * ((108 + (32 * y) / 30) / 6), y] as const
          s.add(poly(at(col, y0), at(col + 1, y0), at(col + 1, y1), at(col, y1)))
        }
      }
    }
  }),
)

const doormat = subject('sd-doormat', 'Doormat', 'home', 'outdoor', 'grass', { pattern: 3 }, (k) =>
  sketch((s) => {
    s.add(poly([8, 0], [92, 0], [100, 16], [0, 16]))
    if (k.pattern === 1) s.add(poly([16, 3], [84, 3], [90, 13], [10, 13]))
    else if (k.pattern === 2) s.add(poly([50, 2], [66, 8], [50, 14], [34, 8]))
  }),
)

const door = subject('sd-door', 'Front Door', 'home', 'outdoor', 'grass', { window: 3, wreath: 2, panels: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(0, 0, 72, 150, 2))
    s.add(rect(7, 7, 58, 143, 1))
    const top = k.window === 0 ? 18 : 46
    if (k.window === 1) s.add(sliceY(ellipse(36, 36, 22, 20), 16, 36))
    else if (k.window === 2) s.add(rect(18, 16, 36, 22, 2))
    if (k.panels === 1) {
      for (const y of [top, top + (136 - top) / 2 + 3]) {
        s.add(rect(15, y, 18, (136 - top) / 2 - 6, 2))
        s.add(rect(39, y, 18, (136 - top) / 2 - 6, 2))
      }
    } else {
      s.add(rect(15, top, 18, 136 - top, 2))
      s.add(rect(39, top, 18, 136 - top, 2))
    }
    s.part(circle(58, 86, 3.5))
    if (k.wreath === 1) {
      s.add(circle(36, 62, 15))
      s.add(circle(36, 62, 8))
      s.add(poly([36, 74], [28, 84], [34, 84]))
      s.add(poly([36, 74], [44, 84], [38, 84]))
    }
  }),
)

const hangingBasket = subject('sd-hanging', 'Hanging Basket', 'garden', 'outdoor', 'none', { vines: 2, blooms: 2 }, (k) =>
  sketch((s) => {
    s.stroke(path([50, 3], [22, 34]))
    s.stroke(path([50, 3], [78, 34]))
    s.part(circle(50, 3, 3.5))
    const vines = k.vines === 1 ? [24, 50, 76] : [30, 70]
    vines.forEach((x, i) => {
      const len = i % 2 === 0 ? 100 : 90
      s.stroke(curve([x, 50], [x - 6, 66], [x + 5, 82], [x, len]))
      s.add(leaf(x, len - 24, x - 13, len - 32, 7))
      s.add(leaf(x, len - 12, x + 13, len - 20, 7))
      s.add(leaf(x, len, x - 6, len - 12, 6))
    })
    s.add(bumpRing(domeDiscs(50, 42, 36, 24, 5, 8), 42))
    if (k.blooms === 1) for (const x of [30, 50, 70]) s.add(flowerHead(x, 28, 8, x))
    s.add(blob([14, 38], [86, 38], [80, 56], [50, 64], [20, 56]))
    s.add(rect(12, 36, 76, 7, 3))
  }),
)

/* ------------------------------------------------------------------ *
 * The seaside and the campsite
 * ------------------------------------------------------------------ */

const umbrella = subject('sd-umbrella', 'Beach Umbrella', 'travel', 'outdoor', 'sand', { scallops: 2, stripes: 2, finial: 2 }, (k) =>
  sketch((s) => {
    s.add(rod(50, 12, 50, 150, 5))
    const n = k.scallops === 1 ? 6 : 4
    const joints = steps(n + 1, 0, 100 / n)
    const y0 = 34
    const apex = pt(50, 2)
    const dome = curve([0, y0], [12, 14], [50, 2], [88, 14], [100, y0])
    const scallop = (from: number, to: number): Pt[] => steps(9, 0, 1 / 8).map((t) => pt(from + (to - from) * t, y0 + 16 * t * (1 - t)))
    const hem: Pt[] = []
    for (let i = n; i > 0; i--) hem.push(...scallop(joints[i]!, joints[i - 1]!).slice(i === n ? 1 : 0, -1))
    s.add([...dome, ...hem])
    if (k.stripes === 1) for (let i = 1; i < n; i += 2) s.add([apex, ...scallop(joints[i]!, joints[i + 1]!)])
    if (k.finial === 1) s.part(circle(50, 0, 5))
  }),
)

const sandcastle = subject('sd-sandcastle', 'Sandcastle', 'travel', 'outdoor', 'sand', { towers: 3, flag: 2, door: 2 }, (k) =>
  sketch((s) => {
    const xs = k.towers === 0 ? [50] : k.towers === 1 ? [26, 74] : [22, 50, 78]
    const flagAt = xs[Math.floor(xs.length / 2)]!
    if (k.flag === 1) {
      s.stroke(path([flagAt, 16], [flagAt, 0]))
      s.add(poly([flagAt, 0], [flagAt + 16, 5], [flagAt, 10]))
    }
    for (const x of xs) {
      s.add(rect(x - 11, 30, 22, 50))
      s.add(poly([x - 14, 32], [x, 14], [x + 14, 32]))
    }
    // Battlements: eight merlons and seven gaps, the same at either end.
    const teeth: XY[] = [[4, 100]]
    const w = 92 / 15
    for (let i = 0; i < 15; i += 2) teeth.push([4 + i * w, 52], [4 + (i + 1) * w, 52], ...(i < 14 ? ([[4 + (i + 1) * w, 58], [4 + (i + 2) * w, 58]] as XY[]) : []))
    teeth.push([96, 100])
    s.add(poly(...teeth))
    if (k.door === 1) s.add(rect(42, 78, 16, 22, [8, 0]))
  }),
)

const bucket = subject('sd-bucket', 'Bucket and Spade', 'travel', 'outdoor', 'sand', { spade: 2, handle: 2, band: 2 }, (k) =>
  sketch((s) => {
    if (k.spade === 1) {
      s.add(rod(66, 4, 56, 60, 5))
      s.add(rect(60, 0, 14, 7, 3))
    }
    s.add(k.handle === 1 ? band(curve([20, 40], [8, 24], [16, 14], [30, 30]), 4, true) : band(curve([20, 40], [50, 12], [80, 40]), 4, true))
    s.add(poly([18, 40], [82, 40], [74, 100], [26, 100]))
    if (k.band === 1) s.add(poly([21, 62], [79, 62], [77.5, 74], [22.5, 74]))
    s.add(rect(14, 35, 72, 8, 3))
  }),
)

const beachBall = subject('sd-ball', 'Beach Ball', 'travel', 'outdoor', 'sand', { pattern: 3 }, (k) =>
  sketch((s) => {
    const ball = circle(50, 50, 40, 64)
    s.add(ball)
    if (k.pattern === 0) {
      s.add(scaleX(ball, 0.62, 50))
      s.add(scaleX(ball, 0.22, 50))
    } else if (k.pattern === 1) s.add(sliceY(ball, 38, 62))
    else {
      s.add(sliceY(ball, 10, 28))
      s.add(sliceY(ball, 72, 90))
    }
  }),
)

const lifeRing = subject('sd-life-ring', 'Life Ring', 'travel', 'outdoor', 'none', { bands: 2, rope: 2 }, (k) =>
  sketch((s) => {
    if (k.rope === 1) for (const a of [45, 135, 225, 315]) s.add(rotate(rect(46, 2, 8, 14, 2), a, 50, 50))
    s.add(circle(50, 50, 40, 64))
    const spans = k.bands === 1 ? [[-20, 20], [70, 110], [160, 200], [250, 290]] : [[-25, 25], [155, 205]]
    for (const [a, b] of spans) s.add(arcBand(50, 50, 40, 21, a!, b!))
    s.add(circle(50, 50, 21, 48))
  }),
)

const campfire = subject('sd-campfire', 'Campfire', 'travel', 'outdoor', 'grass', { logs: 2, flames: 3, stones: 2 }, (k) =>
  sketch((s) => {
    const tongues: XY[] = k.flames === 0 ? [[50, 12]] : k.flames === 1 ? [[40, 22], [60, 14]] : [[34, 26], [50, 10], [66, 24]]
    // Flames: a full round base drawn up into a tip that flicks to one side.
    for (const [x, y] of tongues) {
      const h = 78 - y
      s.add(blob([x + 3, y], [x + 6, y + h * 0.3], [x + 13, y + h * 0.62], [x + 9, y + h * 0.9], [x, 78], [x - 9, y + h * 0.9], [x - 13, y + h * 0.62], [x - 4, y + h * 0.38]))
    }
    s.add(rod(12, 90, 88, 70, 12))
    s.add(rod(12, 70, 88, 90, 12))
    if (k.logs === 1) s.add(rod(24, 92, 76, 92, 11))
    if (k.stones === 1) for (const x of [6, 26, 74, 94]) s.add(ellipse(x, 91, 8, 5))
  }),
)

const signpost = subject('sd-signpost', 'Signpost', 'travel', 'outdoor', 'grass', { boards: 3, cap: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(46, 10, 8, 140))
    s.add(k.cap === 1 ? poly([43, 12], [50, 1], [57, 12]) : rect(43, 7, 14, 6, 2))
    const boards = [
      (y: number) => poly([54, y], [96, y], [106, y + 9], [96, y + 18], [54, y + 18]),
      (y: number) => poly([46, y], [4, y], [-6, y + 9], [4, y + 18], [46, y + 18]),
      (y: number) => poly([54, y], [92, y], [102, y + 9], [92, y + 18], [54, y + 18]),
    ]
    boards.slice(0, 1 + k.boards).forEach((board, i) => s.add(board(22 + i * 26)))
  }),
)

/** A swimming duck facing right, its waterline at `y`. */
function duck(s: { add: (r: Ring) => unknown }, x: number, y: number, size: number) {
  const f = size / 40
  const at = (dx: number, dy: number) => [x + dx * f, y + dy * f] as const
  // Body with the tail tipped up behind and a round breast in front.
  s.add(blob(at(-25, -15), at(-17, -10), at(-2, -13), at(14, -11), at(21, -3), at(13, 2), at(-12, 2), at(-21, -4)))
  s.add(blob(at(-12, -7), at(-2, -10), at(9, -7), at(-1, -3)))
  s.add(blob(at(19, -24), at(30, -22), at(31, -19), at(20, -17)))
  s.add(circle(x + 14 * f, y - 21 * f, 8 * f))
}

const ducks = subject('sd-ducks', 'Ducks', 'garden', 'outdoor', 'water', { ducklings: 3 }, (k) =>
  sketch((s) => {
    duck(s, 30, 40, 40)
    for (let i = 0; i <= k.ducklings; i++) duck(s, 72 + i * 30, 40, 24)
  }),
)

const tackleBox = subject('sd-tackle', 'Tackle Box', 'hobbies', 'outdoor', 'none', { handle: 2, latch: 2 }, (k) =>
  sketch((s) => {
    s.add(k.handle === 1 ? rect(28, 2, 24, 16, [6, 0]) : band(curve([24, 16], [40, 2], [56, 16]), 5, true))
    if (k.handle === 1) s.add(rect(33, 7, 14, 11))
    s.add(rect(4, 14, 72, 14, [4, 0]))
    s.add(rect(4, 28, 72, 30, [0, 3]))
    for (const x of k.latch === 1 ? [18, 56] : [37]) s.add(rect(x, 23, 7, 11, 1))
  }),
)

/* ------------------------------------------------------------------ *
 * Line-art versions of library subjects
 *
 * The shared library draws these for colouring, where a mosaic fills them
 * in; as plain outlines at scene size they did not read (a cat that was a
 * ball and a bean, a bicycle whose chainring looked like a third wheel).
 * ------------------------------------------------------------------ */

/** A closed sleeping eye: a short downward arc. */
const sleepyEye = (x: number, y: number) => discArc([x, y - 2.5, 3.5], Math.PI * 0.15, Math.PI * 0.85)

const cat = subject('sd-cat', 'Sleeping Cat', 'home', 'indoor', 'none', { cushion: 3, coat: 3 }, (k) =>
  sketch((s) => {
    // What it sleeps on, every one standing on y = 100 with its top near y = 84.
    if (k.cushion === 1) s.add(rect(2, 70, 128, 30, 15))
    else if (k.cushion === 2) {
      s.add(rect(4, 82, 124, 18, 4))
      s.add(rect(4, 90, 124, 10, [0, 4]))
    } else s.add(rect(6, 82, 120, 18, 9))
    // Curled up facing left: a rounded back, the tail round the front, the head on its paws.
    s.add(blob([40, 86], [40, 66], [58, 51], [86, 46], [110, 53], [121, 70], [115, 87]))
    if (k.coat === 1) for (const [x, y] of [[76, 52], [90, 51], [104, 57]] as const) s.add(leaf(x, y, x - 3, y + 13, 6))
    else if (k.coat === 2) s.add(blob([84, 54], [98, 54], [104, 63], [92, 69], [80, 63]))
    s.add(band(curve([117, 80], [108, 91], [84, 94], [60, 92]), 8, true))
    s.add(ellipse(28, 85, 8, 4.5))
    s.add(ellipse(45, 86, 8, 4.5))
    s.add(blob([21, 60], [22, 40], [36, 52]))
    s.add(blob([40, 52], [53, 41], [55, 60]))
    s.add(ellipse(37, 67, 19, 16))
    for (const x of [30, 44]) s.stroke(sleepyEye(x, 68))
    s.part(poly([35, 73], [39, 73], [37, 75.5]))
    // A pet bed's front rim, in front of the cat.
    if (k.cushion === 1) s.add(rect(0, 86, 132, 14, 7))
  }),
)

const bicycle = subject('sd-bicycle', 'Bicycle', 'hobbies', 'outdoor', 'grass', { basket: 2, spokes: 2, frame: 2 }, (k) =>
  sketch((s) => {
    const R = 24
    const wheels: XY[] = [
      [28, 74],
      [112, 74],
    ]
    // Wheels: tyre and rim, spokes if any.
    for (const [cx, cy] of wheels) {
      s.add(circle(cx, cy, R, 56))
      s.add(circle(cx, cy, R - 5, 56))
      if (k.spokes === 1)
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4
          s.stroke(path([cx + 4 * Math.cos(a), cy + 4 * Math.sin(a)], [cx + (R - 5) * Math.cos(a), cy + (R - 5) * Math.sin(a)]))
        }
    }
    // Frame tubes: a straight top tube, or a step-through frame's low swoop.
    s.add(rod(28, 74, 64, 78, 5))
    s.add(rod(28, 74, 56, 42, 5))
    s.add(rod(64, 78, 56, 38, 5.5))
    s.add(rod(64, 78, 99, 44, 5.5))
    if (k.frame === 1) s.add(band(curve([59, 58], [76, 66], [98, 48]), 5.5, true))
    else s.add(rod(57, 44, 99, 42, 5.5))
    s.add(rod(100, 42, 112, 74, 5))
    s.add(rod(98, 34, 101, 48, 7))
    // Handlebar and saddle.
    s.add(rod(98, 34, 96, 26, 4.5))
    s.add(band(curve([84, 27], [92, 23], [103, 25]), 4.5, true))
    s.add(blob([44, 35], [53, 31], [65, 32], [61, 38], [48, 38]))
    // Crank and pedal, then the hubs.
    s.add(rod(64, 78, 58, 89, 4))
    s.add(rect(52, 88, 12, 4.5, 2))
    s.add(circle(64, 78, 7.5))
    for (const [cx, cy] of wheels) s.part(circle(cx, cy, 3.5))
    // A wicker basket on the handlebar.
    if (k.basket === 1) {
      s.add(rect(101, 26, 26, 18, [1, 5]))
      s.add(rect(99, 22, 30, 6, 2))
    }
  }),
)

/** A fish hanging by its mouth from (x, y), head up. */
function hungFish(s: { add: (r: Ring) => unknown; part: (r: Ring) => unknown }, x: number, y: number) {
  s.add(blob([x, y + 40], [x + 10, y + 58], [x, y + 52], [x - 10, y + 58]))
  s.add(blob([x, y], [x + 9, y + 9], [x + 12, y + 24], [x + 6, y + 40], [x, y + 44], [x - 6, y + 40], [x - 12, y + 24], [x - 9, y + 9]))
  s.add(leaf(x + 4, y + 24, x + 15, y + 30, 6))
  s.add(blob([x - 9, y + 13], [x, y + 17], [x + 9, y + 13], [x, y + 15]))
  s.part(circle(x - 3, y + 8, 2.2, 16))
}

const fishing = subject('sd-fishing', 'Fishing Rod', 'hobbies', 'outdoor', 'none', { rod: 2, bobber: 2, fish: 2 }, (k) =>
  sketch((s) => {
    // A straight rod, or one bent under the catch.
    const tip: XY = k.rod === 1 ? [104, 12] : [100, 8]
    const pole = k.rod === 1 ? curve([24, 124], [48, 78], [72, 38], [92, 16], tip) : curve([24, 124], [62, 64], tip)
    const x = tip[0]
    s.stroke(path(tip, [x, k.fish === 1 ? 72 : 76]))
    if (k.fish === 1) hungFish(s, x, 72)
    else s.stroke(curve([x, 76], [x, 84], [x - 4, 88], [x - 8, 84]))
    if (k.bobber === 1) {
      s.add(ellipse(x, 48, 4.5, 10))
      s.add(sliceY(ellipse(x, 48, 4.5, 10), 37, 46))
    } else {
      s.add(circle(x, 48, 7))
      s.add(sliceY(circle(x, 48, 7), 48, 56))
    }
    s.add(band(pole, 4.5, true))
    s.add(rod(12, 142, 30, 116, 10))
    s.add(circle(36, 112, 9))
    s.part(circle(36, 112, 3))
  }),
)

/** Every element this game draws itself. */
export const SD_ELEMENTS: readonly SgSubject[] = [
  windowPane,
  picture,
  wallClock,
  shelf,
  sideTable,
  teaTable,
  rug,
  vase,
  floorLamp,
  cookies,
  cake,
  easel,
  footstool,
  pendant,
  slippers,
  bookStack,
  ducks,
  sun,
  cloud,
  birds,
  kite,
  tree,
  pine,
  bush,
  fence,
  flowers,
  bunker,
  blanket,
  doormat,
  door,
  hangingBasket,
  umbrella,
  sandcastle,
  bucket,
  beachBall,
  lifeRing,
  campfire,
  signpost,
  tackleBox,
  cat,
  bicycle,
  fishing,
  ...SD_HOME_ELEMENTS,
  ...SD_OUTDOOR_ELEMENTS,
]
