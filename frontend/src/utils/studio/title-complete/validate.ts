/** Shared blank token — must match backend validation. */
export const BLANK_TOKEN = '______'

const MAX_TITLE_WORDS = 8

const LYRIC_SIGNALS =
  /(\.\.\.|…|next line|lyrics?|chorus|verse|"\s*\w+.*\w+\s*")/i

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'to',
  'and',
  'or',
  'for',
  'it',
  'is',
  'at',
  'by',
  'as',
  'with',
  'from',
])

export function answerParts(answer: string): string[] {
  return answer
    .split(/\s*\/\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function blankOut(fullTitle: string, answer: string): string | null {
  let display = fullTitle
  for (const part of answerParts(answer)) {
    if (!display.includes(part)) return null
    display = display.replace(part, BLANK_TOKEN)
  }
  if (!display.includes(BLANK_TOKEN)) return null
  // Blank-only lines give the reader nothing to complete.
  if (!hasVisibleCue(display)) return null
  return display
}

/** True when the prompt still shows at least one letter/digit besides blanks. */
export function hasVisibleCue(displayTitle: string): boolean {
  const withoutBlanks = displayTitle.split(BLANK_TOKEN).join('')
  return /[A-Za-z0-9]/.test(withoutBlanks)
}

/** Legal invariant: printed string + answers restores the stored title exactly. */
export function restore(displayTitle: string, answer: string): string | null {
  let result = displayTitle
  for (const part of answerParts(answer)) {
    if (!result.includes(BLANK_TOKEN)) return null
    result = result.replace(BLANK_TOKEN, part)
  }
  if (result.includes(BLANK_TOKEN)) return null
  return result
}

export function isLyricShaped(fullTitle: string): boolean {
  return LYRIC_SIGNALS.test(fullTitle)
}

export function exceedsWordCap(fullTitle: string): boolean {
  return fullTitle.trim().split(/\s+/).filter(Boolean).length > MAX_TITLE_WORDS
}

export function hasStopwordAnswer(answer: string): boolean {
  return answerParts(answer).some((p) => STOPWORDS.has(p.toLowerCase()))
}

export function letterHintCount(answer: string): number {
  return answerParts(answer).reduce((sum, part) => sum + part.replace(/\s/g, '').length, 0)
}
