/**
 * Turn one model-written trivia item into the exact strings the page prints.
 *
 * The backend validates facts; this module owns *typography of the sentence* —
 * the part that has to be right even when the model formats its blank oddly.
 * The motivating bug: a model writes `"... was released in 19___."` with answer
 * `"1961"`, and naive substitution prints `"in 191961"`. Absorbing the stranded
 * `19` into the blank is the only way to get both a sensible prompt and a
 * sensible solution out of the same item.
 */

import type { TriviaItem } from '@/types/studio-decade-trivia.types'

/** Two or more underscores is how every model marks a blank. */
const BLANK_RUN = /_{2,}/
const BLANK_RUN_GLOBAL = /_{2,}/g

/** Printed blank length, in underscores — wide enough to write in, never a full line. */
const BLANK_MIN = 10
const BLANK_MAX = 18

export const SHORT_ANSWER_MAX_WORDS = 4
const GLUED_BEFORE = /[\w'’-]+$/
const GLUED_AFTER = /^[\w'’-]+/

/**
 * Collapse whitespace and strip markdown bold a model may leak into prose.
 * Underscores are deliberately left alone — they are how a blank is marked, and
 * treating them as emphasis turns `19___` into `19_`.
 */
export function cleanSentence(raw: string): string {
  return String(raw ?? '')
    .replace(/\*\*|\r/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const WRAPPING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g
const TRAILING_PUNCTUATION = /[.,;:]+$/

/** Normalize an answer for display: no trailing punctuation, no wrapping quotes. */
export function cleanAnswer(raw: string): string {
  let value = cleanSentence(raw)
  // `"The Supremes".` needs both strippers, and in either order.
  for (let pass = 0; pass < 2; pass++) {
    value = value.replace(TRAILING_PUNCTUATION, '').replace(WRAPPING_QUOTES, '').trim()
  }
  return value
}

function blankOfWidth(answer: string): string {
  const width = Math.min(BLANK_MAX, Math.max(BLANK_MIN, answer.length + 3))
  return '_'.repeat(width)
}

/**
 * Split a question that contains a blank into the run before it and after it,
 * absorbing any character run that is glued to the blank *and* is a prefix or
 * suffix of the answer.
 *
 * `"released in 19___."` + `"1961"` -> before `"released in "`, after `"."`,
 * so the solution reads `"released in 1961."` instead of `"in 191961."`.
 */
function splitAroundBlank(
  question: string,
  answer: string,
): { before: string; after: string } | null {
  const match = BLANK_RUN.exec(question)
  if (!match) return null

  let before = question.slice(0, match.index)
  let after = question.slice(match.index + match[0].length)
  const lowerAnswer = answer.toLowerCase()

  // Stranded prefix: trailing word characters glued to the blank that the
  // answer already starts with (the `19` of `19___` for answer `1961`).
  const gluedBefore = GLUED_BEFORE.exec(before)?.[0] ?? ''
  if (gluedBefore && lowerAnswer.startsWith(gluedBefore.toLowerCase())) {
    before = before.slice(0, before.length - gluedBefore.length)
  }

  const gluedAfter = GLUED_AFTER.exec(after)?.[0] ?? ''
  if (gluedAfter && lowerAnswer.endsWith(gluedAfter.toLowerCase())) {
    after = after.slice(gluedAfter.length)
  }

  return { before: before.replace(/\s+$/, ''), after: after.replace(/^\s+/, '') }
}

export interface WriteInText {
  /** Printed on the puzzle page: sentence with an empty rule. */
  prompt: string
  /** Printed on the solution page: same sentence with the answer in place. */
  solution: string
}

/**
 * Build the puzzle/solution pair for an inline write-in item.
 * Every extra blank the model left behind is collapsed into the single one we
 * control, so the sentence can never end up with two rules or a doubled answer.
 */
export function writeInText(question: string, answer: string): WriteInText {
  const text = cleanSentence(question)
  const value = cleanAnswer(answer)
  const blank = blankOfWidth(value)

  const split = splitAroundBlank(text, value)
  if (!split) {
    // No marker at all — the sentence is a question, so the blank goes last.
    const stem = text.replace(/[?.\s]+$/, '')
    return { prompt: `${stem}: ${blank}`, solution: `${stem}: ${value}` }
  }

  // Drop any further blanks the model wrote; only the first one is answered.
  const before = split.before.replace(BLANK_RUN_GLOBAL, '').replace(/\s+/g, ' ')
  const after = split.after.replace(BLANK_RUN_GLOBAL, '').replace(/\s+/g, ' ')
  const join = (middle: string): string => {
    const head = before ? `${before} ` : ''
    const tail = after && !/^[.,;:!?]/.test(after) ? ` ${after}` : after
    return `${head}${middle}${tail}`.trim()
  }

  return { prompt: join(blank), solution: join(value) }
}

export function answerWordCount(raw: string): number {
  return cleanAnswer(raw).split(/\s+/).filter(Boolean).length
}

export function isShortAnswerLength(raw: string): boolean {
  const count = answerWordCount(raw)
  return count >= 1 && count <= SHORT_ANSWER_MAX_WORDS
}

/**
 * Fill-blank is printable when there is a blank, and any text glued to it is
 * a prefix/suffix of the answer (so it can be absorbed, never `19` + `1961`).
 */
export function isValidFillBlank(question: string, answer: string): boolean {
  const text = cleanSentence(question)
  const value = cleanAnswer(answer)
  if (!text || !value) return false
  const match = BLANK_RUN.exec(text)
  if (!match) return false

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  const lowerAnswer = value.toLowerCase()

  const gluedBefore = GLUED_BEFORE.exec(before)?.[0] ?? ''
  if (gluedBefore && !lowerAnswer.startsWith(gluedBefore.toLowerCase())) return false

  const gluedAfter = GLUED_AFTER.exec(after)?.[0] ?? ''
  if (gluedAfter && !lowerAnswer.endsWith(gluedAfter.toLowerCase())) return false

  return true
}

export function isMultipleChoice(item: TriviaItem): boolean {
  return item.format === 'multiple-choice' && (item.options?.length ?? 0) === 4
}

export function isFillBlank(item: TriviaItem): boolean {
  return item.format === 'fill-blank'
}

/**
 * Whether an item prints as a sentence with an inline blank rather than a
 * write-in rule underneath. Only fill-blank does this — short-answer always
 * keeps its question + handwriting line so mixed pages still show three
 * distinct styles (MC options, write-in rule, and sentence blank).
 */
export function usesInlineWriteIn(item: TriviaItem): boolean {
  return isFillBlank(item)
}

/** The prompt sentence as printed, with the item's number handled separately. */
export function promptTextFor(item: TriviaItem): WriteInText {
  if (usesInlineWriteIn(item)) {
    return writeInText(item.question, item.answer)
  }
  const question = cleanSentence(item.question)
  return { prompt: question, solution: cleanAnswer(item.answer) }
}
