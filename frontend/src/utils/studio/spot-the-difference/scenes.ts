import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import type { Bounds } from '../stained-glass/geometry'
import { poly, rect } from '../stained-glass/subject-kit'
import type { SdGroup, SdGroupChoice } from './content'
import { partBounds, SdStage, type SdPart, type SdPlace, type SdRowItem, type SdScene } from './scene'

/**
 * The scenes: a front porch, a tea table, a beach, a fishing dock…
 *
 * A recipe deals one scene into a picture panel: which things are in it
 * (from a pool for every slot), their order, the gaps between them, which
 * version of each and which way it faces, and a handful of optional extras
 * (a rug, a kite, birds). The panel's shape changes with the trim, so
 * recipes place things by share of the panel and let the stage pack them.
 *
 * Things are sized by how big they are in life (`sdSize`), at their plane's
 * scale: the furniture along a wall shares one scale, what stands on a table
 * shares the table's, and the far side of the garden holds smaller trees. So
 * a teapot is never as tall as its table, a cool box never looms over a deck
 * chair, and a swap puts a thing of about the same size in the same spot.
 *
 * Scenes are dealt full enough to hide ten fair changes (a dozen or more
 * things, each big enough to see) but never crowded: nothing overlaps
 * anything it does not stand on, the sky's sun and clouds keep clear of
 * everything, and nothing is filler too small to matter.
 *
 * The mood is the ordinary pleasures of retirement (a morning coffee, a
 * garden, a trip), never illness, money worries or age itself, and no one
 * lifestyle is assumed: a scene is a place anyone might enjoy.
 */

export interface SdRecipe {
  id: string
  name: string
  group: SdGroup
  build: (s: SdStage) => void
}

const inch = (n: number) => n * DPI

/* ------------------------------------------------------------------ *
 * Shared pieces of scenery
 * ------------------------------------------------------------------ */

/** The ceiling line indoors (share of the height): a hanging lamp hangs from it. */
const CEILING = 0.04

/** Ceiling, back wall, baseboard and floor. Returns the floor line. */
function room(s: SdStage, at = 0.74): number {
  const floor = s.y(at + s.rng.next() * 0.04)
  s.band(s.panel.minY - 40, s.y(CEILING), 9)
  s.band(floor - s.H * 0.035, floor, 11)
  s.band(floor, s.panel.maxY + 40, 12)
  // A chair rail along the wall, now and then.
  if (s.chance(0.35)) {
    const y = s.y(0.6)
    if (y < floor - s.H * 0.12) s.band(y, y + s.H * 0.018, 10.5)
  }
  return floor
}

/** A few things placed at random in an area (sky, water), clear of everything already there. */
function scatter(s: SdStage, kinds: readonly string[], count: number, area: Bounds, h: number, depth: number): SdPart[] {
  const out: SdPart[] = []
  for (let n = 0; n < count; n++) {
    for (let tries = 0; tries < 16; tries++) {
      const part = s.put({
        kind: s.rng.pick(kinds),
        cx: area.minX + s.rng.next() * (area.maxX - area.minX),
        y: area.minY + s.rng.next() * (area.maxY - area.minY),
        h: h * (0.85 + s.rng.next() * 0.3),
        depth: depth + n * 0.01,
        anchor: 'middle',
        swaps: kinds.length > 1 ? kinds : [],
        clear: true,
      })
      if (part) {
        out.push(part)
        break
      }
    }
  }
  return out
}

/** One thing at the first of a few spots along a line that is clear of everything: a cat on the floor. */
function putClear(s: SdStage, place: Omit<SdPlace, 'cx'>, x0: number, x1: number, tries = 8): SdPart | null {
  for (let t = 0; t < tries; t++) {
    const part = s.put({ ...place, cx: s.x(x0 + s.rng.next() * (x1 - x0)) })
    if (part) return part
  }
  return null
}

/** What flies or floats in the sky, by share of the picture's height: a kite is a kite, a butterfly much smaller. */
const SKY_SIZE: Readonly<Record<string, number>> = { 'sd-kite': 0.2, 'hot-air-balloon': 0.2, butterfly: 0.11, 'sd-birds': 0.1 }

/**
 * Sun, clouds and perhaps birds, in the sky above `bottom` (a share of the
 * height). Dealt after the things standing against the sky, and kept clear of
 * them: a sun half behind a tree is a muddle, not a picture.
 */
function sky(s: SdStage, bottom: number, extras: readonly string[] = []) {
  const band: Bounds = { minX: s.x(0.06), maxX: s.x(0.94), minY: s.y(0.12), maxY: s.y(Math.max(0.2, bottom - 0.1)) }
  if (s.chance(0.85)) {
    const sides = s.rng.shuffle([0.1, 0.9])
    for (const u of sides) {
      if (s.put({ kind: 'sd-sun', cx: s.x(u), y: s.y(0.17), h: s.size(0.2), depth: 5, anchor: 'middle', clear: true })) break
    }
  }
  scatter(s, ['sd-cloud'], s.rng.int(2, 2 + s.fullness), band, s.size(0.13), 6)
  if (s.chance(0.6)) scatter(s, ['sd-birds'], 1, band, s.size(SKY_SIZE['sd-birds']!), 7)
  for (const kind of extras) if (s.chance(0.55)) scatter(s, [kind], 1, band, s.size(SKY_SIZE[kind] ?? 0.2), 7)
}

/** Grassy land: a far hill (or mountains), then the near ground. Returns the near ground's line. */
function land(s: SdStage, horizon: number, far: 'hills' | 'mountains' | 'none' = 'hills') {
  const top = s.y(horizon)
  if (far === 'mountains') {
    const p = s.panel
    const peaks = s.W > inch(4.5) ? 3 : 2
    const pts: [number, number][] = [[p.minX - 40, top + s.H * 0.02]]
    for (let i = 0; i < peaks; i++) {
      const x = p.minX + s.W * ((i + 0.5) / peaks) + (s.rng.next() - 0.5) * s.W * 0.12
      pts.push([x, top - s.H * (0.12 + s.rng.next() * 0.1)], [x + s.W / (peaks * 2), top - s.H * 0.02])
    }
    pts.push([p.maxX + 40, top + s.H * 0.02], [p.maxX + 40, top + s.H * 0.2], [p.minX - 40, top + s.H * 0.2])
    s.ring(poly(...pts), 2)
  }
  if (far !== 'none') s.wave(top, s.H * 0.02, s.W * (0.8 + s.rng.next() * 0.6), 3)
  const near = top + s.H * (0.1 + s.rng.next() * 0.03)
  s.wave(near, s.H * 0.012, s.W * (1.1 + s.rng.next() * 0.6), 15)
  return near
}

/** Sea to the horizon, a line or two of waves. Returns the horizon. */
function sea(s: SdStage, horizon: number, waves = 2) {
  const top = s.y(horizon)
  s.band(top, s.panel.maxY + 40, 3)
  for (let i = 1; i <= waves; i++) s.wave(top + s.H * 0.075 * i, s.H * 0.008, s.W / (2.6 + s.rng.next()), 3.5 + i * 0.1)
  return top
}

/** Where a row stands: its line, its plane, and its scale (`unit`, the printed height of a thing 1 m tall). */
interface RowAt {
  y: number
  depth: number
  unit?: number
  maxH?: number
  /** Shares of the width. */
  x0?: number
  x1?: number
  gap?: number
}

/** A row of things in dealt order across the picture (or between `x0` and `x1`). */
const row = (s: SdStage, items: readonly SdRowItem[], at: RowAt) =>
  s.row(s.rng.shuffle(items), { x0: s.x(at.x0 ?? 0.04), x1: s.x(at.x1 ?? 0.96), y: at.y, depth: at.depth, unit: at.unit, maxH: at.maxH, gap: at.gap })

const find = (parts: readonly SdPart[], kinds: readonly string[]) => parts.find((p) => kinds.includes(p.kind)) ?? null

/** Things hung on a wall, centred on `v` (canvas y). */
const onWall = (kinds: readonly string[], v: number, chance = 1): SdRowItem => ({ kinds, anchor: 'middle', y: v, chance })

/* ------------------------------------------------------------------ *
 * At home
 * ------------------------------------------------------------------ */

/**
 * What makes a room lived in, dealt after its furniture: a lamp hanging
 * from the ceiling (clear of everything on the wall), and a few small things
 * on the floor nearest the reader: slippers, a pile of books, the cat.
 */
function homeTouches(s: SdStage, floor: number, unit: number, pendant = 0.65) {
  if (s.chance(pendant)) {
    for (let tries = 0; tries < 6; tries++) {
      if (s.put({ kind: 'sd-pendant', cx: s.x(0.15 + s.rng.next() * 0.7), y: s.y(CEILING), h: s.size(0.22), depth: 12, anchor: 'top' })) break
    }
  }
  const front = Math.min(s.y(0.955), floor + s.H * 0.2)
  if (front - floor < s.H * 0.14) return
  // Never a second cat, dog or basket: only things the room does not hold yet.
  const fresh = (kinds: readonly string[]) => kinds.filter((k) => !s.parts.some((p) => p.kind === k))
  const items: SdRowItem[] = [
    { kinds: fresh(['sd-slippers']), chance: 0.75 },
    { kinds: fresh(['sd-books', 'yarn-basket']), chance: 0.75 },
    { kinds: fresh(['sd-cat', 'sd-footstool', 'sd-dog']), chance: 0.45 },
  ]
  s.row(
    s.rng.shuffle(items.filter((item) => item.kinds.length > 0)),
    { x0: s.x(0.06), x1: s.x(0.94), y: front, depth: 40, gap: inch(0.5), unit, maxH: s.H * 0.17 },
  )
}

const TABLETOP = ['teacup', 'coffee-mug', 'book-and-glasses', 'sd-vase', 'vintage-radio', 'table-lamp', 'houseplant', 'teapot', 'sd-candles', 'sd-fruit', 'sd-cactus', 'sd-photo']
const CUPS = ['teacup', 'coffee-mug', 'book-and-glasses']

function sideTableTop(s: SdStage, placed: readonly SdPart[], unit: number, first: readonly string[] = TABLETOP) {
  s.onTop(
    find(placed, ['sd-side-table']),
    [
      { kinds: first },
      { kinds: CUPS, chance: 0.8 },
      { kinds: ['sd-vase', 'sd-cookies', 'teacup', 'sd-photo', 'sd-cactus'], chance: 0.4 },
    ],
    { unit, maxH: s.H * 0.3 },
  )
}

const livingRoom: SdRecipe = {
  id: 'living-room',
  name: 'Cozy living room',
  group: 'home',
  build(s) {
    const floor = room(s)
    const u = s.H * 0.45
    const rug = s.put({ kind: 'sd-rug', cx: s.x(0.35 + s.rng.next() * 0.3), y: floor + s.H * 0.2, h: s.H * 0.12, maxW: s.W * 0.46, depth: 25, overlap: true })
    const placed = row(
      s,
      [
        { kinds: ['armchair', 'rocking-chair', 'sd-sofa'], maxW: s.W * 0.32 },
        { kinds: ['sd-side-table'] },
        { kinds: ['houseplant', 'sd-floor-lamp', 'sd-tall-clock'] },
        { kinds: ['yarn-basket', 'sd-footstool', 'sd-dog'], chance: 0.8 },
        { kinds: ['flower-pot', 'sd-vase', 'gramophone'], chance: 0.5 },
        { kinds: ['sd-books', 'yarn-basket', 'flower-pot'], chance: 0.15 + 0.25 * s.fullness },
        // A fireplace against the wall, in its own place along the room so nothing hides it.
        { kinds: ['sd-fireplace'], y: floor + s.H * 0.015, chance: 0.45 },
      ],
      { y: floor + s.H * 0.1, depth: 30, unit: u, maxH: s.H * 0.64 },
    )
    sideTableTop(s, placed, u)
    row(
      s,
      [
        { ...onWall(['sd-window'], s.y(0.27)), h: s.H * 0.32, removable: false },
        onWall(['sd-picture', 'sd-clock'], s.y(0.25)),
        onWall(['sd-shelf', 'sd-clock', 'sd-picture', 'sd-mirror'], s.y(0.25), 0.85),
        onWall(['sd-clock', 'sd-picture', 'sd-shelf', 'sd-mirror'], s.y(0.23), 0.5 + 0.2 * s.fullness),
      ],
      { y: 0, depth: 10, unit: s.H * 0.34 },
    )
    if (rug && s.chance(0.7)) {
      const rb = partBounds(rug)
      s.put({ kind: 'sd-cat', cx: (rb.minX + rb.maxX) / 2, y: floor + s.H * 0.21, h: s.sized('sd-cat', u), depth: 36, on: rug.id })
    }
    homeTouches(s, floor, u)
  },
}

const readingNook: SdRecipe = {
  id: 'reading-nook',
  name: 'Reading nook',
  group: 'home',
  build(s) {
    const floor = room(s, 0.76)
    const u = s.H * 0.45
    if (s.chance(0.5)) s.put({ kind: 'sd-rug', cx: s.x(0.3 + s.rng.next() * 0.4), y: floor + s.H * 0.2, h: s.H * 0.11, maxW: s.W * 0.42, depth: 25, overlap: true })
    const placed = row(
      s,
      [
        { kinds: ['sd-floor-lamp', 'sd-tall-clock', 'sd-bookcase'] },
        { kinds: ['armchair', 'rocking-chair'] },
        { kinds: ['sd-side-table'] },
        { kinds: ['sd-footstool', 'yarn-basket'], chance: 0.9 },
        { kinds: ['houseplant', 'flower-pot'], chance: 0.6 },
        { kinds: ['sd-books', 'sd-vase', 'gramophone'], chance: 0.15 + 0.25 * s.fullness },
      ],
      { y: floor + s.H * 0.1, depth: 30, unit: u, maxH: s.H * 0.64 },
    )
    sideTableTop(s, placed, u, ['book-and-glasses', 'table-lamp', 'sd-vase', 'sd-candles', 'sd-photo'])
    row(
      s,
      [
        onWall(['sd-shelf'], s.y(0.22)),
        { ...onWall(['sd-window'], s.y(0.28)), h: s.H * 0.34, removable: false },
        onWall(['sd-shelf', 'sd-picture'], s.y(0.25), 0.8),
        onWall(['sd-clock', 'sd-mirror'], s.y(0.22), 0.5 + 0.2 * s.fullness),
      ],
      { y: 0, depth: 10, unit: s.H * 0.34 },
    )
    if (s.chance(0.5)) putClear(s, { kind: 'sd-cat', y: floor + s.H * 0.22, h: s.sized('sd-cat', u), depth: 36 }, 0.2, 0.8)
    homeTouches(s, floor, u, 0.4)
  },
}

const teaTime: SdRecipe = {
  id: 'tea-time',
  name: 'Tea time',
  group: 'home',
  build(s) {
    const floor = room(s, 0.86)
    const u = s.H * 0.48
    const table = s.put({
      kind: 'sd-tea-table',
      cx: s.x(0.5 + (s.rng.next() - 0.5) * 0.04),
      y: Math.min(s.y(0.95), floor + s.H * 0.08),
      h: s.sized('sd-tea-table', u),
      maxW: s.W * 0.42,
      depth: 30,
      removable: false,
    })
    s.onTop(
      table,
      [
        { kinds: ['teapot', 'kettle'] },
        { kinds: ['teacup'] },
        { kinds: ['sd-cake', 'fresh-pie', 'sd-cookies'] },
        { kinds: ['sd-vase', 'sd-candles'], chance: 0.8 },
        { kinds: ['teacup', 'coffee-mug'], chance: 0.8 },
        { kinds: ['sd-cookies', 'book-and-glasses', 'fresh-pie'], chance: 0.5 },
      ],
      { unit: u, maxH: s.H * 0.32 },
    )
    // A chair either side of the table, turned towards it.
    const tb = table ? partBounds(table) : null
    if (tb) {
      const chairs = (mirrored: boolean): SdRowItem[] => [{ kinds: ['armchair', 'rocking-chair'], chance: 0.85, mirrored }]
      const y = Math.min(s.y(0.95), floor + s.H * 0.06)
      // A step behind the table, so a touch smaller.
      s.row(chairs(false), { x0: s.x(0.03), x1: tb.minX - inch(0.08), y, depth: 20, unit: u * 0.88 })
      s.row(chairs(true), { x0: tb.maxX + inch(0.08), x1: s.x(0.97), y, depth: 20, unit: u * 0.88 })
    }
    row(
      s,
      [
        { ...onWall(['sd-window'], s.y(0.25)), h: s.H * 0.38, removable: false },
        onWall(['sd-clock', 'sd-picture'], s.y(0.2)),
        onWall(['sd-picture', 'sd-shelf'], s.y(0.22), 0.85),
        onWall(['sd-clock', 'sd-picture', 'sd-mirror'], s.y(0.2), 0.5 + 0.2 * s.fullness),
      ],
      { y: 0, depth: 10, unit: s.H * 0.34 },
    )
    // In front: a cat, a basket, a plant, wherever the floor is clear.
    row(
      s,
      [
        { kinds: ['sd-cat', 'yarn-basket', 'sd-dog'], chance: 0.8 },
        { kinds: ['houseplant', 'flower-pot'], chance: 0.7 },
        { kinds: ['sd-slippers', 'sd-books'], chance: 0.3 + 0.2 * s.fullness },
      ],
      { y: Math.min(s.y(0.95), floor + s.H * 0.1), depth: 40, unit: u * 0.85, maxH: s.H * 0.3 },
    )
    homeTouches(s, floor, u, 0.7)
  },
}

const hobbyCorner: SdRecipe = {
  id: 'hobby-corner',
  name: 'Hobby corner',
  group: 'home',
  build(s) {
    const floor = room(s)
    const u = s.H * 0.4
    const placed = row(
      s,
      [
        { kinds: ['sd-easel'] },
        { kinds: ['sd-side-table'] },
        { kinds: ['acoustic-guitar'] },
        { kinds: ['yarn-basket', 'sd-footstool'], chance: 0.85 },
        { kinds: ['houseplant', 'flower-pot'], chance: 0.5 },
      ],
      { y: floor + s.H * 0.1, depth: 30, unit: u, maxH: s.H * 0.62 },
    )
    sideTableTop(s, placed, u, ['gramophone', 'vintage-camera', 'vintage-radio', 'sd-cactus'])
    row(
      s,
      [
        onWall(['sd-picture'], s.y(0.25)),
        onWall(['sd-shelf'], s.y(0.24)),
        { ...onWall(['sd-window'], s.y(0.27), 0.8), h: s.size(0.3) },
        onWall(['sd-clock', 'sd-picture', 'sd-mirror'], s.y(0.23), 0.4 + 0.2 * s.fullness),
      ],
      { y: 0, depth: 10, unit: s.H * 0.34 },
    )
    homeTouches(s, floor, u)
  },
}

/* ------------------------------------------------------------------ *
 * Porch, garden and outdoors
 * ------------------------------------------------------------------ */

const frontPorch: SdRecipe = {
  id: 'front-porch',
  name: 'Front porch',
  group: 'outdoors',
  build(s) {
    const floor = s.y(0.78)
    // The porch roof's beam across the top (what the baskets hang from), the house wall's siding,
    // and the porch posts at either end.
    const beam = s.y(CEILING)
    s.band(s.panel.minY - 40, beam, 0.5)
    for (let v = 0.1; v < 0.72; v += 0.12) s.band(s.y(v), s.y(v) + 1.5, 1)
    s.band(floor - s.H * 0.03, floor, 11)
    s.band(floor, s.panel.maxY + 40, 12)
    const post = Math.max(inch(0.14), s.W * 0.035)
    s.ring(rect(s.panel.minX - 10, s.panel.minY - 10, post + 10, floor - s.panel.minY + 10), 13)
    s.ring(rect(s.panel.maxX - post, s.panel.minY - 10, post + 10, floor - s.panel.minY + 10), 13)
    const inner = (post + inch(0.1)) / s.W
    const u = s.H * 0.36
    const wall = { y: 0, depth: 10, unit: u, x0: inner, x1: 1 - inner }
    // The front door first, then what sits out on the porch, then the windows and baskets wherever
    // the wall is clear above them.
    row(s, [{ kinds: ['sd-door'], h: s.H * 0.64, y: floor, removable: false }], wall)
    row(
      s,
      [
        { kinds: ['rocking-chair', 'armchair', 'park-bench'] },
        { kinds: ['flower-pot', 'houseplant'] },
        { kinds: ['watering-can', 'lantern'], chance: 0.85 },
        { kinds: ['sd-cat', 'sd-doormat', 'sd-dog'], chance: 0.8 },
        { kinds: ['flower-pot', 'sd-vase', 'yarn-basket'], chance: 0.6 },
        { kinds: ['sd-books', 'sun-hat', 'lantern', 'sd-cat'], chance: 0.15 + 0.25 * s.fullness },
      ],
      { y: floor + s.H * 0.1, depth: 30, unit: u, x0: inner, x1: 1 - inner },
    )
    row(
      s,
      [
        { ...onWall(['sd-window'], s.y(0.31)), h: s.H * 0.34, removable: false },
        { kinds: ['sd-hanging'], anchor: 'top', y: beam, chance: 0.85 },
        { kinds: ['sd-hanging'], anchor: 'top', y: beam, chance: 0.6 },
        { ...onWall(['sd-window'], s.y(0.3), 0.4), h: s.H * 0.28 },
      ],
      wall,
    )
    homeTouches(s, floor, u, 0.8)
  },
}

/** Far side of a garden: trees, sheds and fences on the back of the lawn, at a smaller scale. */
const BACK = 0.16

const garden: SdRecipe = {
  id: 'garden',
  name: 'Garden',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.5)
    row(
      s,
      [
        { kinds: ['wheelbarrow'] },
        { kinds: ['sunflower'] },
        { kinds: ['watering-can', 'flower-pot'] },
        { kinds: ['birdhouse', 'birdbath', 'sd-feeder'], chance: 0.85 },
        { kinds: ['sd-flowers', 'flower-pot'], chance: 0.8 },
        { kinds: ['songbird', 'sd-flowers', 'sd-snail'], chance: 0.4 },
      ],
      { y: s.y(0.94), depth: 30, unit: s.H * 0.27, maxH: s.H * 0.42 },
    )
    row(
      s,
      [
        { kinds: ['garden-shed', 'sd-tree', 'sd-arch'] },
        { kinds: ['sd-fence'], maxW: s.W * 0.28 },
        { kinds: ['sd-bush', 'sd-tree', 'sd-pine'], chance: 0.8 },
      ],
      { y: ground - s.H * 0.02, depth: 20, unit: s.H * BACK, maxH: s.H * 0.44 },
    )
    sky(s, 0.5, ['butterfly'])
  },
}

const patio: SdRecipe = {
  id: 'patio-coffee',
  name: 'Patio coffee',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.48)
    // Paving: the patio's edge and a joint across it.
    const edge = s.y(0.74)
    s.band(edge, s.panel.maxY + 40, 16)
    s.band(edge + s.H * 0.1, edge + s.H * 0.1 + 1.5, 16.5)
    const u = s.H * 0.3
    const placed = row(
      s,
      [
        { kinds: ['deck-chair'] },
        { kinds: ['sd-side-table'] },
        { kinds: ['flower-pot', 'birdbath', 'sd-feeder'] },
        { kinds: ['deck-chair', 'watering-can'], chance: 0.7 },
        { kinds: ['sd-flowers', 'flower-pot'], chance: 0.7 },
      ],
      { y: s.y(0.94), depth: 30, unit: u, maxH: s.H * 0.42 },
    )
    sideTableTop(s, placed, u, ['coffee-mug', 'teapot', 'sd-vase', 'fresh-pie', 'sd-fruit'])
    row(
      s,
      [
        { kinds: ['sd-bush', 'sd-tree'] },
        { kinds: ['sd-fence', 'sd-bush'], maxW: s.W * 0.28, chance: 0.8 },
        { kinds: ['sd-bush', 'sd-pine', 'birdhouse', 'sd-arch'], chance: 0.7 },
      ],
      { y: ground, depth: 20, unit: s.H * BACK, maxH: s.H * 0.42 },
    )
    sky(s, 0.48)
  },
}

const backyard: SdRecipe = {
  id: 'backyard',
  name: 'Backyard afternoon',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.52)
    row(
      s,
      [
        { kinds: ['hammock', 'park-bench', 'sd-picnic-table'], maxW: s.W * 0.34 },
        { kinds: ['deck-chair'] },
        { kinds: ['birdbath', 'birdhouse', 'sunflower', 'sd-feeder'], chance: 0.85 },
        { kinds: ['picnic-basket', 'watering-can', 'sd-ball', 'sd-dog'], chance: 0.85 },
        { kinds: ['sd-flowers'], chance: 0.7 },
        { kinds: ['flower-pot', 'songbird', 'sd-snail'], chance: 0.15 + 0.25 * s.fullness },
      ],
      { y: s.y(0.94), depth: 30, unit: s.H * 0.3, maxH: s.H * 0.42 },
    )
    row(
      s,
      [
        { kinds: ['sd-tree'] },
        { kinds: ['sd-fence', 'sd-washing'], maxW: s.W * 0.34, chance: 0.85 },
        { kinds: ['sd-pine', 'sd-bush', 'garden-shed'], chance: 0.7 },
      ],
      { y: ground, depth: 20, unit: s.H * BACK, maxH: s.H * 0.46 },
    )
    sky(s, 0.52, ['sd-kite', 'butterfly'])
  },
}

const picnic: SdRecipe = {
  id: 'picnic',
  name: 'Picnic in the park',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.5)
    const u = s.H * 0.3
    const blanketAt = s.x(0.36 + s.rng.next() * 0.28)
    const blanket = s.put({ kind: 'sd-blanket', cx: blanketAt, y: s.y(0.93), h: s.H * 0.17, maxW: s.W * 0.5, depth: 25, removable: false, overlap: true })
    s.onTop(
      blanket,
      [
        { kinds: ['picnic-basket'] },
        { kinds: ['fresh-pie', 'sd-cake', 'teapot', 'sd-fruit', 'sd-bread'] },
        { kinds: ['coffee-mug', 'teacup', 'sun-hat', 'book-and-glasses'], chance: 0.85 },
      ],
      { unit: u },
    )
    const bb = blanket ? partBounds(blanket) : null
    if (bb) {
      const at = { y: s.y(0.93), depth: 30, unit: u, maxH: s.H * 0.38 }
      s.row(s.rng.shuffle([{ kinds: ['sd-bicycle', 'sd-signpost'] }, { kinds: ['sd-flowers', 'watering-can', 'sd-ball'], chance: 0.7 }]), {
        ...at,
        x0: s.x(0.04),
        x1: bb.minX - inch(0.1),
      })
      s.row(s.rng.shuffle([{ kinds: ['sd-flowers', 'songbird', 'sd-bush', 'sd-cool-box'] }, { kinds: ['sd-bicycle', 'deck-chair'], chance: 0.6 }]), {
        ...at,
        x0: bb.maxX + inch(0.1),
        x1: s.x(0.96),
      })
    }
    row(
      s,
      [
        { kinds: ['sd-tree'] },
        { kinds: ['park-bench'], chance: 0.7 },
        { kinds: ['sd-pine', 'sd-tree', 'sd-bush'], chance: 0.8 },
      ],
      { y: ground, depth: 20, unit: s.H * BACK, maxH: s.H * 0.46 },
    )
    sky(s, 0.5, ['sd-kite', 'hot-air-balloon'])
  },
}

const golf: SdRecipe = {
  id: 'golf',
  name: 'A round of golf',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.52)
    row(
      s,
      [
        { kinds: ['golf-cart'] },
        { kinds: ['golf-flag'] },
        { kinds: ['golf-bag'] },
        { kinds: ['park-bench', 'sd-bush', 'sd-flowers'], chance: 0.7 },
        { kinds: ['sun-hat', 'coffee-mug', 'sd-bucket'], chance: 0.4 },
        { kinds: ['sd-flowers', 'sd-bush', 'songbird'], chance: 0.15 + 0.25 * s.fullness },
      ],
      { y: s.y(0.94), depth: 30, unit: s.H * 0.24, maxH: s.H * 0.4 },
    )
    s.row(s.rng.shuffle([{ kinds: ['sd-bunker'], h: s.size(0.08), maxW: s.W * 0.28 }, { kinds: ['sd-flowers', 'sd-bush'], chance: 0.5 }]), {
      x0: s.x(0.1),
      x1: s.x(0.9),
      y: ground + s.H * 0.12,
      depth: 22,
      unit: s.H * 0.2,
    })
    row(
      s,
      [
        { kinds: ['sd-pine', 'sd-tree'] },
        { kinds: ['sd-tree', 'sd-bush'], chance: 0.85 },
        { kinds: ['sd-pine', 'sd-bush'], chance: 0.7 },
      ],
      { y: ground, depth: 20, unit: s.H * 0.15, maxH: s.H * 0.42 },
    )
    sky(s, 0.52, ['sd-birds'])
  },
}

/* ------------------------------------------------------------------ *
 * Travel and the seaside
 * ------------------------------------------------------------------ */

const beach: SdRecipe = {
  id: 'beach',
  name: 'Beach day',
  group: 'travel',
  build(s) {
    const horizon = sea(s, 0.4, 1)
    const shore = horizon + s.H * (0.14 + s.rng.next() * 0.04)
    s.wave(shore, s.H * 0.012, s.W * 0.9, 15)
    row(
      s,
      [
        { kinds: ['sd-umbrella', 'sd-palm'] },
        { kinds: ['deck-chair'] },
        { kinds: ['sd-sandcastle', 'picnic-basket', 'sd-cool-box'] },
        { kinds: ['sd-bucket', 'sd-ball'] },
        { kinds: ['sun-hat', 'picnic-basket', 'suitcase', 'sd-flip-flops'], chance: 0.7 },
      ],
      { y: s.y(0.95), depth: 30, unit: s.H * 0.3, maxH: s.H * 0.52 },
    )
    s.row(
      s.rng.shuffle([
        { kinds: ['sd-sandcastle'] },
        { kinds: ['sd-ball', 'sd-bucket', 'sd-crab'] },
        { kinds: ['sd-bucket', 'sun-hat', 'sd-shells'], chance: 0.6 },
      ]),
      { x0: s.x(0.08), x1: s.x(0.92), y: shore + s.H * 0.16, depth: 24, unit: s.H * 0.25 },
    )
    // Out at sea and in the sky, after the beach: clear of the umbrella and everything else.
    scatter(s, ['sailboat', 'lighthouse', 'cruise-ship'], 1, { minX: s.x(0.12), maxX: s.x(0.88), minY: horizon - s.H * 0.02, maxY: horizon }, s.size(0.2), 9)
    sky(s, 0.4, ['sd-birds'])
  },
}

const fishingDock: SdRecipe = {
  id: 'fishing-dock',
  name: 'Fishing dock',
  group: 'travel',
  build(s) {
    const horizon = land(s, 0.36, 'hills') - s.H * 0.08
    // A lake below the far shore, and a dock running out from one side.
    const water = horizon + s.H * 0.12
    s.band(water, s.panel.maxY + 40, 16)
    for (let i = 1; i <= 2; i++) s.wave(water + s.H * 0.12 * i, s.H * 0.008, s.W / 3, 16.2 + i * 0.1)
    const left = s.rng.chance(0.5)
    const deck = s.y(0.72)
    const dockW = s.W * (0.54 + s.rng.next() * 0.08)
    const x0 = left ? s.panel.minX - 20 : s.panel.maxX - dockW
    const x1 = left ? s.panel.minX + dockW : s.panel.maxX + 20
    const thick = s.H * 0.05
    for (let x = x0 + s.W * 0.06; x < x1 - s.W * 0.02; x += s.W * 0.16) s.ring(rect(x, deck, inch(0.12), s.panel.maxY - deck + 20), 17)
    s.ring(rect(x0, deck - thick, x1 - x0, thick), 18)
    s.band(deck - thick * 0.5, deck - thick * 0.5 + 1.2, 18.5)
    const open = left ? { minX: s.x(dockW / s.W + 0.12), maxX: s.x(0.92) } : { minX: s.x(0.08), maxX: s.x(1 - dockW / s.W - 0.12) }
    scatter(s, ['lighthouse', 'sd-pine', 'cottage'], 1, { minX: s.x(0.1), maxX: s.x(0.9), minY: water - s.H * 0.08, maxY: water - s.H * 0.06 }, s.size(0.18), 9)
    sky(s, 0.34)
    const dx0 = (left ? 0 : 1 - dockW / s.W) + 0.04
    const dx1 = (left ? dockW / s.W : 1) - 0.04
    s.row(
      s.rng.shuffle([
        { kinds: ['deck-chair'] },
        { kinds: ['sd-fishing'] },
        { kinds: ['sd-tackle', 'picnic-basket', 'lantern', 'sd-cool-box'] },
        { kinds: ['sd-bucket', 'sun-hat', 'coffee-mug'], chance: 0.8 },
      ]),
      { x0: s.x(dx0), x1: s.x(dx1), y: deck - thick * 0.6, depth: 30, unit: s.H * 0.3, maxH: s.H * 0.36 },
    )
    // A boat out on the water, or a canoe: long and low, so it is dealt shorter.
    if (s.chance(0.35)) scatter(s, ['sd-canoe'], 1, { ...open, minY: s.y(0.86), maxY: s.y(0.88) }, s.size(0.1), 26)
    else scatter(s, ['fishing-boat', 'sailboat'], 1, { ...open, minY: s.y(0.84), maxY: s.y(0.86) }, s.size(0.26), 26)
    scatter(s, ['sd-ducks'], 1, { ...open, minY: s.y(0.66), maxY: s.y(0.74) }, s.size(0.1), 26)
    scatter(s, ['sd-birds'], s.fullness > 0 ? 1 : 0, { ...open, minY: s.y(0.44), maxY: s.y(0.56) }, s.size(0.1), 26)
  },
}

const cruiseDeck: SdRecipe = {
  id: 'cruise-deck',
  name: 'Cruise deck',
  group: 'travel',
  build(s) {
    const horizon = sea(s, 0.44, 1)
    scatter(s, ['lighthouse', 'sailboat', 'cruise-ship'], 1, { minX: s.x(0.15), maxX: s.x(0.85), minY: horizon - s.H * 0.01, maxY: horizon + s.H * 0.01 }, s.size(0.17), 9)
    sky(s, 0.44, ['sd-birds', 'hot-air-balloon'])
    // The ship's rail: a top rail, a lower rail and balusters, then the deck.
    const rail = s.y(0.58)
    const deck = s.y(0.8)
    for (let x = s.panel.minX + s.W * 0.04; x < s.panel.maxX; x += s.W * 0.1) s.ring(rect(x, rail, inch(0.07), deck - rail), 20)
    s.band(rail - s.H * 0.02, rail + s.H * 0.02, 21)
    s.band(rail + (deck - rail) * 0.5, rail + (deck - rail) * 0.5 + s.H * 0.02, 20.5)
    s.band(deck, s.panel.maxY + 40, 22)
    const u = s.H * 0.32
    const placed = row(
      s,
      [
        { kinds: ['deck-chair'] },
        { kinds: ['sd-side-table'] },
        { kinds: ['deck-chair'], chance: 0.7 },
        { kinds: ['suitcase', 'sun-hat', 'binoculars'], chance: 0.85 },
        { kinds: ['houseplant', 'flower-pot'], chance: 0.4 },
      ],
      { y: s.y(0.95), depth: 30, unit: u },
    )
    sideTableTop(s, placed, u, ['coffee-mug', 'teacup', 'binoculars', 'vintage-camera', 'sd-vase'])
    // Life rings hung on the rail, wherever it is clear: the only things the rail holds up.
    s.row(s.rng.shuffle([{ kinds: ['sd-life-ring'], h: s.size(0.19), anchor: 'middle' }, { kinds: ['sd-life-ring'], h: s.size(0.16), anchor: 'middle', chance: 0.4 }]), {
      x0: s.x(0.1),
      x1: s.x(0.9),
      y: rail + (deck - rail) * 0.45,
      depth: 24,
    })
  },
}

const campsite: SdRecipe = {
  id: 'campsite',
  name: 'RV campsite',
  group: 'travel',
  build(s) {
    const ground = land(s, 0.5, 'mountains')
    row(
      s,
      [
        { kinds: ['sd-pine'] },
        { kinds: ['motorhome', 'camper-trailer'] },
        { kinds: ['sd-pine', 'sd-tree'], chance: 0.85 },
      ],
      { y: ground + s.H * 0.02, depth: 20, unit: s.H * 0.13, maxH: s.H * 0.46 },
    )
    sky(s, 0.36, ['sd-birds'])
    row(
      s,
      [
        { kinds: ['tent'] },
        { kinds: ['sd-campfire'] },
        { kinds: ['deck-chair'] },
        { kinds: ['lantern', 'picnic-basket', 'sd-bucket', 'sd-backpack'], chance: 0.85 },
        { kinds: ['sd-bicycle', 'sd-signpost'], chance: 0.6 },
        { kinds: ['sd-stump', 'sd-cool-box'], chance: 0.5 },
        { kinds: ['coffee-mug', 'kettle', 'sd-flowers'], chance: 0.5 },
      ],
      { y: s.y(0.94), depth: 30, unit: s.H * 0.26, maxH: s.H * 0.34 },
    )
  },
}

const sightseeing: SdRecipe = {
  id: 'sightseeing',
  name: 'Sightseeing trip',
  group: 'travel',
  build(s) {
    const ground = land(s, 0.46, s.rng.chance(0.5) ? 'mountains' : 'hills')
    row(
      s,
      [
        { kinds: ['sd-signpost'] },
        { kinds: ['park-bench'] },
        { kinds: ['suitcase', 'sd-backpack'] },
        { kinds: ['vintage-camera', 'binoculars', 'sun-hat'], chance: 0.85 },
        { kinds: ['sd-flowers', 'flower-pot'], chance: 0.75 },
        { kinds: ['sd-flowers', 'picnic-basket', 'flower-pot'], chance: 0.5 },
      ],
      { y: s.y(0.94), depth: 30, unit: s.H * 0.24, maxH: s.H * 0.42 },
    )
    // Far off on the hills: a landmark and a tree, small with distance (no lighthouse: it stands
    // on its own rock in the sea, never on a grassy hill).
    s.row(
      s.rng.shuffle([
        { kinds: ['steam-train', 'cottage'], h: s.size(0.17) },
        { kinds: ['sd-tree', 'sd-pine', 'cottage'], h: s.size(0.2), chance: 0.7 },
      ]),
      { x0: s.x(0.1), x1: s.x(0.9), y: ground + s.H * 0.02, depth: 16 },
    )
    sky(s, 0.42, ['hot-air-balloon'])
  },
}

/* ------------------------------------------------------------------ *
 * A kitchen, a vegetable patch, a row of beach huts
 * ------------------------------------------------------------------ */

const bakingDay: SdRecipe = {
  id: 'baking-day',
  name: 'Baking day',
  group: 'home',
  build(s) {
    const floor = room(s, 0.8)
    const u = s.H * 0.34
    // The counter along the wall, laid out for baking.
    const counter = s.put({ kind: 'sd-counter', cx: s.x(0.5 + (s.rng.next() - 0.5) * 0.12), y: floor + s.H * 0.04, h: s.sized('sd-counter', u), maxW: s.W * 0.66, depth: 30, removable: false })
    s.onTop(
      counter,
      [
        { kinds: ['sd-mixing-bowl'] },
        { kinds: ['sd-bread', 'fresh-pie'] },
        { kinds: ['sd-jars'] },
        { kinds: ['sd-cake', 'sd-cookies', 'sd-fruit'], chance: 0.85 },
        { kinds: ['kettle', 'teapot', 'houseplant'], chance: 0.6 },
      ],
      { unit: u },
    )
    // Either side of the counter: a plant, a stool or a basket.
    const cb = counter ? partBounds(counter) : null
    if (cb) {
      // Only what the kitchen does not hold yet: one floor lamp, not a pair either side.
      const fresh = (kinds: readonly string[]) => kinds.filter((k) => !s.parts.some((p) => p.kind === k))
      const side = (x0: number, x1: number) =>
        s.row(s.rng.shuffle([{ kinds: fresh(['houseplant', 'flower-pot', 'sd-floor-lamp']), chance: 0.7 }, { kinds: fresh(['sd-footstool', 'yarn-basket']), chance: 0.4 }].filter((item) => item.kinds.length > 0)), {
          x0,
          x1,
          y: floor + s.H * 0.06,
          depth: 30,
          unit: u,
        })
      side(s.x(0.04), cb.minX - inch(0.1))
      side(cb.maxX + inch(0.1), s.x(0.96))
    }
    row(
      s,
      [
        { ...onWall(['sd-window'], s.y(0.25)), h: s.H * 0.3, removable: false },
        onWall(['sd-cupboard'], s.y(0.24)),
        onWall(['sd-utensils'], s.y(0.3)),
        onWall(['sd-clock', 'sd-picture'], s.y(0.22), 0.35),
      ],
      { y: 0, depth: 10, unit: u },
    )
    homeTouches(s, floor, u, 0.35)
  },
}

const vegetablePatch: SdRecipe = {
  id: 'vegetable-patch',
  name: 'Vegetable patch',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.46)
    row(
      s,
      [
        { kinds: ['wheelbarrow'] },
        { kinds: ['sd-pumpkins'] },
        { kinds: ['sd-tools'] },
        { kinds: ['sd-crate', 'watering-can'] },
        { kinds: ['watering-can', 'sd-snail', 'sd-flowers'], chance: 0.6 },
      ],
      { y: s.y(0.95), depth: 30, unit: s.H * 0.26, maxH: s.H * 0.34 },
    )
    // Raised beds across the middle of the plot.
    s.row(
      [
        { kinds: ['sd-veg-bed'], h: s.size(0.12), maxW: s.W * 0.38 },
        { kinds: ['sd-veg-bed'], h: s.size(0.12), maxW: s.W * 0.38, chance: 0.8 },
      ],
      { x0: s.x(0.06), x1: s.x(0.94), y: ground + s.H * 0.15, depth: 24, gap: inch(0.3) },
    )
    row(
      s,
      [
        { kinds: ['garden-shed', 'sd-tree'] },
        { kinds: ['sd-scarecrow'] },
        { kinds: ['sd-fence', 'sd-bush'], maxW: s.W * 0.26, chance: 0.75 },
      ],
      { y: ground, depth: 20, unit: s.H * BACK, maxH: s.H * 0.44 },
    )
    sky(s, 0.46, ['sd-birds', 'butterfly'])
  },
}

const beachHuts: SdRecipe = {
  id: 'beach-huts',
  name: 'Beach huts',
  group: 'travel',
  build(s) {
    const horizon = sea(s, 0.34, 1)
    const shore = horizon + s.H * 0.08
    s.wave(shore, s.H * 0.01, s.W * 0.9, 15)
    // A row of huts along the top of the beach, a palm or an umbrella between them.
    row(
      s,
      [
        { kinds: ['sd-beach-hut'] },
        { kinds: ['sd-beach-hut'] },
        { kinds: ['sd-beach-hut', 'sd-palm'], chance: 0.7 },
        { kinds: ['sd-palm', 'sd-umbrella'], chance: 0.6 },
      ],
      { y: shore + s.H * 0.2, depth: 20, unit: s.H * 0.17, maxH: s.H * 0.44 },
    )
    sky(s, 0.32, ['sd-birds', 'sd-kite'])
    // Things left on the sand between the huts and the front.
    s.row(
      s.rng.shuffle([
        { kinds: ['sd-sandcastle', 'sd-ball'] },
        { kinds: ['sd-shells', 'sd-crab', 'sd-bucket'], chance: 0.7 },
      ]),
      { x0: s.x(0.1), x1: s.x(0.9), y: s.y(0.76), depth: 24, gap: inch(0.4), unit: s.H * 0.22 },
    )
    row(
      s,
      [
        { kinds: ['deck-chair'] },
        { kinds: ['sd-cool-box', 'picnic-basket'] },
        { kinds: ['sd-sandcastle', 'sd-bucket'] },
        { kinds: ['sd-crab', 'sd-shells', 'sd-flip-flops'] },
        { kinds: ['sd-ball', 'sun-hat', 'sd-shells'], chance: 0.7 },
      ],
      { y: s.y(0.95), depth: 30, unit: s.H * 0.27 },
    )
  },
}

export const SD_RECIPES: readonly SdRecipe[] = [
  livingRoom,
  readingNook,
  teaTime,
  hobbyCorner,
  bakingDay,
  frontPorch,
  garden,
  patio,
  backyard,
  picnic,
  golf,
  vegetablePatch,
  beach,
  fishingDock,
  cruiseDeck,
  campsite,
  sightseeing,
  beachHuts,
]

const RECIPE_INDEX = new Map(SD_RECIPES.map((r) => [r.id, r]))
export const sdRecipeById = (id: string) => RECIPE_INDEX.get(id)

export const sdGroupRecipes = (group: SdGroupChoice): readonly SdRecipe[] =>
  group === 'mix' ? SD_RECIPES : SD_RECIPES.filter((r) => r.group === group)

/** Deal one scene from a recipe into a panel. */
export function dealScene(recipe: SdRecipe, panel: Bounds, rng: StudioRng, fullness: 0 | 1 | 2): SdScene {
  const stage = new SdStage(panel, rng, fullness)
  recipe.build(stage)
  return stage.done(recipe.id)
}
