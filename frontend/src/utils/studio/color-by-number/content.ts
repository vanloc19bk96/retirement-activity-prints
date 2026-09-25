import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import {
  isValidSgVariant,
  sgVariantDrawing,
  sgVariantKey,
  sgVariants,
  type SgVariant,
} from '../stained-glass/content'
import type { SubjectDrawing } from '../stained-glass/subject-kit'
import { SG_SUBJECTS, sgSubjectById, type SgSubject, type SgTheme } from '../stained-glass/subjects'
import type { CbnSpaceRules } from './paint'
import { cbnPaletteById, cbnPalettesFor, type CbnPalette } from './palette'
import {
  compositionKey,
  dealComposition,
  parseCompositionKey,
  settingFor,
  type CbnComposition,
  type CbnRichness,
} from './scene'

/**
 * What a Color by Number page shows, and how each page's design is chosen.
 *
 * A page is four choices: a subject (a teapot, a motorhome, a sunflower), a
 * version of its drawing, a mood (the palette: a summer day, golden hour, a
 * cozy room...) and a composition (the scene round the subject: hills or a
 * shoreline or a room, sun, clouds, trees, window, rug...). The subjects are
 * the Studio's own retirement library — everyday pleasures drawn from plain
 * geometry for these books, never traced from anything — and each has
 * 16–36 versions, so the same subject returns as a different drawing in a
 * different scene.
 *
 * Every choice is dealt from a stream keyed by the seller's puzzle salt and
 * the page seed, so two sellers on the same settings print different books
 * and the same seed reprints the same page. Within a book nothing repeats
 * while anything else is left; across a seller's books, recently printed
 * subjects and versions wait their turn. Every check is bounded by one book
 * and one seller's recent history — never a comparison with every page ever
 * made.
 */

export const CBN_TEMPLATE_KEY = 'color-by-number'
export const CBN_DEFAULT_TITLE = 'Color by Number'

export const CBN_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Color by Number scene. Pick a larger page in Settings.'
export const CBN_BUILD_FAILED_MESSAGE = 'Could not build a clean Color by Number scene for this page. Try again.'

/* ------------------------------------------------------------------ *
 * Themes
 * ------------------------------------------------------------------ */

export type CbnThemeChoice = 'mix' | SgTheme

export const CBN_THEMES: readonly { value: CbnThemeChoice; label: string; examples: string }[] = [
  { value: 'mix', label: 'A mix of scenes', examples: 'porches, gardens, seaside days, road trips and cozy rooms' },
  { value: 'home', label: 'Cozy home', examples: 'a rocking chair by the window, tea on the table, a sleeping cat' },
  { value: 'travel', label: 'Travel & getaways', examples: 'a motorhome in the hills, a sailboat, a beach chair, a lighthouse' },
  { value: 'garden', label: 'Garden & outdoors', examples: 'sunflowers, a watering can, a birdhouse, a picnic in the meadow' },
  { value: 'hobbies', label: 'Hobbies & pastimes', examples: 'fishing, golf, cycling, painting, music and photography' },
]

export const DEFAULT_CBN_THEME: CbnThemeChoice = 'mix'

export function parseCbnTheme(raw: unknown): CbnThemeChoice {
  const value = String(raw ?? '')
  return CBN_THEMES.some((t) => t.value === value) ? (value as CbnThemeChoice) : DEFAULT_CBN_THEME
}

export const cbnThemeSubjects = (theme: CbnThemeChoice): readonly SgSubject[] =>
  theme === 'mix' ? SG_SUBJECTS : SG_SUBJECTS.filter((s) => s.theme === theme)

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type CbnLevel = 'relaxed' | 'classic' | 'detailed'

export interface CbnLevelSpec {
  value: CbnLevel
  label: string
  rules: CbnSpaceRules
  richness: CbnRichness
  /** Most colors the scene alone may put on the key, leaving the subject room for its own. */
  budget: number
  /** Scales the subject's usual share of the scene: Relaxed prints it bigger. */
  fill: number
  spaces: { min: number; max: number }
  /** Largest share of the scene one space may take before the page reads as unfinished. */
  maxSpaceShare: number
}

const inch2 = (n: number) => n * DPI * DPI

/**
 * How full the scene is and how big its numbers print. Numbers are never
 * below 9 pt (12 canvas px) on any level; Relaxed prints them at 12 pt (a
 * tight space in the drawing may take 9.75 pt): large enough to read
 * without glasses, small enough to leave the space for coloring.
 */
export const CBN_LEVELS: readonly CbnLevelSpec[] = [
  {
    value: 'relaxed',
    label: 'Relaxed — fewer, bigger spaces and large numbers',
    rules: { numberSize: 16, minNumberSize: 13, minArea: inch2(0.08) },
    richness: 0,
    budget: 4,
    fill: 1.08,
    spaces: { min: 10, max: 70 },
    maxSpaceShare: 0.5,
  },
  {
    value: 'classic',
    label: 'Classic — a fuller scene',
    rules: { numberSize: 14, minNumberSize: 12, minArea: inch2(0.055) },
    richness: 1,
    budget: 5,
    fill: 1,
    spaces: { min: 12, max: 120 },
    maxSpaceShare: 0.45,
  },
  {
    value: 'detailed',
    label: 'Detailed — more spaces for a longer session',
    rules: { numberSize: 13, minNumberSize: 12, minArea: inch2(0.045) },
    richness: 2,
    budget: 6,
    fill: 0.94,
    spaces: { min: 16, max: 160 },
    maxSpaceShare: 0.42,
  },
]

export const DEFAULT_CBN_LEVEL: CbnLevel = 'classic'

export function parseCbnLevel(raw: unknown): CbnLevel {
  const value = String(raw ?? '')
  return CBN_LEVELS.some((l) => l.value === value) ? (value as CbnLevel) : DEFAULT_CBN_LEVEL
}

export const cbnLevelSpec = (level: CbnLevel) => CBN_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * The key
 * ------------------------------------------------------------------ */

/**
 * `names` prints each key entry as its number, an empty box to try the
 * pencil in, and the color's name — right for the black-ink interiors most
 * KDP paperbacks use. `swatches` fills the box with the color, for books
 * printed in color; the name still prints, so the key reads either way.
 */
export type CbnKeyStyle = 'names' | 'swatches'

export const CBN_KEY_STYLES: readonly { value: CbnKeyStyle; label: string; help: string }[] = [
  {
    value: 'names',
    label: 'Color names (black & white books)',
    help: 'Each number is matched to a color name, with an empty box to try the pencil first. Right for most KDP paperbacks.',
  },
  {
    value: 'swatches',
    label: 'Color swatches (color-printed books)',
    help: 'Each box is filled with its color, and the name still prints. Only for books with a color interior.',
  },
]

export const DEFAULT_CBN_KEY_STYLE: CbnKeyStyle = 'names'

export function parseCbnKeyStyle(raw: unknown): CbnKeyStyle {
  return raw === 'swatches' ? 'swatches' : 'names'
}

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

/** One short line, so the scene keeps the page. A seller's house style prints one of them. */
const CBN_INSTRUCTIONS = [
  'Color each space with the color of its number in the key.',
  'Find each number in the color key and color its spaces to match.',
  'Match every number to its color in the key, then fill in the spaces.',
] as const

export function cbnInstructionOptions(config: StudioConfig): readonly string[] {
  return config.showInstructions === false ? [] : CBN_INSTRUCTIONS
}

/** The phrasing this seller prints: fixed per account, so a book reads in one voice. */
export function cbnInstruction(config: StudioConfig, ownerSalt: string): string {
  const options = cbnInstructionOptions(config)
  if (options.length === 0) return ''
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: CBN_TEMPLATE_KEY, configHash: 'house-style', pageNonce: 'v1' })
  return rng.pick(options)
}

/* ------------------------------------------------------------------ *
 * What the book already shows
 * ------------------------------------------------------------------ */

/** One printed page as the book remembers it. */
export interface CbnBookEntry {
  subject: string
  variant: string
  composition: string
  palette: string
}

/** The label a page carries: `subject|version|composition|palette`. Two pages with the same label are the same design. */
export const cbnPageLabel = (entry: CbnBookEntry) => `${entry.subject}|${entry.variant}|${entry.composition}|${entry.palette}`

/** The pages the book already shows, from the labels they carry. Unknown labels are ignored. */
export function parseCbnBook(labels: readonly string[]): CbnBookEntry[] {
  const out: CbnBookEntry[] = []
  for (const label of labels) {
    const [subject, variant, composition, palette] = label.split('|')
    if (!subject || !variant || !composition || !palette || !sgSubjectById(subject) || !cbnPaletteById(palette)) continue
    out.push({ subject, variant, composition, palette })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Choosing a page
 * ------------------------------------------------------------------ */

export interface CbnDesign {
  subject: SgSubject
  variant: SgVariant
  palette: CbnPalette
  composition: CbnComposition
}

export const cbnDesignEntry = (design: CbnDesign): CbnBookEntry => ({
  subject: design.subject.id,
  variant: sgVariantKey(design.subject, design.variant),
  composition: compositionKey(design.composition),
  palette: design.palette.id,
})

export const cbnDesignDrawing = (design: CbnDesign): SubjectDrawing => sgVariantDrawing(design.subject, design.variant)

export const isValidCbnDesign = (design: CbnDesign) => isValidSgVariant(design.subject, design.variant)

/**
 * The design for one page.
 *
 * Subject: the theme's least-used subjects in this book first, then those
 * this seller has not printed lately (`recent`), then the salted seed.
 * `exclude` drops subjects an earlier attempt at this page could not build.
 * Version: never one the book already shows, then not one the seller printed
 * lately (`recentArt`, `subject:version`). Mood: the one this book has used
 * least for the setting, never the previous page's. Composition: as far as
 * possible from the page before and from this subject's earlier pages, so a
 * returning subject never returns in the same scene.
 */
export function pickCbnDesign(options: {
  theme: CbnThemeChoice
  level: CbnLevelSpec
  seed: number
  ownerSalt: string
  aspect: number
  /** The scene's shorter side, inches. */
  span?: number
  book?: readonly CbnBookEntry[]
  recent?: readonly string[]
  recentArt?: readonly string[]
  exclude?: ReadonlySet<string>
  /** Versions an earlier attempt at this page could not build (`subject:version`). */
  excludeArt?: ReadonlySet<string>
  attempt?: number
}): CbnDesign | null {
  const { theme, level, seed, ownerSalt, aspect, span, book = [], recent = [], recentArt = [], exclude, excludeArt, attempt = 0 } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: CBN_TEMPLATE_KEY,
    configHash: `pick:${theme}:${level.value}`,
    pageNonce: seed,
    stream: String(attempt),
  })
  const pool = cbnThemeSubjects(theme).filter((s) => !exclude?.has(s.id))
  if (pool.length === 0) return null

  const uses = (id: string) => book.filter((entry) => entry.subject === id).length
  const recently = new Set(recent)
  // Settings spread too: a book of travel scenes should not print four shorelines in a row.
  const lastSetting = book.length > 0 ? settingOfEntry(book[book.length - 1]!) : null
  const rank = (s: SgSubject) => uses(s.id) * 4 + (recently.has(s.id) ? 2 : 0) + (settingFor(s) === lastSetting ? 1 : 0)
  const low = Math.min(...pool.map(rank))
  const subject = rng.pick(pool.filter((s) => rank(s) === low))

  const inBook = new Set(book.filter((e) => e.subject === subject.id).map((e) => e.variant))
  const printed = new Set(recentArt)
  const all = sgVariants(subject).filter((v) => !excludeArt?.has(`${subject.id}:${sgVariantKey(subject, v)}`))
  if (all.length === 0) return null
  const fresh = all.filter((v) => !inBook.has(sgVariantKey(subject, v)))
  const candidates = fresh.length > 0 ? fresh : all
  const unseen = candidates.filter((v) => !printed.has(`${subject.id}:${sgVariantKey(subject, v)}`))
  const variant = rng.pick(unseen.length > 0 ? unseen : candidates)

  const setting = settingFor(subject)
  const moods = cbnPalettesFor(setting === 'room' ? 'indoor' : 'outdoor')
  const last = book[book.length - 1]
  const moodUses = (id: string) => book.filter((e) => e.palette === id).length
  const moodRank = (p: CbnPalette) => moodUses(p.id) * 2 + (last?.palette === p.id ? 3 : 0)
  const lowMood = Math.min(...moods.map(moodRank))
  const palette = rng.pick(moods.filter((p) => moodRank(p) === lowMood))

  const avoid = book
    .filter((e) => e.subject === subject.id || e === last)
    .map((e) => parseCompositionKey(e.composition))
    .filter((c): c is CbnComposition => c !== null)
  const composition = dealComposition({ subject, palette, rng, richness: level.richness, budget: level.budget, aspect, span, avoid })
  return { subject, variant, palette, composition }
}

function settingOfEntry(entry: CbnBookEntry) {
  const subject = sgSubjectById(entry.subject)
  return subject ? settingFor(subject) : null
}
