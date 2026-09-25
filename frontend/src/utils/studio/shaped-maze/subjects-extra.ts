import { subject, type SgSubject } from '../stained-glass/catalog'
import { band, blob, circle, curve, ellipse, poly, rect, rod, rotate, sketch } from '../stained-glass/subject-kit'

/**
 * Silhouettes drawn for the maze alone.
 *
 * The shared library (`stained-glass/subjects-*.ts`) is drawn for coloring,
 * where the pieces inside the outline matter as much as the outline. A maze
 * only keeps the outline, so these few are drawn outline-first: broad masses,
 * one clear cue each (the brim of a hat, the canopy of a golf cart, the two
 * trees a hammock hangs between), and no part narrower than about ten design
 * units, which is roughly two maze corridors at the sizes these print.
 *
 * Same rules as the rest of the library: generic objects built from plain
 * geometry, no text, no logos, nothing traced. Knobs change how the thing is
 * built, never what it is, and every combination is still checked page by
 * page before it can hold a maze.
 */

const sunHat = subject('sun-hat', 'Sun Hat', 'travel', 'outdoor', 'none', { brim: 2, crown: 2, trim: 2 }, (k) =>
  sketch((s) => {
    // Crown first, so the brim covers its foot.
    if (k.crown === 0) s.add(rect(24, 6, 52, 52, [26, 0]))
    else s.add(rect(26, 16, 48, 42, [8, 0]))
    s.add(rect(24, 40, 52, 12))
    if (k.brim === 0) s.add(ellipse(50, 58, 50, 12))
    else s.add(blob([0, 68], [16, 54], [50, 50], [84, 54], [100, 68], [50, 72]))
    // A bow on one side, or a flower on the band: a bump the outline keeps.
    if (k.trim === 0) {
      s.add(ellipse(80, 40, 10, 7, -25))
      s.add(ellipse(84, 52, 8, 6, 30))
    } else {
      s.part(circle(30, 38, 10))
    }
  }),
)

const gardenShed = subject('garden-shed', 'Garden Shed', 'garden', 'outdoor', 'grass', { roof: 2, side: 3, top: 2 }, (k) =>
  sketch((s) => {
    if (k.top === 1) {
      s.add(rect(42, 0, 16, 18))
      s.add(poly([36, 4], [50, -10], [64, 4]))
    }
    if (k.side === 1) s.add(poly([84, 50], [112, 62], [112, 100], [84, 100]))
    if (k.side === 2) s.add(rect(-18, 70, 22, 30, 5))
    s.add(rect(8, 40, 80, 60))
    if (k.roof === 0) s.add(poly([0, 46], [48, 4], [96, 46]))
    else s.add(poly([0, 48], [12, 22], [48, 6], [84, 22], [96, 48]))
    s.add(rect(36, 62, 24, 38))
    s.add(rect(66, 58, 14, 14))
  }),
)

const golfCart = subject('golf-cart', 'Golf Cart', 'hobbies', 'outdoor', 'grass', { roof: 2, bag: 2, nose: 2 }, (k) =>
  sketch((s) => {
    // Posts under the canopy; the body covers their feet.
    s.add(rod(24, 8, 18, 48, 10))
    s.add(rod(86, 8, 86, 48, 10))
    if (k.roof === 0) s.add(rect(10, 0, 88, 12, 5))
    else s.add(blob([10, 10], [54, -2], [98, 10], [54, 14]))
    if (k.bag === 1) {
      s.add(rect(94, 16, 16, 44, 5))
      s.part(circle(98, 13, 5))
      s.part(circle(106, 11, 5))
    }
    if (k.nose === 0) s.add(blob([0, 58], [10, 42], [60, 40], [98, 42], [98, 72], [4, 72]))
    else s.add(rect(0, 42, 98, 30, [14, 6]))
    s.add(rect(56, 24, 12, 22, 4))
    s.add(circle(24, 74, 14))
    s.add(circle(78, 74, 14))
  }),
)

const fishingBoat = subject('fishing-boat', 'Fishing Boat', 'hobbies', 'outdoor', 'water', { cabin: 3, motor: 2, bow: 2 }, (k) =>
  sketch((s) => {
    if (k.cabin === 0) s.add(rect(50, 6, 36, 40, [6, 0]))
    else if (k.cabin === 1) {
      s.add(rod(52, 8, 52, 44, 10))
      s.add(rod(86, 8, 86, 44, 10))
      s.add(rect(44, 0, 50, 12, 5))
    } else {
      s.add(poly([40, 44], [56, 16], [90, 16], [90, 44]))
    }
    // A fishing rod leaning back over the stern, thick enough to hold a corridor.
    s.add(band(curve([26, 44], [20, 22], [8, 4]), 10, true))
    if (k.motor === 0) {
      s.add(rect(100, 30, 16, 26, 4))
      s.add(rect(104, 52, 8, 22, 3))
    }
    if (k.bow === 0) s.add(poly([0, 38], [104, 42], [104, 70], [22, 70]))
    else s.add(blob([0, 40], [52, 44], [104, 42], [104, 70], [20, 70]))
  }),
)

const hammock = subject('hammock', 'Hammock Between Trees', 'garden', 'outdoor', 'grass', { canopy: 2, sag: 2, pillow: 2 }, (k) =>
  sketch((s) => {
    for (const x of [16, 108]) {
      s.add(rect(x - 9, 28, 18, 72, 4))
      if (k.canopy === 0) s.add(circle(x, 22, 25))
      else {
        s.add(circle(x - 12, 28, 16))
        s.add(circle(x + 12, 28, 16))
        s.add(circle(x, 10, 18))
      }
    }
    const low = k.sag === 0 ? 68 : 76
    s.add(band(curve([20, 48], [62, low], [104, 48]), 18, true))
    if (k.pillow === 1) s.part(ellipse(34, low - 12, 12, 7, 20))
  }),
)

/**
 * A low beach chair seen from the front. The library's beach chair stands
 * under a thin umbrella pole, which is lovely to color and too fine to hold a
 * corridor; this one keeps the cues that matter — the sun shade over the
 * back, the arm rests, the splayed legs — in broad parts.
 */
const deckChair = subject('deck-chair', 'Beach Chair', 'travel', 'outdoor', 'sand', { shade: 2, arms: 2, legs: 2 }, (k) =>
  sketch((s) => {
    const splay = k.legs === 0 ? 10 : 2
    s.add(rod(22, 70, 22 - splay, 100, 11))
    s.add(rod(78, 70, 78 + splay, 100, 11))
    s.add(rect(20, 14, 60, 56, [12, 0]))
    if (k.shade === 0) s.add(blob([8, 22], [50, -6], [92, 22], [50, 12]))
    else s.add(rect(14, 4, 72, 16, [8, 2]))
    if (k.arms === 0) {
      s.add(rect(0, 46, 26, 11, 5))
      s.add(rect(74, 46, 26, 11, 5))
    } else {
      s.add(band(curve([2, 58], [8, 46], [26, 44]), 11, true))
      s.add(band(curve([98, 58], [92, 46], [74, 44]), 11, true))
    }
    s.add(rect(4, 52, 12, 26, 3))
    s.add(rect(84, 52, 12, 26, 3))
    s.add(rect(12, 62, 76, 16, 5))
  }),
)

/**
 * A porch rocker in profile. The library's rocking chair has slim legs and a
 * slim runner, right for coloring and too fine for a maze on a small trim;
 * this one keeps the tilted back and the curved runner — the one cue no other
 * chair has — broad enough to walk.
 */
const porchRocker = subject('porch-rocker', 'Rocking Chair', 'home', 'indoor', 'none', { back: 2, rocker: 2, arm: 2 }, (k) =>
  sketch((s) => {
    const lift = k.rocker === 1 ? 8 : 0
    s.add(rod(30, 98, 30, 66, 14))
    s.add(rod(74, 98, 74, 66, 14))
    if (k.arm === 1) {
      s.add(rod(80, 64, 80, 36, 14))
      s.add(band(curve([28, 34], [56, 29], [86, 34]), 13, true))
    }
    const tilt = (ring: ReturnType<typeof rect>) => rotate(ring, -10, 34, 66)
    s.add(tilt(k.back === 0 ? rect(12, 0, 36, 66, 10) : rect(12, 4, 36, 62, [18, 4])))
    s.add(rect(14, 56, 76, 18, 6))
    s.add(band(curve([-4, 82 - lift], [22, 98], [52, 104], [82, 100], [108, 86 - lift]), 14, true))
  }),
)

/** A pitched tent: the door notch and the ridge flag make it a tent, not a triangle. */
const campingTent = subject('camping-tent', 'Camping Tent', 'travel', 'outdoor', 'grass', { door: 2, flag: 2, awning: 2 }, (k) =>
  sketch((s) => {
    if (k.flag === 0) {
      s.add(rod(50, 10, 50, -10, 8))
      s.add(poly([50, -14], [72, -6], [50, 2]))
    }
    if (k.awning === 1) s.add(poly([62, 40], [114, 70], [110, 80], [60, 62]))
    const notch = k.door === 0 ? 54 : 62
    s.add(poly([0, 92], [50, 6], [100, 92], [64, 92], [50, notch], [36, 92]))
  }),
)

/** A cottage with a chimney and, sometimes, a side wing: home, but not a shed. */
const cottage = subject('cottage', 'Cottage', 'home', 'outdoor', 'grass', { chimney: 2, wing: 2, porch: 2 }, (k) =>
  sketch((s) => {
    s.add(rect(k.chimney === 0 ? 64 : 22, 10, 14, 30))
    if (k.wing === 1) {
      s.add(rect(86, 58, 26, 38))
      s.add(poly([82, 62], [99, 46], [116, 62]))
    }
    if (k.porch === 1) {
      s.add(poly([-14, 66], [14, 54], [14, 66]))
      s.add(rect(-12, 64, 10, 32, 2))
    }
    s.add(rect(10, 46, 80, 50))
    s.add(poly([0, 52], [50, 8], [100, 52]))
    s.add(rect(40, 66, 20, 30))
  }),
)

/** A pickleball paddle with its ball resting on the face — one piece, not two. */
const pickleballPaddle = subject('pickleball-paddle', 'Pickleball Paddle', 'hobbies', 'outdoor', 'grass', { face: 2, grip: 2, ball: 2 }, (k) =>
  sketch((s) => {
    const grip = k.grip === 0 ? 40 : 48
    s.add(rect(40, 64, 20, grip, 6))
    if (k.grip === 1) s.add(rect(36, 60 + grip, 28, 8, 4))
    s.add(k.face === 0 ? rect(16, 0, 68, 72, [26, 18]) : blob([50, -2], [86, 20], [80, 62], [50, 72], [20, 62], [14, 20]))
    // The ball sits on the rim, half over the edge, so the outline shows its curve.
    s.add(circle(k.ball === 0 ? 92 : 8, 8, 15))
  }),
)

/** A chess knight: the horse's head is one of the most recognisable outlines there is. */
const chessKnight = subject('chess-knight', 'Chess Knight', 'hobbies', 'indoor', 'none', { base: 2, ear: 2, mane: 2 }, (k) =>
  sketch((s) => {
    if (k.base === 0) {
      s.add(rect(8, 104, 84, 16, 5))
      s.add(rect(18, 92, 64, 16, 4))
    } else {
      s.add(rect(12, 100, 76, 20, [10, 4]))
    }
    const ear = k.ear === 0 ? [58, 0] : [62, 4]
    s.add(
      poly(
        [26, 96],
        [76, 96],
        [72, 70],
        [82, 46],
        [78, 22],
        [ear[0]! + 4, ear[1]! + 10],
        [ear[0]!, ear[1]!],
        [48, 14],
        [28, 30],
        [10, 50],
        [14, 62],
        [26, 60],
        [40, 54],
        [30, 74],
      ),
    )
    if (k.mane === 1) s.add(blob([76, 24], [90, 44], [84, 72], [74, 60]))
  }),
)

/** A laced hiking boot: tall shaft, chunky toe, thick sole. */
const hikingBoot = subject('hiking-boot', 'Hiking Boot', 'hobbies', 'outdoor', 'grass', { shaft: 2, toe: 2, heel: 2 }, (k) =>
  sketch((s) => {
    const top = k.shaft === 0 ? 0 : 12
    const toe = k.toe === 0 ? blob([30, 50], [70, 50], [100, 64], [98, 84], [30, 84]) : rect(26, 50, 74, 34, [14, 10])
    s.add(toe)
    s.add(rect(18, top, 40, 84 - top, [8, 4]))
    s.add(rect(12, top - 2, 52, 12, 5))
    s.add(rect(k.heel === 0 ? 8 : 14, 80, k.heel === 0 ? 96 : 90, 14, [2, 6]))
  }),
)

/** Maze-only silhouettes, in theme order. */
export const EXTRA_MAZE_SUBJECTS: readonly SgSubject[] = [
  porchRocker,
  cottage,
  sunHat,
  deckChair,
  campingTent,
  gardenShed,
  hammock,
  golfCart,
  fishingBoat,
  pickleballPaddle,
  chessKnight,
  hikingBoot,
]
