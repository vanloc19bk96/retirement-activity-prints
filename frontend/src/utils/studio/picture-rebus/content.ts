import puzzlesJson from '@/data/studio/picture-rebus/puzzles.json'
import { hasLucideIconNode } from '../studio-icon'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { createRng, deriveSeed } from '../studio-rng'
import type { PictureRebusLevel, PictureRebusTier } from './levels'

/**
 * The puzzles this game can print, and the gates a puzzle passes to be one.
 *
 * A picture rebus is unusual among the games here: the thing that can go wrong
 * is not the layout, it is the *claim*. A word search that places a word badly
 * still shows the word; a rebus whose pictures do not spell its answer shows a
 * reader two pictures and a row of blanks that nothing fills, and there is no
 * way for them to tell the page is at fault rather than themselves. That is a
 * refund, and it is invisible in a preview.
 *
 * So the bank is not free prose. Every entry names, for each picture, the word
 * that picture contributes, and the only puzzles that reach a page are the ones
 * where those words — concatenated, in the order they are drawn — are letter for
 * letter the answer printed underneath. The check is mechanical, it runs over
 * the whole bank in tests and over every selected puzzle at generate time, and
 * it is the reason this page can promise one right answer.
 */

/** One picture, and the word it says. */
export interface PictureRebusIcon {
  /** Lucide icon name — must exist in the curated Studio catalog. */
  name: string
  /** The word a reader is expected to name this picture with. */
  word: string
}

export interface PictureRebusPuzzle {
  /** What the solver writes. Capitals, single spaces between words. */
  answer: string
  icons: PictureRebusIcon[]
  /** A short nudge, printed only on the gentle level. */
  hint: string
  tier: PictureRebusTier
}

export const PICTURE_REBUS_DEFAULT_TITLE = 'Picture Puzzles'

export const PICTURE_REBUS_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for picture puzzles — the pictures would print ' +
  'below large-print size. Choose a larger page in Settings.'

export const PICTURE_REBUS_BUILD_FAILED_MESSAGE =
  'This level did not have enough picture puzzles left to fill a page.'

/** Pictures in one puzzle. Two is the game; three is the most a row can hold. */
export const PICTURE_REBUS_MIN_ICONS = 2
export const PICTURE_REBUS_MAX_ICONS = 3

/**
 * Longest answer the page will print.
 *
 * Not a taste: the answer's writing slots are the widest thing a row draws, and
 * a twelfth slot is what pushes an 8.5 x 11 page out of two columns and down to
 * one — every puzzle on every page paying for one long word. Eleven letters
 * still covers SCHOOLHOUSE and PAPERWEIGHT.
 */
export const PICTURE_REBUS_MAX_LETTERS = 11
/** Below four letters there is nothing to join. */
export const PICTURE_REBUS_MIN_LETTERS = 4

/** Words in an answer. More than two and the slots stop being countable. */
export const PICTURE_REBUS_MAX_WORDS = 2

/** A hint is a nudge, not a definition — one short line under the pictures. */
export const PICTURE_REBUS_MAX_HINT_LENGTH = 30

/**
 * How often one picture may appear on a single page.
 *
 * A share of the page rather than a flat number, because "twice" means two
 * different things on a page of eight and a page of four. Two snowflakes among
 * eight puzzles is a coincidence a reader does not register; two among four is
 * half the page, and it reads as a book that ran out of ideas. One in four
 * keeps both honest, and the pool is deep enough that the selection never has
 * to reach for the rule.
 */
export function maxIconUsesPerPage(count: number): number {
  return Math.max(1, Math.ceil(count / 4))
}

const ANSWER_PATTERN = /^[A-Z]+( [A-Z]+)*$/
const WORD_PATTERN = /^[A-Z]{2,}$/
/** Plain sentence copy — no punctuation that could be mistaken for a clue mark. */
const HINT_PATTERN = /^[A-Za-z][A-Za-z ,-]*$/

/** Letters of an answer, spaces removed — what the pictures have to spell. */
export function answerLetters(answer: string): string {
  return answer.replace(/ /g, '')
}

/**
 * Everything wrong with one puzzle, in the order a reader would hit it.
 *
 * Returned rather than thrown so both the bank loader (which drops a bad entry)
 * and preflight (which refuses the page) can use the same rules, and so a test
 * can print what is actually wrong instead of "invalid".
 */
export function pictureRebusFaults(puzzle: PictureRebusPuzzle): string[] {
  const faults: string[] = []
  const { answer, icons, hint } = puzzle

  if (!ANSWER_PATTERN.test(answer)) {
    faults.push(`Answer "${answer}" is not plain capitals.`)
    return faults
  }
  const letters = answerLetters(answer)
  if (letters.length < PICTURE_REBUS_MIN_LETTERS) {
    faults.push(`Answer "${answer}" is too short to be a puzzle.`)
  }
  if (letters.length > PICTURE_REBUS_MAX_LETTERS) {
    faults.push(`Answer "${answer}" is longer than a row of slots can hold.`)
  }
  if (answer.split(' ').length > PICTURE_REBUS_MAX_WORDS) {
    faults.push(`Answer "${answer}" has more words than a row can show.`)
  }
  if (isUnsafeCopy(answer) || isUnsafeCopy(hint)) {
    faults.push(`Puzzle "${answer}" is not suitable for a published activity book.`)
  }

  if (icons.length < PICTURE_REBUS_MIN_ICONS || icons.length > PICTURE_REBUS_MAX_ICONS) {
    faults.push(`Puzzle "${answer}" must show two or three pictures.`)
  }
  for (const icon of icons) {
    // The asset check is the "will it render" gate: a name the catalog does not
    // hold throws inside Fabric at draw time, which is a blank page rather than
    // a missing picture.
    if (!hasLucideIconNode(icon.name)) {
      faults.push(`Puzzle "${answer}" uses a picture this book cannot draw: ${icon.name}.`)
    }
    if (!WORD_PATTERN.test(icon.word)) {
      faults.push(`Puzzle "${answer}" gives a picture an unusable word: ${icon.word}.`)
    }
  }

  // The promise itself. Everything above is housekeeping next to this line.
  const spelled = icons.map((icon) => icon.word).join('')
  if (spelled !== letters) {
    faults.push(
      `Puzzle "${answer}" does not match its pictures — they spell ${spelled}.`,
    )
  }

  if (!hint || hint.length > PICTURE_REBUS_MAX_HINT_LENGTH || !HINT_PATTERN.test(hint)) {
    faults.push(`Puzzle "${answer}" needs one short, plain hint.`)
  }

  return faults
}

/** Two puzzles are the same picture combination when they use the same icons. */
export function pictureRebusIconKey(puzzle: PictureRebusPuzzle): string {
  return [...puzzle.icons.map((icon) => icon.name)].sort().join('+')
}

function isTier(value: unknown): value is PictureRebusTier {
  return value === 1 || value === 2 || value === 3
}

function toPuzzle(raw: unknown): PictureRebusPuzzle | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const icons = Array.isArray(record.icons) ? record.icons : null
  if (
    typeof record.answer !== 'string' ||
    typeof record.hint !== 'string' ||
    !isTier(record.tier) ||
    !icons
  ) {
    return null
  }
  const parsed: PictureRebusIcon[] = []
  for (const icon of icons) {
    if (!icon || typeof icon !== 'object') return null
    const { name, word } = icon as Record<string, unknown>
    if (typeof name !== 'string' || typeof word !== 'string') return null
    parsed.push({ name, word })
  }
  return { answer: record.answer, icons: parsed, hint: record.hint, tier: record.tier }
}

let bankCache: PictureRebusPuzzle[] | null = null

/**
 * The bank, with anything that fails its own rules left out.
 *
 * Dropping rather than throwing is deliberate. A bad entry is an authoring
 * mistake, and the tests report it loudly through `pictureRebusBankFaults`; but
 * a seller mid-book should lose one puzzle to it, not the whole Studio panel.
 */
export function loadPictureRebusBank(): PictureRebusPuzzle[] {
  if (bankCache) return bankCache
  const parsed = (puzzlesJson as unknown[])
    .map(toPuzzle)
    .filter((puzzle): puzzle is PictureRebusPuzzle => puzzle !== null)
  bankCache = parsed.filter((puzzle) => pictureRebusFaults(puzzle).length === 0)
  return bankCache
}

/**
 * Everything wrong with the bank as a whole, rather than with one entry.
 *
 * Two collisions matter and neither is visible entry by entry. A repeated
 * answer makes a long book print the same puzzle twice under different numbers.
 * A repeated *set* of pictures is worse: house + boat and boat + house are the
 * same two pictures and two different real words, so a book holding both has a
 * page whose answer depends on which way the reader read it.
 */
export function pictureRebusBankFaults(): string[] {
  const faults: string[] = []
  const parsed = (puzzlesJson as unknown[]).map(toPuzzle)

  const answers = new Set<string>()
  const iconKeys = new Map<string, string>()
  parsed.forEach((puzzle, index) => {
    if (!puzzle) {
      faults.push(`Entry ${index} is not a picture puzzle.`)
      return
    }
    faults.push(...pictureRebusFaults(puzzle))
    if (answers.has(puzzle.answer)) {
      faults.push(`The bank holds "${puzzle.answer}" twice.`)
    }
    answers.add(puzzle.answer)
    const key = pictureRebusIconKey(puzzle)
    const owner = iconKeys.get(key)
    if (owner) {
      faults.push(
        `"${puzzle.answer}" and "${owner}" use the same pictures, so neither has one answer.`,
      )
    }
    iconKeys.set(key, puzzle.answer)
  })

  return faults
}

/** The puzzles one level may draw on. */
export function pictureRebusPool(level: PictureRebusLevel): PictureRebusPuzzle[] {
  return loadPictureRebusBank().filter((puzzle) => level.tiers.includes(puzzle.tier))
}

/**
 * The puzzle in this level's pool that costs a row the most room.
 *
 * Synthesised rather than picked: the longest answer, the most pictures and the
 * longest hint rarely belong to the same puzzle, and a page planned around any
 * one real puzzle is a page the other two overflow. The layout is measured
 * against this composite once, which is what lets every sheet of a run print at
 * the same size whichever puzzles it happens to draw.
 */
export function pictureRebusWorstCase(level: PictureRebusLevel): PictureRebusPuzzle | null {
  const pool = pictureRebusPool(level)
  if (pool.length === 0) return null

  let widest = pool[0]!
  let mostIcons = pool[0]!
  let longestHint = pool[0]!
  for (const puzzle of pool) {
    if (answerSlotUnits(puzzle.answer) > answerSlotUnits(widest.answer)) widest = puzzle
    if (puzzle.icons.length > mostIcons.icons.length) mostIcons = puzzle
    if (puzzle.hint.length > longestHint.hint.length) longestHint = puzzle
  }
  return {
    answer: widest.answer,
    icons: mostIcons.icons,
    hint: longestHint.hint,
    tier: widest.tier,
  }
}

/**
 * Extra slot width a word gap takes, as a share of one slot.
 *
 * A written answer has to be readable back as two words, and two rules touching
 * do not read as a gap. Seven tenths of a slot is wide enough to see across the
 * page and narrow enough that "CARROT CAKE" still fits the same row as
 * "SCHOOLHOUSE".
 */
export const WORD_GAP_UNITS = 0.7

/** Width of an answer's slot row, in slot widths. */
export function answerSlotUnits(answer: string): number {
  const gaps = answer.split(' ').length - 1
  return answerLetters(answer).length + gaps * WORD_GAP_UNITS
}

/** Left edge of each letter's slot, in slot widths from the row's left edge. */
export function answerSlotOffsets(answer: string): number[] {
  const offsets: number[] = []
  let x = 0
  for (const character of answer) {
    if (character === ' ') {
      x += WORD_GAP_UNITS
      continue
    }
    offsets.push(x)
    x += 1
  }
  return offsets
}

/**
 * The puzzles one page prints.
 *
 * Shuffled from the level's pool rather than walked in order, so two books built
 * from the same bank do not open with the same five puzzles; the seed is the
 * sheet's own, so a page is the same page every time it is regenerated.
 *
 * The first pass keeps no picture on the page more than twice. A page that
 * cannot be filled under that rule takes a second pass without it rather than
 * printing short — a repeated sun is a duller page, a half-empty one is a worse
 * one.
 */
export function selectPictureRebusPuzzles(options: {
  level: PictureRebusLevel
  seed: number
  count: number
}): PictureRebusPuzzle[] {
  const { level, seed, count } = options
  if (count <= 0) return []

  const rng = createRng(deriveSeed(seed, `picture-rebus:${level.id}`))
  const shuffled = rng.shuffle(pictureRebusPool(level))

  const chosen: PictureRebusPuzzle[] = []
  const taken = new Set<string>()
  const iconUses = new Map<string, number>()

  const take = (puzzle: PictureRebusPuzzle): void => {
    chosen.push(puzzle)
    taken.add(puzzle.answer)
    for (const icon of puzzle.icons) {
      iconUses.set(icon.name, (iconUses.get(icon.name) ?? 0) + 1)
    }
  }

  for (const puzzle of shuffled) {
    if (chosen.length >= count) break
    const crowded = puzzle.icons.some(
      (icon) => (iconUses.get(icon.name) ?? 0) >= maxIconUsesPerPage(count),
    )
    if (crowded) continue
    take(puzzle)
  }

  for (const puzzle of shuffled) {
    if (chosen.length >= count) break
    if (taken.has(puzzle.answer)) continue
    take(puzzle)
  }

  return chosen
}
