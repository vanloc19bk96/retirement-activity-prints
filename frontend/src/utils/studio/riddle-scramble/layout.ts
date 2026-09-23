import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  RIDDLE_SCRAMBLE_INSTRUCTION,
  worstCaseCandidates,
  worstCaseRiddle,
  type RiddleScrambleCandidate,
} from './content'
import type { RiddleScrambleLevel } from './levels'

/**
 * Everything a Riddle Scramble page decides on the seller's behalf.
 *
 * The number that governs the sheet is not a point size. It is how much room a
 * hand needs to write one capital letter above a short rule — every other
 * measurement is set against that, including the riddle at the foot and the
 * boxes its answer is written into. Having it the other way round is what lets
 * a form promise six words on any trim and then shrink the rows until the
 * letters set at nine point, which is not a puzzle an older reader solves — it
 * is one they put down.
 *
 * So the search runs over *slot pitch* and everything takes its size from it.
 * Unlike the plain anagram sheet, the word count is not a lever here: it is
 * the length of the riddle answer, and dropping a row would leave a letter of
 * that answer unspelled. A page that cannot hold the level says so instead,
 * and `riddleScramblePrintNote` tells the seller before they generate.
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
 * about a quarter inch the letters a solver writes start touching the ones
 * either side of them, and an answer they cannot read back is an answer they
 * cannot check — which on this page also means a riddle they cannot finish.
 */
const SLOT_MIN_INCHES = 0.26
/** Past this a page of four short words reads as a poster rather than a puzzle. */
const SLOT_MAX_INCHES = 0.36

export const SLOT_MIN_W = Math.round(DPI * SLOT_MIN_INCHES)
export const SLOT_MAX_W = Math.round(DPI * SLOT_MAX_INCHES)

/** Scrambled capitals against slot pitch. The row's headline — set it largest. */
const SCRAMBLE_RATIO = 0.82
/** Clue prose against slot pitch. Secondary, but never below large-print comfort. */
const CLUE_RATIO = 0.68
/** Column holding the row number, as a share of slot pitch. */
const INDEX_RATIO = 1.4
/** Height reserved above each rule for the letter a solver writes there. */
const WRITE_ROOM_RATIO = 0.88
/** Air between the scrambled letters and the clue under them. */
const CLUE_GAP_RATIO = 0.18
/** Rule length against slot pitch — the gap keeps the slots countable. */
export const RULE_RATIO = 0.78
/** Air between two word rows, as a share of slot pitch. */
const GUTTER_RATIO = 0.5

/** Hairline under every slot — thin enough not to compete with a written letter. */
export const RULE_HEIGHT = 1

/**
 * Clues are held to one printed line.
 *
 * They could wrap; they are not allowed to. Six rows of a two-line clue is a
 * hundred and more pixels of height that the riddle band needs, and the riddle
 * band cannot be shortened — it is the answer to the page. The content gate
 * caps a clue at thirty characters precisely so this reservation is keepable,
 * and the worst-case probe measures a thirty-character run, so a real clue can
 * be shorter than the promise and never longer.
 */
export const MAX_CLUE_LINES = 1

/** Air between the last word row and the riddle. */
const RIDDLE_LEAD_GAP_RATIO = 1.15
/** The riddle itself against slot pitch — between the scramble and the clue. */
const RIDDLE_RATIO = 0.72
export const RIDDLE_LINE_HEIGHT = 1.3
/**
 * Lines the riddle may run to.
 *
 * Two, because a sixty-character question does not fit one line of a 5 x 8
 * column at a size an older reader wants to read, and a riddle set smaller to
 * save a line is the one piece of copy on the page that must not be small.
 */
export const MAX_RIDDLE_LINES = 3
/** Measure the riddle is broken to, as a share of the body column. */
const RIDDLE_MEASURE_SHARE = 0.92
/** Air between the riddle and the boxes its answer is written into. */
const RIDDLE_GAP_RATIO = 0.45

/** Answer-box pitch against slot pitch — the payoff line, so it sets larger. */
const ANSWER_PITCH_RATIO = 1.25
/** Drawn box width inside its pitch, leaving the boxes countable. */
const ANSWER_BOX_SHARE = 0.84
/** Box height against its own pitch. */
const ANSWER_BOX_HEIGHT_RATIO = 1.05
/** The little row number under each answer box. */
const ANSWER_NUMBER_RATIO = 0.46
const ANSWER_NUMBER_GAP_RATIO = 0.16

/** Air between an answer box and the row number printed under it. */
export function answerNumberGap(metrics: RiddleScrambleMetrics): number {
  return Math.round(metrics.slotW * ANSWER_NUMBER_GAP_RATIO)
}

/**
 * Air kept under the last thing the page draws.
 *
 * Studio plans a page with estimated glyph widths when no canvas is available
 * and with real ones in the browser, so the two disagree slightly about where
 * a wrapped riddle ends; with nothing in reserve, that difference is the
 * answer boxes crossing the safe line. It also simply looks wrong: a box
 * touching the trim edge reads as a printing fault.
 */
const BOTTOM_GUARD_RATIO = 0.45

export interface RiddleScrambleMetrics {
  /** Pitch from one letter slot to the next. */
  slotW: number
  scrambleFont: number
  clueFont: number
  indexFont: number
  indexW: number
  writeRoom: number
  clueGap: number
  gutter: number
  riddleFont: number
  answerPitch: number
  answerBoxW: number
  answerBoxH: number
  answerNumberFont: number
}

export function riddleScrambleMetrics(slotW: number): RiddleScrambleMetrics {
  const scrambleFont = Math.max(1, Math.round(slotW * SCRAMBLE_RATIO))
  const answerPitch = Math.round(slotW * ANSWER_PITCH_RATIO)
  return {
    slotW,
    scrambleFont,
    clueFont: Math.max(1, Math.round(slotW * CLUE_RATIO)),
    // The index sits on the scrambled letters, so it reads as part of that line.
    indexFont: scrambleFont,
    indexW: Math.round(slotW * INDEX_RATIO),
    writeRoom: Math.round(slotW * WRITE_ROOM_RATIO),
    clueGap: Math.round(slotW * CLUE_GAP_RATIO),
    gutter: Math.round(slotW * GUTTER_RATIO),
    riddleFont: Math.max(1, Math.round(slotW * RIDDLE_RATIO)),
    answerPitch,
    answerBoxW: Math.round(answerPitch * ANSWER_BOX_SHARE),
    answerBoxH: Math.round(answerPitch * ANSWER_BOX_HEIGHT_RATIO),
    answerNumberFont: Math.max(1, Math.round(slotW * ANSWER_NUMBER_RATIO)),
  }
}

/** Letters spaced out so a scramble reads as loose letters, not as a word. */
export function spacedLetters(letters: string): string {
  return toNonBreakingSpaces([...letters].join(' '))
}

/**
 * Width of a spaced letter run.
 *
 * Order does not change it: every letter is measured as its own word, so a
 * scramble is exactly as wide as the word it was shuffled from. That is what
 * lets the page be planned from the words alone, before any shuffling has
 * happened.
 */
export function spacedRunWidth(
  letters: string,
  fontSize: number,
  maxWidth: number,
  spec: FontSpec,
): number {
  return hugTextBoxWidth(spacedLetters(letters), fontSize, maxWidth, spec)
}

export interface RiddleBandPlan {
  /** The riddle as it will be set, already broken to the column. */
  lines: string[]
  /** Width the riddle textbox is given — the measure, not the glyph run. */
  measure: number
  /** Riddle and answer boxes together. */
  height: number
  /** Width of the row of answer boxes, what gets centred. */
  answerWidth: number
  /** Air between the last word row and the riddle. */
  leadGap: number
  riddleHeight: number
  riddleGap: number
  answerHeight: number
}

export interface RiddleScrambleRowPlan {
  /** Clue as it will be set — one line, spaces locked so Fabric cannot wrap it. */
  clue: string
  clueWidth: number
}

export interface RiddleScramblePagePlan {
  /** Words this page prints — always one per letter of the riddle answer. */
  rowCount: number
  metrics: RiddleScrambleMetrics
  rows: RiddleScrambleRowPlan[]
  /** Height of one word row, identical for every row on the page. */
  rowHeight: number
  /** Drawn width of a word row, row number included — what gets centred. */
  columnWidth: number
  /** Width the scramble, clue and slots are drawn in, right of the row number. */
  bandWidth: number
  riddle: RiddleBandPlan
  /** Air kept under the answer boxes so they never sit on the safe line. */
  bottomGuard: number
}

/**
 * Shape the page is held to, so every sheet of one run matches.
 *
 * Without it the real page re-derives its own pitch from the words it was
 * handed, and a page of short clues comes out at 21 pt beside a page of long
 * ones at 16 pt. Each is a good page; together they are not a book. Generate
 * measures the worst case once and pins this.
 */
export interface RiddleScramblePageLock {
  slotW: number
}

function planClues(options: {
  items: readonly RiddleScrambleCandidate[]
  bandWidth: number
  clueFont: number
  spec: FontSpec
}): { rows: RiddleScrambleRowPlan[]; widest: number } | null {
  const { items, bandWidth, clueFont, spec } = options
  const rows: RiddleScrambleRowPlan[] = []
  let widest = 0

  for (const item of items) {
    // Spaces are locked, so the drawn string is one line whatever box Fabric
    // is given — the only thing left to check is that the line fits the column.
    const clue = toNonBreakingSpaces(item.clue)
    const width = hugTextBoxWidth(clue, clueFont, Number.POSITIVE_INFINITY, spec)
    if (width > bandWidth) return null
    widest = Math.max(widest, width)
    rows.push({ clue, clueWidth: width })
  }
  return { rows, widest }
}

function planRiddleBand(options: {
  riddle: string
  answerLetters: number
  field: Box
  metrics: RiddleScrambleMetrics
  spec: FontSpec
}): RiddleBandPlan | null {
  const { riddle, answerLetters, field, metrics, spec } = options
  const measure = Math.max(1, Math.floor(field.width * RIDDLE_MEASURE_SHARE))
  const lines = wrapTextToWidth(
    riddle,
    metrics.riddleFont,
    wrapSafeWidth(measure, spec),
    spec,
  )
  if (lines.length > MAX_RIDDLE_LINES) return null

  const answerWidth = metrics.answerPitch * answerLetters
  if (answerWidth > field.width) return null

  const leadGap = Math.round(metrics.slotW * RIDDLE_LEAD_GAP_RATIO)
  const riddleHeight = fabricTextHeight(
    lines.length,
    metrics.riddleFont,
    RIDDLE_LINE_HEIGHT,
  )
  const riddleGap = Math.round(metrics.slotW * RIDDLE_GAP_RATIO)
  const answerHeight =
    metrics.answerBoxH +
    answerNumberGap(metrics) +
    fabricTextHeight(1, metrics.answerNumberFont)

  return {
    lines,
    measure,
    answerWidth,
    leadGap,
    riddleHeight,
    riddleGap,
    answerHeight,
    height: leadGap + riddleHeight + riddleGap + answerHeight,
  }
}

export function rowHeightFor(metrics: RiddleScrambleMetrics): number {
  const { scrambleFont, clueFont, clueGap, writeRoom } = metrics
  return (
    fabricTextHeight(1, scrambleFont) +
    clueGap +
    fabricTextHeight(MAX_CLUE_LINES, clueFont) +
    writeRoom +
    RULE_HEIGHT
  )
}

export interface PlanRiddleScrambleOptions {
  field: Box
  items: readonly RiddleScrambleCandidate[]
  riddle: string
  answerLetters: number
  spec: FontSpec
  lock?: RiddleScramblePageLock
}

/**
 * The roomiest page these words, this riddle and this trim can make.
 *
 * Every row prints or none do: each word stands for one letter of the answer,
 * so a page that drops a row is a page whose riddle cannot be solved. The only
 * lever is pitch, and when even the floor will not fit, the answer is null and
 * the caller tells the seller which knob to turn.
 */
export function planRiddleScramblePage(
  options: PlanRiddleScrambleOptions,
): RiddleScramblePagePlan | null {
  const { field, items, riddle, answerLetters, spec, lock } = options
  const rowCount = items.length
  if (rowCount === 0) return null

  const maxSlot = lock ? lock.slotW : SLOT_MAX_W
  const minSlot = lock ? lock.slotW : SLOT_MIN_W

  for (let slotW = maxSlot; slotW >= minSlot; slotW--) {
    const metrics = riddleScrambleMetrics(slotW)
    const bandWidth = Math.floor(field.width - metrics.indexW)
    if (bandWidth <= 0) continue

    // Slots are the widest thing a row draws; the scramble shares their letters
    // but is set loose rather than on the pitch, so both are checked.
    let contentWidth = 0
    let fits = true
    for (const item of items) {
      const slotsW = item.word.length * metrics.slotW
      const scrambleW = spacedRunWidth(
        item.word,
        metrics.scrambleFont,
        Number.POSITIVE_INFINITY,
        spec,
      )
      if (slotsW > bandWidth || scrambleW > bandWidth) {
        fits = false
        break
      }
      contentWidth = Math.max(contentWidth, slotsW, scrambleW)
    }
    if (!fits) continue

    const clues = planClues({ items, bandWidth, clueFont: metrics.clueFont, spec })
    if (!clues) continue

    const band = planRiddleBand({ riddle, answerLetters, field, metrics, spec })
    if (!band) continue

    const rowHeight = rowHeightFor(metrics)
    const gaps = Math.max(0, rowCount - 1)
    const stack = rowHeight * rowCount + metrics.gutter * gaps + band.height
    const bottomGuard = Math.round(slotW * BOTTOM_GUARD_RATIO)
    if (stack > field.height - bottomGuard) continue

    const drawnWidth = Math.max(contentWidth, clues.widest)
    return {
      rowCount,
      metrics,
      rows: clues.rows,
      rowHeight,
      columnWidth: metrics.indexW + drawnWidth,
      bandWidth: drawnWidth,
      riddle: band,
      bottomGuard,
    }
  }
  return null
}

/** The shape a worst-case plan pins the real pages of that run to. */
export function riddleScramblePageLock(
  plan: RiddleScramblePagePlan,
): RiddleScramblePageLock {
  return { slotW: plan.metrics.slotW }
}

/** The safe printable column every riddle scramble page lays out inside. */
export function riddleScrambleContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function riddleScrambleBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = riddleScrambleContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The page this level makes, measured before a single word exists.
 *
 * Probed with the longest word the band allows, beside the longest clue the
 * line accepts, under the longest riddle the band accepts. Two things depend
 * on that being the worst case rather than a typical one:
 *
 * * The form's note is a promise. A note that says a level fits and then
 *   prints an error page is a bug report; measuring the worst case is what
 *   makes the promise keepable.
 * * A book wants pages that match. Left to fit whatever it was handed, one
 *   page would set at 24 pt and the next at 19, and a reader flicking through
 *   sees an uneven book. Generate pins the real pages to this shape.
 */
export function riddleScrambleWorstCasePlan(options: {
  level: RiddleScrambleLevel
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): RiddleScramblePagePlan | null {
  const { level, page, config, instruction, font } = options
  return planRiddleScramblePage({
    field: riddleScrambleBodyField(page, config, instruction),
    items: worstCaseCandidates(level),
    riddle: worstCaseRiddle(),
    answerLetters: level.answerLetters,
    spec: { fontFamily: font },
  })
}

/** What this level prints on the page size currently set in Settings. */
export function riddleScramblePrintNote(options: {
  level: RiddleScrambleLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { level, page, config, instruction, font } = options
  const shape =
    `${level.answerLetters} words a page, ${level.minLetters}–${level.maxLetters} letters, ` +
    `and a ${level.answerLetters}-letter riddle answer`

  if (!page) {
    return `${shape}, plus a matching answer page.`
  }

  const plan = riddleScrambleWorstCasePlan({ level, page, config, instruction, font })
  if (!plan) {
    return (
      'This page size is too small for a riddle scramble at this level — ' +
      'choose a larger one in Settings, or a gentler level.'
    )
  }
  return `${shape}, letters at ${pxToPt(plan.metrics.scrambleFont)} pt, plus a matching answer page.`
}

/** Instruction text the page will actually carry, for layout measurement. */
export function instructionFor(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return RIDDLE_SCRAMBLE_INSTRUCTION
}
