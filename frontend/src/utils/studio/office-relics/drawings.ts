import { createRng } from '../studio-rng'

/**
 * The Office Relics picture library: one original, adjustable line drawing per object.
 *
 * Every drawing here was authored for this game from plain geometry. None is
 * traced from a photograph, a product listing or another puzzle book, and none
 * carries a maker's shape, badge, wordmark or model detail: a typewriter is the
 * idea of a typewriter (paper, platen, round keys, the return lever), which is
 * what a reader recognises and all a puzzle needs. That keeps the pages safe to
 * sell and keeps the answer a kind of object rather than a brand.
 *
 * Drawing rules, and why:
 *
 * * **Outlines only.** Two ink weights — the main line for silhouettes and
 *   parts, `fine` for inner detail — and no shading, hatching or gradients. A
 *   KDP interior is one ink on uncoated paper; grey tones band or vanish.
 *   Solid ink is kept to a handful of tiny marks (a cursor, punched holes).
 * * **No text.** No letters, digits or wordmarks anywhere, not even on a
 *   calendar or a phone dial. Writing on a picture reads as a clue, prints as a
 *   smudge and is exactly where a logo would sneak in. Arithmetic marks on a
 *   calculator key are the one exception, and they are shapes, not type.
 * * **The whole object, front and centre.** No backgrounds, no cropped edges,
 *   no hands. The layout fits each drawing whole inside its box.
 * * **Details sized for print.** Every drawing is designed on a box roughly
 *   100 units across and printed at 1.5–3 inches, so a unit is at least ~1.4
 *   printed pixels. Parallel detail lines sit at least 3 units apart, and
 *   holes and keys are at least 2 units across, so nothing fills in or
 *   disappears after export.
 * * **One unmistakable cue per object.** The drawing leads with what tells it
 *   apart from its nearest lookalike: the handset on a fax (not a printer), the
 *   card slot and card rack on a punch clock (not a wall clock), the fanned
 *   cards on a rotary card file (not a recipe box).
 *
 * **Knobs.** Real offices held many makes of every object: filing cabinets with
 * three drawers and with four, phones with round keys and square ones. Each
 * drawing exposes a few such choices (`knobs`, each with a count of options),
 * and a page deals one combination per picture — seeded by the seller's salt
 * and the page, so two sellers' books rarely print the same picture of the same
 * object. A knob only ever changes how the object is built, never the cue that
 * names it, so every combination is still one unmistakable object. Choice 0 of
 * every knob is the reference drawing. `mirror` marks drawings whose mirror
 * image is still right; a typewriter's return lever or a phone dial's finger
 * stop has a side, so those are never flipped.
 *
 * Coordinates are in each drawing's own design space (`width` x `height`); the
 * layout scales the whole drawing uniformly into its box. Elements use the SVG
 * vocabulary Studio's Lucide converter already reads (path, rect, circle,
 * ellipse, line, polyline, polygon), plus two style flags of our own. Paths use
 * absolute commands only (M L H V Q C A Z), so a drawing can be mirrored exactly.
 */

export type RelicShape = 'path' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon'

/**
 * SVG attributes, plus:
 * * `fine: 1` — draw at the detail weight instead of the main line weight.
 * * `fill: 'ink' | 'paper'` — solid black, or white that hides lines behind
 *   it (a slip of paper on a spike). Anything else is outline only.
 */
export type RelicAttrs = Readonly<Record<string, string | number>>
export type RelicElement = readonly [RelicShape, RelicAttrs]

export interface RelicDrawing {
  /** Design-space size. Every element sits inside it. */
  width: number
  height: number
  elements: readonly RelicElement[]
}

/** How many options each knob offers. */
export type RelicKnobs = Readonly<Record<string, number>>
/** One chosen option per knob, each in `[0, count)`. */
export type RelicKnobValues = Readonly<Record<string, number>>

export interface RelicArt {
  knobs: RelicKnobs
  /** The mirror image is still a correct picture of the object. */
  mirror: boolean
  draw: (k: RelicKnobValues) => RelicDrawing
}

const art = (knobs: RelicKnobs, mirror: boolean, draw: (k: RelicKnobValues) => RelicDrawing): RelicArt => ({
  knobs,
  mirror,
  draw,
})

// ---------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------

const FINE = { fine: 1 } as const
const INK = { fill: 'ink' } as const
const PAPER = { fill: 'paper' } as const

type Opts = Readonly<Record<string, string | number>>

const r2 = (n: number) => Math.round(n * 100) / 100

const rect = (x: number, y: number, width: number, height: number, rx = 0, o: Opts = {}): RelicElement => [
  'rect',
  { x: r2(x), y: r2(y), width: r2(width), height: r2(height), rx, ...o },
]
const circle = (cx: number, cy: number, r: number, o: Opts = {}): RelicElement => [
  'circle',
  { cx: r2(cx), cy: r2(cy), r, ...o },
]
const ellipse = (cx: number, cy: number, rx: number, ry: number, o: Opts = {}): RelicElement => [
  'ellipse',
  { cx, cy, rx, ry, ...o },
]
const line = (x1: number, y1: number, x2: number, y2: number, o: Opts = {}): RelicElement => [
  'line',
  { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), ...o },
]
const path = (d: string, o: Opts = {}): RelicElement => ['path', { d, ...o }]
const polygon = (pts: readonly (readonly [number, number])[], o: Opts = {}): RelicElement => [
  'polygon',
  { points: pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' '), ...o },
]

/** The elements, when the condition holds. */
const when = (condition: boolean, elements: readonly RelicElement[]): readonly RelicElement[] => (condition ? elements : [])

/** Point on a circle; angle in degrees, clockwise from 3 o'clock (y points down). */
function onRing(cx: number, cy: number, radius: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [r2(cx + radius * Math.cos(a)), r2(cy + radius * Math.sin(a))]
}

/** Short spoke between two radii — dial ticks, fan wires, reel teeth. */
function spoke(cx: number, cy: number, from: number, to: number, deg: number, o: Opts = FINE): RelicElement {
  const [x1, y1] = onRing(cx, cy, from, deg)
  const [x2, y2] = onRing(cx, cy, to, deg)
  return line(x1, y1, x2, y2, o)
}

/** A row of evenly spaced things. */
function row<T>(count: number, start: number, step: number, make: (at: number, i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => make(r2(start + i * step), i))
}

/**
 * Path commands in a local frame, rotated and moved into place.
 *
 * Only commands whose arguments are all points (M, L, Q, C) and Z, so a
 * rotation is just a rotation of every pair — which is all a tilted slide rule
 * or pen needs.
 */
type Cmd = readonly [string, ...number[]]
function turned(cmds: readonly Cmd[], deg: number, dx: number, dy: number): string {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return cmds
    .map(([op, ...nums]) => {
      const pts: string[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = nums[i]!
        const y = nums[i + 1]!
        pts.push(`${r2(x * cos - y * sin + dx)} ${r2(x * sin + y * cos + dy)}`)
      }
      return [op, ...pts].join(' ')
    })
    .join(' ')
}
function turnPoint(x: number, y: number, deg: number, dx: number, dy: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [r2(x * Math.cos(a) - y * Math.sin(a) + dx), r2(x * Math.sin(a) + y * Math.cos(a) + dy)]
}

/** Rectangle in a local frame, as a rotated closed path. */
function turnedRect(x: number, y: number, w: number, h: number, deg: number, dx: number, dy: number, o: Opts = {}) {
  return path(
    turned(
      [
        ['M', x, y],
        ['L', x + w, y],
        ['L', x + w, y + h],
        ['L', x, y + h],
        ['Z'],
      ],
      deg,
      dx,
      dy,
    ),
    o,
  )
}

/** A desk-phone handset, lying left to right, `w` wide with its top at `y`. */
function handset(x: number, y: number, w: number): RelicElement {
  const s = w / 96
  const p = (px: number, py: number) => `${r2(x + px * s)} ${r2(y + py * s)}`
  return path(
    `M${p(0, 13)} Q${p(0, 3)} ${p(12, 3)} H${r2(x + 22 * s)} Q${p(28, 3)} ${p(30, 0)} ` +
      `Q${p(48, -10)} ${p(66, 0)} Q${p(68, 3)} ${p(74, 3)} H${r2(x + 84 * s)} ` +
      `Q${p(96, 3)} ${p(96, 13)} Q${p(96, 18)} ${p(88, 18)} H${r2(x + 70 * s)} ` +
      `Q${p(66, 18)} ${p(64, 14)} Q${p(48, 6)} ${p(32, 14)} Q${p(30, 18)} ${p(26, 18)} ` +
      `H${r2(x + 8 * s)} Q${p(0, 18)} ${p(0, 13)} Z`,
  )
}

/** A reel: rim, hub and `holes` round cut-outs. */
function reel(cx: number, cy: number, radius: number, holes: number, turn = 0): RelicElement[] {
  // Five small windows read as a reel too; they just have to stay apart.
  const holeR = r2(radius * (holes > 4 ? 0.21 : 0.27))
  const at = r2(radius * 0.56)
  return [
    circle(cx, cy, radius),
    circle(cx, cy, r2(radius * 0.16)),
    ...row(holes, turn, 360 / holes, (deg) => {
      const [hx, hy] = onRing(cx, cy, at, deg)
      return circle(hx, hy, holeR, FINE)
    }),
  ]
}

/** A small key, square or round, centred on its cell. */
const key = (round: boolean, x: number, y: number, w: number, h: number, rx: number, o: Opts = {}): RelicElement =>
  round ? circle(x + w / 2, y + h / 2, r2(Math.min(w, h) / 2 + 0.3), o) : rect(x, y, w, h, rx, o)

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

const rotaryPhone = art({ body: 2, base: 2, dial: 2 }, false, (k) => {
  const domed = k.body === 1
  const prong = domed ? 7 : 4
  return {
    width: 112,
    height: 92,
    elements: [
      handset(8, 16, 96),
      rect(26, 34, 5, prong, 1),
      rect(81, 34, 5, prong, 1),
      path(
        domed
          ? 'M14 84 Q10 54 24 43 Q30 38.5 40 38.5 H72 Q82 38.5 88 43 Q102 54 98 84'
          : 'M14 84 L22 44 Q24 38 32 38 H80 Q88 38 90 44 L98 84',
      ),
      ...(k.base === 1 ? [line(14, 84, 98, 84), rect(16, 84, 14, 5, 2), rect(82, 84, 14, 5, 2)] : [rect(8, 84, 96, 6, 3)]),
      circle(56, 62, 19),
      ...(k.dial === 1 ? [circle(56, 62, 6, FINE), circle(56, 62, 2.5, FINE)] : [circle(56, 62, 7, FINE)]),
      ...row(10, 60, 30, (deg) => {
        const [x, y] = onRing(56, 62, k.dial === 1 ? 13 : 13.3, deg)
        return circle(x, y, k.dial === 1 ? 2.8 : 2.4, FINE)
      }),
      spoke(56, 62, 15.5, 19.5, 38, {}),
    ],
  }
})

const pushButtonPhone = art({ keys: 2, body: 2, strip: 2 }, true, (k) => {
  const round = k.body === 1
  return {
    width: 112,
    height: 92,
    elements: [
      handset(8, 16, 96),
      rect(26, 34, 5, round ? 6 : 4, 1),
      rect(81, 34, 5, round ? 6 : 4, 1),
      path(
        round
          ? 'M12 84 Q8 52 22 42 Q28 38.5 38 38.5 H74 Q84 38.5 90 42 Q104 52 100 84'
          : 'M12 84 L18 46 Q20 38 28 38 H84 Q92 38 94 46 L100 84',
      ),
      rect(6, 84, 100, 6, 3),
      ...[45, 53.5, 62, 70.5].flatMap((y) => row(3, 42, 10, (x) => key(k.keys === 1, x, y, 8, 5.5, 1.5))),
      ...(k.strip === 1
        ? row(4, 29, 14, (x) => rect(x, 78, 10, 3.5, 1, FINE))
        : row(6, 24.5, 11, (x) => rect(x, 78, 8, 3.5, 1, FINE))),
    ],
  }
})

const faxMachine = art({ keys: 2, page: 2, panel: 2 }, true, (k) => ({
  width: 120,
  height: 92,
  elements: [
    // the page being sent, standing in the feeder
    path('M64 30 L67 5 H101 L99 30'),
    path(k.page === 1 ? 'M72 11 H90 M71.5 15.5 H94 M71 20 H86 M70.5 24.5 H92' : 'M72 11 H95 M71.5 16 H91 M71 21 H94', FINE),
    ...when(k.page === 1, [path('M94.5 5 L100.5 10.5', FINE)]),
    path('M8 46 L16 30 H104 L112 46 V76 Q112 80 108 80 H12 Q8 80 8 76 Z'),
    line(8, 46, 112, 46),
    // the phone that makes it a fax
    handset(14, 30.5, 44),
    ...(k.panel === 1
      ? [rect(62, 50, 20, 6, 1.5, FINE), rect(62, 61, 8, 5, 1.5, FINE), rect(74, 61, 8, 5, 1.5, FINE)]
      : [rect(62, 52, 20, 8, 1.5, FINE)]),
    ...[51, 58, 65, 72].flatMap((y) => row(3, 88, 7.5, (x) => key(k.keys === 1, x, y, 5, 4, 1, FINE))),
    // the copy coming out of the front
    line(16, 64, 56, 64),
    path('M20 64 Q18 78 24 88 H56 Q51 78 53 64', PAPER),
    path('M26 72 H48 M26.5 77 H46 M27.5 82 H49', FINE),
  ],
}))

const brickPhone = art({ antenna: 2, keys: 2, grille: 2 }, true, (k) => ({
  width: 50,
  height: 124,
  elements: [
    ...(k.antenna === 1 ? [rect(30, 6, 4, 22, 2), circle(32, 4, 2.6)] : [rect(29, 2, 6, 26, 3)]),
    rect(8, 24, 34, 96, 7),
    ...(k.grille === 1 ? row(4, 18.25, 4.5, (x) => circle(x, 34, 1.1, FINE)) : [path('M18 32 H32 M18 36 H32', FINE)]),
    rect(14, 43, 22, 12, 1.5),
    rect(14, 59, 9, 4, 1.5, FINE),
    rect(27, 59, 9, 4, 1.5, FINE),
    ...[67, 75, 83, 91].flatMap((y) => row(3, 13.5, 8, (x) => key(k.keys === 1, x, y, 7, 5, 1.5, FINE))),
    ...(k.grille === 1 ? [path('M20 106 H30', FINE)] : row(3, 20, 5, (x) => circle(x, 106, 1.2, FINE))),
  ],
}))

/** Which shelf plug each patch cord leaves from, the jack (row, column) it ends in, and its bend. */
const SWITCHBOARD_CORDS: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [
    [1, 2, 1, -6],
    [4, 0, 4, 10],
    [6, 3, 6, 6],
  ],
  [
    [0, 1, 0, -7],
    [3, 2, 3, 6],
    [7, 0, 5, 9],
  ],
  [
    [2, 0, 2, -9],
    [5, 1, 4, 9],
  ],
]

const switchboard = art({ jacks: 2, cords: 3, desk: 2 }, true, (k) => {
  const rows = k.jacks === 1 ? [16, 30, 44] : [14, 24, 34, 44]
  const cols = k.jacks === 1 ? row(6, 22, 12, (x) => x) : row(7, 21, 10.3, (x) => x)
  const jackR = k.jacks === 1 ? 2.6 : 2.2
  return {
    width: 104,
    height: 112,
    elements: [
      rect(10, 4, 84, 56, 2),
      ...rows.flatMap((y) => cols.map((x) => circle(x, y, jackR, FINE))),
      path('M2 60 H102 L98 72 H6 Z'),
      ...row(8, 16, 10, (x) => rect(x, 63, 4, 6, 1)),
      // patch cords lifted from the shelf into jacks
      ...SWITCHBOARD_CORDS[k.cords]!.map(([plug, r, c, bend]) => {
        const px = 18 + plug * 10
        const jx = cols[Math.min(c, cols.length - 1)]!
        const jy = rows[Math.min(r, rows.length - 1)]! + jackR
        return path(`M${px} 63 Q${r2((px + jx) / 2 + bend)} ${r2((63 + jy) / 2)} ${jx} ${r2(jy)}`, FINE)
      }),
      rect(12, 72, 80, 34, 2),
      ...when(k.desk === 1, [rect(38, 78, 28, 10, 1.5, FINE), circle(52, 83, 1.5, FINE)]),
      path('M12 106 V110 M92 106 V110'),
    ],
  }
})

const phoneBook = art({ cover: 2, pages: 2 }, true, (k) => ({
  width: 92,
  height: 104,
  elements: [
    path('M14 6 L6 12 V98 L14 92'),
    path('M6 98 H74 L82 92'),
    path(k.pages === 1 ? 'M10 94.5 H76' : 'M10 94.5 H76 M8 96.5 H75', FINE),
    rect(14, 6, 68, 86, 3),
    ...(k.cover === 1 ? [rect(22, 14, 52, 70, 2, FINE), rect(26, 18, 44, 62, 1.5, FINE)] : [rect(22, 14, 52, 70, 2, FINE)]),
    handset(26, 40, 44),
    path('M33 55 Q48 47 63 55 L66 64 H30 Z'),
    ...(k.cover === 1 ? [circle(48, 58.5, 3.2, FINE), line(34, 70, 62, 70, FINE)] : [circle(48, 58.5, 3, FINE)]),
  ],
}))

// ---------------------------------------------------------------------------
// Typing and writing
// ---------------------------------------------------------------------------

const typewriter = art({ keys: 2, body: 2, paper: 2 }, false, (k) => ({
  width: 120,
  height: 86,
  elements: [
    path('M40 29 V4 H80 V29'),
    path(k.paper === 1 ? 'M46 9 H74 M46 13.5 H68 M46 18 H72 M46 22.5 H62' : 'M46 10 H74 M46 15 H70 M46 20 H73', FINE),
    rect(16, 26, 88, 9, 4.5),
    circle(10, 30.5, 5.5),
    circle(110, 30.5, 5.5),
    path('M19 27 L9 17 L5 19'),
    path(k.body === 1 ? 'M20 35 H100 Q106 35 108 45 L111 67 H9 L12 45 Q14 35 20 35 Z' : 'M20 35 H100 L109 67 H11 Z'),
    circle(31, 41, 4.5, FINE),
    circle(89, 41, 4.5, FINE),
    path('M47 35 A13 9 0 0 0 73 35', FINE),
    ...(k.keys === 1
      ? [
          ...row(11, 26, 6.8, (x) => circle(x, 46.5, 1.9, FINE)),
          ...row(10, 29.4, 6.8, (x) => circle(x, 52, 1.9, FINE)),
          ...row(9, 32.8, 6.8, (x) => circle(x, 57.5, 1.9, FINE)),
          ...row(8, 36.2, 6.8, (x) => circle(x, 63, 1.9, FINE)),
        ]
      : [
          ...row(10, 26, 7.5, (x) => circle(x, 50, 2.4, FINE)),
          ...row(9, 29.75, 7.5, (x) => circle(x, 56.5, 2.4, FINE)),
          ...row(8, 33.5, 7.5, (x) => circle(x, 63, 2.4, FINE)),
        ]),
    rect(5, 67, 110, 15, 4),
    rect(38, 71.5, 44, 5, 2.5),
  ],
}))

const fountainPen = art({ angle: 3, clip: 2, band: 2 }, true, (k) => {
  const deg = [-35, -29, -23][k.angle]!
  const dx = 60
  const dy = 43
  return {
    width: 120,
    height: 86,
    elements: [
      path(turned([['M', -20, -7], ['L', -54, -7], ['Q', -62, -7, -62, 0], ['Q', -62, 7, -54, 7], ['L', -20, 7]], deg, dx, dy)),
      ...(k.clip === 1
        ? [
            path(turned([['M', -52, -7], ['L', -52, -10], ['L', -31, -10]], deg, dx, dy)),
            circle(...turnPoint(-29.5, -10, deg, dx, dy), 1.8),
          ]
        : [path(turned([['M', -50, -7], ['L', -50, -10.5], ['L', -26, -10.5], ['Q', -22, -10.5, -22, -7]], deg, dx, dy))]),
      path(turned([['M', -20, -6.5], ['L', 20, -6.5], ['L', 20, 6.5], ['L', -20, 6.5], ['Z']], deg, dx, dy)),
      path(
        turned(
          k.band === 1
            ? [['M', -24, -7], ['L', -24, 7], ['M', -28, -7], ['L', -28, 7]]
            : [['M', -24, -7], ['L', -24, 7]],
          deg,
          dx,
          dy,
        ),
        FINE,
      ),
      path(turned([['M', 20, -5.5], ['L', 32, -4], ['L', 32, 4], ['L', 20, 5.5]], deg, dx, dy)),
      path(turned([['M', 32, -4.5], ['Q', 46, -5.5, 58, 0], ['Q', 46, 5.5, 32, 4.5]], deg, dx, dy)),
      path(turned([['M', 43, 0], ['L', 56, 0]], deg, dx, dy), FINE),
      circle(...turnPoint(40, 0, deg, dx, dy), 1.4, FINE),
    ],
  }
})

const INKWELL_BOTTLES = [
  'M14 98 Q10 98 10 92 V70 Q10 60 24 58 H60 Q74 60 74 70 V92 Q74 98 70 98 Z',
  'M14 98 Q10 98 10 94 V64 Q10 58 16 58 H68 Q74 58 74 64 V94 Q74 98 70 98 Z',
  'M28 58 Q6 64 8 82 Q10 98 42 98 Q74 98 76 82 Q78 64 56 58 Z',
] as const

const inkwell = art({ bottle: 3, pen: 2 }, true, (k) => ({
  width: 84,
  height: 104,
  elements: [
    // the pen, behind the bottle neck
    ...(k.pen === 1
      ? [path('M43 50 L61 10 Q63 5 66.5 6.5 Q69.5 8.5 67 13 L50 50'), path('M52 31 L58 34 M54.5 25.5 L60.5 28.5', FINE)]
      : [
          path('M44 52 Q52 30 68 4'),
          path('M47 42 Q50 20 68 4 Q66 24 52 40', FINE),
          path('M50 34 L57 30 M53 26 L60 22 M56 18 L63 14', FINE),
        ]),
    rect(28, 48, 28, 10, 2, PAPER),
    path(INKWELL_BOTTLES[k.bottle]!),
    path('M16 76 Q42 80 68 76', FINE),
  ],
}))

const stenoPad = art({ coil: 2, lines: 2, corner: 2 }, false, (k) => {
  const lines = k.lines === 1 ? row(12, 27, 5.8, (y) => y) : row(10, 28, 7, (y) => y)
  const dogEar = k.corner === 1
  return {
    width: 72,
    height: 104,
    elements: [
      dogEar ? path('M10 12 H62 Q64 12 64 14 V88 L52 100 H10 Q8 100 8 98 V14 Q8 12 10 12 Z') : rect(8, 12, 56, 88, 2),
      ...when(dogEar, [path('M52 100 L54.5 90.5 L64 88', FINE)]),
      ...(k.coil === 1 ? row(8, 12.2, 6.8, (x) => circle(x, 12, 2.2)) : row(9, 12, 6, (x) => ellipse(x, 12, 2, 4.5))),
      line(36, 22, 36, 96, FINE),
      ...lines.map((y) => line(12, y, dogEar && y > 84 ? 56 : 60, y, FINE)),
    ],
  }
})

const rockerBlotter = art({ handle: 3, clamps: 2, sheet: 2 }, false, (k) => ({
  width: 100,
  height: 74,
  elements: [
    ...[
      [ellipse(50, 14, 12, 5.5), rect(46, 19, 8, 15, 1)],
      [circle(50, 12, 8), rect(47, 20, 6, 14, 1)],
      [path('M30 34 V27 Q30 19 38 19 H62 Q70 19 70 27 V34')],
    ][k.handle]!,
    rect(12, 34, 76, 6, 2),
    path('M10 40 H90 L92 52 Q50 74 8 52 Z'),
    path(k.sheet === 1 ? 'M10 44 Q50 62 90 44 M10 47 Q50 67 90 47' : 'M10 47 Q50 67 90 47', FINE),
    ...when(k.clamps === 1, [rect(4, 43, 6, 9, 1.5), rect(90, 43, 6, 9, 1.5)]),
  ],
}))

const pencilSharpener = art({ body: 2, pencil: 2, base: 2 }, true, (k) => ({
  width: 108,
  height: 86,
  elements: [
    // the pencil going in
    ...when(k.pencil === 0, [path('M2 38 H14 L21 41 L14 44 H2 Z'), line(14, 38, 14, 44, FINE)]),
    ...(k.body === 1
      ? [rect(26, 24, 50, 34, 4), path('M40 24 V58 M52 24 V58 M64 24 V58', FINE), ellipse(25, 41, 7, 17)]
      : [rect(26, 22, 50, 38, 8), ellipse(25, 41, 7, 19)]),
    ellipse(25, 32, 1.8, 2.6, FINE),
    ellipse(25, 50, 2.4, 3.2, FINE),
    ...when(k.pencil === 1, [circle(25, 41, 2.2, FINE)]),
    circle(80, 41, 4),
    line(80, 41, 97, 58),
    rect(93, 56, 9, 17, 4.5),
    ...(k.base === 1 ? [path('M34 58 L30 72 H72 L68 58'), rect(26, 72, 50, 6, 2)] : [path('M36 60 V70 H66 V60'), rect(28, 70, 46, 8, 2)]),
  ],
}))

// ---------------------------------------------------------------------------
// Filing and organising
// ---------------------------------------------------------------------------

const fileCabinet = art({ drawers: 2, handle: 3, feet: 2 }, false, (k) => {
  const drawers = k.drawers === 1 ? [8, 40, 72].map((y) => [y, 28] as const) : [8, 32, 56, 80].map((y) => [y, 20] as const)
  return {
    width: 70,
    height: 110,
    elements: [
      rect(6, 4, 58, 98, 2),
      path(k.feet === 1 ? 'M9 102 V107 H17 V102 M53 102 V107 H61 V102' : 'M10 102 V107 H60 V102'),
      ...drawers.flatMap(([y, h]) => {
        const hy = r2(y + h * 0.6)
        return [
          rect(10, y, 50, h, 1.5),
          rect(28, y + 4, 14, 5, 1, FINE),
          ...[
            [rect(25, y + 12, 20, 4, 2)],
            [path(`M25 ${hy} H45 Q45 ${r2(hy + 5)} 35 ${r2(hy + 5)} Q25 ${r2(hy + 5)} 25 ${hy} Z`)],
            [circle(35, r2(y + h * 0.66), 2.8)],
          ][k.handle]!,
        ]
      }),
    ],
  }
})

/** Cards fanned round the spindle, knobs on the axle, the open card facing out. */
const rotaryCardFile = art({ cards: 2, knob: 2, stand: 2 }, true, (k) => ({
  width: 112,
  height: 92,
  elements: [
    ...(k.cards === 1 ? row(11, 195, 15, (deg, i) => [deg, i] as const) : row(9, 198, 18, (deg, i) => [deg, i] as const)).flatMap(
      ([deg, i]) => {
        const a = (deg * Math.PI) / 180
        const at = (along: number, across: number): [number, number] => [
          r2(56 + along * Math.cos(a) - across * Math.sin(a)),
          r2(52 + along * Math.sin(a) + across * Math.cos(a)),
        ]
        const card = polygon([at(12, -3.2), at(44, -3.2), at(44, 3.2), at(12, 3.2)], PAPER)
        // index tabs on a few cards
        return i % 3 === 1 ? [card, polygon([at(44, -1), at(47.5, -1), at(47.5, 3.2), at(44, 3.2)], PAPER)] : [card]
      },
    ),
    rect(30, 46, 52, 32, 3, PAPER),
    path('M36 56 H74 M36 63 H70 M36 70 H72', FINE),
    line(25, 52, 30, 52, FINE),
    line(82, 52, 87, 52, FINE),
    ...[16, 96].flatMap((cx) => [
      circle(cx, 52, 9),
      ...(k.knob === 1 ? row(8, 0, 45, (deg) => spoke(cx, 52, 5, 8, deg)) : [circle(cx, 52, 3.5, FINE)]),
    ]),
    ...(k.stand === 1
      ? [path('M16 61 Q16 84 30 84 H82 Q96 84 96 61'), rect(20, 84, 72, 5, 2)]
      : [path('M16 61 L12 84 M96 61 L100 84'), rect(6, 84, 100, 6, 3)]),
  ],
}))

const cardCatalog = art({ grid: 3, stand: 2, crown: 2 }, false, (k) => {
  const [rows, cols] = ([
    [4, 4],
    [5, 3],
    [3, 5],
  ] as const)[k.grid]!
  const w = (92 - (cols - 1) * 4) / cols
  const h = (69 - (rows - 1) * 3) / rows
  const lw = Math.min(8, w * 0.4)
  return {
    width: 112,
    height: 100,
    elements: [
      ...when(k.crown === 1, [rect(3, 1, 106, 5, 1.5)]),
      rect(6, 4, 100, 82, 3),
      ...row(rows, 10, h + 3, (y) =>
        row(cols, 10, w + 4, (x) => {
          const mid = x + w / 2
          return [
            rect(x, y, w, h, 1, FINE),
            rect(x + (w - lw) / 2, y + h * 0.2, lw, 4, 0.5, FINE),
            path(`M${r2(mid - 3.5)} ${r2(y + h * 0.63)} Q${r2(mid)} ${r2(y + h * 0.9)} ${r2(mid + 3.5)} ${r2(y + h * 0.63)}`),
          ]
        }).flat(),
      ).flat(),
      ...(k.stand === 1
        ? [rect(8, 86, 96, 4, 1), path('M12 90 V98 M100 90 V98'), line(12, 95, 100, 95, FINE)]
        : [rect(10, 86, 8, 10, 1), rect(94, 86, 8, 10, 1)]),
    ],
  }
})

const accordionFile = art({ flap: 2, fastener: 2 }, true, (k) => {
  const closed = k.flap === 1
  return {
    width: 100,
    height: 92,
    elements: [
      // the flap folded back, and the pockets seen from above
      ...when(!closed, [path('M18 26 L22 6 H80 L86 26')]),
      line(22, 26, 92, 26),
      ...row(7, 24, 8.5, (x) => line(x, 34, x + 8, 26, FINE)),
      ...when(!closed, [rect(27, 16, 12, 12, 1.5, PAPER), rect(52, 12, 12, 16, 1.5, PAPER), rect(70, 20, 11, 8, 1.5, PAPER)]),
      // the pleated side
      path('M84 34 L92 26 V78 L84 86'),
      ...row(8, 42, 6, (y) => line(84, y, 92, y - 8, FINE)),
      rect(14, 34, 70, 52, 3, PAPER),
      // closed, the flap comes down over the front
      ...when(closed, [path('M14 36 Q14 34 17 34 H81 Q84 34 84 36 L52 58 Q49 60 46 58 Z', PAPER)]),
      ...(k.fastener === 1
        ? [path(`M14 ${closed ? 68 : 62} H84 M14 ${closed ? 73 : 67} H84`)]
        : [circle(49, closed ? 60 : 50, 3.5), path(`M49 ${closed ? 63.5 : 53.5} Q52 ${closed ? 75 : 70} 49 86`, FINE)]),
    ],
  }
})

const MEMO_SLIPS = [
  [
    [72, 7],
    [58, -9],
    [44, 5],
    [31, -6],
  ],
  [
    [70, -6],
    [55, 8],
    [40, -4],
  ],
  [
    [74, 5],
    [62, -8],
    [50, 6],
    [38, -5],
    [27, 4],
  ],
] as const

const memoSpike = art({ slips: 3, base: 2 }, true, (k) => ({
  width: 64,
  height: 104,
  elements: [
    line(32, 84, 32, 10),
    path('M30.5 11 L32 4 L33.5 11'),
    ...MEMO_SLIPS[k.slips]!.flatMap(([cy, deg]) => [
      turnedRect(-19, -7, 38, 14, deg, 32, cy, PAPER),
      path(turned([['M', -14, -2], ['L', 14, -2], ['M', -14, 2.5], ['L', 8, 2.5]], deg, 32, cy), FINE),
    ]),
    ...(k.base === 1 ? [rect(12, 84, 40, 12, 2)] : [path('M8 96 Q8 84 32 84 Q56 84 56 96 Z')]),
    rect(4, 96, 56, 5, 2),
  ],
}))

/** One wire letter tray: `top` is its back edge, `front` how tall its front panel stands. */
function letterTray(top: number, front: number, scoop: number, label: boolean): RelicElement[] {
  const lip = top + 8
  return [
    path(`M12 ${top} H100 M8 ${lip} L12 ${top} M104 ${lip} L100 ${top}`),
    path(`M18 ${top + 4} H94 M20 ${top + 6.5} H92`, FINE),
    label
      ? rect(8, lip, 96, front, 1, PAPER)
      : path(`M8 ${lip} H38 Q40 ${lip + scoop} 56 ${lip + scoop} Q72 ${lip + scoop} 74 ${lip} H104 V${lip + front} H8 Z`, PAPER),
    ...when(label, [rect(46, lip + front / 2 - 2.5, 20, 5, 1, FINE)]),
  ]
}

const paperTray = art({ tiers: 2, papers: 2, front: 2 }, false, (k) => {
  const [tops, front, scoop] = k.tiers === 1 ? ([[8, 34, 60], 16, 6] as const) : ([[22, 54], 20, 8] as const)
  return {
    width: 112,
    height: 86,
    elements: [
      ...tops.flatMap((top, i) => [
        ...when(i === 0 && k.papers === 1, [path(`M22 ${top + 6} L25 ${top - 6} H83 L86 ${top + 6}`, PAPER)]),
        ...letterTray(top, front, scoop, k.front === 1),
      ]),
      ...tops.slice(1).map((top, i) => {
        const from = tops[i]! + 8 + front
        return path(`M14 ${from} V${top + 8} M98 ${from} V${top + 8}`)
      }),
    ],
  }
})

// ---------------------------------------------------------------------------
// Computing media
// ---------------------------------------------------------------------------

const floppyDisk = art({ label: 2, shutter: 2, holes: 2 }, false, (k) => ({
  width: 88,
  height: 88,
  elements: [
    path('M6 10 Q6 6 10 6 H74 L82 14 V78 Q82 82 78 82 H10 Q6 82 6 78 Z'),
    rect(24, 6, 40, 27, 1),
    rect(k.shutter === 1 ? 30 : 48, 10, 10, 19, 1),
    rect(16, 44, 56, 34, 2),
    path(k.label === 1 ? 'M16 51 H72 M22 59 H66 M22 67 H58' : 'M22 54 H66 M22 62 H66 M22 70 H56', FINE),
    rect(10, 72, 3.5, 5, 0.5, FINE),
    ...when(k.holes === 1, [rect(74.5, 72, 3.5, 5, 0.5, FINE)]),
  ],
}))

/** A fixed, readable scatter: one or two holes per column, like a keyed card. */
const PUNCH_PATTERN: readonly (readonly number[])[] = [
  [2, 7], [5], [1, 9], [3], [0, 6], [8], [4, 2], [7], [1], [9, 5], [3, 0], [6], [2], [8, 4],
  [0], [5, 9], [7, 1], [3], [6, 2], [9], [4], [1, 8], [5], [0, 7], [2],
]

/** Another keyed card: the same rule (one or two holes per column), a different message. */
function punchPattern(index: number): readonly (readonly number[])[] {
  if (index === 0) return PUNCH_PATTERN
  const rng = createRng(0x70c4 + index * 7919)
  return PUNCH_PATTERN.map(() => {
    const first = rng.int(0, 9)
    if (!rng.chance(0.45)) return [first]
    // Two holes in one column never touch, or they print as one slot.
    return [first, rng.pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => Math.abs(r - first) >= 2))]
  })
}

const punchCard = art({ pattern: 8, corner: 2 }, false, (k) => ({
  width: 112,
  height: 64,
  elements: [
    path(
      k.corner === 1
        ? 'M6 4 H94 L108 14 V58 Q108 60 106 60 H6 Q4 60 4 58 V6 Q4 4 6 4 Z'
        : 'M14 4 H106 Q108 4 108 6 V58 Q108 60 106 60 H6 Q4 60 4 58 V14 Z',
    ),
    ...punchPattern(k.pattern).flatMap((holes, col) =>
      holes.map((rowIndex) => rect(r2(13 + col * 3.7), 12 + rowIndex * 4.6, 1.6, 3.2, 0, INK)),
    ),
  ],
}))

// ---------------------------------------------------------------------------
// Timekeeping
// ---------------------------------------------------------------------------

/** Minute and hour hand angles (clockwise from 3 o'clock). */
const CLOCK_TIMES = [
  [-90, 24],
  [90, -60],
  [0, 205],
] as const

const punchClock = art({ dial: 2, rack: 2, time: 3 }, true, (k) => {
  const [minute, hour] = CLOCK_TIMES[k.time]!
  const slots = k.rack === 1 ? [42, 69, 96] : [36, 56, 76, 96]
  const card = k.rack === 1 ? 19 : 13
  return {
    width: 128,
    height: 108,
    elements: [
      rect(8, 4, 68, 100, 6),
      circle(42, 29, 19),
      ...row(12, 0, 30, (deg, i) =>
        k.dial === 1 && i % 3 === 0 ? spoke(42, 29, 12.5, 17.5, deg, {}) : spoke(42, 29, 14.5, 17.5, deg),
      ),
      line(42, 29, ...onRing(42, 29, 12, minute)),
      line(42, 29, ...onRing(42, 29, 9, hour)),
      circle(42, 29, 1.8, INK),
      // the time card, dropped into its slot
      rect(31, 50, 22, 16, 1, PAPER),
      path('M34 54 H50 M34 58 H50', FINE),
      rect(24, 64, 36, 5, 1.5),
      path('M76 58 H84 Q88 58 88 62 V74'),
      circle(88, 77, 3.5),
      rect(20, 76, 44, 22, 2, FINE),
      circle(42, 86, 1.6, FINE),
      // the rack of cards beside it
      rect(96, 18, 28, 84, 2),
      ...slots.flatMap((y) => [
        rect(100, y - card, 8, card, 0.5, FINE),
        rect(111, y - card + 3, 9, card - 3, 0.5, FINE),
        line(96, y, 124, y),
      ]),
    ],
  }
})

const deskCalendar = art({ binding: 2, grid: 2, mark: 4 }, false, (k) => {
  const rows = k.grid === 1 ? row(6, 32, 7.2, (y) => y) : row(5, 32, 9, (y) => y)
  const cellW = 64 / 7
  const cellH = rows[1]! - rows[0]!
  const [col, rowIndex] = ([
    [4, 1],
    [2, 2],
    [5, 3],
    [1, 1],
  ] as const)[k.mark]!
  const cx = r2(18 + cellW * (col + 0.5))
  const cy = r2(rows[rowIndex]! + cellH / 2)
  return {
    width: 100,
    height: 90,
    elements: [
      path('M18 14 Q20 5 28 5 H72 Q80 5 82 14', FINE),
      rect(14, 13, 72, 60, 3),
      ...(k.binding === 1 ? row(8, 22.5, 7.86, (x) => ellipse(x, 13, 1.6, 4)) : [ellipse(34, 13, 3.5, 6), ellipse(66, 13, 3.5, 6)]),
      line(14, 27, 86, 27, FINE),
      ...row(8, 18, cellW, (x) => line(x, 32, x, rows[rows.length - 1]!, FINE)),
      ...rows.map((y) => line(18, y, 82, y, FINE)),
      k.mark % 2 === 1
        ? path(`M${r2(cx - 3.2)} ${r2(cy - 2.6)} L${r2(cx + 3.2)} ${r2(cy + 2.6)} M${r2(cx + 3.2)} ${r2(cy - 2.6)} L${r2(cx - 3.2)} ${r2(cy + 2.6)}`)
        : circle(cx, cy, r2(Math.min(5.5, cellH * 0.62))),
      path('M10 73 H90 L96 84 H4 Z'),
    ],
  }
})

// ---------------------------------------------------------------------------
// Printing, copying and stamping
// ---------------------------------------------------------------------------

const rubberStamp = art({ handle: 2, pad: 2 }, true, (k) => ({
  width: 112,
  height: 88,
  elements: [
    ...(k.handle === 1 ? [path('M24 20 Q24 6 36 6 Q48 6 48 20 Z')] : [circle(36, 13, 10)]),
    path(k.handle === 1 ? 'M32 20 L30 40 H42 L40 20' : 'M32 22 L30 40 H42 L40 22'),
    rect(18, 40, 36, 12, 2),
    rect(21, 52, 30, 5, 1),
    // the ink pad, lid up or shut
    ...(k.pad === 1
      ? [rect(62, 60, 44, 24, 2), line(62, 68, 106, 68, FINE), rect(80, 72, 8, 4, 1, FINE)]
      : [path('M62 70 L68 50 H108 L104 70'), rect(62, 70, 44, 14, 2), path('M66 74 H102', FINE)]),
  ],
}))

const paperCutter = art({ blade: 2, grid: 2 }, true, (k) => ({
  width: 120,
  height: 80,
  elements: [
    polygon([
      [6, 70],
      [32, 48],
      [114, 48],
      [88, 70],
    ]),
    path('M6 70 V76 H88 V70 M88 76 L114 54 V48'),
    path(
      k.grid === 1
        ? 'M14.67 62.67 H96.67 M23.33 55.33 H105.33 M30 70 L56 48 M49 70 L75 48 M68 70 L94 48'
        : 'M14.67 62.67 H96.67 M23.33 55.33 H105.33 M35 70 L61 48 M62 70 L88 48',
      FINE,
    ),
    // the blade arm, raised
    ...(k.blade === 1
      ? [path('M110 52 L36 28 L38 22 L114 47 Z', PAPER), circle(33, 25, 4.5)]
      : [path('M110 52 L42 9 L46 4 L114 47 Z', PAPER), circle(40, 6, 4.5)]),
    circle(112, 50, 3),
  ],
}))

const dotMatrixPrinter = art({ paper: 2, buttons: 2 }, true, (k) => ({
  width: 124,
  height: 98,
  elements: [
    path('M28 44 V5 H92 V44'),
    ...row(6, 10, 6.5, (y) => circle(33, y, 1.5, FINE)),
    ...row(6, 10, 6.5, (y) => circle(87, y, 1.5, FINE)),
    path(
      k.paper === 1 ? 'M40 12 H72 M40 18 H78 M40 24 H62 M38 33 H82' : 'M40 12 H78 M40 18 H72 M40 24 H76 M40 30 H66',
      FINE,
    ),
    path('M8 62 L16 44 H104 L112 62 V78 Q112 82 108 82 H12 Q8 82 8 78 Z'),
    line(8, 62, 112, 62),
    circle(116, 53, 5),
    path('M18 69 H58 M18 74 H58', FINE),
    ...(k.buttons === 1
      ? [rect(80, 68, 8, 5, 1, FINE), rect(92, 68, 8, 5, 1, FINE), circle(72, 70.5, 1.8, FINE)]
      : row(3, 78, 10, (x) => rect(x, 68, 6, 5, 1, FINE))),
    // fan-folded paper waiting underneath
    path('M20 82 L16 90 H104 L100 82'),
    path('M17 86 H103', FINE),
  ],
}))

const photocopier = art({ cabinet: 2, panel: 2 }, true, (k) => ({
  width: 104,
  height: 112,
  elements: [
    rect(16, 14, 56, 7, 2),
    path('M70 21 L72 10 H96 L94 21', FINE),
    ...(k.panel === 1
      ? [rect(76, 12.5, 10, 4, 0.5, FINE), rect(88, 12.5, 4, 4, 0.5, FINE)]
      : row(3, 76, 5.5, (x) => rect(x, 13, 3.5, 3, 0.5, FINE))),
    rect(16, 21, 82, 32, 2),
    // output tray with a finished copy
    path('M16 40 L4 36 V44 L16 48', FINE),
    path('M5 35 L14 30 M5 31 L12 27', FINE),
    rect(18, 53, 78, 50, 2),
    ...(k.cabinet === 1
      ? [line(18, 78, 96, 78, FINE), rect(48, 63, 18, 3, 1.5), rect(48, 88, 18, 3, 1.5)]
      : [...[66, 79, 92].map((y) => line(18, y, 96, y, FINE)), ...[57.5, 70.5, 83.5, 96].map((y) => rect(48, y, 18, 3, 1.5))]),
    circle(26, 107, 3.5),
    circle(88, 107, 3.5),
  ],
}))

const mimeograph = art({ drum: 2, tray: 2 }, true, (k) => ({
  width: 120,
  height: 94,
  elements: [
    // feed tray with its stack of blank paper
    ...(k.tray === 1
      ? [path('M34 50 L12 26 L16 22 L36 44'), path('M17 28.5 L33 46 M19.5 25.5 L34.5 42', FINE)]
      : [path('M34 52 L6 36 L9 31 L36 46'), path('M12 35 L32 46.5 M14 32.5 L33 43.5', FINE)]),
    // the inked drum
    rect(32, 26, 56, 30, 6),
    ellipse(36, 41, 4, 15, FINE),
    ...(k.drum === 1 ? [path('M44 36 H80 M44 46 H80', FINE), ellipse(84, 41, 4, 15, FINE)] : [path('M42 34 H82 M42 41 H82 M42 48 H82', FINE)]),
    // the crank
    circle(94, 41, 4),
    line(94, 41, 106, 58),
    rect(102, 56, 8, 14, 4),
    // body and delivery tray
    rect(22, 56, 76, 28, 3),
    path('M98 70 L116 78 L114 82 L98 76', FINE),
    rect(26, 84, 10, 6, 1),
    rect(84, 84, 10, 6, 1),
  ],
}))

// ---------------------------------------------------------------------------
// Calculating
// ---------------------------------------------------------------------------

const addingMachine = art({ keys: 2, paper: 2, body: 2 }, false, (k) => ({
  width: 102,
  height: 96,
  elements: [
    path(k.paper === 1 ? 'M34 24 V6 L37 3.5 L40 6 L43 3.5 L46 6 L49 3.5 L52 6 L55 3.5 L58 6 L61 3.5 L64 6 V24' : 'M34 24 V4 H64 V24'),
    path('M40 9 H58 M40 14 H54 M40 19 H57', FINE),
    rect(26, 22, 46, 10, 5),
    path(k.body === 1 ? 'M12 88 Q12 32 30 32 H68 Q86 32 86 88' : 'M12 88 L20 32 H78 L86 88'),
    ...(k.keys === 1
      ? [40, 48, 56, 64, 72].flatMap((y) => row(6, 28, 7.6, (x) => rect(x, y, 5.2, 4.6, 1, FINE)))
      : [42, 50, 58, 66, 74].flatMap((y) => row(5, 33, 8, (x) => circle(x, y, 2.6, FINE)))),
    circle(88, 60, 3.5),
    line(88, 60, 95, 34),
    rect(91, 22, 8, 13, 4),
    rect(8, 86, 84, 8, 3),
  ],
}))

const calculator = art({ keys: 2, solar: 2, display: 2 }, false, (k) => ({
  width: 76,
  height: 100,
  elements: [
    rect(6, 4, 64, 92, k.display === 1 ? 5 : 8),
    rect(14, 12, 48, 16, 2),
    ...when(k.display === 1, [rect(18, 16, 40, 8, 1, FINE)]),
    ...(k.solar === 1
      ? [rect(14, 32, 10, 5, 2.5, FINE), circle(16.5, 34.5, 1.3, FINE)]
      : [rect(44, 32, 18, 5, 1, FINE), path('M50 32 V37 M56 32 V37', FINE)]),
    ...(k.keys === 1
      ? [
          ...[42, 52, 62, 72, 82].flatMap((y) => row(4, 14, 13, (x) => rect(x, y, 10, 7, 2))),
          path('M58 74 V79 M55.5 76.5 H60.5 M55.5 64.5 H60.5'),
        ]
      : [
          ...[44, 56].flatMap((y) => row(4, 14, 13, (x) => rect(x, y, 10, 8, 2))),
          ...[68, 80].flatMap((y) => row(3, 14, 13, (x) => rect(x, y, 10, 8, 2))),
          rect(53, 68, 10, 20, 2),
          path('M58 74 V82 M54 78 H62'),
        ]),
  ],
}))

const slideRule = art({ tilt: 3, cursor: 3 }, false, (k) => {
  const deg = [-22, -18, 20][k.tilt]!
  const at = [10, -22, 32][k.cursor]!
  const dx = 64
  const dy = 36
  const log = (n: number) => -50 + 100 * Math.log10(n)
  const ticks: RelicElement[] = []
  for (let n = 1; n <= 10; n += 0.5) {
    const x = log(n)
    const major = Number.isInteger(n)
    ticks.push(path(turned([['M', x, -5], ['L', x, major ? -9.5 : -7.5]], deg, dx, dy), FINE))
    ticks.push(path(turned([['M', x + 8, 5], ['L', x + 8, major ? 1 : 3]], deg, dx, dy), FINE))
  }
  return {
    width: 132,
    height: 72,
    elements: [
      turnedRect(-48, -5, 116, 10, deg, dx, dy),
      turnedRect(-58, -12, 116, 7, deg, dx, dy),
      turnedRect(-58, 5, 116, 7, deg, dx, dy),
      turnedRect(-58, -12, 4, 24, deg, dx, dy, PAPER),
      turnedRect(54, -12, 4, 24, deg, dx, dy, PAPER),
      ...ticks,
      // the sliding cursor, a clear window with its hairline
      turnedRect(at, -15, 14, 30, deg, dx, dy),
      path(turned([['M', at + 7, -15], ['L', at + 7, 15]], deg, dx, dy), FINE),
    ],
  }
})

const cashRegister = art({ keys: 2, flags: 2, drawer: 2 }, true, (k) => ({
  width: 110,
  height: 96,
  elements: [
    rect(38, 4, 34, 14, 2),
    ...(k.flags === 1 ? row(4, 41, 7.5, (x) => rect(x, 8, 5.5, 6, 0.5, FINE)) : row(3, 42, 9.5, (x) => rect(x, 8, 7, 6, 0.5, FINE))),
    path('M12 60 L22 18 H88 L98 60'),
    ...(k.keys === 1
      ? [29, 38.5, 48].flatMap((y) => row(7, 30.5, 8, (x) => rect(x, y, 5.5, 5, 1, FINE)))
      : [28, 36, 44, 52].flatMap((y) => row(6, 35, 8, (x) => circle(x, y, 2.6, FINE)))),
    circle(98, 38, 3),
    line(98, 38, 105, 52),
    circle(105, 55, 3.5),
    rect(8, 60, 94, 26, 2),
    ...(k.drawer === 1
      ? [rect(28, 69, 16, 5, 2.5), rect(66, 69, 16, 5, 2.5)]
      : [rect(44, 69, 22, 5, 2.5), circle(55, 79, 1.6, FINE)]),
    rect(4, 86, 102, 7, 3),
  ],
}))

// ---------------------------------------------------------------------------
// Presentations
// ---------------------------------------------------------------------------

const overheadProjector = art({ head: 2, base: 2 }, true, (k) => ({
  width: 96,
  height: 106,
  elements: [
    // head: mirror angled forward over the lens
    polygon([
      [40, 9],
      [24, 28],
      [28, 31],
      [44, 12],
    ]),
    rect(40, 10, 44, 14, 3),
    ...(k.head === 1 ? [ellipse(58, 27, 9, 3.5, FINE)] : [rect(50, 24, 16, 6, 1.5, FINE)]),
    rect(80, 22, 7, 46, 2),
    circle(91, 44, 3.5),
    // base with its glass stage
    path('M8 72 L14 64 H90 L84 72'),
    path('M20 70.5 L24 66 H80 L76 70.5 Z', FINE),
    path('M84 72 L90 64 V94 L84 102'),
    rect(8, 72, 76, 30, 3),
    ...(k.base === 1
      ? [...row(5, 18, 6, (x) => line(x, 80, x, 94, FINE)), rect(60, 83, 14, 6, 1.5, FINE)]
      : [path('M16 82 H40 M16 87 H40 M16 92 H40', FINE)]),
  ],
}))

const slideProjector = art({ slots: 2, body: 2 }, true, (k) => ({
  width: 120,
  height: 80,
  elements: [
    ellipse(56, 24, 40, 12),
    path('M16 24 V32 A40 12 0 0 0 96 32 V24'),
    ...row(k.slots === 1 ? 18 : 24, 0, k.slots === 1 ? 20 : 15, (deg) => {
      const a = (deg * Math.PI) / 180
      const at = (s: number) => [r2(56 + 40 * s * Math.cos(a)), r2(24 + 12 * s * Math.sin(a))] as const
      const [x1, y1] = at(0.6)
      const [x2, y2] = at(0.9)
      return line(x1, y1, x2, y2, FINE)
    }),
    ellipse(56, 23.5, 7, 2.5),
    rect(14, 38, 86, 30, 4),
    ...(k.body === 1 ? [rect(100, 43, 16, 20, 3), ellipse(116, 53, 2.5, 10)] : [rect(100, 45, 14, 16, 2), ellipse(114, 53, 2.5, 8)]),
    rect(22, 48, 10, 6, 1, FINE),
    ...(k.body === 1 ? row(5, 44, 6, (x) => circle(x, 53, 1.6, FINE)) : [path('M42 48 H74 M42 53 H74 M42 58 H74', FINE)]),
    rect(20, 68, 10, 5, 1),
    rect(84, 68, 10, 5, 1),
  ],
}))

const filmProjector = art({ reels: 3, body: 2 }, true, (k) => {
  const holes = [4, 3, 5][k.reels]!
  return {
    width: 120,
    height: 100,
    elements: [
      line(30, 26, 40, 58),
      line(86, 22, 78, 58),
      path('M22 42 Q26 54 36 58', FINE),
      path('M94 38 Q90 52 82 58', FINE),
      ...reel(30, 26, 18, holes, 45),
      ...reel(86, 22, 18, holes, 0),
      rect(22, 58, 70, 28, 4),
      rect(92, 64, 18, 14, 2),
      ellipse(110, 71, 2.5, 7),
      circle(38, 72, 5, FINE),
      ...(k.body === 1 ? [circle(38, 72, 2, FINE), ...row(4, 56, 6.5, (x) => line(x, 66, x, 78, FINE))] : [path('M54 68 H80 M54 74 H80', FINE)]),
      path('M18 86 H96 L100 94 H14 Z'),
    ],
  }
})

const flipChart = art({ chart: 3, legs: 2 }, true, (k) => ({
  width: 84,
  height: 122,
  elements: [
    ...(k.legs === 1 ? [path('M22 80 L12 120 M62 80 L72 120'), line(16, 104, 68, 104, FINE)] : [line(42, 80, 42, 114, FINE), path('M20 80 L8 120 M64 80 L76 120')]),
    rect(8, 4, 68, 8, 2),
    rect(12, 12, 60, 62, 1),
    ...[
      [path('M22 24 V64 H62', FINE), rect(28, 46, 8, 18, 0, FINE), rect(40, 38, 8, 26, 0, FINE), rect(52, 29, 8, 35, 0, FINE)],
      [path('M22 24 V64 H62', FINE), path('M26 56 L36 48 L46 52 L58 30'), circle(36, 48, 1.8, FINE), circle(46, 52, 1.8, FINE)],
      [circle(42, 44, 18), path('M42 44 V26 M42 44 L57.6 53', FINE)],
    ][k.chart]!,
    rect(8, 74, 68, 6, 2),
  ],
}))

// ---------------------------------------------------------------------------
// Computing and recording
// ---------------------------------------------------------------------------

const desktopComputer = art({ screen: 3, drives: 2 }, true, (k) => ({
  width: 112,
  height: 112,
  elements: [
    rect(22, 4, 68, 54, 5),
    rect(30, 11, 52, 38, 5, FINE),
    ...[
      [rect(37, 19, 4, 6, 0, INK)],
      [path('M37 19 H60 M37 25 H52', FINE), rect(37, 30, 4, 6, 0, INK)],
      [rect(38, 18, 36, 22, 1, FINE), line(38, 23, 74, 23, FINE)],
    ][k.screen]!,
    path('M46 58 L42 64 H70 L66 58'),
    rect(10, 64, 92, 20, 2),
    ...(k.drives === 1
      ? [rect(60, 67.5, 28, 4, 1), rect(60, 75, 28, 4, 1)]
      : [rect(60, 70, 28, 4, 1), rect(80, 77, 8, 3, 1, FINE)]),
    circle(20, 74, 2.5, FINE),
    path('M6 108 L14 92 H98 L106 108 Z'),
    path('M12.5 96 H99.5 M10.5 100 H101.5', FINE),
    rect(36, 102.5, 40, 3, 1, FINE),
  ],
}))

const cassetteTape = art({ label: 2, window: 2, screws: 2 }, false, (k) => ({
  width: 112,
  height: 74,
  elements: [
    rect(4, 4, 104, 66, 5),
    rect(14, 10, 84, 36, 3, FINE),
    ...when(k.label === 1, [path('M20 15 H92 M20 40.5 H92', FINE)]),
    rect(34, 21, 44, 15, 3),
    ...[42, 70].flatMap((cx) => [
      ...when(k.window === 1, [circle(cx, 28.5, 6.5, FINE)]),
      circle(cx, 28.5, k.window === 1 ? 3.6 : 5.5),
      ...when(k.window === 0, row(6, 0, 60, (deg) => spoke(cx, 28.5, 2.2, 4, deg))),
    ]),
    path('M26 70 L32 54 H80 L86 70'),
    circle(40, 62, 2, FINE),
    circle(72, 62, 2, FINE),
    rect(52, 59, 3, 3, 0, FINE),
    rect(57, 59, 3, 3, 0, FINE),
    ...[
      [9, 9],
      [103, 9],
      [9, 65],
      [103, 65],
      ...(k.screws === 1 ? [[56, 49]] : []),
    ].map(([x, y]) => circle(x!, y!, 1.4, FINE)),
  ],
}))

const reelToReel = art({ reels: 2, controls: 2 }, true, (k) => ({
  width: 100,
  height: 108,
  elements: [
    rect(6, 4, 88, 100, 4),
    ...reel(30, 28, 17, k.reels === 1 ? 5 : 3, 90),
    ...reel(70, 28, 17, k.reels === 1 ? 5 : 3, 30),
    path('M13.5 32 L20 58 H80 L86.5 32', FINE),
    circle(20, 58, 2.5, FINE),
    circle(80, 58, 2.5, FINE),
    rect(40, 53, 20, 10, 2),
    ...(k.controls === 1
      ? [
          ...row(4, 18, 17, (x) => rect(x, 72, 13, 7, 1.5)),
          ...[20, 56].flatMap((x) => [rect(x, 86, 24, 12, 2, FINE), path(`M${x + 4} 95 Q${x + 12} 88 ${x + 20} 95`, FINE)]),
        ]
      : [
          ...row(5, 19, 13, (x) => rect(x, 72, 9, 7, 1.5)),
          rect(20, 86, 24, 12, 2, FINE),
          rect(56, 86, 24, 12, 2, FINE),
          path('M32 96 L37 89 M68 96 L64 89', FINE),
        ]),
  ],
}))

// ---------------------------------------------------------------------------
// Office life
// ---------------------------------------------------------------------------

const waterCooler = art({ bottle: 2, taps: 2, cups: 2 }, true, (k) => ({
  width: 74,
  height: 120,
  elements: [
    path('M16 12 Q16 4 26 4 H46 Q56 4 56 12 V36 Q56 42 48 44 L42 46 V51 H32 V46 L26 44 Q16 42 16 36 Z'),
    path(k.bottle === 1 ? 'M16 13 H56 M16 22 H56 M16 31 H56' : 'M16 17 H56 M16 30 H56', FINE),
    rect(26, 51, 22, 5, 1),
    rect(12, 56, 50, 60, 3),
    ...(k.taps === 1 ? [34] : [22, 46]).map((x) => path(`M${x} 66 H${x + 6} V72 H${x + 4} V76 H${x + 2} V72 H${x} Z`)),
    rect(18, 82, 38, 4, 1),
    ...when(k.cups === 0, [rect(62, 58, 7, 26, 2), path('M62 84 L65.5 93 L69 84', FINE)]),
    path('M12 100 H62', FINE),
  ],
}))

const deskFan = art({ blades: 2, cage: 2, base: 2 }, false, (k) => {
  const blades = k.blades === 1 ? 4 : 3
  const wires = k.cage === 1 ? 16 : 20
  return {
    width: 90,
    height: 112,
    elements: [
      path('M41 77 V92 H49 V77'),
      ...(k.base === 1 ? [rect(20, 92, 50, 14, 3)] : [path('M18 106 Q18 92 45 92 Q72 92 72 106 Z')]),
      circle(45, 100, 2.5, FINE),
      ...row(blades, 0, 360 / blades, (deg) =>
        path(
          turned(
            [
              ['M', 0, 0],
              ['Q', 12, -20, 26, -12],
              ['Q', 22, 4, 0, 0],
            ],
            deg,
            45,
            42,
          ),
        ),
      ),
      ...row(wires, 0, 360 / wires, (deg) => spoke(45, 42, 29, 36, deg)),
      circle(45, 42, 29, FINE),
      circle(45, 42, 36),
      circle(45, 42, 6, PAPER),
      circle(45, 42, 2, FINE),
    ],
  }
})

const safe = art({ handle: 2, hinges: 2, feet: 2 }, true, (k) => ({
  width: 84,
  height: 104,
  elements: [
    rect(6, 4, 72, 88, 4),
    rect(13, 11, 58, 74, 3),
    circle(36, 38, 11),
    circle(36, 38, 4, FINE),
    ...row(12, 0, 30, (deg) => spoke(36, 38, 8, 11, deg)),
    path('M36 25.5 L34 22 H38 Z', INK),
    ...(k.handle === 1
      ? [rect(51, 56, 10, 4, 2), circle(56, 58, 3.2), rect(54, 61, 4, 12, 2)]
      : [
          circle(56, 60, 2.5),
          ...row(3, -90, 120, (deg) => {
            const [x1, y1] = onRing(56, 60, 2.5, deg)
            const [x2, y2] = onRing(56, 60, 10, deg)
            return path(`M${x1} ${y1} L${x2} ${y2}`)
          }),
          ...row(3, -90, 120, (deg) => {
            const [x, y] = onRing(56, 60, 11.5, deg)
            return circle(x, y, 1.8)
          }),
        ]),
    ...(k.hinges === 1 ? [16, 43, 70].map((y) => rect(8, y, 5, 8, 1)) : [rect(8, 20, 5, 10, 1), rect(8, 64, 5, 10, 1)]),
    ...(k.feet === 1 ? [path('M10 92 V97 H74 V92')] : [rect(12, 92, 12, 6, 1), rect(60, 92, 12, 6, 1)]),
  ],
}))

const briefcase = art({ latches: 2, handle: 2, seam: 2 }, false, (k) => ({
  width: 110,
  height: 84,
  elements: [
    ...(k.handle === 1
      ? [path('M38 22 V16 Q38 10 44 10 H66 Q72 10 72 16 V22'), path('M43 22 V18 Q43 15 46 15 H64 Q67 15 67 18 V22')]
      : [path('M40 22 V15 Q40 8 47 8 H63 Q70 8 70 15 V22'), path('M45 22 V16 Q45 13 48 13 H62 Q65 13 65 16 V22')]),
    rect(6, 22, 98, 56, 5),
    line(6, 36, 104, 36, FINE),
    ...when(k.seam === 1, [rect(10, 26, 90, 48, 3, FINE)]),
    ...(k.latches === 1
      ? [circle(24, 36, 4.5), circle(86, 36, 4.5), circle(24, 36, 1.6, FINE), circle(86, 36, 1.6, FINE)]
      : [rect(18, 31, 12, 10, 1.5), rect(80, 31, 12, 10, 1.5), path('M22 34 V38 M26 34 V38 M84 34 V38 M88 34 V38', FINE)]),
  ],
}))

const percolator = art({ knob: 2, body: 2 }, true, (k) => ({
  width: 84,
  height: 108,
  elements: [
    ...(k.knob === 1 ? [circle(42, 18, 7)] : [path('M36 23 Q36 11 42 11 Q48 11 48 23')]),
    path('M22 32 Q42 20 62 32'),
    path('M20 70 Q8 60 8 34 L4 28 H14 L16 36 Q16 54 21 62'),
    path(k.body === 1 ? 'M22 32 Q16 64 18 98 Q18 104 24 104 H60 Q66 104 66 98 Q68 64 62 32 Z' : 'M22 32 L18 98 Q18 104 24 104 H60 Q66 104 66 98 L62 32 Z'),
    path('M62 40 H70 Q78 40 78 50 V78 Q78 86 70 86 H64'),
    path('M63 46 H68 Q72 46 72 52 V76 Q72 80 68 80 H64'),
    path(k.body === 1 ? 'M18.5 92 H65.5 M20 40 H64' : 'M19 92 H65', FINE),
  ],
}))

const bankersLamp = art({ base: 2, chain: 2 }, true, (k) => ({
  width: 100,
  height: 98,
  elements: [
    circle(50, 17, 3),
    path('M8 40 Q8 20 50 20 Q92 20 92 40 Z'),
    path('M50 52 Q30 52 22 40 M50 52 Q70 52 78 40', FINE),
    ...(k.chain === 1
      ? [line(72, 40, 72, 50, FINE), path('M70 50 H74 L73 56 H71 Z')]
      : [line(70, 40, 70, 55, FINE), circle(70, 57.5, 2.2)]),
    rect(47, 40, 6, 42),
    ...(k.base === 1
      ? [rect(26, 82, 48, 8, 2), rect(20, 90, 60, 5, 2.5)]
      : [path('M24 91 Q24 82 50 82 Q76 82 76 91 Z'), rect(20, 90, 60, 5, 2.5)]),
  ],
}))

const lunchBox = art({ lid: 2, latches: 2, panel: 2 }, false, (k) => {
  const top = k.lid === 1 ? 30 : 42
  return {
    width: 100,
    height: 90,
    elements: [
      ...(k.lid === 1
        ? [path('M36 20 V14 Q36 8 42 8 H58 Q64 8 64 14 V20'), rect(8, 20, 84, 10, 3), rect(14, 23, 72, 4, 2, FINE)]
        : [
            path('M36 16 V10 Q36 4 42 4 H58 Q64 4 64 10 V16'),
            path('M8 42 Q8 14 50 14 Q92 14 92 42'),
            path('M15 42 Q15 21 50 21 Q85 21 85 42', FINE),
          ]),
      line(8, top, 92, top),
      path(`M8 ${top} V82 Q8 86 12 86 H88 Q92 86 92 82 V${top}`),
      ...when(k.panel === 1, [rect(18, top + 13, 64, 64 - top, 4, FINE)]),
      ...(k.latches === 1
        ? [rect(18, top - 3, 12, 8, 2, PAPER), rect(70, top - 3, 12, 8, 2, PAPER)]
        : [rect(20, top - 5, 8, 12, 1.5, PAPER), rect(72, top - 5, 8, 12, 1.5, PAPER)]),
    ],
  }
})

const tapeDispenser = art({ body: 2, roll: 2 }, true, (k) => ({
  width: 104,
  height: 72,
  elements: [
    path(
      k.body === 1
        ? 'M8 66 Q4 66 4 60 V40 Q4 24 22 24 H56 Q66 24 72 30 L96 42 V50 H88 L84 66 Z'
        : 'M8 66 Q4 66 4 58 Q4 30 30 24 Q54 20 72 30 L96 42 V50 H88 L84 66 Z',
    ),
    circle(36, 43, 16),
    circle(36, 43, 6, FINE),
    ...when(k.roll === 1, [circle(36, 43, 11, FINE)]),
    path('M47 31.5 L96 42', FINE),
    path('M96 42 L99.5 44 L96 46 L99.5 48 L96 50', FINE),
  ],
}))

const serviceBell = art({ plunger: 2, base: 2, shine: 2 }, true, (k) => ({
  width: 96,
  height: 72,
  elements: [
    ...(k.plunger === 1 ? [circle(48, 8, 4.5), rect(45.5, 12, 5, 8, 1)] : [ellipse(48, 8, 7, 3), rect(45, 10, 6, 10, 1)]),
    path('M14 56 Q14 20 48 20 Q82 20 82 56'),
    path(k.shine === 1 ? 'M26 50 Q26 34 36 28 M31 51 Q31 40 37 35' : 'M24 48 Q24 30 38 26', FINE),
    ...(k.base === 1 ? [rect(10, 56, 76, 6, 2), rect(4, 62, 88, 6, 3)] : [rect(6, 56, 84, 10, 3)]),
  ],
}))

const postalScale = art({ load: 2, dial: 2, needle: 3 }, true, (k) => {
  const needle = [-53, -35, -75][k.needle]!
  return {
    width: 96,
    height: 100,
    elements: [
      // something waiting to be weighed
      ...(k.load === 1
        ? [rect(26, 6, 44, 14, 1.5), path('M48 6 V20 M26 13 H70', FINE)]
        : [rect(20, 4, 56, 16, 1), path('M20 4 L48 14 L76 4', FINE)]),
      rect(14, 20, 68, 5, 2),
      rect(44, 25, 8, 8),
      path('M18 92 L24 36 Q26 33 30 33 H66 Q70 33 72 36 L78 92'),
      rect(12, 90, 72, 6, 3),
      circle(48, 62, 18),
      ...(k.dial === 1
        ? row(6, 180, 36, (deg) => spoke(48, 62, 11.5, 16.5, deg))
        : row(11, 180, 18, (deg) => spoke(48, 62, 13, 16.5, deg))),
      line(48, 62, ...onRing(48, 62, 15, needle)),
      circle(48, 62, 2, INK),
    ],
  }
})

/**
 * Every drawing, by id. An object can list more than one drawing (a variant);
 * the catalog in `content.ts` names which.
 */
export const RELIC_ART = {
  'rotary-phone': rotaryPhone,
  'push-button-phone': pushButtonPhone,
  'fax-machine': faxMachine,
  'brick-phone': brickPhone,
  switchboard,
  typewriter,
  'fountain-pen': fountainPen,
  inkwell,
  'steno-pad': stenoPad,
  'rocker-blotter': rockerBlotter,
  'file-cabinet': fileCabinet,
  'rotary-card-file': rotaryCardFile,
  'card-catalog': cardCatalog,
  'accordion-file': accordionFile,
  'memo-spike': memoSpike,
  'paper-tray': paperTray,
  'floppy-disk': floppyDisk,
  'punch-card': punchCard,
  'punch-clock': punchClock,
  'desk-calendar': deskCalendar,
  'rubber-stamp': rubberStamp,
  'paper-cutter': paperCutter,
  'dot-matrix-printer': dotMatrixPrinter,
  photocopier,
  mimeograph,
  'adding-machine': addingMachine,
  calculator,
  'slide-rule': slideRule,
  'cash-register': cashRegister,
  'overhead-projector': overheadProjector,
  'slide-projector': slideProjector,
  'film-projector': filmProjector,
  'reel-to-reel': reelToReel,
  'flip-chart': flipChart,
  'desktop-computer': desktopComputer,
  'cassette-tape': cassetteTape,
  'water-cooler': waterCooler,
  'desk-fan': deskFan,
  safe,
  briefcase,
  percolator,
  'bankers-lamp': bankersLamp,
  'lunch-box': lunchBox,
  'tape-dispenser': tapeDispenser,
  'pencil-sharpener': pencilSharpener,
  'service-bell': serviceBell,
  'phone-book': phoneBook,
  'postal-scale': postalScale,
} as const satisfies Record<string, RelicArt>

export type RelicDrawingId = keyof typeof RELIC_ART

/** Every knob at choice 0: the reference drawing. */
export const referenceKnobs = (a: RelicArt): RelicKnobValues =>
  Object.fromEntries(Object.keys(a.knobs).map((name) => [name, 0]))

/** The reference drawing of every object, unmirrored. */
export const RELIC_DRAWINGS = Object.fromEntries(
  Object.entries(RELIC_ART).map(([id, a]) => [id, a.draw(referenceKnobs(a))]),
) as Record<RelicDrawingId, RelicDrawing>
