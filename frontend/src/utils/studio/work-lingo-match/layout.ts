import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import type { WorkLingoLevel } from '@/types/studio-work-lingo.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  MAX_MEANING_CHARS,
  MAX_PHRASE_CHARS,
  MIN_PAIRS_PER_PAGE,
  wlLevelSpec,
} from './content'

/**
 * Everything a Work Lingo Match page decides on the seller's behalf.
 *
 * The page holds two lists: the numbered workplace phrases, each with a box
 * to write a letter in, and the lettered meanings. On a trim wide enough for
 * both, they sit side by side like the two columns of a classic matching
 * exercise; on a narrower one they stack, phrases first. Nothing is drawn
 * across the page either way: the reader writes a letter, so a finished page
 * stays as clean as a crossword, and nothing depends on colour.
 *
 * The number that governs the page is the **text size**: phrases, meanings
 * and the answer page all share it, and every gap is set against it. The
 * search runs from generous large print down to a floor that is still
 * comfortable for an older reader. No trim can talk the page into small type —
 * it prints fewer pairs instead, and never fewer than a real puzzle needs.
 *
 * The page reserves a **line budget** for its phrases, its meanings and the
 * answer page's meanings, each sized from a typical entry rather than the
 * longest one allowed. A pair that would overrun a budget is passed over for
 * the next one.
 *
 * The count is a promise made twice. The answer page prints every pair again
 * with its meaning, so a plan only stands if both pages fit.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor; the page prints fewer pairs rather than go below. */
export const TEXT_FONT_MIN = ptToPx(15)
/** Comfortable size tried first, down to this, before the floor is allowed. */
const TEXT_FONT_COMFORT = ptToPx(16)
const TEXT_FONT_MAX = ptToPx(18)

export const TEXT_LINE_HEIGHT = 1.22
/** Past two lines a phrase stops reading as one expression. */
export const MAX_PHRASE_LINES = 2
/** Past two lines a meaning stops being quick to scan. */
export const MAX_MEANING_LINES = 2

/** A comfortable page holds at least this many before the floor size is tried. */
const COMFORT_MIN_PAIRS = 6
/** A single column wider than this runs meanings across a letter page no eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)
/** Two columns side by side may use more of a wide page: each stays narrow. */
const COLUMNS_MAX_WIDTH = Math.round(DPI * 7)
/** Share of a two-column block the phrase column takes — phrases are the shorter entries. */
const PHRASE_COLUMN_SHARE = 0.44

export const PHRASES_HEADING = 'WORKPLACE PHRASES'
export const MEANINGS_HEADING = 'MEANINGS'

/** `stacked` — phrases above meanings. `columns` — phrases left, meanings right. */
export type WlArrangement = 'stacked' | 'columns'

export interface WlMetrics {
  font: number
  /** The square the reader writes a letter in. */
  boxSize: number
  /** Column holding the box, with the space after it. */
  markW: number
  /** Column holding the phrase numbers. */
  numberW: number
  /** Column holding the meaning letters. */
  letterW: number
  /** Space between two phrase rows, before any leftover height is shared out. */
  rowGap: number
  /** Space between two meanings. */
  meaningGap: number
  /** Space between the stacked phrase list and the meanings heading. */
  sectionGap: number
  /** Space between the two lists when they sit side by side. */
  gutter: number
  headingFont: number
  /** Space under a heading, with its rule halfway down. */
  headingGap: number
  /** Answer page: space between a phrase and its meaning below it. */
  innerGap: number
}

export function wlMetrics(font: number): WlMetrics {
  return {
    font,
    boxSize: Math.round(font * 1.3),
    markW: Math.round(font * 1.85),
    // Room for "10." in bold: a page of ten must not run its number into the phrase.
    numberW: Math.round(font * 2.1),
    letterW: Math.round(font * 1.7),
    rowGap: Math.round(font * 0.5),
    meaningGap: Math.round(font * 0.45),
    sectionGap: Math.round(font * 1.0),
    gutter: Math.round(font * 1.4),
    headingFont: Math.round(font * 0.8),
    headingGap: Math.round(font * 0.6),
    innerGap: Math.round(font * 0.2),
  }
}

export const phraseSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const meaningSpec = (font: string): FontSpec => ({ fontFamily: font })
export const keyMeaningSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

/** "1." — the number beside a phrase, on both pages. */
export const pairNumber = (index: number) => `${index + 1}.`

export interface WlPagePlan {
  /** Pairs this page prints. */
  count: number
  arrangement: WlArrangement
  metrics: WlMetrics
  /** Width of the whole block — what gets centred, on both pages. */
  blockWidth: number
  /** Phrase text on the puzzle page, right of the box and the number. */
  phraseWidth: number
  /** Where the meaning list starts, from the block's left edge. */
  meaningLeft: number
  /** Meaning text on the puzzle page, right of its letter. */
  meaningWidth: number
  /** Phrase text on the answer page, right of the box and the number. */
  keyPhraseWidth: number
  /** Meaning text on the answer page, set under its phrase. */
  keyWidth: number
  /** Phrase lines the whole page may use. */
  phraseLines: number
  /** Meaning lines the puzzle page may use. */
  meaningLines: number
  /** Meaning lines the answer page may use. */
  keyLines: number
  bottomGuard: number
}

type Geometry = Pick<
  WlPagePlan,
  | 'arrangement'
  | 'metrics'
  | 'blockWidth'
  | 'phraseWidth'
  | 'meaningLeft'
  | 'meaningWidth'
  | 'keyPhraseWidth'
  | 'keyWidth'
>

function breakTo(text: string, size: number, width: number, spec: FontSpec): string[] {
  return wrapTextToWidth(text, size, wrapSafeWidth(width, spec), spec)
}

/** A phrase as the puzzle page sets it, in bold: hard breaks Fabric has no reason to redo. */
export const breakPhrase = (text: string, plan: Geometry, font: string) =>
  breakTo(text, plan.metrics.font, plan.phraseWidth, phraseSpec(font))

/** A phrase as the answer page sets it, across the full block. */
export const breakKeyPhrase = (text: string, plan: Geometry, font: string) =>
  breakTo(text, plan.metrics.font, plan.keyPhraseWidth, phraseSpec(font))

/** A meaning as it will be set in the puzzle page's list. */
export const breakMeaning = (text: string, plan: Geometry, font: string) =>
  breakTo(text, plan.metrics.font, plan.meaningWidth, meaningSpec(font))

/** A meaning as it will be set under its phrase on the answer page, in italic. */
export const breakKeyMeaning = (text: string, plan: Geometry, font: string) =>
  breakTo(text, plan.metrics.font, plan.keyWidth, keyMeaningSpec(font))

export function textHeight(lines: number, metrics: WlMetrics): number {
  return fabricTextHeight(lines, metrics.font, TEXT_LINE_HEIGHT)
}

/** Drop from a box's top to its row's first line, so the line sits centred in the box. */
export const textOffset = (metrics: WlMetrics) => Math.round((metrics.boxSize - metrics.font) / 2)

/** A phrase row: its box, and a phrase of `lines` lines beside it. */
export function phraseRowHeight(lines: number, metrics: WlMetrics): number {
  return Math.max(metrics.boxSize, textOffset(metrics) + textHeight(lines, metrics))
}

/** An answer-page row: the phrase row, then its meaning of `keyLines` lines under it. */
export function keyRowHeight(lines: number, keyLines: number, metrics: WlMetrics): number {
  return phraseRowHeight(lines, metrics) + metrics.innerGap + textHeight(keyLines, metrics)
}

/** A list heading and the room under it. */
export function headingHeight(metrics: WlMetrics): number {
  return fabricTextHeight(1, metrics.headingFont, 1) + metrics.headingGap
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

/** The phrase list alone, rows only. */
export function phraseListHeight(phraseLines: readonly number[], metrics: WlMetrics): number {
  if (phraseLines.length === 0) return 0
  return sum(phraseLines.map((n) => phraseRowHeight(n, metrics))) + (phraseLines.length - 1) * metrics.rowGap
}

/** The meaning list alone, entries only. */
export function meaningListHeight(meaningLines: readonly number[], metrics: WlMetrics): number {
  if (meaningLines.length === 0) return 0
  return sum(meaningLines.map((n) => textHeight(n, metrics))) + (meaningLines.length - 1) * metrics.meaningGap
}

/** The puzzle page's two lists, with phrases and meanings of the given line counts. */
export function puzzleHeight(
  phraseLines: readonly number[],
  meaningLines: readonly number[],
  metrics: WlMetrics,
  arrangement: WlArrangement,
): number {
  if (phraseLines.length === 0) return 0
  const rows = phraseListHeight(phraseLines, metrics)
  const meanings = meaningListHeight(meaningLines, metrics)
  if (arrangement === 'columns') return headingHeight(metrics) + Math.max(rows, meanings)
  return 2 * headingHeight(metrics) + rows + metrics.sectionGap + meanings
}

/** The answer page: every phrase row with its meaning set beneath it. */
export function answerHeight(
  phraseLines: readonly number[],
  keyLines: readonly number[],
  metrics: WlMetrics,
): number {
  const count = phraseLines.length
  if (count === 0) return 0
  return sum(phraseLines.map((n, i) => keyRowHeight(n, keyLines[i]!, metrics))) + (count - 1) * metrics.rowGap
}

/**
 * `count` entries using the whole line budget, at most two lines each. Extra
 * lines go to separate entries, which is the tallest way to spend them — rows
 * with a box are at least one box tall however short their phrase.
 */
function budgetRows(pageLines: number, count: number): number[] {
  const rows = Array.from({ length: count }, () => 1)
  for (let extra = Math.min(pageLines - count, count), i = 0; extra > 0; extra--, i++) rows[i]! += 1
  return rows
}

/** Entries of everyday length; they set the page's line budgets. */
const TYPICAL_PHRASE = 'Low-hanging fruit'
const TYPICAL_MEANING = 'Come up with fresh, unusual ideas'
/** The longest entries the gates admit, built of ordinary words. */
const PHRASE_PROBE = 'Push the envelope all the way '.repeat(2).slice(0, MAX_PHRASE_CHARS).trim()
const MEANING_PROBE = 'Deal with the most urgent problems as they come '.repeat(2).slice(0, MAX_MEANING_CHARS).trim()

/** Lines `count` entries may use: a typical entry each, and some spare for longer ones. */
const lineBudget = (count: number, typical: number, spare: number) =>
  Math.min(count * 2, count * typical + spare)

/**
 * Column widths for one arrangement. The answer page always sets its rows
 * across the whole block — the phrase beside its box, the meaning under it
 * from the number column — so even a narrow trim gives it a generous measure.
 */
function geometryFor(width: number, metrics: WlMetrics, arrangement: WlArrangement): Geometry {
  const blockWidth = Math.min(width, arrangement === 'columns' ? COLUMNS_MAX_WIDTH : BLOCK_MAX_WIDTH)
  const key = {
    keyPhraseWidth: blockWidth - metrics.markW - metrics.numberW,
    keyWidth: blockWidth - metrics.markW,
  }
  if (arrangement === 'stacked') {
    return {
      arrangement,
      metrics,
      blockWidth,
      ...key,
      phraseWidth: key.keyPhraseWidth,
      meaningLeft: 0,
      meaningWidth: blockWidth - metrics.letterW,
    }
  }
  const phraseColumn = Math.round((blockWidth - metrics.gutter) * PHRASE_COLUMN_SHARE)
  const meaningLeft = phraseColumn + metrics.gutter
  return {
    arrangement,
    metrics,
    blockWidth,
    ...key,
    phraseWidth: phraseColumn - metrics.markW - metrics.numberW,
    meaningLeft,
    meaningWidth: blockWidth - meaningLeft - metrics.letterW,
  }
}

function planAt(
  puzzleField: Box,
  answerFieldHeight: number,
  count: number,
  size: number,
  font: string,
  arrangement: WlArrangement,
): WlPagePlan | null {
  const metrics = wlMetrics(size)
  const geometry = geometryFor(puzzleField.width, metrics, arrangement)

  if (breakPhrase(PHRASE_PROBE, geometry, font).length > MAX_PHRASE_LINES) return null
  if (breakMeaning(MEANING_PROBE, geometry, font).length > MAX_MEANING_LINES) return null
  if (breakKeyMeaning(MEANING_PROBE, geometry, font).length > MAX_MEANING_LINES) return null

  const spare = Math.ceil(count / 3)
  const phraseLines = lineBudget(count, breakPhrase(TYPICAL_PHRASE, geometry, font).length, Math.ceil(count / 4))
  const meaningLines = lineBudget(count, breakMeaning(TYPICAL_MEANING, geometry, font).length, spare)
  const keyLines = lineBudget(count, breakKeyMeaning(TYPICAL_MEANING, geometry, font).length, spare)

  const bottomGuard = Math.round(size * 0.6)
  const phraseRows = budgetRows(phraseLines, count)
  const puzzle = puzzleHeight(phraseRows, budgetRows(meaningLines, count), metrics, arrangement)
  // Budgets are page totals, so the answer page is measured with its long
  // meanings sitting beside the long phrases: the tallest rows it can have.
  // Its phrases have at least the puzzle's measure, so never more lines.
  const answer = answerHeight(phraseRows, budgetRows(keyLines, count), metrics)
  if (puzzle > puzzleField.height - bottomGuard) return null
  if (answer > answerFieldHeight - bottomGuard) return null

  return { count, ...geometry, phraseLines, meaningLines, keyLines, bottomGuard }
}

/**
 * The fullest, roomiest page these fields hold, up to the level's ceiling.
 *
 * Two passes: at least six pairs at a comfortable size first, then anything
 * down to the floor, never below the fewest pairs a puzzle needs. Within a
 * pass count comes before size — the floor is already large print, so a
 * fuller page at a smaller size serves a book better than a sparse one at the
 * largest — and size before arrangement: stacked lists read most simply and
 * are tried first, and side-by-side columns are used when they let a wide
 * page keep a larger type or more pairs.
 */
export function planWlPage(
  puzzleField: Box,
  answerFieldHeight: number,
  font: string,
  maxPairs: number,
): WlPagePlan | null {
  const passes = [
    { minCount: COMFORT_MIN_PAIRS, floor: TEXT_FONT_COMFORT },
    { minCount: MIN_PAIRS_PER_PAGE, floor: TEXT_FONT_MIN },
  ]
  for (const pass of passes) {
    for (let count = maxPairs; count >= pass.minCount; count--) {
      for (let size = TEXT_FONT_MAX; size >= pass.floor; size--) {
        for (const arrangement of ['stacked', 'columns'] as const) {
          const plan = planAt(puzzleField, answerFieldHeight, count, size, font, arrangement)
          if (plan) return plan
        }
      }
    }
  }
  return null
}

/** The safe printable column every page of this game lays out inside. */
export function wlContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function wlBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = wlContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page these settings make, measured before a pair exists.
 *
 * The answer page carries the same title but no instruction, so its field is
 * measured on its own.
 */
export function wlWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
  level: WorkLingoLevel
}): WlPagePlan | null {
  const { page, config, instruction, font, level } = options
  const puzzleField = wlBodyField(page, config, instruction)
  const answerField = wlBodyField(page, config, '')
  return planWlPage(puzzleField, answerField.height, font, wlLevelSpec(level).maxPairs)
}

/** What a page prints on the trim currently in Settings. */
export function wlPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  level: WorkLingoLevel
}): string {
  const { page, level } = options
  const tail = 'plus an answer page.'
  if (!page) return `Up to ${wlLevelSpec(level).maxPairs} phrases to match a page, ${tail}`

  const plan = wlWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for a Work Lingo Match page — choose a larger one in Settings.'
  }
  return `${plan.count} phrases to match a page at ${pxToPt(plan.metrics.font)} pt, ${tail}`
}
