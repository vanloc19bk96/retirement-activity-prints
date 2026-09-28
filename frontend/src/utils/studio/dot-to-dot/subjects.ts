import { subject, type SgSubject } from '../stained-glass/catalog'
import { arcBand, band, blob, circle, curve, ellipse, path, poly, rect, rod, sketch, wedge } from '../stained-glass/subject-kit'
import { pt } from '../stained-glass/geometry'

/**
 * Subjects drawn for Dot to Dot, on top of the shared retirement library.
 *
 * A dot-to-dot lives or dies by its silhouette, so these are things whose
 * outline alone says what they are — a golf flag, a sun hat, a hammock
 * between two trees — drawn from plain geometry for this game with the same
 * kit and rules as the shared library (`stained-glass/subject-kit.ts`):
 * generic objects, no text, logos or brands, nothing traced from a photo,
 * a product or another activity book, and parts chunky enough that the dots
 * on either side of a pole or a strap keep their distance.
 *
 * The outline is traced round everything at once and any paper it closes in
 * is filled, so a frame of rails and posts comes out as one solid slab (a
 * swing hanging from its beam reads as a screen). Parts either reach the
 * edge on their own, or close in one gap big enough to print as a clear
 * hole (the space under a kettle's handle, between a bench's back and seat).
 *
 * Every knob changes the outline itself (a swallowtail flag or a pennant, a
 * drooping brim or a flat one), never only the surface, so two versions of a
 * subject are two different puzzles.
 */

const golfFlag = subject('golf-flag', 'Golf Flag', 'hobbies', 'outdoor', 'grass', { flag: 3, green: 2, ball: 2 }, (k) =>
  sketch((s) => {
    // The green first; the pole stands in it.
    s.add(k.green === 1 ? blob([4, 92], [30, 82], [70, 80], [96, 90], [70, 99], [30, 99]) : ellipse(50, 91, 47, 8))
    s.add(rod(36, 90, 36, 8, 8))
    s.add(circle(36, 6, 6))
    if (k.flag === 0) s.add(poly([39, 10], [88, 22], [39, 36]))
    else if (k.flag === 1) s.add(poly([39, 10], [88, 12], [72, 23], [88, 34], [39, 36]))
    else s.add(blob([39, 10], [58, 6], [76, 12], [90, 8], [90, 32], [74, 36], [56, 30], [39, 36]))
    if (k.ball === 1) s.add(circle(70, 82, 7))
  }),
)

const sunHat = subject('sun-hat', 'Sun Hat', 'travel', 'outdoor', 'none', { crown: 2, brim: 2, trim: 3 }, (k) =>
  sketch((s) => {
    s.add(k.brim === 1 ? blob([0, 70], [16, 56], [50, 52], [84, 56], [100, 70], [84, 80], [50, 82], [16, 80]) : ellipse(50, 64, 50, 14))
    s.add(k.crown === 1 ? rect(22, 30, 56, 34, [8, 0]) : blob([20, 64], [22, 40], [50, 24], [78, 40], [80, 64]))
    s.add(rect(21, 50, 58, 11))
    if (k.trim === 1) {
      // A bow: two loops over the band's end.
      s.add(blob([72, 55], [84, 40], [94, 46], [86, 58]))
      s.add(blob([72, 55], [88, 58], [92, 70], [78, 66]))
      s.part(circle(74, 55, 6))
    } else if (k.trim === 2) {
      s.add(circle(30, 46, 11))
      s.part(circle(30, 46, 5))
    }
  }),
)

const deckChair = subject('deck-chair', 'Beach Chair', 'travel', 'outdoor', 'sand', { back: 2, arm: 2, legs: 2 }, (k) =>
  sketch((s) => {
    const lean = k.back === 1 ? 12 : 4
    // Legs first; the seat and back cover their tops.
    if (k.legs === 1) {
      s.add(rod(34, 66, 22, 98, 8))
      s.add(rod(78, 68, 90, 98, 8))
      s.add(rod(26, 90, 86, 90, 7))
    } else {
      s.add(rod(34, 66, 18, 98, 8))
      s.add(rod(76, 68, 84, 98, 8))
    }
    s.add(band(path([22 - lean, 6], [36, 68]), 14, true))
    s.add(band(curve([32, 64], [56, 70], [84, 66]), 12, true))
    if (k.arm === 1) {
      s.add(rod(28 - lean / 2, 38, 76, 44, 8))
      s.add(rod(74, 44, 76, 64, 8))
    }
  }),
)

const hammock = subject('hammock', 'Hammock', 'garden', 'outdoor', 'grass', { stand: 2, sling: 2, pillow: 2 }, (k) =>
  sketch((s) => {
    // Two posts planted in the ground. Nothing joins them along the ground:
    // a base would close the space under the sling, and the whole picture
    // would fill in as a slab.
    if (k.stand === 1) {
      // Posts leaning out, each on a foot.
      s.add(rod(18, 12, 8, 68, 10))
      s.add(rod(82, 12, 92, 68, 10))
      s.add(rect(0, 66, 18, 7, 3))
      s.add(rect(82, 66, 18, 7, 3))
    } else {
      // Upright posts, round-topped.
      s.add(rect(4, 10, 11, 62))
      s.add(rect(85, 10, 11, 62))
      s.add(circle(9.5, 10, 7.5))
      s.add(circle(90.5, 10, 7.5))
    }
    // A deep bed of cloth hung straight from the posts, stripes drawn across
    // it, the whole picture wider than tall. Ropes slanting down from tall
    // posts to a thin sagging band read as the letter M.
    const dip = k.sling === 1 ? 6 : 0
    s.add(blob([12, 18], [30, 30 + dip / 2], [50, 34 + dip], [70, 30 + dip / 2], [88, 18], [84, 32], [68, 50 + dip], [50, 56 + dip], [32, 50 + dip], [16, 32]))
    s.part(band(curve([30, 40 + dip / 2], [50, 45 + dip], [70, 40 + dip / 2]), 4.5, true))
    if (k.pillow === 1) s.add(blob([14, 16], [26, 10], [34, 20], [24, 28]))
  }),
)

const porchSwing = subject('porch-swing', 'Porch Swing', 'home', 'indoor', 'none', { back: 2, arms: 2, beam: 2 }, (k) =>
  sketch((s) => {
    s.add(k.beam === 1 ? rect(0, 0, 100, 10, 3) : rect(6, 0, 88, 8, 3))
    s.add(rod(18, 8, 16, 50, 6))
    s.add(rod(82, 8, 84, 50, 6))
    s.add(k.back === 1 ? blob([10, 72], [10, 48], [30, 38], [50, 44], [70, 38], [90, 48], [90, 72]) : rect(10, 42, 80, 30, 5))
    s.add(rect(4, 68, 92, 12, 4))
    if (k.arms === 1) {
      s.add(rect(2, 54, 14, 26, 5))
      s.add(rect(84, 54, 14, 26, 5))
    }
    s.part(rect(20, 50, 60, 6, 3))
  }),
)

const fishingBoat = subject('fishing-boat', 'Fishing Boat', 'travel', 'outdoor', 'water', { cabin: 2, hull: 2, top: 2 }, (k) =>
  sketch((s) => {
    const cx = k.cabin === 1 ? 26 : 48
    if (k.top === 1) {
      s.add(rod(cx + 14, 44, cx + 14, 4, 7))
      s.add(poly([cx + 17, 6], [cx + 36, 14], [cx + 17, 22]))
    } else s.add(rect(cx + 2, 30, 26, 8, 3))
    s.add(rect(cx, 36, 32, 30, [5, 0]))
    s.part(rect(cx + 6, 42, 20, 12, 3))
    s.add(k.hull === 1 ? poly([0, 60], [100, 56], [88, 90], [14, 90]) : blob([0, 58], [50, 64], [102, 54], [86, 90], [20, 92]))
    s.part(rect(12, 70, 72, 6, 3))
  }),
)

const tennisRacket = subject('tennis-racket', 'Tennis Racket', 'hobbies', 'outdoor', 'grass', { head: 2, throat: 2, ball: 2 }, (k) =>
  sketch((s) => {
    // The frame in two halves meeting top and bottom, so the strung face is
    // paper the outline closes in: it prints as the racket's big oval hole.
    const rx = k.head === 1 ? 32 : 27
    const ry = k.head === 1 ? 30 : 34
    const cy = 36
    const arc = (from: number, to: number) =>
      Array.from({ length: 25 }, (_, i) => {
        const a = ((from + ((to - from) * i) / 24) * Math.PI) / 180
        return pt(50 + rx * Math.cos(a), cy + ry * Math.sin(a))
      })
    s.add(band(arc(80, 280), 8))
    s.add(band(arc(-100, 100), 8))
    // The throat: two arms from the frame to the handle, or one solid wedge.
    const base = cy + ry - 2
    if (k.throat === 1) s.add(poly([36, base - 4], [64, base - 4], [54, base + 16], [46, base + 16]))
    else {
      s.add(rod(38, base + 1, 47, base + 16, 7))
      s.add(rod(62, base + 1, 53, base + 16, 7))
    }
    s.add(rect(44, base + 12, 12, 100 - base - 12, 3))
    s.add(rect(42, 94, 16, 7, 3))
    if (k.ball === 1) {
      s.add(circle(68, 90, 10))
      s.part(band(curve([61, 84], [66, 90], [61, 96]), 3, true))
    }
  }),
)

const golfCart = subject('golf-cart', 'Golf Cart', 'hobbies', 'outdoor', 'grass', { roof: 2, bag: 2, nose: 2 }, (k) =>
  sketch((s) => {
    if (k.bag === 1) {
      // A golf bag on the back, clubs showing.
      s.add(rod(6, 30, 2, 18, 7))
      s.add(rod(12, 30, 14, 16, 7))
      s.add(rect(0, 28, 16, 38, 4))
    }
    s.add(rod(20, 10, 22, 56, 7))
    s.add(rod(76, 10, 72, 50, 7))
    s.add(k.roof === 1 ? blob([10, 12], [48, 2], [88, 12], [48, 14]) : rect(10, 4, 80, 10, 4))
    s.add(rect(18, 44, 30, 12, 4))
    s.add(k.nose === 1 ? poly([12, 56], [72, 50], [96, 60], [96, 78], [12, 78]) : rect(12, 54, 84, 24, 7))
    s.add(circle(30, 80, 13))
    s.add(circle(80, 80, 13))
    s.part(circle(30, 80, 5))
    s.part(circle(80, 80, 5))
  }),
)

const readingGlasses = subject('reading-glasses', 'Reading Glasses', 'home', 'indoor', 'none', { lens: 2, arms: 2, bridge: 2 }, (k) =>
  sketch((s) => {
    const lens = (cx: number) => (k.lens === 1 ? rect(cx - 21, 38, 42, 30, 11) : circle(cx, 52, 19))
    const glass = (cx: number) => (k.lens === 1 ? rect(cx - 15, 44, 30, 18, 7) : circle(cx, 52, 13))
    // Arms first, folded back under the frames or reaching out to the sides.
    if (k.arms === 1) {
      s.add(band(curve([10, 46], [4, 30], [8, 12]), 9, true))
      s.add(band(curve([90, 46], [96, 30], [92, 12]), 9, true))
    } else {
      s.add(band(path([8, 48], [-2, 64], [0, 80]), 9, true))
      s.add(band(path([92, 48], [102, 64], [100, 80]), 9, true))
    }
    s.add(k.bridge === 1 ? arcBand(50, 52, 12, 5, 200, 340) : rect(38, 44, 24, 8, 4))
    s.add(lens(28))
    s.add(lens(72))
    s.part(glass(28))
    s.part(glass(72))
  }),
)

const kettle = subject('kettle', 'Tea Kettle', 'home', 'indoor', 'none', { body: 2, spout: 2, handle: 2 }, (k) =>
  sketch((s) => {
    // Spout first, rising from low on the body; the body covers its root.
    s.add(k.spout === 1 ? band(curve([64, 80], [84, 68], [96, 46]), 11, true) : rod(64, 82, 100, 56, 11))
    // The handle arches well clear of the lid, so the paper under it prints
    // as a hole — the kettle's cue. A low arch leaves only a sliver, and
    // the outline fills in as an onion.
    const peak = k.handle === 1 ? 0 : 8
    const foot = k.handle === 1 ? 24 : 28
    s.add(band(curve([foot, 58], [foot - 2, peak + 18], [50, peak], [102 - foot, peak + 18], [100 - foot, 58]), 8, true))
    // A dome on a wide base, or an upright pot with rounded shoulders; both with a flat lid.
    s.add(k.body === 1 ? rect(16, 44, 68, 48, [18, 6]) : blob([10, 92], [8, 72], [18, 54], [36, 46], [64, 46], [82, 54], [92, 72], [90, 92]))
    s.add(rect(8, 88, 84, 8, 4))
    s.add(ellipse(50, 46, 16, 5))
    s.add(circle(50, 40, 5))
  }),
)

const lantern = subject('lantern', 'Camping Lantern', 'travel', 'outdoor', 'none', { handle: 2, glass: 2, base: 2 }, (k) =>
  sketch((s) => {
    // A carry loop over the cap: a tall bail, or a ring on a short neck. The
    // paper inside either prints as a hole.
    if (k.handle === 1) {
      s.add(rect(44, 14, 12, 12))
      s.add(arcBand(50, 10, 11, 5, 0, 360))
    } else s.add(arcBand(50, 20, 19, 12, 180, 360))
    // A roof wider than the glass and a foot wider still: the lantern's waist.
    s.add(poly([30, 18], [70, 18], [88, 32], [12, 32]))
    s.add(k.glass === 1 ? blob([28, 32], [22, 54], [28, 76], [72, 76], [78, 54], [72, 32]) : rect(28, 32, 44, 44))
    // The flame, and the two guard wires either side of it.
    s.part(ellipse(50, 54, 6, 11))
    s.part(rect(34, 40, 5, 28, 2.5))
    s.part(rect(61, 40, 5, 28, 2.5))
    s.add(k.base === 1 ? poly([24, 74], [76, 74], [90, 96], [10, 96]) : rect(14, 74, 72, 14, 5))
  }),
)

const parkBench = subject('park-bench', 'Park Bench', 'garden', 'outdoor', 'grass', { back: 2, arms: 2, legs: 2 }, (k) =>
  sketch((s) => {
    // Long and low, so it never reads as a cabinet. Legs and back posts
    // first; the rails cover them. The gap between the back and the seat is
    // the one hole, a long slot that says "bench".
    if (k.legs === 1) {
      s.add(band(curve([14, 48], [10, 64], [4, 80]), 9, true))
      s.add(band(curve([86, 48], [90, 64], [96, 80]), 9, true))
    } else {
      s.add(rect(10, 44, 10, 36))
      s.add(rect(80, 44, 10, 36))
    }
    s.add(rect(14, 4, 9, 46))
    s.add(rect(77, 4, 9, 46))
    s.add(k.back === 1 ? blob([6, 30], [8, 10], [30, 2], [50, 0], [70, 2], [92, 10], [94, 30]) : rect(6, 6, 88, 24, 5))
    s.add(rect(0, 42, 100, 11, 4))
    if (k.arms === 1) {
      s.add(band(curve([3, 44], [0, 34], [8, 28], [18, 32]), 8, true))
      s.add(band(curve([97, 44], [100, 34], [92, 28], [82, 32]), 8, true))
    }
  }),
)

const mailbox = subject('mailbox', 'Country Mailbox', 'home', 'outdoor', 'grass', { flag: 2, post: 2, flowers: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(40, 44, 14, 54))
    if (k.post === 1) s.add(rod(46, 72, 70, 50, 8))
    if (k.flowers === 1) {
      s.add(blob([22, 98], [26, 84], [36, 78], [44, 86], [58, 80], [70, 88], [72, 98]))
      s.part(circle(34, 86, 5))
      s.part(circle(62, 88, 5))
    }
    // The flag on its side: raised (up past the roof) or lowered along the box.
    s.add(k.flag === 1 ? rect(72, 2, 8, 38, 3) : rect(72, 28, 8, 14, 3))
    s.add(k.flag === 1 ? rect(72, 0, 24, 12, 3) : rect(72, 30, 26, 10, 3))
    // The box, side on: a long loaf with a rounded roof.
    s.add(rect(4, 14, 76, 36, [17, 3]))
    s.part(rect(10, 22, 7, 22, 3))
  }),
)

const tableLamp = subject('table-lamp', 'Table Lamp', 'home', 'indoor', 'none', { shade: 3, stem: 2, base: 2 }, (k) =>
  sketch((s) => {
    if (k.stem === 1) s.add(blob([44, 44], [56, 44], [64, 64], [56, 82], [44, 82], [36, 64]))
    else s.add(rect(44, 44, 12, 40))
    s.add(k.base === 1 ? ellipse(50, 88, 30, 8) : rect(24, 82, 52, 12, 5))
    if (k.shade === 0) s.add(poly([30, 2], [70, 2], [88, 46], [12, 46]))
    else if (k.shade === 1) s.add(rect(14, 4, 72, 42, 6))
    else s.add(blob([30, 4], [70, 4], [80, 24], [92, 46], [50, 50], [8, 46], [20, 24]))
    s.part(rect(20, 36, 60, 6, 3))
  }),
)

const armchair = subject('armchair', 'Armchair', 'home', 'indoor', 'none', { back: 2, arms: 2, legs: 2 }, (k) =>
  sketch((s) => {
    if (k.legs === 1) {
      s.add(rod(16, 80, 12, 98, 8))
      s.add(rod(84, 80, 88, 98, 8))
    } else {
      s.add(rect(12, 80, 12, 18, [0, 4]))
      s.add(rect(76, 80, 12, 18, [0, 4]))
    }
    s.add(k.back === 1 ? blob([14, 52], [12, 20], [30, 4], [50, 10], [70, 4], [88, 20], [86, 52]) : rect(16, 4, 68, 50, [18, 0]))
    s.add(rect(10, 56, 80, 26, 6))
    s.part(rect(22, 50, 56, 14, 6))
    if (k.arms === 1) {
      s.add(rect(0, 38, 22, 44, [10, 4]))
      s.add(rect(78, 38, 22, 44, [10, 4]))
    } else {
      s.add(blob([2, 80], [0, 50], [8, 36], [22, 42], [22, 80]))
      s.add(blob([98, 80], [100, 50], [92, 36], [78, 42], [78, 80]))
    }
  }),
)

const tent = subject('tent', 'Camping Tent', 'travel', 'outdoor', 'grass', { shape: 2, flag: 2, awning: 2 }, (k) =>
  sketch((s) => {
    if (k.flag === 1) {
      s.add(rod(50, 30, 50, 2, 6))
      s.add(poly([53, 3], [76, 10], [53, 17]))
    } else {
      // The poles cross above the ridge.
      s.add(rod(42, 30, 58, 8, 7))
      s.add(rod(58, 30, 42, 8, 7))
    }
    s.add(k.shape === 1 ? blob([2, 92], [10, 50], [50, 20], [90, 50], [98, 92]) : poly([50, 18], [98, 92], [2, 92]))
    if (k.awning === 1) s.add(poly([58, 44], [100, 64], [96, 70], [66, 70]))
    // The door, a flap that stops short of the ground.
    s.part(k.shape === 1 ? blob([38, 84], [40, 62], [50, 54], [60, 62], [62, 84]) : poly([50, 42], [64, 84], [36, 84]))
  }),
)

const birdbath = subject('birdbath', 'Birdbath', 'garden', 'outdoor', 'grass', { bowl: 2, pedestal: 2, bird: 2 }, (k) =>
  sketch((s) => {
    if (k.bird === 1) {
      s.add(blob([66, 34], [70, 22], [80, 18], [88, 22], [98, 20], [90, 30], [82, 38], [72, 38]))
      s.part(circle(80, 24, 2.5))
    }
    s.add(k.pedestal === 1 ? blob([40, 44], [60, 44], [54, 64], [60, 84], [40, 84], [46, 64]) : rect(42, 44, 16, 42))
    s.add(poly([30, 84], [70, 84], [80, 98], [20, 98]))
    s.add(k.bowl === 1 ? blob([4, 34], [96, 34], [80, 50], [50, 54], [20, 50]) : rect(6, 32, 88, 14, [3, 8]))
    s.add(rect(2, 28, 96, 8, 4))
  }),
)

/**
 * The shared library's lighthouse, redrawn for a silhouette: its rocky islet
 * flared the foot into a vase and its light beams stuck out like arms. Here
 * the tower stands on a low plinth or a flat reef, and the cue is the top —
 * a gallery wider than the tower, the lantern room, the roof — with the door
 * and windows drawn in.
 */
const lighthouse = subject('lighthouse', 'Lighthouse', 'travel', 'outdoor', 'water', { roof: 2, tower: 2, base: 2 }, (k) =>
  sketch((s) => {
    const half = k.tower === 1 ? 20 : 16
    s.add(poly([50 - half + 6, 40], [50 + half - 6, 40], [50 + half, 90], [50 - half, 90]))
    s.add(k.base === 1 ? blob([6, 100], [12, 92], [36, 88], [64, 88], [88, 92], [94, 100], [50, 102]) : rect(24, 88, 52, 12, 3))
    s.add(rect(38, 16, 24, 22))
    s.add(k.roof === 1 ? poly([34, 18], [66, 18], [50, 0]) : wedge(50, 18, 16, 180, 360))
    s.add(circle(50, k.roof === 1 ? 2 : 3, 4))
    s.add(rect(28, 34, 44, 8, 3))
    // Lantern glass, a window, the door.
    s.part(rect(43, 21, 14, 11, 2))
    s.part(rect(45, 52, 10, 10, 3))
    s.part(rect(43, 70, 14, 16, [7, 0]))
  }),
)

/** The shared library's subjects this game draws its own way, under the same ids. */
export const DTD_REDRAWN_SUBJECTS: readonly SgSubject[] = [lighthouse]

/** Dot to Dot's own subjects, grouped by theme like the shared library. */
export const DTD_EXTRA_SUBJECTS: readonly SgSubject[] = [
  porchSwing,
  readingGlasses,
  kettle,
  mailbox,
  tableLamp,
  armchair,
  sunHat,
  deckChair,
  fishingBoat,
  lantern,
  tent,
  hammock,
  parkBench,
  birdbath,
  golfFlag,
  golfCart,
  tennisRacket,
]


