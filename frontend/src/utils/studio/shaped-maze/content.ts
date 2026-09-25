import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INSTRUCTION_SIZE } from '@/constants/studio.constants'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { estimateTextBoxWidth } from '../studio-layout'
import type { StudioRng } from '../studio-rng'
import type { MazeProfile } from '../maze/generator'
import {
  isValidSgVariant,
  sgVariantDrawing,
  sgVariantKey,
  sgVariants,
  type SgVariant,
} from '../stained-glass/content'
import type { SubjectDrawing } from '../stained-glass/subject-kit'
import { sgSubjectById, type SgSubject, type SgTheme } from '../stained-glass/subjects'
import { EXTRA_MAZE_SUBJECTS } from './subjects-extra'

/**
 * What a Shaped Maze page is made of, and how each page's design is chosen.
 *
 * A page is four choices: a shape (a teapot, a motorhome, a sun hat), a
 * version of its drawing (which knobs, which way it faces), a journey (where
 * the reader starts — the Office, the Alarm Clock — and where the shape takes
 * them — Tea Time, the Open Road) and the maze carved inside it. The shape is
 * the silhouette of the Studio's own retirement drawings, so the same library
 * that colors a teapot here holds a maze; the journey's finish belongs to the
 * shape, so a golf bag ends on the Fairway and a sailboat on Open Water.
 *
 * Every choice is dealt from a stream keyed by the seller's puzzle salt and
 * the page seed: two sellers on the same settings print different books, and
 * the same seed reprints the same page. Within a book nothing repeats while
 * anything else is left; across a seller's books, recently printed shapes
 * wait their turn. Every check is bounded by one book and one seller's recent
 * history — never a comparison with every page ever made.
 */

export const SM_TEMPLATE_KEY = 'shaped-maze'

export const SM_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a shaped maze at this level. Pick a larger page in Settings, or a gentler level.'

/**
 * The too-small message, naming the lever that actually moves it: Gentle
 * needs the widest paths, so on a narrow trim the fix is Classic, not "gentler".
 */
export function smPageTooSmallMessage(level: SmLevel): string {
  return level.id === 'gentle'
    ? 'This page size is too small for Gentle paths. Pick a larger page in Settings, or the Classic level.'
    : SM_PAGE_TOO_SMALL_MESSAGE
}
export const SM_BUILD_FAILED_MESSAGE =
  'Could not build a clean shaped maze for this page. Try again, or pick a gentler level.'

/* ------------------------------------------------------------------ *
 * Places
 * ------------------------------------------------------------------ */

/**
 * A place on the journey: `label` prints under START / FINISH, `phrase` is how
 * the instruction says it ("from *the Office* to *the Beach*"). Labels stay
 * short — they sit beside the maze, and every character there is paper the
 * corridors do not get.
 */
export interface SmPlace {
  label: string
  phrase: string
}

const place = (label: string, article = ''): SmPlace => ({
  label,
  phrase: article ? `${article} ${label}` : label,
})

/**
 * Where the working week started. Many kinds of work, not only desks: a
 * reader who drove a route, ran a shop floor or rang a school bell should
 * find their own week here too. Light, never bitter.
 */
export const SM_STARTS: readonly SmPlace[] = [
  place('Office', 'the'),
  place('Alarm Clock', 'the'),
  place('Monday Morning'),
  place('Rush Hour'),
  place('Time Clock', 'the'),
  place('Staff Meeting', 'the'),
  place('Inbox', 'the'),
  place('Commute', 'the'),
  place('Office Desk', 'the'),
  place('Night Shift', 'the'),
  place('Deadlines'),
  place('Paperwork'),
  place('Timesheet', 'the'),
  place('Conference Call', 'the'),
  place('Traffic Jam', 'the'),
  place('Cubicle', 'the'),
  place('Job Site', 'the'),
  place('Shop Floor', 'the'),
  place('Front Desk', 'the'),
  place('School Bell', 'the'),
  place('Board Meeting', 'the'),
  place('Overtime'),
  place('To-Do List', 'the'),
  place('Work Email'),
  place('Lunch Rush', 'the'),
  place('Nine-to-Five', 'the'),
  place('Loading Dock', 'the'),
  place('Staff Room', 'the'),
  place('Head Office', 'the'),
  place('Morning Meeting', 'the'),
  place('Early Shift', 'the'),
  place('Punch Card', 'the'),
  place('Memo Pile', 'the'),
  place('Workbench', 'the'),
]

/** Finishes any shape can end on, used when its own list has run through the book. */
const GENERIC_FINISHES: readonly SmPlace[] = [
  place('Free Time'),
  place('Relaxation'),
  place('Long Weekend', 'a'),
  place('Sunshine'),
  place('Me Time'),
  place('Easy Street'),
  place('Day Off', 'the'),
]

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

export interface SmShape {
  subject: SgSubject
  /** How the instruction names the shape, lower case: "the teapot". */
  noun: string
  /** Where this shape's journey ends. */
  finishes: readonly SmPlace[]
  /**
   * Knobs held at one value for the maze. A knob that adds a fine detail is
   * lovely to color and can cost the silhouette its identity — a lighthouse's
   * light beams, drawn as solid rays, turn its outline into an hourglass.
   */
  fixed?: Readonly<Record<string, number>>
}

const shape = (id: string, noun: string, finishes: SmPlace[], fixed?: Record<string, number>): SmShape | null => {
  const subject = sgSubjectById(id) ?? EXTRA_MAZE_SUBJECTS.find((s) => s.id === id)
  return subject ? { subject, noun, finishes, ...(fixed ? { fixed } : {}) } : null
}

/** The versions of a shape the maze may use: every drawing version, less the knobs it holds fixed. */
export function smShapeVariants(shape: SmShape): SgVariant[] {
  const fixed = shape.fixed
  const all = sgVariants(shape.subject)
  return fixed ? all.filter((v) => Object.entries(fixed).every(([knob, value]) => v.knobs[knob] === value)) : all
}

/**
 * The shapes that hold a maze well: strong outlines with one clear cue and
 * enough body for corridors. Left out of the shared library on purpose:
 *
 * * the radio, camera and open book — their outline is a rectangle, so the
 *   maze would be too;
 * * the pie and yarn basket — a blob;
 * * the fishing scene and the garden tools — several objects, not one shape;
 * * the hot-air balloon — its basket hangs free of the envelope;
 * * the gramophone, paint palette, bicycle, wheelbarrow and songbird — at
 *   maze resolution the outline loses the one detail that names them;
 * * the beach chair and rocking chair — an umbrella pole and a slim runner
 *   are too thin for a corridor, so maze-drawn ones take their place.
 *
 * Every page still measures its own shape before it prints; this list only
 * decides which are worth trying.
 */
export const SM_SHAPES: readonly SmShape[] = [
  // Home comforts
  shape('teapot', 'teapot', [place('Tea Time'), place('Afternoon Tea'), place('Second Cup', 'a'), place('Tea Party', 'the')]),
  shape('coffee-mug', 'coffee mug', [place('Slow Coffee'), place('Lazy Morning', 'a'), place('Porch Coffee'), place('Second Cup', 'a')]),
  shape('teacup', 'teacup', [place('Tea Time'), place('Quiet Morning', 'a'), place('Tea Party', 'the'), place('Biscuit Tin', 'the')]),
  shape('porch-rocker', 'rocking chair', [place('Front Porch', 'the'), place('Easy Chair', 'the'), place('Good Book', 'a'), place('Quiet Afternoon', 'a')]),
  shape('houseplant', 'houseplant', [place('Sunny Window', 'the'), place('Reading Nook', 'the'), place('Plant Shelf', 'the')]),
  shape('cottage', 'cottage', [place('Cozy Cottage', 'the'), place('Front Porch', 'the'), place('Home Sweet Home'), place('Garden Gate', 'the')]),
  shape('sleeping-cat', 'sleeping cat', [place('Nap Time'), place('Cozy Couch', 'the'), place('Cat Nap', 'a'), place('Sunny Spot', 'the')]),
  // Travel & getaways
  shape('sailboat', 'sailboat', [place('Open Water'), place('Harbor', 'the'), place('Calm Bay', 'the'), place('Sailing Day', 'a')]),
  shape('motorhome', 'motorhome', [place('Open Road', 'the'), place('Campground', 'the'), place('Scenic Route', 'the'), place('Road Trip', 'the')]),
  shape('camper-trailer', 'camper', [place('Campsite', 'the'), place('Lakeside', 'the'), place('Open Road', 'the'), place('Starry Sky', 'a')]),
  shape('suitcase', 'suitcase', [place('Vacation'), place('Getaway', 'the'), place('Grand Tour', 'the'), place('Departure Gate', 'the')]),
  shape('camping-tent', 'tent', [place('Campsite', 'the'), place('Great Outdoors', 'the'), place('Starry Night', 'a'), place('Campfire', 'the')]),
  shape('cruise-ship', 'cruise ship', [place('Cruise', 'the'), place('Island Port', 'the'), place('Sea Days'), place('Ocean View', 'the')]),
  shape('lighthouse', 'lighthouse', [place('Seaside', 'the'), place('Coastline', 'the'), place('Harbor View', 'the'), place('Seashore', 'the')], { beams: 0 }),
  shape('steam-train', 'steam train', [place('Scenic Railway', 'the'), place('Countryside', 'the'), place('Grand Tour', 'the'), place('Last Stop', 'the')]),
  shape('deck-chair', 'beach chair', [place('Beach', 'the'), place('Sandy Shore', 'the'), place('Seaside', 'the'), place('Sunshine')]),
  shape('sun-hat', 'sun hat', [place('Beach', 'the'), place('Sunshine'), place('Boardwalk', 'the'), place('Seaside', 'the')]),
  // Garden & outdoors
  shape('watering-can', 'watering can', [place('Garden', 'the'), place('Flower Bed', 'the'), place('Veggie Patch', 'the'), place('Rose Bush', 'the')]),
  shape('birdhouse', 'birdhouse', [place('Bird Watching'), place('Backyard', 'the'), place('Garden', 'the'), place('Bird Bath', 'the')]),
  shape('butterfly', 'butterfly', [place('Wildflowers'), place('Flower Meadow', 'the'), place('Butterfly Garden', 'the')]),
  shape('picnic-basket', 'picnic basket', [place('Picnic', 'the'), place('Park Bench', 'the'), place('Meadow', 'the'), place('Lakeside', 'the')]),
  shape('sunflower', 'sunflower', [place('Sunny Garden', 'the'), place('Flower Farm', 'the'), place('Sunshine')]),
  shape('flower-pot', 'flower pot', [place('Greenhouse', 'the'), place('Garden', 'the'), place('Potting Bench', 'the')]),
  shape('garden-shed', 'garden shed', [place('Garden', 'the'), place('Potting Bench', 'the'), place('Veggie Patch', 'the'), place('Tool Shed', 'the')]),
  shape('hammock', 'hammock', [place('Hammock', 'the'), place('Nap Time'), place('Shady Spot', 'a'), place('Lazy Sunday', 'a')]),
  // Hobbies & pastimes
  shape('golf-bag', 'golf bag', [place('Golf Course', 'the'), place('Fairway', 'the'), place('Clubhouse', 'the'), place('Putting Green', 'the')]),
  shape('golf-cart', 'golf cart', [place('Golf Course', 'the'), place('Back Nine', 'the'), place('Fairway', 'the'), place('Clubhouse', 'the')]),
  shape('fishing-boat', 'fishing boat', [place('Fishing Spot', 'the'), place('Quiet Lake', 'a'), place('Big Catch', 'the'), place('Boat Dock', 'the')]),
  shape('acoustic-guitar', 'guitar', [place('Jam Session', 'the'), place('Music Night'), place('Campfire Song', 'a')]),
  shape('binoculars', 'binoculars', [place('Nature Trail', 'the'), place('Bird Watching'), place('Lookout', 'the')]),
  shape('pickleball-paddle', 'paddle', [place('Pickleball Court', 'the'), place('Rec Center', 'the'), place('Match Point')]),
  shape('chess-knight', 'chess knight', [place('Chess Club', 'the'), place('Game Night'), place('Checkmate')]),
  shape('hiking-boot', 'hiking boot', [place('Nature Trail', 'the'), place('Mountain View', 'the'), place('Scenic Overlook', 'the')]),
].filter((s): s is SmShape => s !== null)

const SHAPE_INDEX = new Map(SM_SHAPES.map((s) => [s.subject.id, s]))
export const smShapeById = (id: string) => SHAPE_INDEX.get(id)

/* ------------------------------------------------------------------ *
 * Themes
 * ------------------------------------------------------------------ */

export type SmThemeChoice = 'mix' | SgTheme

export const SM_THEMES: readonly { value: SmThemeChoice; label: string; examples: string }[] = [
  { value: 'mix', label: 'A mix of everything', examples: 'teapots, motorhomes, sun hats, golf carts and more' },
  { value: 'home', label: 'Home comforts', examples: 'a teapot, a coffee mug, a rocking chair, a sleeping cat' },
  { value: 'travel', label: 'Travel & getaways', examples: 'a motorhome, a cruise ship, a suitcase, a sun hat' },
  { value: 'garden', label: 'Garden & outdoors', examples: 'a watering can, a garden shed, a hammock, a birdhouse' },
  { value: 'hobbies', label: 'Hobbies & pastimes', examples: 'a golf cart, a fishing boat, a pickleball paddle, a chess knight' },
]

export const DEFAULT_SM_THEME: SmThemeChoice = 'mix'

export function parseSmTheme(raw: unknown): SmThemeChoice {
  const value = String(raw ?? '')
  return SM_THEMES.some((t) => t.value === value) ? (value as SmThemeChoice) : DEFAULT_SM_THEME
}

export const smThemeShapes = (theme: SmThemeChoice): readonly SmShape[] =>
  theme === 'mix' ? SM_SHAPES : SM_SHAPES.filter((s) => s.subject.theme === theme)

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type SmLevelId = 'gentle' | 'classic' | 'challenging'

export interface SmLevel {
  id: SmLevelId
  label: string
  /** Corridor width band, canvas px. The floor is what a pencil needs; nothing prints narrower. */
  minPath: number
  maxPath: number
  /**
   * Cells the level aims to lay across the shape's longer side. More cells
   * draw a truer outline and a longer walk; the corridor band caps how far a
   * page may go for them.
   */
  targetCells: number
  /** Fewest cells a maze at this level may hold, whatever the shape. */
  minCells: number
  profile: MazeProfile
}

const inches = (value: number): number => Math.round(value * DPI)

/**
 * Three levels, one question. What a level really sets is the corridor width
 * and how many cells the shape is cut into; route length, dead ends and how
 * long the straight runs are follow from it, as in the regular Maze. Even
 * Challenging keeps corridors a quarter inch wide: a harder maze is a longer,
 * twistier walk, never a narrower one.
 */
export const SM_LEVELS: readonly SmLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — wide paths, a relaxing walk',
    minPath: inches(0.3),
    maxPath: inches(0.4),
    targetCells: 15,
    minCells: 55,
    profile: { straightness: 0.64, routeShare: 0.24, deadEndShare: 0.15, minRouteFactor: 0.9 },
  },
  {
    id: 'classic',
    label: 'Classic — the everyday maze',
    minPath: inches(0.26),
    maxPath: inches(0.34),
    targetCells: 20,
    minCells: 80,
    profile: { straightness: 0.5, routeShare: 0.3, deadEndShare: 0.21, minRouteFactor: 1.2 },
  },
  {
    id: 'challenging',
    label: 'Challenging — longer route, more turns',
    minPath: inches(0.24),
    maxPath: inches(0.3),
    targetCells: 26,
    minCells: 105,
    profile: { straightness: 0.4, routeShare: 0.38, deadEndShare: 0.26, minRouteFactor: 1.5 },
  },
]

export const DEFAULT_SM_LEVEL_ID: SmLevelId = 'classic'

export const SM_LEVEL_OPTIONS: StudioSelectOption[] = SM_LEVELS.map((level) => ({ label: level.label, value: level.id }))

export function parseSmLevel(config: StudioConfig): SmLevel {
  return SM_LEVELS.find((level) => level.id === config.level) ?? SM_LEVELS.find((l) => l.id === DEFAULT_SM_LEVEL_ID)!
}

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

/**
 * One line that tells the story of the page. `{shape}` is the silhouette,
 * `{start}` / `{finish}` the journey. Short on purpose: the maze keeps the
 * page, and the wording rotates so a book of thirty mazes does not read like
 * a form.
 */
const SM_INSTRUCTIONS: readonly string[] = [
  'Find your way from {start} to {finish}.',
  'Leave {start} behind and head for {finish}.',
  'Trade {start} for {finish}. Trace the one path.',
  'From {start} to {finish}: trace the only way through.',
  'Escape {start} and make your way to {finish}.',
  'Wind through the {shape} from {start} to {finish}.',
  'Swap {start} for {finish}. Only one path gets there.',
  'Get from {start} to {finish} without crossing a wall.',
  'Find the path from {start} to {finish}.',
  // Short ones, so a narrow trim still has a few to rotate through.
  'Head from {start} to {finish}.',
  'Leave {start} for {finish}.',
  'Trade {start} for {finish}.',
  'Swap {start} for {finish}.',
  'Go from {start} to {finish}.',
]

/**
 * Share of the column an instruction may take and still count as one line.
 * The header measures with an estimate; real glyphs run a little wider.
 */
const ONE_LINE_SHARE = 0.86

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function fillInstruction(pattern: string, journey: SmJourney, noun: string): string {
  const text = pattern
    .replace('{start}', journey.start.phrase)
    .replace('{finish}', journey.finish.phrase)
    .replace('{shape}', noun)
  return capitalise(text)
}

/* ------------------------------------------------------------------ *
 * What the book already shows
 * ------------------------------------------------------------------ */

export interface SmJourney {
  start: SmPlace
  finish: SmPlace
}

/** One printed page as the book remembers it. */
export interface SmBookEntry {
  shape: string
  variant: string
  start: string
  finish: string
}

/** The label a page carries: `shape|version|start|finish`. */
export const smPageLabel = (entry: SmBookEntry) => `${entry.shape}|${entry.variant}|${entry.start}|${entry.finish}`

/** The pages the book already shows, from the labels they carry. Unknown labels are ignored. */
export function parseSmBook(labels: readonly string[]): SmBookEntry[] {
  const out: SmBookEntry[] = []
  for (const label of labels) {
    const [shape, variant, start, finish] = label.split('|')
    if (!shape || !variant || !start || !finish || !smShapeById(shape)) continue
    out.push({ shape, variant, start, finish })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Choosing a page
 * ------------------------------------------------------------------ */

export interface SmDesign {
  shape: SmShape
  variant: SgVariant
  journey: SmJourney
  /** The page's instruction, already filled in ('' when instructions are off). */
  instruction: string
}

export const smDesignEntry = (design: SmDesign): SmBookEntry => ({
  shape: design.shape.subject.id,
  variant: sgVariantKey(design.shape.subject, design.variant),
  start: design.journey.start.label,
  finish: design.journey.finish.label,
})

export const smDesignDrawing = (design: SmDesign): SubjectDrawing =>
  sgVariantDrawing(design.shape.subject, design.variant)

export const isValidSmDesign = (design: SmDesign) => isValidSgVariant(design.shape.subject, design.variant)

/** The least-used entries of a list, by a use count. Ties are the RNG's to break. */
function leastUsed<T>(items: readonly T[], uses: (item: T) => number): T[] {
  const low = Math.min(...items.map(uses))
  return items.filter((item) => uses(item) === low)
}

function pickJourney(shape: SmShape, book: readonly SmBookEntry[], rng: StudioRng): SmJourney {
  // Starts: the ones this book has used least, so thirty pages visit thirty workdays.
  const startUses = (p: SmPlace) => book.filter((e) => e.start === p.label).length
  const start = rng.pick(leastUsed(SM_STARTS, startUses))
  // Finishes: this shape's own first; the generic ones only once those have all printed.
  const finishUses = (p: SmPlace) => book.filter((e) => e.shape === shape.subject.id && e.finish === p.label).length
  const own = leastUsed(shape.finishes, finishUses)
  const ownExhausted = finishUses(own[0]!) > 0
  const pool = ownExhausted ? [...own, ...leastUsed(GENERIC_FINISHES, (p) => book.filter((e) => e.finish === p.label).length)] : own
  const finish = rng.pick(pool.filter((p) => p.label !== start.label))
  return { start, finish }
}

/**
 * The instruction this page prints. A seeded pick among the phrasings short
 * enough to sit on one line, so the wording varies page to page without ever
 * pushing the maze down the sheet.
 */
export function smInstruction(
  config: StudioConfig,
  design: Omit<SmDesign, 'instruction'>,
  rng: StudioRng,
  columnWidth: number,
): string {
  if (config.showInstructions === false) return ''
  const filled = SM_INSTRUCTIONS.map((pattern) => fillInstruction(pattern, design.journey, design.shape.noun))
  const width = (text: string) => estimateTextBoxWidth(text, STUDIO_INSTRUCTION_SIZE, Number.POSITIVE_INFINITY)
  const oneLine = filled.filter((text) => width(text) <= columnWidth * ONE_LINE_SHARE)
  if (oneLine.length > 0) return rng.pick(oneLine)
  return filled.reduce((best, text) => (width(text) < width(best) ? text : best))
}

/**
 * The design for one page.
 *
 * Shape: the theme's least-used shapes in this book first, then those this
 * seller has not printed lately (`recent`), then the salted seed. `exclude`
 * drops shapes an earlier attempt at this page could not build a clean maze
 * in. Version: never one the book already shows, then not one the seller
 * printed lately (`recentArt`, `shape:version`). Journey: a start this book
 * has used least and a finish that belongs to the shape.
 */
export function pickSmDesign(options: {
  config: StudioConfig
  theme: SmThemeChoice
  level: SmLevel
  seed: number
  ownerSalt: string
  book?: readonly SmBookEntry[]
  recent?: readonly string[]
  recentArt?: readonly string[]
  exclude?: ReadonlySet<string>
  excludeArt?: ReadonlySet<string>
  attempt?: number
  /** Width of the column the instruction prints in, px. */
  columnWidth: number
}): SmDesign | null {
  const { config, theme, level, seed, ownerSalt, book = [], recent = [], recentArt = [], exclude, excludeArt, attempt = 0, columnWidth } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: SM_TEMPLATE_KEY,
    configHash: `pick:${theme}:${level.id}`,
    pageNonce: seed,
    stream: String(attempt),
  })
  const usable = (s: SmShape) => smShapeVariants(s).some((v) => !excludeArt?.has(`${s.subject.id}:${sgVariantKey(s.subject, v)}`))
  const pool = smThemeShapes(theme).filter((s) => !exclude?.has(s.subject.id) && usable(s))
  if (pool.length === 0) return null

  const uses = (id: string) => book.filter((entry) => entry.shape === id).length
  const recently = new Set(recent)
  const last = book[book.length - 1]
  const rank = (s: SmShape) =>
    uses(s.subject.id) * 4 + (recently.has(s.subject.id) ? 2 : 0) + (last?.shape === s.subject.id ? 8 : 0)
  const shape = rng.pick(leastUsed(pool, rank))

  const subject = shape.subject
  const inBook = new Set(book.filter((e) => e.shape === subject.id).map((e) => e.variant))
  const printed = new Set(recentArt)
  const all = smShapeVariants(shape).filter((v) => !excludeArt?.has(`${subject.id}:${sgVariantKey(subject, v)}`))
  if (all.length === 0) return null
  const fresh = all.filter((v) => !inBook.has(sgVariantKey(subject, v)))
  const candidates = fresh.length > 0 ? fresh : all
  const unseen = candidates.filter((v) => !printed.has(`${subject.id}:${sgVariantKey(subject, v)}`))
  const variant = rng.pick(unseen.length > 0 ? unseen : candidates)

  const journey = pickJourney(shape, book, rng)
  const base = { shape, variant, journey }
  return { ...base, instruction: smInstruction(config, base, rng, columnWidth) }
}
