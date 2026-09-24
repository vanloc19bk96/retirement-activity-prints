import type {
  RetireeQuizQuestionItem,
  RetireeQuizResponse,
  RetireeQuizResultsItem,
  RetireeStyle,
} from '@/types/studio-retiree-quiz.types'
import { createRng } from '../studio-rng'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one What Kind of Retiree Are You? quiz is, and every rule it must pass to print.
 *
 * A question is one relatable retirement moment and four answers, one for each
 * retirement style. The page deals the answers to letters A-D; the reader
 * circles one per question, then circles the same letter in that question's
 * row of the scoring grid, where each column is one style. The column with
 * the most circles is their result.
 *
 * Fairness is structural: every question carries exactly one answer per
 * style, each worth one circle, so every style has the same number of chances
 * whatever the questions say. The letters are dealt so that no letter leans
 * towards one style either.
 *
 * Whether each answer really reads as its style is decided by the content
 * service: every question it returns has passed a blind check that sorted the
 * answers without being told which was which, and carries `verified: true`. A
 * question without that mark never prints.
 *
 * The remaining gates mirror `backend/app/services/studio_retiree_quiz_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, well-formed question
 * reaches the editor. A question is never repaired.
 */

export const RQ_TEMPLATE_KEY = 'what-kind-of-retiree'
export const RQ_DEFAULT_TITLE = 'What Kind of Retiree Are You?'

/** Grid column order, left to right. */
export const RQ_STYLES: readonly RetireeStyle[] = ['explorer', 'tinkerer', 'social', 'napper']
/** Answer labels, top to bottom. The reader circles one. */
export const RQ_LETTERS = ['A', 'B', 'C', 'D'] as const

export const RQ_STYLE_NAMES: Readonly<Record<RetireeStyle, string>> = {
  explorer: 'The Explorer',
  tinkerer: 'The Tinkerer',
  social: 'The Social Butterfly',
  napper: 'The Professional Napper',
}

/** The same names without the article, for the grid's column heads. */
export const RQ_STYLE_SHORT_NAMES: Readonly<Record<RetireeStyle, string>> = {
  explorer: 'Explorer',
  tinkerer: 'Tinkerer',
  social: 'Social Butterfly',
  napper: 'Professional Napper',
}

/** Fewer and the result is a coin toss; more and the quiz outstays its welcome. */
export const MIN_QUESTIONS = 8
export const MAX_QUESTIONS = 10

/** Longest question the page plans for — up to three lines of large print. */
export const MAX_QUESTION_CHARS = 84
const MIN_QUESTION_CHARS = 20
const MAX_QUESTION_WORDS = 16
/** Longest answer the page plans for — short enough to circle at a glance. */
export const MAX_ANSWER_CHARS = 36
const MIN_ANSWER_CHARS = 8
const MIN_ANSWER_WORDS = 2
const MAX_ANSWER_WORDS = 7
/** Longest result write-up the results page plans for. */
export const MAX_DESCRIPTION_CHARS = 150
const MIN_DESCRIPTION_CHARS = 60
const MAX_DESCRIPTION_WORDS = 30
/** One answer far longer than the rest reads as the "real" answer. */
const MAX_ANSWER_LENGTH_RATIO = 2.5
/** Times one word may carry the same style's answers across a quiz. */
const MAX_SHARED_WORD_USES = 2

export const RQ_AI_EMPTY_MESSAGE =
  'Could not write a fair What Kind of Retiree quiz for this theme. Try again, or pick a broader theme.'
export const RQ_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a What Kind of Retiree quiz. Pick a larger page in Settings.'
export const RQ_BUILD_FAILED_MESSAGE = 'Could not fit this quiz on the page. Try again.'

/** The how-to line under the title on the first quiz page. */
export function rqInstruction(): string {
  return 'Circle the letter of the answer most like you.'
}

/** Printed at the foot of every quiz page but the last. */
export const RQ_CONTINUE_LINE = 'Continued on the next page'
/** Printed at the foot of the last quiz page. */
export const RQ_FINISHED_LINE = 'All done? Turn the page to score it!'

export const RQ_SCORING_HEADING = 'Score Your Quiz'
export const RQ_RESULTS_HEADING = 'Your Retirement Style'

/** The three scoring steps; the last one says where the write-ups are. */
export function rqScoringSteps(resultsBelow: boolean): string[] {
  return [
    'In each row, circle the letter you chose for that question.',
    'Count the circles in each column. Write the total in its box.',
    resultsBelow
      ? 'The column with the highest total is your retirement style. Find its symbol below!'
      : 'The column with the highest total is your retirement style. Find its symbol on the next page!',
  ]
}

/** A tie always resolves: every tied style is a result. */
export const RQ_TIE_LINE = 'A tie? Lucky you, you are a blend! Read every style that tied for the top.'
/** The quiz says what it is, so nobody reads a result as a verdict. */
export const RQ_JUST_FOR_FUN_LINE = 'Just for fun: every retirement style is a winning one.'

/* ------------------------------------------------------------------ *
 * Word lists. Mirror `backend/app/data/studio/what-kind-of-retiree/prompt.json`
 * (`content-lists.test.ts` holds them to it).
 * ------------------------------------------------------------------ */

export const RQ_BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dying', 'died', 'funeral', 'grave', 'cemetery', 'widow', 'widower', 'will and testament',
  'illness', 'ill', 'sick', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke', 'surgery', 'operation', 'hospital',
  'doctor', 'nurse', 'nursing home', 'care home', 'retirement home', 'medication', 'medicine', 'pills', 'diagnosis',
  'arthritis', 'pain', 'aches', 'hip replacement', 'knee replacement', 'wheelchair', 'walking stick', 'disabled',
  'disability', 'blind', 'deaf', 'hearing aid', 'dentures', 'incontinence', 'bladder', 'diet', 'weight loss',
  'overweight', 'fat', 'wrinkles', 'grey hair', 'gray hair', 'memory loss', 'forget', 'forgetful', 'forgetting',
  'senior moment', 'over the hill', 'old fogey', 'elderly', 'geriatric', 'senior citizen', 'old age', 'old man',
  'old woman', 'old lady', 'grumpy', 'lonely', 'loneliness', 'alone forever', 'nobody visits', 'bored to death',
  'debt', 'broke', 'bankrupt', 'poverty', 'poor', 'bills', 'pay off', 'paying off', 'loan', 'taxes', "can't afford",
  'cannot afford', 'savings', 'divorce', 'ex-wife', 'ex-husband', 'affair', 'election', 'political', 'politics',
  'democrat', 'republican', 'president', 'government', 'religion', 'church', 'prayer', 'god', 'heaven', 'hell',
  'drunk', 'hangover', 'beer', 'wine', 'vodka', 'whiskey', 'cocktail', 'booze', 'alcohol', 'gamble', 'gambling',
  'casino', 'lottery', 'bet', 'betting', 'gun', 'weapon', 'war', 'fight', 'kill', 'violence', 'sex', 'sexy', 'naked',
  'nude', 'stupid', 'idiot', 'hate', 'ugly', 'crazy', 'useless', 'boring old', 'damn', 'marathon', 'skydive',
  'skydiving', 'bungee',
] as const

export const RQ_ASSUMPTION_TERMS = [
  'grandchild', 'grandchildren', 'grandkid', 'grandkids', 'grandson', 'grandsons', 'granddaughter', 'granddaughters',
  'grandbaby', 'husband', 'wife', 'spouse', 'hubby', 'better half', 'your partner', 'pension', 'mortgage', 'yacht',
  'mansion', 'private jet', 'first class', 'first-class', 'five-star', 'luxury', 'second home', 'holiday home',
  'vacation home', 'the office', 'your office', 'office job', 'cubicle', 'boss', 'your career', 'your employer',
] as const

export const RQ_PUT_DOWN_TERMS = [
  'lazy', 'laziness', 'couch potato', 'slob', 'sloth', 'idle', 'boring', 'bored', 'do nothing', 'doing nothing',
  'waste', 'wasting', 'pointless', 'loser', 'slacker', 'good-for-nothing',
] as const

export const RQ_REVEAL_TERMS = [
  'explorer', 'explorers', 'explore', 'exploring', 'tinkerer', 'tinkerers', 'tinker', 'tinkering', 'social butterfly',
  'butterfly', 'butterflies', 'social', 'socialize', 'socialise', 'socializing', 'socialising', 'napper', 'nappers',
  'personality', 'quiz', 'score', 'scoring',
] as const

export const RQ_DESCRIPTION_BANNED_TERMS = [
  'explorer', 'tinkerer', 'social butterfly', 'butterfly', 'napper', 'personality type', 'psychology',
  'psychological', 'psychologist', 'diagnose', 'diagnosis', 'scientific', 'science says', 'clinical', 'research shows',
  'studies show', 'proven',
] as const

export const RQ_BRAND_TERMS = [
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'amazon', 'iphone',
  'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola', 'lego', 'barbie',
  'harry potter', 'star wars', 'star trek', 'taylor swift', 'elvis', 'beatles', 'rolex', 'ferrari', 'harley',
  'nintendo', 'playstation', 'xbox', 'costco', 'ikea', 'uber', 'airbnb', 'kindle', 'zoom', 'whatsapp', 'myers-briggs',
  'enneagram', 'buzzfeed',
] as const

export const RQ_QUALIFIER_WORDS = [
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'you', 'yourself', 'i', 'we', 'of', 'to', 'for',
  'at', 'in', 'on', 'with', 'and', 'or', 'from', 'about', 'by', 'into', 'onto', 'up', 'out', 'too', 'so', 'very',
  'really', 'whole', 'entire', 'full', 'just', 'only', 'every', 'each', 'all', 'that', 'this', 'those', 'these',
  'some', 'any', 'one', 'own', 'new', 'favourite', 'favorite', 'whenever', 'always', 'again', 'ever', 'what', 'which',
  'how', 'would', 'do', 'does', 'is', 'are', 'be', 'it', 'most', 'best', 'like', 'sound', 'sounds', 'pick', 'choose',
  'day', 'time', 'go', 'get', 'have', 'make', 'take', 'spend', 'find', 'try', 'somewhere', 'something', 'someone',
  'good', 'great', 'little', 'bit', 'lot', 'more', 'first', 'next', 'plan', 'idea', 'youve', 'youd', 'youre',
  'youll', 'ive', 'im', 'id', 'ill', 'cant', 'dont', 'wont', 'whats', 'lets', 'theres', 'thats',
] as const

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const UNSAFE_RE = wordPattern([...RQ_BLOCKED_TERMS, ...RQ_BRAND_TERMS, ...RQ_ASSUMPTION_TERMS, ...RQ_PUT_DOWN_TERMS])
const REVEAL_RE = wordPattern(RQ_REVEAL_TERMS)
const DESCRIPTION_BANNED_RE = wordPattern(RQ_DESCRIPTION_BANNED_TERMS)
const QUALIFIERS: ReadonlySet<string> = new Set(RQ_QUALIFIER_WORDS)

const NUMBER_RE = /^\s*(q(uestion)?\s*\d+\s*[.):-]?\s+|\(?\d+[.):]\s+|[-*•]\s+)/i
const ANSWER_LABEL_RE = /^\s*(\(?[a-d1-4]\s*[.):]\s+|[-*•]\s+|(explorer|tinkerer|social|napper)\s*[:\-–]\s*)/i
const QUESTION_ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().:;!?&]+$/
const ANSWER_ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–&()]+$/
const DESCRIPTION_ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().:;!&]+$/
const SENTENCE_END_RE = /[.!?]/g
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
/** The service's prompt example. A question on it is the model copying it. */
const EXAMPLE_QUESTION = 'Rain is drumming on the window. How do you spend the afternoon?'

export function isUnsafeRqCopy(text: string): boolean {
  return isUnsafeCopy(text) || UNSAFE_RE.test(text)
}

/* ------------------------------------------------------------------ *
 * Repeats
 * ------------------------------------------------------------------ */

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function rawTokens(text: string): string[] {
  const folded = text.toLowerCase().replace(/’/g, "'").replace(/'s /g, ' ').replace(/'/g, '')
  return folded.match(/[a-z0-9]+/g) ?? []
}

/** The words that carry a text's meaning, qualifiers dropped and endings folded. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of rawTokens(text)) {
    if (!QUALIFIERS.has(raw)) out.add(stem(raw))
  }
  return out
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
 * True when a reader would call the two texts the same thing said twice: half
 * their meaning shared, or one wholly inside the other once it carries three
 * words of substance.
 */
export function textsMatch(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return first.trim().toLowerCase() === second.trim().toLowerCase()
  if (jaccard(a, b) >= 0.5) return true
  return Math.min(a.size, b.size) >= 3 && (isSubset(a, b) || isSubset(b, a))
}

/** Compact label for avoid lists — content words only, inside the 60-character cap. */
export function compactRqLabel(text: string): string {
  let out = ''
  for (const word of rawTokens(text).filter((w) => !QUALIFIERS.has(w))) {
    const candidate = `${out} ${word}`.trim()
    if (candidate.length > 60) break
    out = candidate
  }
  return out || text.slice(0, 60)
}

/* ------------------------------------------------------------------ *
 * Gates
 * ------------------------------------------------------------------ */

/** One validated question, as the service wrote it. */
export interface RqQuestion {
  question: string
  answers: Readonly<Record<RetireeStyle, string>>
  topic: string
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

function mostlyLowercase(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = letters.filter((ch) => ch >= 'A' && ch <= 'Z').length
  return letters.length > 0 && upper <= letters.length * 0.4
}

const wordCount = (text: string) => text.split(' ').filter(Boolean).length
const sentenceEnds = (text: string) => (text.match(SENTENCE_END_RE) ?? []).length

/** One or two short sentences ending in a single question mark, or null. */
export function normalizeQuestion(raw: unknown): string | null {
  const text = clean(raw).replace(NUMBER_RE, '').replace(EDGE_QUOTES_RE, '').trim()
  if (!text || !text.endsWith('?') || text.split('?').length !== 2) return null
  if (!QUESTION_ALLOWED_RE.test(text) || !/^[A-Z]/.test(text)) return null
  if (sentenceEnds(text.slice(0, -1)) > 1 || !mostlyLowercase(text)) return null
  if (wordCount(text) > MAX_QUESTION_WORDS) return null
  if (text.length < MIN_QUESTION_CHARS || text.length > MAX_QUESTION_CHARS) return null
  if (isUnsafeRqCopy(text) || REVEAL_RE.test(text)) return null
  if (textsMatch(text, EXAMPLE_QUESTION)) return null
  return text
}

/** One short phrase, sentence case, no label or end mark, or null. */
export function normalizeAnswer(raw: unknown): string | null {
  let text = clean(raw).replace(ANSWER_LABEL_RE, '').trim()
  text = text.replace(/[\s.!;:]+$/, '').replace(EDGE_QUOTES_RE, '').trim()
  if (!text || !ANSWER_ALLOWED_RE.test(text) || !mostlyLowercase(text)) return null
  const words = wordCount(text)
  if (words < MIN_ANSWER_WORDS || words > MAX_ANSWER_WORDS) return null
  if (text.length < MIN_ANSWER_CHARS || text.length > MAX_ANSWER_CHARS) return null
  if (isUnsafeRqCopy(text) || REVEAL_RE.test(text)) return null
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** One to three warm sentences for a result, or null. */
export function normalizeDescription(raw: unknown): string | null {
  const text = clean(raw)
  if (!text || !DESCRIPTION_ALLOWED_RE.test(text) || !/^[A-Z]/.test(text)) return null
  if (!/[.!]$/.test(text)) return null
  if (sentenceEnds(text) > 3 || !mostlyLowercase(text)) return null
  if (wordCount(text) > MAX_DESCRIPTION_WORDS) return null
  if (text.length < MIN_DESCRIPTION_CHARS || text.length > MAX_DESCRIPTION_CHARS) return null
  if (isUnsafeRqCopy(text) || DESCRIPTION_BANNED_RE.test(text)) return null
  return text
}

/** Why four valid answers are not one fair question, or null. */
export function answersProblem(answers: readonly string[]): string | null {
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      if (textsMatch(answers[i]!, answers[j]!)) return 'answers too alike'
    }
  }
  const lengths = answers.map((a) => a.length)
  if (Math.max(...lengths) > Math.min(...lengths) * MAX_ANSWER_LENGTH_RATIO) return 'answers unbalanced'
  return null
}

/** One complete, style-checked question from raw service output — or null, never a repair. */
export function normalizeRqQuestion(raw: unknown): RqQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  // Only the service's blind check can say each answer reads as its style.
  if (record.verified !== true) return null
  const question = normalizeQuestion(record.question)
  if (!question) return null
  const answers = {} as Record<RetireeStyle, string>
  for (const style of RQ_STYLES) {
    const answer = normalizeAnswer(record[style])
    if (!answer) return null
    answers[style] = answer
  }
  if (answersProblem(RQ_STYLES.map((style) => answers[style]))) return null
  return { question, answers, topic: clean(record.topic).slice(0, 60) }
}

/** True when two questions would read as the same question asked twice. */
export function questionsRepeat(first: RqQuestion, second: RqQuestion): boolean {
  if (textsMatch(first.question, second.question)) return true
  if (first.topic && first.topic.toLowerCase() === second.topic.toLowerCase()) return true
  return RQ_STYLES.some((style) => textsMatch(first.answers[style], second.answers[style]))
}

type WordUsage = Record<RetireeStyle, Map<string, number>>

const emptyUsage = (): WordUsage => ({
  explorer: new Map(),
  tinkerer: new Map(),
  social: new Map(),
  napper: new Map(),
})

/**
 * True when adding this question leans on one word too often for a style.
 * Four napper answers about blankets, or four social answers "with friends",
 * read as one question asked four times.
 */
function overusesWords(question: RqQuestion, usage: WordUsage): boolean {
  return RQ_STYLES.some((style) =>
    [...contentTokens(question.answers[style])].some(
      (token) => (usage[style].get(token) ?? 0) >= MAX_SHARED_WORD_USES,
    ),
  )
}

function recordUsage(question: RqQuestion, usage: WordUsage): void {
  for (const style of RQ_STYLES) {
    for (const token of contentTokens(question.answers[style])) {
      usage[style].set(token, (usage[style].get(token) ?? 0) + 1)
    }
  }
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds questions this seller's book already printed (full or
 * compact), so a reply that ignores the prompt's avoid list still cannot
 * repeat them. Within the pool, a question that repeats an earlier one, or
 * leans on a word one style's answers have already used twice, is dropped:
 * the pool is one quiz's worth of questions, printed in order.
 */
export function selectRqQuestions(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): RqQuestion[] {
  const { cap, avoid = [] } = options
  const out: RqQuestion[] = []
  if (!Array.isArray(raw)) return out
  const usage = emptyUsage()
  for (const item of raw) {
    const question = normalizeRqQuestion(item)
    if (!question) continue
    if (avoid.some((label) => textsMatch(question.question, label))) continue
    if (out.some((kept) => questionsRepeat(question, kept))) continue
    if (overusesWords(question, usage)) continue
    out.push(question)
    recordUsage(question, usage)
    if (out.length >= cap) break
  }
  return out
}

/** The service item a validated question came from — for handing back to generate. */
export function rqItemFromQuestion(question: RqQuestion): RetireeQuizQuestionItem {
  return { question: question.question, ...question.answers, topic: question.topic, verified: true }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseRqPayload(remote: unknown): {
  questions: readonly unknown[]
  results: Partial<Record<RetireeStyle, unknown>>
} {
  if (!remote || typeof remote !== 'object') return { questions: [], results: {} }
  const payload = remote as Partial<RetireeQuizResponse>
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  const results =
    payload.results && typeof payload.results === 'object'
      ? (payload.results as Partial<Record<RetireeStyle, unknown>>)
      : {}
  return { questions, results }
}

/* ------------------------------------------------------------------ *
 * Result write-ups
 * ------------------------------------------------------------------ */

/**
 * Write-ups for a style whose fresh one did not pass. Original, gated by the
 * same rules as the service's, and several per style so two quizzes in one
 * book rarely share one.
 */
export const RQ_FALLBACK_DESCRIPTIONS: Readonly<Record<RetireeStyle, readonly string[]>> = {
  explorer: [
    'Curiosity is your compass. A new town, a new taste or a trail you have never tried is all it takes to brighten your week.',
    'You collect experiences the way others collect stamps. Every free day is a chance to see, taste or try something new.',
    'Give you a map and a free morning and you are off. Discovering places near and far keeps your days bright and full of stories.',
  ],
  tinkerer: [
    'Your head is always full of plans. Building, fixing, crafting or learning, you love the glow of a job well done.',
    'Every day is a workshop day for you. A new skill, a clever fix or a creative project keeps you happily busy.',
    'You love finding out how things work, then making them work even better. There is always a project on your table.',
  ],
  social: [
    'You bring people together wherever you go. A shared meal, a good chat or a group outing is your idea of a perfect day.',
    'Your calendar is full of good company. Lunches, clubs, phone calls and get-togethers are what make your days sing.',
    'You never met a gathering you could not brighten. Friends, neighbors and new faces all feel welcome in your circle.',
  ],
  napper: [
    'You have mastered the art of the unhurried day. A comfy chair, a good book and nowhere to be is well-earned bliss.',
    'You know rest is a skill, and you have earned your expert badge. Slow mornings and peaceful afternoons suit you perfectly.',
    'You never rush. You treasure quiet moments, long breakfasts and the odd snooze. Relaxing is your fine art.',
  ],
}

/** Keeps this game's write-up draw independent of other games on the same seed. */
const DESCRIPTION_SALT = 0x72716473

/**
 * One write-up per style: the service's fresh one when it passes the gate, or
 * a vetted fallback chosen by seed. Always four, so the results page never
 * prints a style without its write-up.
 */
export function resolveRqDescriptions(
  results: Partial<Record<RetireeStyle, unknown>>,
  seed: number,
): Record<RetireeStyle, string> {
  const rng = createRng(((seed >>> 0) ^ DESCRIPTION_SALT) >>> 0)
  const out = {} as Record<RetireeStyle, string>
  for (const style of RQ_STYLES) {
    const fallback = rng.pick(RQ_FALLBACK_DESCRIPTIONS[style])
    out[style] = normalizeDescription(results[style]) ?? fallback
  }
  return out
}

/** Service write-ups with every failing one blanked — for handing back to generate. */
export function rqResultsItem(results: Partial<Record<RetireeStyle, unknown>>): RetireeQuizResultsItem {
  const out = {} as RetireeQuizResultsItem
  for (const style of RQ_STYLES) out[style] = normalizeDescription(results[style]) ?? ''
  return out
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** A question in the order it prints: four lettered answers and the style behind each. */
export interface PlacedRqQuestion {
  question: string
  /** `answers[i]` prints beside `RQ_LETTERS[i]`. */
  answers: readonly string[]
  /** `styles[i]` is the style `answers[i]` scores for. */
  styles: readonly RetireeStyle[]
}

/** Keeps this game's placement draw independent of other games on the same seed. */
const PLACEMENT_SALT = 0x72717063

/**
 * Which letter each style's answer sits beside.
 *
 * Writers tend to list styles in the same order every time, so the page
 * decides instead. Letters are dealt from a Latin square over every run of
 * four questions: within each run, every style sits at every letter exactly
 * once, so no letter is a shortcut to one result, and a reader who always
 * picks "A" still scores a spread. Seeded, so a sheet always redraws alike.
 *
 * The style travels with its answer — `styles[i]` names the style of
 * `answers[i]` — so the scoring grid is built from the same record that the
 * question page prints, and cannot drift from it.
 */
export function placeRqQuestions(questions: readonly RqQuestion[], seed: number): PlacedRqQuestion[] {
  const rng = createRng(((seed >>> 0) ^ PLACEMENT_SALT) >>> 0)
  const size = RQ_STYLES.length
  let styles: RetireeStyle[] = []
  let columns: number[] = []
  let offsets: number[] = []
  return questions.map((question, index) => {
    if (index % size === 0) {
      styles = rng.shuffle([...RQ_STYLES])
      columns = rng.shuffle([0, 1, 2, 3])
      offsets = rng.shuffle([0, 1, 2, 3])
    }
    const offset = offsets[index % size]!
    const order = RQ_LETTERS.map((_, letter) => styles[(columns[letter]! + offset) % size]!)
    return { question: question.question, answers: order.map((style) => question.answers[style]), styles: order }
  })
}
