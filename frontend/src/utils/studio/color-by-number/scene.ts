import { DPI } from '@/types/canvas-settings.types'
import type { StudioRng } from '../studio-rng'
import {
  arcPoints,
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
import { band, blob, drawingBounds, placeDrawing, rect, type SubjectDrawing } from '../stained-glass/subject-kit'
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
  tree: 'round' | 'pine' | 'bush'
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
}

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
}

const AXES = ['setting', 'frame', 'place', ...Object.keys(EMPTY)] as (keyof CbnComposition)[]

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
  if (parts.length !== AXES.length) return null
  const out: Record<string, unknown> = {}
  AXES.forEach((axis, i) => {
    const raw = parts[i]!
    const sample = axis in EMPTY ? EMPTY[axis as keyof typeof EMPTY] : ''
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
    const drops: ((c: CbnComposition) => void)[] = [
      (c) => (c.boards = false),
      (c) => (c.curtains = false),
      (c) => (c.picture = c.window === 'none' ? c.picture : 'none'),
      (c) => (c.table = c.table === 'cloth' ? 'plain' : c.table),
      (c) => (c.rug = 'none'),
      (c) => (c.wainscot = false),
    ]
    trimToBudget(c, drops, palette, tabletop, budget)
    return canonicalComposition(c)
  }

  const sunny = rng.chance(0.85)
  const low = palette.id === 'golden' && setting !== 'meadow' ? rng.chance(0.5) : palette.id === 'golden' && rng.chance(0.3)
  c.sun = !sunny ? 'none' : low ? 'low' : place === 'left' ? 'right' : place === 'right' ? 'left' : rng.pick(['left', 'right'] as const)
  c.rays = c.sun !== 'none' && c.sun !== 'low' && rng.chance(richness === 0 ? 0.35 : 0.55)
  c.skyBand = paletteHas(palette, 'skyLow') && rng.chance(0.85)
  c.clouds = rng.int(1, (richness === 0 ? 2 : 3) + (big ? 1 : 0))
  if (c.clouds === 0 && c.sun === 'none') c.clouds = 1

  if (setting === 'meadow') {
    c.far = pickWeighted(rng, [
      ['mountains', richness === 0 ? 1 : 2],
      ['ridge', 1.5],
      ['none', 1],
    ])
    c.snow = c.far === 'mountains' && richness > 0 && paletteHas(palette, 'snow') && rng.chance(0.6)
    // A setting sun sits on the horizon; mountains would cut it into slivers.
    if (c.sun === 'low' && c.far === 'mountains') (c.far = 'ridge'), (c.snow = false)
    const side = place === 'left' ? 'right' : place === 'right' ? 'left' : rng.pick(['left', 'right'] as const)
    c.trees = rng.chance(richness === 0 ? 0.55 : 0.8) ? (place === 'center' && richness > 0 && rng.chance(0.5) ? 'both' : side) : 'none'
    c.tree = pickWeighted(rng, [
      ['round', 2],
      ['pine', 1.5],
      ['bush', 1],
    ])
    c.path = !floats(subject) && rng.chance(richness === 0 ? 0.3 : 0.5)
    c.fence = richness > 0 && !floats(subject) && rng.chance(richness === 1 ? 0.3 : 0.5)
    c.fields = paletteHas(palette, 'field') && richness > 0 && rng.chance(richness === 1 ? 0.35 : 0.7)
    const most = (richness === 1 ? 4 : 6) + (big ? 2 : 0)
    c.flowers = richness === 0 ? 0 : rng.chance(richness === 1 ? 0.7 : 0.85) ? rng.int(richness === 1 ? 2 : 3, most) : 0
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
  }

  const drops: ((c: CbnComposition) => void)[] = [
    (c) => (c.snow = false),
    (c) => (c.skyBand = false),
    (c) => (c.fence = false),
    (c) => (c.path = false),
    (c) => (c.flowers = 0),
    (c) => (c.fields = false),
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
  if (!['none', 'left', 'right', 'both'].includes(c.trees) || !['round', 'pine', 'bush'].includes(c.tree)) return false
  if (!['none', 'left', 'right'].includes(c.window) || !['none', 'left', 'right'].includes(c.picture)) return false
  if (c.window !== 'none' && c.window === c.place) return false
  if (!['none', 'oval', 'rect'].includes(c.rug) || !['none', 'plain', 'cloth'].includes(c.table)) return false
  if (!Number.isInteger(c.clouds) || c.clouds < 0 || c.clouds > 4) return false
  if (!Number.isInteger(c.flowers) || c.flowers < 0 || c.flowers > 8) return false
  if (!Number.isInteger(c.waves) || c.waves < 0 || c.waves > 2) return false
  if (!Number.isInteger(c.dunes) || c.dunes < 0 || c.dunes > 2 || (c.dunes > 0 && c.setting !== 'beach')) return false
  if (c.rays && (c.sun === 'none' || c.sun === 'low')) return false
  if (c.sun === 'low' && c.far === 'mountains') return false
  if (c.snow && c.far !== 'mountains') return false
  if (c.setting === 'room') {
    return c.sun === 'none' && c.clouds === 0 && c.far === 'none' && c.trees === 'none' && !c.path && !c.fence && !c.fields && c.flowers === 0 && c.waves === 0 && !c.skyBand
  }
  if (c.window !== 'none' || c.curtains || c.picture !== 'none' || c.wainscot || c.boards || c.rug !== 'none' || c.table !== 'none') return false
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

/**
 * A five-petalled flower head: full, rounded petals round a centre of about a
 * third its size, so every petal and the centre each hold a number.
 */
function flowerRing(cx: number, cy: number, r: number, turn: number): Ring {
  return blob(
    ...Array.from({ length: 5 }, (_, i) => {
      const a = i * 72 - 90 + turn
      const at = (deg: number, rr: number) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)] as const
      return [at(a - 28, r * 0.8), at(a - 13, r * 0.98), at(a + 13, r * 0.98), at(a + 28, r * 0.8), at(a + 36, r * 0.72)]
    }).flat(),
  )
}

/**
 * A puffy cloud `w` wide sitting on `y`: the outline of a row of overlapping
 * puffs, tallest in the middle, over a softly rounded base. Traced round a
 * point inside every puff, so it is one clean closed shape.
 */
function cloudRing(cx: number, y: number, w: number, rng: StudioRng): Ring {
  const puffs = rng.int(3, 4)
  const circles = Array.from({ length: puffs }, (_, i) => {
    const t = puffs === 1 ? 0.5 : i / (puffs - 1)
    const r = w * (0.17 + 0.1 * Math.sin(Math.PI * t) + (rng.next() - 0.5) * 0.03)
    return { x: cx - w * 0.5 + r + (w - 2 * r) * t, y: y - r * 0.95, r }
  })
  const o = pt(cx, y - w * 0.13)
  const out: Pt[] = []
  const steps = 96
  for (let i = 0; i < steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI * 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let reach = 0
    for (const c of circles) {
      const ox = c.x - o.x
      const oy = c.y - o.y
      const along = ox * dx + oy * dy
      const disc = along * along - (ox * ox + oy * oy) + c.r * c.r
      if (disc >= 0) reach = Math.max(reach, along + Math.sqrt(disc))
    }
    // The base: flattened, with softly rounded ends.
    const p = pt(o.x + dx * reach, Math.min(o.y + dy * reach, y))
    out.push(p)
  }
  return out
}

interface Builder {
  layers: CbnLayer[]
  add(ring: Ring, role: CbnRole, removable?: boolean): void
}

function builder(): Builder {
  const layers: CbnLayer[] = []
  return {
    layers,
    add(ring, role, removable = false) {
      layers.push({ ring, unit: role, role, subject: false, ...(removable ? { removable: true } : {}) })
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
  const strokes = built.drawing.strokes.map((s) => ({ pts: s.pts, layer: subjectStart + s.under - 1 }))
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
        const turn = rng.next() * 45
        for (let i = 0; i < 8; i++) {
          const a = ((turn + i * 45) * Math.PI) / 180
          const d = r + inch(0.3)
          b.add(ellipseRing(cx + d * Math.cos(a), cy + d * Math.sin(a), inch(0.17), inch(0.12), 32, (a * 180) / Math.PI), 'sun')
        }
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
    const pts: Pt[] = []
    peakList.forEach((peak, i) => pts.push(valleys[i]!, peak))
    pts.push(valleys[valleys.length - 1]!, pt(pb.maxX + 40, baseY), pt(pb.minX - 40, baseY))
    b.add(pts, 'mountain', true)
    const peakPts = peakList.map((peak, i) => ({ peak, left: valleys[i]!, right: valleys[i + 1]! }))
    if (c.snow) {
      d.snow = false
      for (const { peak, left, right } of peakPts) {
        const depth = Math.min(right.y, left.y) - peak.y
        if (depth < inch(1)) continue
        d.snow = true
        const f = Math.min(0.42, inch(0.62) / depth)
        const L = pt(peak.x + (left.x - peak.x) * f, peak.y + (left.y - peak.y) * f)
        const R = pt(peak.x + (right.x - peak.x) * f, peak.y + (right.y - peak.y) * f)
        const dip = depth * f * 0.28
        const at = (t: number, down: number) => pt(R.x + (L.x - R.x) * t, R.y + (L.y - R.y) * t + down)
        b.add([peak, R, at(0.25, dip), at(0.5, -dip * 0.2), at(0.75, dip), L], 'snow', true)
      }
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
  }

  // Trees (or a bush) beside the subject, standing on the near hill. Placed
  // now, so the fence leaves them room, but drawn after it: they stand in front.
  const treeParts: { ring: Ring; role: CbnRole }[] = []
  const treeSides: ('left' | 'right')[] = []
  if (c.setting === 'meadow' && c.trees !== 'none') {
    const sides = c.trees === 'both' ? (['left', 'right'] as const) : ([c.trees] as const)
    for (const side of sides) {
      const room = side === 'left' ? sb.minX - PART_GAP - (pb.minX + FRAME_CLEAR) : pb.maxX - FRAME_CLEAR - (sb.maxX + PART_GAP)
      const ratio = c.tree === 'bush' ? 0.95 : c.tree === 'pine' ? 0.6 : 0.7
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
    const midX = (topX + bottomX) / 2 + (rng.chance(0.5) ? -1 : 1) * W * range(rng, 0.06, 0.12)
    const line = smoothLine([pt(bottomX, pb.maxY + 30), pt(midX, (pb.maxY + topY) / 2), pt(topX, topY)])
    const ring = taper(line, Math.max(W * 0.24, inch(1)), Math.max(W * 0.08, inch(0.4)))
    pathRing = ring
    b.add(ring, 'path')
  }

  // Flowers in the foreground grass.
  if (c.flowers > 0) {
    const r = Math.max(inch(0.38), Math.min(W, H) * 0.05)
    const placed: Pt[] = []
    const path = pathRing ? toRegion(pathRing) : null
    for (let tries = 0; tries < 160 && placed.length < c.flowers; tries++) {
      const p = pt(range(rng, pb.minX + r, pb.maxX - r), range(rng, groundAt(pb.minX) + H * 0.06 + r, pb.maxY - r))
      if (p.y - r < groundAt(p.x) + inch(0.2)) continue
      const fb: Bounds = { minX: p.x - r, maxX: p.x + r, minY: p.y - r, maxY: p.y + r }
      if (keepOut.some((k) => overlaps(fb, k))) continue
      if (placed.some((q) => dist(p, q) < r * 2 + PART_GAP)) continue
      const ring = flowerRing(p.x, p.y, r, rng.next() * 72)
      if (!clearOfFrame(ring, panel)) continue
      if (path && (inRegion(p, path) || distToRing(p, path.ring) < r + PART_GAP)) continue
      placed.push(p)
    }
    d.flowers = placed.length
    for (const p of placed) {
      b.add(flowerRing(p.x, p.y, r, rng.next() * 72), 'petal')
      b.add(ellipseRing(p.x, p.y, r * 0.4, r * 0.4, 28), 'flowerCenter')
    }
  }

  // Clouds in the open sky.
  if (c.clouds > 0) {
    const skyFloor = horizon - (c.far === 'mountains' ? H * 0.22 : c.far === 'ridge' ? H * 0.12 : H * 0.06)
    const boxes: Bounds[] = []
    for (let tries = 0; tries < 120 && boxes.length < c.clouds; tries++) {
      const w = Math.max(inch(1), W * range(rng, 0.2, 0.3))
      const y = range(rng, pb.minY + FRAME_CLEAR + w * 0.5, skyFloor - w * 0.1)
      const x = range(rng, pb.minX + w / 2, pb.maxX - w / 2)
      const cb: Bounds = { minX: x - w / 2, maxX: x + w / 2, minY: y - w * 0.52, maxY: y + w * 0.06 }
      if (cb.maxY > skyFloor) continue
      if ([...keepOut, ...boxes.map((q) => grow(q, PART_GAP))].some((k) => overlaps(cb, k))) continue
      if (sunBox && overlaps(cb, grow(sunBox, PART_GAP))) continue
      const ring = cloudRing(x, y, w, rng)
      if (!clearOfFrame(ring, panel)) continue
      boxes.push(ringBounds(ring))
      b.add(ring, 'cloud')
    }
    d.clouds = boxes.length
  }
  return placed
}

function treeRings(kind: CbnComposition['tree'], cx: number, foot: number, h: number, w: number, rng: StudioRng): { ring: Ring; role: CbnRole }[] {
  const trunkW = Math.max(BAND_MIN, w * 0.16)
  if (kind === 'bush') {
    const bh = h * 0.55
    const pts: [number, number][] = [
      [cx + w * 0.5, foot],
      [cx + w * 0.46, foot - bh * 0.55],
      [cx + w * 0.22, foot - bh * 0.95],
      [cx - w * 0.05, foot - bh],
      [cx - w * 0.3, foot - bh * 0.85],
      [cx - w * 0.5, foot - bh * 0.4],
      [cx - w * 0.44, foot + bh * 0.06],
      [cx, foot + bh * 0.1],
    ]
    return [{ ring: blob(...pts), role: 'foliage' }]
  }
  if (kind === 'pine') {
    // At least a third of an inch of trunk shows under the lowest boughs.
    const trunkH = Math.max(h * 0.2, inch(0.34) / 0.6)
    const tiers = 3
    const top = foot - h
    const bottom = foot - trunkH * 0.6
    const right: Pt[] = []
    for (let i = 0; i < tiers; i++) {
      const y0 = top + ((bottom - top) * i) / tiers
      const y1 = top + ((bottom - top) * (i + 1)) / tiers
      const half = (w / 2) * ((i + 1) / tiers)
      if (i > 0) right.push(pt(cx + half * 0.5, y0 + (y1 - y0) * 0.08))
      right.push(pt(cx + half, y1))
    }
    const left = right.map((p) => pt(2 * cx - p.x, p.y)).reverse()
    return [
      { ring: rect(cx - trunkW / 2, foot - trunkH * 1.4, trunkW, trunkH * 1.4), role: 'trunk' },
      { ring: [pt(cx, top), ...right, ...left], role: 'foliage' },
    ]
  }
  const crownR = w / 2
  const crownCy = foot - h + crownR
  const bumps = 8
  const turn = rng.next()
  const crown = blob(
    ...Array.from({ length: bumps }, (_, i) => {
      const a = ((i + turn) / bumps) * Math.PI * 2
      const rr = crownR * (i % 2 === 0 ? 1 : 0.9)
      return [cx + rr * Math.cos(a), crownCy + rr * 0.92 * Math.sin(a)] as [number, number]
    }),
  )
  return [
    { ring: rect(cx - trunkW / 2, crownCy, trunkW, foot - crownCy), role: 'trunk' },
    { ring: crown, role: 'foliage' },
  ]
}

/** A thick line whose width runs from w0 at its start to w1 at its end, with a rounded far end. */
function taper(line: readonly Pt[], w0: number, w1: number): Ring {
  const n = line.length
  const lengths = [0]
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1]! + dist(line[i]!, line[i - 1]!))
  const total = lengths[n - 1] || 1
  const side = (sign: number) =>
    line.map((p, i) => {
      const a = line[Math.max(0, i - 1)]!
      const q = line[Math.min(n - 1, i + 1)]!
      const len = dist(a, q) || 1
      const half = (w0 + ((w1 - w0) * lengths[i]!) / total) / 2
      return pt(p.x - (sign * (q.y - a.y) * half) / len, p.y + (sign * (q.x - a.x) * half) / len)
    })
  const end = line[n - 1]!
  const prev = line[n - 2]!
  const heading = (Math.atan2(end.y - prev.y, end.x - prev.x) * 180) / Math.PI
  const cap = arcPoints(end.x, end.y, w1 / 2, heading + 90, heading - 90, 10).slice(1, -1)
  return [...side(1), ...cap, ...side(-1).reverse()]
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
      }
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
