import type {
  WouldYouRatherItem,
  WouldYouRatherResponse,
  WouldYouRatherStyle,
} from '@/types/studio-would-you-rather.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Would You Rather question is, and every rule a pair must pass to print.
 *
 * A question is two choices that each complete a fixed "Would you rather…"
 * lead. Both come from one scenario and weigh about the same, so the reader
 * actually has to choose.
 *
 * These gates mirror `backend/app/services/studio_would_you_rather_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, fair pair reaches the
 * editor. A pair is never repaired: rewriting one side would print a dilemma
 * nobody wrote.
 */

export const WYR_TEMPLATE_KEY = 'would-you-rather'
export const WYR_DEFAULT_TITLE = 'Would You Rather?'

/** Printed above every pair. The choices are written to complete it. */
export const WYR_LEAD = 'Would you rather…'
/** Printed between the two choices. */
export const WYR_OR = 'OR'

/** Longest choice the page plans for — two or three lines of large print. */
export const MAX_OPTION_CHARS = 60
const MIN_OPTION_CHARS = 8
const MIN_OPTION_WORDS = 2
const MAX_OPTION_WORDS = 12
/** The longer choice may run to this multiple of the shorter one, no further. */
const MAX_LENGTH_RATIO = 2.5

/** Separates the two sides of a stored label. A choice may never contain it. */
export const PAIR_SEPARATOR = ' / '
/** Server and browser label cap (`AVOID_MAX_CHARS`, `MAX_LABEL_CHARS`). */
const COMPACT_LABEL_CHARS = 60

/**
 * Keeps this game's rotating theme out of step with the other games'.
 * A book run hands a spread one seed; without a salt, facing pages would share
 * a theme.
 */
export const WYR_THEME_SALT = 0x77797230

export const WYR_AI_EMPTY_MESSAGE =
  'Could not write fresh Would You Rather questions for this theme. Try again, or pick a broader theme.'
export const WYR_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Would You Rather page. Pick a larger page in Settings.'
export const WYR_BUILD_FAILED_MESSAGE = 'Could not fit these questions on this page. Try again.'

export const WYR_STYLES: readonly { value: WouldYouRatherStyle; label: string }[] = [
  { value: 'balanced', label: 'A mix of thoughtful and fun' },
  { value: 'thoughtful', label: 'Warm and thoughtful' },
  { value: 'playful', label: 'Light and funny' },
]

export function parseWyrStyle(raw: unknown): WouldYouRatherStyle {
  return WYR_STYLES.some((style) => style.value === raw) ? (raw as WouldYouRatherStyle) : 'balanced'
}

/** One validated question: two choices, each completing the lead. */
export interface WyrPair {
  optionA: string
  optionB: string
  topic: string
}

/** The how-to line. Two short clauses, so a 6 x 9 page does not lose a question to it. */
export function wyrInstruction(reasonLine: boolean): string {
  return reasonLine
    ? 'Tick the one you would choose, then write why on the line.'
    : 'Tick the one you would choose — then share why with someone.'
}

/*
 * Topics a friendly retirement book stays away from. Mirrors `blockedTerms`
 * and `brandTerms` in backend/app/data/studio/would-you-rather/prompt.json.
 */
const BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dying', 'died', 'funeral', 'grave', 'cemetery', 'widow', 'widower', 'will and testament',
  'illness', 'ill', 'sick', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke', 'surgery', 'operation',
  'hospital', 'doctor', 'nurse', 'nursing home', 'care home', 'retirement home', 'medication', 'medicine',
  'pills', 'diagnosis', 'arthritis', 'pain', 'aches', 'hip replacement', 'knee replacement',
  'wheelchair', 'walking stick', 'disabled', 'disability', 'blind', 'deaf', 'hearing aid', 'dentures',
  'incontinence', 'bladder', 'diet', 'weight loss', 'overweight', 'fat', 'wrinkles', 'grey hair',
  'memory loss', 'forget', 'forgetful', 'forgetting', 'senior moment', 'over the hill', 'old fogey',
  'elderly', 'geriatric', 'senior citizen', 'old age', 'old man', 'old woman', 'old lady', 'grumpy',
  'lonely', 'loneliness', 'alone forever', 'nobody visits', 'bored to death',
  'debt', 'broke', 'bankrupt', 'poverty', 'poor', 'bills', 'pay off', 'paying off', 'mortgage', 'loan', 'taxes',
  "can't afford", 'cannot afford', 'pension', 'savings',
  'divorce', 'ex-wife', 'ex-husband', 'affair',
  'election', 'political', 'politics', 'democrat', 'republican', 'president', 'government',
  'religion', 'church', 'prayer', 'god', 'heaven', 'hell',
  'drunk', 'hangover', 'beer', 'wine', 'vodka', 'whiskey', 'cocktail', 'booze', 'alcohol',
  'gamble', 'gambling', 'casino', 'lottery', 'bet', 'betting',
  'gun', 'weapon', 'war', 'fight', 'kill', 'violence', 'sex', 'sexy', 'naked', 'nude',
  'stupid', 'idiot', 'hate', 'ugly', 'crazy', 'useless', 'boring old', 'damn',
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'amazon',
  'iphone', 'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola',
  'lego', 'barbie', 'harry potter', 'star wars', 'star trek', 'taylor swift', 'elvis', 'beatles',
  'rolex', 'ferrari', 'harley', 'nintendo', 'playstation', 'xbox', 'costco', 'ikea', 'uber', 'airbnb',
] as const

/** Mirrors `qualifierWords`: dropped before two choices are compared. */
const QUALIFIERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'you', 'yourself', 'i', 'we',
  'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'from', 'about', 'by', 'into', 'onto', 'up', 'out',
  'too', 'so', 'very', 'really', 'whole', 'entire', 'full', 'just', 'only', 'every', 'each', 'all',
  'that', 'this', 'those', 'these', 'some', 'any', 'one', 'own', 'new', 'favourite', 'favorite',
  'whenever', 'always', 'again', 'ever',
])
const NEGATIONS = new Set(['not', 'never', 'no', 'without', 'dont', 'cant', 'cannot', 'wont'])
/** Mirrors `nonVerbOpeners`: a choice starting with one cannot follow "Would you rather". */
const NON_VERB_OPENERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'i', 'you', 'we', 'they', 'he', 'she', 'it',
  'this', 'that', 'these', 'those', 'there', 'some', 'any', 'all', 'every', 'each', 'one', 'someone', 'something',
  'option', 'choice', 'or', 'and', 'would', 'rather', 'to', 'if', 'when', 'while', 'because',
])
const ING_VERB_EXCEPTIONS = new Set([
  'bring', 'sing', 'swing', 'fling', 'sting', 'wring', 'cling', 'spring', 'ring', 'string',
])

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_TERMS.map(escapeRegExp).join('|')})\\b`, 'i')
const LEAD_RE = /^\s*would\s+you\s+(rather|prefer)\b[\s,.:…-]*/i
const LABEL_RE = /^\s*(\(?(option\s*)?[ab12]\s*[.):-]\s+|option\s+[ab12]\s*[:-]?\s+|[-*•]\s+)/i
const LEADING_OR_RE = /^\s*(or|either)\b[\s,]*/i
/** A third choice hiding inside one side ("… by the sea or the lake"). */
const INNER_OR_RE = /\b(or|either)\b/i
/** Letters, digits and light punctuation: no second sentence, no slash, no emoji. */
const ALLOWED_RE = /^[A-Za-z0-9 ,'’\-&()]+$/
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g

export function isUnsafeWyrCopy(text: string): boolean {
  return isUnsafeCopy(text) || BLOCKED_RE.test(text)
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function rawTokens(text: string): string[] {
  const folded = text.toLowerCase().replace(/’/g, "'").replace(/'s\s/g, ' ').replace(/'/g, '')
  return folded.match(/[a-z0-9]+/g) ?? []
}

/** Words that carry a choice's meaning, qualifiers and plurals folded. */
function contentTokens(text: string): Set<string> {
  return new Set(rawTokens(text).filter((word) => !QUALIFIERS.has(word)).map(stem))
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].every((token) => b.has(token))

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && isSubset(a, b)

/** One choice, tokenised once for every comparison it takes part in. */
interface SideTokens {
  text: string
  tokens: Set<string>
}

const sideTokens = (text: string): SideTokens => ({ text, tokens: contentTokens(text) })

function sidesMatch(x: SideTokens, y: SideTokens, threshold: number, subsetMin: number): boolean {
  const { tokens: a } = x
  const { tokens: b } = y
  if (a.size === 0 || b.size === 0) return x.text.trim().toLowerCase() === y.text.trim().toLowerCase()
  if (jaccard(a, b) >= threshold) return true
  return Math.min(a.size, b.size) >= subsetMin && (isSubset(a, b) || isSubset(b, a))
}

/** Half the meaning shared, or one inside the other once it has three words of substance. */
const sameChoice = (x: SideTokens, y: SideTokens) => sidesMatch(x, y, 0.6, 3)
/** The same choice reused, near word for word. */
const reusedChoice = (x: SideTokens, y: SideTokens) => sidesMatch(x, y, 0.75, Infinity)

/**
 * True when a reader would call the two choices the same choice: half their
 * meaning shared, or one wholly inside the other once it has three words of
 * substance.
 */
export function optionsMatch(first: string, second: string): boolean {
  return sameChoice(sideTokens(first), sideTokens(second))
}

/** The two sides of a question, as compared for repeats. */
export interface PairKey {
  a: string
  b: string
}

/** A question tokenised once, so a book of hundreds is a flat pass per candidate. */
export interface PairTokens {
  a: SideTokens
  b: SideTokens
  union: Set<string>
}

export function pairTokens(key: PairKey): PairTokens {
  const a = sideTokens(key.a)
  const b = sideTokens(key.b)
  return { a, b, union: new Set([...a.tokens, ...b.tokens]) }
}

/**
 * True when two questions would read as the same question twice — in either
 * order, or with one side reused word for word. A book that offers "travel the
 * world by train" on three pages repeats itself even if the other side changes.
 */
export function tokensRepeat(first: PairTokens, second: PairTokens): boolean {
  if (
    (sameChoice(first.a, second.a) && sameChoice(first.b, second.b)) ||
    (sameChoice(first.a, second.b) && sameChoice(first.b, second.a))
  ) {
    return true
  }
  for (const x of [first.a, first.b]) {
    for (const y of [second.a, second.b]) if (reusedChoice(x, y)) return true
  }
  return jaccard(first.union, second.union) >= 0.55
}

export function pairsRepeat(first: PairKey, second: PairKey): boolean {
  return tokensRepeat(pairTokens(first), pairTokens(second))
}

/** Read back a stored label — full ("Spend … / Learn …") or compact. */
export function pairKeyFromLabel(label: string): PairKey | null {
  const text = String(label ?? '').trim()
  if (!text) return null
  const at = text.indexOf(PAIR_SEPARATOR.trim())
  if (at < 0) return { a: text, b: text }
  return { a: text.slice(0, at).trim(), b: text.slice(at + 1).trim() }
}

/** Full label stamped on the page, so a later run can see what the book asks. */
export function pairLabel(pair: Pick<WyrPair, 'optionA' | 'optionB'>): string {
  return `${pair.optionA}${PAIR_SEPARATOR}${pair.optionB}`
}

function fitWords(words: readonly string[], limit: number): string {
  let out = ''
  for (const word of words) {
    const candidate = out ? `${out} ${word}` : word
    if (candidate.length > limit) break
    out = candidate
  }
  return out
}

/**
 * Content words of both sides inside the 60-char label cap the server and the
 * browser memory both enforce. When they do not fit, the words the second side
 * shares with the first go (its opening verb stays): the words that tell the
 * sides apart are what a later comparison needs. Mirrors `avoid_label`.
 */
export function compactPairLabel(pair: Pick<WyrPair, 'optionA' | 'optionB'>): string {
  const first = rawTokens(pair.optionA).filter((w) => !QUALIFIERS.has(w))
  let second = rawTokens(pair.optionB).filter((w) => !QUALIFIERS.has(w))
  const room = COMPACT_LABEL_CHARS - PAIR_SEPARATOR.length
  if (first.join(' ').length + second.join(' ').length > room) {
    const shared = new Set(first)
    second = [...second.slice(0, 1), ...second.slice(1).filter((w) => !shared.has(w))]
  }
  let aText = first.join(' ')
  let bText = second.join(' ')
  if (aText.length + bText.length > room) {
    const half = Math.floor(room / 2)
    bText = fitWords(second, Math.max(half, room - aText.length))
    aText = fitWords(first, room - bText.length)
  }
  return `${aText || pair.optionA.slice(0, 20)}${PAIR_SEPARATOR}${bText || pair.optionB.slice(0, 20)}`
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

/** Reads as the end of "Would you rather …" — a bare verb first. */
function opensOnVerb(text: string): boolean {
  const first = rawTokens(text)[0] ?? ''
  if (!first || NON_VERB_OPENERS.has(first)) return false
  return !(first.endsWith('ing') && !ING_VERB_EXCEPTIONS.has(first))
}

/** One choice, sentence case, no lead, label or end mark — or null. */
export function normalizeOption(raw: unknown, budget: number = MAX_OPTION_CHARS): string | null {
  let text = clean(raw)
  for (const pattern of [LEAD_RE, LABEL_RE, LEADING_OR_RE]) text = text.replace(pattern, '').trim()
  text = text.replace(/^to\s+/i, '').replace(/[\s.,;:!?…]+$/, '').replace(EDGE_QUOTES_RE, '')
  if (!text || !ALLOWED_RE.test(text) || INNER_OR_RE.test(text)) return null
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = text.match(/[A-Z]/g) ?? []
  if (letters.length === 0 || upper.length > letters.length * 0.5) return null
  const words = text.split(' ').filter(Boolean).length
  if (words < MIN_OPTION_WORDS || words > MAX_OPTION_WORDS) return null
  if (text.length < MIN_OPTION_CHARS || text.length > budget) return null
  if (!opensOnVerb(text) || isUnsafeWyrCopy(text)) return null
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Why two valid choices are not one fair dilemma, or null. */
export function pairProblem(optionA: string, optionB: string): string | null {
  if (optionA.toLowerCase() === optionB.toLowerCase()) return 'The two choices are the same.'
  const a = contentTokens(optionA)
  const b = contentTokens(optionB)
  if (sameSet(a, b) || jaccard(a, b) >= 0.8) return 'The two choices are too alike.'
  const core = (text: string) =>
    new Set(rawTokens(text).filter((w) => !QUALIFIERS.has(w) && !NEGATIONS.has(w)).map(stem))
  if (sameSet(core(optionA), core(optionB))) return 'One choice is just the other one negated.'
  const [short, long] = [optionA.length, optionB.length].sort((x, y) => x - y) as [number, number]
  if (long > short * MAX_LENGTH_RATIO) return 'One choice is far longer than the other.'
  return null
}

/** One complete, fair pair from raw service output — or null, never a repair. */
export function normalizeWyrPair(raw: unknown): WyrPair | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const optionA = normalizeOption(record.optionA)
  const optionB = normalizeOption(record.optionB)
  if (!optionA || !optionB || pairProblem(optionA, optionB)) return null
  return { optionA, optionB, topic: clean(record.topic).slice(0, 60) }
}

/**
 * Why a pair may not print, or null when it may. The preflight's last word on
 * a pair that has already been through `normalizeWyrPair`.
 */
export function wyrPairProblem(pair: WyrPair): string | null {
  const again = normalizeWyrPair(pair)
  if (!again || again.optionA !== pair.optionA || again.optionB !== pair.optionB) {
    return 'A question is not suitable for a published activity book.'
  }
  return null
}

const keyOf = (pair: WyrPair): PairKey => ({ a: pair.optionA, b: pair.optionB })

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds labels this seller's book already prints (full or compact), so
 * a reply that ignores the prompt's avoid list still cannot repeat them. Keys
 * are parsed once, so the check is a flat pass over at most a few hundred
 * labels.
 */
export function selectWyrPairs(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): WyrPair[] {
  const { cap, avoid = [] } = options
  const out: WyrPair[] = []
  if (!Array.isArray(raw) || cap <= 0) return out
  const avoided: PairTokens[] = []
  for (const label of avoid) {
    const key = pairKeyFromLabel(label)
    if (key) avoided.push(pairTokens(key))
  }
  const kept: PairTokens[] = []
  for (const item of raw) {
    const pair = normalizeWyrPair(item)
    if (!pair) continue
    const tokens = pairTokens(keyOf(pair))
    if (avoided.some((other) => tokensRepeat(tokens, other))) continue
    if (kept.some((other) => tokensRepeat(tokens, other))) continue
    out.push(pair)
    kept.push(tokens)
    if (out.length >= cap) break
  }
  return out
}

/** True when two pairs on one page would read as the same question. */
export function wyrPairsRepeat(first: WyrPair, second: WyrPair): boolean {
  return pairsRepeat(keyOf(first), keyOf(second))
}

/** The verb a choice opens on — "spend", "learn" — for spreading structures. */
export function openingVerb(text: string): string {
  return rawTokens(text)[0] ?? ''
}

/**
 * Order the pool so a page mixes its sentence shapes and topics.
 *
 * Pairs that bring a new opening verb and a new topic come first, the rest keep
 * their order behind them. Nothing is dropped: a page short on variety still
 * beats a page short on questions.
 */
export function orderForVariety(pairs: readonly WyrPair[]): WyrPair[] {
  const fresh: WyrPair[] = []
  const rest: WyrPair[] = []
  const verbs = new Set<string>()
  const topics = new Set<string>()
  for (const pair of pairs) {
    const verb = openingVerb(pair.optionA)
    const topic = pair.topic.toLowerCase()
    if (verbs.has(verb) || (topic && topics.has(topic))) {
      rest.push(pair)
      continue
    }
    verbs.add(verb)
    if (topic) topics.add(topic)
    fresh.push(pair)
  }
  return [...fresh, ...rest]
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseWyrPayload(remote: unknown): readonly WouldYouRatherItem[] {
  if (!remote || typeof remote !== 'object') return []
  const items = (remote as Partial<WouldYouRatherResponse>).items
  return Array.isArray(items) ? items : []
}
