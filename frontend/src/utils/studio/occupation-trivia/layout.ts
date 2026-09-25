import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  FABRIC_FONT_SIZE_MULT,
  fabricTextHeight,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  MAX_CHOICE_CHARS,
  MAX_QUESTION_CHARS,
  OT_CHOICE_COUNT,
  OT_MIN_QUESTIONS,
  OT_TARGET_QUESTIONS,
} from './content'

/**
 * Everything an Occupation Trivia Pack decides on the seller's behalf.
 *
 * A pack is a quiz that flows over as many pages as it needs, then one answer
 * page. Each question is its number, its wording, and four lettered choices
 * under it, each letter printed inside a ring the reader circles. The choices
 * sit two by two when every one fits a single line of half the column, and
 * one under another otherwise — so a short set stays compact and a long one
 * never wraps into a squint.
 *
 * The number that governs the quiz is the **text size**. The search runs from
 * generous large print down to a floor that is still comfortable for an older
 * reader, and takes the largest size at which the pack fits within its page
 * limit. No trim can talk the quiz into small type: it prints on more pages,
 * or — on the smallest trims — a pack of eight instead of ten.
 *
 * The answer page is one page, always: number, ringed letter, the answer, and
 * a short italic note. It is planned from the questions actually placed, and
 * drops the notes rather than a single answer if a small trim cannot hold them.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for the quiz; the pack spreads over more pages rather than go below. */
export const TEXT_FONT_MIN = ptToPx(15)
const TEXT_FONT_MAX = ptToPx(18)
/** The answer page is a reference list, and may sit a little smaller than the quiz. */
export const KEY_FONT_MIN = ptToPx(13)
const KEY_FONT_MAX = ptToPx(16)
/** The italic note under an answer. */
export const NOTE_FONT_MIN = ptToPx(12)

export const TEXT_LINE_HEIGHT = 1.22
/** Past four lines a question stops being quick to read (only small trims get near it). */
export const MAX_QUESTION_LINES = 4
/** Past two lines a choice stops reading as one answer. */
export const MAX_CHOICE_LINES = 2
/** An answer on the answer page, beside its letter. */
export const MAX_KEY_ANSWER_LINES = 2
/** A note on the answer page. */
export const MAX_NOTE_LINES = 3
/** A pack longer than this stops feeling like one activity. */
export const MAX_QUIZ_PAGES = 4

/** Blocks wider than this run questions across a letter page no eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)

export const CONTINUE_LINE = 'Continued on the next page'

export interface OtMetrics {
  font: number
  /** Column holding the question numbers. */
  numberW: number
  /** Radius of the ring each letter sits in. */
  ringR: number
  /** The letter inside the ring. */
  letterFont: number
  /** Column holding a ring, with the space after it. */
  ringW: number
  /** Between a question's last line and its first choice. */
  choiceGap: number
  /** Between two rows of choices. */
  choiceRowGap: number
  /** Between the two columns of a two-by-two set. */
  gutter: number
  /** Between two questions, before leftover height is shared out. */
  itemGap: number
  /** The "continued" line at the foot of a quiz page. */
  footerFont: number
  footerGap: number
}

export function otMetrics(font: number): OtMetrics {
  return {
    font,
    numberW: Math.round(font * 2.1),
    ringR: Math.round(font * 0.62),
    letterFont: Math.round(font * 0.78),
    ringW: Math.round(font * 1.24 + font * 0.5),
    choiceGap: Math.round(font * 0.55),
    choiceRowGap: Math.round(font * 0.4),
    gutter: Math.round(font * 1.0),
    itemGap: Math.round(font * 1.1),
    footerFont: Math.max(NOTE_FONT_MIN, Math.round(font * 0.8)),
    footerGap: Math.round(font * 0.7),
  }
}

export const textSpec = (font: string): FontSpec => ({ fontFamily: font })
export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

/** "1." — the number beside a question, on the quiz and on the answer page. */
export const itemNumber = (index: number) => `${index + 1}.`

export interface OtQuizGeometry {
  metrics: OtMetrics
  /** Width of the question block — what gets centred. */
  blockWidth: number
  /** Question text, right of the number column. */
  textWidth: number
  /** One column of a two-by-two set, ring included. */
  cellWidth: number
  /** Choice text in a two-by-two set, right of its ring. */
  gridChoiceWidth: number
  /** Choice text in a stacked set, right of its ring. */
  listChoiceWidth: number
}

export interface OtQuizPlan extends OtQuizGeometry {
  /** Questions the pack prints. */
  count: number
  /** Most quiz pages the pack may use — what the form promises. */
  pages: number
  bottomGuard: number
  /** Room kept at the foot of every quiz page for the "continued" line. */
  footerHeight: number
}

function quizGeometry(width: number, font: number): OtQuizGeometry {
  const metrics = otMetrics(font)
  const blockWidth = Math.min(width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth - metrics.numberW
  const cellWidth = Math.floor((textWidth - metrics.gutter) / 2)
  return {
    metrics,
    blockWidth,
    textWidth,
    cellWidth,
    gridChoiceWidth: cellWidth - metrics.ringW,
    listChoiceWidth: textWidth - metrics.ringW,
  }
}

function breakTo(text: string, size: number, width: number, spec: FontSpec): string[] {
  return wrapTextToWidth(text, size, wrapSafeWidth(width, spec), spec)
}

/** A question as it will be set: hard breaks Fabric has no reason to redo. */
export const breakQuestion = (text: string, g: OtQuizGeometry, font: string) =>
  breakTo(text, g.metrics.font, g.textWidth, textSpec(font))

export type OtArrangement = 'grid' | 'list'

/** The four choices as they will be set: two by two when all fit one line of a half column. */
export function arrangeChoices(
  choices: readonly string[],
  g: OtQuizGeometry,
  font: string,
): { arrangement: OtArrangement; lines: string[][] } {
  const spec = textSpec(font)
  const grid = choices.map((choice) => breakTo(choice, g.metrics.font, g.gridChoiceWidth, spec))
  if (grid.every((lines) => lines.length === 1)) return { arrangement: 'grid', lines: grid }
  return {
    arrangement: 'list',
    lines: choices.map((choice) => breakTo(choice, g.metrics.font, g.listChoiceWidth, spec)),
  }
}

export function textHeight(lines: number, metrics: OtMetrics): number {
  return fabricTextHeight(lines, metrics.font, TEXT_LINE_HEIGHT)
}

/** Drop from a choice row's top to its first line, so the line sits centred in its ring. */
export const choiceTextOffset = (m: OtMetrics) =>
  Math.max(0, Math.round((2 * m.ringR - m.font * FABRIC_FONT_SIZE_MULT) / 2))

/** One row of choices, as tall as its tallest choice or its ring. */
export function choiceRowHeight(lines: number, m: OtMetrics): number {
  return Math.max(2 * m.ringR, choiceTextOffset(m) + textHeight(lines, m))
}

/** Every choice row of one question, top to bottom. */
export function choiceRows(arrangement: OtArrangement, lines: readonly number[]): number[] {
  if (arrangement === 'grid') return [Math.max(lines[0]!, lines[1]!), Math.max(lines[2]!, lines[3]!)]
  return [...lines]
}

export function choicesHeight(arrangement: OtArrangement, lines: readonly number[], m: OtMetrics): number {
  const rows = choiceRows(arrangement, lines)
  return rows.reduce((sum, n) => sum + choiceRowHeight(n, m), 0) + (rows.length - 1) * m.choiceRowGap
}

/** One question: its wording, the gap, its choices. */
export function questionBlockHeight(
  questionLines: number,
  arrangement: OtArrangement,
  choiceLines: readonly number[],
  m: OtMetrics,
): number {
  return textHeight(questionLines, m) + m.choiceGap + choicesHeight(arrangement, choiceLines, m)
}

/** Questions of the given heights stacked with a plain gap between them. */
export function stackHeight(heights: readonly number[], m: OtMetrics): number {
  if (heights.length === 0) return 0
  return heights.reduce((sum, h) => sum + h, 0) + (heights.length - 1) * m.itemGap
}

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

/**
 * Split question heights into at most `maxPages` pages, in order.
 *
 * Every split is tried (a pack is ten questions over at most four pages, so
 * there are only a few dozen). Among the splits that fit, the most even
 * question counts win, then the one whose fullest page is least full: a pack
 * reads as evenly spread pages, not three crammed pages and a last one holding
 * a single question. Fewer pages always beat more. `usable(i)` is page `i`'s
 * height for questions.
 */
export function paginate(
  heights: readonly number[],
  usable: (page: number) => number,
  m: OtMetrics,
  maxPages: number,
): number[][] | null {
  const n = heights.length
  if (n === 0) return null
  for (let pages = 1; pages <= Math.min(maxPages, n); pages++) {
    let best: { split: number[][]; spread: number; worst: number } | null = null
    const walk = (start: number, page: number, split: number[][]) => {
      if (page === pages - 1) {
        const last = Array.from({ length: n - start }, (_, i) => start + i)
        const all = [...split, last]
        let worst = 0
        for (let p = 0; p < all.length; p++) {
          const fill = stackHeight(all[p]!.map((i) => heights[i]!), m) / usable(p)
          if (fill > 1) return
          worst = Math.max(worst, fill)
        }
        // Even question counts first — a reader sees 2 / 4 / 4 as a lopsided
        // pack however full the pages are — then the fullest page least full.
        const counts = all.map((p) => p.length)
        const spread = Math.max(...counts) - Math.min(...counts)
        if (!best || spread < best.spread || (spread === best.spread && worst < best.worst - 1e-9)) {
          best = { split: all, spread, worst }
        }
        return
      }
      // Leave at least one question for every page still to come.
      for (let end = start + 1; end <= n - (pages - 1 - page); end++) {
        walk(end, page + 1, [...split, Array.from({ length: end - start }, (_, i) => start + i)])
      }
    }
    walk(0, 0, [])
    if (best) return (best as { split: number[][] }).split
  }
  return null
}

/** A question of everyday length, and choices of everyday length; they set the promise. */
const TYPICAL_QUESTION = 'What was the flat wooden frame of pigeonholes a carrier sorted letters into called?'
const TYPICAL_CHOICE = 'A folding sorting rack'
/** The longest entries the gates admit, built of ordinary words. */
const QUESTION_PROBE = 'Which of these was the usual name for the wooden board that held a tally of each '
  .repeat(2)
  .slice(0, MAX_QUESTION_CHARS)
  .trim()
const CHOICE_PROBE = 'The folding wooden sorting rack by the door '.repeat(2).slice(0, MAX_CHOICE_CHARS).trim()
/** Room at the foot of a quiz page for the "continued" line. */
const footerHeightFor = (m: OtMetrics) => m.footerGap + fabricTextHeight(1, m.footerFont)

function planAt(
  firstField: Box,
  laterHeight: number,
  count: number,
  size: number,
  font: string,
): OtQuizPlan | null {
  const g = quizGeometry(firstField.width, size)
  const m = g.metrics
  if (g.gridChoiceWidth <= m.font * 3) return null
  // Every question the gates admit must set within its line limits at this size.
  if (breakQuestion(QUESTION_PROBE, g, font).length > MAX_QUESTION_LINES) return null
  if (breakTo(CHOICE_PROBE, size, g.listChoiceWidth, textSpec(font)).length > MAX_CHOICE_LINES) return null

  const bottomGuard = Math.round(size * 0.6)
  const footerHeight = footerHeightFor(m)
  const typicalLines = breakQuestion(TYPICAL_QUESTION, g, font).length
  const typical = arrangeChoices(Array(OT_CHOICE_COUNT).fill(TYPICAL_CHOICE), g, font)
  const block = questionBlockHeight(
    typicalLines,
    typical.arrangement,
    typical.lines.map((l) => l.length),
    m,
  )
  const usable = (page: number) =>
    (page === 0 ? firstField.height : laterHeight) - bottomGuard - footerHeight
  // A question longer than a whole page can never print.
  const tallest = questionBlockHeight(MAX_QUESTION_LINES, 'list', Array(OT_CHOICE_COUNT).fill(MAX_CHOICE_LINES), m)
  if (tallest > usable(0)) return null

  const split = paginate(Array(count).fill(block), usable, m, MAX_QUIZ_PAGES)
  if (!split) return null
  return { ...g, count, pages: split.length, bottomGuard, footerHeight }
}

/**
 * The largest size at which a pack of typical questions fits its page limit.
 *
 * A full pack of ten is tried at every size before a pack of eight is tried at
 * any, so only the smallest trims ever print fewer questions.
 */
export function planOtQuiz(firstField: Box, laterHeight: number, font: string): OtQuizPlan | null {
  for (const count of [OT_TARGET_QUESTIONS, OT_MIN_QUESTIONS]) {
    for (let size = TEXT_FONT_MAX; size >= TEXT_FONT_MIN; size--) {
      const plan = planAt(firstField, laterHeight, count, size, font)
      if (plan) return plan
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * The answer page
 * ------------------------------------------------------------------ */

export interface OtKeyMetrics {
  font: number
  noteFont: number
  numberW: number
  ringR: number
  letterFont: number
  ringW: number
  /** Between an answer and its note. */
  noteGap: number
  /** Between two answers, before leftover height is shared out. */
  entryGap: number
}

export function otKeyMetrics(font: number): OtKeyMetrics {
  return {
    font,
    noteFont: Math.max(NOTE_FONT_MIN, Math.round(font * 0.87)),
    numberW: Math.round(font * 2.1),
    ringR: Math.round(font * 0.62),
    letterFont: Math.round(font * 0.78),
    ringW: Math.round(font * 1.24 + font * 0.5),
    noteGap: Math.round(font * 0.15),
    entryGap: Math.round(font * 0.45),
  }
}

export interface OtKeyEntryLines {
  answerLines: string[]
  /** Empty when the page has no room for notes. */
  noteLines: string[]
}

export interface OtKeyPlan {
  metrics: OtKeyMetrics
  blockWidth: number
  /** Answer text, right of the number and the ring. */
  answerWidth: number
  /** Note text, set under the answer, hanging from the ring. */
  noteWidth: number
  showNotes: boolean
  entries: OtKeyEntryLines[]
  bottomGuard: number
}

const keyTextHeight = (lines: number, size: number) => fabricTextHeight(lines, size, TEXT_LINE_HEIGHT)

/** Drop from an answer row's top to its first line, so the line sits centred in its ring. */
export const keyTextOffset = (m: OtKeyMetrics) =>
  Math.max(0, Math.round((2 * m.ringR - m.font * FABRIC_FONT_SIZE_MULT) / 2))

/** An answer row: its ring, or its answer of `lines` lines, whichever is taller. */
export function keyAnswerRowHeight(lines: number, m: OtKeyMetrics): number {
  return Math.max(2 * m.ringR, keyTextOffset(m) + keyTextHeight(lines, m.font))
}

export function keyEntryHeight(entry: OtKeyEntryLines, m: OtKeyMetrics): number {
  const answer = keyAnswerRowHeight(entry.answerLines.length, m)
  if (entry.noteLines.length === 0) return answer
  return answer + m.noteGap + keyTextHeight(entry.noteLines.length, m.noteFont)
}

export function keyStackHeight(entries: readonly OtKeyEntryLines[], m: OtKeyMetrics): number {
  if (entries.length === 0) return 0
  return entries.reduce((sum, e) => sum + keyEntryHeight(e, m), 0) + (entries.length - 1) * m.entryGap
}

function keyGeometry(width: number, size: number) {
  const metrics = otKeyMetrics(size)
  const blockWidth = Math.min(width, BLOCK_MAX_WIDTH)
  const answerWidth = blockWidth - metrics.numberW - metrics.ringW
  // Notes hang from the ring, not the answer: a wider measure keeps most to one or two lines.
  return { metrics, blockWidth, answerWidth, noteWidth: blockWidth - metrics.numberW }
}

/**
 * The answer page for these very questions, on one page.
 *
 * Largest size first, notes included; a size where any answer or note runs
 * past its line limit, or the list runs off the page, is passed over. When no
 * size holds the notes, the page keeps every answer and drops the notes — the
 * key must always be complete.
 */
export function planOtKey(
  field: Box,
  items: readonly { answer: string; explanation: string }[],
  font: string,
  startSize: number,
): OtKeyPlan | null {
  const top = Math.min(KEY_FONT_MAX, startSize)
  for (const showNotes of [true, false]) {
    for (let size = top; size >= KEY_FONT_MIN; size--) {
      const { metrics, blockWidth, answerWidth, noteWidth } = keyGeometry(field.width, size)
      const entries = items.map((item) => ({
        answerLines: breakTo(item.answer, size, answerWidth, textSpec(font)),
        noteLines: showNotes ? breakTo(item.explanation, metrics.noteFont, noteWidth, italicSpec(font)) : [],
      }))
      if (entries.some((e) => e.answerLines.length > MAX_KEY_ANSWER_LINES)) continue
      if (entries.some((e) => e.noteLines.length > MAX_NOTE_LINES)) continue
      const bottomGuard = Math.round(size * 0.6)
      if (keyStackHeight(entries, metrics) > field.height - bottomGuard) continue
      return { metrics, blockWidth, answerWidth, noteWidth, showNotes, entries, bottomGuard }
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Fields and the form's note
 * ------------------------------------------------------------------ */

/** The safe printable column every page of this game lays out inside. */
export function otContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function otBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = otContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/**
 * The pack these settings make, measured before a question exists.
 *
 * Only the first quiz page carries the instruction; later quiz pages and the
 * answer page carry the title alone.
 */
export function otWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
}): OtQuizPlan | null {
  const { page, config, instruction, font } = options
  const first = otBodyField(page, config, instruction)
  const later = otBodyField(page, config, '')
  return planOtQuiz(first, later.height, font)
}

/** What a pack prints on the trim currently in Settings. */
export function otPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { page } = options
  const tail = 'plus one answer page.'
  if (!page) return `About ${OT_TARGET_QUESTIONS} questions in large print, ${tail}`

  const plan = otWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for an Occupation Trivia Pack — choose a larger one in Settings.'
  }
  const pages = plan.pages === 1 ? '1 page' : `up to ${plan.pages} pages`
  return `${plan.count} questions at ${pxToPt(plan.metrics.font)} pt on ${pages}, ${tail}`
}
