import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { PA_PICTURES, PA_PICTURES_BY_LEVEL, type PaPicture } from './pictures'
import type { PaLevelNeeds } from './puzzle'

/**
 * What a Photo Album page shows, and how each page's snapshot and numbers
 * are chosen.
 *
 * A page is one snapshot from a retiree's album — reading glasses on a
 * paperback, a kite on the beach, a steam train, a log cabin — hidden in a
 * grid of numbers and mounted like an instant photo with four album
 * corners. The picture is dealt so a book shows every snapshot of its level
 * before one returns (and a returning one comes back the other way round);
 * which squares print their number is built fresh from the seller's puzzle
 * salt and the page seed, so two sellers on the same settings print
 * different books, and the same seed reprints the same page.
 */

export const PA_TEMPLATE_KEY = 'photo-album'
export const PA_DEFAULT_TITLE = 'Photo Album'

export const PA_BUILD_FAILED_MESSAGE = 'Could not build a Photo Album puzzle for this page. Try again.'

export function paPageTooSmallMessage(level: PaLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} snapshots at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type PaLevel = 'gentle' | 'classic' | 'challenging'

export interface PaLevelSpec extends PaLevelNeeds {
  value: PaLevel
  label: string
  /** "15 × 15", for help lines and messages. */
  gridLabel: string
  /** Squares across and down. */
  size: number
  /** Smallest square the level prints, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the grid and what it takes to solve it, never a guess.
 * Gentle grids, 10 × 10, keep plenty of numbers and fall to the first steps
 * alone; Classic grids, 15 × 15, need "overlap" at least three times;
 * Challenging grids, 18 × 18, keep only the numbers they cannot do without
 * and need "what if" at least twice.
 */
export const PA_LEVELS: readonly PaLevelSpec[] = [
  { value: 'gentle', label: 'Gentle: 10 × 10, plenty of numbers', gridLabel: '10 × 10', size: 10, rules: 'pairs', beyond: null, minHard: 0, keep: 0.5, minCell: inch(0.36) },
  { value: 'classic', label: 'Classic: 15 × 15', gridLabel: '15 × 15', size: 15, rules: 'pairs', beyond: 'basic', minHard: 3, keep: 0.3, minCell: inch(0.26) },
  { value: 'challenging', label: 'Challenging: 18 × 18', gridLabel: '18 × 18', size: 18, rules: 'probe', beyond: 'pairs', minHard: 2, keep: 0, minCell: inch(0.235) },
]

export const DEFAULT_PA_LEVEL: PaLevel = 'classic'

export function parsePaLevel(raw: unknown): PaLevel {
  const value = String(raw ?? '')
  return PA_LEVELS.some((l) => l.value === value) ? (value as PaLevel) : DEFAULT_PA_LEVEL
}

export const paLevelSpec = (level: PaLevel): PaLevelSpec => PA_LEVELS.find((l) => l.value === level)!

export const paLevelPictures = (level: PaLevel): readonly PaPicture[] => PA_PICTURES_BY_LEVEL[level]

const PICTURE_INDEX = new Map(PA_PICTURES.map((p) => [p.id, p]))
export const paPictureById = (id: string) => PICTURE_INDEX.get(id)

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const PA_HOW_TO =
  'Each number counts the shaded squares in its block of nine: its own square and the eight around it. Shade what the numbers ask for, and a snapshot develops.'

/** Gentle adds the first two moves every solver learns. */
export const PA_GENTLE_TIP = 'Tip: a 0 leaves its whole block blank, and a 9 shades all of it.'

export function paInstruction(config: StudioConfig, level: PaLevel): string {
  if (config.showInstructions === false) return ''
  // The tip on a line of its own, so it never leaves a word or two stranded under the rules.
  return level === 'gentle' ? `${PA_HOW_TO}\n${PA_GENTLE_TIP}` : PA_HOW_TO
}

/** The write-in line on the snapshot's broad bottom edge. */
export const PA_CAPTION_PROMPT = 'What’s in the snapshot?'

/**
 * The legend under the snapshot: one worked block of nine, its middle
 * number counting the shaded squares round it and under it. Row by row,
 * `#` shaded; the number sits in the middle square.
 */
export const PA_LEGEND_BLOCK = ['##.', '.#.', '.#.'] as const
export const PA_LEGEND_NUMBER = 4
/** The legend's words, a line each, so they set the same on every trim. */
export const PA_LEGEND_LINES = ['This 4 counts its own square', 'and the eight around it:', 'four of the nine are shaded.'] as const

/* ------------------------------------------------------------------ *
 * A design: one picture, one way round
 * ------------------------------------------------------------------ */

export interface PaDesign {
  picture: PaPicture
  mirrored: boolean
  /** The answer, row by row. */
  bitmap: boolean[]
  size: number
  /** True when every picture of the level was already in the book. */
  repeat: boolean
}

/** The picture as squares, row by row, mirrored when asked. */
export function paBitmap(picture: PaPicture, mirrored: boolean): boolean[] {
  return picture.art.flatMap((row) => {
    const cells = [...row].map((ch) => ch === '#')
    return mirrored ? cells.reverse() : cells
  })
}

export function paDesign(picture: PaPicture, mirrored: boolean, repeat = false): PaDesign {
  const way = mirrored && picture.mirror
  return { picture, mirrored: way, bitmap: paBitmap(picture, way), size: picture.art.length, repeat }
}

/** True when the design is a real picture of the level, the right way round. */
export function isValidPaDesign(design: PaDesign, level: PaLevel): boolean {
  const picture = paPictureById(design.picture.id)
  if (!picture || !paLevelPictures(level).includes(picture)) return false
  if (design.mirrored && !picture.mirror) return false
  if (design.size !== paLevelSpec(level).size) return false
  const expected = paBitmap(picture, design.mirrored)
  return expected.length === design.bitmap.length && expected.every((on, i) => on === design.bitmap[i])
}

/* ------------------------------------------------------------------ *
 * The book
 * ------------------------------------------------------------------ */

/** `picture|way|level|grid`: the label a page stamps, and what the book reads back. */
export const paPageLabel = (design: Pick<PaDesign, 'picture' | 'mirrored'>, level: PaLevel, signature: string) =>
  `${design.picture.id}|${design.mirrored ? 'm' : 'n'}|${level}|${signature}`

export interface PaBookEntry {
  id: string
  mirrored: boolean
  level: PaLevel | null
  signature: string
}

/** The book's Photo Album pages, oldest first, from their stamped labels. */
export function parsePaBook(labels: readonly string[]): PaBookEntry[] {
  const out: PaBookEntry[] = []
  for (const label of labels) {
    const [id, way, level, signature] = label.split('|')
    if (!id || !paPictureById(id)) continue
    out.push({
      id,
      mirrored: way === 'm',
      level: PA_LEVELS.some((l) => l.value === level) ? (level as PaLevel) : null,
      signature: signature ?? '',
    })
  }
  return out
}

/**
 * The snapshot for a page.
 *
 * Least-shown in the book first, so a book walks the whole level before a
 * picture returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's picture never follows itself
 * while there is any other. A returning picture comes back the other way
 * round when it can.
 */
export function pickPaDesign(options: {
  level: PaLevel
  seed: number
  ownerSalt: string
  book: readonly PaBookEntry[]
  /** Picture ids this seller printed lately. */
  recent: readonly string[]
  /** Pictures already refused on this page. */
  exclude?: ReadonlySet<string>
}): PaDesign | null {
  const { level, seed, ownerSalt, book, recent, exclude } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: PA_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: 'pick',
  })
  const pool = paLevelPictures(level).filter((p) => !exclude?.has(p.id))
  if (pool.length === 0) return null

  const shown = new Map<string, number>()
  for (const entry of book) shown.set(entry.id, (shown.get(entry.id) ?? 0) + 1)
  const recentSet = new Set(recent)
  const previous = book.length > 0 ? book[book.length - 1]!.id : null
  const dealt = rng.shuffle(pool)
  const order = new Map(dealt.map((p, i) => [p.id, i]))
  const ranked = [...pool].sort((a, b) => {
    const byShown = (shown.get(a.id) ?? 0) - (shown.get(b.id) ?? 0)
    if (byShown !== 0) return byShown
    const byPrevious = Number(a.id === previous) - Number(b.id === previous)
    if (byPrevious !== 0) return byPrevious
    const byRecent = Number(recentSet.has(a.id)) - Number(recentSet.has(b.id))
    if (byRecent !== 0) return byRecent
    return order.get(a.id)! - order.get(b.id)!
  })
  const picture = ranked[0]!
  const count = shown.get(picture.id) ?? 0

  let mirrored = picture.mirror && rng.chance(0.5)
  if (picture.mirror && count > 0) {
    // Mirrored and not, counted separately: a return comes back the way it has shown least.
    const ways = book.filter((e) => e.id === picture.id)
    const mirroredCount = ways.filter((e) => e.mirrored).length
    const plainCount = ways.length - mirroredCount
    if (mirroredCount !== plainCount) mirrored = mirroredCount < plainCount
  }
  return paDesign(picture, mirrored, count > 0)
}

/** The numbers stream for one attempt at a page. */
export function paGridRng(options: { level: PaLevel; seed: number; ownerSalt: string; picture: string; attempt: number }) {
  const { level, seed, ownerSalt, picture, attempt } = options
  return createRngFromSeedInput({
    ownerSalt,
    templateKey: PA_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `grid:${picture}:${attempt}`,
  })
}
