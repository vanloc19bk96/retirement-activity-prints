import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { worstCaseSaying } from './content'
import type { CryptogramLevel } from './levels'

/**
 * Everything a cryptogram page decides on the seller's behalf.
 *
 * A cryptogram is a field of write-in slots, and the number that governs it is
 * not a point size — it is how much room a hand needs to write a capital above
 * a rule. So the search here runs over *slot pitch*, and the coded letter under
 * each rule takes its size from that. Having it the other way round is what let
 * the old sheet promise "large print, at least 14 pt" while setting its codes
 * at 14 canvas pixels, which on a 96-DPI page is 10.5 pt.
 *
 * The page also decides how many puzzles print: start at the level's target and
 * step down until every saying fits at the writing floor. The form reports what
 * came out (`cryptogramPrintNote`) and generate lays out against the same plan,
 * so the note and the printed page can never disagree.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

export function pxToPt(px: number): number {
  return Math.round((px * PDF_POINTS_PER_INCH) / DPI)
}

/**
 * Smallest slot a reader can still write a capital into, in inches.
 *
 * Measured the way the crossword measures its cells: not from type, but from a
 * ballpoint and an older hand. Below about a quarter inch the letters a solver
 * writes start touching the ones either side of them.
 */
const SLOT_MIN_INCHES = 0.26
/** Past this a page of short sayings reads as a poster rather than a puzzle. */
const SLOT_MAX_INCHES = 0.34

export const SLOT_MIN_W = Math.round(DPI * SLOT_MIN_INCHES)
export const SLOT_MAX_W = Math.round(DPI * SLOT_MAX_INCHES)

/** Coded letter size against slot pitch — leaves air either side of the glyph. */
const CODE_FONT_RATIO = 0.74
/**
 * Row pitch: a written letter, the rule under it, the code under that, then
 * air before the next row.
 *
 * Two glyph heights plus the gaps is what a row needs and all it needs. The
 * ratios below are set against this number, so the three bands stay clear of
 * each other — see the arithmetic in the row test.
 */
const LINE_RATIO = 1.85
/** Word break, as a share of slot pitch. Wide enough to read as a space. */
const WORD_GAP_RATIO = 0.6
/** Air between two puzzles on one page, as a share of row pitch. */
const BAND_GUTTER_RATIO = 0.8
/** Column holding "1." beside each puzzle, as a share of slot pitch. */
const INDEX_RATIO = 1.7

/** Where the rule, the code and the written letter sit inside one row. */
export const ROW_RULE_Y = 0.48
export const ROW_CODE_Y = 0.75
export const ROW_LETTER_Y = 0.235
/** Rule length against slot pitch — a gap between rules keeps slots countable. */
export const RULE_RATIO = 0.82

export interface CryptogramSlotMetrics {
  /** Pitch from one letter slot to the next. */
  slotW: number
  wordGap: number
  lineH: number
  /** Size of the coded letter under the rule, and of any letter written on it. */
  codeFont: number
  indexW: number
  bandGutter: number
}

export function slotMetrics(slotW: number): CryptogramSlotMetrics {
  const lineH = slotW * LINE_RATIO
  return {
    slotW,
    lineH,
    wordGap: slotW * WORD_GAP_RATIO,
    codeFont: Math.max(1, Math.round(slotW * CODE_FONT_RATIO)),
    indexW: Math.round(slotW * INDEX_RATIO),
    bandGutter: Math.round(lineH * BAND_GUTTER_RATIO),
  }
}

/** Words grouped per printed line; a word never breaks across lines. */
export function wrapWords(options: {
  words: readonly string[]
  slotW: number
  wordGap: number
  bandWidth: number
}): string[][] {
  const { words, slotW, wordGap, bandWidth } = options
  const lines: string[][] = []
  let current: string[] = []
  let currentWidth = 0

  for (const word of words) {
    const wordWidth = word.length * slotW
    const withGap = current.length === 0 ? wordWidth : currentWidth + wordGap + wordWidth
    if (current.length > 0 && withGap > bandWidth) {
      lines.push(current)
      current = [word]
      currentWidth = wordWidth
      continue
    }
    current.push(word)
    currentWidth = withGap
  }
  if (current.length > 0) lines.push(current)
  return lines
}

export function lineWidth(options: {
  words: readonly string[]
  slotW: number
  wordGap: number
}): number {
  const { words, slotW, wordGap } = options
  const letters = words.reduce((total, word) => total + word.length, 0)
  return letters * slotW + wordGap * Math.max(0, words.length - 1)
}

export interface CryptogramSayingLayout {
  lines: string[][]
  height: number
}

/**
 * Wrap one saying into the band, or refuse.
 *
 * Null means a single word is wider than the column at this pitch. The caller
 * drops to a smaller pitch or to fewer puzzles — it never breaks the word,
 * because half a word on each of two lines cannot be solved.
 */
export function layoutSaying(
  words: readonly string[],
  bandWidth: number,
  metrics: CryptogramSlotMetrics,
): CryptogramSayingLayout | null {
  if (words.length === 0 || bandWidth <= 0) return null
  const { slotW, wordGap, lineH } = metrics
  const lines = wrapWords({ words, slotW, wordGap, bandWidth })
  const overflows = lines.some(
    (line) => lineWidth({ words: line, slotW, wordGap }) > bandWidth + 0.5,
  )
  if (overflows) return null
  return { lines, height: lines.length * lineH }
}

export interface CryptogramPagePlan {
  /** Puzzles this page prints — never more than the level asked for. */
  puzzleCount: number
  metrics: CryptogramSlotMetrics
  layouts: CryptogramSayingLayout[]
  /** Column the slots are centred in, once the index column is taken out. */
  bandWidth: number
  /** True when the page could not hold the level's target. */
  reducedByPage: boolean
}

function planAt(options: {
  field: Box
  sayings: readonly string[]
  count: number
}): CryptogramPagePlan | null {
  const { field, sayings, count } = options
  for (let slotW = SLOT_MAX_W; slotW >= SLOT_MIN_W; slotW--) {
    const metrics = slotMetrics(slotW)
    // A lone puzzle needs no number beside it, so it keeps the whole column.
    const bandWidth = count > 1 ? field.width - metrics.indexW : field.width
    const layouts: CryptogramSayingLayout[] = []
    let stack = 0
    let fits = true
    for (let i = 0; i < count; i++) {
      const words = sayings[i]!.split(' ').filter(Boolean)
      const layout = layoutSaying(words, bandWidth, metrics)
      if (!layout) {
        fits = false
        break
      }
      layouts.push(layout)
      stack += layout.height
    }
    if (!fits) continue
    stack += metrics.bandGutter * Math.max(0, count - 1)
    if (stack > field.height) continue
    return { puzzleCount: count, metrics, layouts, bandWidth, reducedByPage: false }
  }
  return null
}

/**
 * The fullest, roomiest page these sayings can make.
 *
 * Count comes before pitch: the floor is already large print, so three sayings
 * at the floor serve a book better than two at the ceiling with a hand's width
 * of white space under them.
 */
export function planCryptogramPage(options: {
  field: Box
  sayings: readonly string[]
  target: number
}): CryptogramPagePlan | null {
  const { field, sayings, target } = options
  const want = Math.min(target, sayings.length)
  for (let count = want; count >= 1; count--) {
    const plan = planAt({ field, sayings, count })
    if (plan) return { ...plan, reducedByPage: count < target }
  }
  return null
}

/** The safe printable column every cryptogram page lays out inside. */
export function cryptogramContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function cryptogramBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = cryptogramContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page this level makes, measured before a single saying exists.
 *
 * Probed with the longest saying the writer is allowed to return, in the
 * longest words it is allowed to use. Two things depend on that being the
 * worst case rather than a typical one:
 *
 * * The form's note is a promise. A note that says three and prints two is a
 *   bug report; measuring the worst case is what makes the promise keepable.
 * * A book wants pages that match. Left to fit whatever it was handed, one
 *   page would print three short sayings and the next two long ones, and a
 *   reader flicking through sees an uneven book. Generate caps itself here, so
 *   every page of one run holds the same number of puzzles.
 */
export function cryptogramWorstCasePlan(options: {
  level: CryptogramLevel
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
}): CryptogramPagePlan | null {
  const { level, page, config, instruction } = options
  return planCryptogramPage({
    field: cryptogramBodyField(page, config, instruction),
    sayings: Array.from({ length: level.targetPuzzles }, () =>
      worstCaseSaying(level.length),
    ),
    target: level.targetPuzzles,
  })
}

/** What this level prints on the page size currently set in Settings. */
export function cryptogramPrintNote(
  level: CryptogramLevel,
  page: StudioConfigLayoutContext | undefined,
  config: StudioConfig,
  instruction: string,
): string {
  const starters =
    level.starterLetters > 0
      ? `, ${level.starterLetters} ${level.starterLetters === 1 ? 'letter' : 'letters'} filled in`
      : ''

  if (!page) {
    return `About ${level.targetPuzzles} ${level.length} sayings a page${starters}, plus a matching answer page.`
  }

  const plan = cryptogramWorstCasePlan({ level, page, config, instruction })

  if (!plan) {
    return `This page size is too small for a ${level.length} cryptogram — choose a larger one in Settings, or a gentler level.`
  }

  const puzzles = `${plan.puzzleCount} ${plan.puzzleCount === 1 ? 'saying' : 'sayings'} a page`
  const size = `letters at ${pxToPt(plan.metrics.codeFont)} pt`
  const note = `${puzzles}, ${size}${starters}, plus a matching answer page.`
  // Say what the page gives, then what to change if they want more. A page
  // holding fewer than the level aims for is not a fault to apologise for —
  // it is the trim doing its job, and the only useful reply is the lever.
  return plan.reducedByPage
    ? `${note} A larger page size in Settings fits more per page.`
    : note
}
