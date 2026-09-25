import type { OccupationKey } from '@/types/studio-occupation-trivia.types'
import {
  OT_CHOICE_COUNT,
  OT_LETTERS,
  OT_MIN_QUESTIONS,
  OT_TARGET_QUESTIONS,
  normalizeOtQuestion,
  questionsRepeat,
} from './content'
import { blockHeightOf, quizUsable, type FittedOtPack, type OtFields } from './fit'
import {
  KEY_FONT_MIN,
  MAX_CHOICE_LINES,
  MAX_KEY_ANSWER_LINES,
  MAX_NOTE_LINES,
  MAX_QUESTION_LINES,
  MAX_QUIZ_PAGES,
  NOTE_FONT_MIN,
  TEXT_FONT_MIN,
  keyStackHeight,
  stackHeight,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a pack is considered export-ready.
 *
 * Fit is already structural — the plan never lays out a question that does not
 * fit — so this re-proves it, then checks what a reader only finds with the
 * book in hand: a question set differently from the one written, two questions
 * on one fact, a choice list without exactly one right answer, a key whose
 * letter or answer disagrees with its question, answer letters that pile onto
 * one position, too few questions, or type that fell below large print.
 *
 * Every one of those is a refund, so none of them may print.
 */
export function runOtKdpPreflight(options: {
  pack: FittedOtPack
  occupation: OccupationKey
  fields: OtFields
}): KdpPreflightResult {
  const { pack, occupation, fields } = options
  const { plan, questions, pages, key } = pack
  const errors: string[] = []
  const warnings: string[] = []

  if (questions.length === 0) return { ok: false, warnings, errors: ['No trivia questions were laid out.'] }
  if (questions.length < OT_MIN_QUESTIONS || questions.length > OT_TARGET_QUESTIONS) {
    errors.push('The pack holds the wrong number of questions.')
  }

  // Every question on exactly one page, in order, within the page limit.
  const order = pages.flat()
  if (order.length !== questions.length || order.some((index, i) => index !== i)) {
    errors.push('The quiz pages do not hold every question once, in order.')
  }
  if (pages.length === 0 || pages.length > Math.min(plan.pages, MAX_QUIZ_PAGES) || pages.some((p) => p.length === 0)) {
    errors.push('The pack runs over more pages than it was laid out for.')
  }
  const usable = quizUsable(plan, fields)
  pages.forEach((page, p) => {
    const height = stackHeight(page.map((i) => blockHeightOf(questions[i]!, plan)), plan.metrics)
    if (height > usable(p)) errors.push('A quiz page holds more than fits on it.')
  })

  // Right answers spread across the letters: dealt in A–D decks, so no letter
  // is right more than once per four questions or three times running.
  const counts = OT_LETTERS.map((letter) => questions.filter((q) => q.letter === letter).length)
  if (Math.max(...counts) - Math.min(...counts) > 1) errors.push('The right answers pile onto one letter.')
  questions.forEach((q, i) => {
    if (i >= 2 && q.slot === questions[i - 1]!.slot && q.slot === questions[i - 2]!.slot) {
      errors.push('The same letter is right three times running.')
    }
  })

  questions.forEach((q, i) => {
    // Re-gate the whole question as the service returned it.
    const again = normalizeOtQuestion({ ...q, verified: true }, occupation)
    if (
      !again ||
      again.question !== q.question ||
      again.answer !== q.answer ||
      again.explanation !== q.explanation ||
      again.distractors.join('|') !== q.distractors.join('|')
    ) {
      errors.push('A question is not suitable for a published activity book.')
    }
    if (questions.slice(0, i).some((earlier) => questionsRepeat(q, earlier))) {
      errors.push('Two questions in this pack test the same fact.')
    }
    if (q.index !== i) errors.push('A question is numbered out of order.')

    // Exactly one right choice, at the dealt letter, and every wrong one present once.
    if (q.choices.length !== OT_CHOICE_COUNT || q.choices.filter((c) => c === q.answer).length !== 1) {
      errors.push('A question does not have exactly one right answer among four choices.')
    }
    if (q.choices[q.slot] !== q.answer || OT_LETTERS[q.slot] !== q.letter) {
      errors.push('A question’s answer letter does not point at its answer.')
    }
    if ([...q.choices].sort().join('|') !== [q.answer, ...q.distractors].sort().join('|')) {
      errors.push('A question’s choices are not the ones written.')
    }

    if (q.questionLines.length === 0 || q.questionLines.length > MAX_QUESTION_LINES) {
      errors.push('A question needs more lines than the page allows.')
    }
    if (joined(q.questionLines) !== q.question) errors.push('A question was set differently from the one written.')
    if (q.choiceLines.length !== OT_CHOICE_COUNT) errors.push('A question is missing a choice.')
    q.choiceLines.forEach((lines, c) => {
      if (lines.length === 0 || lines.length > MAX_CHOICE_LINES) errors.push('A choice needs more lines than the page allows.')
      if (q.arrangement === 'grid' && lines.length !== 1) errors.push('A choice does not fit its column.')
      if (joined(lines) !== q.choices[c]) errors.push('A choice was set differently from the one written.')
    })

    // The key entry is this question's own answer and note, word for word.
    const entry = key.entries[i]
    if (!entry) {
      errors.push('The answer page is missing an answer.')
      return
    }
    if (joined(entry.answerLines) !== q.answer) errors.push('The answer page disagrees with a question.')
    if (entry.answerLines.length === 0 || entry.answerLines.length > MAX_KEY_ANSWER_LINES) {
      errors.push('An answer needs more lines than the answer page allows.')
    }
    if (key.showNotes) {
      if (joined(entry.noteLines) !== q.explanation) errors.push('A note on the answer page was set differently.')
      if (entry.noteLines.length === 0 || entry.noteLines.length > MAX_NOTE_LINES) {
        errors.push('A note needs more lines than the answer page allows.')
      }
    } else if (entry.noteLines.length > 0) {
      errors.push('The answer page mixes answers with and without notes.')
    }
  })

  if (key.entries.length !== questions.length) errors.push('The answer page lists a different number of answers.')
  if (keyStackHeight(key.entries, key.metrics) > fields.key.height - key.bottomGuard) {
    errors.push('The answers do not fit on one answer page.')
  }
  if (plan.metrics.font < TEXT_FONT_MIN) errors.push('Questions must stay large print.')
  if (key.metrics.font < KEY_FONT_MIN || (key.showNotes && key.metrics.noteFont < NOTE_FONT_MIN)) {
    errors.push('The answer page must stay readable.')
  }
  if (!key.showNotes) warnings.push('The answer page lists answers without notes on this page size.')

  return { ok: errors.length === 0, warnings, errors: [...new Set(errors)] }
}
