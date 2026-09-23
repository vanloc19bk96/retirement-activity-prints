import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import type { PhraseFinderItem } from '@/types/studio-phrase-finder.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import {
  fabricTextHeight,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { worstCaseItem } from './content'
import { toPhraseModel, type PhraseModel, type PhraseWord } from './phrase'
import type { PhraseFinderLevel } from './levels'

/**
 * Everything a Phrase Finder page decides on the seller's behalf.
 *
 * The number that governs this page is not a point size. It is how much room a
 * hand needs to write one capital above a short rule — every other measurement
 * on the sheet is set against that. Having it the other way round is what lets
 * a form promise "large print" and then set a puzzle at a size its buyer cannot
 * write in.
 *
 * So the search runs over *slot pitch*, and the letters, the punctuation, the
 * word gaps and the puzzle number all take their sizes from it. The clue is the
 * one thing that does not shrink all the way with it: it carries its own point
 * floor, because it is the line a solver reads to reach the saying and a book
 * sold on large print cannot set that line at footnote size.
 *
 * The page also decides how many puzzles print: start at the level's target and
 * step down until every clue and phrase still fits at the writing floor. The
 * form reports what came out (`phraseFinderPrintNote`) and generate lays out
 * against the same plan, so the note and the printed page can never disagree.
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
 * Measured from a ballpoint and an older hand rather than from type. Below
 * about a quarter inch the letters a solver writes start touching the printed
 * ones either side of them, and an answer they cannot read back is an answer
 * they cannot check.
 */
const SLOT_HAND_MIN_INCHES = 0.26
/** Past this a short phrase reads as a poster rather than a puzzle. */
const SLOT_MAX_INCHES = 0.36

/** Printed letters against slot pitch. Air either side of the glyph. */
const LETTER_RATIO = 0.78

/**
 * Point size the printed letters may never fall below.
 *
 * This book is bought for its large print, so the floor is structural rather
 * than a setting a seller could turn off. Sixteen point is where large-print
 * publishing guidance settles, and everything else on the row is measured
 * against the slot that produces it.
 */
export const MIN_LETTER_PT = 16

/**
 * The floor is whichever is larger: room for a hand, or room for the type.
 *
 * They are close, and which one binds depends on the ratios above — writing it
 * as a maximum means changing `LETTER_RATIO` can never quietly drop the page
 * below the size it is sold at.
 */
export const SLOT_MIN_W = Math.max(
  Math.round(DPI * SLOT_HAND_MIN_INCHES),
  Math.ceil(ptToPx(MIN_LETTER_PT) / LETTER_RATIO),
)
export const SLOT_MAX_W = Math.round(DPI * SLOT_MAX_INCHES)

/**
 * Gap between two words, as a share of slot pitch.
 *
 * Much wider than a letter slot, and that is the single most important
 * proportion on the page. Word lengths are what a solver reasons from — a
 * four-letter word after a three-letter one is half the puzzle — so a reader
 * who miscounts a gap as a blank is solving a different phrase from the one
 * printed. At 1.3 the break is unmistakable at arm's length without the row
 * drifting apart into unrelated fragments.
 */
const WORD_GAP_RATIO = 1.3

/**
 * Width of a punctuation cell, as a share of slot pitch.
 *
 * Narrower than a letter, because a mark is not a blank and must never be
 * counted as one. A comma given a full slot sits in the middle of a space
 * exactly as wide as the rules either side of it, and the row then reads as
 * having one more letter than it does.
 */
const MARK_RATIO = 0.52

/**
 * Clue prose against slot pitch.
 *
 * Secondary to the blanks and never small. The clue is the only thing on this
 * page a solver *reads* rather than fills in, and it is what makes the saying
 * reachable at all, so it carries its own point floor rather than shrinking
 * with the slot — a book sold on its large print cannot set the one line that
 * carries the puzzle at footnote size.
 */
const CLUE_RATIO = 0.7
/** Point size the clue may never fall below, whatever the trim. */
export const MIN_CLUE_PT = 14
/** Air between the clue and the first row of blanks under it. */
const CLUE_GAP_RATIO = 0.42
/** Leading inside a wrapped clue. */
export const CLUE_LINE_HEIGHT = 1.25

/**
 * Clue lines one puzzle may take, and the height the probe reserves for each.
 *
 * Two is what `MAX_CLUE_CHARS` breaks into on the narrowest interior this app
 * sells, and reserving two for every puzzle before a clue exists is what lets
 * the form promise a puzzle count the page keeps: a real clue can be shorter
 * than the promise, never longer.
 */
export const MAX_CLUE_LINES = 2

/** Height reserved above each rule for the letter a solver writes there. */
const WRITE_ROOM_RATIO = 1.05
/** Lift of a printed or written letter off the rules. */
const LETTER_LIFT_RATIO = 0.1
/** Air under one row of blanks before the next, as a share of slot pitch. */
const ROW_GAP_RATIO = 0.55
/** Column holding "1." beside each puzzle, as a share of slot pitch. */
const INDEX_RATIO = 1.7
/** Air between two puzzles on one page, as a share of row pitch. */
const PUZZLE_GUTTER_RATIO = 0.75
/** Air kept under the last rule so it never sits on the safe line. */
const BOTTOM_GUARD_RATIO = 0.6

/** Rule length against slot pitch — the gap keeps the blanks countable. */
export const RULE_RATIO = 0.82

/**
 * Weight of a writing rule.
 *
 * Two device pixels rather than a hairline. The rules here are the puzzle's
 * whole structure — a reader counts them to read a word length — so they have
 * to survive KDP's print pipeline at the bottom of a page, where a one-pixel
 * line can drop out entirely.
 */
export const RULE_HEIGHT = 2

/**
 * Share of the level's aim a page must reach before the form suggests a larger
 * trim. A page one puzzle short is the ordinary cost of a small trim and needs
 * no comment; half the aim is worth telling a seller about.
 */
const NUDGE_BELOW_SHARE = 0.7

export interface PhraseFinderMetrics {
  /** Pitch from one letter slot to the next. */
  slotW: number
  /** Width of a punctuation cell. */
  markW: number
  /** Width of the gap between two words. */
  wordGapW: number
  letterFont: number
  clueFont: number
  indexW: number
  /** Height above each rule, for the letter a solver writes. */
  writeRoom: number
  /** Lift of a glyph off the rules, so ink does not sit on ink. */
  letterLift: number
  /** Pitch from one row of blanks to the next. */
  lineH: number
  /** Air between the clue and the blanks it belongs to. */
  clueGap: number
  puzzleGutter: number
  bottomGuard: number
}

export function phraseFinderMetrics(slotW: number): PhraseFinderMetrics {
  const writeRoom = Math.round(slotW * WRITE_ROOM_RATIO)
  const lineH = writeRoom + RULE_HEIGHT + Math.round(slotW * ROW_GAP_RATIO)
  return {
    slotW,
    markW: Math.round(slotW * MARK_RATIO),
    wordGapW: Math.round(slotW * WORD_GAP_RATIO),
    letterFont: Math.max(1, Math.round(slotW * LETTER_RATIO)),
    clueFont: Math.max(ptToPx(MIN_CLUE_PT), Math.round(slotW * CLUE_RATIO)),
    indexW: Math.round(slotW * INDEX_RATIO),
    writeRoom,
    letterLift: Math.round(slotW * LETTER_LIFT_RATIO),
    lineH,
    clueGap: Math.round(slotW * CLUE_GAP_RATIO),
    puzzleGutter: Math.round(lineH * PUZZLE_GUTTER_RATIO),
    bottomGuard: Math.round(slotW * BOTTOM_GUARD_RATIO),
  }
}

/** Height a clue block takes once broken to its column. */
export function clueBlockHeight(
  lineCount: number,
  metrics: PhraseFinderMetrics,
): number {
  return Math.ceil(
    fabricTextHeight(Math.max(1, lineCount), metrics.clueFont, CLUE_LINE_HEIGHT),
  )
}

/** Width one word occupies — letters at slot pitch, marks narrower. */
export function wordWidth(word: PhraseWord, metrics: PhraseFinderMetrics): number {
  let width = 0
  for (const cell of word.cells) {
    width += cell.kind === 'letter' ? metrics.slotW : metrics.markW
  }
  return width
}

/** Width of one printed row, word gaps included. */
export function rowWidth(
  words: readonly PhraseWord[],
  metrics: PhraseFinderMetrics,
): number {
  const content = words.reduce((total, word) => total + wordWidth(word, metrics), 0)
  return content + metrics.wordGapW * Math.max(0, words.length - 1)
}

/** Words grouped per printed row; a word never breaks across rows. */
function greedyWrap(
  words: readonly PhraseWord[],
  metrics: PhraseFinderMetrics,
  measure: number,
): PhraseWord[][] | null {
  const lines: PhraseWord[][] = []
  let current: PhraseWord[] = []
  let currentWidth = 0

  for (const word of words) {
    const width = wordWidth(word, metrics)
    // A word wider than the column can only be fixed by a smaller pitch, never
    // by breaking it — half a word on each of two rows is unsolvable.
    if (width > measure) return null
    const withGap =
      current.length === 0 ? width : currentWidth + metrics.wordGapW + width
    if (current.length > 0 && withGap > measure) {
      lines.push(current)
      current = [word]
      currentWidth = width
      continue
    }
    current.push(word)
    currentWidth = withGap
  }
  if (current.length > 0) lines.push(current)
  return lines.length > 0 ? lines : null
}

/**
 * Wrap a phrase into the column, then square the rows off.
 *
 * Greedy wrapping alone fills every row to the margin and drops whatever is
 * left onto the last one, so a phrase that needs a row and a bit prints as a
 * full row followed by a single word floating under it. On a page whose whole
 * subject is counting blanks, that stray row reads as a separate puzzle.
 *
 * So the greedy pass only settles *how many* rows the phrase needs. The wrap is
 * then repeated at narrower and narrower measures, and the narrowest one that
 * still fits in that many rows wins — which pulls words back down from the full
 * rows until the block is as even as it can be without costing a row. The
 * result is centred by `draw.ts`, so an even block is a centred one.
 */
export function wrapPhrase(
  model: PhraseModel,
  metrics: PhraseFinderMetrics,
  bandWidth: number,
): PhraseWord[][] | null {
  if (bandWidth <= 0 || model.words.length === 0) return null
  const widest = greedyWrap(model.words, metrics, bandWidth)
  if (!widest) return null
  if (widest.length === 1) return widest

  const floor = Math.max(
    ...model.words.map((word) => wordWidth(word, metrics)),
  )
  let low = floor
  let high = bandWidth
  let best = widest
  while (low <= high) {
    const measure = Math.floor((low + high) / 2)
    const lines = greedyWrap(model.words, metrics, measure)
    if (lines && lines.length <= widest.length) {
      best = lines
      high = measure - 1
    } else {
      low = measure + 1
    }
  }
  return best
}

export interface PhraseFinderPuzzleLayout {
  /** The clue, already broken to the column the page will set it in. */
  clueLines: string[]
  /** Height the clue block reserves above the blanks. */
  clueHeight: number
  lines: PhraseWord[][]
  /** The whole block: clue, gap, rows of blanks. */
  height: number
}

/** One puzzle as the planner needs it: the phrase taken apart, and its clue. */
export interface PhraseFinderPlanItem {
  model: PhraseModel
  clue: string
}

export function toPlanItems(
  items: readonly PhraseFinderItem[],
): PhraseFinderPlanItem[] {
  return items.map((item) => ({ model: toPhraseModel(item.text), clue: item.clue }))
}

export interface PhraseFinderPagePlan {
  /** Puzzles this page prints — never more than the level asked for. */
  puzzleCount: number
  metrics: PhraseFinderMetrics
  layouts: PhraseFinderPuzzleLayout[]
  /** Column the clue and the rows are set in, once the number is taken out. */
  bandWidth: number
  /** True when a puzzle number is printed beside each block. */
  showIndex: boolean
  /** True when the page could not hold the level's target. */
  reducedByPage: boolean
}

/**
 * Shape a whole run is held to, so every sheet of one book matches.
 *
 * Without it the real page re-derives its pitch from the phrases it was handed,
 * and a page of short sayings comes out at 26 pt beside a page of long ones at
 * 17 pt. Each is a good page; together they are not a book. Generate measures
 * the worst case once and pins this.
 */
export interface PhraseFinderPageLock {
  slotW: number
}

function planAt(options: {
  field: Box
  items: readonly PhraseFinderPlanItem[]
  count: number
  spec: FontSpec
  /** Clue lines to reserve whatever the clues handed in break into. */
  minClueLines?: number
  lock?: PhraseFinderPageLock
}): PhraseFinderPagePlan | null {
  const { field, items, count, spec, minClueLines = 1, lock } = options
  const maxSlot = lock ? lock.slotW : SLOT_MAX_W
  const minSlot = lock ? lock.slotW : SLOT_MIN_W

  for (let slotW = maxSlot; slotW >= minSlot; slotW--) {
    const metrics = phraseFinderMetrics(slotW)
    // A lone puzzle needs no number beside it, so it keeps the whole column.
    const showIndex = count > 1
    const bandWidth = showIndex ? field.width - metrics.indexW : field.width
    const wrapAt = wrapSafeWidth(bandWidth, spec)
    const layouts: PhraseFinderPuzzleLayout[] = []
    let stack = 0
    let fits = true

    for (let i = 0; i < count; i++) {
      const item = items[i]!
      const lines = wrapPhrase(item.model, metrics, bandWidth)
      if (!lines) {
        fits = false
        break
      }
      // Broken here rather than left to Fabric, so the height reserved is the
      // height drawn. A clue longer than the probe allowed for is measured at
      // its real height rather than refused: a page one puzzle shorter is a
      // disappointment, a page that failed to print is a bug report.
      const clueLines = wrapTextToWidth(item.clue, metrics.clueFont, wrapAt, spec)
      const clueHeight = clueBlockHeight(
        Math.max(minClueLines, clueLines.length),
        metrics,
      )
      const height = clueHeight + metrics.clueGap + lines.length * metrics.lineH
      layouts.push({ clueLines, clueHeight, lines, height })
      stack += height
    }
    if (!fits) continue

    stack += metrics.puzzleGutter * Math.max(0, count - 1)
    if (stack > field.height - metrics.bottomGuard) continue

    return {
      puzzleCount: count,
      metrics,
      layouts,
      bandWidth,
      showIndex,
      reducedByPage: false,
    }
  }
  return null
}

/**
 * The fullest, roomiest page these phrases can make.
 *
 * Count comes before pitch: the floor is already large print, so three phrases
 * at the floor serve a book better than two at the ceiling with a hand's width
 * of white space under them.
 */
export function planPhraseFinderPage(options: {
  field: Box
  items: readonly PhraseFinderPlanItem[]
  target: number
  spec: FontSpec
  minClueLines?: number
  lock?: PhraseFinderPageLock
}): PhraseFinderPagePlan | null {
  const { field, items, target, spec, minClueLines, lock } = options
  const want = Math.min(target, items.length)
  for (let count = want; count >= 1; count--) {
    const plan = planAt({ field, items, count, spec, minClueLines, lock })
    if (plan) return { ...plan, reducedByPage: count < target }
  }
  return null
}

/** The shape a worst-case plan pins the real pages of that run to. */
export function phraseFinderPageLock(
  plan: PhraseFinderPagePlan,
): PhraseFinderPageLock {
  return { slotW: plan.metrics.slotW }
}

/** The safe printable column every Phrase Finder page lays out inside. */
export function phraseFinderContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function phraseFinderBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = phraseFinderContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page this level makes, measured before a single phrase exists.
 *
 * Probed with the longest phrase the writer may return, in the longest words it
 * may use, carrying its full allowance of marks — and under a clue filling its
 * whole character budget in glyphs wider than ordinary prose, reserving both
 * the lines it breaks into. Two things depend on that being the worst case
 * rather than a typical one:
 *
 * * The form's note is a promise. A note that says three and prints two is a
 *   bug report; measuring the worst case is what makes the promise keepable.
 * * A book wants pages that match. Left to fit whatever it was handed, one page
 *   would print three short phrases and the next two long ones, and a reader
 *   flicking through sees an uneven book. Generate caps itself here, so every
 *   page of one run holds the same number of puzzles at the same pitch.
 */
export function phraseFinderWorstCasePlan(options: {
  level: PhraseFinderLevel
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): PhraseFinderPagePlan | null {
  const { level, page, config, instruction, font } = options
  const probe = worstCaseItem(level.length)
  return planPhraseFinderPage({
    field: phraseFinderBodyField(page, config, instruction),
    items: toPlanItems(Array.from({ length: level.targetPuzzles }, () => probe)),
    target: level.targetPuzzles,
    spec: { fontFamily: font },
    minClueLines: MAX_CLUE_LINES,
  })
}

/** What this level prints on the page size currently set in Settings. */
export function phraseFinderPrintNote(options: {
  level: PhraseFinderLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { level, page, config, instruction, font } = options
  // "Up to", not "about": the per-word caps in `reveal.ts` bind before the
  // level's share does on a phrase built from short words, so the share is a
  // ceiling the page reaches rather than a figure it always prints.
  const given = `up to ${Math.round(level.revealShare * 100)}% of the letters given`

  if (!page) {
    return `About ${level.targetPuzzles} ${level.length} phrases a page, each with a clue, ${given}, plus a matching answer page.`
  }

  const plan = phraseFinderWorstCasePlan({ level, page, config, instruction, font })
  if (!plan) {
    return 'This page size is too small for a Phrase Finder page at this level — choose a larger one in Settings, or a gentler level.'
  }

  const puzzles = `${plan.puzzleCount} ${plan.puzzleCount === 1 ? 'phrase' : 'phrases'} a page`
  const size = `letters at ${pxToPt(plan.metrics.letterFont)} pt`
  const note = `${puzzles}, each with a clue, ${given}, ${size}, plus a matching answer page.`
  // Say what the page gives, then what to change if they want more. A page
  // holding fewer than the level aims for is not a fault to apologise for — it
  // is the trim doing its job, and the only useful reply is the lever.
  return plan.puzzleCount < level.targetPuzzles * NUDGE_BELOW_SHARE
    ? `${note} A larger page size in Settings fits more per page.`
    : note
}
