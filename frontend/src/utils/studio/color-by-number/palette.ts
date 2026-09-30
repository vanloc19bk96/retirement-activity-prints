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
 *
 * **Variety.** Each page deals its colors from these lists rather than always
 * taking the first, leans away from colors the book's recent pages asked
 * for, and deals which number each color gets, so a book of thirty pages
 * does not print thirty keys that start "1 Yellow".
 */

import type { StudioRng } from '../studio-rng'

export type CbnColorId =
  | 'yellow'
  | 'gold'
  | 'orange'
  | 'peach'
  | 'coral'
  | 'red'
  | 'darkRed'
  | 'pink'
  | 'magenta'
  | 'purple'
  | 'lavender'
  | 'lightBlue'
  | 'blue'
  | 'darkBlue'
  | 'turquoise'
  | 'teal'
  | 'mint'
  | 'lightGreen'
  | 'green'
  | 'olive'
  | 'darkGreen'
  | 'beige'
  | 'tan'
  | 'brown'
  | 'darkBrown'
  | 'lightGray'
  | 'gray'

export interface CbnColor {
  id: CbnColorId
  /** What the key prints: short, plain, the name on a pencil. */
  name: string
  /** Swatch fill for color-printed books only. */
  hex: string
}

/** Pencil-box order, the tie-break wherever colors are listed without a dealt order. */
export const CBN_COLORS: readonly CbnColor[] = [
  { id: 'yellow', name: 'Yellow', hex: '#F7D842' },
  { id: 'gold', name: 'Gold', hex: '#E0A526' },
  { id: 'orange', name: 'Orange', hex: '#F08A24' },
  { id: 'peach', name: 'Peach', hex: '#F7C29B' },
  { id: 'coral', name: 'Coral', hex: '#F2735F' },
  { id: 'red', name: 'Red', hex: '#D62F3A' },
  { id: 'darkRed', name: 'Dark Red', hex: '#8E1B2A' },
  { id: 'pink', name: 'Pink', hex: '#F29BC0' },
  { id: 'magenta', name: 'Magenta', hex: '#C2338A' },
  { id: 'purple', name: 'Purple', hex: '#7D55B8' },
  { id: 'lavender', name: 'Lavender', hex: '#C6B3E3' },
  { id: 'lightBlue', name: 'Light Blue', hex: '#9CD3F2' },
  { id: 'blue', name: 'Blue', hex: '#2E78D6' },
  { id: 'darkBlue', name: 'Dark Blue', hex: '#1F3A8A' },
  { id: 'turquoise', name: 'Turquoise', hex: '#2BB9AE' },
  { id: 'teal', name: 'Teal', hex: '#12787A' },
  { id: 'mint', name: 'Mint Green', hex: '#A8E6C8' },
  { id: 'lightGreen', name: 'Light Green', hex: '#A6D86A' },
  { id: 'green', name: 'Green', hex: '#3E9B47' },
  { id: 'olive', name: 'Olive Green', hex: '#7A8B2E' },
  { id: 'darkGreen', name: 'Dark Green', hex: '#1E5C2A' },
  { id: 'beige', name: 'Beige', hex: '#EDE0C4' },
  { id: 'tan', name: 'Tan', hex: '#D4B48A' },
  { id: 'brown', name: 'Brown', hex: '#8A5A2E' },
  { id: 'darkBrown', name: 'Dark Brown', hex: '#5A3A1E' },
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
  /** The sun may sit low on the horizon (golden hour, dusk). */
  lowSun?: boolean
}

/**
 * Moods. Outdoor moods serve every outdoor scene (meadow, shore, beach);
 * indoor moods serve the room. Each is a believable light: sunsets give a
 * lavender sky with a peach glow at the horizon and pink clouds, autumn turns
 * the trees orange, spring puts blossom on them, dusk turns the sky deep blue.
 * Most roles list two or more colors the light allows, and the page deals
 * among them, so one mood does not print the same key twice.
 */
export const CBN_PALETTES: readonly CbnPalette[] = [
  {
    id: 'summer',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue', 'blue'],
      sun: ['yellow', 'gold', 'orange'],
      cloud: ['lightGray', 'lavender'],
      mountain: ['lavender', 'gray', 'purple'],
      snow: ['lightGray'],
      hillFar: ['green', 'darkGreen', 'olive'],
      hillNear: ['lightGreen', 'green', 'mint'],
      foliage: ['darkGreen', 'green', 'olive'],
      trunk: ['brown', 'darkBrown'],
      path: ['tan', 'peach', 'beige'],
      fence: ['brown', 'tan', 'darkBrown'],
      field: ['gold', 'lightGreen', 'tan', 'yellow'],
      petal: ['red', 'pink', 'purple', 'magenta', 'coral'],
      flowerCenter: ['yellow', 'orange', 'gold'],
      water: ['blue', 'teal'],
      waterLight: ['turquoise', 'lightBlue'],
      sand: ['tan', 'peach', 'beige'],
      dune: ['peach', 'gold', 'beige'],
    },
    accents: ['red', 'blue', 'orange', 'coral', 'teal', 'tan', 'brown', 'magenta'],
  },
  {
    id: 'golden',
    setting: 'outdoor',
    lowSun: true,
    roles: {
      sky: ['lavender', 'pink'],
      skyLow: ['peach', 'orange', 'coral'],
      sun: ['yellow', 'orange', 'gold'],
      cloud: ['pink', 'peach', 'coral'],
      mountain: ['purple', 'magenta', 'darkBlue'],
      snow: ['pink', 'lavender'],
      hillFar: ['green', 'darkGreen', 'olive'],
      hillNear: ['lightGreen', 'green', 'olive'],
      foliage: ['darkGreen', 'green', 'olive'],
      trunk: ['brown', 'darkBrown'],
      path: ['tan', 'peach', 'beige'],
      fence: ['brown', 'darkBrown'],
      field: ['gold', 'orange', 'olive'],
      petal: ['pink', 'red', 'coral', 'magenta'],
      flowerCenter: ['yellow', 'orange'],
      water: ['blue', 'darkBlue', 'teal'],
      waterLight: ['turquoise', 'lavender', 'pink'],
      sand: ['tan', 'peach', 'beige'],
      dune: ['peach', 'orange', 'gold'],
    },
    accents: ['red', 'blue', 'brown', 'yellow', 'orange', 'darkRed', 'teal'],
  },
  {
    id: 'spring',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue', 'lavender'],
      sun: ['yellow', 'gold'],
      cloud: ['lavender', 'lightGray', 'pink'],
      mountain: ['lavender', 'purple', 'blue'],
      snow: ['lightGray'],
      hillFar: ['lightGreen', 'green', 'mint'],
      hillNear: ['green', 'lightGreen', 'mint'],
      foliage: ['pink', 'darkGreen', 'lightGreen', 'magenta'],
      trunk: ['brown', 'darkBrown'],
      path: ['tan', 'beige'],
      fence: ['tan', 'brown', 'beige'],
      field: ['lightGreen', 'yellow', 'mint'],
      petal: ['purple', 'pink', 'red', 'magenta', 'coral', 'yellow'],
      flowerCenter: ['yellow', 'orange'],
      water: ['blue', 'teal'],
      waterLight: ['turquoise', 'mint'],
      sand: ['tan', 'peach', 'beige'],
      dune: ['peach', 'yellow', 'beige'],
    },
    accents: ['pink', 'purple', 'yellow', 'blue', 'orange', 'mint', 'coral', 'magenta'],
  },
  {
    id: 'autumn',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue', 'lightGray'],
      sun: ['yellow', 'gold', 'orange'],
      cloud: ['lightGray', 'beige'],
      mountain: ['lavender', 'gray', 'purple'],
      snow: ['lightGray'],
      hillFar: ['green', 'darkGreen', 'olive'],
      hillNear: ['gold', 'tan', 'olive'],
      foliage: ['orange', 'red', 'darkRed', 'gold'],
      trunk: ['brown', 'darkBrown'],
      path: ['tan', 'brown', 'beige'],
      fence: ['brown', 'darkBrown'],
      field: ['orange', 'tan', 'gold', 'olive'],
      petal: ['red', 'orange', 'darkRed', 'purple'],
      flowerCenter: ['yellow', 'gold'],
      water: ['blue', 'darkBlue', 'teal'],
      waterLight: ['turquoise', 'lightBlue'],
      sand: ['tan', 'peach', 'beige'],
      dune: ['peach', 'gold'],
    },
    accents: ['red', 'brown', 'darkGreen', 'orange', 'blue', 'darkRed', 'olive', 'gold'],
  },
  {
    id: 'seaside',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue', 'blue'],
      sun: ['yellow', 'gold'],
      cloud: ['lightGray', 'lavender'],
      mountain: ['lavender', 'gray'],
      snow: ['lightGray'],
      hillFar: ['green', 'olive'],
      hillNear: ['lightGreen', 'green', 'mint'],
      foliage: ['darkGreen', 'green'],
      trunk: ['brown', 'tan'],
      path: ['peach', 'tan', 'beige'],
      fence: ['tan', 'brown', 'lightGray'],
      field: ['gold', 'lightGreen'],
      petal: ['pink', 'red', 'coral'],
      flowerCenter: ['yellow'],
      water: ['blue', 'darkBlue', 'teal'],
      waterLight: ['turquoise', 'lightBlue', 'mint'],
      sand: ['tan', 'peach', 'beige'],
      dune: ['peach', 'gold', 'beige'],
    },
    accents: ['red', 'orange', 'darkBlue', 'yellow', 'tan', 'coral', 'teal'],
  },
  {
    id: 'twilight',
    setting: 'outdoor',
    lowSun: true,
    roles: {
      sky: ['darkBlue', 'purple'],
      skyLow: ['magenta', 'pink', 'orange'],
      sun: ['yellow', 'gold', 'orange'],
      cloud: ['pink', 'lavender', 'magenta'],
      mountain: ['purple', 'gray', 'lavender'],
      snow: ['lavender', 'pink'],
      hillFar: ['darkGreen', 'olive'],
      hillNear: ['green', 'darkGreen', 'olive'],
      foliage: ['darkGreen', 'olive', 'green'],
      trunk: ['darkBrown', 'brown'],
      path: ['tan', 'beige'],
      fence: ['darkBrown', 'brown'],
      field: ['olive', 'gold'],
      petal: ['magenta', 'pink', 'coral'],
      flowerCenter: ['yellow', 'gold'],
      water: ['darkBlue', 'blue', 'teal'],
      waterLight: ['lavender', 'pink', 'turquoise'],
      sand: ['tan', 'beige'],
      dune: ['peach', 'tan'],
    },
    accents: ['orange', 'teal', 'red', 'yellow', 'coral', 'darkRed'],
  },
  {
    id: 'misty',
    setting: 'outdoor',
    roles: {
      sky: ['lightGray', 'lavender', 'lightBlue'],
      skyLow: ['peach', 'pink', 'yellow'],
      sun: ['yellow', 'gold'],
      cloud: ['beige', 'lavender', 'lightBlue', 'pink'],
      mountain: ['gray', 'lavender', 'teal'],
      snow: ['lightGray', 'beige'],
      hillFar: ['mint', 'teal', 'olive'],
      hillNear: ['lightGreen', 'green', 'olive'],
      foliage: ['teal', 'darkGreen', 'green'],
      trunk: ['gray', 'brown'],
      path: ['beige', 'tan'],
      fence: ['gray', 'brown'],
      field: ['mint', 'lightGreen', 'yellow'],
      petal: ['lavender', 'pink', 'purple', 'coral'],
      flowerCenter: ['yellow', 'gold'],
      water: ['teal', 'blue'],
      waterLight: ['mint', 'lightBlue', 'lavender'],
      sand: ['beige', 'tan'],
      dune: ['beige', 'peach'],
    },
    accents: ['coral', 'teal', 'purple', 'yellow', 'blue', 'darkRed'],
  },
  {
    id: 'tropical',
    setting: 'outdoor',
    roles: {
      sky: ['turquoise', 'lightBlue', 'blue'],
      sun: ['yellow', 'orange'],
      cloud: ['lightGray', 'pink'],
      mountain: ['teal', 'green', 'darkGreen'],
      snow: ['lightGray'],
      hillFar: ['darkGreen', 'teal', 'green'],
      hillNear: ['lightGreen', 'green', 'olive'],
      foliage: ['green', 'darkGreen', 'lightGreen'],
      trunk: ['tan', 'brown'],
      path: ['beige', 'peach', 'tan'],
      fence: ['tan', 'brown', 'beige'],
      field: ['lightGreen', 'yellow', 'olive'],
      petal: ['magenta', 'coral', 'orange', 'red', 'pink'],
      flowerCenter: ['yellow', 'orange'],
      water: ['teal', 'blue', 'turquoise'],
      waterLight: ['mint', 'lightBlue', 'turquoise'],
      sand: ['beige', 'peach', 'tan'],
      dune: ['peach', 'gold'],
    },
    accents: ['coral', 'magenta', 'orange', 'yellow', 'red', 'blue'],
  },
  {
    id: 'harvest',
    setting: 'outdoor',
    roles: {
      sky: ['lightBlue', 'peach'],
      sun: ['gold', 'orange', 'yellow'],
      cloud: ['lightGray', 'beige'],
      mountain: ['gray', 'lavender', 'purple'],
      snow: ['lightGray'],
      hillFar: ['olive', 'darkGreen', 'green'],
      hillNear: ['gold', 'tan', 'yellow'],
      foliage: ['orange', 'darkRed', 'gold', 'red'],
      trunk: ['darkBrown', 'brown'],
      path: ['brown', 'tan'],
      fence: ['darkBrown', 'brown', 'gray'],
      field: ['gold', 'orange', 'olive', 'tan'],
      petal: ['darkRed', 'orange', 'red', 'purple'],
      flowerCenter: ['brown', 'gold', 'yellow'],
      water: ['blue', 'darkBlue'],
      waterLight: ['lightBlue', 'turquoise'],
      sand: ['tan', 'beige'],
      dune: ['gold', 'peach'],
    },
    accents: ['darkRed', 'orange', 'olive', 'brown', 'blue', 'red', 'gold'],
  },
  {
    id: 'meadow',
    setting: 'outdoor',
    roles: {
      sky: ['blue', 'lightBlue'],
      sun: ['yellow', 'gold'],
      cloud: ['lightGray', 'lavender'],
      mountain: ['blue', 'lavender', 'gray'],
      snow: ['lightGray'],
      hillFar: ['darkGreen', 'olive', 'green'],
      hillNear: ['mint', 'lightGreen', 'green'],
      foliage: ['green', 'darkGreen', 'olive'],
      trunk: ['brown', 'darkBrown'],
      path: ['beige', 'tan'],
      fence: ['lightGray', 'brown', 'tan'],
      field: ['yellow', 'mint', 'lightGreen', 'gold'],
      petal: ['coral', 'purple', 'red', 'pink', 'magenta'],
      flowerCenter: ['yellow', 'orange'],
      water: ['teal', 'blue'],
      waterLight: ['turquoise', 'lightBlue', 'mint'],
      sand: ['beige', 'tan'],
      dune: ['peach', 'beige'],
    },
    accents: ['coral', 'red', 'purple', 'orange', 'blue', 'magenta'],
  },
  {
    id: 'cozy',
    setting: 'indoor',
    roles: {
      wall: ['peach', 'beige'],
      wallLow: ['tan', 'brown', 'darkRed'],
      trim: ['brown', 'tan', 'darkBrown'],
      floor: ['tan', 'brown'],
      floorAlt: ['brown', 'darkBrown'],
      rug: ['red', 'blue', 'darkRed'],
      rugBorder: ['gold', 'yellow', 'orange'],
      sky: ['lightBlue'],
      hillNear: ['green', 'lightGreen'],
      sun: ['yellow'],
      curtain: ['green', 'darkGreen', 'olive'],
      wood: ['brown', 'tan', 'darkBrown'],
      cloth: ['yellow', 'lightBlue', 'coral'],
    },
    accents: ['blue', 'red', 'yellow', 'green', 'orange', 'teal'],
  },
  {
    id: 'sage',
    setting: 'indoor',
    roles: {
      wall: ['lightGreen', 'mint'],
      wallLow: ['green', 'olive'],
      trim: ['tan', 'brown', 'beige'],
      floor: ['brown', 'tan'],
      floorAlt: ['tan', 'darkBrown'],
      rug: ['purple', 'blue', 'magenta'],
      rugBorder: ['lavender', 'pink', 'coral'],
      sky: ['lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['pink', 'yellow', 'coral'],
      wood: ['brown', 'tan'],
      cloth: ['pink', 'lavender', 'coral'],
    },
    accents: ['pink', 'purple', 'orange', 'blue', 'yellow', 'magenta', 'coral'],
  },
  {
    id: 'coastal',
    setting: 'indoor',
    roles: {
      wall: ['lightBlue', 'beige'],
      wallLow: ['blue', 'teal'],
      trim: ['tan', 'lightGray', 'beige'],
      floor: ['tan', 'beige'],
      floorAlt: ['brown'],
      rug: ['darkBlue', 'turquoise', 'teal'],
      rugBorder: ['yellow', 'peach', 'coral'],
      sky: ['turquoise', 'lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['yellow', 'peach', 'coral'],
      wood: ['brown', 'tan'],
      cloth: ['yellow', 'peach', 'coral'],
    },
    accents: ['red', 'orange', 'yellow', 'darkBlue', 'turquoise', 'coral'],
  },
  {
    id: 'lavender',
    setting: 'indoor',
    roles: {
      wall: ['lavender'],
      wallLow: ['purple', 'magenta'],
      trim: ['tan', 'gray', 'beige'],
      floor: ['brown', 'darkBrown'],
      floorAlt: ['tan'],
      rug: ['pink', 'blue', 'teal'],
      rugBorder: ['purple', 'darkBlue', 'magenta'],
      sky: ['lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['pink', 'darkGreen', 'mint'],
      wood: ['brown', 'tan'],
      cloth: ['pink', 'yellow', 'mint'],
    },
    accents: ['pink', 'green', 'yellow', 'blue', 'orange', 'teal'],
  },
  {
    id: 'terracotta',
    setting: 'indoor',
    roles: {
      wall: ['coral', 'peach'],
      wallLow: ['darkRed', 'brown'],
      trim: ['beige', 'tan'],
      floor: ['tan', 'brown'],
      floorAlt: ['darkBrown', 'brown'],
      rug: ['teal', 'darkBlue', 'olive'],
      rugBorder: ['gold', 'yellow', 'mint'],
      sky: ['lightBlue', 'turquoise'],
      hillNear: ['olive', 'green'],
      sun: ['yellow', 'gold'],
      curtain: ['olive', 'teal', 'gold'],
      wood: ['darkBrown', 'brown', 'tan'],
      cloth: ['beige', 'yellow', 'mint'],
    },
    accents: ['teal', 'gold', 'darkBlue', 'olive', 'yellow', 'blue'],
  },
  {
    id: 'vintage',
    setting: 'indoor',
    roles: {
      wall: ['beige', 'peach'],
      wallLow: ['darkGreen', 'olive', 'darkRed'],
      trim: ['darkBrown', 'brown'],
      floor: ['brown', 'tan'],
      floorAlt: ['darkBrown', 'tan'],
      rug: ['darkRed', 'darkBlue', 'purple'],
      rugBorder: ['gold', 'tan', 'orange'],
      sky: ['lightBlue'],
      hillNear: ['green', 'olive'],
      sun: ['yellow'],
      curtain: ['darkRed', 'olive', 'gold'],
      wood: ['darkBrown', 'brown'],
      cloth: ['lightGray', 'beige', 'lavender'],
    },
    accents: ['darkRed', 'gold', 'darkGreen', 'blue', 'orange', 'teal'],
  },
  {
    id: 'sunroom',
    setting: 'indoor',
    roles: {
      wall: ['yellow', 'beige'],
      wallLow: ['lightGreen', 'mint', 'tan'],
      trim: ['lightGray', 'tan', 'beige'],
      floor: ['tan', 'beige'],
      floorAlt: ['brown', 'gold'],
      rug: ['turquoise', 'coral', 'blue'],
      rugBorder: ['orange', 'darkBlue', 'magenta'],
      sky: ['lightBlue', 'blue'],
      hillNear: ['green', 'lightGreen'],
      sun: ['gold', 'orange'],
      curtain: ['turquoise', 'coral', 'lightBlue'],
      wood: ['tan', 'brown'],
      cloth: ['coral', 'lightBlue', 'mint'],
    },
    accents: ['coral', 'blue', 'red', 'teal', 'orange', 'magenta'],
  },
  {
    id: 'rose',
    setting: 'indoor',
    roles: {
      wall: ['pink', 'peach'],
      wallLow: ['darkRed', 'magenta', 'brown'],
      trim: ['beige', 'lightGray', 'tan'],
      floor: ['brown', 'tan'],
      floorAlt: ['tan', 'darkBrown'],
      rug: ['teal', 'darkGreen', 'blue'],
      rugBorder: ['gold', 'mint', 'lavender'],
      sky: ['lightBlue'],
      hillNear: ['green'],
      sun: ['yellow'],
      curtain: ['mint', 'lavender', 'teal'],
      wood: ['brown', 'darkBrown'],
      cloth: ['mint', 'yellow', 'lavender'],
    },
    accents: ['teal', 'green', 'yellow', 'darkBlue', 'purple', 'orange'],
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
  sky: ['lightBlue', 'lavender', 'peach', 'lightGray', 'blue', 'turquoise'],
  skyLow: ['peach', 'orange', 'pink', 'yellow', 'coral', 'magenta'],
  sun: ['yellow', 'gold', 'orange'],
  cloud: ['lightGray', 'lavender', 'pink', 'peach', 'lightBlue', 'beige'],
  mountain: ['lavender', 'purple', 'gray', 'blue', 'teal', 'darkBlue'],
  snow: ['lightGray', 'lavender', 'pink', 'lightBlue', 'beige'],
  hillFar: ['green', 'lightGreen', 'darkGreen', 'olive', 'mint', 'gold', 'tan'],
  hillNear: ['lightGreen', 'green', 'darkGreen', 'olive', 'mint', 'gold', 'tan'],
  field: ['gold', 'lightGreen', 'yellow', 'tan', 'orange', 'green', 'olive', 'mint'],
  foliage: ['darkGreen', 'green', 'lightGreen', 'olive', 'orange', 'red', 'teal'],
  trunk: ['brown', 'tan', 'darkBrown', 'gray'],
  path: ['tan', 'peach', 'beige', 'gray', 'brown', 'gold'],
  fence: ['brown', 'tan', 'darkBrown', 'gray', 'lightGray', 'red', 'beige'],
  petal: ['red', 'pink', 'purple', 'orange', 'yellow', 'lavender', 'coral', 'magenta'],
  flowerCenter: ['yellow', 'orange', 'gold', 'brown'],
  water: ['blue', 'darkBlue', 'turquoise', 'teal', 'lightBlue'],
  waterLight: ['turquoise', 'lightBlue', 'blue', 'lavender', 'mint'],
  sand: ['tan', 'peach', 'beige', 'gold', 'yellow'],
  dune: ['peach', 'gold', 'tan', 'beige', 'yellow'],
  wall: ['peach', 'lightGreen', 'lightBlue', 'lavender', 'yellow', 'beige', 'mint', 'pink', 'tan'],
  wallLow: ['tan', 'green', 'blue', 'purple', 'brown', 'peach', 'olive', 'teal', 'darkRed'],
  trim: ['brown', 'tan', 'lightGray', 'gray', 'beige', 'darkBrown', 'gold'],
  floor: ['tan', 'brown', 'gold', 'peach', 'beige', 'darkBrown', 'gray'],
  floorAlt: ['brown', 'tan', 'darkBrown', 'gold', 'orange', 'gray'],
  rug: ['red', 'blue', 'purple', 'green', 'teal', 'darkRed', 'gold', 'pink', 'darkBlue', 'coral'],
  rugBorder: ['gold', 'yellow', 'lavender', 'pink', 'orange', 'turquoise', 'mint', 'coral'],
  curtain: ['green', 'pink', 'yellow', 'blue', 'red', 'purple', 'teal', 'coral', 'olive'],
  wood: ['brown', 'tan', 'darkBrown', 'gold', 'orange', 'gray'],
  cloth: ['yellow', 'pink', 'lightBlue', 'lavender', 'red', 'turquoise', 'mint', 'coral'],
}

/** Every color a role may take under this palette: the mood's own first, then its family. */
export const roleChoices = (palette: CbnPalette, role: CbnRole): CbnColorId[] => [...new Set([...(palette.roles[role] ?? []), ...ROLE_FAMILIES[role]])]

/**
 * A subject's natural colors, best first: its biggest piece takes the first
 * one a neighbour does not already have. Subjects not listed lean on the
 * mood's accents alone.
 */
export const CBN_SUBJECT_HUES: Readonly<Record<string, readonly CbnColorId[]>> = {
  'rocking-chair': ['brown', 'tan', 'darkBrown', 'red', 'lightGray', 'olive'],
  'coffee-mug': ['red', 'lightGray', 'blue', 'teal', 'coral', 'yellow', 'darkRed'],
  teacup: ['pink', 'lightBlue', 'yellow', 'mint', 'lavender', 'coral'],
  teapot: ['blue', 'yellow', 'pink', 'teal', 'coral', 'mint', 'darkRed'],
  'book-and-glasses': ['red', 'lightGray', 'brown', 'darkBlue', 'darkGreen', 'darkRed'],
  houseplant: ['green', 'orange', 'darkGreen', 'coral', 'teal', 'olive'],
  'yarn-basket': ['tan', 'purple', 'red', 'magenta', 'teal', 'coral'],
  'sleeping-cat': ['orange', 'peach', 'pink', 'gray', 'tan', 'darkBrown'],
  'vintage-radio': ['brown', 'tan', 'gold', 'darkRed', 'teal', 'beige'],
  'fresh-pie': ['tan', 'brown', 'red', 'darkRed', 'gold', 'purple'],
  sailboat: ['lightGray', 'red', 'brown', 'beige', 'darkBlue', 'coral'],
  motorhome: ['lightGray', 'blue', 'gray', 'beige', 'teal', 'darkRed'],
  'camper-trailer': ['lightGray', 'turquoise', 'gray', 'mint', 'coral', 'beige'],
  suitcase: ['brown', 'tan', 'red', 'darkBrown', 'teal', 'darkRed'],
  'cruise-ship': ['lightGray', 'blue', 'red', 'darkBlue', 'beige', 'teal'],
  'hot-air-balloon': ['red', 'yellow', 'blue', 'magenta', 'teal', 'orange', 'purple', 'coral'],
  'beach-chair': ['red', 'blue', 'yellow', 'coral', 'turquoise', 'teal', 'magenta'],
  lighthouse: ['gray', 'red', 'lightGray', 'beige', 'darkRed', 'teal'],
  'steam-train': ['red', 'darkBlue', 'gray', 'darkGreen', 'darkRed', 'gold'],
  'watering-can': ['green', 'blue', 'gray', 'teal', 'coral', 'red'],
  'flower-pot': ['orange', 'pink', 'green', 'coral', 'magenta', 'purple'],
  birdhouse: ['red', 'brown', 'tan', 'teal', 'beige', 'darkRed', 'mint'],
  'garden-tools': ['brown', 'gray', 'red', 'olive', 'darkGreen', 'orange'],
  wheelbarrow: ['red', 'brown', 'gray', 'teal', 'darkGreen', 'orange'],
  sunflower: ['yellow', 'brown', 'green', 'gold', 'darkBrown', 'olive'],
  butterfly: ['orange', 'purple', 'yellow', 'magenta', 'teal', 'blue', 'coral'],
  songbird: ['blue', 'orange', 'brown', 'red', 'teal', 'gold'],
  'picnic-basket': ['tan', 'red', 'brown', 'beige', 'darkRed', 'blue'],
  fishing: ['brown', 'orange', 'gray', 'olive', 'teal', 'darkBrown'],
  'golf-bag': ['darkGreen', 'tan', 'lightGray', 'darkRed', 'darkBlue', 'olive'],
  bicycle: ['blue', 'gray', 'tan', 'red', 'teal', 'coral', 'mint'],
  'acoustic-guitar': ['tan', 'brown', 'orange', 'darkBrown', 'darkRed', 'gold'],
  'paint-palette': ['tan', 'red', 'blue', 'yellow', 'magenta', 'teal', 'beige'],
  'vintage-camera': ['gray', 'brown', 'lightGray', 'darkBrown', 'darkRed', 'teal'],
  gramophone: ['gold', 'brown', 'red', 'darkRed', 'darkBrown', 'teal'],
  binoculars: ['gray', 'darkGreen', 'lightGray', 'olive', 'darkBrown', 'teal'],
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

const STEAM: readonly CbnColorId[] = ['lightGray', 'lavender', 'lightBlue', 'beige']
const LEAF: readonly CbnColorId[] = ['green', 'darkGreen', 'lightGreen', 'olive', 'mint']
const PETAL: readonly CbnColorId[] = ['pink', 'red', 'purple', 'orange', 'yellow', 'coral', 'magenta']

/** Pieces a daisy (six petals, then its centre) and a tulip (three petals) add, in the potted-flowers drawing. */
function flowerPotHint(index: number, count: number, knobs: Readonly<Record<string, number>>): readonly CbnColorId[] | undefined {
  // Two stems, then two leaves.
  if (index < 4) return LEAF
  // The pot, then its rim, close the drawing.
  if (index === count - 2) return ['orange', 'coral', 'red', 'brown']
  if (index === count - 1) return ['orange', 'coral', 'red', 'tan']
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
  /** The key: number n is `legend[n - 1]`. Dealt per page, so "1" is not the same color on every page. */
  legend: CbnColorId[]
}

export type CbnColoringResult = { ok: true; coloring: CbnColoring } | { ok: false; reason: string }

const order = (id: CbnColorId) => COLOR_INDEX.get(id)!

/** How closely a deal keeps to a list's order: each color is about half as likely as the one before it. */
const DEAL_DECAY = 0.5
/** How far a color gives way for each recent page of the book that already asked for it. */
const BOOK_WEIGHT = 0.6
/** A scene part leans toward a color the key already has (a flower's centre in the sun's yellow), so the key stays small. */
const ON_KEY_BONUS = 2

/**
 * `list` reordered by a weighted draw: the first color stays likeliest, the
 * rest can come first too, and `weight` tilts each draw. With no rng the
 * list keeps its order.
 */
function dealOrder(list: readonly CbnColorId[], rng: StudioRng | undefined, weight: (color: CbnColorId, rank: number) => number): CbnColorId[] {
  if (!rng || list.length < 2) return [...list]
  const rest = list.map((color, rank) => ({ color, w: weight(color, rank) }))
  const out: CbnColorId[] = []
  while (rest.length > 0) {
    const total = rest.reduce((s, r) => s + r.w, 0)
    let roll = rng.next() * total
    let at = rest.length - 1
    for (let i = 0; i < rest.length; i++) {
      roll -= rest[i]!.w
      if (roll < 0) {
        at = i
        break
      }
    }
    out.push(rest.splice(at, 1)[0]!.color)
  }
  return out
}

/**
 * Give every unit a color: scene roles from the palette, subject pieces by
 * rule, then settle the key at six to eight colors with no two touching
 * units sharing one. Ties go by area, then by id.
 *
 * With an `rng` the page deals its colors instead of always taking each
 * list's first: the sky may be light blue or blue, the teapot blue or teal,
 * and a color the book's recent pages leaned on (`recentColors`) gives way,
 * so a book does not print the same key page after page. The numbers are
 * dealt too. Without one, every choice is each list's first and the key is
 * in pencil-box order.
 */
export function colorUnits(options: {
  units: readonly CbnUnit[]
  /** Pairs of unit ids that share an edge on the page. */
  touching: ReadonlyMap<string, ReadonlySet<string>>
  palette: CbnPalette
  subjectId: string
  /** Preferred colors for subject piece `s<index>`, ahead of the subject's own (see `CBN_PIECE_HINTS`). */
  pieceHint?: (index: number) => readonly CbnColorId[] | undefined
  rng?: StudioRng
  /** How many of the book's recent pages asked for each color. */
  recentColors?: ReadonlyMap<CbnColorId, number>
  min?: number
  max?: number
}): CbnColoringResult {
  const { units, touching, palette, subjectId, pieceHint, rng, recentColors, min = CBN_MIN_COLORS, max = CBN_MAX_COLORS } = options
  const colors = new Map<string, CbnColorId>()
  const neighbours = (id: string) => touching.get(id) ?? new Set<string>()
  const clash = (id: string, color: CbnColorId) => [...neighbours(id)].some((n) => colors.get(n) === color)
  const byArea = [...units].sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1))
  const everyColor = CBN_COLORS.map((c) => c.id)
  const fresh = (color: CbnColorId, rank: number) => DEAL_DECAY ** rank / (1 + BOOK_WEIGHT * (recentColors?.get(color) ?? 0))

  // Scene first: every role deals one of the mood's own colors no neighbour
  // has, and failing that takes its family's first.
  for (const unit of byArea) {
    if (!unit.role) continue
    if (!paletteHas(palette, unit.role)) return { ok: false, reason: `The mood has no color for the ${unit.role}.` }
    const onKey = new Set(colors.values())
    const own = (palette.roles[unit.role] ?? []).filter((c) => !clash(unit.id, c))
    const pick =
      dealOrder(own, rng, (c, rank) => fresh(c, rank) * (onKey.has(c) ? ON_KEY_BONUS : 1))[0] ??
      roleChoices(palette, unit.role).find((c) => !clash(unit.id, c))
    if (!pick) return { ok: false, reason: `Every color for the ${unit.role} is taken by something it touches.` }
    colors.set(unit.id, pick)
  }
  // Then the subject, biggest piece first, in its own colors. The order is
  // dealt once per page, so pieces that do not touch still share a color.
  const hues = CBN_SUBJECT_HUES[subjectId] ?? []
  const subjectList = dealOrder([...new Set<CbnColorId>([...hues, ...palette.accents])], rng, fresh)
  const hintOrders = new Map<string, CbnColorId[]>()
  const dealtHint = (hint: readonly CbnColorId[]) => {
    const key = hint.join(',')
    if (!hintOrders.has(key)) hintOrders.set(key, dealOrder(hint, rng, fresh))
    return hintOrders.get(key)!
  }
  const hintOf = (unit: CbnUnit) => (pieceHint && !unit.role ? pieceHint(Number(unit.id.slice(1))) : undefined)
  const prefer = (unit: CbnUnit): CbnColorId[] => {
    const hint = hintOf(unit)
    return [...new Set<CbnColorId>([...(hint ? dealtHint(hint) : []), ...subjectList])]
  }
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

  const sorted = distinct().sort((a, b) => order(a) - order(b))
  const legend = rng ? rng.shuffle(sorted) : sorted
  return { ok: true, coloring: { colors, legend } }
}
