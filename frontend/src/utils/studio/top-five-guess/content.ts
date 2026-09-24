import type {
  TopFiveGuessItem,
  TopFiveGuessResponse,
} from '@/types/studio-top-five-guess.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Top Five Guess puzzle is, and every rule a set must pass to print.
 *
 * A set is one light retirement question and the five answers most people
 * would give, most likely first. The reader writes five guesses and scores the
 * points of every answer they matched.
 *
 * These gates mirror `backend/app/services/studio_top_five_guess_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, honest set reaches the
 * editor. A set is never repaired. Dropping a bad answer and promoting the
 * next one would print a ranking nobody wrote.
 */

export const TOP_FIVE_TEMPLATE_KEY = 'top-five-guess'
export const TOP_FIVE_DEFAULT_TITLE = 'Top Five Guess'

export const TOP_FIVE_ANSWER_COUNT = 5

/**
 * Points by rank, top answer first.
 *
 * Fixed rather than written by the model, so the ranking and the scores can
 * never disagree and every page of a book scores the same way. Small whole
 * numbers because a reader adds them up in the margin.
 */
export const TOP_FIVE_POINTS: readonly number[] = [5, 4, 3, 2, 1]
export const TOP_FIVE_MAX_SCORE = TOP_FIVE_POINTS.reduce((sum, points) => sum + points, 0)

/** Longest question the page plans for — two to three lines of large print. */
export const MAX_QUESTION_CHARS = 72
const MIN_QUESTION_CHARS = 24
const MAX_QUESTION_WORDS = 16
/** Longest answer the answer page plans for — one line beside its points. */
export const MAX_ANSWER_CHARS = 24
const MIN_ANSWER_CHARS = 3
const MAX_ANSWER_WORDS = 4

/** Two questions sharing more answers than this are one puzzle twice. */
const MAX_SHARED_ANSWERS = 2

/**
 * Keeps this game's rotating theme out of step with the other games'.
 * A book run hands a spread one seed; without a salt, facing pages would share
 * a theme.
 */
export const TOP_FIVE_THEME_SALT = 0x746f7035

export const TOP_FIVE_AI_EMPTY_MESSAGE =
  'Could not write clear Top Five questions for this theme. Try again, or pick a broader theme.'
export const TOP_FIVE_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Top Five Guess page. Pick a larger page in Settings.'
export const TOP_FIVE_BUILD_FAILED_MESSAGE =
  'Could not fit these questions on this page. Try again.'

/** One validated puzzle: a question and exactly five ranked answers. */
export interface TopFiveSet {
  question: string
  answers: readonly string[]
}

/**
 * The only instruction a reader needs — how to play and how to score.
 * Kept to two short lines so a 6 x 9 page does not lose a question to it.
 */
export function topFiveInstruction(): string {
  return `Write five guesses, then score each match: ${TOP_FIVE_POINTS[0]} points for the top answer, down to ${TOP_FIVE_POINTS[TOP_FIVE_POINTS.length - 1]} for the fifth.`
}

/*
 * Topics a light retirement puzzle stays away from, and anything that reads
 * as poll data. Mirrors `blockedTerms` in
 * backend/app/data/studio/top-five-guess/prompt.json.
 */
const BLOCKED_TERMS = [
  'survey', 'surveyed', 'poll', 'polled', 'percent', 'per cent', 'respondents',
  'we asked', 'people said', 'survey says', 'family feud', 'game show',
  'death', 'dead', 'die', 'dying', 'funeral', 'grave', 'widow', 'widower',
  'illness', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke', 'surgery',
  'hospital', 'nursing home', 'care home', 'medication', 'pills', 'diagnosis',
  'diet', 'weight loss', 'overweight', 'fat', 'wrinkles', 'hearing aid', 'dentures',
  'incontinence', 'bladder', 'senior moment', 'over the hill', 'old fogey',
  'divorce', 'ex-wife', 'ex-husband', 'affair',
  'election', 'political', 'democrat', 'republican', 'president',
  'religion', 'church', 'prayer', 'god',
  'drunk', 'hangover', 'beer', 'vodka', 'whiskey', 'cocktail',
  'gamble', 'gambling', 'casino', 'lottery', 'bet',
  'gun', 'weapon', 'war', 'sex', 'sexy',
  'stupid', 'idiot', 'hate', 'ugly', 'crazy', 'useless', 'boring old',
  'netflix', 'facebook', 'amazon', 'iphone', 'walmart',
] as const

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_TERMS.map(escapeRegExp).join('|')})\\b`, 'i')
/** Numbers that read as poll results or invented scores. */
const POLL_NUMBER_RE = /%|\b\d+\s*(people|points?|pts|votes?)\b/i
const LEADING_RANK_RE = /^\s*(#?\d+[.):-]?|[-*•])\s+/
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g

/** Mirrors `qualifierWords` in the backend prompt data. */
const QUALIFIERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'or', 'from', 'about',
  'too', 'so', 'very', 'really', 'many', 'much', 'more', 'lots', 'lot',
  'long', 'endless', 'constant', 'daily', 'every', 'all', 'those', 'that', 'this',
  'early', 'late', 'bad', 'boring', 'annoying', 'dull', 'tedious', 'awful',
  'being', 'having', 'getting', 'doing', 'going', 'making', 'taking',
  'good', 'great', 'nice', 'favourite', 'favorite', 'new', 'old', 'own',
])

export function isUnsafeTopFiveCopy(text: string): boolean {
  return isUnsafeCopy(text) || BLOCKED_RE.test(text) || POLL_NUMBER_RE.test(text)
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

/** Meaning-carrying words in reading order, qualifiers and plurals folded. */
function contentWords(text: string): string[] {
  const words = text.toLowerCase().replace(/['’]s\b/g, '').match(/[a-z0-9]+/g) ?? []
  return words.filter((word) => !QUALIFIERS.has(word)).map(stem)
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].every((token) => b.has(token))

/**
 * True when a reader would count the two answers as the same answer: one
 * inside the other (ALARMS / EARLY ALARM CLOCK), the same head noun (RUSH HOUR
 * TRAFFIC / ROAD TRAFFIC), or half their meaning shared.
 */
export function answersOverlap(first: string, second: string): boolean {
  const wordsA = contentWords(first)
  const wordsB = contentWords(second)
  if (wordsA.length === 0 || wordsB.length === 0) {
    return first.trim().toLowerCase() === second.trim().toLowerCase()
  }
  const a = new Set(wordsA)
  const b = new Set(wordsB)
  if (isSubset(a, b) || isSubset(b, a)) return true
  if (wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) return true
  return jaccard(a, b) >= 0.5
}

function questionsNearlyMatch(first: string, second: string): boolean {
  const a = new Set(contentWords(first))
  const b = new Set(contentWords(second))
  if (a.size === 0 || b.size === 0) return a.size === b.size
  return jaccard(a, b) >= 0.6
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const wordCount = (text: string) => text.split(' ').filter(Boolean).length

/** One sentence-case question ending in ? or ., or null. */
export function normalizeQuestion(raw: unknown): string | null {
  let text = clean(raw)
  if (!text) return null
  text = capitalise(text)
  if (!/[.?]$/.test(text)) text = `${text.replace(/[!,;:]+$/, '')}?`
  if (text.length < MIN_QUESTION_CHARS || text.length > MAX_QUESTION_CHARS) return null
  if (wordCount(text) > MAX_QUESTION_WORDS) return null
  return isUnsafeTopFiveCopy(text) ? null : text
}

/** A short sentence-case answer with no rank, points or stop, or null. */
export function normalizeAnswer(raw: unknown): string | null {
  const text = capitalise(clean(raw).replace(LEADING_RANK_RE, '').replace(/[.!?,;:]+$/, '').trim())
  if (text.length < MIN_ANSWER_CHARS || text.length > MAX_ANSWER_CHARS) return null
  if (wordCount(text) > MAX_ANSWER_WORDS) return null
  if (!/[A-Za-z]/.test(text)) return null
  return isUnsafeTopFiveCopy(text) ? null : text
}

/** An answer made only of the question's own words hands itself over. */
function answerEchoesQuestion(answer: string, question: string): boolean {
  const tokens = new Set(contentWords(answer))
  return tokens.size > 0 && isSubset(tokens, new Set(contentWords(question)))
}

/** One complete, honest set from raw service output — or null, never a repair. */
export function normalizeTopFiveSet(raw: unknown): TopFiveSet | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const question = normalizeQuestion(record.question)
  if (!question) return null
  if (!Array.isArray(record.answers) || record.answers.length < TOP_FIVE_ANSWER_COUNT) {
    return null
  }

  const answers: string[] = []
  for (const value of record.answers.slice(0, TOP_FIVE_ANSWER_COUNT)) {
    const answer = normalizeAnswer(value)
    if (!answer || answerEchoesQuestion(answer, question)) return null
    if (answers.some((kept) => answersOverlap(answer, kept))) return null
    answers.push(answer)
  }
  return { question, answers }
}

/**
 * Why a set may not print, or null when it may. The preflight's last word on
 * a set that has already been through `normalizeTopFiveSet`.
 */
export function topFiveSetProblem(set: TopFiveSet): string | null {
  if (set.answers.length !== TOP_FIVE_ANSWER_COUNT) {
    return 'A question does not have exactly five answers.'
  }
  const again = normalizeTopFiveSet(set)
  if (!again || again.question !== set.question) {
    return 'A question is not suitable for a published activity book.'
  }
  if (again.answers.some((answer, i) => answer !== set.answers[i])) {
    return 'Two answers to one question are too alike, or an answer is not suitable.'
  }
  return null
}

function sharedAnswerCount(first: TopFiveSet, second: TopFiveSet): number {
  return first.answers.filter((a) => second.answers.some((b) => answersOverlap(a, b))).length
}

/** True when two sets would read as the same puzzle printed twice. */
export function setsRepeatEachOther(first: TopFiveSet, second: TopFiveSet): boolean {
  return (
    questionsNearlyMatch(first.question, second.question) ||
    sharedAnswerCount(first, second) > MAX_SHARED_ANSWERS
  )
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds questions this seller's book already printed on the theme, so
 * a reply that ignores the prompt's avoid list still cannot repeat them.
 */
export function selectTopFiveSets(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): TopFiveSet[] {
  const { cap, avoid = [] } = options
  const out: TopFiveSet[] = []
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    const set = normalizeTopFiveSet(item)
    if (!set) continue
    if (avoid.some((label) => questionsNearlyMatch(set.question, label))) continue
    if (out.some((kept) => setsRepeatEachOther(set, kept))) continue
    out.push(set)
    if (out.length >= cap) break
  }
  return out
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseTopFivePayload(remote: unknown): readonly TopFiveGuessItem[] {
  if (!remote || typeof remote !== 'object') return []
  const items = (remote as Partial<TopFiveGuessResponse>).items
  return Array.isArray(items) ? items : []
}
