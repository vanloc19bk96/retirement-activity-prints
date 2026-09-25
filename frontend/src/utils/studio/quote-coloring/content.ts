import type { StudioConfig } from '@/types/studio-template.types'
import type { QuoteColoringItem, QuoteColoringTone } from '@/types/studio-quote-coloring.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import type { QcMotifSet } from './motifs'

export const QC_TEMPLATE_KEY = 'quote-coloring'
export const QC_DEFAULT_TITLE = 'Color the Saying'
/** Separates themes in `resolveRetirementTheme` so facing pages of two games differ. */
export const QC_THEME_SALT = 0x51c0de

export const QC_AI_EMPTY_MESSAGE =
  'Could not write a saying good enough to print. Try again, or pick a broader theme.'
export const QC_FONTS_MISSING_MESSAGE =
  'Could not load the lettering for this page. Check your connection and try again.'
export const QC_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a quote coloring page. Pick a larger page in Settings.'
export const QC_BUILD_FAILED_MESSAGE =
  'Could not letter a saying cleanly on this page. Try again.'

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export const QC_TONES: readonly { value: QuoteColoringTone; label: string }[] = [
  { value: 'mixed', label: 'A mix of moods' },
  { value: 'uplifting', label: 'Uplifting' },
  { value: 'playful', label: 'Playful' },
  { value: 'reflective', label: 'Calm & reflective' },
]

export function parseQcTone(raw: unknown): QuoteColoringTone {
  const value = String(raw ?? '')
  return QC_TONES.some((t) => t.value === value) ? (value as QuoteColoringTone) : 'mixed'
}

export type QcPatternChoice = 'mix' | QcMotifSet

export const QC_PATTERNS: readonly { value: QcPatternChoice; label: string; examples: string }[] = [
  { value: 'mix', label: 'A mix of patterns', examples: 'each page picks flowers, shapes or hobbies to suit the book' },
  { value: 'floral', label: 'Flowers & leaves', examples: 'daisies, tulips, rosettes, leaves and swirls' },
  { value: 'geometric', label: 'Shapes & tiles', examples: 'rosettes, stars, diamonds, hexagons and hearts' },
  { value: 'travel', label: 'Hobbies & travel', examples: 'teacups, sailboats, balloons, books, cameras and suitcases' },
]

export function parseQcPattern(raw: unknown): QcPatternChoice {
  const value = String(raw ?? '')
  return QC_PATTERNS.some((p) => p.value === value) ? (value as QcPatternChoice) : 'mix'
}

export type QcDetail = 'relaxed' | 'classic' | 'detailed'

export interface QcDetailSpec {
  value: QcDetail
  label: string
  /** Every pattern region clears this, canvas px (clear diameter) and px². */
  floor: { minWidth: number; minArea: number }
  /** Radius range of a packed motif, canvas px. */
  pack: readonly [number, number]
  /** Radius of a motif in a lattice, canvas px. */
  lattice: number
  /** Clear paper between a motif and anything else, canvas px. */
  gap: number
}

/**
 * Space sizes are absolute, like the stained-glass pieces: a bigger trim
 * gets more motifs, never smaller ones.
 */
export const QC_DETAILS: readonly QcDetailSpec[] = [
  {
    value: 'relaxed',
    label: 'Relaxed — big, easy spaces to color',
    floor: { minWidth: inch(0.125), minArea: inch(0.2) * inch(0.2) },
    pack: [inch(0.4), inch(0.9)],
    lattice: inch(0.56),
    gap: inch(0.11),
  },
  {
    value: 'classic',
    label: 'Classic',
    floor: { minWidth: 10.5, minArea: 300 },
    pack: [inch(0.33), inch(0.74)],
    lattice: inch(0.46),
    gap: inch(0.09),
  },
  {
    value: 'detailed',
    label: 'Detailed — more, smaller shapes',
    floor: { minWidth: 9, minArea: 220 },
    pack: [inch(0.25), inch(0.6)],
    lattice: inch(0.38),
    gap: inch(0.075),
  },
]

export const DEFAULT_QC_DETAIL: QcDetail = 'classic'

export function parseQcDetail(raw: unknown): QcDetail {
  const value = String(raw ?? '')
  return QC_DETAILS.some((d) => d.value === value) ? (value as QcDetail) : DEFAULT_QC_DETAIL
}

export const qcDetailSpec = (detail: QcDetail): QcDetailSpec => QC_DETAILS.find((d) => d.value === detail)!

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

/** One short line, so the design keeps the page. A seller's house style prints one of them. */
export const QC_INSTRUCTIONS: readonly string[] = [
  'Color the saying, then the pattern around it.',
  'Color the letters and the design in any colors you like.',
  'Take your time: color the words first, then the pattern.',
  'Fill the letters with color, then bring the pattern to life.',
]

export function qcInstructionOptions(config: StudioConfig): readonly string[] {
  return config.showInstructions === false ? [] : QC_INSTRUCTIONS
}

/** The phrasing this seller prints: fixed per account, so a book reads in one voice. */
export function qcInstruction(config: StudioConfig, ownerSalt: string): string {
  const options = qcInstructionOptions(config)
  if (options.length === 0) return ''
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: QC_TEMPLATE_KEY, configHash: 'house-style', pageNonce: 'v1' })
  return rng.pick(options)
}

/* ------------------------------------------------------------------ *
 * Sayings
 * ------------------------------------------------------------------ */

/**
 * The shape a saying must have to be lettered. Mirrors the service's gates
 * (`app/data/studio/quote-coloring/prompt.json`): the service is what judges
 * originality and suitability; this re-checks, before anything reaches the
 * page, that what came back is a saying the lettering can set exactly.
 */
export const QC_SAYING_LIMITS = {
  minChars: 12,
  /** What the page asks for: a spread of lengths within this, so every trim finds one it can letter. */
  maxChars: 56,
  minWords: 3,
  maxWords: 12,
  maxWordLetters: 11,
} as const

const ALLOWED_RE = /^[A-Za-z ,.'!?-]+$/
const INNER_SENTENCE_RE = /[.!?]\s+[A-Z]/g

/** The saying if it can be lettered exactly as written, else null. Never a repaired one. */
export function validQcSaying(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw
  if (text !== text.trim() || /\s{2,}/.test(text)) return null
  if (!ALLOWED_RE.test(text)) return null
  if (!/^[A-Z]/.test(text)) return null
  if (/\s[,.!?]|[,.!?][A-Za-z]|[,.!?]{2,}|\.\./.test(text)) return null
  if ((text.match(INNER_SENTENCE_RE) ?? []).length > 1) return null
  const words = text.split(' ')
  const L = QC_SAYING_LIMITS
  if (words.length < L.minWords || words.length > L.maxWords) return null
  if (text.length < L.minChars || text.length > L.maxChars) return null
  if (words.some((w) => w.replace(/[^A-Za-z]/g, '').length > L.maxWordLetters || !/[A-Za-z]/.test(w))) return null
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.replace(/[^A-Z]/g, '').length > letters.length * 0.4) return null
  return text
}

/** Service items the page may letter: checked by the service, and the right shape. */
export function selectQcSayings(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const out: string[] = []
  for (const item of items as Partial<QuoteColoringItem>[]) {
    if (!item || item.verified !== true) continue
    const text = validQcSaying(item.text)
    if (text && !out.some((other) => sayingsRepeat(text, other))) out.push(text)
  }
  return out
}

/** Words that carry no idea of their own. Every saying shares them. */
const STOPWORDS = new Set(
  (
    'a an the of to for at in on with and or but from by into as up out off so too very just all any some every each no not ' +
    'if is are was were be been am has have had do does did can could would will should get gets got go goes it its i im me my ' +
    'you your we our they their them he she his her this that these those there then than now still ever never always what ' +
    'why how where who which when here own new more most less really truly finally today only even again yet about over ' +
    'like let make made us while until through without retire retired retiree retirement retiring'
  ).split(' '),
)

const ALIASES: Readonly<Record<string, string>> = {
  tea: 'coffee', cup: 'coffee', mug: 'coffee', mornings: 'morning', sunrise: 'morning', dawn: 'morning',
  sunset: 'evening', sunsets: 'evening', journey: 'travel', trip: 'travel', trips: 'travel', road: 'travel',
  wander: 'travel', wandering: 'travel', explore: 'travel', happiness: 'joy', happy: 'joy', joyful: 'joy',
  free: 'freedom', schedule: 'calendar', diary: 'calendar', nap: 'sleep', naps: 'sleep', snooze: 'sleep',
  gives: 'give', gave: 'give', means: 'mean', matters: 'matter', flowers: 'flower', bloom: 'flower', blooms: 'flower',
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** The words that carry a saying's idea, synonyms folded. */
export function sayingTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').match(/[a-z]+/g) ?? []) {
    if (STOPWORDS.has(raw)) continue
    const word = ALIASES[raw] ?? raw
    const stemmed = stem(word)
    out.add(ALIASES[stemmed] ?? stemmed)
  }
  return out
}

/**
 * True when a reader would call the two sayings the same line — the
 * service's rule: half their content words shared, one inside the other at
 * three words, or two words and a third of their meaning.
 */
export function sayingsRepeat(first: string, second: string): boolean {
  const a = sayingTokens(first)
  const b = sayingTokens(second)
  if (a.size === 0 || b.size === 0) return first.trim().toLowerCase() === second.trim().toLowerCase()
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  if (Math.min(a.size, b.size) < 2) return shared === Math.min(a.size, b.size) && a.size === b.size
  const jaccard = shared / (a.size + b.size - shared)
  if (jaccard >= 0.5) return true
  if (Math.min(a.size, b.size) >= 3 && shared === Math.min(a.size, b.size)) return true
  return shared >= 2 && jaccard >= 0.34
}

/** Content words only, for the service's avoid list. */
export function compactQcLabel(text: string): string {
  return [...sayingTokens(text)].join(' ').slice(0, 60)
}

/* ------------------------------------------------------------------ *
 * What the book already holds
 * ------------------------------------------------------------------ */

/** One page as stamped on its panel: the saying and the design it was lettered in. */
export interface QcBookEntry {
  saying: string
  style: string
  layout: string
  cartouche: string
  frame: string
  fill: string
  set: string
}

export function qcPageLabel(entry: QcBookEntry): string {
  return [entry.saying, entry.style, entry.layout, entry.cartouche, entry.frame, entry.fill, entry.set].join('|')
}

export function parseQcBook(labels: readonly string[]): QcBookEntry[] {
  const out: QcBookEntry[] = []
  for (const label of labels) {
    const [saying, style, layout, cartouche, frame, fill, set] = label.split('|')
    if (!saying || !style || !layout || !cartouche || !frame || !fill || !set) continue
    out.push({ saying, style, layout, cartouche, frame, fill, set })
  }
  return out
}

/** The design part of a page, for "not the same page twice" checks. */
export const qcDesignKey = (entry: QcBookEntry): string =>
  [entry.style, entry.layout, entry.cartouche, entry.frame, entry.fill, entry.set].join('|')
