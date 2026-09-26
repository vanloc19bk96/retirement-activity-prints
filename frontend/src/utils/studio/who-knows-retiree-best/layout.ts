import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import type { WhoKnowsBestAnswer } from '@/types/studio-who-knows-best.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { ptToPx, pxToPt } from '../weeks-of-firsts/layout'
import {
  WKB_QUESTIONS,
  wkbAnswersInstruction,
  wkbAnswersTitleFor,
  wkbPlayerInstruction,
  wkbTitleFor,
  type WkbNumbered,
} from './content'

/**
 * Everything a Who Knows the Retiree Best? page decides on the seller's
 * behalf.
 *
 * The activity prints one answer sheet per player — the same twelve questions
 * on every sheet, a "Player:" line at the top and a score line at the end —
 * then the retiree's own sheet for the real answers, closing with a
 * scoreboard when more than one person plays. Every sheet starts on a new
 * page, so sheets can be handed round.
 *
 * A question is one block: its number, the question in large print, then the
 * room its answer needs — a short line for a word, a name or a time; a full
 * line for a phrase; two lines for a saying or a story — and, on a player's
 * sheet, a box to tick when the answer matches. A block never splits across
 * pages.
 *
 * The type size comes from the trim alone: the largest size (18 pt down to
 * 15 pt) at which a typical question's first line reads on one line, 15 pt
 * with a line more of wrapping on the narrowest trims, and 14 pt only when
 * nothing else fits. Pages are never squeezed to save paper: the
 * sheet takes as many pages as its blocks need, the questions are spread
 * evenly over them, and spare height widens the gaps a little.
 */

export { ptToPx, pxToPt }

/** Large-print floor — nothing a player reads is smaller. */
export const QUESTION_FONT_MIN = ptToPx(14)
const QUESTION_FONT_COMFORT = ptToPx(15)
const QUESTION_FONT_MAX = ptToPx(18)
export const QUESTION_LINE_HEIGHT = 1.2
/** Past this a question stops being a quick guess and becomes a paragraph. */
export const MAX_QUESTION_LINES = 3

/** A writing line an older hand can use: wider than wide-ruled paper. */
export const ANSWER_PITCH_MIN = Math.round(DPI * 0.38)
/** Past this a block runs wider than an eye tracks comfortably. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.5)
/** Shortest measure a question may wrap into. */
export const QUESTION_TEXT_MIN = Math.round(DPI * 2.4)
/** Room for a word, a name or a time written by hand. */
export const SHORT_LINE_MIN = Math.round(DPI * 1.75)
/** A tick box a pen can land in. */
export const BOX_MIN = Math.round(DPI * 0.24)
/** Room to write a name. */
export const NAME_LINE_MIN = Math.round(DPI * 1.75)
const NAME_LINE_MAX = Math.round(DPI * 3.75)
/** Room to write a score. */
export const SCORE_LINE_MIN = Math.round(DPI * 0.7)
/** Room to write the winner's name after "Who knows Linda best?". */
export const WINNER_LINE_MIN = Math.round(DPI * 1.2)
/** How far spare height may widen the gap between blocks, as a share of it. */
const GAP_STRETCH = 0.8

/** A typical question's opening: at comfortable sizes it sets on one line. */
const LINE_PROBE = 'What would they order for lunch?'
/** The widest question number. */
const NUMBER_PROBE = `${WKB_QUESTIONS}.`

export const PLAYER_LABEL = 'Player:'
export const SCORE_LABEL = 'Score:'
export const SCORE_TAIL = `out of ${WKB_QUESTIONS}`
export const SCOREBOARD_TITLE = 'Scoreboard'
export const SCOREBOARD_SCORE = 'Score:'
export const winnerLabel = (who: string) => `Who knows ${who} best?`
export const WINNER_SHORT = 'Top scorer:'

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const plainSpec = (font: string): FontSpec => ({ fontFamily: font })

export interface WkbMetrics {
  font: number
  headFont: number
  /** One answer line and the air above it. */
  pitch: number
  /** Between blocks, before any stretch. */
  gap: number
  /** Between a question number and its question. */
  numGap: number
  box: number
  /** Between an answer line and its tick box. */
  boxGap: number
  /** A labelled writing row: "Player:", "Score:", a scoreboard line. */
  rowH: number
  /** Between a label and the line written on after it. */
  labelGap: number
  /** Inside the scoreboard frame. */
  pad: number
  radius: number
  /** Below the last answer line, so a descender never touches the next block. */
  descent: number
}

export function wkbMetrics(font: number): WkbMetrics {
  return {
    font,
    headFont: Math.round(font * 1.15),
    pitch: Math.max(ANSWER_PITCH_MIN, Math.round(font * 1.9)),
    gap: Math.round(font * 1.1),
    numGap: Math.round(font * 0.4),
    box: Math.max(BOX_MIN, Math.round(font * 1.1)),
    boxGap: Math.round(font * 0.7),
    rowH: Math.max(ANSWER_PITCH_MIN, Math.round(font * 1.9)),
    labelGap: Math.round(font * 0.4),
    pad: Math.round(font * 0.75),
    radius: Math.round(font * 0.45),
    descent: Math.round(font * 0.25),
  }
}

/** Where Fabric sets a single line's baseline, as a share of its font size. */
export const BASELINE = 0.908
export const baselineToTop = (baseline: number, fontSize: number) => baseline - fontSize * BASELINE
/** The writing line of a row whose top is `top`, and the baseline its label sits on. */
export const rowLineY = (top: number, metrics: WkbMetrics) => top + metrics.rowH - 2
export const rowBaseline = (top: number, metrics: WkbMetrics) =>
  rowLineY(top, metrics) - Math.round(metrics.font * 0.12)

export interface WkbPlan {
  metrics: WkbMetrics
  /** Width of every block — what gets centred. */
  blockWidth: number
  /** The number column, gap included. */
  numW: number
  /** The question's measure, right of the number. */
  textWidth: number
  /** A full answer line on a player's sheet, left of the tick box. */
  boxLineRoom: number
  /** A full answer line on the retiree's sheet, which has no boxes. */
  lineRoom: number
  /** The short line a one-word answer gets. */
  shortLine: number
  nameLineW: number
  bottomGuard: number
}

function breakText(text: string, font: number, width: number, fontFamily: string): string[] {
  const spec = plainSpec(fontFamily)
  return wrapTextToWidth(text, font, wrapSafeWidth(width, spec), spec)
}

/** The question as it will be set: hard breaks Fabric has no reason to redo. */
export const breakQuestion = (text: string, plan: Pick<WkbPlan, 'metrics' | 'textWidth'>, font: string) =>
  breakText(text, plan.metrics.font, plan.textWidth, font)

function planAt(width: number, font: number, fontFamily: string, oneLineProbe: boolean): WkbPlan | null {
  const blockWidth = Math.min(width, BLOCK_MAX_WIDTH)
  const metrics = wkbMetrics(font)
  const bold = boldSpec(fontFamily)
  const numW = Math.ceil(hugTextBoxWidth(NUMBER_PROBE, font, Infinity, bold)) + metrics.numGap
  const textWidth = blockWidth - numW
  if (textWidth < QUESTION_TEXT_MIN) return null
  if (oneLineProbe && breakText(LINE_PROBE, font, textWidth, fontFamily).length > 1) return null
  const boxLineRoom = textWidth - metrics.box - metrics.boxGap
  if (boxLineRoom < SHORT_LINE_MIN) return null
  const nameRoom = blockWidth - hugTextBoxWidth(PLAYER_LABEL, font, Infinity, bold) - metrics.labelGap
  if (nameRoom < NAME_LINE_MIN) return null
  return {
    metrics,
    blockWidth,
    numW,
    textWidth,
    boxLineRoom,
    lineRoom: textWidth,
    shortLine: Math.min(boxLineRoom, Math.max(SHORT_LINE_MIN, Math.round(boxLineRoom * 0.5))),
    nameLineW: Math.min(NAME_LINE_MAX, nameRoom),
    bottomGuard: Math.round(font * 0.4),
  }
}

/**
 * Search order: 18 down to 15 pt while a typical question's opening still
 * reads on one line; then 15 pt with questions wrapping a line more on narrow
 * trims; the 14 pt floor only when nothing else fits the column.
 */
export function planWkb(width: number, fontFamily: string): WkbPlan | null {
  for (let font = QUESTION_FONT_MAX; font >= QUESTION_FONT_COMFORT; font--) {
    const plan = planAt(width, font, fontFamily, true)
    if (plan) return plan
  }
  for (let font = QUESTION_FONT_COMFORT; font >= QUESTION_FONT_MIN; font--) {
    const plan = planAt(width, font, fontFamily, false)
    if (plan) return plan
  }
  return null
}

export const answerLines = (size: WhoKnowsBestAnswer) => (size === 'sentence' ? 2 : 1)

export const questionTextHeight = (plan: Pick<WkbPlan, 'metrics'>, lines: number) =>
  fabricTextHeight(lines, plan.metrics.font, QUESTION_LINE_HEIGHT)

/** A whole block: the question, then its answer lines. */
export const blockHeight = (plan: Pick<WkbPlan, 'metrics'>, lines: number, size: WhoKnowsBestAnswer) =>
  Math.ceil(questionTextHeight(plan, lines) + answerLines(size) * plan.metrics.pitch + plan.metrics.descent)

/** A framed scoreboard: its title, a row per player, then the winner's row. */
export const scoreboardHeight = (plan: Pick<WkbPlan, 'metrics'>, players: number) => {
  const { metrics } = plan
  return Math.ceil(metrics.pad + fabricTextHeight(1, metrics.headFont) + (players + 1) * metrics.rowH + metrics.pad)
}

/** The safe printable column every page lays out inside. */
export function wkbContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** A sheet's page bodies: under its title and how-to, then under its title alone. */
export interface WkbSheetFields {
  first: Box
  laterHeight: number
}

function sheetFields(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  title: string,
  instruction: string,
): WkbSheetFields {
  const content = wkbContentBox(page)
  const withTitle = { ...config, title }
  const firstH = measureHeaderHeight(withTitle, instruction, content.width)
  const laterH = measureHeaderHeight(withTitle, '', content.width)
  return {
    first: { ...content, top: content.top + firstH, height: Math.max(1, content.height - firstH) },
    laterHeight: Math.max(1, content.height - laterH),
  }
}

/** Height a sheet's page gives its blocks. */
export const usableHeight = (plan: Pick<WkbPlan, 'bottomGuard'>, fields: WkbSheetFields) => (page: number) =>
  (page === 0 ? fields.first.height : fields.laterHeight) - plan.bottomGuard

export type WkbSheetKind = 'player' | 'answers'

/** One kind of sheet: its heading, how-to and page bodies. */
export interface WkbSheet {
  kind: WkbSheetKind
  title: string
  instruction: string
  fields: WkbSheetFields
}

export interface WkbLayout {
  plan: WkbPlan
  player: WkbSheet
  answers: WkbSheet
}

/**
 * The sheets these settings make, measured before a question exists: the
 * type size is fixed by the trim, so the form's note is what prints.
 */
export function wkbLayout(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  font: string
  name: string
  players: number
}): WkbLayout | null {
  const { page, config, font, name, players } = options
  const plan = planWkb(wkbContentBox(page).width, font)
  if (!plan) return null
  const show = config.showInstructions !== false
  const title = wkbTitleFor(config.title, name)
  const answersTitle = wkbAnswersTitleFor(title, name)
  const playerInstruction = show ? wkbPlayerInstruction(name) : ''
  const answersInstruction = show ? wkbAnswersInstruction(name, players) : ''
  return {
    plan,
    player: {
      kind: 'player',
      title,
      instruction: playerInstruction,
      fields: sheetFields(page, config, title, playerInstruction),
    },
    answers: {
      kind: 'answers',
      title: answersTitle,
      instruction: answersInstruction,
      fields: sheetFields(page, config, answersTitle, answersInstruction),
    },
  }
}

/** One question, broken to its block's measure and measured. */
export interface FittedWkbQuestion extends WkbNumbered {
  lines: string[]
  height: number
}

export const fitWkbQuestions = (
  questions: readonly WkbNumbered[],
  plan: WkbPlan,
  font: string,
): FittedWkbQuestion[] =>
  questions.map((q) => {
    const lines = breakQuestion(q.question, plan, font)
    return { ...q, lines, height: blockHeight(plan, lines.length, q.answer) }
  })

/** Everything a page prints below its heading, with tops measured from the page body's top. */
export type WkbBlock =
  | { kind: 'name'; top: number; height: number }
  | { kind: 'question'; top: number; height: number; question: FittedWkbQuestion }
  | { kind: 'score'; top: number; height: number }
  | { kind: 'scoreboard'; top: number; height: number; players: number }

export interface WkbPage {
  blocks: WkbBlock[]
}

/** A block before pagination has given it a place. */
type Unplaced<T> = T extends unknown ? Omit<T, 'top'> : never

/**
 * Lay one sheet's twelve questions over as many pages as they need.
 *
 * A player's sheet opens with its "Player:" line and closes with the score
 * line, kept on the same page as question 12. The retiree's sheet closes with
 * the scoreboard: after the last question when that saves a page, otherwise
 * on a page of its own. Questions are spread as evenly as the pages allow —
 * each page takes its fair share of what is left, the first (which also
 * carries the how-to) often a little less — and every page of the sheet
 * shares one gap between blocks, widened a little where every page has room.
 * Returns null when a page cannot hold its blocks.
 */
export function paginateWkbSheet(
  questions: readonly FittedWkbQuestion[],
  plan: WkbPlan,
  usable: (page: number) => number,
  options: { kind: WkbSheetKind; players: number },
): WkbPage[] | null {
  const { metrics } = plan
  if (questions.length === 0) return null
  if (options.kind === 'player') {
    return layOut(questions, plan, usable, { lead: metrics.rowH, tail: { kind: 'score', height: metrics.rowH } })
  }
  if (options.players <= 1) return layOut(questions, plan, usable, { lead: 0, tail: null })

  const board = scoreboardHeight(plan, options.players)
  const tucked = layOut(questions, plan, usable, {
    lead: 0,
    tail: { kind: 'scoreboard', height: board, players: options.players },
  })
  const apart = layOut(questions, plan, usable, { lead: 0, tail: null })
  if (tucked && (!apart || tucked.length <= apart.length)) return tucked
  if (!apart || board > usable(apart.length)) return null
  return [...apart, { blocks: [{ kind: 'scoreboard', top: 0, height: board, players: options.players }] }]
}

/** What closes a sheet: the score line or the scoreboard. */
type Tail = Unplaced<Extract<WkbBlock, { kind: 'score' | 'scoreboard' }>>

function layOut(
  questions: readonly FittedWkbQuestion[],
  plan: WkbPlan,
  usable: (page: number) => number,
  options: { lead: number; tail: Tail | null },
): WkbPage[] | null {
  const { metrics } = plan
  const { lead, tail } = options
  const n = questions.length

  /** Heights stacked on page `page` for questions [from, to), and how many gaps between them. */
  const measure = (page: number, from: number, to: number) => {
    const heights = questions.slice(from, to).map((q) => q.height)
    if (page === 0 && lead) heights.unshift(lead)
    if (to === n && tail) heights.push(tail.height)
    return { total: heights.reduce((sum, h) => sum + h, 0), gaps: Math.max(0, heights.length - 1) }
  }
  const fits = (page: number, from: number, to: number) => {
    const { total, gaps } = measure(page, from, to)
    return total + gaps * metrics.gap <= usable(page)
  }
  /** Page by page, each taking at most `share(page, left)` of the questions left. */
  const split = (share: (page: number, left: number) => number): number[] | null => {
    const counts: number[] = []
    for (let from = 0; from < n; ) {
      const page = counts.length
      const most = share(page, n - from)
      let take = 0
      while (take < most && from + take < n && fits(page, from, from + take + 1)) take++
      if (take === 0) return null
      counts.push(take)
      from += take
    }
    return counts
  }

  const greedy = split(() => n)
  if (!greedy) return null
  const pageCount = greedy.length
  const even = split((page, left) => Math.ceil(left / Math.max(1, pageCount - page)))
  const counts = even && even.length === pageCount ? even : greedy

  // One gap for the whole sheet: widened while every page still has room.
  let stretch = metrics.gap * GAP_STRETCH
  counts.reduce((from, count, page) => {
    const { total, gaps } = measure(page, from, from + count)
    if (gaps > 0) stretch = Math.min(stretch, (usable(page) - total) / gaps - metrics.gap)
    return from + count
  }, 0)
  const gap = metrics.gap + Math.max(0, Math.floor(stretch))

  const pages: WkbPage[] = []
  counts.reduce((from, count, page) => {
    const blocks: WkbBlock[] = []
    let y = 0
    const place = (block: Unplaced<WkbBlock>) => {
      if (blocks.length > 0) y += gap
      blocks.push({ ...block, top: y })
      y += block.height
    }
    if (page === 0 && lead) place({ kind: 'name', height: lead })
    for (const question of questions.slice(from, from + count)) {
      place({ kind: 'question', height: question.height, question })
    }
    if (from + count === n && tail) place(tail)
    pages.push({ blocks })
    return from + count
  }, 0)
  return pages
}

/** A typical set, for the form's note: short and long questions and a usual mix of answer sizes. */
const SAMPLE_QUESTIONS: readonly string[] = [
  'What time did they usually arrive?',
  'What would they most likely bring along to a shared lunch?',
]
const SAMPLE_ANSWERS: readonly WhoKnowsBestAnswer[] = [
  'phrase', 'word', 'phrase', 'sentence', 'word', 'phrase',
  'phrase', 'sentence', 'word', 'phrase', 'phrase', 'sentence',
]

/** What these settings print on the trim currently in Settings. */
export function wkbPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  font: string
  name: string
  players: number
}): string {
  const { page, players } = options
  const answers = players > 1 ? 'the real answers and scoreboard' : 'the real answers'
  if (!page) {
    return `Each player gets an answer sheet with the same ${WKB_QUESTIONS} questions; ${answers} follow for the retiree.`
  }
  const layout = wkbLayout({ ...options, page })
  if (!layout) return 'This page size is too small for Who Knows the Retiree Best? — choose a larger one in Settings.'
  const { plan } = layout
  const sample: FittedWkbQuestion[] = SAMPLE_ANSWERS.map((answer, i) => {
    const question = SAMPLE_QUESTIONS[i % SAMPLE_QUESTIONS.length]!
    const lines = breakQuestion(question, plan, options.font)
    return {
      question,
      topic: '',
      shape: '',
      concept: '',
      answer,
      number: i + 1,
      lines,
      height: blockHeight(plan, lines.length, answer),
    }
  })
  const sheet = (spec: typeof layout.player) =>
    paginateWkbSheet(sample, plan, usableHeight(plan, spec.fields), { kind: spec.kind, players })?.length
  const perPlayer = sheet(layout.player)
  const forRetiree = sheet(layout.answers)
  if (!perPlayer || !forRetiree) {
    return 'This page size is too small for Who Knows the Retiree Best? — choose a larger one in Settings.'
  }
  const pages = (count: number) => (count === 1 ? '1 page' : `${count} pages`)
  const who = players === 1 ? 'One player gets' : `Each of ${players} players gets`
  const total = players * perPlayer + forRetiree
  return `${who} a ${perPlayer}-page answer sheet, then ${answers} take ${pages(forRetiree)} — about ${total} pages in ${pxToPt(plan.metrics.font)} pt large print.`
}
