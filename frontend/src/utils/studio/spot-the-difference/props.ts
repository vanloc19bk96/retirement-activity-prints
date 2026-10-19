import type { SgSubject } from '../stained-glass/catalog'
import { sgSubjectById } from '../stained-glass/subjects'
import { DTD_EXTRA_SUBJECTS } from '../dot-to-dot/subjects'
import { EXTRA_MAZE_SUBJECTS } from '../shaped-maze/subjects-extra'
import { SD_ELEMENTS } from './elements'

/**
 * Every thing a scene can hold: the shared retirement drawings, the ones Dot
 * to Dot and Shaped Maze drew, and this game's own scene elements.
 *
 * Each entry adds what a scene needs on top of the drawing: a short name for
 * the answer key ("teacup", not "Teacup and Saucer"), whether the thing may
 * face either way, and, for tables and blankets, the surface other things
 * stand on.
 */

export interface SdPropKind {
  id: string
  /** Lowercase, as the answer key names it: "No teacup (top)". */
  label: string
  subject: SgSubject
  /** Its mirror image is still right (no handed detail): may be dealt either way round. */
  mirror: boolean
  /**
   * "Turned around" is a difference a reader can name: it has a front and a
   * back (a chair, a boat, a watering can). A cloud, a bush or a rug facing
   * the other way is only a slightly different blob, never a fair change.
   */
  turn: boolean
  /** Where things stand on it, in drawing units, before any mirroring. */
  surface?: { y: number; x0: number; x1: number }
  /** How tall it is in life, as drawn (cm): what sizes it beside other things in a scene. */
  cm: number
}

/**
 * Where Dot to Dot and Shaped Maze both drew a thing (a hammock, a deck
 * chair, a golf cart), the Dot to Dot drawing wins: it stands on its own
 * feet (a hammock on its stand, not strung between two trees), which is what
 * a scene needs.
 */
const extra = new Map<string, SgSubject>([...EXTRA_MAZE_SUBJECTS, ...DTD_EXTRA_SUBJECTS, ...SD_ELEMENTS].map((s) => [s.id, s]))

/** `[id, label, options]`. */
const ENTRIES: readonly [string, string, Partial<Omit<SdPropKind, 'id' | 'label' | 'subject'>>?][] = [
  // Home
  ['rocking-chair', 'rocking chair'],
  ['armchair', 'armchair'],
  ['coffee-mug', 'mug'],
  ['teacup', 'teacup'],
  ['teapot', 'teapot'],
  ['book-and-glasses', 'book'],
  ['houseplant', 'houseplant'],
  ['yarn-basket', 'yarn basket'],
  ['sd-cat', 'cat'],
  ['vintage-radio', 'radio'],
  ['fresh-pie', 'pie'],
  ['table-lamp', 'lamp'],
  ['kettle', 'kettle'],
  ['porch-swing', 'porch swing'],
  ['porch-rocker', 'rocking chair'],
  ['cottage', 'cottage'],
  ['sd-window', 'window'],
  ['sd-picture', 'picture'],
  ['sd-clock', 'clock'],
  ['sd-shelf', 'shelf'],
  ['sd-side-table', 'side table', { surface: { y: 0, x0: 4, x1: 96 } }],
  ['sd-tea-table', 'table', { surface: { y: -1, x0: 14, x1: 156 } }],
  ['sd-rug', 'rug'],
  ['sd-vase', 'vase'],
  ['sd-floor-lamp', 'floor lamp'],
  ['sd-cookies', 'cookies'],
  ['sd-cake', 'cake'],
  ['sd-footstool', 'footstool'],
  ['sd-door', 'door'],
  ['sd-pendant', 'hanging lamp'],
  ['sd-slippers', 'slippers'],
  ['sd-books', 'books'],
  ['sd-ducks', 'ducks'],
  ['sd-doormat', 'doormat'],
  ['sd-sofa', 'sofa'],
  ['sd-fireplace', 'fireplace'],
  ['sd-tall-clock', 'grandfather clock'],
  ['sd-bookcase', 'bookcase'],
  ['sd-dog', 'dog'],
  ['sd-candles', 'candlesticks'],
  ['sd-fruit', 'fruit bowl'],
  ['sd-cactus', 'cactus'],
  ['sd-photo', 'photo frame'],
  ['sd-mirror', 'mirror'],
  // The kitchen
  ['sd-counter', 'counter', { surface: { y: 0, x0: 6, x1: 254 } }],
  ['sd-mixing-bowl', 'mixing bowl'],
  ['sd-bread', 'bread'],
  ['sd-jars', 'jars'],
  ['sd-utensils', 'utensils'],
  ['sd-cupboard', 'cupboard'],
  // Hobbies
  ['acoustic-guitar', 'guitar'],
  ['paint-palette', 'palette'],
  ['vintage-camera', 'camera'],
  ['gramophone', 'gramophone'],
  ['binoculars', 'binoculars'],
  ['golf-bag', 'golf bag'],
  ['golf-flag', 'golf flag'],
  ['golf-cart', 'golf cart'],
  ['sd-bicycle', 'bicycle'],
  ['sd-easel', 'easel'],
  ['sd-kite', 'kite'],
  ['sd-bunker', 'sand trap'],
  ['sd-tackle', 'tackle box'],
  // Garden and grounds
  ['watering-can', 'watering can'],
  ['flower-pot', 'flower pot'],
  ['birdhouse', 'birdhouse'],
  ['wheelbarrow', 'wheelbarrow'],
  ['sunflower', 'sunflower'],
  ['butterfly', 'butterfly'],
  ['songbird', 'bird'],
  ['picnic-basket', 'picnic basket'],
  ['park-bench', 'bench'],
  ['birdbath', 'birdbath'],
  ['mailbox', 'mailbox'],
  ['garden-shed', 'shed'],
  ['hammock', 'hammock'],
  ['sd-sun', 'sun'],
  ['sd-cloud', 'cloud'],
  ['sd-birds', 'birds'],
  ['sd-tree', 'tree'],
  ['sd-pine', 'pine tree'],
  ['sd-bush', 'bush'],
  ['sd-fence', 'fence'],
  ['sd-flowers', 'flowers'],
  ['sd-blanket', 'blanket', { surface: { y: 15, x0: 14, x1: 126 } }],
  ['sd-hanging', 'hanging basket'],
  ['sd-arch', 'rose arch'],
  ['sd-feeder', 'bird feeder'],
  ['sd-veg-bed', 'vegetable bed'],
  ['sd-pumpkins', 'pumpkins'],
  ['sd-scarecrow', 'scarecrow'],
  ['sd-snail', 'snail'],
  ['sd-tools', 'garden tools'],
  ['sd-washing', 'washing line'],
  ['sd-picnic-table', 'picnic table', { surface: { y: -1, x0: 8, x1: 152 } }],
  ['sd-crate', 'crate'],
  // Travel and the seaside
  ['sailboat', 'sailboat'],
  ['motorhome', 'motorhome'],
  ['camper-trailer', 'camper'],
  ['suitcase', 'suitcase'],
  ['cruise-ship', 'ship'],
  ['hot-air-balloon', 'balloon'],
  ['lighthouse', 'lighthouse'],
  ['steam-train', 'train'],
  ['fishing-boat', 'boat'],
  ['deck-chair', 'deck chair'],
  ['sun-hat', 'sun hat'],
  ['lantern', 'lantern'],
  ['tent', 'tent'],
  ['sd-fishing', 'fishing rod'],
  ['sd-umbrella', 'umbrella'],
  ['sd-sandcastle', 'sandcastle'],
  ['sd-bucket', 'bucket'],
  ['sd-ball', 'beach ball'],
  ['sd-life-ring', 'life ring'],
  ['sd-campfire', 'campfire'],
  ['sd-signpost', 'signpost'],
  ['sd-palm', 'palm tree'],
  ['sd-beach-hut', 'beach hut'],
  ['sd-shells', 'shells'],
  ['sd-crab', 'crab'],
  ['sd-flip-flops', 'flip-flops'],
  ['sd-cool-box', 'cool box'],
  ['sd-canoe', 'canoe'],
  ['sd-backpack', 'backpack'],
  ['sd-stump', 'tree stump'],
]

/**
 * How tall each thing is in life, as drawn, in cm: a teacup with its saucer,
 * a cat curled on its cushion, a birdhouse on its post. A scene sizes its
 * things from these, so a teapot is never as tall as the table it stands on
 * and a cool box never looms over a deck chair. Sky and sea things (a cloud,
 * a ship on the horizon) are sized by their scene instead.
 */
const CM: Readonly<Record<string, number>> = {
  // Home
  'rocking-chair': 100,
  armchair: 95,
  'coffee-mug': 16,
  teacup: 14,
  teapot: 24,
  'book-and-glasses': 22,
  houseplant: 60,
  'yarn-basket': 35,
  'sd-cat': 30,
  'vintage-radio': 28,
  'fresh-pie': 14,
  'table-lamp': 50,
  kettle: 26,
  'porch-swing': 180,
  'porch-rocker': 100,
  cottage: 600,
  'sd-window': 130,
  'sd-picture': 45,
  'sd-clock': 35,
  'sd-shelf': 40,
  'sd-side-table': 60,
  'sd-tea-table': 75,
  'sd-rug': 14,
  'sd-vase': 45,
  'sd-floor-lamp': 160,
  'sd-cookies': 10,
  'sd-cake': 22,
  'sd-footstool': 40,
  'sd-door': 210,
  'sd-pendant': 60,
  'sd-slippers': 26,
  'sd-books': 16,
  'sd-ducks': 25,
  'sd-doormat': 8,
  'sd-sofa': 85,
  'sd-fireplace': 115,
  'sd-tall-clock': 190,
  'sd-bookcase': 180,
  'sd-dog': 40,
  'sd-candles': 32,
  'sd-fruit': 24,
  'sd-cactus': 28,
  'sd-photo': 22,
  'sd-mirror': 60,
  'sd-counter': 90,
  'sd-mixing-bowl': 22,
  'sd-bread': 14,
  'sd-jars': 28,
  'sd-utensils': 45,
  'sd-cupboard': 70,
  // Hobbies
  'acoustic-guitar': 100,
  'paint-palette': 35,
  'vintage-camera': 16,
  gramophone: 50,
  binoculars: 18,
  'golf-bag': 110,
  'golf-flag': 220,
  'golf-cart': 190,
  'sd-bicycle': 100,
  'sd-easel': 170,
  'sd-kite': 120,
  'sd-bunker': 30,
  'sd-tackle': 30,
  // Garden and grounds
  'watering-can': 40,
  'flower-pot': 45,
  birdhouse: 140,
  wheelbarrow: 75,
  sunflower: 160,
  butterfly: 14,
  songbird: 20,
  'picnic-basket': 35,
  'park-bench': 85,
  birdbath: 80,
  mailbox: 120,
  'garden-shed': 250,
  hammock: 120,
  'sd-sun': 100,
  'sd-cloud': 100,
  'sd-birds': 100,
  'sd-tree': 450,
  'sd-pine': 600,
  'sd-bush': 110,
  'sd-fence': 110,
  'sd-flowers': 50,
  'sd-blanket': 16,
  'sd-hanging': 60,
  'sd-arch': 230,
  'sd-feeder': 170,
  'sd-veg-bed': 45,
  'sd-pumpkins': 35,
  'sd-scarecrow': 180,
  'sd-snail': 14,
  'sd-tools': 140,
  'sd-washing': 180,
  'sd-picnic-table': 75,
  'sd-crate': 40,
  // Travel and the seaside
  sailboat: 700,
  motorhome: 300,
  'camper-trailer': 250,
  suitcase: 60,
  'cruise-ship': 2000,
  'hot-air-balloon': 2000,
  lighthouse: 2500,
  'steam-train': 400,
  'fishing-boat': 300,
  'deck-chair': 90,
  'sun-hat': 16,
  lantern: 32,
  tent: 180,
  'sd-fishing': 200,
  'sd-umbrella': 230,
  'sd-sandcastle': 40,
  'sd-bucket': 35,
  'sd-ball': 35,
  'sd-life-ring': 70,
  'sd-campfire': 50,
  'sd-signpost': 220,
  'sd-palm': 600,
  'sd-beach-hut': 280,
  'sd-shells': 15,
  'sd-crab': 15,
  'sd-flip-flops': 26,
  'sd-cool-box': 40,
  'sd-canoe': 60,
  'sd-backpack': 55,
  'sd-stump': 50,
}

/**
 * Sizes are squeezed towards each other (to the power 0.7): a teacup drawn
 * true to a chair would be a speck, so small things print a little larger
 * than life, as picture books draw them, but always in the same order.
 */
const SIZE_POWER = 0.7

/** How big a thing prints beside others in its plane: 1 for a 1 m thing. */
export const sdSize = (id: string) => ((INDEX.get(id)?.cm ?? 100) / 100) ** SIZE_POWER

/** The drawing behind an id: this game's (or a sibling game's) own first, then the shared library. */
function resolve(id: string): SgSubject | undefined {
  return extra.get(id) ?? sgSubjectById(id)
}

/** Things with no front or back: never changed by turning round. */
const NO_TURN = new Set([
  'sd-sun',
  'sd-cloud',
  'sd-birds',
  'sd-tree',
  'sd-pine',
  'sd-bush',
  'sd-fence',
  'sd-flowers',
  'sd-rug',
  'sd-blanket',
  'sd-doormat',
  'sd-bunker',
  'sd-ball',
  'sd-life-ring',
  'sd-window',
  'sd-picture',
  'sd-clock',
  'sd-shelf',
  'sd-side-table',
  'sd-tea-table',
  'sd-vase',
  'sd-cookies',
  'sd-cake',
  'sd-hanging',
  'sd-slippers',
  'sd-pendant',
  'sd-campfire',
  'sd-sandcastle',
  'sunflower',
  'flower-pot',
  'houseplant',
  // Things whose mirror image is only a slightly different arrangement, not a thing turned round.
  'sd-sofa',
  'sd-fireplace',
  'sd-tall-clock',
  'sd-bookcase',
  'sd-candles',
  'sd-fruit',
  'sd-cactus',
  'sd-photo',
  'sd-mirror',
  'sd-counter',
  'sd-mixing-bowl',
  'sd-bread',
  'sd-jars',
  'sd-utensils',
  'sd-cupboard',
  'sd-arch',
  'sd-feeder',
  'sd-veg-bed',
  'sd-pumpkins',
  'sd-scarecrow',
  'sd-tools',
  'sd-washing',
  'sd-picnic-table',
  'sd-crate',
  'sd-palm',
  'sd-beach-hut',
  'sd-shells',
  'sd-crab',
  'sd-flip-flops',
  'sd-cool-box',
  'sd-canoe',
  'sd-backpack',
  'sd-stump',
])

export const SD_PROPS: readonly SdPropKind[] = ENTRIES.flatMap(([id, label, options]) => {
  const subject = resolve(id)
  if (!subject) return []
  return [{ id, label, subject, mirror: subject.mirror, turn: subject.mirror && !NO_TURN.has(id), cm: CM[id] ?? 100, ...options }]
})

const INDEX = new Map(SD_PROPS.map((p) => [p.id, p]))
export const sdProp = (id: string) => INDEX.get(id)
