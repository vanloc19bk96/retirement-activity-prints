import { WKB_QUESTIONS, wkbSetProblem } from './content'
import {
  ANSWER_PITCH_MIN,
  BOX_MIN,
  MAX_QUESTION_LINES,
  NAME_LINE_MIN,
  QUESTION_FONT_MIN,
  QUESTION_TEXT_MIN,
  SHORT_LINE_MIN,
  blockHeight,
  type FittedWkbQuestion,
  type WkbPage,
  type WkbPlan,
  type WkbSheetKind,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/** One sheet as paginated: whose it is, its pages, and the height each page gives its blocks. */
export interface WkbPreflightSheet {
  kind: WkbSheetKind
  pages: readonly WkbPage[]
  usable: (page: number) => number
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a set is considered export-ready.
 *
 * Fit is already structural — pagination never places a block past its page
 * — so this re-proves it against the real questions, then checks what a
 * player would notice: a sheet missing a question, numbering it differently
 * or out of order, a question split from its answer lines or set differently
 * from the one written, a set that repeats itself or leans on one kind of
 * question, a sheet without its name or score line, a retiree's sheet without
 * its scoreboard, or type and lines smaller than a large-print book promises.
 */
export function runWkbKdpPreflight(options: {
  questions: readonly FittedWkbQuestion[]
  sheets: readonly WkbPreflightSheet[]
  plan: WkbPlan
  players: number
}): KdpPreflightResult {
  const { questions, sheets, plan, players } = options
  const errors: string[] = []
  const warnings: string[] = []
  const { metrics } = plan

  const content = wkbSetProblem(questions)
  if (content) errors.push(content)

  for (const q of questions) {
    if (q.lines.length > MAX_QUESTION_LINES) errors.push(`Question ${q.number} runs too long to read at a glance.`)
    if (joined(q.lines) !== q.question) errors.push(`Question ${q.number} was set differently from the one written.`)
    if (q.height !== blockHeight(plan, q.lines.length, q.answer)) errors.push(`Question ${q.number} is not drawn whole.`)
  }

  const playerSheets = sheets.filter((s) => s.kind === 'player')
  const answerSheets = sheets.filter((s) => s.kind === 'answers')
  if (playerSheets.length !== players) errors.push(`The set prints ${playerSheets.length} answer sheets instead of ${players}.`)
  if (answerSheets.length !== 1) errors.push('The set needs one sheet for the real answers.')

  sheets.forEach((sheet, s) => {
    const name = sheet.kind === 'player' ? `Answer sheet ${s + 1}` : 'The real answers sheet'
    const blocks = sheet.pages.flatMap((page) => page.blocks)
    const printed = blocks.flatMap((b) => (b.kind === 'question' ? [b.question] : []))
    if (printed.length !== WKB_QUESTIONS || printed.some((q, i) => q !== questions[i])) {
      errors.push(`${name} does not print questions 1 to ${WKB_QUESTIONS} in order.`)
    }

    if (sheet.kind === 'player') {
      if (sheet.pages[0]?.blocks[0]?.kind !== 'name') errors.push(`${name} needs its player line.`)
      const last = sheet.pages.at(-1)?.blocks ?? []
      const lastBlock = last.at(-1)
      const lastQuestion = last.filter((b) => b.kind === 'question').at(-1)
      if (lastBlock?.kind !== 'score' || lastQuestion?.kind !== 'question' || lastQuestion.question.number !== WKB_QUESTIONS) {
        errors.push(`${name} needs its score line after the last question.`)
      }
    } else {
      const boards = blocks.filter((b) => b.kind === 'scoreboard').length
      if (boards !== (players > 1 ? 1 : 0)) errors.push('The real answers sheet needs a scoreboard for every player.')
      if (blocks.some((b) => b.kind === 'name' || b.kind === 'score')) errors.push(`${name} carries a player's lines.`)
    }

    sheet.pages.forEach((page, index) => {
      if (page.blocks.length === 0) errors.push(`${name} has an empty page.`)
      const sorted = [...page.blocks].sort((a, b) => a.top - b.top)
      sorted.forEach((block, b) => {
        if (block.top < 0) errors.push(`${name} starts above its printable area.`)
        if (b > 0) {
          const prev = sorted[b - 1]!
          if (block.top < prev.top + prev.height) errors.push(`${name} has overlapping questions.`)
        }
      })
      const bottom = Math.max(...page.blocks.map((b) => b.top + b.height))
      if (bottom > sheet.usable(index)) errors.push(`${name} runs past the printable area.`)
    })
  })

  if (metrics.font < QUESTION_FONT_MIN) errors.push('Questions must stay large print.')
  if (metrics.pitch < ANSWER_PITCH_MIN) errors.push('Answer lines must stay far enough apart to write on.')
  if (metrics.box < BOX_MIN) errors.push('Tick boxes must stay large enough to mark.')
  if (plan.shortLine < SHORT_LINE_MIN) errors.push('Short answer lines must stay long enough to write on.')
  if (plan.textWidth < QUESTION_TEXT_MIN) errors.push('Questions must stay wide enough to read.')
  if (plan.nameLineW < NAME_LINE_MIN) errors.push('The player line must stay long enough to write a name.')

  return { ok: errors.length === 0, warnings, errors }
}
