import type { StudioConfig } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { PL_PICTURES, PL_PICTURES_BY_LEVEL, type PlPicture } from './pictures'
import { cluesOf, type Bitmap, type Clues } from './solver'

/**
 * What a Picture Logic page shows, and how each page's picture is chosen.
 *
 * A page is one hand-drawn picture from the level's library, drawn the way
 * it was made or mirrored. Pictures are dealt from a stream keyed by the
 * seller's puzzle salt and the page seed, so two sellers on the same
 * settings print different books and the same seed reprints the same page.
 * A book shows every picture of its level once before any comes back, and a
 * seller's next book opens with pictures their last one did not.
 */

export const PL_TEMPLATE_KEY = 'picture-logic'
export const PL_DEFAULT_TITLE = 'Picture Logic'

export const PL_BUILD_FAILED_MESSAGE = 'Could not build a Picture Logic puzzle for this page. Try again.'

export function plPageTooSmallMessage(level: PlLevelSpec): string {
  return `This page size is too small for ${level.gridLabel} Picture Logic squares at large print. Pick a larger page in Settings, or an easier level.`
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

export type PlLevel = 'gentle' | 'classic' | 'challenging'

export interface PlLevelSpec {
  value: PlLevel
  label: string
  /** "10 × 10", for help lines and messages. */
  gridLabel: string
  /** Largest picture the level prints, in squares. */
  maxSide: number
  /** Smallest square the level will print, canvas px. */
  minCell: number
}

const inch = (n: number) => Math.round(n * DPI * 100) / 100

/**
 * Difficulty is the size of the grid, never a guess: every picture at every
 * level solves one row or column at a time. A bigger grid means longer
 * clues, more lines to work and more back-and-forth between them — the
 * challenge a Picture Logic reader expects — and each level's squares stay
 * big enough to shade with a pencil.
 */
export const PL_LEVELS: readonly PlLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — up to 10 × 10', gridLabel: '10 × 10', maxSide: 10, minCell: inch(0.3) },
  { value: 'classic', label: 'Classic — up to 15 × 15', gridLabel: '15 × 15', maxSide: 15, minCell: inch(0.24) },
  { value: 'challenging', label: 'Challenging — up to 20 × 20', gridLabel: '20 × 20', maxSide: 20, minCell: inch(0.22) },
]

export const DEFAULT_PL_LEVEL: PlLevel = 'classic'

export function parsePlLevel(raw: unknown): PlLevel {
  const value = String(raw ?? '')
  return PL_LEVELS.some((l) => l.value === value) ? (value as PlLevel) : DEFAULT_PL_LEVEL
}

export const plLevelSpec = (level: PlLevel): PlLevelSpec => PL_LEVELS.find((l) => l.value === level)!

export const plLevelPictures = (level: PlLevel): readonly PlPicture[] => PL_PICTURES_BY_LEVEL[level]

const PICTURE_INDEX = new Map(PL_PICTURES.map((p) => [p.id, p]))
export const plPictureById = (id: string) => PICTURE_INDEX.get(id)

/* ------------------------------------------------------------------ *
 * The page's words
 * ------------------------------------------------------------------ */

export const PL_INSTRUCTION =
  'Shade squares to match the numbers. Each number is a run of shaded squares, in order, with at least one blank square between runs. A hidden picture appears!'

export function plInstruction(config: StudioConfig): string {
  return config.showInstructions === false ? '' : PL_INSTRUCTION
}

/** The write-in line under the grid. */
export const PL_MYSTERY_PROMPT = 'What’s the picture?'

/* ------------------------------------------------------------------ *
 * A design: one picture, one way round
 * ------------------------------------------------------------------ */

export interface PlDesign {
  picture: PlPicture
  mirrored: boolean
  bitmap: Bitmap
  clues: Clues
  width: number
  height: number
  /** True when every picture of the level was already in the book. */
  repeat: boolean
}

/**
 * The picture as squares, trimmed to its ink — a blank border row or column
 * would be a line whose clue is "0" and a grid bigger than its picture —
 * and mirrored when asked.
 */
export function plBitmap(picture: PlPicture, mirrored: boolean): boolean[][] {
  const cells = picture.art.map((row) => [...row].map((ch) => ch === '#'))
  const rows = cells.map((row) => row.some(Boolean))
  const width = cells[0]?.length ?? 0
  const cols = Array.from({ length: width }, (_, c) => cells.some((row) => row[c]))
  const top = rows.indexOf(true)
  const bottom = rows.lastIndexOf(true)
  const left = cols.indexOf(true)
  const right = cols.lastIndexOf(true)
  if (top < 0) return []
  return cells.slice(top, bottom + 1).map((row) => {
    const kept = row.slice(left, right + 1)
    return mirrored ? kept.reverse() : kept
  })
}

export function plDesign(picture: PlPicture, mirrored: boolean, repeat = false): PlDesign {
  const bitmap = plBitmap(picture, mirrored && picture.mirror)
  return {
    picture,
    mirrored: mirrored && picture.mirror,
    bitmap,
    clues: cluesOf(bitmap),
    width: bitmap[0]?.length ?? 0,
    height: bitmap.length,
    repeat,
  }
}

/** `id|m` or `id|n`: the label a page stamps, and what the book reads back. */
export const plDesignLabel = (design: Pick<PlDesign, 'picture' | 'mirrored'>) =>
  `${design.picture.id}|${design.mirrored ? 'm' : 'n'}`

export interface PlBookEntry {
  id: string
  mirrored: boolean
}

/** The book's Picture Logic pages, oldest first, from their stamped labels. */
export function parsePlBook(labels: readonly string[]): PlBookEntry[] {
  const out: PlBookEntry[] = []
  for (const label of labels) {
    const [id, way] = label.split('|')
    if (!id || !plPictureById(id)) continue
    out.push({ id, mirrored: way === 'm' })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Dealing a page's picture
 * ------------------------------------------------------------------ */

/**
 * The next picture for a page.
 *
 * Least-shown in the book first, so a book walks the whole level before a
 * picture returns; among those, ones this seller has not printed lately;
 * then the dealt order. The previous page's picture never follows itself
 * while there is any other. A returning picture comes back the other way
 * round when it can, which is a different set of clues.
 */
export function pickPlDesign(options: {
  level: PlLevel
  seed: number
  ownerSalt: string
  book: readonly PlBookEntry[]
  /** Picture ids this seller printed lately, oldest first. */
  recent: readonly string[]
  /** Pictures already refused on this page. */
  exclude?: ReadonlySet<string>
  attempt?: number
}): PlDesign | null {
  const { level, seed, ownerSalt, book, recent, exclude, attempt = 0 } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: PL_TEMPLATE_KEY,
    configHash: `level:${level}`,
    pageNonce: seed,
    stream: `pick:${attempt}`,
  })
  const pool = plLevelPictures(level).filter((p) => !exclude?.has(p.id))
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
    const ways = new Set(book.filter((e) => e.id === picture.id).map((e) => e.mirrored))
    if (ways.has(mirrored) && !ways.has(!mirrored)) mirrored = !mirrored
  }
  return plDesign(picture, mirrored, count > 0)
}

/** True when the design is a real picture of the level, the right way round. */
export function isValidPlDesign(design: PlDesign, level: PlLevel): boolean {
  const picture = plPictureById(design.picture.id)
  if (!picture || !plLevelPictures(level).includes(picture)) return false
  if (design.mirrored && !picture.mirror) return false
  const expected = plBitmap(picture, design.mirrored)
  return (
    expected.length === design.bitmap.length &&
    expected.every((row, r) => row.length === design.bitmap[r]!.length && row.every((on, c) => on === design.bitmap[r]![c]))
  )
}
