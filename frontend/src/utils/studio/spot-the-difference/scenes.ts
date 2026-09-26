import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import type { Bounds } from '../stained-glass/geometry'
import { poly, rect } from '../stained-glass/subject-kit'
import type { SdGroup, SdGroupChoice } from './content'
import { partBounds, SdStage, type SdPart, type SdRowItem, type SdScene } from './scene'

/**
 * The scenes: a front porch, a tea table, a beach, a fishing dockâ€¦
 *
 * A recipe deals one scene into a picture panel: which things are in it
 * (from a pool for every slot), their order, the gaps between them, which
 * version of each and which way it faces, and a handful of optional extras
 * (a rug, a kite, birds). The panel's shape changes with the trim, so
 * recipes place things by share of the panel and let the stage pack them.
 *
 * Scenes are dealt full enough to hide ten fair changes â€” a dozen or more
 * things, each big enough to see â€” but never crowded: things in one plane
 * never overlap, the sky's sun and clouds keep clear of everything, and
 * nothing is filler too small to matter.
 *
 * The mood is the ordinary pleasures of retirement â€” a morning coffee, a
 * garden, a trip â€” never illness, money worries or age itself, and no one
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

/** Back wall, baseboard and floor. Returns the floor line. */
function room(s: SdStage, at = 0.74): number {
  const floor = s.y(at + s.rng.next() * 0.04)
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
  if (s.chance(0.6)) scatter(s, ['sd-birds'], 1, band, s.size(0.1), 7)
  for (const kind of extras) if (s.chance(0.55)) scatter(s, [kind], 1, band, s.size(0.2), 7)
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

const row = (s: SdStage, items: readonly SdRowItem[], y: number, depth: number, x0 = 0.04, x1 = 0.96) =>
  s.row(s.rng.shuffle(items), { x0: s.x(x0), x1: s.x(x1), y, depth })

const find = (parts: readonly SdPart[], kinds: readonly string[]) => parts.find((p) => kinds.includes(p.kind)) ?? null

/** Things hung on a wall, centred on `v` (share of the height). */
const onWall = (kinds: readonly string[], h: number, v: number, chance = 1): SdRowItem => ({ kinds, h, anchor: 'middle', y: v, chance })

/* ------------------------------------------------------------------ *
 * At home
 * ------------------------------------------------------------------ */

/**
 * What makes a room lived in, dealt after its furniture: a lamp hanging
 * from the ceiling (clear of everything on the wall), and a few small things
 * on the floor nearest the reader — slippers, a pile of books, the cat.
 */
function homeTouches(s: SdStage, floor: number, pendant = 0.65) {
  if (s.chance(pendant)) {
    for (let tries = 0; tries < 6; tries++) {
      if (s.put({ kind: 'sd-pendant', cx: s.x(0.15 + s.rng.next() * 0.7), y: s.y(0.045), h: s.size(0.22), depth: 12, anchor: 'top', clear: true })) break
    }
  }
  const front = Math.min(s.y(0.955), floor + s.H * 0.2)
  if (front - floor < s.H * 0.14) return
  s.row(
    s.rng.shuffle([
      { kinds: ['sd-slippers'], h: s.size(0.08), chance: 0.75 },
      { kinds: ['sd-books', 'yarn-basket'], h: s.size(0.12), chance: 0.75 },
      { kinds: ['sleeping-cat', 'sd-footstool'], h: s.size(0.12), chance: 0.4 },
    ]),
    { x0: s.x(0.06), x1: s.x(0.94), y: front, depth: 40, gap: inch(0.5) },
  )
}

const TABLETOP = ['teacup', 'coffee-mug', 'book-and-glasses', 'sd-vase', 'vintage-radio', 'table-lamp', 'houseplant', 'teapot']
const CUPS = ['teacup', 'coffee-mug', 'book-and-glasses']

function sideTableTop(s: SdStage, placed: readonly SdPart[], first: readonly string[] = TABLETOP) {
  s.onTop(find(placed, ['sd-side-table']), [
    { kinds: first, h: s.size(0.2) },
    { kinds: CUPS, h: s.size(0.12), chance: 0.8 },
    { kinds: ['sd-vase', 'sd-cookies', 'teacup'], h: s.size(0.14), chance: 0.4 },
  ])
}

const livingRoom: SdRecipe = {
  id: 'living-room',
  name: 'Cozy living room',
  group: 'home',
  build(s) {
    const floor = room(s)
    row(
      s,
      [
        { ...onWall(['sd-window'], s.H * 0.44, s.y(0.36)), removable: false },
        onWall(['sd-picture', 'sd-clock'], s.size(0.2), s.y(0.3)),
        onWall(['sd-shelf', 'sd-clock', 'sd-picture'], s.size(0.2), s.y(0.3), 0.85),
        onWall(['sd-clock', 'sd-picture'], s.size(0.18), s.y(0.26), 0.4),
      ],
      0,
      10,
    )
    const rug = s.put({ kind: 'sd-rug', cx: s.x(0.35 + s.rng.next() * 0.3), y: floor + s.H * 0.2, h: s.H * 0.12, maxW: s.W * 0.46, depth: 25, overlap: true })
    const placed = row(
      s,
      [
        { kinds: ['armchair', 'rocking-chair'], h: s.H * 0.44 },
        { kinds: ['sd-side-table'], h: s.H * 0.28 },
        { kinds: ['houseplant', 'sd-floor-lamp'], h: s.H * 0.42 },
        { kinds: ['yarn-basket', 'sd-footstool'], h: s.size(0.15), chance: 0.8 },
        { kinds: ['flower-pot', 'sd-vase', 'gramophone'], h: s.size(0.2), chance: 0.5 },
      ],
      floor + s.H * 0.1,
      30,
    )
    sideTableTop(s, placed)
    if (rug && s.chance(0.7)) s.put({ kind: 'sleeping-cat', cx: (partBounds(rug).minX + partBounds(rug).maxX) / 2, y: floor + s.H * 0.21, h: s.size(0.14), depth: 36 })
    homeTouches(s, floor)
  },
}

const readingNook: SdRecipe = {
  id: 'reading-nook',
  name: 'Reading nook',
  group: 'home',
  build(s) {
    const floor = room(s, 0.76)
    row(
      s,
      [
        onWall(['sd-shelf'], s.size(0.22), s.y(0.24)),
        { ...onWall(['sd-window'], s.H * 0.46, s.y(0.38)), removable: false },
        onWall(['sd-shelf', 'sd-picture'], s.size(0.2), s.y(0.3), 0.8),
        onWall(['sd-clock'], s.size(0.18), s.y(0.22), 0.5),
      ],
      0,
      10,
    )
    if (s.chance(0.5)) s.put({ kind: 'sd-rug', cx: s.x(0.3 + s.rng.next() * 0.4), y: floor + s.H * 0.2, h: s.H * 0.11, maxW: s.W * 0.42, depth: 25, overlap: true })
    const placed = row(
      s,
      [
        { kinds: ['sd-floor-lamp'], h: s.H * 0.62 },
        { kinds: ['armchair', 'rocking-chair'], h: s.H * 0.44 },
        { kinds: ['sd-side-table'], h: s.H * 0.28 },
        { kinds: ['sd-footstool', 'yarn-basket'], h: s.size(0.14), chance: 0.9 },
        { kinds: ['houseplant', 'flower-pot'], h: s.size(0.3), chance: 0.6 },
      ],
      floor + s.H * 0.1,
      30,
    )
    sideTableTop(s, placed, ['book-and-glasses', 'table-lamp', 'sd-vase'])
    if (s.chance(0.5)) s.put({ kind: 'sleeping-cat', cx: s.x(0.2 + s.rng.next() * 0.6), y: floor + s.H * 0.22, h: s.size(0.13), depth: 36 })
    homeTouches(s, floor, 0.4)
  },
}

const teaTime: SdRecipe = {
  id: 'tea-time',
  name: 'Tea time',
  group: 'home',
  build(s) {
    const floor = room(s, 0.86)
    row(
      s,
      [
        { ...onWall(['sd-window'], s.H * 0.38, s.y(0.25)), removable: false },
        onWall(['sd-clock', 'sd-picture'], s.size(0.19), s.y(0.2)),
        onWall(['sd-picture', 'sd-shelf'], s.size(0.18), s.y(0.22), 0.7),
        onWall(['sd-clock', 'sd-picture'], s.size(0.16), s.y(0.2), 0.4),
      ],
      0,
      10,
    )
    // A chair either side, behind the table.
    for (const u of [0.13, 0.87]) {
      if (s.chance(0.85)) s.put({ kind: s.rng.pick(['armchair', 'rocking-chair']), cx: s.x(u), y: Math.min(s.y(0.95), floor + s.H * 0.06), h: s.H * 0.4, depth: 20, mirrored: u > 0.5 })
    }
    const table = s.put({ kind: 'sd-tea-table', cx: s.x(0.5 + (s.rng.next() - 0.5) * 0.04), y: Math.min(s.y(0.95), floor + s.H * 0.08), h: s.H * 0.38, maxW: s.W * 0.58, depth: 30, removable: false })
    s.onTop(table, [
      { kinds: ['teapot', 'kettle'], h: s.size(0.3) },
      { kinds: ['teacup'], h: s.size(0.16) },
      { kinds: ['sd-cake', 'fresh-pie', 'sd-cookies'], h: s.size(0.2) },
      { kinds: ['sd-vase'], h: s.size(0.32), chance: 0.8 },
      { kinds: ['teacup', 'coffee-mug'], h: s.size(0.16), chance: 0.8 },
      { kinds: ['sd-cookies', 'book-and-glasses', 'fresh-pie'], h: s.size(0.12), chance: 0.5 },
    ])
    // Beside and in front of the table: a cat, a basket, a plant.
    row(
      s,
      [
        { kinds: ['sleeping-cat', 'yarn-basket'], h: s.size(0.14), chance: 0.8 },
        { kinds: ['houseplant', 'flower-pot'], h: s.size(0.3), chance: 0.7 },
      ],
      Math.min(s.y(0.95), floor + s.H * 0.1),
      40,
    )
    homeTouches(s, floor, 0.7)
  },
}

const hobbyCorner: SdRecipe = {
  id: 'hobby-corner',
  name: 'Hobby corner',
  group: 'home',
  build(s) {
    const floor = room(s)
    row(
      s,
      [
        onWall(['sd-picture'], s.size(0.22), s.y(0.28)),
        onWall(['sd-shelf'], s.size(0.2), s.y(0.26)),
        onWall(['sd-window'], s.size(0.36), s.y(0.34), 0.8),
        onWall(['sd-clock', 'sd-picture'], s.size(0.18), s.y(0.24), 0.4),
      ],
      0,
      10,
    )
    const placed = row(
      s,
      [
        { kinds: ['sd-easel'], h: s.H * 0.6 },
        { kinds: ['sd-side-table'], h: s.H * 0.28 },
        { kinds: ['acoustic-guitar'], h: s.H * 0.44 },
        { kinds: ['yarn-basket', 'sd-footstool'], h: s.size(0.15), chance: 0.85 },
        { kinds: ['houseplant', 'flower-pot'], h: s.size(0.28), chance: 0.5 },
      ],
      floor + s.H * 0.1,
      30,
    )
    sideTableTop(s, placed, ['gramophone', 'vintage-camera', 'vintage-radio'])
    homeTouches(s, floor)
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
    // The house wall's siding, and the porch posts at either end.
    for (let v = 0.1; v < 0.72; v += 0.12) s.band(s.y(v), s.y(v) + 1.5, 1)
    s.band(floor - s.H * 0.03, floor, 11)
    s.band(floor, s.panel.maxY + 40, 12)
    const post = Math.max(inch(0.14), s.W * 0.035)
    s.ring(rect(s.panel.minX - 10, s.panel.minY - 10, post + 10, floor - s.panel.minY + 10), 13)
    s.ring(rect(s.panel.maxX - post, s.panel.minY - 10, post + 10, floor - s.panel.minY + 10), 13)
    const inner = (post + inch(0.1)) / s.W
    row(
      s,
      [
        { kinds: ['sd-door'], h: s.H * 0.64, y: floor, removable: false },
        { ...onWall(['sd-window'], s.H * 0.4, s.y(0.36)), removable: false },
        { kinds: ['sd-hanging'], h: s.size(0.3), anchor: 'top', y: s.y(0.04), chance: 0.85 },
        { kinds: ['sd-hanging'], h: s.size(0.28), anchor: 'top', y: s.y(0.04), chance: 0.6 },
        onWall(['sd-window'], s.H * 0.3, s.y(0.34), 0.4),
      ],
      0,
      10,
      inner,
      1 - inner,
    )
    row(
      s,
      [
        { kinds: ['rocking-chair', 'armchair', 'park-bench'], h: s.H * 0.38 },
        { kinds: ['flower-pot', 'houseplant'], h: s.size(0.22) },
        { kinds: ['watering-can', 'lantern'], h: s.size(0.16), chance: 0.85 },
        { kinds: ['sleeping-cat', 'sd-doormat'], h: s.size(0.1), chance: 0.8 },
        { kinds: ['flower-pot', 'sd-vase', 'yarn-basket'], h: s.size(0.18), chance: 0.6 },
      ],
      floor + s.H * 0.1,
      30,
      inner,
      1 - inner,
    )
    homeTouches(s, floor, 0.8)
  },
}

const garden: SdRecipe = {
  id: 'garden',
  name: 'Garden',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.5)
    row(
      s,
      [
        { kinds: ['garden-shed', 'sd-tree'], h: s.H * 0.46 },
        { kinds: ['sd-fence'], h: s.size(0.17), maxW: s.W * 0.28 },
        { kinds: ['sd-bush', 'sd-tree', 'sd-pine'], h: s.H * 0.3, chance: 0.8 },
      ],
      ground - s.H * 0.02,
      20,
    )
    sky(s, 0.5, ['butterfly'])
    row(
      s,
      [
        { kinds: ['wheelbarrow'], h: s.size(0.2) },
        { kinds: ['sunflower'], h: s.H * 0.34 },
        { kinds: ['watering-can', 'flower-pot'], h: s.size(0.17) },
        { kinds: ['birdhouse', 'birdbath'], h: s.H * 0.3, chance: 0.85 },
        { kinds: ['sd-flowers', 'flower-pot'], h: s.size(0.14), chance: 0.8 },
        { kinds: ['songbird', 'sd-flowers'], h: s.size(0.12), chance: 0.4 },
      ],
      s.y(0.94),
      30,
    )
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
    row(
      s,
      [
        { kinds: ['sd-bush', 'sd-tree'], h: s.H * 0.3 },
        { kinds: ['sd-fence', 'sd-bush'], h: s.size(0.17), maxW: s.W * 0.28, chance: 0.8 },
        { kinds: ['sd-bush', 'sd-pine', 'birdhouse'], h: s.H * 0.28, chance: 0.7 },
      ],
      ground,
      20,
    )
    sky(s, 0.48)
    const placed = row(
      s,
      [
        { kinds: ['deck-chair'], h: s.H * 0.32 },
        { kinds: ['sd-side-table'], h: s.H * 0.28 },
        { kinds: ['flower-pot', 'birdbath'], h: s.size(0.24) },
        { kinds: ['deck-chair', 'watering-can'], h: s.H * 0.28, chance: 0.7 },
        { kinds: ['sd-flowers', 'flower-pot'], h: s.size(0.14), chance: 0.7 },
      ],
      s.y(0.94),
      30,
    )
    sideTableTop(s, placed, ['coffee-mug', 'teapot', 'sd-vase', 'fresh-pie'])
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
        { kinds: ['sd-tree'], h: s.H * 0.46 },
        { kinds: ['sd-fence'], h: s.size(0.17), maxW: s.W * 0.28, chance: 0.85 },
        { kinds: ['sd-pine', 'sd-bush', 'garden-shed'], h: s.H * 0.34, chance: 0.7 },
      ],
      ground,
      20,
    )
    sky(s, 0.52, ['sd-kite', 'butterfly'])
    row(
      s,
      [
        { kinds: ['hammock', 'park-bench'], h: s.H * 0.28 },
        { kinds: ['deck-chair'], h: s.H * 0.28 },
        { kinds: ['birdbath', 'birdhouse', 'sunflower'], h: s.H * 0.3, chance: 0.85 },
        { kinds: ['picnic-basket', 'watering-can', 'sd-ball'], h: s.size(0.14), chance: 0.85 },
        { kinds: ['sd-flowers'], h: s.size(0.13), chance: 0.7 },
      ],
      s.y(0.94),
      30,
    )
  },
}

const picnic: SdRecipe = {
  id: 'picnic',
  name: 'Picnic in the park',
  group: 'outdoors',
  build(s) {
    const ground = land(s, 0.5)
    row(
      s,
      [
        { kinds: ['sd-tree'], h: s.H * 0.46 },
        { kinds: ['park-bench'], h: s.size(0.2), chance: 0.7 },
        { kinds: ['sd-pine', 'sd-tree', 'sd-bush'], h: s.H * 0.34, chance: 0.8 },
      ],
      ground,
      20,
    )
    sky(s, 0.5, ['sd-kite', 'hot-air-balloon'])
    const blanketAt = s.x(0.36 + s.rng.next() * 0.28)
    const blanket = s.put({ kind: 'sd-blanket', cx: blanketAt, y: s.y(0.93), h: s.H * 0.17, maxW: s.W * 0.5, depth: 25, removable: false, overlap: true })
    s.onTop(blanket, [
      { kinds: ['picnic-basket'], h: s.size(0.2) },
      { kinds: ['fresh-pie', 'sd-cake', 'teapot'], h: s.size(0.14) },
      { kinds: ['coffee-mug', 'teacup', 'sun-hat', 'book-and-glasses'], h: s.size(0.11), chance: 0.85 },
    ])
    const bb = blanket ? partBounds(blanket) : null
    if (bb) {
      s.row(s.rng.shuffle([{ kinds: ['bicycle', 'sd-signpost'], h: s.H * 0.26 }, { kinds: ['sd-flowers', 'watering-can', 'sd-ball'], h: s.size(0.13), chance: 0.7 }]), {
        x0: s.x(0.04),
        x1: bb.minX - inch(0.1),
        y: s.y(0.93),
        depth: 30,
      })
      s.row(s.rng.shuffle([{ kinds: ['sd-flowers', 'songbird', 'sd-bush'], h: s.size(0.14) }, { kinds: ['bicycle', 'deck-chair'], h: s.H * 0.26, chance: 0.6 }]), {
        x0: bb.maxX + inch(0.1),
        x1: s.x(0.96),
        y: s.y(0.93),
        depth: 30,
      })
    }
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
        { kinds: ['sd-pine', 'sd-tree'], h: s.H * 0.42 },
        { kinds: ['sd-tree', 'sd-bush'], h: s.H * 0.32, chance: 0.85 },
        { kinds: ['sd-pine', 'sd-bush'], h: s.H * 0.36, chance: 0.7 },
      ],
      ground,
      20,
    )
    sky(s, 0.52, ['sd-birds'])
    s.row(s.rng.shuffle([{ kinds: ['sd-bunker'], h: s.H * 0.08, maxW: s.W * 0.28 }, { kinds: ['sd-flowers', 'sd-bush'], h: s.size(0.12), chance: 0.5 }]), {
      x0: s.x(0.1),
      x1: s.x(0.9),
      y: ground + s.H * 0.12,
      depth: 22,
    })
    row(
      s,
      [
        { kinds: ['golf-cart'], h: s.H * 0.3 },
        { kinds: ['golf-flag'], h: s.H * 0.36 },
        { kinds: ['golf-bag'], h: s.H * 0.3 },
        { kinds: ['park-bench', 'sd-bush', 'sd-flowers'], h: s.size(0.16), chance: 0.7 },
        { kinds: ['sun-hat', 'coffee-mug', 'sd-bucket'], h: s.size(0.1), chance: 0.4 },
      ],
      s.y(0.94),
      30,
    )
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
        { kinds: ['sd-umbrella'], h: s.H * 0.5 },
        { kinds: ['deck-chair'], h: s.H * 0.28 },
        { kinds: ['sd-sandcastle', 'picnic-basket'], h: s.size(0.18) },
        { kinds: ['sd-bucket', 'sd-ball'], h: s.size(0.13) },
        { kinds: ['sun-hat', 'picnic-basket', 'suitcase'], h: s.size(0.11), chance: 0.7 },
      ],
      s.y(0.95),
      30,
    )
    // Out at sea and in the sky, after the beach: clear of the umbrella and everything else.
    scatter(s, ['sailboat', 'lighthouse', 'cruise-ship'], 1, { minX: s.x(0.12), maxX: s.x(0.88), minY: horizon - s.H * 0.02, maxY: horizon }, s.size(0.2), 9)
    sky(s, 0.4, ['sd-birds'])
    s.row(
      s.rng.shuffle([
        { kinds: ['sd-sandcastle'], h: s.size(0.16) },
        { kinds: ['sd-ball', 'sd-bucket'], h: s.size(0.11) },
        { kinds: ['sd-bucket', 'sun-hat'], h: s.size(0.1), chance: 0.6 },
      ]),
      { x0: s.x(0.08), x1: s.x(0.92), y: shore + s.H * 0.16, depth: 24 },
    )
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
        { kinds: ['deck-chair'], h: s.H * 0.3 },
        { kinds: ['fishing'], h: s.H * 0.34 },
        { kinds: ['sd-tackle', 'picnic-basket', 'lantern'], h: s.size(0.13) },
        { kinds: ['sd-bucket', 'sun-hat', 'coffee-mug'], h: s.size(0.1), chance: 0.8 },
      ]),
      { x0: s.x(dx0), x1: s.x(dx1), y: deck - thick * 0.6, depth: 30 },
    )
    scatter(s, ['fishing-boat', 'sailboat'], 1, { ...open, minY: s.y(0.84), maxY: s.y(0.86) }, s.size(0.26), 26)
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
    s.row(s.rng.shuffle([{ kinds: ['sd-life-ring'], h: s.size(0.19), anchor: 'middle' }, { kinds: ['sd-life-ring', 'lantern'], h: s.size(0.16), anchor: 'middle', chance: 0.4 }]), {
      x0: s.x(0.1),
      x1: s.x(0.9),
      y: rail + (deck - rail) * 0.45,
      depth: 24,
    })
    const placed = row(
      s,
      [
        { kinds: ['deck-chair'], h: s.H * 0.32 },
        { kinds: ['sd-side-table'], h: s.H * 0.24 },
        { kinds: ['deck-chair'], h: s.H * 0.32, chance: 0.7 },
        { kinds: ['suitcase', 'sun-hat', 'binoculars'], h: s.size(0.13), chance: 0.85 },
        { kinds: ['houseplant', 'flower-pot'], h: s.size(0.2), chance: 0.4 },
      ],
      s.y(0.95),
      30,
    )
    sideTableTop(s, placed, ['coffee-mug', 'teacup', 'binoculars', 'vintage-camera', 'sd-vase'])
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
        { kinds: ['sd-pine'], h: s.H * 0.46 },
        { kinds: ['motorhome', 'camper-trailer'], h: s.H * 0.28 },
        { kinds: ['sd-pine', 'sd-tree'], h: s.H * 0.4, chance: 0.85 },
      ],
      ground + s.H * 0.02,
      20,
    )
    sky(s, 0.36, ['sd-birds'])
    row(
      s,
      [
        { kinds: ['tent', 'camping-tent'], h: s.H * 0.28 },
        { kinds: ['sd-campfire'], h: s.size(0.16) },
        { kinds: ['deck-chair'], h: s.H * 0.26 },
        { kinds: ['lantern', 'picnic-basket', 'sd-bucket'], h: s.size(0.13), chance: 0.85 },
        { kinds: ['bicycle', 'sd-signpost'], h: s.H * 0.24, chance: 0.6 },
        { kinds: ['coffee-mug', 'kettle', 'sd-flowers'], h: s.size(0.1), chance: 0.5 },
      ],
      s.y(0.94),
      30,
    )
  },
}

const sightseeing: SdRecipe = {
  id: 'sightseeing',
  name: 'Sightseeing trip',
  group: 'travel',
  build(s) {
    const ground = land(s, 0.46, s.rng.chance(0.5) ? 'mountains' : 'hills')
    s.row(
      s.rng.shuffle([
        { kinds: ['steam-train', 'cottage', 'lighthouse'], h: s.size(0.17) },
        { kinds: ['sd-tree', 'sd-pine', 'cottage'], h: s.size(0.2), chance: 0.7 },
      ]),
      { x0: s.x(0.1), x1: s.x(0.9), y: ground + s.H * 0.02, depth: 16 },
    )
    sky(s, 0.42, ['hot-air-balloon'])
    row(
      s,
      [
        { kinds: ['sd-signpost'], h: s.H * 0.42 },
        { kinds: ['park-bench'], h: s.H * 0.22 },
        { kinds: ['suitcase'], h: s.size(0.16) },
        { kinds: ['vintage-camera', 'binoculars', 'sun-hat'], h: s.size(0.1), chance: 0.85 },
        { kinds: ['sd-tree', 'sd-pine'], h: s.H * 0.36, chance: 0.75 },
        { kinds: ['sd-flowers', 'picnic-basket', 'sd-bush'], h: s.size(0.14), chance: 0.5 },
      ],
      s.y(0.94),
      30,
    )
  },
}

export const SD_RECIPES: readonly SdRecipe[] = [
  livingRoom,
  readingNook,
  teaTime,
  hobbyCorner,
  frontPorch,
  garden,
  patio,
  backyard,
  picnic,
  golf,
  beach,
  fishingDock,
  cruiseDeck,
  campsite,
  sightseeing,
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
