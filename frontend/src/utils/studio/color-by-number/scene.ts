import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import {
  dist,
  distToRing,
  ellipseRing,
  inRegion,
  pt,
  ringBounds,
  smoothLine,
  toRegion,
  type Bounds,
  type Pt,
  type Region,
  type Ring,
} from '../stained-glass/geometry'
import { band, drawingBounds, placeDrawing, rect, type SubjectDrawing } from '../stained-glass/subject-kit'
import { bumpRing, domeDiscs, type Disc } from '../spot-the-difference/element-kit'
import type { SgSubject } from '../stained-glass/subjects'
import { paletteHas, type CbnPalette, type CbnRole } from './palette'

/**
 * The scene round the subject: where it is, and everything else in it.
 *
 * A page is a real little scene, not an object on a blank page: a motorhome
 * parked on a hill under a sun and a couple of clouds with a path running up
 * to it; a sailboat on a choppy sea with an island on the horizon; a rocking
 * chair in a room with a curtained window, a rug and wainscoting. The
 * subject decides the setting (its drawing says whether it lives indoors or
 * out, on grass, water or sand), and the page deals everything else.
 *
 * Every part is a closed shape with a meaning (`CbnRole`), stacked back to
 * front like cut paper: a later shape covers what it overlaps, and only
 * what shows is printed. Every part is sized in inches with a floor, so a
 * space always holds a pencil tip and a readable number on the smallest trim,
 * and a part that cannot get its room (a tree with no space beside the
 * subject, a cloud with no clear sky) is left out rather than squeezed in.
 */

export type CbnSetting = 'meadow' | 'shore' | 'beach' | 'room'
export type CbnFrame = 'rect' | 'rounded' | 'arch'
export type CbnPlace = 'left' | 'center' | 'right'

export const CBN_FRAMES: readonly CbnFrame[] = ['rect', 'rounded', 'arch']
export const CBN_SETTINGS: readonly CbnSetting[] = ['meadow', 'shore', 'beach', 'room']

/**
 * One page's scene. Fields a setting does not use stay at their empty value,
 * so every composition prints as the same fixed list of axes (see
 * `compositionKey`) and two pages can be compared axis by axis.
 */
export interface CbnComposition {
  setting: CbnSetting
  frame: CbnFrame
  place: CbnPlace
  /** Outdoors: a peach glow low in the sky (golden hour). */
  skyBand: boolean
  /** A sun in a top corner, or low on the horizon at golden hour. */
  sun: 'left' | 'right' | 'low' | 'none'
  rays: boolean
  clouds: number
  /** Behind the hills or the sea. */
  far: 'mountains' | 'ridge' | 'island' | 'none'
  snow: boolean
  trees: 'none' | 'left' | 'right' | 'both'
  tree: CbnTree
  path: boolean
  fence: boolean
  /** Patchwork fields across the far hill. */
  fields: boolean
  flowers: number
  /** Wave bands across the sea. */
  waves: number
  /** Rolling dune bands across a beach. */
  dunes: number
  /** Indoors. */
  window: 'none' | 'left' | 'right'
  curtains: boolean
  picture: 'none' | 'left' | 'right'
  wainscot: boolean
  boards: boolean
  rug: 'none' | 'oval' | 'rect'
  table: 'none' | 'plain' | 'cloth'
  /** Outdoors: gulls in flight, drawn as single lines (they take no color). */
  birds: number
  /** A pond in the meadow's foreground. */
  pond: boolean
  /** Boulders in the foreground, or standing out of the sea. */
  rocks: number
  /** A palm tree on the beach. */
  palm: boolean
  /** Indoors: a potted plant on the floor, a floor lamp, a clock on the wall. */
  plant: boolean
  lamp: boolean
  clock: boolean
}

/** A broad round crown, a lobed oak, a fir, a tall poplar, a fruit tree, or a low bush. */
export type CbnTree = 'round' | 'oak' | 'pine' | 'poplar' | 'fruit' | 'bush'
const CBN_TREES: readonly CbnTree[] = ['round', 'oak', 'pine', 'poplar', 'fruit', 'bush']

const EMPTY: Omit<CbnComposition, 'setting' | 'frame' | 'place'> = {
  skyBand: false,
  sun: 'none',
  rays: false,
  clouds: 0,
  far: 'none',
  snow: false,
  trees: 'none',
  tree: 'round',
  path: false,
  fence: false,
  fields: false,
  flowers: 0,
  waves: 0,
  dunes: 0,
  window: 'none',
  curtains: false,
  picture: 'none',
  wainscot: false,
  boards: false,
  rug: 'none',
  table: 'none',
  birds: 0,
  pond: false,
  rocks: 0,
  palm: false,
  plant: false,
  lamp: false,
  clock: false,
}

const AXES = ['setting', 'frame', 'place', ...Object.keys(EMPTY)] as (keyof CbnComposition)[]
/**
 * Axes a key had before birds, ponds, rocks, palms, plants, lamps and clocks
 * were added (always at the end): a page printed then reads back with them absent.
 */
const LEGACY_AXES = 24

/**
 * The composition with every detail of an absent part reset (the kind of
 * tree when there are no trees, curtains with no window), so two scenes that
 * print the same are the same composition, axis for axis.
 */
export function canonicalComposition(c: CbnComposition): CbnComposition {
  const out = { ...c }
  if (out.trees === 'none') out.tree = EMPTY.tree
  if (out.sun === 'none' || out.sun === 'low') out.rays = false
  if (out.far !== 'mountains') out.snow = false
  if (out.window === 'none') out.curtains = false
  return out
}

/** A short, stable name for the composition, one field per axis. */
export const compositionKey = (c: CbnComposition) => AXES.map((axis) => String(c[axis])).join('.')

/** How many axes two compositions differ on. */
export function compositionDistance(a: CbnComposition, b: CbnComposition): number {
  return AXES.filter((axis) => a[axis] !== b[axis]).length
}

export function parseCompositionKey(key: string): CbnComposition | null {
  const parts = key.split('.')
  if (parts.length !== AXES.length && parts.length !== LEGACY_AXES) return null
  const out: Record<string, unknown> = {}
  AXES.forEach((axis, i) => {
    const sample = axis in EMPTY ? EMPTY[axis as keyof typeof EMPTY] : ''
    const raw = parts[i] ?? String(sample)
    out[axis] = typeof sample === 'boolean' ? raw === 'true' : typeof sample === 'number' ? Number(raw) : raw
  })
  const c = out as unknown as CbnComposition
  return isValidComposition(c) ? c : null
}

/* ------------------------------------------------------------------ *
 * Which setting a subject lives in
 * ------------------------------------------------------------------ */

/** Indoor subjects that sit on a table rather than stand on the floor. */
const TABLETOP = new Set([
  'coffee-mug',
  'teacup',
  'teapot',
  'book-and-glasses',
  'vintage-radio',
  'fresh-pie',
  'paint-palette',
  'vintage-camera',
  'gramophone',
])

export const isTabletop = (subject: SgSubject) => TABLETOP.has(subject.id)

/** Subjects that are a plant in a pot themselves: no second one stands beside them. */
const POTTED = new Set(['houseplant', 'flower-pot'])

export function settingFor(subject: SgSubject): CbnSetting {
  if (subject.setting === 'indoor') return 'room'
  if (subject.ground === 'water') return 'shore'
  if (subject.ground === 'sand') return 'beach'
  return 'meadow'
}

/** Subjects that hover (a balloon, a butterfly) rather than stand. */
export const floats = (subject: SgSubject) => subject.setting === 'outdoor' && subject.ground === 'none'

/* ------------------------------------------------------------------ *
 * Dealing a composition
 * ------------------------------------------------------------------ */

/** How full a page is: Relaxed keeps the scene simple, Detailed fills it out. */
export type CbnRichness = 0 | 1 | 2

/** The roles a composition draws, so the dealer can count the key's colors. */
export function compositionRoles(c: CbnComposition, tabletop: boolean): CbnRole[] {
  const roles: CbnRole[] = []
  if (c.setting === 'room') {
    roles.push('wall', 'trim', 'floor')
    if (c.boards) roles.push('floorAlt')
    if (c.wainscot) roles.push('wallLow')
    if (c.window !== 'none') roles.push('sky', 'hillNear')
    if (c.curtains) roles.push('curtain', 'wood')
    if (c.picture !== 'none') roles.push('wood', 'sky', 'hillNear', 'sun')
    if (c.rug !== 'none') roles.push('rug', 'rugBorder')
    if (tabletop) roles.push(c.table === 'cloth' ? 'cloth' : 'wood')
    if (tabletop) roles.push('wood')
    if (c.plant) roles.push('foliage', 'pot')
    if (c.lamp) roles.push('shade', 'wood')
    if (c.clock) roles.push('wood', 'face')
    return [...new Set(roles)]
  }
  roles.push('sky')
  if (c.skyBand) roles.push('skyLow')
  if (c.sun !== 'none') roles.push('sun')
  if (c.clouds > 0) roles.push('cloud')
  if (c.far === 'mountains' || c.far === 'ridge') roles.push('mountain')
  if (c.snow) roles.push('snow')
  if (c.far === 'island') roles.push('hillFar')
  if (c.setting === 'meadow') roles.push('hillFar', 'hillNear')
  if (c.setting !== 'meadow') roles.push('water')
  if (c.setting === 'beach') roles.push('sand')
  if (c.waves > 0) roles.push('waterLight')
  if (c.dunes > 0) roles.push('dune')
  if (c.trees !== 'none') roles.push('foliage')
  if (c.trees !== 'none' && c.tree !== 'bush') roles.push('trunk')
  if (c.trees !== 'none' && c.tree === 'fruit') roles.push('fruit')
  if (c.palm) roles.push('foliage', 'trunk')
  if (c.rocks > 0) roles.push('rock')
  if (c.pond) roles.push('water', 'waterLight')
  if (c.path) roles.push('path')
  if (c.fence) roles.push('fence')
  if (c.fields) roles.push('field')
  if (c.flowers > 0) roles.push('petal', 'flowerCenter')
  return [...new Set(roles)]
}

/**
 * About how many colors the scene alone puts on the key: roles share a color
 * where the palette lets them (a flower's centre can be the sun's yellow), so
 * each role, fewest choices first, reuses a color already taken if it can.
 */
export function sceneColorCount(c: CbnComposition, palette: CbnPalette, tabletop: boolean): number {
  const roles = compositionRoles(c, tabletop).sort((a, b) => (palette.roles[a]?.length ?? 0) - (palette.roles[b]?.length ?? 0))
  const taken = new Set<string>()
  for (const role of roles) {
    const choices = palette.roles[role] ?? []
    taken.add(choices.find((color) => taken.has(color)) ?? choices[0] ?? role)
  }
  return taken.size
}

const pickWeighted = <T,>(rng: StudioRng, options: readonly (readonly [T, number])[]): T => {
  const total = options.reduce((s, [, w]) => s + w, 0)
  let roll = rng.next() * total
  for (const [value, weight] of options) {
    roll -= weight
    if (roll < 0) return value
  }
  return options[options.length - 1]![0]
}

/**
 * Deal a composition for the subject under this palette.
 *
 * `budget` caps how many colors the scene alone may put on the key, so the
 * subject still has room for its own and the key lands at six to eight:
 * optional parts are dropped, least essential first (flowers, then the
 * fence, the path, the trees, what lies on the horizon, the clouds), until
 * the scene fits. `avoid` holds compositions to steer clear of (the page
 * before, this subject's earlier pages): the deal is tried a few times and
 * the one farthest from all of them wins.
 */
export function dealComposition(options: {
  subject: SgSubject
  palette: CbnPalette
  rng: StudioRng
  richness: CbnRichness
  budget: number
  /** Panel height over width. */
  aspect: number
  /** The panel's shorter side, inches: a big scene holds more clouds and flowers. */
  span?: number
  avoid?: readonly CbnComposition[]
}): CbnComposition {
  const { subject, palette, rng, richness, budget, aspect, span = 5, avoid = [] } = options
  const tries = avoid.length > 0 ? 8 : 1
  let best: CbnComposition | null = null
  let bestScore = -1
  for (let i = 0; i < tries; i++) {
    const c = dealOnce(subject, palette, rng, richness, budget, aspect, span >= 6.5)
    const score = avoid.length === 0 ? 0 : Math.min(...avoid.map((a) => compositionDistance(a, c)))
    if (score > bestScore) (best = c), (bestScore = score)
  }
  return best!
}

/**
 * Drop optional parts until the scene's colors fit the budget: the least
 * essential part first among those whose removal actually saves a color, so
 * a fence that shares the trees' brown survives while the trees' green goes.
 */
function trimToBudget(c: CbnComposition, drops: readonly ((c: CbnComposition) => void)[], palette: CbnPalette, tabletop: boolean, budget: number) {
  for (let guard = 0; guard < drops.length && sceneColorCount(c, palette, tabletop) > budget; guard++) {
    const now = sceneColorCount(c, palette, tabletop)
    const saving = drops.find((drop) => {
      const trial = { ...c }
      drop(trial)
      return sceneColorCount(trial, palette, tabletop) < now
    })
    ;(saving ?? drops[guard]!)(c)
  }
}

function dealOnce(subject: SgSubject, palette: CbnPalette, rng: StudioRng, richness: CbnRichness, budget: number, aspect: number, big: boolean): CbnComposition {
  const setting = settingFor(subject)
  const tabletop = isTabletop(subject)
  const frame = rng.pick(CBN_FRAMES.filter((f) => f !== 'arch' || aspect >= 0.95))
  const place: CbnPlace = pickWeighted(rng, [
    ['center', 2],
    ['left', 1],
    ['right', 1],
  ])
  const c: CbnComposition = { setting, frame, place, ...EMPTY }

  if (setting === 'room') {
    const other = place === 'left' ? 'right' : place === 'right' ? 'left' : rng.pick(['left', 'right'] as const)
    c.window = rng.chance(richness === 0 ? 0.65 : 0.8) ? other : 'none'
    // A window needs its wall: the subject stands on the other side of the room.
    if (c.window !== 'none') c.place = c.window === 'left' ? 'right' : 'left'
    c.curtains = c.window !== 'none' && paletteHas(palette, 'curtain') && rng.chance(richness === 0 ? 0.3 : 0.6)
    const pictureSide = c.window === 'none' ? other : c.window === 'left' ? 'right' : 'left'
    // A bare wall reads as an unfinished page: a room without a window always has a picture.
    c.picture = c.window === 'none' || (richness > 0 && rng.chance(richness === 1 ? 0.45 : 0.7)) ? pictureSide : 'none'
    c.wainscot = rng.chance(richness === 0 ? 0.2 : richness === 1 ? 0.45 : 0.75)
    c.boards = richness > 0 && rng.chance(0.6)
    c.rug = rng.chance(richness === 0 ? 0.35 : 0.7) ? rng.pick(['oval', 'rect'] as const) : 'none'
    c.table = tabletop ? (paletteHas(palette, 'cloth') && rng.chance(0.5) ? 'cloth' : 'plain') : 'none'
    c.plant = !POTTED.has(subject.id) && rng.chance(richness === 0 ? 0.3 : 0.5)
    c.lamp = rng.chance(richness === 0 ? 0.15 : 0.35)
    c.clock = rng.chance(richness === 0 ? 0.2 : 0.4)
    const drops: ((c: CbnComposition) => void)[] = [
      (c) => (c.clock = false),
      (c) => (c.lamp = false),
      (c) => (c.boards = false),
      (c) => (c.curtains = false),
      (c) => (c.picture = c.window === 'none' ? c.picture : 'none'),
      (c) => (c.table = c.table === 'cloth' ? 'plain' : c.table),
      (c) => (c.plant = false),
      (c) => (c.rug = 'none'),
      (c) => (c.wainscot = false),
    ]
    trimToBudget(c, drops, palette, tabletop, budget)
    return canonicalComposition(c)
  }

  // A palm needs a side of the beach to itself: the subject stands to the other.
  c.palm = setting === 'beach' && rng.chance(richness === 0 ? 0.45 : 0.65)
  if (c.palm && place === 'center') c.place = rng.pick(['left', 'right'] as const)
  const sunny = rng.chance(0.85)
  const low = palette.lowSun && setting !== 'meadow' ? rng.chance(0.5) : palette.lowSun === true && rng.chance(0.3)
  c.sun = !sunny ? 'none' : low ? 'low' : c.place === 'left' ? 'right' : c.place === 'right' ? 'left' : rng.pick(['left', 'right'] as const)
  c.rays = c.sun !== 'none' && c.sun !== 'low' && rng.chance(richness === 0 ? 0.35 : 0.55)
  c.skyBand = paletteHas(palette, 'skyLow') && rng.chance(0.85)
  c.clouds = rng.int(1, (richness === 0 ? 2 : 3) + (big ? 1 : 0))
  if (c.clouds === 0 && c.sun === 'none') c.clouds = 1
  c.birds = rng.chance(richness === 0 ? 0.4 : 0.6) ? rng.int(2, 3) : 0

  if (setting === 'meadow') {
    c.far = pickWeighted(rng, [
      ['mountains', richness === 0 ? 1 : 2],
      ['ridge', 1.5],
      ['none', 1],
    ])
    c.snow = c.far === 'mountains' && richness > 0 && paletteHas(palette, 'snow') && rng.chance(0.6)
    // A setting sun sits on the horizon; mountains would cut it into slivers.
    if (c.sun === 'low' && c.far === 'mountains') (c.far = 'ridge'), (c.snow = false)
    const side = c.place === 'left' ? 'right' : c.place === 'right' ? 'left' : rng.pick(['left', 'right'] as const)
    c.trees = rng.chance(richness === 0 ? 0.55 : 0.8) ? (place === 'center' && richness > 0 && rng.chance(0.5) ? 'both' : side) : 'none'
    c.tree = pickWeighted<CbnTree>(rng, [
      ['round', 2],
      ['oak', 1.5],
      ['pine', 1.5],
      ['poplar', 1],
      ['fruit', richness === 0 ? 0 : 1.2],
      ['bush', 1],
    ])
    c.path = !floats(subject) && rng.chance(richness === 0 ? 0.3 : 0.5)
    c.fence = richness > 0 && !floats(subject) && rng.chance(richness === 1 ? 0.3 : 0.5)
    c.fields = paletteHas(palette, 'field') && richness > 0 && rng.chance(richness === 1 ? 0.35 : 0.7)
    const most = (richness === 1 ? 4 : 6) + (big ? 2 : 0)
    c.flowers = richness === 0 ? 0 : rng.chance(richness === 1 ? 0.7 : 0.85) ? rng.int(richness === 1 ? 2 : 3, most) : 0
    c.pond = richness > 0 && rng.chance(richness === 1 ? 0.25 : 0.4)
    c.rocks = rng.chance(richness === 0 ? 0.15 : 0.3) ? rng.int(1, 2) : 0
  } else {
    c.far = pickWeighted(rng, [
      ['island', 2],
      ['mountains', richness === 0 ? 0.5 : 1],
      ['none', 1],
    ])
    c.snow = c.far === 'mountains' && richness > 1 && paletteHas(palette, 'snow') && rng.chance(0.5)
    if (c.sun === 'low' && c.far === 'mountains') (c.far = 'island'), (c.snow = false)
    c.waves = setting === 'shore' ? rng.int(1, richness === 0 ? 1 : 2) : rng.chance(richness === 0 ? 0.3 : 0.6) ? 1 : 0
    c.dunes = setting === 'beach' && paletteHas(palette, 'dune') ? rng.int(richness === 0 ? 0 : 1, richness === 2 ? 2 : 1) : 0
    c.rocks = rng.chance(richness === 0 ? 0.3 : 0.45) ? rng.int(1, richness === 2 ? 3 : 2) : 0
  }

  const drops: ((c: CbnComposition) => void)[] = [
    (c) => (c.snow = false),
    (c) => (c.rocks = 0),
    (c) => (c.tree = c.tree === 'fruit' ? 'round' : c.tree),
    (c) => (c.skyBand = false),
    (c) => (c.pond = false),
    (c) => (c.fence = false),
    (c) => (c.path = false),
    (c) => (c.flowers = 0),
    (c) => (c.fields = false),
    (c) => (c.palm = false),
    (c) => (c.trees = 'none'),
    (c) => (c.waves = c.setting === 'shore' ? 1 : 0),
    (c) => (c.dunes = 0),
    (c) => ((c.far = 'none'), (c.snow = false)),
    (c) => (c.clouds = c.sun === 'none' ? 1 : 0),
  ]
  trimToBudget(c, drops, palette, tabletop, budget)
  return canonicalComposition(c)
}

/** A composition the scene builder can draw: known values, and parts only where their setting has them. */
export function isValidComposition(c: CbnComposition): boolean {
  if (!CBN_SETTINGS.includes(c.setting) || !CBN_FRAMES.includes(c.frame)) return false
  if (!['left', 'center', 'right'].includes(c.place)) return false
  if (!['left', 'right', 'low', 'none'].includes(c.sun)) return false
  if (!['mountains', 'ridge', 'island', 'none'].includes(c.far)) return false
  if (!['none', 'left', 'right', 'both'].includes(c.trees) || !CBN_TREES.includes(c.tree)) return false
  if (!['none', 'left', 'right'].includes(c.window) || !['none', 'left', 'right'].includes(c.picture)) return false
  if (c.window !== 'none' && c.window === c.place) return false
  if (!['none', 'oval', 'rect'].includes(c.rug) || !['none', 'plain', 'cloth'].includes(c.table)) return false
  if (!Number.isInteger(c.clouds) || c.clouds < 0 || c.clouds > 4) return false
  if (!Number.isInteger(c.flowers) || c.flowers < 0 || c.flowers > 8) return false
  if (!Number.isInteger(c.waves) || c.waves < 0 || c.waves > 2) return false
  if (!Number.isInteger(c.dunes) || c.dunes < 0 || c.dunes > 2 || (c.dunes > 0 && c.setting !== 'beach')) return false
  if (!Number.isInteger(c.birds) || c.birds < 0 || c.birds > 3) return false
  if (!Number.isInteger(c.rocks) || c.rocks < 0 || c.rocks > 3) return false
  if (c.palm && c.setting !== 'beach') return false
  if (c.pond && c.setting !== 'meadow') return false
  if (c.rays && (c.sun === 'none' || c.sun === 'low')) return false
  if (c.sun === 'low' && c.far === 'mountains') return false
  if (c.snow && c.far !== 'mountains') return false
  if (c.setting === 'room') {
    return c.sun === 'none' && c.clouds === 0 && c.far === 'none' && c.trees === 'none' && !c.path && !c.fence && !c.fields && c.flowers === 0 && c.waves === 0 && !c.skyBand && c.birds === 0 && c.rocks === 0
  }
  if (c.window !== 'none' || c.curtains || c.picture !== 'none' || c.wainscot || c.boards || c.rug !== 'none' || c.table !== 'none') return false
  if (c.plant || c.lamp || c.clock) return false
  if (c.setting !== 'meadow' && (c.trees !== 'none' || c.path || c.fence || c.fields || c.flowers > 0 || c.far === 'ridge')) return false
  if (c.setting === 'meadow' && (c.waves > 0 || c.far === 'island')) return false
  return true
}

/* ------------------------------------------------------------------ *
 * Building the scene
 * ------------------------------------------------------------------ */

export interface CbnLayer {
  ring: Ring
  /** What takes one color: a role, or one subject piece (`s<index>`). */
  unit: string
  role?: CbnRole
  subject: boolean
  /**
   * A long scenery line (a hill top, a wave, a floorboard). Where a stretch
   * of it pinches a sliver against something else, that stretch may be
   * taken out — the scenery then simply runs behind, as it reads anyway.
   */
  removable?: boolean
}

export interface CbnScene {
  /** The frame's outline; the scene inside it is what gets colored. */
  frame: Ring
  panel: Region
  /** Back to front. The first layer is the whole panel (sky or wall). */
  layers: CbnLayer[]
  /**
   * The composition as drawn: a part that found no room is left out here
   * too (a sun with no clear corner, a window with no free wall), and a
   * fallback the room added is in, so the page's label says what it prints.
   */
  drawn: CbnComposition
  strokes: { pts: Pt[]; layer: number }[]
  subject: Bounds
}

export type CbnSceneResult = ({ ok: true } & CbnScene) | { ok: false; reason: string }

const inch = (n: number) => n * DPI

/** Clear paper kept between a part and the frame, and between two parts that must not touch. */
const FRAME_CLEAR = inch(0.2)
const PART_GAP = inch(0.24)
/** Narrowest a band-shaped part (a trunk, a rail, a baseboard) may be. */
const BAND_MIN = inch(0.26)
/** Narrowest window worth drawing: its panes must still hold numbers. */
const MIN_WINDOW = inch(0.95)
/** The subject never prints smaller than this share of the panel, nor this many inches. */
export const CBN_MIN_SUBJECT_SHARE = 0.38
export const CBN_MIN_SUBJECT_INCHES = 1.9

export function frameRing(kind: CbnFrame, b: Bounds): Ring {
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  if (kind === 'rect') return rect(b.minX, b.minY, w, h)
  if (kind === 'rounded') return rect(b.minX, b.minY, w, h, Math.min(w, h) * 0.07)
  const rise = Math.min(w * 0.28, h * 0.17)
  const arc = ellipseRing(b.minX + w / 2, b.minY + rise, w / 2, rise, 96).filter((p) => p.y <= b.minY + rise + 1e-6)
  // ellipseRing starts at 3 o'clock and runs clockwise; keep the upper half, left to right.
  const upper = arc.filter((p) => p.y < b.minY + rise - 1e-6).sort((p, q) => p.x - q.x)
  return [pt(b.minX, b.maxY), pt(b.minX, b.minY + rise), ...upper, pt(b.maxX, b.minY + rise), pt(b.maxX, b.maxY)]
}

/** A band from `y` down past the bottom, its top edge a gentle wave. */
function waveRing(b: Bounds, y: number, amp: number, wavelength: number, phase: number): Ring {
  const pad = 40
  const n = Math.max(32, Math.ceil((b.maxX - b.minX + pad * 2) / 6))
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const x = b.minX - pad + ((b.maxX - b.minX + pad * 2) * i) / n
    out.push(pt(x, y + amp * Math.sin((2 * Math.PI * x) / wavelength + phase)))
  }
  out.push(pt(b.maxX + pad, b.maxY + pad), pt(b.minX - pad, b.maxY + pad))
  return out
}

const waveAt = (y: number, amp: number, wavelength: number, phase: number) => (x: number) => y + amp * Math.sin((2 * Math.PI * x) / wavelength + phase)

/** The part of `ring` inside an axis-aligned box (Sutherland-Hodgman). */
function clipToBox(ring: readonly Pt[], b: Bounds): Ring {
  const edges: ((p: Pt) => number)[] = [(p) => p.x - b.minX, (p) => b.maxX - p.x, (p) => p.y - b.minY, (p) => b.maxY - p.y]
  let out: Pt[] = [...ring]
  for (const side of edges) {
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const p = input[i]!
      const q = input[(i + 1) % input.length]!
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) out.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        out.push(pt(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t))
      }
    }
    if (out.length === 0) break
  }
  return out
}

const boxRing = (b: Bounds, r = 0): Ring => rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, r)
const grow = (b: Bounds, by: number): Bounds => ({ minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by })
const overlaps = (a: Bounds, b: Bounds) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

/* ------------------------------------------------------------------ *
 * Shapes
 *
 * Every outline is a true curve: scalloped edges (clouds, crowns, bushes,
 * flowers) are traced along the outer arcs of overlapping discs, so bumps are
 * round and dips are crisp, the way they are drawn by hand; slopes, leaves
 * and paths are smooth curves. Nothing is a polygon with a kink in it.
 * ------------------------------------------------------------------ */

/** A quadratic curve from `a` to `b` pulled toward `c`, both ends included. */
function quad(a: Pt, c: Pt, b: Pt, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const u = 1 - t
    return pt(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y)
  })
}

/**
 * Discs drawn on a 0–100 grid, set `w` wide centred on `cx` with the grid's
 * `gridY` at `y` (and mirrored, read right to left, when asked).
 */
function fitDiscs(grid: readonly Disc[], cx: number, y: number, w: number, gridY: number, mirror = false): Disc[] {
  const minX = Math.min(...grid.map((d) => d[0] - d[2]))
  const maxX = Math.max(...grid.map((d) => d[0] + d[2]))
  const k = w / (maxX - minX)
  const mid = (minX + maxX) / 2
  const out = grid.map(([x, gy, r]) => [cx + (mirror ? mid - x : x - mid) * k, y + (gy - gridY) * k, r * k] as const)
  return mirror ? out.reverse() : out
}

/**
 * Clouds, left to right on a flat base at y = 45: the end puffs just touch
 * the base, so each end rounds smoothly into it. A small heap, broad three-
 * to five-puff cumulus, a long low bank, a tall billow.
 */
const CLOUD_SHAPES: readonly (readonly Disc[])[] = [
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
  [
    [10, 38, 7],
    [24, 32, 10],
    [42, 29, 12],
    [60, 30, 11],
    [77, 33, 9],
    [90, 38, 7],
  ],
  [
    [18, 35, 10],
    [38, 22, 17],
    [62, 17, 19],
    [84, 33, 12],
  ],
]

/** A puffy cloud `w` wide sitting on `y`: round puffs over a flat base, one clean outline. */
function cloudRing(cx: number, y: number, w: number, rng: StudioRng): Ring {
  const grid = CLOUD_SHAPES[rng.int(0, CLOUD_SHAPES.length - 1)]!
  return bumpRing(fitDiscs(grid, cx, y, w, 45, rng.chance(0.5)), y)
}

/**
 * A flower head: five or six round petals round a centre (drawn on top), so
 * the petals read as one ring to color and the centre as another.
 */
function flowerRing(cx: number, cy: number, r: number, turn: number, petals: 5 | 6): Ring {
  const d = r * (petals === 5 ? 0.58 : 0.6)
  return bumpRing(
    Array.from({ length: petals }, (_, i) => {
      const a = (turn * Math.PI) / 180 - Math.PI / 2 + (i * Math.PI * 2) / petals
      return [cx + d * Math.cos(a), cy + d * Math.sin(a), r - d] as const
    }),
  )
}

/** A sun ray at `deg`: a round end `from` the centre, tapering to a point at `to`. */
function rayRing(cx: number, cy: number, deg: number, from: number, to: number, rw: number): Ring {
  const a = (deg * Math.PI) / 180
  const len = to - from - rw
  const t = Math.acos(rw / len)
  const local: Pt[] = [pt(len, 0)]
  const n = 18
  for (let i = 0; i <= n; i++) {
    const u = t + ((Math.PI * 2 - 2 * t) * i) / n
    local.push(pt(rw * Math.cos(u), rw * Math.sin(u)))
  }
  const bx = cx + (from + rw) * Math.cos(a)
  const by = cy + (from + rw) * Math.sin(a)
  return local.map((p) => pt(bx + p.x * Math.cos(a) - p.y * Math.sin(a), by + p.x * Math.sin(a) + p.y * Math.cos(a)))
}

/**
 * A crown of pointed leaves round `c` (a palm's fronds, a houseplant): one
 * outline, each leaf curving out from a valley near the centre to its tip
 * and back to the next valley, so leaves never pinch slivers between them.
 * Tips run clockwise (degrees from 3 o'clock, y down); `len`, `droop`,
 * `inner` and `bulge` are shares of `r`.
 */
function frondRing(c: Pt, r: number, tips: readonly (readonly [deg: number, len: number, droop: number])[], inner: number, bulge: number): Ring {
  const at = (deg: number, rr: number) => pt(c.x + rr * Math.cos((deg * Math.PI) / 180), c.y + rr * Math.sin((deg * Math.PI) / 180))
  const gap = (a: number, b: number) => (b - a + 360) % 360 || 360
  const out: Pt[] = []
  tips.forEach(([deg, len, droop], i) => {
    const prev = tips[(i - 1 + tips.length) % tips.length]![0]
    const next = tips[(i + 1) % tips.length]![0]
    const v0 = at(deg - gap(prev, deg) / 2, r * inner)
    const v1 = at(deg + gap(deg, next) / 2, r * inner)
    const reach = at(deg, r * len)
    const tip = pt(reach.x, reach.y + r * droop)
    const ax = tip.x - c.x
    const ay = tip.y - c.y
    const al = Math.hypot(ax, ay) || 1
    // Each edge bows away from the leaf's midrib.
    const control = (v: Pt) => {
      const m = pt((v.x + tip.x) / 2, (v.y + tip.y) / 2)
      const along = ((m.x - c.x) * ax + (m.y - c.y) * ay) / al
      const px = m.x - (c.x + (ax / al) * along)
      const py = m.y - (c.y + (ay / al) * along)
      const pl = Math.hypot(px, py) || 1
      return pt(m.x + (px / pl) * r * bulge, m.y + (py / pl) * r * bulge)
    }
    out.push(...quad(v0, control(v0), tip, 10).slice(1), ...quad(tip, control(v1), v1, 10).slice(1))
  })
  return out
}

/** The top half of an ellipse standing on `foot` (a lamp's base, a mound). */
function arcRing(cx: number, foot: number, rx: number, ry: number): Ring {
  return Array.from({ length: 25 }, (_, i) => {
    const t = Math.PI + (Math.PI * i) / 24
    return pt(cx + rx * Math.cos(t), foot + ry * Math.sin(t))
  })
}

/** A trunk flaring into roots at `foot`; its top (at `top`) is hidden in the crown. */
function trunkRing(cx: number, top: number, foot: number, width: number): Ring {
  const half = width / 2
  const tall = foot - top
  const side = (dir: number) =>
    smoothLine([pt(cx + dir * half * 1.75, foot), pt(cx + dir * half * 1.15, foot - tall * 0.1), pt(cx + dir * half, foot - tall * 0.35), pt(cx + dir * half, top)], 6)
  return [...side(-1), ...side(1).reverse()]
}

/**
 * A boulder standing on `foot`: an uneven, lumpy top over a flat base, and a
 * facet line running in from its top edge (a line, never a closed space).
 */
function rockShape(cx: number, foot: number, w: number, h: number, rng: StudioRng): { ring: Ring; facet: Pt[] } {
  const j = () => (rng.next() - 0.5) * 0.12
  const ring = smoothLine(
    [
      pt(cx - w / 2, foot),
      pt(cx - w * (0.5 + j() * 0.3), foot - h * (0.4 + j())),
      pt(cx - w * (0.36 + j()), foot - h * (0.82 + j())),
      pt(cx - w * (0.12 + j()), foot - h),
      pt(cx + w * (0.1 + j()), foot - h * (0.9 + j())),
      pt(cx + w * (0.32 + j()), foot - h * (0.78 + j())),
      pt(cx + w * (0.47 + j() * 0.3), foot - h * (0.42 + j())),
      pt(cx + w / 2, foot),
    ],
    6,
  )
  const from = ring[Math.round(ring.length * (rng.chance(0.5) ? 0.42 : 0.58))]!
  const facet = smoothLine([from, pt(from.x + (cx - from.x) * 0.25 + w * 0.04, from.y + h * 0.3), pt(from.x + (cx - from.x) * 0.2 + w * 0.12, from.y + h * 0.5)], 5)
  return { ring, facet }
}

/** A gull in flight: two arched wings meeting at the body, one line. */
function gullLine(x: number, y: number, size: number, deep: boolean): Pt[] {
  const lift = deep ? 0.5 : 0.3
  const wing = (dir: number) => smoothLine([pt(x + dir * size, y - size * 0.05), pt(x + dir * size * 0.5, y - size * lift), pt(x + dir * size * 0.12, y - size * 0.12), pt(x, y)], 6)
  return [...wing(-1), ...wing(1).reverse().slice(1)]
}

/**
 * A path from `points[0]` (off the bottom of the panel) up to its rounded
 * end at the last point: `w0` wide at the bottom narrowing to `w1`, in
 * perspective. Its edges are offset sideways from a smooth centre line, so
 * they never cross or kink.
 */
function pathShape(points: readonly Pt[], w0: number, w1: number): Ring {
  const line = smoothLine(points, 10)
  const yb = line[0]!.y
  const end = line[line.length - 1]!
  const half = (y: number) => w1 / 2 + ((w0 - w1) / 2) * Math.max(0, Math.min(1, (y - end.y) / (yb - end.y)))
  const left = line.map((p) => pt(p.x - half(p.y), p.y))
  const right = line.map((p) => pt(p.x + half(p.y), p.y))
  const rx = w1 / 2
  const cap = Array.from({ length: 13 }, (_, i) => {
    const t = Math.PI + (Math.PI * i) / 12
    return pt(end.x + rx * Math.cos(t), end.y + rx * 0.55 * Math.sin(t))
  })
  return [...left, ...cap.slice(1, -1), ...right.reverse()]
}

interface Builder {
  layers: CbnLayer[]
  /** Lines with no space of their own (a gull, a stem, a clock's hands), each over the layers before it. */
  strokes: { pts: Pt[]; layer: number }[]
  add(ring: Ring, role: CbnRole, removable?: boolean): void
  stroke(pts: Pt[]): void
}

function builder(): Builder {
  const layers: CbnLayer[] = []
  const strokes: { pts: Pt[]; layer: number }[] = []
  return {
    layers,
    strokes,
    add(ring, role, removable = false) {
      layers.push({ ring, unit: role, role, subject: false, ...(removable ? { removable: true } : {}) })
    },
    stroke(pts) {
      strokes.push({ pts, layer: layers.length - 1 })
    },
  }
}

interface Placed {
  drawing: SubjectDrawing
  bounds: Bounds
}

/**
 * Put the subject on its stage: its usual share of the panel (times `fill`),
 * clear of the frame, standing on `stage.maxY` or centred when it floats.
 */
function placeSubject(options: {
  drawing: SubjectDrawing
  stage: Bounds
  panel: Region
  place: CbnPlace
  stands: boolean
  fill: number
  /** Largest the subject may print, as shares of the panel's width and height (before `fill`). */
  max: { w: number; h: number }
  /** Smallest scale at which every space of the drawing holds a number (see `cbnDrawingScaleFloor`). */
  minScale: number
  /** How far off centre a left or right placement sits, as a share of the panel's width. */
  offset?: number
}): Placed | null {
  const { drawing, stage, panel, place, stands, fill, max, minScale, offset = 0.12 } = options
  const pb = panel.bounds
  const W = pb.maxX - pb.minX
  const H = pb.maxY - pb.minY
  const raw = drawingBounds(drawing)
  const sw = raw.maxX - raw.minX
  const sh = raw.maxY - raw.minY
  const smallest = Math.max(minScale, CBN_MIN_SUBJECT_SHARE / Math.max(sw / W, sh / H), (CBN_MIN_SUBJECT_INCHES * DPI) / Math.max(sw, sh))
  // The subject is the picture, but the scene round it is what makes it a
  // scene: it never grows past its share, so the sun, the trees and the
  // window keep their room.
  const cap = Math.min((W * max.w) / sw, (H * max.h) / sh)
  let k = Math.max(smallest, Math.min((stage.maxX - stage.minX) / sw, (stage.maxY - stage.minY) / sh, cap) * fill)
  for (let tries = 0; tries < 16 && k >= smallest; tries++, k *= 0.94) {
    const w = sw * k
    const h = sh * k
    const anchor = place === 'left' ? 0.5 - offset : place === 'right' ? 0.5 + offset : 0.5
    const cx = Math.min(stage.maxX - w / 2, Math.max(stage.minX + w / 2, pb.minX + W * anchor))
    const x = cx - w / 2
    const y = stands ? stage.maxY - h : (stage.minY + stage.maxY) / 2 - h / 2
    const candidate = placeDrawing(drawing, k, x, y)
    const fits = candidate.pieces.every((piece) => piece.ring.every((p) => inRegion(p, panel) && distToRing(p, panel.ring) >= FRAME_CLEAR))
    if (fits) return { drawing: candidate, bounds: drawingBounds(candidate) }
  }
  return null
}

/** True when every point of the ring sits inside the panel, clear of the frame. */
const clearOfFrame = (ring: readonly Pt[], panel: Region, by = FRAME_CLEAR) =>
  ring.every((p) => inRegion(p, panel) && distToRing(p, panel.ring) >= by)

const range = (rng: StudioRng, a: number, b: number) => a + rng.next() * (b - a)

/**
 * Build the scene for a composition in `box` (canvas px): frame, parts and
 * subject, back to front. Fails only when the subject cannot be placed at a
 * size worth printing; optional parts that do not fit are left out.
 */
export function buildScene(options: {
  box: Bounds
  composition: CbnComposition
  drawing: SubjectDrawing
  subject: SgSubject
  rng: StudioRng
  /** Scales the subject's usual share of the panel (1 = as usual). */
  fill: number
  frameInk: number
  /** Smallest scale the drawing may print at (its spaces must hold numbers). */
  minScale?: number
}): CbnSceneResult {
  const { box, composition: c, drawing, subject, rng, fill, frameInk, minScale = 0 } = options
  const inset = frameInk / 2 + 1
  const fb = { minX: box.minX + inset, minY: box.minY + inset, maxX: box.maxX - inset, maxY: box.maxY - inset }
  if (fb.maxX - fb.minX < inch(2) || fb.maxY - fb.minY < inch(2)) return { ok: false, reason: 'The page has no room for the scene.' }
  const frame = frameRing(c.frame, fb)
  const panel = toRegion(frame)
  const b = builder()
  b.add(boxRing(grow(fb, 40)), c.setting === 'room' ? 'wall' : 'sky')
  const drawn: CbnComposition = { ...c }
  const built = c.setting === 'room' ? buildRoom(c, drawn, b, panel, drawing, subject, rng, fill, minScale) : buildOutdoors(c, drawn, b, panel, drawing, subject, rng, fill, minScale)
  if (!built) return { ok: false, reason: `“${subject.name}” does not fit this scene at a size worth coloring.` }
  const subjectStart = b.layers.length
  built.drawing.pieces.forEach((piece, i) => b.layers.push({ ring: piece.ring, unit: `s${i}`, subject: true }))
  const strokes = [...b.strokes, ...built.drawing.strokes.map((s) => ({ pts: s.pts, layer: subjectStart + s.under - 1 }))]
  return { ok: true, frame, panel, layers: b.layers, strokes, subject: built.bounds, drawn: canonicalComposition(drawn) }
}

/* ------------------------------------------------------------------ *
 * Outdoors: meadow, shore, beach
 * ------------------------------------------------------------------ */

function buildOutdoors(c: CbnComposition, d: CbnComposition, b: Builder, panel: Region, drawing: SubjectDrawing, subject: SgSubject, rng: StudioRng, fill: number, minScale: number): Placed | null {
  const pb = panel.bounds
  const W = pb.maxX - pb.minX
  const H = pb.maxY - pb.minY
  const phase = () => rng.next() * Math.PI * 2
  const hovering = floats(subject)

  // Where the land or the sea begins, and where the subject stands.
  let horizon: number
  let base: number
  if (c.setting === 'meadow') {
    horizon = pb.minY + H * range(rng, 0.44, 0.52)
    base = horizon + H * range(rng, 0.27, 0.34)
  } else if (c.setting === 'shore') {
    horizon = pb.minY + H * range(rng, 0.44, 0.52)
    base = horizon + (pb.maxY - horizon) * range(rng, 0.5, 0.62)
  } else {
    horizon = pb.minY + H * range(rng, 0.36, 0.42)
    base = horizon + H * range(rng, 0.32, 0.4)
  }
  // A tall subject needs its height above the ground: it stands further forward.
  const raw = drawingBounds(drawing)
  const needH = (raw.maxY - raw.minY) * minScale + inch(0.05)
  const stageTop = pb.minY + H * (c.sun !== 'none' && c.sun !== 'low' ? 0.12 : 0.09)
  base = Math.min(Math.max(base, stageTop + needH), pb.maxY - Math.max(FRAME_CLEAR + inch(0.08), H * 0.04))

  const stage = hovering
    ? { minX: pb.minX + W * 0.1, maxX: pb.maxX - W * 0.1, minY: stageTop, maxY: base - H * 0.04 }
    : { minX: pb.minX + W * 0.07, maxX: pb.maxX - W * 0.07, minY: stageTop, maxY: base }
  const placed = placeSubject({ drawing, stage, panel, place: c.place, stands: !hovering, fill, minScale, max: hovering ? { w: 0.46, h: 0.44 } : { w: 0.6, h: 0.5 } })
  if (!placed) return null
  const sb = placed.bounds
  const keepOut: Bounds[] = [grow(sb, PART_GAP)]

  // The sky's low glow, behind everything on the ground.
  if (c.skyBand) {
    const y = Math.min(horizon - H * range(rng, 0.1, 0.14), horizon - inch(0.55))
    b.add(waveRing(pb, y, H * 0.012, W * range(rng, 1.2, 1.8), phase()), 'skyLow', true)
  }

  // The sun: in a top corner, or setting on the horizon.
  let sunBox: Bounds | null = null
  if (c.sun === 'low') {
    const r = Math.max(inch(0.45), Math.min(W, H) * 0.11)
    const cx = c.place === 'left' ? pb.maxX - W * 0.27 : c.place === 'right' ? pb.minX + W * 0.27 : rng.chance(0.5) ? pb.minX + W * 0.25 : pb.maxX - W * 0.25
    const disc = ellipseRing(cx, horizon - r * 0.25, r, r, 64)
    if (clearOfFrame(disc.filter((p) => p.y < horizon), panel)) {
      b.add(disc, 'sun')
      sunBox = ringBounds(disc)
    } else d.sun = 'none'
  } else if (c.sun !== 'none') {
    // Tucked into its top corner, clear of the frame. If the subject is in
    // the way, the sun loses its rays, then shrinks, before it is left out.
    const full = Math.max(inch(0.3), Math.min(W, H) * 0.075)
    const tries: [boolean, number][] = [[c.rays, full], [false, full], [false, inch(0.3)]]
    const mid = pt((pb.minX + pb.maxX) / 2, (pb.minY + pb.maxY) / 2)
    d.sun = 'none'
    d.rays = false
    for (const [rays, r] of tries) {
      const reach = rays ? r + inch(0.47) : r
      let cx = c.sun === 'left' ? pb.minX + reach + FRAME_CLEAR + 4 : pb.maxX - reach - FRAME_CLEAR - 4
      let cy = pb.minY + reach + FRAME_CLEAR + 4
      // A rounded or arched top cuts the corner off: slide in until clear.
      for (let i = 0; i < 80 && (!inRegion(pt(cx, cy), panel) || distToRing(pt(cx, cy), panel.ring) < reach + FRAME_CLEAR); i++) {
        const d = dist(pt(cx, cy), mid) || 1
        cx += ((mid.x - cx) / d) * 3
        cy += ((mid.y - cy) / d) * 3
      }
      const box: Bounds = { minX: cx - reach, maxX: cx + reach, minY: cy - reach, maxY: cy + reach }
      if (overlaps(box, keepOut[0]!) || cy + reach > horizon - inch(0.3)) continue
      if (rays) {
        const count = rng.chance(0.5) ? 8 : 10
        const turn = rng.next() * (360 / count)
        for (let i = 0; i < count; i++) b.add(rayRing(cx, cy, turn + (i * 360) / count, r + inch(0.07), r + inch(0.47), inch(0.125)), 'sun')
      }
      b.add(ellipseRing(cx, cy, r, r, 56), 'sun')
      sunBox = box
      keepOut.push(grow(box, PART_GAP))
      d.sun = c.sun
      d.rays = rays
      break
    }
  }

  // What lies on the horizon: mountains, a far ridge, or an island.
  if (c.far === 'mountains') {
    const peaks = W > inch(4.5) ? 3 : 2
    const baseY = horizon + H * 0.05
    const top = Math.max(pb.minY + H * 0.2, horizon - H * 0.2)
    const xs = Array.from({ length: peaks }, (_, i) => pb.minX + W * ((i + 0.5) / peaks) + (rng.next() - 0.5) * W * 0.12)
    const peakList = xs.map((x) => pt(x, top + (horizon - top) * range(rng, 0, 0.45)))
    // Valleys between the peaks, and the two ends running off the panel.
    const valleys = [
      pt(pb.minX - 40, horizon - H * 0.02),
      ...xs.slice(1).map((x, i) => pt((xs[i]! + x) / 2, horizon - H * range(rng, 0.01, 0.04))),
      pt(pb.maxX + 40, horizon - H * 0.02),
    ]
    // Each slope sags a little below the straight line, the way a mountainside sweeps down.
    const slope = (from: Pt, to: Pt) => quad(from, pt((from.x + to.x) / 2, (from.y + to.y) / 2 + Math.abs(to.x - from.x) * 0.1), to, 14)
    const sides = peakList.map((peak, i) => ({ peak, left: slope(peak, valleys[i]!), right: slope(peak, valleys[i + 1]!) }))
    const pts: Pt[] = [valleys[0]!]
    for (const { left, right } of sides) pts.push(...[...left].reverse().slice(1), ...right.slice(1))
    pts.push(pt(pb.maxX + 40, baseY), pt(pb.minX - 40, baseY))
    b.add(pts, 'mountain', true)
    if (c.snow) {
      d.snow = false
      sides.forEach(({ peak, left, right }, i) => {
        const depth = Math.min(valleys[i]!.y, valleys[i + 1]!.y) - peak.y
        if (depth < inch(1)) return
        d.snow = true
        const cut = Math.max(2, Math.round(Math.min(0.42, inch(0.62) / depth) * (left.length - 1)))
        const L = left[cut]!
        const R = right[cut]!
        const dip = Math.min(depth * 0.1, inch(0.16))
        const at = (t: number, down: number) => pt(R.x + (L.x - R.x) * t, R.y + (L.y - R.y) * t + down)
        // A soft, dripping lower edge, joining each slope where it leaves it.
        const hem = smoothLine([R, at(0.22, dip), at(0.45, -dip * 0.15), at(0.7, dip * 0.9), L], 6)
        b.add([...right.slice(0, cut + 1), ...hem.slice(1, -1), ...left.slice(1, cut + 1).reverse()], 'snow', true)
      })
    }
  } else if (c.far === 'ridge') {
    b.add(waveRing(pb, horizon - H * 0.07, H * 0.028, W * range(rng, 0.6, 0.9), phase()), 'mountain', true)
  } else if (c.far === 'island') {
    const side = c.place === 'right' || (c.place === 'center' && rng.chance(0.5)) ? -1 : 1
    const cx = (pb.minX + pb.maxX) / 2 + side * W * range(rng, 0.2, 0.28)
    // Wholly inside the panel: an island cut by the frame pinches slivers at the waterline.
    const rx = Math.min(W * range(rng, 0.2, 0.3), cx - pb.minX - FRAME_CLEAR, pb.maxX - FRAME_CLEAR - cx)
    const ry = Math.max(inch(0.42), H * 0.07)
    if (rx > ry * 1.4) b.add(ellipseRing(cx, horizon + 2, rx, ry, 64), 'hillFar')
    else d.far = 'none'
  }

  let groundAt: (x: number) => number = () => horizon
  /** Where the land in front begins: the grass, the sand. */
  let landTop: (x: number) => number = () => pb.maxY
  if (c.setting === 'meadow') {
    const farAmp = H * range(rng, 0.015, 0.03)
    const farLen = W * range(rng, 0.8, 1.5)
    const farPhase = phase()
    b.add(waveRing(pb, horizon, farAmp, farLen, farPhase), 'hillFar', true)
    const nearY = horizon + H * range(rng, 0.12, 0.15)
    if (c.fields) {
      // Every other patch of the far hill is a field in its own color, its
      // top following the hill's crest exactly and its sides leaning a little.
      const crest = waveAt(horizon, farAmp, farLen, farPhase)
      const count = Math.max(3, Math.min(6, Math.round(W / inch(1.1))))
      const bottom = nearY + H * 0.1
      const cuts = Array.from({ length: count + 1 }, (_, i) => pb.minX - 20 + ((W + 40) * i) / count + (i > 0 && i < count ? (rng.next() - 0.5) * (W / count) * 0.3 : 0))
      const lean = (bottom - horizon) * range(rng, -0.35, 0.35)
      const step = 6
      for (let i = rng.int(0, 1); i < count; i += 2) {
        const x0 = cuts[i]!
        const x1 = cuts[i + 1]!
        const top: Pt[] = [pt(x0, crest(x0))]
        for (let x = Math.ceil(x0 / step) * step; x < x1; x += step) top.push(pt(x, crest(x)))
        top.push(pt(x1, crest(x1)))
        b.add([...top, pt(x1 + lean, bottom), pt(x0 + lean, bottom)], 'field', true)
      }
    }
    const nearAmp = H * range(rng, 0.012, 0.022)
    const nearLen = W * range(rng, 1, 1.8)
    const nearPhase = phase()
    b.add(waveRing(pb, nearY, nearAmp, nearLen, nearPhase), 'hillNear', true)
    groundAt = waveAt(nearY, nearAmp, nearLen, nearPhase)
    landTop = (x) => groundAt(x) + nearAmp
  } else {
    // The sea, flat to the horizon.
    b.add(boxRing({ minX: pb.minX - 40, minY: horizon, maxX: pb.maxX + 40, maxY: pb.maxY + 40 }), 'water')
    const shore = c.setting === 'beach' ? horizon + H * range(rng, 0.1, 0.14) : pb.maxY
    d.waves = 0
    for (let k = 1; k <= c.waves; k++) {
      const y = horizon + ((shore - horizon) * k) / (c.waves + 1)
      if (shore - y < inch(0.34) || y - horizon < inch(0.3)) continue
      b.add(waveRing(pb, y, H * 0.01, W / range(rng, 2.6, 3.6), phase()), k % 2 === 1 ? 'waterLight' : 'water', true)
      d.waves++
    }
    if (c.setting === 'beach') {
      b.add(waveRing(pb, shore, H * 0.014, W * range(rng, 0.8, 1.3), phase()), 'sand', true)
      // Rolling dunes: bands of a second sand color toward the front.
      d.dunes = 0
      for (let k = 1; k <= c.dunes; k++) {
        const y = shore + ((pb.maxY - shore) * k) / (c.dunes + 1)
        if (pb.maxY - y < inch(0.45) || y - shore < inch(0.45)) continue
        b.add(waveRing(pb, y, H * 0.02, W * range(rng, 0.7, 1.1), phase()), k % 2 === 1 ? 'dune' : 'sand', true)
        d.dunes++
      }
    }
    landTop = () => shore + H * 0.02
  }

  // A palm on the beach beside the subject, leaning in toward it.
  d.palm = false
  if (c.palm) {
    const order: ('left' | 'right')[] = c.place === 'left' ? ['right'] : c.place === 'right' ? ['left'] : rng.chance(0.5) ? ['left', 'right'] : ['right', 'left']
    for (const side of order) {
      const room = side === 'left' ? sb.minX - PART_GAP - (pb.minX + FRAME_CLEAR) : pb.maxX - FRAME_CLEAR - (sb.maxX + PART_GAP)
      const R = Math.max(inch(0.65), Math.min(room / 2.1, H * 0.2))
      if (room < R * 1.95) continue
      const footX = side === 'left' ? pb.minX + FRAME_CLEAR + room * 0.42 : pb.maxX - FRAME_CLEAR - room * 0.42
      const foot = Math.min(pb.maxY - FRAME_CLEAR - inch(0.25), Math.max(landTop(footX) + inch(0.6), base - H * 0.02))
      const h = Math.min(H * range(rng, 0.5, 0.6), foot - pb.minY - FRAME_CLEAR - R * 1.05)
      if (h < R * 1.8) continue
      const lean = (side === 'left' ? 1 : -1) * R * range(rng, 0.25, 0.45)
      const crown = pt(footX + lean, foot - h)
      const trunk = pathShape([pt(footX, foot), pt(footX + lean * 0.15, foot - h * 0.4), pt(footX + lean * 0.55, foot - h * 0.75), crown], Math.max(inch(0.36), BAND_MIN * 1.3), BAND_MIN * 1.05)
      const fronds = frondRing(crown, R, PALM_FRONDS, 0.2, 0.13)
      const pb2 = ringBounds([...trunk, ...fronds])
      if (keepOut.some((k) => overlaps(pb2, k)) || !clearOfFrame(fronds, panel) || !clearOfFrame(trunk, panel)) continue
      b.add(trunk, 'trunk')
      b.add(fronds, 'foliage')
      keepOut.push(grow(pb2, PART_GAP))
      d.palm = true
      break
    }
  }

  // Trees (or a bush) beside the subject, standing on the near hill. Placed
  // now, so the fence leaves them room, but drawn after it: they stand in front.
  const treeParts: { ring: Ring; role: CbnRole }[] = []
  const treeSides: ('left' | 'right')[] = []
  if (c.setting === 'meadow' && c.trees !== 'none') {
    const sides = c.trees === 'both' ? (['left', 'right'] as const) : ([c.trees] as const)
    for (const side of sides) {
      const room = side === 'left' ? sb.minX - PART_GAP - (pb.minX + FRAME_CLEAR) : pb.maxX - FRAME_CLEAR - (sb.maxX + PART_GAP)
      const ratio = TREE_RATIO[c.tree]
      let h = Math.min(H * range(rng, 0.3, 0.4), inch(2.8))
      let width = Math.min(h * ratio, room)
      if (width < inch(0.6)) continue
      const x = side === 'left' ? pb.minX + FRAME_CLEAR + room / 2 : pb.maxX - FRAME_CLEAR - room / 2
      const cx = side === 'left' ? Math.min(x, pb.minX + W * 0.17) : Math.max(x, pb.maxX - W * 0.17)
      const foot = groundAt(cx) + H * 0.035
      // Shorter, rather than left out, when the sun sits above it.
      for (const k of keepOut) {
        if (k.maxX > cx - width / 2 && k.minX < cx + width / 2 && k.maxY < foot) h = Math.min(h, foot - k.maxY - 2)
      }
      h = Math.min(h, foot - pb.minY - FRAME_CLEAR - 4)
      width = Math.min(h * ratio, room)
      // A narrow gap takes a smaller tree, not a lollipop on a long stick.
      h = Math.min(h, (width / ratio) * 1.12)
      if (h < inch(0.9) || width < inch(0.6)) continue
      const tree = treeRings(c.tree, cx, foot, h, width, rng)
      if (!tree.every((part) => clearOfFrame(part.ring.filter((p) => p.y < pb.maxY - FRAME_CLEAR), panel))) continue
      const tb = ringBounds(tree.flatMap((part) => part.ring))
      if (keepOut.some((k) => overlaps(tb, k))) continue
      treeParts.push(...tree)
      treeSides.push(side)
      keepOut.push(grow(tb, PART_GAP))
    }
  }

  // A fence across the meadow, behind the subject: posts wherever the
  // subject and the trees leave them room, rails running behind everything.
  // Rails are scenery lines (a stretch between two parts of the subject may
  // go); a fence with fewer than two posts showing is two stray bands, and is
  // left out.
  if (c.fence) {
    const postW = BAND_MIN
    const postH = Math.max(inch(0.8), H * 0.12)
    const railH = BAND_MIN * 0.92
    const foot = groundAt((pb.minX + pb.maxX) / 2) + H * 0.075
    const railYs = [foot - postH * 0.78, foot - postH * 0.4]
    const fenceBand: Bounds = { minX: pb.minX, maxX: pb.maxX, minY: foot - postH, maxY: foot }
    const step = Math.max(inch(0.8), W * 0.13)
    const posts: Ring[] = []
    for (let x = pb.minX + step * range(rng, 0.35, 0.65); x < pb.maxX; x += step) {
      const post: Bounds = { minX: x - postW / 2, maxX: x + postW / 2, minY: foot - postH, maxY: foot }
      if (overlaps(post, grow(sb, inch(0.12))) || keepOut.slice(1).some((k) => overlaps(post, k))) continue
      const ring: Ring = [pt(post.minX, post.maxY), pt(post.minX, post.minY + postW * 0.5), pt(x, post.minY), pt(post.maxX, post.minY + postW * 0.5), pt(post.maxX, post.maxY)]
      if (!ring.every((p) => inRegion(p, panel) && distToRing(p, panel.ring) >= inch(0.12))) continue
      posts.push(ring)
    }
    d.fence = posts.length >= 2
    if (posts.length >= 2) {
      for (const y of railYs) b.add(boxRing({ minX: pb.minX - 40, maxX: pb.maxX + 40, minY: y, maxY: y + railH }), 'fence', true)
      for (const ring of posts) b.add(ring, 'fence')
      keepOut.push(grow(fenceBand, PART_GAP))
    }
  }
  for (const part of treeParts) b.add(part.ring, part.role)
  d.trees = treeSides.length === 2 ? 'both' : (treeSides[0] ?? 'none')

  // A path winding up to the subject.
  let pathRing: Ring | null = null
  if (c.path) {
    const topX = (sb.minX + sb.maxX) / 2
    const topY = base - Math.min((sb.maxY - sb.minY) * 0.12, inch(0.3))
    const bottomX = topX + (rng.next() - 0.5) * W * 0.3
    // A gentle S: out to one side, back the other, up to the subject.
    const bend = (rng.chance(0.5) ? -1 : 1) * W * range(rng, 0.05, 0.1)
    const y0 = pb.maxY + 30
    const at = (t: number, off: number) => pt(bottomX + (topX - bottomX) * t + off, y0 + (topY - y0) * t)
    const ring = pathShape([pt(bottomX, y0), at(0.35, bend), at(0.72, -bend * 0.6), pt(topX, topY)], Math.max(W * 0.24, inch(1)), Math.max(W * 0.08, inch(0.4)))
    pathRing = ring
    b.add(ring, 'path')
  }

  // A pond in the foreground grass, with a few reeds at one end.
  const path = pathRing ? toRegion(pathRing) : null
  const offPath = (ring: readonly Pt[]) => !path || !ring.some((p) => inRegion(p, path) || distToRing(p, path.ring) < PART_GAP)
  d.pond = false
  if (c.pond) {
    for (let tries = 0; tries < 40 && !d.pond; tries++) {
      const rx = Math.max(inch(0.85), W * range(rng, 0.13, 0.17))
      const ry = Math.max(inch(0.4), rx * 0.34)
      const cx = range(rng, pb.minX + FRAME_CLEAR + rx, pb.maxX - FRAME_CLEAR - rx)
      const cy = range(rng, groundAt(cx) + ry + inch(0.6), pb.maxY - FRAME_CLEAR - ry - inch(0.1))
      const box: Bounds = { minX: cx - rx, maxX: cx + rx, minY: cy - ry - inch(0.6), maxY: cy + ry }
      if (box.minY < Math.max(landTop(box.minX), landTop(cx), landTop(box.maxX)) + inch(0.15)) continue
      if (keepOut.some((k) => overlaps(box, k))) continue
      const outer = ellipseRing(cx, cy, rx, ry, 72)
      if (!clearOfFrame(outer, panel) || !offPath(outer)) continue
      b.add(outer, 'water')
      b.add(ellipseRing(cx - rx * 0.12, cy - ry * 0.1, rx * 0.58, ry * 0.5, 56), 'waterLight')
      const end = rng.chance(0.5) ? -1 : 1
      for (let k = 0; k < 3; k++) {
        const a = ((end < 0 ? 205 + k * 14 : 335 - k * 14) * Math.PI) / 180
        const from = pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a))
        const tall = inch(0.42 + 0.12 * ((k + 1) % 3))
        const lean = end * (k - 1) * inch(0.1)
        b.stroke(smoothLine([from, pt(from.x + lean * 0.4, from.y - tall * 0.5), pt(from.x + lean, from.y - tall)], 6))
      }
      keepOut.push(grow(box, PART_GAP))
      d.pond = true
    }
  }

  // Boulders: in the grass or on the sand, or standing out of the sea at a front corner.
  if (c.rocks > 0) {
    const rocks: Bounds[] = []
    for (let tries = 0; tries < 80 && rocks.length < c.rocks; tries++) {
      const w = inch(range(rng, 0.8, 1.15)) * (rocks.length > 0 ? 0.8 : 1)
      const h = w * range(rng, 0.5, 0.62)
      let cx: number
      let foot: number
      if (c.setting === 'shore') {
        const reach = W * 0.2
        cx = rng.chance(0.5) ? pb.minX + FRAME_CLEAR + w / 2 + rng.next() * reach : pb.maxX - FRAME_CLEAR - w / 2 - rng.next() * reach
        foot = pb.maxY + inch(0.15)
      } else {
        cx = range(rng, pb.minX + FRAME_CLEAR + w / 2, pb.maxX - FRAME_CLEAR - w / 2)
        foot = range(rng, landTop(cx) + h + inch(0.35), pb.maxY - FRAME_CLEAR - inch(0.15))
      }
      const { ring, facet } = rockShape(cx, foot, w, h, rng)
      const rb = ringBounds(ring)
      if ((c.setting !== 'shore' && rb.minY < Math.max(landTop(rb.minX), landTop(rb.maxX)) + inch(0.2)) || rb.minY < horizon + inch(0.3)) continue
      if ([...keepOut, ...rocks.map((q) => grow(q, PART_GAP))].some((k) => overlaps(rb, k))) continue
      if (!clearOfFrame(ring.filter((p) => p.y < pb.maxY - FRAME_CLEAR), panel) || !offPath(ring)) continue
      b.add(ring, 'rock')
      b.stroke(facet)
      rocks.push(rb)
    }
    for (const rb of rocks) keepOut.push(grow(rb, PART_GAP))
    d.rocks = rocks.length
  }

  // Flowers in the foreground grass.
  if (c.flowers > 0) {
    const r = Math.max(inch(0.38), Math.min(W, H) * 0.05)
    const stem = r * 1.25
    const placed: Pt[] = []
    for (let tries = 0; tries < 160 && placed.length < c.flowers; tries++) {
      const p = pt(range(rng, pb.minX + r, pb.maxX - r), range(rng, groundAt(pb.minX) + H * 0.06 + r, pb.maxY - r - stem))
      if (p.y - r < groundAt(p.x) + inch(0.2)) continue
      const fb: Bounds = { minX: p.x - r, maxX: p.x + r, minY: p.y - r, maxY: p.y + stem + inch(0.1) }
      if (keepOut.some((k) => overlaps(fb, k))) continue
      if (placed.some((q) => dist(p, q) < r * 2 + PART_GAP)) continue
      if (!clearOfFrame(boxRing(fb), panel)) continue
      if (path && (inRegion(p, path) || distToRing(p, path.ring) < r + stem + PART_GAP)) continue
      placed.push(p)
    }
    d.flowers = placed.length
    const petals = rng.chance(0.5) ? 5 : 6
    for (const p of placed) {
      // A short stem with a leaf-less curve, under the head.
      const sway = (rng.next() - 0.5) * r * 0.5
      b.stroke(smoothLine([pt(p.x, p.y), pt(p.x + sway * 0.3, p.y + r + stem * 0.4), pt(p.x + sway, p.y + r * 0.5 + stem)], 6))
      b.add(flowerRing(p.x, p.y, r, rng.next() * 72, petals), 'petal')
      b.add(ellipseRing(p.x, p.y, r * 0.36, r * 0.36, 28), 'flowerCenter')
    }
  }

  // Clouds in the open sky.
  if (c.clouds > 0) {
    const skyFloor = horizon - (c.far === 'mountains' ? H * 0.22 : c.far === 'ridge' ? H * 0.12 : H * 0.06)
    const boxes: Bounds[] = []
    for (let tries = 0; tries < 120 && boxes.length < c.clouds; tries++) {
      const w = Math.max(inch(1.1), W * range(rng, 0.2, 0.3))
      const y = range(rng, pb.minY + FRAME_CLEAR + w * 0.5, skyFloor)
      const x = range(rng, pb.minX + w / 2, pb.maxX - w / 2)
      const ring = cloudRing(x, y, w, rng)
      const cb = ringBounds(ring)
      if (cb.maxY > skyFloor) continue
      if ([...keepOut, ...boxes.map((q) => grow(q, PART_GAP))].some((k) => overlaps(cb, k))) continue
      if (sunBox && overlaps(cb, grow(sunBox, PART_GAP))) continue
      if (!clearOfFrame(ring, panel)) continue
      boxes.push(cb)
      b.add(ring, 'cloud')
    }
    d.clouds = boxes.length
    keepOut.push(...boxes.map((q) => grow(q, inch(0.12))))
  }

  // A few gulls in flight, together, in open sky.
  d.birds = 0
  if (c.birds > 0) {
    const skyFloor = horizon - (c.far === 'mountains' ? H * 0.24 : H * 0.1)
    const flock: Bounds[] = []
    let anchor: Pt | null = null
    const taken = [...keepOut, ...(sunBox ? [grow(sunBox, inch(0.15))] : [])]
    for (let tries = 0; tries < 120 && flock.length < c.birds; tries++) {
      const size = inch(range(rng, 0.17, 0.25))
      const x = anchor ? anchor.x + range(rng, -1, 1) * inch(0.9) : range(rng, pb.minX + W * 0.15, pb.maxX - W * 0.15)
      const y = anchor ? anchor.y + range(rng, -1, 1) * inch(0.45) : range(rng, pb.minY + FRAME_CLEAR + inch(0.3), skyFloor - inch(0.2))
      const bb: Bounds = { minX: x - size, maxX: x + size, minY: y - size * 0.6, maxY: y + size * 0.1 }
      if (bb.maxY > skyFloor || [...taken, ...flock.map((q) => grow(q, inch(0.14)))].some((k) => overlaps(bb, k))) continue
      const line = gullLine(x, y, size, rng.chance(0.5))
      if (!clearOfFrame(line, panel)) continue
      b.stroke(line)
      flock.push(bb)
      anchor ??= pt(x, y)
    }
    d.birds = flock.length
  }
  return placed
}

/** How wide each kind of tree stands for its height. */
const TREE_RATIO: Readonly<Record<CbnTree, number>> = { round: 0.78, oak: 0.85, pine: 0.6, poplar: 0.46, fruit: 0.8, bush: 0.95 }

/** An oak's crown: big round lobes, clockwise from the top, on a 0–100 grid centred at (50, 49). */
const OAK_LOBES: readonly Disc[] = [
  [50, 22, 20],
  [74, 34, 18],
  [80, 60, 17],
  [63, 80, 16],
  [37, 80, 16],
  [20, 60, 17],
  [26, 34, 18],
]

/** A palm's fronds, clockwise: [direction, length, droop]; the two outer ones hang low. */
const PALM_FRONDS: readonly (readonly [number, number, number])[] = [
  [160, 1, 0.3],
  [200, 1, 0.12],
  [238, 0.95, 0],
  [275, 0.9, 0],
  [312, 0.95, 0],
  [350, 1, 0.12],
  [20, 1, 0.3],
]

/** A houseplant's leaves standing up out of the pot, the outer ones arching over. */
const PLANT_LEAVES: readonly (readonly [number, number, number])[] = [
  [195, 0.78, 0.12],
  [230, 0.95, 0],
  [268, 1.05, 0],
  [305, 0.95, 0],
  [345, 0.78, 0.12],
]

/**
 * Discs of radius `r` evenly spaced (by length, not angle, so none crowd at
 * the ends of a long oval) clockwise round an ellipse from its top, about
 * 1.45 r apart: each overlaps only its neighbours, for a closed `bumpRing`.
 */
function discsRound(cx: number, cy: number, rx: number, ry: number, r: number): Disc[] {
  const fine = 240
  const pts = Array.from({ length: fine + 1 }, (_, i) => {
    const t = -Math.PI / 2 + (i / fine) * Math.PI * 2
    return pt(cx + rx * Math.cos(t), cy + ry * Math.sin(t))
  })
  const along = [0]
  for (let i = 1; i <= fine; i++) along.push(along[i - 1]! + dist(pts[i]!, pts[i - 1]!))
  const total = along[fine]!
  const n = Math.max(6, Math.round(total / (r * 1.45)))
  const out: Disc[] = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const want = (total * k) / n
    while (j < fine - 1 && along[j + 1]! < want) j++
    const f = (want - along[j]!) / (along[j + 1]! - along[j]! || 1)
    out.push([pts[j]!.x + (pts[j + 1]!.x - pts[j]!.x) * f, pts[j]!.y + (pts[j + 1]!.y - pts[j]!.y) * f, r])
  }
  return out
}

/**
 * A tree `h` tall and about `w` wide standing on `foot`: its crown (a leafy
 * round, a lobed oak, a fir's tiers of boughs, a poplar's tall oval, a
 * round crown hung with fruit, or a low scalloped bush) over a trunk that
 * flares into roots. At least a third of an inch of trunk shows.
 */
function treeRings(kind: CbnTree, cx: number, foot: number, h: number, w: number, rng: StudioRng): { ring: Ring; role: CbnRole }[] {
  const trunkW = Math.max(BAND_MIN, w * 0.16)
  if (kind === 'bush') {
    // Many small leafy scallops round a tall dome, where a cloud has a few big puffs.
    const n = rng.chance(0.5) ? 11 : 13
    return [{ ring: bumpRing(domeDiscs(cx, foot, w / 2, w * 0.62, n, w * (n === 11 ? 0.085 : 0.075)), foot), role: 'foliage' }]
  }
  if (kind === 'pine') {
    const trunkH = Math.max(h * 0.2, inch(0.34) / 0.6)
    const tiers = h > inch(1.8) ? 4 : 3
    const top = foot - h
    const bottom = foot - trunkH * 0.6
    const tierH = (bottom - top) / tiers
    // One outline down the right side: each bough sweeps out to a drooping
    // tip, then tucks back in under the next; the left side mirrors it.
    const right: Pt[] = [pt(cx, top)]
    let from = pt(cx, top)
    for (let i = 0; i < tiers; i++) {
      const y1 = top + tierH * (i + 1)
      const half = (w / 2) * (0.42 + 0.58 * ((i + 1) / tiers))
      const tip = pt(cx + half, y1 + tierH * 0.06)
      right.push(...quad(from, pt(from.x + (tip.x - from.x) * 0.3, from.y + (tip.y - from.y) * 0.8), tip, 10).slice(1))
      if (i < tiers - 1) {
        const notch = pt(cx + half * 0.55, y1 - tierH * 0.1)
        right.push(...quad(tip, pt((tip.x + notch.x) / 2, tip.y + tierH * 0.02), notch, 6).slice(1))
        from = notch
      } else {
        right.push(...quad(tip, pt(cx + half * 0.5, bottom + tierH * 0.08), pt(cx, bottom - tierH * 0.02), 8).slice(1))
      }
    }
    const left = right.map((p) => pt(2 * cx - p.x, p.y)).reverse()
    return [
      { ring: trunkRing(cx, foot - trunkH * 1.4, foot, trunkW), role: 'trunk' },
      { ring: [...right, ...left.slice(1, -1)], role: 'foliage' },
    ]
  }
  const trunkShows = Math.max(inch(0.36), h * 0.28)
  const crownH = Math.min(kind === 'poplar' ? w * 1.6 : w * 0.95, h - trunkShows)
  const crownW = kind === 'poplar' ? Math.min(w, crownH / 1.6) : kind === 'oak' ? Math.min(w, crownH) : w
  const crownCy = foot - h + crownH / 2
  let crown: Ring
  const extra: { ring: Ring; role: CbnRole }[] = []
  if (kind === 'oak') crown = bumpRing(fitDiscs(OAK_LOBES, cx, crownCy, crownW, 49, rng.chance(0.5)))
  else {
    const r = crownW * (kind === 'poplar' ? 0.14 : 0.13)
    const rx = crownW / 2 - r
    const ry = crownH / 2 - r
    crown = bumpRing(discsRound(cx, crownCy, rx, ry, r))
    if (kind === 'fruit') {
      // Fruit hung round the crown, each well inside its edge and clear of the others.
      const fr = Math.max(inch(0.16), crownW * 0.075)
      const reachX = rx + r * 0.6 - fr - inch(0.12)
      const reachY = ry + r * 0.6 - fr - inch(0.12)
      const want = rng.int(3, 5)
      const fruit: Pt[] = []
      for (let tries = 0; tries < 80 && fruit.length < want; tries++) {
        const a = rng.next() * Math.PI * 2
        const k = Math.sqrt(range(rng, 0.15, 1))
        const p = pt(cx + reachX * k * Math.cos(a), crownCy + reachY * k * Math.sin(a))
        if (fruit.some((q) => dist(p, q) < fr * 2 + inch(0.2))) continue
        fruit.push(p)
      }
      for (const p of fruit) extra.push({ ring: ellipseRing(p.x, p.y, fr, fr, 28), role: 'fruit' })
    }
  }
  return [{ ring: trunkRing(cx, crownCy, foot, trunkW), role: 'trunk' }, { ring: crown, role: 'foliage' }, ...extra]
}

/* ------------------------------------------------------------------ *
 * Indoors: a room
 * ------------------------------------------------------------------ */

function buildRoom(c: CbnComposition, d: CbnComposition, b: Builder, panel: Region, drawing: SubjectDrawing, subject: SgSubject, rng: StudioRng, fill: number, minScale: number): Placed | null {
  const pb = panel.bounds
  const W = pb.maxX - pb.minX
  const H = pb.maxY - pb.minY
  const tabletop = isTabletop(subject)
  const floorTop = pb.minY + H * range(rng, 0.66, 0.72)
  const baseboard = Math.max(BAND_MIN, H * 0.035)
  const floorDepth = pb.maxY - floorTop
  const wallBottom = floorTop - baseboard
  const railH = BAND_MIN * 0.9
  const wainscotTop = wallBottom - Math.max(H * range(rng, 0.1, 0.13), inch(0.5))
  const wallFloor = c.wainscot ? wainscotTop - railH : wallBottom
  // The long level lines of the room: the table keeps its own edges clear of them.
  const levelLines = [wallBottom, floorTop, ...(c.wainscot ? [wainscotTop - railH, wainscotTop] : [])]

  // The table: a top seen a little from above (so a teapot stands on it, and
  // the gap between its feet opens onto the tabletop rather than pinching a
  // sliver of wall), a front edge, two legs.
  const legFoot = floorTop + floorDepth * range(rng, 0.5, 0.62)
  const faceDepth = Math.max(inch(0.42), H * 0.075)
  const apron = BAND_MIN
  const stageTop = pb.minY + H * 0.08
  // A tall subject needs its height above the table: the table stands lower
  // (its legs shorter) rather than the subject printing too small to number.
  const raw = drawingBounds(drawing)
  const needH = (raw.maxY - raw.minY) * minScale + inch(0.05)
  let tableTop = Math.max(legFoot - Math.max(H * 0.3, inch(1.25)), stageTop + needH - faceDepth * 0.72)
  const tableEdges = (top: number) => [top, top + faceDepth, top + faceDepth + apron]
  const clearOfLevels = (top: number) => tableEdges(top).every((e) => levelLines.every((y) => Math.abs(e - y) >= inch(0.2)))
  for (let k = 1; k < 24 && !clearOfLevels(tableTop); k++) tableTop += (k % 2 === 1 ? k : -k) * inch(0.05)
  let legBottom = Math.max(legFoot, tableTop + faceDepth + apron + inch(0.5))
  // A tall subject pushes its table down: when the legs would reach the
  // frame, they run on past it, a close-up of the tabletop.
  const cropped = tabletop && legBottom > pb.maxY - FRAME_CLEAR - inch(0.1)
  if (cropped && tableTop + faceDepth + apron > pb.maxY - inch(0.4)) return null
  if (cropped) legBottom = pb.maxY + 40
  const floorStand = Math.min(Math.max(floorTop + floorDepth * range(rng, 0.55, 0.7), stageTop + needH), pb.maxY - FRAME_CLEAR - inch(0.08))
  const stand = tabletop ? tableTop + faceDepth * 0.72 : floorStand

  const stage = { minX: pb.minX + W * 0.05, maxX: pb.maxX - W * 0.05, minY: stageTop, maxY: stand }
  // With a window beside it, the subject stands well to the other side and a little narrower, so the window keeps its wall.
  const beside = c.window === 'left' || c.window === 'right'
  const placed = placeSubject({
    drawing,
    stage,
    panel,
    place: c.place,
    stands: true,
    fill,
    minScale,
    offset: beside ? 0.3 : 0.12,
    max: tabletop ? { w: 0.44, h: 0.38 } : { w: beside ? 0.5 : 0.56, h: 0.58 },
  })
  if (!placed) return null
  const sb = placed.bounds
  const subjectZone = grow(sb, PART_GAP)
  const keepOut: Bounds[] = []

  // Wainscoting: a lower wall under a chair rail. Its long lines, like the
  // baseboard and the floor, run behind the subject and may lose a stretch
  // that pinches a sliver against it (between the legs of a chair).
  const addWainscot = () => {
    b.add(boxRing({ minX: pb.minX - 40, maxX: pb.maxX + 40, minY: wainscotTop - railH / 2, maxY: wallBottom + 2 }), 'wallLow', true)
    b.add(boxRing({ minX: pb.minX - 40, maxX: pb.maxX + 40, minY: wainscotTop - railH, maxY: wainscotTop }), 'trim', true)
    d.wainscot = true
  }
  if (c.wainscot) addWainscot()

  // A window with a view: frame, glass, a hill beyond, crossbars; curtains on a rod.
  d.window = 'none'
  d.curtains = false
  if (c.window !== 'none') {
    // As wide as it likes, but no wider than the wall beside the subject
    // leaves; the curtains go before the window gets too narrow.
    const t = BAND_MIN
    const curtainW = inch(0.5)
    const curtainGap = PART_GAP
    const freeWall = c.window === 'left' ? sb.minX - PART_GAP - pb.minX : pb.maxX - sb.maxX - PART_GAP
    const widthWith = (curtains: boolean) => freeWall - 2 * (curtains ? curtainGap + curtainW : t) - FRAME_CLEAR - 4
    const curtains = c.curtains && widthWith(true) >= MIN_WINDOW
    const ww = Math.min(W * range(rng, 0.26, 0.32), widthWith(curtains))
    const bottom = Math.min(wallFloor - inch(0.32), pb.minY + H * 0.48)
    // Curtains hang beside the window with a strip of wall between: drawn over
    // the frame, their edge would pinch a sliver of frame against the glass.
    const side = curtains ? curtainGap + curtainW : t
    const reachAt = (x: number, top: number): Bounds =>
      curtains
        ? { minX: x - ww / 2 - side, maxX: x + ww / 2 + side, minY: top - curtainGap - BAND_MIN * 1.45, maxY: bottom + t * 1.8 }
        : { minX: x - ww / 2 - t, maxX: x + ww / 2 + t, minY: top - t, maxY: bottom + t * 1.2 }
    // Centred in its stretch of wall; where a rounded or arched frame cuts the
    // corner, it slides toward the middle of that wall and sits a little lower.
    const want = c.window === 'left' ? (pb.minX + sb.minX - PART_GAP) / 2 : (sb.maxX + PART_GAP + pb.maxX) / 2
    const inward = c.window === 'left' ? 1 : -1
    let cx: number | undefined
    let top = 0
    search: for (let dy = 0; dy <= 4; dy++) {
      for (let dx = 0; dx <= 8; dx++) {
        const x = want + inward * dx * inch(0.06)
        const y = pb.minY + H * 0.08 + dy * H * 0.035
        const reach = reachAt(x, y)
        if (overlaps(reach, subjectZone) || !clearOfFrame(boxRing(reach), panel)) continue
        cx = x
        top = y
        break search
      }
    }
    const rodY = top - curtainGap - BAND_MIN * 0.45
    if (cx !== undefined && ww >= MIN_WINDOW && bottom - top > inch(1)) {
      const reach = reachAt(cx, top)
      d.window = c.window
      d.curtains = curtains
      const outer: Bounds = { minX: cx - ww / 2, maxX: cx + ww / 2, minY: top, maxY: bottom }
      const glass: Bounds = { minX: outer.minX + t, maxX: outer.maxX - t, minY: outer.minY + t, maxY: outer.maxY - t }
      b.add(boxRing(outer), 'trim')
      b.add(boxRing(glass), 'sky')
      const hillY = glass.minY + (glass.maxY - glass.minY) * range(rng, 0.55, 0.7)
      const hill = clipToBox(waveRing(glass, hillY, (glass.maxY - glass.minY) * 0.06, (glass.maxX - glass.minX) * range(rng, 0.9, 1.4), rng.next() * 6), glass)
      if (hill.length >= 3) b.add(hill, 'hillNear', true)
      const bar = Math.max(BAND_MIN * 0.85, t * 0.8)
      const midX = (glass.minX + glass.maxX) / 2
      const midY = glass.minY + (hillY - glass.minY) * 0.9
      b.add(boxRing({ minX: midX - bar / 2, maxX: midX + bar / 2, minY: glass.minY, maxY: glass.maxY }), 'trim')
      if (glass.maxY - glass.minY > inch(1.6)) b.add(boxRing({ minX: glass.minX, maxX: glass.maxX, minY: midY - bar / 2, maxY: midY + bar / 2 }), 'trim')
      // The sill: a ledge a little wider than the frame.
      b.add(boxRing({ minX: outer.minX - t * 0.6, maxX: outer.maxX + t * 0.6, minY: outer.maxY - 1, maxY: outer.maxY + t }), 'trim')
      if (curtains) {
        for (const sideSign of [-1, 1]) {
          const inX = sideSign < 0 ? outer.minX - curtainGap : outer.maxX + curtainGap
          const outX = inX + sideSign * curtainW
          const tie = top + (bottom - top) * 0.55
          const hem = bottom + t * 1.6
          // Gathered at a tie halfway down, flaring again to the hem.
          const inner = smoothLine([pt(inX, rodY), pt(inX + sideSign * curtainW * 0.38, tie), pt(inX + sideSign * curtainW * 0.04, hem)])
          b.add([pt(outX, rodY), ...inner, pt(outX, hem)], 'curtain')
        }
        b.add(band([pt(reach.minX - BAND_MIN * 0.3, rodY), pt(reach.maxX + BAND_MIN * 0.3, rodY)], BAND_MIN * 0.9, true), 'wood')
      }
      keepOut.push(grow(reach, PART_GAP))
    }
  }

  // A small framed picture on the wall. A room whose window found no wall
  // gets one wherever there is room, so no wall is left bare.
  d.picture = 'none'
  const pictureSide = c.picture !== 'none' ? c.picture : d.window === 'none' ? (c.place === 'left' ? 'right' : 'left') : 'none'
  if (pictureSide !== 'none') {
    const pw = Math.min(inch(1.7), Math.max(inch(1.25), W * 0.24))
    const ph = pw * range(rng, 0.72, 0.95)
    const half = pw / 2 + FRAME_CLEAR + 2
    const top = pb.minY + H * range(rng, 0.14, 0.2) + (c.frame === 'arch' ? H * 0.06 : 0)
    const at = (side: 'left' | 'right'): Bounds => {
      const cx = side === 'left' ? Math.max(pb.minX + half, pb.minX + W * 0.2) : Math.min(pb.maxX - half, pb.maxX - W * 0.2)
      return { minX: cx - pw / 2, maxX: cx + pw / 2, minY: top, maxY: top + ph }
    }
    const free = (o: Bounds) => !keepOut.some((k) => overlaps(o, k)) && !overlaps(o, subjectZone) && o.maxY < wallFloor - inch(0.3) && clearOfFrame(boxRing(o), panel)
    // Its own side, or the other if the subject or the window has that wall.
    const sides = [pictureSide, pictureSide === 'left' ? 'right' : 'left'] as const
    const found = sides.find((side) => free(at(side)))
    const outer = found ? at(found) : undefined
    if (found) d.picture = found
    const t = BAND_MIN * 0.9
    if (outer) {
      const inner: Bounds = { minX: outer.minX + t, maxX: outer.maxX - t, minY: outer.minY + t, maxY: outer.maxY - t }
      b.add(boxRing(outer), 'wood')
      b.add(boxRing(inner), 'sky')
      const iw = inner.maxX - inner.minX
      const ih = inner.maxY - inner.minY
      const sunR = Math.max(inch(0.14), iw * 0.11)
      if (iw > inch(0.8)) b.add(ellipseRing(inner.maxX - sunR - iw * 0.14, inner.minY + sunR + ih * 0.14, sunR, sunR, 28), 'sun')
      const hill = clipToBox(waveRing(inner, inner.minY + ih * 0.62, ih * 0.1, iw * range(rng, 0.9, 1.3), rng.next() * 6), inner)
      if (hill.length >= 3) b.add(hill, 'hillNear', true)
      keepOut.push(grow(outer, PART_GAP))
    }
  }

  // Still nothing on the wall: a chair rail and wainscoting break it up.
  if (d.window === 'none' && d.picture === 'none' && !d.wainscot) addWainscot()

  // Baseboard, floor and floorboards.
  b.add(boxRing({ minX: pb.minX - 40, maxX: pb.maxX + 40, minY: wallBottom, maxY: floorTop + 2 }), 'trim', true)
  b.add(boxRing({ minX: pb.minX - 40, maxX: pb.maxX + 40, minY: floorTop, maxY: pb.maxY + 40 }), 'floor', true)
  if (c.boards) {
    const count = Math.max(2, Math.min(5, Math.floor(floorDepth / inch(0.42))))
    const boardH = floorDepth / count
    for (let k = 1; k < count; k += 2) {
      b.add(boxRing({ minX: pb.minX - 40, maxX: pb.maxX + 40, minY: floorTop + k * boardH, maxY: floorTop + (k + 1) * boardH }), 'floorAlt', true)
    }
  }

  // Where the table stands: under the subject, wholly inside the frame.
  const tableW = Math.min(W - 2 * FRAME_CLEAR - inch(0.5), Math.max((sb.maxX - sb.minX) * 1.35, W * 0.42))
  const tableX = Math.min(pb.maxX - FRAME_CLEAR - inch(0.25) - tableW / 2, Math.max(pb.minX + FRAME_CLEAR + inch(0.25) + tableW / 2, (sb.minX + sb.maxX) / 2))

  // A rug under the subject (or under the table, when its feet show).
  d.rug = 'none'
  let rugBox: Bounds | null = null
  if (c.rug !== 'none' && !cropped) {
    const cx = tabletop ? tableX : (sb.minX + sb.maxX) / 2
    const rx = Math.min(W * 0.44, Math.max(W * 0.3, (tabletop ? tableW : sb.maxX - sb.minX) * 0.72))
    const ry = Math.min(floorDepth * 0.42, rx * 0.36)
    // Round the feet, but wholly on the floor and clear of the frame.
    const cy = Math.max(floorTop + ry + inch(0.1), Math.min((tabletop ? legBottom : stand) - inch(0.06), pb.maxY - FRAME_CLEAR - ry - 2))
    const border = Math.max(BAND_MIN, ry * 0.28)
    if (ry - border > inch(0.3)) {
      const outer = c.rug === 'oval' ? ellipseRing(cx, cy, rx, ry, 72) : rect(cx - rx, cy - ry, rx * 2, ry * 2, ry * 0.3)
      const inner = c.rug === 'oval' ? ellipseRing(cx, cy, rx - border, ry - border, 72) : rect(cx - rx + border, cy - ry + border, (rx - border) * 2, (ry - border) * 2, ry * 0.2)
      if (clearOfFrame(outer, panel)) {
        b.add(outer, 'rugBorder', true)
        b.add(inner, 'rug', true)
        d.rug = c.rug
        rugBox = ringBounds(outer)
      }
    }
  }

  // Things in the room beside the subject: a potted plant and a floor lamp
  // standing by the wall, a clock on it. Each goes where it finds room clear
  // of the subject, its table, the rug, the window and the picture, or is left out.
  const taken: Bounds[] = [...keepOut, subjectZone]
  if (tabletop) taken.push(grow({ minX: tableX - tableW / 2 - inch(0.12), maxX: tableX + tableW / 2 + inch(0.12), minY: tableTop, maxY: legBottom }, PART_GAP))
  if (rugBox) taken.push(grow(rugBox, inch(0.08)))
  /** Spots along the wall, the subject's far side first, each tried in turn. */
  const spots = (half: number) => {
    const xs: number[] = []
    const away = (sb.minX + sb.maxX) / 2 < (pb.minX + pb.maxX) / 2 ? -1 : 1
    for (let x = pb.minX + FRAME_CLEAR + half; x <= pb.maxX - FRAME_CLEAR - half; x += inch(0.12)) xs.push(x)
    return xs.sort((a, b2) => (away < 0 ? b2 - a : a - b2))
  }
  /** By the wall, or further forward on the floor, where there is more height under a window. */
  const feet = [floorTop + Math.min(floorDepth * 0.3, inch(0.42)), floorTop + floorDepth * 0.62].filter((y) => y < pb.maxY - FRAME_CLEAR - inch(0.15))
  const floorSpots = (half: number) => feet.flatMap((foot) => spots(half).map((cx) => [cx, foot] as const))
  /** The lowest thing hanging over a stretch of wall (a window sill, a picture), or the top of the panel. */
  const ceiling = (minX: number, maxX: number, foot: number) =>
    Math.max(pb.minY + FRAME_CLEAR, ...taken.filter((k) => k.minX < maxX && minX < k.maxX).map((k) => (k.maxY >= foot ? Infinity : k.maxY)))
  d.plant = false
  if (c.plant) {
    const potW = Math.max(inch(0.7), W * 0.095)
    const potH = potW * 0.9
    const lipH = Math.max(BAND_MIN, potH * 0.3)
    const most = Math.max(inch(1.05), potW * 1.5)
    for (const [cx, foot] of floorSpots(most * 0.8)) {
      // Under a window it stands a little smaller, its leaves clear of the sill.
      const R = Math.min(most, (foot - potH - ceiling(cx - most * 0.8, cx + most * 0.8, foot)) / 1.05)
      // Full leaves or none: a plant squeezed small is a fan of slivers.
      if (R < inch(0.85)) continue
      const box: Bounds = { minX: cx - R * 0.8, maxX: cx + R * 0.8, minY: foot - potH - R * 1.05, maxY: foot }
      if (taken.some((k) => overlaps(box, k)) || !clearOfFrame(boxRing(box), panel)) continue
      const potTop = foot - potH
      // The leaves meet well inside the rim, so no notch between two of them reaches its top edge.
      b.add(frondRing(pt(cx, potTop + lipH * 0.85), R, PLANT_LEAVES, 0.12, 0.21), 'foliage')
      b.add([pt(cx - potW / 2, potTop + lipH - 2), pt(cx + potW / 2, potTop + lipH - 2), pt(cx + potW * 0.36, foot), pt(cx - potW * 0.36, foot)], 'pot')
      b.add(rect(cx - potW * 0.6, potTop, potW * 1.2, lipH, lipH * 0.25), 'pot')
      taken.push(grow(box, PART_GAP))
      d.plant = true
      break
    }
  }
  d.lamp = false
  if (c.lamp) {
    const shadeW = Math.max(inch(1), W * 0.13)
    const shadeH = shadeW * 0.62
    const baseW = Math.max(inch(0.8), shadeW * 0.75)
    const baseH = inch(0.3)
    for (const [cx, foot] of floorSpots(shadeW / 2)) {
      const tall = Math.min(H * 0.55, foot - ceiling(cx - shadeW / 2, cx + shadeW / 2, foot) - inch(0.1))
      if (tall < shadeH + inch(1.4)) continue
      const top = foot - tall
      const box: Bounds = { minX: cx - shadeW / 2, maxX: cx + shadeW / 2, minY: top, maxY: foot }
      if (taken.some((k) => overlaps(box, k)) || !clearOfFrame(boxRing(box), panel)) continue
      const hemY = top + shadeH
      b.add(rect(cx - BAND_MIN / 2, hemY - 2, BAND_MIN, foot - baseH * 0.5 - hemY + 2), 'wood')
      // A dome base, flat on the floor.
      b.add([...arcRing(cx, foot, baseW / 2, baseH)], 'wood')
      b.add([pt(cx - shadeW * 0.31, top), pt(cx + shadeW * 0.31, top), pt(cx + shadeW / 2, hemY), ...quad(pt(cx + shadeW / 2, hemY), pt(cx, hemY + shadeH * 0.16), pt(cx - shadeW / 2, hemY), 12).slice(1)], 'shade')
      taken.push(grow(box, PART_GAP))
      d.lamp = true
      break
    }
  }
  d.clock = false
  if (c.clock) {
    const R = Math.max(inch(0.62), Math.min(W, H) * 0.075)
    const face = R - BAND_MIN
    const high = pb.minY + FRAME_CLEAR + R + inch(0.12) + (c.frame === 'arch' ? H * 0.06 : 0)
    const heights = [high + H * range(rng, 0.03, 0.08), high, high + H * 0.14].filter((y) => y + R < wallFloor - inch(0.3))
    const clockSpots = heights.flatMap((cy) => spots(R).map((cx) => [cx, cy] as const))
    for (const [cx, cy] of clockSpots) {
      const box: Bounds = { minX: cx - R, maxX: cx + R, minY: cy - R, maxY: cy + R }
      if (taken.some((k) => overlaps(box, k)) || !clearOfFrame(ellipseRing(cx, cy, R, R, 48), panel)) continue
      b.add(ellipseRing(cx, cy, R, R, 72), 'wood')
      b.add(ellipseRing(cx, cy, face, face, 64), 'face')
      // Hands at a gentle hour, and marks at twelve, three, six and nine.
      const hand = (deg: number, len: number) => {
        const a = ((deg - 90) * Math.PI) / 180
        return [pt(cx, cy), pt(cx + len * Math.cos(a), cy + len * Math.sin(a))]
      }
      const hour = rng.int(1, 11)
      const minute = rng.pick([0, 15, 30, 45] as const)
      b.stroke(hand(hour * 30 + minute * 0.5, face * 0.45))
      b.stroke(hand(minute * 6, face * 0.7))
      for (let q = 0; q < 4; q++) {
        const a = (q * Math.PI) / 2
        b.stroke([pt(cx + face * 0.74 * Math.cos(a), cy + face * 0.74 * Math.sin(a)), pt(cx + face * 0.88 * Math.cos(a), cy + face * 0.88 * Math.sin(a))])
      }
      taken.push(grow(box, PART_GAP))
      d.clock = true
      break
    }
  }

  // The table the subject stands on.
  if (tabletop) {
    const cx = tableX
    const tw = tableW
    const front = tableTop + faceDepth
    const inset = faceDepth * 0.35
    const legW = BAND_MIN
    const legX = tw / 2 - legW * 1.2
    for (const s of [-1, 1]) b.add(rect(cx + s * legX - legW / 2, front + apron - 2, legW, legBottom - front - apron + 2), 'wood')
    if (c.table === 'cloth') {
      // A cloth over the top, hanging in shallow scallops in front: short
      // enough that a good length of leg shows below it, or right to the floor.
      const over = inch(0.12)
      const left = cx - tw / 2 - over
      const right = cx + tw / 2 + over
      const scallops = Math.max(3, Math.round((right - left) / inch(0.5)))
      const sw = (right - left) / scallops
      const dip = Math.min(sw * 0.3, inch(0.14))
      const short = Math.min(inch(0.7), legBottom - front - dip - inch(0.4))
      const drop = short >= inch(0.3) ? short : legBottom - front - dip + 4
      const hem: Pt[] = []
      for (let i = scallops - 1; i >= 0; i--) {
        for (let k = i === scallops - 1 ? 0 : 1; k <= 8; k++) {
          const t = (k / 8) * Math.PI
          hem.push(pt(left + sw * (i + 0.5) + (sw / 2) * Math.cos(t), front + drop + dip * Math.sin(t)))
        }
      }
      b.add([pt(left + inset, tableTop), pt(right - inset, tableTop), pt(right, front), ...hem, pt(left, front)], 'cloth')
    } else {
      b.add([pt(cx - tw / 2 + inset, tableTop), pt(cx + tw / 2 - inset, tableTop), pt(cx + tw / 2, front), pt(cx - tw / 2, front)], 'wood')
      b.add(rect(cx - tw / 2, front, tw, apron, [0, 3]), 'wood')
    }
  }
  return placed
}
