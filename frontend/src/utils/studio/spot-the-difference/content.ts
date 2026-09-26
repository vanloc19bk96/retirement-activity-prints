import type { StudioConfig } from '@/types/studio-template.types'
import { createRngFromSeedInput, sha256Hex } from '../_shared/uniqueness'

/**
 * What a Spot the Differences page is about, and the words it prints.
 *
 * A page is two copies of one retirement scene â€” a porch on a summer
 * afternoon, a tea table, a fishing dock â€” stacked one above the other. The
 * lower picture (or now and then the upper one) has a handful of deliberate
 * changes, and the reader circles them. Everything about the scene is dealt
 * per page; the seller chooses only what kind of scenes and how many
 * differences.
 */

export const SD_TEMPLATE_KEY = 'spot-the-difference'
export const SD_DEFAULT_TITLE = 'Spot the Differences'

export const SD_PAGE_TOO_SMALL_MESSAGE = 'This page size is too small for two pictures to compare. Pick a larger page in Settings.'
export const SD_BUILD_FAILED_MESSAGE =
  'Could not fit enough fair differences into pictures this size. Try again, choose fewer differences or a mix of scenes, or pick a larger page in Settings.'

/* ------------------------------------------------------------------ *
 * Scene groups (the form's "Scenes" choice)
 * ------------------------------------------------------------------ */

export type SdGroup = 'home' | 'outdoors' | 'travel'
export type SdGroupChoice = 'mix' | SdGroup

export const SD_GROUPS: readonly { value: SdGroupChoice; label: string }[] = [
  { value: 'mix', label: 'A mix of everything' },
  { value: 'home', label: 'At home' },
  { value: 'outdoors', label: 'Porch, garden & outdoors' },
  { value: 'travel', label: 'Travel & the seaside' },
]

export const DEFAULT_SD_GROUP: SdGroupChoice = 'mix'

export function parseSdGroup(raw: unknown): SdGroupChoice {
  const value = String(raw ?? '')
  return SD_GROUPS.some((g) => g.value === value) ? (value as SdGroupChoice) : DEFAULT_SD_GROUP
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type SdLevel = 'relaxed' | 'classic' | 'challenging'

/** What a difference must be to count, in print inches. */
export interface SdFairness {
  /** How many differences a page hides (inclusive): as many as its scene can fairly hold, never fewer than the first. */
  count: readonly [number, number]
  /**
   * New or missing ink only counts where it lies at least this far from any
   * line in the other picture: a line nudged by a hair is not a difference.
   */
  tolerance: number
  /** The changed ink's larger side, at least. */
  minExtent: number
  /** And at least this much changed line, in inches of printed line (added and taken away together). */
  minLine: number
  /** Never more than this share of the picture's height: a change that big is no puzzle. */
  maxExtentShare: number
  /** How often each kind of change is dealt. */
  weights: Readonly<Record<'remove' | 'knob' | 'mirror' | 'swap', number>>
  /** How full the scene is dealt: 0 keeps it simple, 2 fills it out. */
  fullness: 0 | 1 | 2
}

export interface SdLevelSpec {
  value: SdLevel
  label: string
  fairness: SdFairness
}

/**
 * Difficulty is how many changes there are and how bold they are â€” never
 * smaller pictures or changes lost in clutter. Every level keeps every change
 * at least a fifth of an inch across in print, well clear of any line in the
 * other picture, and one clear thing (a whole object, a clock's hands, a
 * fence's pickets), so every change counts once.
 */
export const SD_LEVELS: readonly SdLevelSpec[] = [
  {
    value: 'relaxed',
    label: 'Relaxed â€” 5 or 6 differences, big and clear',
    fairness: {
      count: [5, 6],
      tolerance: 0.07,
      minExtent: 0.3,
      minLine: 0.6,
      maxExtentShare: 0.6,
      weights: { remove: 3, swap: 2, knob: 1.2, mirror: 0.6 },
      fullness: 0,
    },
  },
  {
    value: 'classic',
    label: 'Classic â€” 7 or 8 differences',
    fairness: {
      count: [6, 8],
      tolerance: 0.06,
      minExtent: 0.26,
      minLine: 0.45,
      maxExtentShare: 0.5,
      weights: { remove: 2, swap: 1.4, knob: 2, mirror: 1 },
      fullness: 1,
    },
  },
  {
    value: 'challenging',
    label: 'Challenging â€” 9 or 10 differences, some subtler',
    fairness: {
      count: [8, 10],
      tolerance: 0.05,
      minExtent: 0.2,
      minLine: 0.32,
      maxExtentShare: 0.42,
      weights: { remove: 1.2, swap: 1, knob: 3, mirror: 1.2 },
      fullness: 2,
    },
  },
]

export const DEFAULT_SD_LEVEL: SdLevel = 'classic'

export function parseSdLevel(raw: unknown): SdLevel {
  const value = String(raw ?? '')
  return SD_LEVELS.some((l) => l.value === value) ? (value as SdLevel) : DEFAULT_SD_LEVEL
}

export const sdLevelSpec = (level: SdLevel) => SD_LEVELS.find((l) => l.value === level)!

/* ------------------------------------------------------------------ *
 * Instructions
 * ------------------------------------------------------------------ */

/** One short line naming the count; a seller's house style prints one of them. */
const SD_INSTRUCTIONS = [
  (n: number) => `These two pictures look alike, but ${n} things are different. Can you circle them all?`,
  (n: number) => `Compare the top picture with the bottom one and circle the ${n} differences.`,
  (n: number) => `Look closely: ${n} things have changed between the two pictures. Circle each one.`,
] as const

/** Every phrasing this page could print, at the level's largest count (for measuring). */
export function sdInstructionOptions(config: StudioConfig, count = 10): readonly string[] {
  return config.showInstructions === false ? [] : SD_INSTRUCTIONS.map((line) => line(count))
}

/** The phrasing this seller prints: fixed per account, so a book reads in one voice. */
export function sdInstruction(config: StudioConfig, ownerSalt: string, count: number): string {
  if (config.showInstructions === false) return ''
  const rng = createRngFromSeedInput({ ownerSalt, templateKey: SD_TEMPLATE_KEY, configHash: 'house-style', pageNonce: 'v1' })
  return rng.pick(SD_INSTRUCTIONS)(count)
}

/* ------------------------------------------------------------------ *
 * What the book already shows
 * ------------------------------------------------------------------ */

/** One printed page as the book remembers it. */
export interface SdBookEntry {
  recipe: string
  /** Short tokens, one per kind of thing the scene shows. */
  kinds: string[]
  /** Short tokens, one per change (`thing:how`). */
  changes: string[]
}

/** A short, stable token for a name (four hex digits is plenty inside one book). */
export const sdToken = (name: string) => sha256Hex(`sd:${name}`).slice(0, 4)

/** The label a page carries: `recipe|kind.kind.kind|change.change`. */
export const sdPageLabel = (entry: SdBookEntry) => `${entry.recipe}|${entry.kinds.join('.')}|${entry.changes.join('.')}`

/** The pages the book already shows, from the labels they carry. Unknown labels are ignored. */
export function parseSdBook(labels: readonly string[], knownRecipe: (id: string) => boolean): SdBookEntry[] {
  const out: SdBookEntry[] = []
  for (const label of labels) {
    const [recipe, kinds, changes] = label.split('|')
    if (!recipe || kinds === undefined || changes === undefined || !knownRecipe(recipe)) continue
    out.push({ recipe, kinds: kinds ? kinds.split('.') : [], changes: changes ? changes.split('.') : [] })
  }
  return out
}

/** Share of two token sets held in common (Jaccard), 0..1. */
export function sdOverlap(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let common = 0
  for (const t of sa) if (sb.has(t)) common++
  return common / (sa.size + sb.size - common)
}
