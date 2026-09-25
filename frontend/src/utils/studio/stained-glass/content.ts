import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { compositionKey, dealComposition, type SgComposition, type SgFavor } from './composition'
import type { SgDetail } from './mosaic'
import { mirrorDrawing, type SubjectDrawing } from './subject-kit'
import { SG_SUBJECTS, sgSubjectById, type SgKnobValues, type SgSubject, type SgTheme } from './subjects'

/**
 * What a Stained Glass page shows, and how each page's design is chosen.
 *
 * A page is three independent choices: a subject (a teapot, a sailboat), a
 * version of its drawing (which knobs, which way it faces) and a composition
 * (window, border, background pattern, scenery). Each is dealt from a stream
 * keyed by the seller's puzzle salt and the page seed, so two sellers on the
 * same settings print different books, and the same seed reprints the same
 * page.
 *
 * Within a book, nothing is repeated while anything else is left: subjects
 * the book already shows wait until the theme has been used up, and when a
 * subject does return it comes back as a version and a composition the book
 * has not printed. Across a seller's books, recently printed subjects and
 * versions are passed over first, so a second book does not open like the
 * first.
 */

export const SG_TEMPLATE_KEY = 'stained-glass'
export const SG_DEFAULT_TITLE = 'Stained Glass'

export const SG_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a stained-glass design. Pick a larger page in Settings.'
export const SG_BUILD_FAILED_MESSAGE = 'Could not build a clean stained-glass design for this page. Try again.'

/* ------------------------------------------------------------------ *
 * Themes
 * ------------------------------------------------------------------ */

export type SgThemeChoice = 'mix' | SgTheme

export const SG_THEMES: readonly { value: SgThemeChoice; label: string; examples: string }[] = [
  { value: 'mix', label: 'A mix of everything', examples: 'rocking chairs, sailboats, sunflowers, guitars and more' },
  { value: 'home', label: 'Home comforts', examples: 'teacups, rocking chairs, a sleeping cat, a fresh-baked pie' },
  { value: 'travel', label: 'Travel & getaways', examples: 'sailboats, motorhomes, cruise ships, lighthouses' },
  { value: 'garden', label: 'Garden & outdoors', examples: 'watering cans, sunflowers, birdhouses, butterflies' },
  { value: 'hobbies', label: 'Hobbies & pastimes', examples: 'fishing, golf, painting, music and photography' },
]

export const DEFAULT_SG_THEME: SgThemeChoice = 'mix'

export function parseSgTheme(raw: unknown): SgThemeChoice {
  const value = String(raw ?? '')
  return SG_THEMES.some((t) => t.value === value) ? (value as SgThemeChoice) : DEFAULT_SG_THEME
}

export const themeSubjects = (theme: SgThemeChoice): readonly SgSubject[] =>
  theme === 'mix' ? SG_SUBJECTS : SG_SUBJECTS.filter((s) => s.theme === theme)

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type SgLevel = 'relaxed' | 'classic' | 'intricate'

interface LevelSpec {
  value: SgLevel
  label: string
  /** Target background cell, inches across. */
  cellInches: number
  detail: SgDetail
}

const inch = (n: number) => n * DPI

/**
 * How big the pieces of glass are. Sizes are absolute — a quarter-inch piece
 * is a quarter inch on every trim — so a bigger page gets more pieces, never
 * smaller ones. Even Intricate keeps every piece wider than a sixth of an
 * inch, comfortable with a colored pencil.
 */
export const SG_LEVELS: readonly LevelSpec[] = [
  {
    value: 'relaxed',
    label: 'Relaxed — big pieces, quick and easy to color',
    cellInches: 1.1,
    detail: { cell: inch(1.1), subjectCell: inch(1.3), minWidth: inch(0.24), minArea: inch(0.14) * DPI },
  },
  {
    value: 'classic',
    label: 'Classic — a balanced mix of pieces',
    cellInches: 0.85,
    detail: { cell: inch(0.85), subjectCell: inch(1.0), minWidth: inch(0.19), minArea: inch(0.09) * DPI },
  },
  {
    value: 'intricate',
    label: 'Intricate — more pieces for a longer session',
    cellInches: 0.66,
    detail: { cell: inch(0.66), subjectCell: inch(0.8), minWidth: inch(0.16), minArea: inch(0.06) * DPI },
  },
]

export const DEFAULT_SG_LEVEL: SgLevel = 'classic'

export function parseSgLevel(raw: unknown): SgLevel {
  const value = String(raw ?? '')
  return SG_LEVELS.some((l) => l.value === value) ? (value as SgLevel) : DEFAULT_SG_LEVEL
}

export const sgLevelSpec = (level: SgLevel) => SG_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

/** One short line, so the glass keeps the page. A seller's house style prints one of them. */
const SG_INSTRUCTIONS = [
  'Color each piece of glass any way you like.',
  'Choose your colors and fill in every piece of glass.',
  'Fill each piece of glass with the colors you love.',
] as const

export function sgInstructionOptions(config: StudioConfig): readonly string[] {
  return config.showInstructions === false ? [] : SG_INSTRUCTIONS
}

/** The phrasing this seller prints: fixed per account, so a book reads in one voice. */
export function sgInstruction(config: StudioConfig, ownerSalt: string): string {
  const options = sgInstructionOptions(config)
  if (options.length === 0) return ''
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: SG_TEMPLATE_KEY, configHash: 'house-style', pageNonce: 'v1' })
  return rng.pick(options)
}

/* ------------------------------------------------------------------ *
 * Versions of a subject
 * ------------------------------------------------------------------ */

export interface SgVariant {
  knobs: SgKnobValues
  mirrored: boolean
}

/** Stable, readable name of a version: `back1.rocker0.arm1` plus `.m` when mirrored. */
export function sgVariantKey(subject: SgSubject, variant: SgVariant): string {
  const knobs = Object.keys(subject.knobs).map((name) => `${name}${variant.knobs[name] ?? 0}`)
  return [...knobs, ...(variant.mirrored ? ['m'] : [])].join('.') || 'ref'
}

/** Every version a subject has, reference first. */
export function sgVariants(subject: SgSubject): SgVariant[] {
  let combos: Record<string, number>[] = [{}]
  for (const [name, count] of Object.entries(subject.knobs)) {
    combos = combos.flatMap((combo) => Array.from({ length: count }, (_, value) => ({ ...combo, [name]: value })))
  }
  return combos.flatMap((knobs) => [{ knobs, mirrored: false }, ...(subject.mirror ? [{ knobs, mirrored: true }] : [])])
}

export function isValidSgVariant(subject: SgSubject, variant: SgVariant): boolean {
  if (variant.mirrored && !subject.mirror) return false
  const names = Object.keys(subject.knobs)
  if (Object.keys(variant.knobs).length !== names.length) return false
  return names.every((name) => {
    const value = variant.knobs[name]
    return Number.isInteger(value) && value! >= 0 && value! < subject.knobs[name]!
  })
}

/** The drawing a version prints. */
export function sgVariantDrawing(subject: SgSubject, variant: SgVariant): SubjectDrawing {
  const drawing = subject.draw(variant.knobs)
  return variant.mirrored ? mirrorDrawing(drawing) : drawing
}

/* ------------------------------------------------------------------ *
 * What the book already shows
 * ------------------------------------------------------------------ */

/** One printed page as the book remembers it. */
export interface SgBookEntry {
  subject: string
  variant: string
  composition: string
  /** The book's style token (`style.ts`); absent on pages printed before styles. */
  style?: string
}

/** What the page shows, style aside: two pages with the same key are the same design. */
export const sgDesignKey = (entry: SgBookEntry) => `${entry.subject}|${entry.variant}|${entry.composition}`

/** The label a page carries: `subject|version|composition`, then `|style` when it has one. */
export const sgPageLabel = (entry: SgBookEntry) => (entry.style ? `${sgDesignKey(entry)}|${entry.style}` : sgDesignKey(entry))

/** The pages the book already shows, from the labels they carry. Unknown labels are ignored. */
export function parseSgBook(labels: readonly string[]): SgBookEntry[] {
  const out: SgBookEntry[] = []
  for (const label of labels) {
    const [subject, variant, composition, style] = label.split('|')
    if (!subject || !variant || !composition || !sgSubjectById(subject)) continue
    out.push(style ? { subject, variant, composition, style } : { subject, variant, composition })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Choosing a page
 * ------------------------------------------------------------------ */

export interface SgDesign {
  subject: SgSubject
  variant: SgVariant
  composition: SgComposition
}

export const sgDesignEntry = (design: SgDesign, style?: string): SgBookEntry => ({
  subject: design.subject.id,
  variant: sgVariantKey(design.subject, design.variant),
  composition: compositionKey(design.composition),
  ...(style ? { style } : {}),
})

/**
 * The design for one page.
 *
 * Subject: the theme's least-used subjects in this book come first, then
 * those this seller has not printed lately (`recent`), then the salted seed
 * decides. `exclude` drops subjects an earlier attempt at this page could not
 * build. Version: never one the book already shows, then not one the seller
 * printed lately (`recentArt`, `subject:version` labels). Composition: not one
 * the book already uses for this subject, nor the one on the page before,
 * leaning toward the book's own window, border and pattern (`favor`).
 */
export function pickSgDesign(options: {
  theme: SgThemeChoice
  seed: number
  ownerSalt: string
  aspect: number
  /** The panel's shorter side in background cells (see `dealComposition`). */
  span?: number
  book?: readonly SgBookEntry[]
  recent?: readonly string[]
  recentArt?: readonly string[]
  exclude?: ReadonlySet<string>
  attempt?: number
  favor?: SgFavor
}): SgDesign | null {
  const { theme, seed, ownerSalt, aspect, span, book = [], recent = [], recentArt = [], exclude, attempt = 0, favor } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: SG_TEMPLATE_KEY,
    configHash: `pick:${theme}`,
    pageNonce: seed,
    stream: String(attempt),
  })
  const pool = themeSubjects(theme).filter((s) => !exclude?.has(s.id))
  if (pool.length === 0) return null

  const uses = (id: string) => book.filter((entry) => entry.subject === id).length
  const recently = new Set(recent)
  const rank = (s: SgSubject) => uses(s.id) * 2 + (recently.has(s.id) ? 1 : 0)
  const low = Math.min(...pool.map(rank))
  const subject = rng.pick(pool.filter((s) => rank(s) === low))

  const inBook = new Set(book.filter((e) => e.subject === subject.id).map((e) => e.variant))
  const printed = new Set(recentArt)
  const all = sgVariants(subject)
  const fresh = all.filter((v) => !inBook.has(sgVariantKey(subject, v)))
  const candidates = fresh.length > 0 ? fresh : all
  const unseen = candidates.filter((v) => !printed.has(`${subject.id}:${sgVariantKey(subject, v)}`))
  const variant = rng.pick(unseen.length > 0 ? unseen : candidates)

  const avoid = new Set(book.filter((e) => e.subject === subject.id).map((e) => e.composition))
  const last = book[book.length - 1]
  if (last) avoid.add(last.composition)
  const composition = dealComposition({ subject, rng, aspect, span, avoid, favor })
  return { subject, variant, composition }
}
