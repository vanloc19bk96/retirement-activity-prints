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
  ['sleeping-cat', 'cat'],
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
  // Hobbies
  ['acoustic-guitar', 'guitar'],
  ['paint-palette', 'palette'],
  ['vintage-camera', 'camera'],
  ['gramophone', 'gramophone'],
  ['binoculars', 'binoculars'],
  ['golf-bag', 'golf bag'],
  ['golf-flag', 'golf flag'],
  ['golf-cart', 'golf cart'],
  ['bicycle', 'bicycle'],
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
  ['camping-tent', 'tent'],
  ['fishing', 'fishing rod'],
  ['sd-umbrella', 'umbrella'],
  ['sd-sandcastle', 'sandcastle'],
  ['sd-bucket', 'bucket'],
  ['sd-ball', 'beach ball'],
  ['sd-life-ring', 'life ring'],
  ['sd-campfire', 'campfire'],
  ['sd-signpost', 'signpost'],
]

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
  'sd-pendant',
  'sd-campfire',
  'sd-sandcastle',
  'sunflower',
  'flower-pot',
  'houseplant',
])

export const SD_PROPS: readonly SdPropKind[] = ENTRIES.flatMap(([id, label, options]) => {
  const subject = resolve(id)
  if (!subject) return []
  return [{ id, label, subject, mirror: subject.mirror, turn: subject.mirror && !NO_TURN.has(id), ...options }]
})

const INDEX = new Map(SD_PROPS.map((p) => [p.id, p]))
export const sdProp = (id: string) => INDEX.get(id)
