import { subject, type SgSubject } from './catalog'
import { arcBand, band, blob, circle, curve, ellipse, path, poly, rect, rod, rotate, sketch, wedge } from './subject-kit'

/**
 * Hobbies and pastimes: fishing, golf, music, painting and more.
 *
 * Drawn to the rules in `subject-kit.ts`; every version of every subject here
 * is rendered alone at the smallest print size by the tests and must leave no
 * piece too small to color.
 */

const fishing = subject('fishing', 'Gone Fishing', 'hobbies', 'outdoor', 'water', { rod: 2, bobber: 2, fish: 2 }, (k) =>
  sketch((s) => {
    // A bent rod holds the float right under its tip; a straight rod lets the
    // line run out to the float at a slant.
    const bent = k.rod === 1
    const tip: [number, number] = bent ? [76, 6] : [64, 4]
    const float: [number, number] = bent ? [75, 24] : [86, 26]
    // The line first, so the rod, the float and the fish all cover its ends.
    s.stroke(path([tip[0], tip[1] + 3], float, [76, 56]))
    // Rod: bent when a fish is on, straight otherwise; the grip covers its butt.
    if (bent) s.add(band(curve([16, 80], [34, 46], [54, 20], [tip[0] + 1, tip[1]]), 10.5, true))
    else s.add(band(path([16, 80], [tip[0] + 1, tip[1]]), 10.5, true))
    s.add(rod(4, 98, 20, 74, 14))
    // Reel on top of the grip, its crank knob on the rim, both clear of the water.
    s.part(circle(6, 62, 8.5))
    s.part(circle(17, 70, 11))
    // The float, two-tone.
    if (k.bobber === 1) {
      s.part(ellipse(...float, 9, 15))
      s.part(rect(float[0] - 9, float[1], 18, 15, [0, 9]))
    } else {
      s.part(circle(...float, 12))
      s.part(wedge(...float, 12, 0, 180))
    }
    // The fish, leaping head up with the hook in its mouth.
    const [fx, fy, len, half] = [83, 78, 27, 16]
    const ang = 73
    const ux = Math.cos((ang * Math.PI) / 180)
    const uy = Math.sin((ang * Math.PI) / 180)
    const at = (a: number, b: number): [number, number] => [fx + ux * a - uy * b, fy + uy * a + ux * b]
    if (k.fish === 1) s.add(poly(at(len - 8, -6), at(len + 12, -14), at(len + 6, 0), at(len + 12, 14), at(len - 8, 6)))
    else s.add(blob(at(len - 8, 0), at(len + 12, -14), at(len + 8, 0), at(len + 12, 14)))
    s.add(blob(at(-10, -8), at(-2, -25), at(14, -22), at(12, -8)))
    s.add(ellipse(fx, fy, len, half, ang))
    s.part(circle(...at(-13, 0), 7))
  }),
)

const golfBag = subject('golf-bag', 'Golf Bag', 'hobbies', 'outdoor', 'grass', { clubs: 2, covers: 2, strap: 2 }, (k) =>
  sketch((s) => {
    const four = k.clubs === 1
    const heads: [number, number][] = four
      ? [
          [10, 18],
          [36, 2],
          [66, 2],
          [92, 18],
        ]
      : [
          [18, 16],
          [50, 2],
          [82, 16],
        ]
    const feet = four ? [38, 46, 54, 62] : [40, 50, 60]
    // Shafts rise out of the bag; the collar covers their feet.
    heads.forEach(([x, y], i) => s.add(rod(feet[i]!, 48, x, y, 9)))
    heads.forEach(([x, y], i) => {
      const face = x < 50 ? -1 : 1
      if (i % 2 === 0) {
        // An iron's angled blade.
        s.add(rotate(rect(x - 11, y - 6, 22, 12, [3, 6]), face * 18, x, y))
      } else if (k.covers === 1) {
        // A wood in its knitted head cover, pompom on top.
        s.add(ellipse(x, y + 2, 11, 14))
        s.part(circle(x, y - 12, 7))
      } else {
        s.add(ellipse(x + face * 2, y, 12, 9, face * 12))
      }
    })
    // Carry strap, looping off the side; the body covers its ends.
    if (k.strap === 1) s.add(band(curve([66, 54], [92, 58], [94, 76], [66, 86]), 10, true))
    s.add(rect(30, 46, 40, 56, [0, 10]))
    s.add(rect(39, 60, 22, 22, [4, 8]))
    s.add(rect(30, 92, 40, 10, [0, 10]))
    s.add(rect(26, 40, 48, 14, 5))
  }),
)

const bicycle = subject('bicycle', 'Bicycle with Basket', 'hobbies', 'outdoor', 'grass', { basket: 2, spokes: 2, frame: 2 }, (k) =>
  sketch((s) => {
    const R = 27.5
    const rear: [number, number] = [27.5, 74]
    const front: [number, number] = [93.5, 74]
    // A big chainring fills the gap between the wheels down to the ground,
    // so no scrap of lawn gets caught between the tyres.
    const gear: [number, number] = [60.5, 84.5]
    // Frame first: the wheels and the chainring cover its lower ends.
    // A straight top tube, or a cruiser's swooping one.
    if (k.frame === 0) s.add(band(path([46, 34], [88, 34]), 10))
    else s.add(band(curve([46, 32], [62, 44], [78, 44], [89, 36]), 10))
    s.add(band(path(gear, [44, 24]), 10))
    s.add(band(path([85, 24], [94, 74]), 10))
    // Stem and handlebar.
    s.add(band(path([85, 28], [83, 6]), 10.5))
    s.add(band(curve([68, 10], [76, 4], [88, 4]), 10, true))
    // Saddle.
    s.add(blob([30, 22], [44, 17], [56, 20], [48, 28], [36, 28]))
    // Basket over the front wheel, flowers peeking out.
    if (k.basket === 1) {
      // Two tulips leaning apart; they cross only down inside the basket.
      s.part(ellipse(95, -3, 8, 13, -25))
      s.part(ellipse(111, -3, 8, 13, 25))
    }
    s.add(rect(90, 8, 26, 20, [2, 6]))
    s.add(rect(88, 3, 30, 11, 3))
    // Wheels: a disc for the spokes, the tyre ring over its edge.
    for (const [cx, cy] of [rear, front]) {
      s.part(circle(cx, cy, R - 5))
      const spoke = (deg: number, from: number) => {
        const a = (deg * Math.PI) / 180
        const r = R - 4
        s.stroke(path([cx + Math.cos(a) * from, cy + Math.sin(a) * from], [cx + Math.cos(a) * r, cy + Math.sin(a) * r]))
      }
      // Three spokes to a hub, or a plain cross of two.
      if (k.spokes === 1) for (const deg of [45, 135]) spoke(deg, -(R - 4))
      else for (const deg of [30, 150, 270]) spoke(deg, 0)
      s.add(arcBand(cx, cy, R, R - 9.5, 0, 180))
      s.add(arcBand(cx, cy, R, R - 9.5, 180, 360))
      if (k.spokes === 0) s.part(circle(cx, cy, 8))
    }
    s.add(circle(...gear, 17))
    s.part(circle(...gear, 7.5))
  }),
)

const acousticGuitar = subject('acoustic-guitar', 'Acoustic Guitar', 'hobbies', 'indoor', 'none', { head: 2, rosette: 2, body: 2 }, (k) =>
  sketch((s) => {
    // Tuning pegs first, tucked under the headstock.
    for (const y of [-30, -9]) {
      s.add(ellipse(31, y, 10, 6.5))
      s.add(ellipse(69, y, 10, 6.5))
    }
    s.add(rect(44, -14, 12, 50))
    if (k.head === 1) s.add(poly([40, -29], [50, -38], [60, -29], [60, -2], [40, -2]))
    else s.add(rect(40, -38, 20, 36, [8, 3]))
    // The figure-eight body: upper bout, waist, lower bout.
    if (k.body === 1) s.add(blob([50, 30], [64, 33], [69, 46], [66, 60], [78, 72], [82, 90], [70, 107], [50, 112], [30, 107], [18, 90], [22, 72], [34, 60], [31, 46], [36, 33]))
    else s.add(blob([50, 30], [68, 33], [75, 46], [69, 60], [78, 70], [82, 88], [72, 106], [50, 112], [28, 106], [18, 88], [22, 70], [31, 60], [25, 46], [32, 33]))
    // Sound hole, ringed by a rosette or plain; the bridge below it.
    if (k.rosette === 1) s.part(circle(50, 70, 17))
    s.part(circle(50, 70, k.rosette === 1 ? 8 : 9.5))
    s.part(rect(35, 94, 30, 10.5, 3.5))
  }),
)

const paintPalette = subject('paint-palette', 'Paint Palette', 'hobbies', 'indoor', 'none', { dabs: 3, brush: 2, board: 2 }, (k) =>
  sketch((s) => {
    // The board, with its notch and thumb hole.
    if (k.board === 1) s.add(blob([6, 40], [14, 14], [42, 4], [74, 6], [96, 26], [96, 52], [80, 70], [58, 74], [46, 64], [34, 72], [16, 66]))
    else s.add(blob([4, 42], [18, 12], [50, 4], [84, 10], [98, 34], [90, 60], [62, 72], [46, 62], [30, 72], [12, 64]))
    s.part(circle(24, 50, 8))
    // Dabs of paint round the rim.
    const spots: [number, number][] =
      k.dabs === 0
        ? [
            [28, 24],
            [56, 16],
            [82, 28],
          ]
        : k.dabs === 1
          ? [
              [24, 28],
              [46, 15],
              [70, 15],
              [86, 36],
            ]
          : [
              [22, 30],
              [42, 16],
              [64, 13],
              [84, 24],
              [86, 48],
            ]
    spots.forEach(([x, y], i) => {
      const w = 8 + (i % 2)
      s.part(blob([x - w, y], [x - 2, y - 7], [x + w, y - 3], [x + 4, y + 7], [x - 5, y + 6]))
    })
    // A brush laid across the board.
    s.add(band(path([108, 88], [70, 60]), 9, true))
    s.add(rotate(rect(56, 49, 18, 11, 2), 36, 65, 54.5))
    if (k.brush === 1) s.add(rotate(blob([46, 54.5], [52, 48], [58, 49], [58, 60], [52, 61]), 36, 65, 54.5))
    else s.add(rotate(rect(44, 49, 14, 11), 36, 65, 54.5))
  }),
)

const vintageCamera = subject('vintage-camera', 'Vintage Camera', 'hobbies', 'indoor', 'none', { lens: 2, top: 2, trim: 2 }, (k) =>
  sketch((s) => {
    // Controls on the top plate first; the body covers their feet.
    s.add(rect(78, 1, 15, 18, [4, 0]))
    if (k.top === 1) s.add(rect(8, -6, 30, 24, [5, 0]))
    else s.add(rect(12, 1, 20, 18, [4, 0]))
    s.add(rect(0, 14, 110, 72, 9))
    // Leatherette panel on the front.
    if (k.trim === 1) s.add(rect(10, 44, 90, 32, 5))
    // Viewfinder window.
    s.part(rect(10, 24, 22, 13, 3))
    // The lens: barrel rings stepping in to the glass.
    s.add(circle(64, 52, 27))
    s.part(circle(64, 52, 18))
    if (k.lens === 1) s.part(circle(64, 52, 9))
  }),
)

const gramophone = subject('gramophone', 'Gramophone', 'hobbies', 'indoor', 'none', { panels: 2, crank: 2, feet: 2 }, (k) =>
  sketch((s) => {
    // The horn: petal panels fanning from the throat to the open mouth.
    const throat = { x: 72, y: 44 }
    const mouth = { x: 36, y: 14 }
    const tilt = -50
    const ux = Math.cos((tilt * Math.PI) / 180)
    const uy = Math.sin((tilt * Math.PI) / 180)
    const rim = (deg: number): [number, number] => {
      const t = (deg * Math.PI) / 180
      return [mouth.x + 30 * Math.cos(t) * ux - 13 * Math.sin(t) * uy, mouth.y + 30 * Math.cos(t) * uy + 13 * Math.sin(t) * ux]
    }
    // Walk the rim; the panels split the horn evenly by bearing from the
    // throat, so the outermost ones are as broad as the rest.
    const bearing = ([x, y]: [number, number]) => Math.atan2(y - throat.y, x - throat.x)
    const ring = Array.from({ length: 720 }, (_, i) => rim(i / 2))
    let lo = 0
    let hi = 0
    ring.forEach((p, i) => {
      if (bearing(p) < bearing(ring[lo]!)) lo = i
      if (bearing(p) > bearing(ring[hi]!)) hi = i
    })
    // The far arc runs from one tangent point to the other the long way round,
    // past the rim point farthest from the throat.
    const dist = (p: [number, number]) => Math.hypot(p[0] - throat.x, p[1] - throat.y)
    let far = 0
    ring.forEach((p, i) => {
      if (dist(p) > dist(ring[far]!)) far = i
    })
    const step = (() => {
      for (let i = lo, n = 0; n < 720; i = (i + 1) % 720, n++) {
        if (i === far) return 1
        if (i === hi) return -1
      }
      return 1
    })()
    const arc: [number, number][] = []
    for (let i = lo; ; i = (i + step + 720) % 720) {
      arc.push(ring[i]!)
      if (i === hi) break
    }
    const count = 3 + k.panels
    const b0 = bearing(ring[lo]!)
    const b1 = bearing(ring[hi]!)
    const lap = 0.03
    for (let i = 0; i < count; i++) {
      const from = b0 + ((b1 - b0) * i) / count - (i === 0 ? 0 : lap)
      const to = b0 + ((b1 - b0) * (i + 1)) / count
      const pts = arc.filter((p) => bearing(p) >= from && bearing(p) <= to)
      s.add(poly([throat.x, throat.y], ...pts))
    }
    s.add(ellipse(mouth.x, mouth.y, 30, 13, tilt))
    // The neck carries the horn down into the cabinet.
    s.add(band(curve([62, 80], [80, 68], [78, 52], [throat.x, throat.y]), 10, true))
    s.part(circle(throat.x, throat.y, 7))
    // Winding crank on the cabinet's side.
    if (k.crank === 1) {
      s.add(band(path([70, 88], [93, 88], [93, 100]), 9.5, true))
      s.part(circle(93, 103, 7.5))
    }
    // Cabinet on little feet, the record on top.
    if (k.feet === 1) for (const x of [11, 59]) s.add(rect(x, 98, 14, 16, [0, 4]))
    s.add(rect(6, 74, 70, 30, [3, 5]))
    s.add(ellipse(41, 71, 30, 11))
    s.part(ellipse(41, 71, 12, 4.5))
  }),
)

const binoculars = subject('binoculars', 'Binoculars', 'hobbies', 'outdoor', 'grass', { strap: 2, bridge: 2, barrel: 2 }, (k) =>
  sketch((s) => {
    // A neck strap looping over the top, its ends under the eyepieces.
    if (k.strap === 1) s.add(band(curve([26, 22], [28, -4], [50, -14], [72, -4], [74, 22]), 9.5))
    // Hinge bridge between the barrels; the barrels cover its ends.
    if (k.bridge === 1) {
      s.add(rect(30, 34, 40, 12, 3))
      s.add(rect(30, 58, 40, 12, 3))
    } else s.add(rect(30, 36, 40, 30, 5))
    for (const cx of [22, 78]) {
      // Eyecup, eyepiece, barrel, then the objective end with its glass.
      s.add(rect(cx - 10, 8, 20, 14, [6, 0]))
      s.add(rect(cx - 13, 18, 26, 16, [3, 0]))
      if (k.barrel === 1) s.add(poly([cx - 13, 28], [cx + 13, 28], [cx + 18, 80], [cx - 18, 80]))
      else s.add(rect(cx - 16, 28, 32, 50, [6, 0]))
      s.add(circle(cx, 78, 21))
      s.part(circle(cx, 78, 12))
    }
  }),
)

export const HOBBY_SUBJECTS: readonly SgSubject[] = [fishing, golfBag, bicycle, acousticGuitar, paintPalette, vintageCamera, gramophone, binoculars]
