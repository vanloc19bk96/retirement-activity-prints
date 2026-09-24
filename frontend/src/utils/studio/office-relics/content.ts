import type { StudioConfig } from '@/types/studio-template.types'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { createRng, deriveSeed } from '../studio-rng'
import { RELIC_DRAWINGS, type RelicDrawingId } from './drawings'
import { dealRelicVariant, type RelicVariant } from './variants'

/**
 * What an Office Relics page can show, and how a page's objects are chosen.
 *
 * Every object is a real kind of thing from the offices, shops and workplaces
 * of the 1940s to the 1990s, named the way people who used it name it. The
 * answer is always the *kind* of object ("Typewriter"), never a maker or a
 * model. A trade name that became the everyday word for a thing ("Rolodex")
 * may be accepted as an alias, so a reader who writes it is not marked wrong,
 * but it is never the printed answer.
 *
 * Not everyone worked in an office, so the catalog leans on things most people
 * met anyway: the cash register at the corner shop, the water cooler, the lunch
 * box, the phone book, the rotary phone at home.
 *
 * Three pieces of data keep a page fair:
 *
 * * `aliases` — other names in common use. The answer page prints them under
 *   the answer, so one right name is never marked wrong.
 * * `lookalikes` — groups of objects a reader could confuse with each other,
 *   or name the same way (two desk phones, two machines with reels). Two
 *   objects that share a group never share a page, so every picture on a page
 *   has one best answer. Aliases may only be shared inside a group.
 * * `category` — what the object was for. A page takes at most two from one
 *   category, so it wanders the whole office instead of printing four phones.
 */

export const OR_TEMPLATE_KEY = 'office-relics'
export const OR_DEFAULT_TITLE = 'Office Relics'

export const OR_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for Office Relics pictures. Pick a larger page in Settings.'
export const OR_BUILD_FAILED_MESSAGE = 'Could not lay out these pictures on this page. Try again.'
export const OR_BOOK_FULL_MESSAGE =
  'This book already shows every Office Relic there is. Remove an Office Relics page to add another.'

/**
 * How well known an object is today.
 *
 * * `1` — most people still recognise it on sight (typewriter, rotary phone).
 * * `2` — familiar to anyone who worked through those years (punch clock,
 *   slide rule, overhead projector).
 * * `3` — a real test of memory (mimeograph, memo spike, punch card).
 */
export type RelicTier = 1 | 2 | 3

export type RelicCategory =
  | 'communication'
  | 'writing'
  | 'filing'
  | 'timekeeping'
  | 'printing'
  | 'calculating'
  | 'presenting'
  | 'computing'
  | 'office-life'

export interface OfficeRelic {
  /** Stable identity, stamped on the page so a book never repeats an object. */
  id: string
  /** The answer, in sentence case. */
  name: string
  /** Other names people use, most common first. */
  aliases: readonly string[]
  tier: RelicTier
  category: RelicCategory
  /** The decade it was an everyday sight. Documentation, and page variety. */
  decade: number
  /** Objects a reader could confuse with this one; never on the same page. */
  lookalikes: readonly string[]
  /** One or more drawings of it; a page uses one. */
  drawings: readonly RelicDrawingId[]
}

const relic = (
  id: RelicDrawingId,
  name: string,
  tier: RelicTier,
  category: RelicCategory,
  decade: number,
  aliases: readonly string[] = [],
  lookalikes: readonly string[] = [],
): OfficeRelic => ({ id, name, aliases, tier, category, decade, lookalikes, drawings: [id] })

export const OFFICE_RELICS: readonly OfficeRelic[] = [
  // Communication
  relic('rotary-phone', 'Rotary phone', 1, 'communication', 1950, ['Rotary telephone', 'Dial phone', 'Telephone'], ['desk-phone']),
  relic('push-button-phone', 'Push-button phone', 2, 'communication', 1970, ['Office phone', 'Desk telephone', 'Telephone'], ['desk-phone']),
  relic('fax-machine', 'Fax machine', 1, 'communication', 1980, ['Fax', 'Facsimile machine'], ['paper-machine']),
  relic('brick-phone', 'Brick phone', 1, 'communication', 1980, ['Mobile phone', 'Cell phone', 'Cellular phone']),
  relic('switchboard', 'Switchboard', 3, 'communication', 1950, ['Telephone switchboard', 'Switchboard console']),
  relic('phone-book', 'Phone book', 2, 'communication', 1970, ['Telephone directory', 'Telephone book', 'Directory']),

  // Typing and writing
  relic('typewriter', 'Typewriter', 1, 'writing', 1950, ['Manual typewriter']),
  relic('fountain-pen', 'Fountain pen', 1, 'writing', 1950, ['Ink pen'], ['pen']),
  relic('inkwell', 'Inkwell', 2, 'writing', 1940, ['Ink pot', 'Ink bottle', 'Quill and ink'], ['pen']),
  relic('steno-pad', 'Steno pad', 2, 'writing', 1960, ['Shorthand pad', 'Notepad', "Stenographer's notebook"]),
  relic('rocker-blotter', 'Rocker blotter', 3, 'writing', 1940, ['Ink blotter', 'Blotter']),
  relic('pencil-sharpener', 'Pencil sharpener', 1, 'writing', 1950, ['Crank sharpener', 'Sharpener']),

  // Filing and organising
  relic('file-cabinet', 'File cabinet', 1, 'filing', 1950, ['Filing cabinet'], ['drawers']),
  relic('rotary-card-file', 'Rotary card file', 1, 'filing', 1960, ['Rolodex', 'Card file', 'Address file']),
  relic('card-catalog', 'Card catalog', 2, 'filing', 1950, ['Card catalogue', 'Library card catalog', 'Index card cabinet'], ['drawers']),
  relic('accordion-file', 'Accordion file', 3, 'filing', 1960, ['Expanding file', 'Accordion folder', 'Expanding folder']),
  relic('memo-spike', 'Memo spike', 3, 'filing', 1950, ['Spindle', 'Desk spike', 'Receipt spike']),
  relic('paper-tray', 'Letter tray', 2, 'filing', 1960, ['In tray', 'In-and-out tray', 'Paper tray', 'Desk tray']),

  // Timekeeping
  relic('punch-clock', 'Punch clock', 2, 'timekeeping', 1950, ['Time clock', 'Time recorder']),
  relic('desk-calendar', 'Desk calendar', 1, 'timekeeping', 1970, ['Flip calendar', 'Calendar']),

  // Printing, copying and stamping
  relic('rubber-stamp', 'Rubber stamp', 1, 'printing', 1950, ['Stamp and ink pad', 'Ink stamp', 'Office stamp']),
  relic('paper-cutter', 'Paper cutter', 2, 'printing', 1960, ['Guillotine', 'Paper trimmer', 'Guillotine cutter']),
  relic('photocopier', 'Photocopier', 2, 'printing', 1970, ['Copier', 'Copy machine', 'Copying machine'], ['paper-machine']),
  relic('mimeograph', 'Mimeograph', 3, 'printing', 1950, ['Mimeograph machine', 'Ditto machine', 'Stencil duplicator'], ['paper-machine']),

  // Calculating
  relic('adding-machine', 'Adding machine', 2, 'calculating', 1950, ['Adding calculator', 'Printing calculator'], ['keys-and-crank']),
  relic('calculator', 'Calculator', 1, 'calculating', 1980, ['Desk calculator', 'Electronic calculator'], ['keys-and-crank']),
  relic('slide-rule', 'Slide rule', 2, 'calculating', 1950),
  relic('cash-register', 'Cash register', 1, 'calculating', 1950, ['Till', 'Register'], ['keys-and-crank']),

  // Presentations
  relic('overhead-projector', 'Overhead projector', 2, 'presenting', 1970, ['Overhead', 'Transparency projector'], ['projector']),
  relic('slide-projector', 'Slide projector', 2, 'presenting', 1960, ['Carousel projector', 'Carousel slide projector'], ['projector']),
  relic('film-projector', 'Film projector', 2, 'presenting', 1960, ['Movie projector', 'Reel projector', 'Cine projector'], ['projector', 'two-reels']),
  relic('flip-chart', 'Flip chart', 1, 'presenting', 1970, ['Easel pad', 'Presentation easel']),

  // Computing and recording
  relic('floppy-disk', 'Floppy disk', 1, 'computing', 1990, ['Floppy', 'Diskette', 'Computer disk']),
  relic('punch-card', 'Punch card', 3, 'computing', 1960, ['Punched card', 'Computer card', 'Data card']),
  relic('dot-matrix-printer', 'Dot matrix printer', 2, 'computing', 1980, ['Computer printer', 'Printer'], ['paper-machine']),
  relic('desktop-computer', 'Desktop computer', 1, 'computing', 1980, ['Computer', 'Personal computer', 'Home computer']),
  relic('cassette-tape', 'Cassette tape', 1, 'computing', 1980, ['Cassette', 'Audio cassette', 'Tape']),
  relic('reel-to-reel', 'Reel-to-reel', 2, 'computing', 1960, ['Reel-to-reel recorder', 'Tape recorder'], ['two-reels']),

  // Office life
  relic('water-cooler', 'Water cooler', 1, 'office-life', 1960, ['Water dispenser', 'Office water cooler']),
  relic('desk-fan', 'Desk fan', 1, 'office-life', 1950, ['Electric fan', 'Oscillating fan', 'Fan']),
  relic('safe', 'Safe', 1, 'office-life', 1950, ['Office safe', 'Strongbox']),
  relic('briefcase', 'Briefcase', 1, 'office-life', 1970, ['Attaché case']),
  relic('percolator', 'Coffee percolator', 1, 'office-life', 1960, ['Percolator', 'Coffee pot', 'Coffee maker']),
  relic('bankers-lamp', "Banker's lamp", 2, 'office-life', 1940, ['Desk lamp', 'Green-shade lamp', 'Library lamp']),
  relic('lunch-box', 'Lunch box', 1, 'office-life', 1960, ['Lunch pail', 'Lunch bucket', 'Lunchbox']),
  relic('tape-dispenser', 'Tape dispenser', 2, 'office-life', 1960, ['Tape holder']),
  relic('service-bell', 'Service bell', 1, 'office-life', 1950, ['Desk bell', 'Call bell', 'Counter bell', 'Bell']),
  relic('postal-scale', 'Postal scale', 2, 'office-life', 1950, ['Letter scale', 'Postage scale', 'Mail scale', 'Scale']),
]

const RELIC_INDEX = new Map(OFFICE_RELICS.map((r) => [r.id, r]))
export const relicById = (id: string) => RELIC_INDEX.get(id)

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type OfficeRelicsLevel = 'gentle' | 'classic' | 'challenging'

interface LevelSpec {
  value: OfficeRelicsLevel
  label: string
  /**
   * How strongly each tier is preferred — lower is dealt first. A tier is only
   * reached once every better one is used up in the book, so every level can
   * still fill a long book from the whole catalog.
   */
  tierRank: Readonly<Record<RelicTier, number>>
  /** Print every answer on the page, shuffled, in a word bank. */
  wordBank: boolean
}

export const OR_LEVELS: readonly LevelSpec[] = [
  { value: 'gentle', label: 'Gentle — familiar objects, with a word bank', tierRank: { 1: 0, 2: 1, 3: 2 }, wordBank: true },
  { value: 'classic', label: 'Classic — a mix of the well known and the half forgotten', tierRank: { 1: 0, 2: 0, 3: 1 }, wordBank: false },
  { value: 'challenging', label: 'Challenging — rarer relics for sharp memories', tierRank: { 1: 1, 2: 0, 3: 0 }, wordBank: false },
]

export const DEFAULT_OR_LEVEL: OfficeRelicsLevel = 'classic'

export function parseOrLevel(raw: unknown): OfficeRelicsLevel {
  const value = String(raw ?? '')
  return OR_LEVELS.some((level) => level.value === value) ? (value as OfficeRelicsLevel) : DEFAULT_OR_LEVEL
}

export const levelSpec = (level: OfficeRelicsLevel) => OR_LEVELS.find((l) => l.value === level)!

/**
 * The ways the instruction is phrased; a seller's house style prints one.
 * The word bank is "the box", never by name, so any bank heading fits. Each
 * is kept to the original's length: the plan is fitted to the tallest, and a
 * longer phrasing would cost a small trim its word bank.
 */
const OR_INSTRUCTIONS = {
  bank: [
    'Name each office relic on its line. The answers are in the box.',
    'Write the name of each object on its line. All answers are below.',
    'What is each object called? Write it in. Answers are in the box.',
  ],
  plain: [
    'Name each office relic on its line.',
    'Write the name of each object on its line.',
    'What is each object called? Write it on the line.',
  ],
} as const

/** Every phrasing this config could print ([] when instructions are off). The plan fits the tallest. */
export function orInstructionOptions(config: StudioConfig): readonly string[] {
  if (config.showInstructions === false) return []
  return OR_INSTRUCTIONS[levelSpec(parseOrLevel(config.level)).wordBank ? 'bank' : 'plain']
}

export function orInstruction(config: StudioConfig, phrasing = 0): string {
  const options = orInstructionOptions(config)
  return options.length === 0 ? '' : options[Math.abs(Math.trunc(phrasing)) % options.length]!
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

/** The line printed under an answer on the answer page, or '' when it has no other name. */
export function aliasLine(aliases: readonly string[]): string {
  return aliases.length === 0 ? '' : `Also: ${aliases.join(', ')}`
}

/** Normalised for comparing names: case, apostrophes, hyphens and spacing folded. */
export const nameKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[-\s]+/g, ' ')
    .trim()

/**
 * Why a catalog entry cannot print, or [] when it can.
 *
 * Kept as data rather than trusted: a hand edit that drops a drawing, leaves
 * an alias identical to the answer or names a model number is refused by the
 * tests and by the preflight instead of printing.
 */
export function relicFaults(r: OfficeRelic): string[] {
  const faults: string[] = []
  if (!/^[a-z][a-z-]*[a-z]$/.test(r.id)) faults.push(`${r.id}: bad id`)
  if (!/^[A-Z][A-Za-z' -]*[a-z]$/.test(r.name) || r.name.length > 22) faults.push(`${r.id}: bad name`)
  if (/\d/.test(r.name) || r.aliases.some((a) => /\d/.test(a))) faults.push(`${r.id}: names a model number`)
  if (r.drawings.length === 0 || r.drawings.some((d) => !(d in RELIC_DRAWINGS))) faults.push(`${r.id}: missing drawing`)
  const keys = [r.name, ...r.aliases].map(nameKey)
  if (new Set(keys).size !== keys.length) faults.push(`${r.id}: repeats a name`)
  if (![1, 2, 3].includes(r.tier)) faults.push(`${r.id}: bad tier`)
  if (r.decade < 1930 || r.decade > 1990 || r.decade % 10 !== 0) faults.push(`${r.id}: bad decade`)
  return faults
}

/** Two objects a reader could confuse; never on one page. */
export const relicsClash = (a: OfficeRelic, b: OfficeRelic) =>
  a.id === b.id || a.lookalikes.some((group) => b.lookalikes.includes(group))

/* ------------------------------------------------------------------ *
 * Choosing a page
 * ------------------------------------------------------------------ */

/** A page takes no more than this many objects from one category. */
export const MAX_PER_CATEGORY = 2

/** One object as it will print: which relic, which of its drawings, and which version of that drawing. */
export interface PlacedRelic {
  relic: OfficeRelic
  drawing: RelicDrawingId
  variant: RelicVariant
}

/**
 * The objects for one page, in the order they print.
 *
 * Nothing the book already shows is dealt again. Within what is left, the
 * level's preferred tiers come first, then objects this seller has not printed
 * recently (`recent`, newest last), so a second book starts with different
 * objects from the first. Each pick then goes to a category the page has used
 * least, so a page spans the office rather than clustering, and no decade may
 * fill more than half the page. Among what is left the seed chooses evenly, so
 * over many books every object turns up about as often as its tier allows.
 * Objects that clash with one already picked are passed over.
 *
 * Each picture is then dealt a version of its drawing (see `variants.ts`) from
 * the seller's salt and the seed, passing over versions in `recentArt`, so two
 * sellers — or one seller's two books — rarely print the same picture.
 *
 * Returns fewer than `count` only when the book has used up the catalog.
 */
export function pickRelics(options: {
  count: number
  level: OfficeRelicsLevel
  seed: number
  book?: readonly string[]
  recent?: readonly string[]
  /** The seller's puzzle salt; defaults to the anonymous one. */
  ownerSalt?: string
  /** `id:version` labels this seller printed lately. */
  recentArt?: readonly string[]
}): PlacedRelic[] {
  const { count, level, seed, book = [], recent = [], recentArt = [] } = options
  const ownerSalt = options.ownerSalt ?? resolveOwnerSalt({})
  const rng = createRng(deriveSeed(seed, `${OR_TEMPLATE_KEY}:pick`))
  const printed = new Set(book)
  const recently = new Set(recent)
  const { tierRank } = levelSpec(level)
  const rank = (r: OfficeRelic) => tierRank[r.tier] * 2 + (recently.has(r.id) ? 1 : 0)

  const pool = rng.shuffle(OFFICE_RELICS.filter((r) => !printed.has(r.id) && relicFaults(r).length === 0))
  const picked: OfficeRelic[] = []
  const least = <T>(items: readonly T[], score: (item: T) => number): T[] => {
    const low = Math.min(...items.map(score))
    return items.filter((item) => score(item) === low)
  }
  const onPage = (test: (r: OfficeRelic) => boolean) => picked.filter(test).length

  const decadeCap = Math.max(1, Math.ceil(count / 2))
  while (picked.length < count) {
    const open = pool.filter(
      (r) =>
        !picked.some((kept) => relicsClash(r, kept)) &&
        onPage((kept) => kept.category === r.category) < MAX_PER_CATEGORY &&
        onPage((kept) => kept.decade === r.decade) < decadeCap,
    )
    if (open.length === 0) break
    const best = least(open, rank)
    picked.push(rng.pick(least(best, (r) => onPage((kept) => kept.category === r.category))))
  }

  const printedArt = new Set(recentArt)
  return rng.shuffle(picked).map((r) => {
    const drawing = rng.pick(r.drawings)
    return { relic: r, drawing, variant: dealRelicVariant({ id: drawing, ownerSalt, seed, recent: printedArt }) }
  })
}

/** Relic ids the book already shows, from the labels its pages carry. */
export function bookRelicIds(labels: readonly string[]): string[] {
  return labels.map((label) => label.trim()).filter((label) => RELIC_INDEX.has(label))
}
