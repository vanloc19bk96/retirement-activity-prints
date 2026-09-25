/**
 * The colors a Color by Number page asks for, and which space gets which.
 *
 * **Named pencil colors.** Every key entry is a plain color name found in an
 * ordinary 24-pencil set ("Light Blue", "Dark Green", "Tan") — never a shade
 * code, a hex value or a fancy name like "Cerulean". The interior of a KDP
 * paperback is usually printed in black ink, so the name is the key: the page
 * never relies on a printed swatch to say which color is meant. `hex` is only
 * used when the seller opts into filled swatches for a color-printed book.
 *
 * **Roles, not colors.** A scene is built from parts with a meaning — sky,
 * sun, far hill, curtain, rug — and a palette says which named colors suit
 * each part, best first. A space's color is its part's color, so the sky is
 * blue and the grass is green on every page; what changes from page to page
 * is the mood (a summer day, golden hour, spring, autumn, a cozy room...).
 *
 * **The drawing.** The subject in the middle of the scene (a teapot, a
 * motorhome) is drawn as a stack of closed pieces with no names, so its
 * pieces are colored by rule instead: the biggest piece takes the subject's
 * natural first color (a sunflower's yellow, a pie's tan), and every other
 * piece takes the first color on its list that no touching piece already
 * has, so neighbouring pieces always read apart.
 *
 * **Six to eight keys.** The page then settles the count: a color used by the
 * fewest spaces is folded into a neighbour-safe color already on the key
 * while there are more than eight, and a piece that shares its color takes a
 * fresh one while there are fewer than six. If neither can be done without
 * two touching spaces sharing a color, the design is refused and another
 * dealt — the key is never padded with an unused color or cut short.
 */

export type CbnColorId =
  | 'yellow'
  | 'gold'
  | 'orange'
  | 'peach'
  | 'red'
  | 'pink'
  | 'purple'
  | 'lavender'
  | 'lightBlue'
  | 'blue'
  | 'darkBlue'
  | 'turquoise'
  | 'lightGreen'
  | 'green'
  | 'darkGreen'
  | 'tan'
  | 'brown'
  | 'lightGray'
  | 'gray'

export interface CbnColor {
  id: CbnColorId
  /** What the key prints: short, plain, the name on a pencil. */
  name: string
  /** Swatch fill for color-printed books only. */
  hex: string
}

/** Pencil-box order: the key lists its colors in this order, so light blue sits by blue. */
export const CBN_COLORS: readonly CbnColor[] = [
  { id: 'yellow', name: 'Yellow', hex: '#F7D842' },
  { id: 'gold', name: 'Gold', hex: '#E0A526' },
  { id: 'orange', name: 'Orange', hex: '#F08A24' },
  { id: 'peach', name: 'Peach', hex: '#F7C29B' },
  { id: 'red', name: 'Red', hex: '#D62F3A' },
  { id: 'pink', name: 'Pink', hex: '#F29BC0' },
  { id: 'purple', name: 'Purple', hex: '#7D55B8' },
  { id: 'lavender', name: 'Lavender', hex: '#C6B3E3' },
  { id: 'lightBlue', name: 'Light Blue', hex: '#9CD3F2' },
  { id: 'blue', name: 'Blue', hex: '#2E78D6' },
  { id: 'darkBlue', name: 'Dark Blue', hex: '#1F3A8A' },
  { id: 'turquoise', name: 'Turquoise', hex: '#2BB9AE' },
  { id: 'lightGreen', name: 'Light Green', hex: '#A6D86A' },
  { id: 'green', name: 'Green', hex: '#3E9B47' },
  { id: 'darkGreen', name: 'Dark Green', hex: '#1E5C2A' },
  { id: 'tan', name: 'Tan', hex: '#D4B48A' },
  { id: 'brown', name: 'Brown', hex: '#8A5A2E' },
  { id: 'lightGray', name: 'Light Gray', hex: '#D0D0D0' },
  { id: 'gray', name: 'Gray', hex: '#8C8C8C' },
]

const COLOR_INDEX = new Map(CBN_COLORS.map((c, i) => [c.id, i]))
export const cbnColor = (id: CbnColorId): CbnColor => CBN_COLORS[COLOR_INDEX.get(id)!]!
export const isCbnColorId = (id: string): id is CbnColorId => COLOR_INDEX.has(id as CbnColorId)

/** The key never lists fewer or more colors than this. */
export const CBN_MIN_COLORS = 6
export const CBN_MAX_COLORS = 8

/* ------------------------------------------------------------------ *
 * Roles and palettes
 * ------------------------------------------------------------------ */

/** What a part of the scene is. The subject's own pieces are colored by rule (see above). */
export type CbnRole =
  | 'sky'
  | 'skyLow'
  | 'sun'
  | 'cloud'
  | 'mountain'
  | 'snow'
  | 'hillFar'
  | 'hillNear'
  | 'foliage'
  | 'trunk'
  | 'path'
  | 'fence'
  | 'field'
  | 'petal'
  | 'flowerCenter'
  | 'water'
  | 'waterLight'
  | 'sand'
  | 'dune'
  | 'wall'
  | 'wallLow'
  | 'trim'
  | 'floor'
  | 'floorAlt'
  | 'rug'
  | 'rugBorder'
  | 'curtain'
  | 'wood'
  | 'cloth'

export type CbnMoodSetting = 'outdoor' | 'indoor'

export interface CbnPalette {
  id: string
  setting: CbnMoodSetting
  /** Named colors that suit each role, best first. A role a palette leaves out is not drawn under it. */
  roles: Partial<Record<CbnRole, readonly CbnColorId[]>>
  /** Colors the subject's pieces lean on, best first, after the subject's own. */
  accents: readonly CbnColorId[]
}

/**
 * Moods. Outdoor moods serve every outdoor scene (meadow, shore, beach);
 * indoor moods serve the room. Each is a believable light: sunsets give a
 * lavender sky with a peach glow at the horizon and pink clouds, autumn turns
 * the trees orange, spring puts blossom on them.
 */
export const CBN_PALETTES: readonly CbnPalette[] = [
  {
    id: 'summer',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue'],
      sun: ['yellow', 'gold'],
      cloud: ['lightGray', 'lavender'],
      mountain: ['lavender', 'gray'],
      snow: ['lightGray'],
      hillFar: ['green', 'darkGreen'],
      hillNear: ['lightGreen', 'green'],
      foliage: ['darkGreen', 'green'],
      trunk: ['brown'],
      path: ['tan', 'peach'],
      fence: ['brown', 'tan'],
      field: ['gold', 'lightGreen', 'tan'],
      petal: ['red', 'pink', 'purple'],
      flowerCenter: ['yellow', 'orange'],
      water: ['blue'],
      waterLight: ['turquoise', 'lightBlue'],
      sand: ['tan', 'peach'],
      dune: ['peach', 'gold'],
    },
    accents: ['red', 'blue', 'orange', 'tan', 'brown'],
  },
  {
    id: 'golden',
    setting: 'outdoor',
    roles: {
      sky: ['lavender'],
      skyLow: ['peach', 'orange'],
      sun: ['yellow', 'orange'],
      cloud: ['pink', 'peach'],
      mountain: ['purple'],
      snow: ['pink', 'lavender'],
      hillFar: ['green', 'darkGreen'],
      hillNear: ['lightGreen', 'green'],
      foliage: ['darkGreen', 'green'],
      trunk: ['brown'],
      path: ['tan', 'peach'],
      fence: ['brown'],
      field: ['gold', 'orange'],
      petal: ['pink', 'red'],
      flowerCenter: ['yellow', 'orange'],
      water: ['blue', 'darkBlue'],
      waterLight: ['turquoise', 'lavender'],
      sand: ['tan', 'peach'],
      dune: ['peach', 'orange'],
    },
    accents: ['red', 'blue', 'brown', 'yellow', 'orange'],
  },
  {
    id: 'spring',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue'],
      sun: ['yellow'],
      cloud: ['lavender', 'lightGray'],
      mountain: ['lavender', 'purple'],
      snow: ['lightGray'],
      hillFar: ['lightGreen', 'green'],
      hillNear: ['green', 'lightGreen'],
      foliage: ['pink', 'darkGreen'],
      trunk: ['brown'],
      path: ['tan'],
      fence: ['tan', 'brown'],
      field: ['lightGreen', 'yellow'],
      petal: ['purple', 'pink', 'red'],
      flowerCenter: ['yellow'],
      water: ['blue'],
      waterLight: ['turquoise'],
      sand: ['tan', 'peach'],
      dune: ['peach', 'yellow'],
    },
    accents: ['pink', 'purple', 'yellow', 'blue', 'orange'],
  },
  {
    id: 'autumn',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue'],
      sun: ['yellow', 'gold'],
      cloud: ['lightGray'],
      mountain: ['lavender', 'gray'],
      snow: ['lightGray'],
      hillFar: ['green', 'darkGreen'],
      hillNear: ['gold', 'tan'],
      foliage: ['orange', 'red'],
      trunk: ['brown'],
      path: ['tan', 'brown'],
      fence: ['brown'],
      field: ['orange', 'tan', 'gold'],
      petal: ['red', 'orange'],
      flowerCenter: ['yellow'],
      water: ['blue'],
      waterLight: ['turquoise'],
      sand: ['tan', 'peach'],
      dune: ['peach', 'gold'],
    },
    accents: ['red', 'brown', 'darkGreen', 'orange', 'blue'],
  },
  {
    id: 'seaside',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue'],
      sun: ['yellow'],
      cloud: ['lightGray', 'lavender'],
      mountain: ['lavender'],
      snow: ['lightGray'],
      hillFar: ['green'],
      hillNear: ['lightGreen', 'green'],
      foliage: ['darkGreen', 'green'],
      trunk: ['brown'],
      path: ['peach', 'tan'],
      fence: ['tan', 'brown'],
      field: ['gold', 'lightGreen'],
      petal: ['pink', 'red'],
      flowerCenter: ['yellow'],
      water: ['blue', 'darkBlue'],
      waterLight: ['turquoise', 'lightBlue'],
      sand: ['tan', 'peach'],
      dune: ['peach', 'gold'],
    },
    accents: ['red', 'orange', 'darkBlue', 'yellow', 'tan'],
  },
  {
    id: 'cozy',
    setting: 'indoor',
    roles: {
      wall: ['peach'],
      wallLow: ['tan', 'brown'],
      trim: ['brown', 'tan'],
      floor: ['tan'],
      floorAlt: ['brown'],
      rug: ['red', 'blue'],
      rugBorder: ['gold', 'yellow'],
      sky: ['lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['green', 'darkGreen'],
      wood: ['brown', 'tan'],
      cloth: ['yellow', 'lightBlue'],
    },
    accents: ['blue', 'red', 'yellow', 'green', 'orange'],
  },
  {
    id: 'sage',
    setting: 'indoor',
    roles: {
      wall: ['lightGreen'],
      wallLow: ['green'],
      trim: ['tan', 'brown'],
      floor: ['brown'],
      floorAlt: ['tan'],
      rug: ['purple', 'blue'],
      rugBorder: ['lavender', 'pink'],
      sky: ['lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['pink', 'yellow'],
      wood: ['brown', 'tan'],
      cloth: ['pink', 'lavender'],
    },
    accents: ['pink', 'purple', 'orange', 'blue', 'yellow'],
  },
  {
    id: 'coastal',
    setting: 'indoor',
    roles: {
      wall: ['lightBlue'],
      wallLow: ['blue'],
      trim: ['tan', 'lightGray'],
      floor: ['tan'],
      floorAlt: ['brown'],
      rug: ['darkBlue', 'turquoise'],
      rugBorder: ['yellow', 'peach'],
      sky: ['turquoise', 'lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['yellow', 'peach'],
      wood: ['brown', 'tan'],
      cloth: ['yellow', 'peach'],
    },
    accents: ['red', 'orange', 'yellow', 'darkBlue', 'turquoise'],
  },
  {
    id: 'lavender',
    setting: 'indoor',
    roles: {
      wall: ['lavender'],
      wallLow: ['purple'],
      trim: ['tan', 'gray'],
      floor: ['brown'],
      floorAlt: ['tan'],
      rug: ['pink', 'blue'],
      rugBorder: ['purple', 'darkBlue'],
      sky: ['lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['pink', 'darkGreen'],
      wood: ['brown', 'tan'],
      cloth: ['pink', 'yellow'],
    },
    accents: ['pink', 'green', 'yellow', 'blue', 'orange'],
  },
]

const PALETTE_INDEX = new Map(CBN_PALETTES.map((p) => [p.id, p]))
export const cbnPaletteById = (id: string) => PALETTE_INDEX.get(id)
export const cbnPalettesFor = (setting: CbnMoodSetting) => CBN_PALETTES.filter((p) => p.setting === setting)

/** True when the palette colors this role (so the scene may draw it). */
export const paletteHas = (palette: CbnPalette, role: CbnRole) => (palette.roles[role]?.length ?? 0) > 0

/**
 * Believable second choices for each role, whatever the mood: when every
 * color a mood offers a part is taken by something it touches (a brown table
 * on a brown floor), the part takes one of these rather than share a number
 * with its neighbour — wood stays a wood tone, grass a green, water a blue.
 */
const ROLE_FAMILIES: Readonly<Record<CbnRole, readonly CbnColorId[]>> = {
  sky: ['lightBlue', 'lavender', 'peach', 'lightGray'],
  skyLow: ['peach', 'orange', 'pink', 'yellow'],
  sun: ['yellow', 'gold', 'orange'],
  cloud: ['lightGray', 'lavender', 'pink', 'peach', 'lightBlue'],
  mountain: ['lavender', 'purple', 'gray', 'blue'],
  snow: ['lightGray', 'lavender', 'pink', 'lightBlue'],
  hillFar: ['green', 'lightGreen', 'darkGreen', 'gold', 'tan'],
  hillNear: ['lightGreen', 'green', 'darkGreen', 'gold', 'tan'],
  field: ['gold', 'lightGreen', 'yellow', 'tan', 'orange', 'green'],
  foliage: ['darkGreen', 'green', 'lightGreen', 'orange', 'red'],
  trunk: ['brown', 'tan', 'gray'],
  path: ['tan', 'peach', 'gray', 'brown', 'gold'],
  fence: ['brown', 'tan', 'gray', 'lightGray', 'red'],
  petal: ['red', 'pink', 'purple', 'orange', 'yellow', 'lavender'],
  flowerCenter: ['yellow', 'orange', 'gold', 'brown'],
  water: ['blue', 'darkBlue', 'turquoise', 'lightBlue'],
  waterLight: ['turquoise', 'lightBlue', 'blue', 'lavender'],
  sand: ['tan', 'peach', 'gold', 'yellow'],
  dune: ['peach', 'gold', 'tan', 'yellow'],
  wall: ['peach', 'lightGreen', 'lightBlue', 'lavender', 'yellow', 'tan'],
  wallLow: ['tan', 'green', 'blue', 'purple', 'brown', 'peach'],
  trim: ['brown', 'tan', 'lightGray', 'gray', 'gold'],
  floor: ['tan', 'brown', 'gold', 'peach', 'gray'],
  floorAlt: ['brown', 'tan', 'gold', 'orange', 'gray'],
  rug: ['red', 'blue', 'purple', 'green', 'gold', 'pink', 'darkBlue'],
  rugBorder: ['gold', 'yellow', 'lavender', 'pink', 'orange', 'turquoise'],
  curtain: ['green', 'pink', 'yellow', 'blue', 'red', 'purple'],
  wood: ['brown', 'tan', 'gold', 'orange', 'gray'],
  cloth: ['yellow', 'pink', 'lightBlue', 'lavender', 'red', 'turquoise'],
}

/** Every color a role may take under this palette: the mood's own first, then its family. */
export const roleChoices = (palette: CbnPalette, role: CbnRole): CbnColorId[] => [...new Set([...(palette.roles[role] ?? []), ...ROLE_FAMILIES[role]])]

/**
 * A subject's natural colors, best first: its biggest piece takes the first
 * one a neighbour does not already have. Subjects not listed lean on the
 * mood's accents alone.
 */
export const CBN_SUBJECT_HUES: Readonly<Record<string, readonly CbnColorId[]>> = {
  'rocking-chair': ['brown', 'tan', 'red'],
  'coffee-mug': ['red', 'lightGray', 'blue'],
  teacup: ['pink', 'lightBlue', 'yellow'],
  teapot: ['blue', 'yellow', 'pink'],
  'book-and-glasses': ['red', 'lightGray', 'brown'],
  houseplant: ['green', 'orange', 'darkGreen'],
  'yarn-basket': ['tan', 'purple', 'red'],
  'sleeping-cat': ['orange', 'peach', 'pink'],
  'vintage-radio': ['brown', 'tan', 'gold'],
  'fresh-pie': ['tan', 'brown', 'red'],
  sailboat: ['lightGray', 'red', 'brown'],
  motorhome: ['lightGray', 'blue', 'gray'],
  'camper-trailer': ['lightGray', 'turquoise', 'gray'],
  suitcase: ['brown', 'tan', 'red'],
  'cruise-ship': ['lightGray', 'blue', 'red'],
  'hot-air-balloon': ['red', 'yellow', 'blue'],
  'beach-chair': ['red', 'blue', 'yellow'],
  lighthouse: ['gray', 'red', 'lightGray'],
  'steam-train': ['red', 'darkBlue', 'gray'],
  'watering-can': ['green', 'blue', 'gray'],
  'flower-pot': ['orange', 'pink', 'green'],
  birdhouse: ['red', 'brown', 'tan'],
  'garden-tools': ['brown', 'gray', 'red'],
  wheelbarrow: ['red', 'brown', 'gray'],
  sunflower: ['yellow', 'brown', 'green'],
  butterfly: ['orange', 'purple', 'yellow'],
  songbird: ['blue', 'orange', 'brown'],
  'picnic-basket': ['tan', 'red', 'brown'],
  fishing: ['brown', 'orange', 'gray'],
  'golf-bag': ['darkGreen', 'tan', 'lightGray'],
  bicycle: ['blue', 'gray', 'tan'],
  'acoustic-guitar': ['tan', 'brown', 'orange'],
  'paint-palette': ['tan', 'red', 'blue'],
  'vintage-camera': ['gray', 'brown', 'lightGray'],
  gramophone: ['gold', 'brown', 'red'],
  binoculars: ['gray', 'darkGreen', 'lightGray'],
}

/**
 * Piece hints for the few subjects whose parts have an obvious color the
 * size rule cannot see: steam and smoke are pale, leaves and stems green, a
 * sunflower's petals golden round a brown disk. A subject's drawing adds its
 * pieces in a fixed order that its knobs decide (a mug's steam curls first,
 * one to three of them), so each hint reads the piece's place in that order.
 * A hint only puts its colors first; neighbours still never share one.
 */
export type CbnPieceHint = (index: number, count: number, knobs: Readonly<Record<string, number>>) => readonly CbnColorId[] | undefined

const STEAM: readonly CbnColorId[] = ['lightGray', 'lavender', 'lightBlue']
const LEAF: readonly CbnColorId[] = ['green', 'darkGreen', 'lightGreen']
const PETAL: readonly CbnColorId[] = ['pink', 'red', 'purple', 'orange', 'yellow']

/** Pieces a daisy (six petals, then its centre) and a tulip (three petals) add, in the potted-flowers drawing. */
function flowerPotHint(index: number, count: number, knobs: Readonly<Record<string, number>>): readonly CbnColorId[] | undefined {
  // Two stems, then two leaves.
  if (index < 4) return LEAF
  // The pot, then its rim, close the drawing.
  if (index === count - 2) return ['orange', 'red', 'brown']
  if (index === count - 1) return ['orange', 'red', 'tan']
  const heads = knobs.bloom === 0 ? ['tulip', 'tulip'] : knobs.bloom === 1 ? ['daisy', 'daisy'] : ['daisy', 'tulip']
  let at = 4
  for (const head of heads) {
    const size = head === 'daisy' ? 7 : 3
    if (index < at + size) return head === 'daisy' && index === at + 6 ? ['yellow', 'orange', 'gold'] : PETAL
    at += size
  }
  return undefined
}

export const CBN_PIECE_HINTS: Readonly<Record<string, CbnPieceHint>> = {
  'coffee-mug': (i, _n, k) => (i < (k.steam ?? 0) + 1 ? STEAM : undefined),
  teacup: (i, _n, k) => (i < (k.steam ?? 0) ? STEAM : undefined),
  'fresh-pie': (i, _n, k) => (i < [0, 2, 3][k.steam ?? 0]! ? STEAM : undefined),
  'steam-train': (i, _n, k) => (i >= 1 && i <= (k.smoke === 1 ? 3 : 2) ? STEAM : undefined),
  sunflower: (i, _n, k) => {
    const petals = k.petals === 1 ? 10 : 13
    if (i < 3) return LEAF
    if (i < 3 + petals) return ['yellow', 'gold', 'orange']
    return i === 3 + petals ? ['brown', 'orange'] : ['orange', 'gold', 'brown']
  },
  'flower-pot': flowerPotHint,
}

/* ------------------------------------------------------------------ *
 * Coloring the page
 * ------------------------------------------------------------------ */

/**
 * One thing that takes one color: a scene role (every layer of that role
 * shares it) or one piece of the subject.
 */
export interface CbnUnit {
  id: string
  /** Set for scene units. */
  role?: CbnRole
  /** Paper the unit's spaces cover, canvas px² — bigger units choose first. */
  area: number
  /** Spaces the unit holds on the page. */
  spaces: number
}

export interface CbnColoring {
  /** Unit id → color. */
  colors: Map<string, CbnColorId>
  /** The key, in pencil-box order: number n is `legend[n - 1]`. */
  legend: CbnColorId[]
}

export type CbnColoringResult = { ok: true; coloring: CbnColoring } | { ok: false; reason: string }

const order = (id: CbnColorId) => COLOR_INDEX.get(id)!

/**
 * Give every unit a color: scene roles from the palette, subject pieces by
 * rule, then settle the key at six to eight colors with no two touching
 * units sharing one. Deterministic: ties go by area, then by id.
 */
export function colorUnits(options: {
  units: readonly CbnUnit[]
  /** Pairs of unit ids that share an edge on the page. */
  touching: ReadonlyMap<string, ReadonlySet<string>>
  palette: CbnPalette
  subjectId: string
  /** Preferred colors for subject piece `s<index>`, ahead of the subject's own (see `CBN_PIECE_HINTS`). */
  pieceHint?: (index: number) => readonly CbnColorId[] | undefined
  min?: number
  max?: number
}): CbnColoringResult {
  const { units, touching, palette, subjectId, pieceHint, min = CBN_MIN_COLORS, max = CBN_MAX_COLORS } = options
  const colors = new Map<string, CbnColorId>()
  const neighbours = (id: string) => touching.get(id) ?? new Set<string>()
  const clash = (id: string, color: CbnColorId) => [...neighbours(id)].some((n) => colors.get(n) === color)
  const byArea = [...units].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1))
  const everyColor = CBN_COLORS.map((c) => c.id)

  // Scene first: every role takes its first color no neighbour has — the
  // mood's own choices, then its family's.
  for (const unit of byArea) {
    if (!unit.role) continue
    if (!paletteHas(palette, unit.role)) return { ok: false, reason: `The mood has no color for the ${unit.role}.` }
    const pick = roleChoices(palette, unit.role).find((c) => !clash(unit.id, c))
    if (!pick) return { ok: false, reason: `Every color for the ${unit.role} is taken by something it touches.` }
    colors.set(unit.id, pick)
  }
  // Then the subject, biggest piece first, in its own colors.
  const hues = CBN_SUBJECT_HUES[subjectId] ?? []
  const subjectList = [...new Set<CbnColorId>([...hues, ...palette.accents])]
  const hintOf = (unit: CbnUnit) => (pieceHint && !unit.role ? pieceHint(Number(unit.id.slice(1))) : undefined)
  const prefer = (unit: CbnUnit): CbnColorId[] => [...new Set<CbnColorId>([...(hintOf(unit) ?? []), ...subjectList])]
  for (const unit of byArea) {
    if (unit.role) continue
    const used = new Set(colors.values())
    const pick =
      prefer(unit).find((c) => !clash(unit.id, c)) ??
      [...used].find((c) => !clash(unit.id, c)) ??
      everyColor.find((c) => !clash(unit.id, c))
    if (!pick) return { ok: false, reason: 'A piece of the drawing has no color its neighbours do not share.' }
    colors.set(unit.id, pick)
  }

  const spacesOf = (color: CbnColorId) => units.filter((u) => colors.get(u.id) === color).reduce((s, u) => s + u.area, 0)
  const distinct = () => [...new Set(colors.values())]
  // A role may only move to another color the palette offers it; a subject piece to any color.
  const choicesFor = (unit: CbnUnit): readonly CbnColorId[] => (unit.role ? roleChoices(palette, unit.role) : everyColor)

  // Too many colors: fold the least-used color into ones already on the key.
  for (let guard = 0; distinct().length > max && guard < 32; guard++) {
    const onKey = distinct()
    const candidates = [...onKey].sort((a, b) => spacesOf(a) - spacesOf(b))
    let folded = false
    for (const color of candidates) {
      const holders = units.filter((u) => colors.get(u.id) === color)
      const keep = onKey.filter((c) => c !== color)
      const plan = new Map<string, CbnColorId>()
      const ok = holders.every((u) => {
        const target = [...(u.role ? choicesFor(u) : prefer(u)), ...keep].find(
          (c) => keep.includes(c) && choicesFor(u).includes(c) && ![...neighbours(u.id)].some((n) => (plan.get(n) ?? colors.get(n)) === c),
        )
        if (target) plan.set(u.id, target)
        return Boolean(target)
      })
      if (!ok) continue
      for (const [id, c] of plan) colors.set(id, c)
      folded = true
      break
    }
    if (!folded) return { ok: false, reason: 'The scene needs more colors than the key can hold.' }
  }

  // Too few: a subject piece sharing its color takes a fresh one; failing
  // that, a scene role sharing its color takes its palette's next choice.
  for (let guard = 0; distinct().length < min && guard < 32; guard++) {
    const onKey = new Set(distinct())
    const count = (c: CbnColorId) => units.filter((u) => colors.get(u.id) === c).length
    const shared = byArea.filter((u) => count(colors.get(u.id)!) > 1)
    // Unhinted pieces first: a hinted one (a leaf, a puff of steam) keeps its natural color if it can.
    const movable = [...shared.filter((u) => !u.role && !hintOf(u)), ...shared.filter((u) => !u.role && hintOf(u)), ...shared.filter((u) => u.role)]
    let moved = false
    for (const unit of movable) {
      const fresh = (unit.role ? choicesFor(unit) : [...prefer(unit), ...everyColor]).filter((c) => !onKey.has(c))
      const pick = fresh.find((c) => !clash(unit.id, c))
      if (!pick) continue
      colors.set(unit.id, pick)
      moved = true
      break
    }
    if (!moved) return { ok: false, reason: 'The scene has too few spaces for a full color key.' }
  }

  const legend = distinct().sort((a, b) => order(a) - order(b))
  return { ok: true, coloring: { colors, legend } }
}
