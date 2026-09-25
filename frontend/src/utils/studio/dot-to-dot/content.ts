import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput, sha256Hex } from '../_shared/uniqueness'
import { isValidSgVariant, sgVariantDrawing, sgVariantKey, sgVariants, type SgVariant } from '../stained-glass/content'
import { pointInRing, ringBounds } from '../stained-glass/geometry'
import { SG_SUBJECTS, type SgSubject, type SgTheme } from '../stained-glass/subjects'
import { traceOutline, type DtdOutline } from './outline'
import type { DtdRules } from './puzzle'
import { DTD_EXTRA_SUBJECTS } from './subjects'

/**
 * What a Dot to Dot page shows, and how each page's picture is chosen.
 *
 * A page is a subject (a teapot, a golf flag) in one version of its drawing;
 * the outline is traced from the drawing and dotted for the level. Pictures
 * are dealt from a stream keyed by the seller's puzzle salt and the page
 * seed, so two sellers on the same settings print different books and the
 * same seed reprints the same page.
 *
 * What counts as "the same puzzle" is the outline a reader draws, not the
 * drawing it came from: two versions that differ only in a pattern inside,
 * or in which way they face, trace the same silhouette. So every version is
 * reduced to a shape signature — its silhouette on a coarse grid, the same
 * whichever way it faces — and a book never prints a subject's shape twice
 * while the theme still has shapes it has not printed.
 */

export const DTD_TEMPLATE_KEY = 'dot-to-dot'
export const DTD_DEFAULT_TITLE = 'Dot to Dot'

export const DTD_PAGE_TOO_SMALL_MESSAGE = 'This page size is too small for a dot-to-dot picture. Pick a larger page in Settings.'
export const DTD_BUILD_FAILED_MESSAGE = 'Could not build a clean dot-to-dot picture for this page. Try again.'

/* ------------------------------------------------------------------ *
 * Subjects
 * ------------------------------------------------------------------ */

/**
 * Library subjects left out of Dot to Dot, and why: their outline alone does
 * not say what they are. A bicycle's silhouette is two discs and a blob; the
 * garden tools, a tangle; the yarn basket, a cloud. The fishing scene and the
 * beach chair are two objects side by side, so no one outline is the picture
 * (the outline check refuses them anyway; listing them keeps the count true).
 */
const LEFT_OUT = new Set(['bicycle', 'garden-tools', 'yarn-basket', 'fishing', 'beach-chair'])

/** Every Dot to Dot subject: the shared library's that trace well, and this game's own. */
export const DTD_SUBJECTS: readonly SgSubject[] = [...SG_SUBJECTS.filter((s) => !LEFT_OUT.has(s.id)), ...DTD_EXTRA_SUBJECTS]

const SUBJECT_INDEX = new Map(DTD_SUBJECTS.map((s) => [s.id, s]))
export const dtdSubjectById = (id: string) => SUBJECT_INDEX.get(id)

/* ------------------------------------------------------------------ *
 * Themes
 * ------------------------------------------------------------------ */

export type DtdThemeChoice = 'mix' | SgTheme

export const DTD_THEMES: readonly { value: DtdThemeChoice; label: string; examples: string }[] = [
  { value: 'mix', label: 'A mix of everything', examples: 'teapots, sailboats, golf flags, hammocks and more' },
  { value: 'home', label: 'Home comforts', examples: 'a rocking chair, a teapot, reading glasses, a porch swing' },
  { value: 'travel', label: 'Travel & getaways', examples: 'a motorhome, a cruise ship, a sun hat, a fishing boat' },
  { value: 'garden', label: 'Garden & outdoors', examples: 'a watering can, a birdhouse, a hammock, a park bench' },
  { value: 'hobbies', label: 'Hobbies & pastimes', examples: 'a golf flag, a golf cart, a guitar, a camera' },
]

export const DEFAULT_DTD_THEME: DtdThemeChoice = 'mix'

export function parseDtdTheme(raw: unknown): DtdThemeChoice {
  const value = String(raw ?? '')
  return DTD_THEMES.some((t) => t.value === value) ? (value as DtdThemeChoice) : DEFAULT_DTD_THEME
}

export const dtdThemeSubjects = (theme: DtdThemeChoice): readonly SgSubject[] =>
  theme === 'mix' ? DTD_SUBJECTS : DTD_SUBJECTS.filter((s) => s.theme === theme)

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type DtdLevel = 'relaxed' | 'classic' | 'challenging'

export interface DtdLevelSpec {
  value: DtdLevel
  label: string
  rules: DtdRules
}

const inch = (n: number) => n * DPI

/**
 * Difficulty is the number of dots and how close they sit — never a
 * confusing route. Every level keeps numbers at 10.5 pt or more, dots a
 * clear gap apart and the outline true to the picture; Challenging simply
 * follows the outline more closely, with more of them. A page aims for the
 * level's count but never more than the outline needs (a radio is not padded
 * with dots along its straight sides) or than the picture's edge holds at
 * the level's gap on a small trim.
 */
export const DTD_LEVELS: readonly DtdLevelSpec[] = [
  {
    value: 'relaxed',
    label: 'Relaxed — about 20–30 dots, big numbers',
    rules: { dots: { min: 16, target: 26, max: 32 }, numberSize: 16, dotRadius: 3.5, minGap: inch(0.27), fidelity: 0.045 },
  },
  {
    value: 'classic',
    label: 'Classic — about 30–45 dots',
    rules: { dots: { min: 28, target: 40, max: 46 }, numberSize: 15, dotRadius: 3.25, minGap: inch(0.22), fidelity: 0.035 },
  },
  {
    value: 'challenging',
    label: 'Challenging — about 45–60 dots, more detail',
    rules: { dots: { min: 42, target: 58, max: 64 }, numberSize: 14, dotRadius: 3, minGap: inch(0.185), fidelity: 0.03 },
  },
]

export const DEFAULT_DTD_LEVEL: DtdLevel = 'classic'

export function parseDtdLevel(raw: unknown): DtdLevel {
  const value = String(raw ?? '')
  return DTD_LEVELS.some((l) => l.value === value) ? (value as DtdLevel) : DEFAULT_DTD_LEVEL
}

export const dtdLevelSpec = (level: DtdLevel) => DTD_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

/** One short line; a seller's house style prints one of them. Each says where to start and how to finish. */
const DTD_INSTRUCTIONS = [
  'Start at 1 and join the dots in order, then join the last dot back to 1.',
  'Connect the dots in number order, finishing back at dot 1.',
  'Draw a line from dot to dot in order, ending back at 1 to reveal the picture.',
] as const

export function dtdInstructionOptions(config: StudioConfig): readonly string[] {
  return config.showInstructions === false ? [] : DTD_INSTRUCTIONS
}

/** The phrasing this seller prints: fixed per account, so a book reads in one voice. */
export function dtdInstruction(config: StudioConfig, ownerSalt: string): string {
  const options = dtdInstructionOptions(config)
  if (options.length === 0) return ''
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: DTD_TEMPLATE_KEY, configHash: 'house-style', pageNonce: 'v1' })
  return rng.pick(options)
}

/* ------------------------------------------------------------------ *
 * Outlines and shapes
 * ------------------------------------------------------------------ */

/** A silhouette this share or more of the drawing's ink is the picture; less, and it is two objects. */
export const DTD_MIN_MAIN_SHARE = 0.8

/**
 * Traced outlines, most recent last. Bounded: a long run of a book re-traces
 * a version it dropped rather than holding every version in memory.
 */
const OUTLINE_CACHE = new Map<string, DtdOutline | null>()
const OUTLINE_CACHE_LIMIT = 96

export function dtdOutline(subject: SgSubject, variant: SgVariant): DtdOutline | null {
  const key = `${subject.id}:${sgVariantKey(subject, variant)}`
  if (OUTLINE_CACHE.has(key)) {
    const hit = OUTLINE_CACHE.get(key)!
    OUTLINE_CACHE.delete(key)
    OUTLINE_CACHE.set(key, hit)
    return hit
  }
  const traced = traceOutline(sgVariantDrawing(subject, variant))
  const outline = traced && traced.mainShare >= DTD_MIN_MAIN_SHARE ? traced : null
  OUTLINE_CACHE.set(key, outline)
  if (OUTLINE_CACHE.size > OUTLINE_CACHE_LIMIT) OUTLINE_CACHE.delete(OUTLINE_CACHE.keys().next().value!)
  return outline
}

const SHAPE_GRID = 16

/**
 * The outline's shape signature: which cells of a 16 × 16 grid over its
 * bounds it covers, read both ways round and the smaller taken, hashed. Two
 * outlines alike to within a sixteenth of their size — a pattern changed, a
 * picture flipped — share a signature.
 */
export function dtdShapeSignature(outline: DtdOutline): string {
  const b = ringBounds(outline.contour)
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const rows: string[] = []
  const flipped: string[] = []
  for (let j = 0; j < SHAPE_GRID; j++) {
    let row = ''
    for (let i = 0; i < SHAPE_GRID; i++) {
      const x = b.minX + ((i + 0.5) / SHAPE_GRID) * w
      const y = b.minY + ((j + 0.5) / SHAPE_GRID) * h
      row += pointInRing({ x, y }, outline.contour) ? '1' : '0'
    }
    rows.push(row)
    flipped.push([...row].reverse().join(''))
  }
  const aspect = Math.round((w / h) * 4)
  const a = `${aspect}:${rows.join('')}`
  const f = `${aspect}:${flipped.join('')}`
  return sha256Hex(a < f ? a : f).slice(0, 10)
}

/* ------------------------------------------------------------------ *
 * What the book already shows
 * ------------------------------------------------------------------ */

/** One printed page as the book remembers it. */
export interface DtdBookEntry {
  subject: string
  shape: string
  variant: string
}

/** The label a page carries: `subject|shape|version`. */
export const dtdPageLabel = (entry: DtdBookEntry) => `${entry.subject}|${entry.shape}|${entry.variant}`

/** The pages the book already shows, from the labels they carry. Unknown labels are ignored. */
export function parseDtdBook(labels: readonly string[]): DtdBookEntry[] {
  const out: DtdBookEntry[] = []
  for (const label of labels) {
    const [subject, shape, variant] = label.split('|')
    if (!subject || !shape || !variant || !dtdSubjectById(subject)) continue
    out.push({ subject, shape, variant })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Choosing a page
 * ------------------------------------------------------------------ */

export interface DtdDesign {
  subject: SgSubject
  variant: SgVariant
  outline: DtdOutline
  shape: string
  /** True only when every shape of the theme is already in the book, so a repeat is unavoidable. */
  repeat: boolean
}

export const dtdDesignEntry = (design: DtdDesign): DtdBookEntry => ({
  subject: design.subject.id,
  shape: design.shape,
  variant: sgVariantKey(design.subject, design.variant),
})

export const isValidDtdDesign = (design: DtdDesign) =>
  dtdSubjectById(design.subject.id) === design.subject && isValidSgVariant(design.subject, design.variant)

/** Versions of a subject looked at per pick; enough to find a fresh shape without tracing them all. */
const VERSIONS_TRIED = 8
/** Subjects looked at per pick before settling for a repeat: bounds the cost of a very long book. */
const SUBJECTS_TRIED = 12

/**
 * The picture for one page.
 *
 * Subject: the theme's least-used subjects in this book come first, then
 * those this seller has not printed lately (`recent`), then the salted seed
 * decides; `exclude` drops subjects an earlier attempt at this page could
 * not dot cleanly. Version: a shape the book does not show yet, and not one
 * this seller printed lately (`recentShapes`, `subject:shape`), where it can.
 * Which way it faces is dealt too, for the page's look only.
 */
export function pickDtdDesign(options: {
  theme: DtdThemeChoice
  seed: number
  ownerSalt: string
  book?: readonly DtdBookEntry[]
  recent?: readonly string[]
  recentShapes?: readonly string[]
  exclude?: ReadonlySet<string>
  excludeVersions?: ReadonlySet<string>
  attempt?: number
}): DtdDesign | null {
  const { theme, seed, ownerSalt, book = [], recent = [], recentShapes = [], exclude, excludeVersions, attempt = 0 } = options
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: DTD_TEMPLATE_KEY, configHash: `pick:${theme}`, pageNonce: seed, stream: String(attempt) })
  let pool = dtdThemeSubjects(theme).filter((s) => !exclude?.has(s.id))
  const uses = (id: string) => book.filter((e) => e.subject === id).length
  const recently = new Set(recent)
  const printed = new Set(recentShapes)
  const last = book[book.length - 1]
  let reserve: { subject: SgSubject; variant: SgVariant; outline: DtdOutline; shape: string } | null = null
  let tried = 0

  while (pool.length > 0) {
    const rank = (s: SgSubject) => uses(s.id) * 4 + (recently.has(s.id) ? 2 : 0) + (last?.subject === s.id ? 8 : 0)
    const low = Math.min(...pool.map(rank))
    const subject = rng.pick(pool.filter((s) => rank(s) === low))
    const inBook = new Set(book.filter((e) => e.subject === subject.id).map((e) => e.shape))

    const versions = rng
      .shuffle(sgVariants(subject).filter((v) => !v.mirrored))
      .filter((v) => !excludeVersions?.has(`${subject.id}:${sgVariantKey(subject, v)}`))
      .slice(0, VERSIONS_TRIED)
    let fallback: { variant: SgVariant; outline: DtdOutline; shape: string } | null = null
    let repeat: { variant: SgVariant; outline: DtdOutline; shape: string } | null = null
    let chosen: { variant: SgVariant; outline: DtdOutline; shape: string } | null = null
    for (const base of versions) {
      const variant = subject.mirror && rng.chance(0.5) ? { ...base, mirrored: true } : base
      const outline = dtdOutline(subject, variant)
      if (!outline) continue
      const shape = dtdShapeSignature(outline)
      const found = { variant, outline, shape }
      if (inBook.has(shape)) {
        repeat ??= found
        continue
      }
      if (!printed.has(`${subject.id}:${shape}`)) {
        chosen = found
        break
      }
      fallback ??= found
    }
    const pick = chosen ?? fallback
    if (pick) return { subject, ...pick, repeat: false }
    // Every shape of this subject tried is already in the book: keep one in
    // reserve and look at the next subject. A repeat is only printed when the
    // subjects looked at have nothing fresh left.
    reserve ??= repeat ? { subject, ...repeat } : null
    pool = pool.filter((s) => s !== subject)
    if (++tried >= SUBJECTS_TRIED) break
  }
  return reserve ? { ...reserve, repeat: true } : null
}
