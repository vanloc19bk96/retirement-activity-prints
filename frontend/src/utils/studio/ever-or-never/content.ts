import type {
  EverOrNeverItem,
  EverOrNeverResponse,
  EverOrNeverStyle,
} from '@/types/studio-ever-or-never.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Ever or Never statement is, and every rule it must pass to print.
 *
 * A statement is one short retirement-life experience, printed as a question
 * the reader answers by ticking Ever or Never: "Ever taken a nap before lunch
 * on a Tuesday?". It names one thing that either happened or did not.
 *
 * These gates mirror `backend/app/services/studio_ever_or_never_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, answerable statement
 * reaches the editor. A statement is never repaired: rewriting one would print
 * something nobody wrote.
 */

export const EON_TEMPLATE_KEY = 'ever-or-never'
export const EON_DEFAULT_TITLE = 'Ever or Never?'

/** The two answers printed beside every statement. */
export const EON_EVER = 'Ever'
export const EON_NEVER = 'Never'

/** Longest statement the page plans for, "Ever" and "?" included. */
export const MAX_STATEMENT_CHARS = 64
const MIN_STATEMENT_CHARS = 16
const MIN_BODY_WORDS = 3
const MAX_BODY_WORDS = 13

/** Server and browser label cap (`AVOID_MAX_CHARS`, `AVOID_LABEL_CHARS`). */
const COMPACT_LABEL_CHARS = 60

/**
 * Keeps this game's rotating theme out of step with the other games'.
 * A book run hands a spread one seed; without a salt, facing pages would share
 * a theme.
 */
export const EON_THEME_SALT = 0x656f6e30

export const EON_AI_EMPTY_MESSAGE =
  'Could not write fresh Ever or Never statements for this theme. Try again, or pick a broader theme.'
export const EON_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for an Ever or Never page. Pick a larger page in Settings.'
export const EON_BUILD_FAILED_MESSAGE = 'Could not fit these statements on this page. Try again.'

export const EON_STYLES: readonly { value: EverOrNeverStyle; label: string }[] = [
  { value: 'balanced', label: 'A mix of warm and funny' },
  { value: 'gentle', label: 'Warm and gentle' },
  { value: 'playful', label: 'Light and funny' },
]

export function parseEonStyle(raw: unknown): EverOrNeverStyle {
  return EON_STYLES.some((style) => style.value === raw) ? (raw as EverOrNeverStyle) : 'balanced'
}

/** One validated statement. */
export interface EonStatement {
  statement: string
  topic: string
}

/** The how-to line. Short, so a 6 x 9 page does not lose a statement to it. */
export function eonInstruction(storyLine: boolean): string {
  return storyLine
    ? 'Tick Ever or Never for each one, then jot down the story behind your Evers.'
    : 'Tick Ever if you have, Never if you haven’t — then compare with friends!'
}

/*
 * Topics a friendly retirement book stays away from. Mirrors `blockedTerms`
 * and `brandTerms` in backend/app/data/studio/ever-or-never/prompt.json.
 */
const BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dying', 'died', 'funeral', 'grave', 'cemetery', 'widow', 'widower', 'will and testament',
  'illness', 'ill', 'sick', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke', 'surgery', 'operation',
  'hospital', 'doctor', 'nurse', 'nursing home', 'care home', 'retirement home', 'medication', 'medicine',
  'pills', 'diagnosis', 'arthritis', 'pain', 'aches', 'hip replacement', 'knee replacement',
  'wheelchair', 'walking stick', 'disabled', 'disability', 'blind', 'deaf', 'hearing aid', 'dentures',
  'incontinence', 'bladder', 'diet', 'weight loss', 'overweight', 'fat', 'wrinkles', 'grey hair',
  'memory loss', 'forget', 'forgot', 'forgotten', 'forgetful', 'forgetting', 'senior moment', 'over the hill', 'old fogey',
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
  'police', 'arrested', 'illegal', 'speeding ticket',
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'amazon',
  'iphone', 'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola',
  'lego', 'barbie', 'harry potter', 'star wars', 'star trek', 'taylor swift', 'elvis', 'beatles',
  'rolex', 'ferrari', 'harley', 'nintendo', 'playstation', 'xbox', 'costco', 'ikea', 'uber', 'airbnb',
  'zoom', 'facetime', 'whatsapp', 'kindle', 'wordle',
] as const

/** Mirrors `qualifierWords`: dropped before two statements are compared. */
const QUALIFIERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'you', 'yourself', 'i', 'we',
  'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'from', 'about', 'by', 'into', 'onto', 'up', 'out',
  'too', 'so', 'very', 'really', 'whole', 'entire', 'full', 'just', 'only', 'every', 'each', 'all',
  'that', 'this', 'those', 'these', 'some', 'any', 'one', 'own', 'new', 'favourite', 'favorite',
  'whenever', 'always', 'again', 'ever', 'have', 'has', 'actually', 'even', 'still',
])
/** Mirrors `negationWords`: "Ever not …" turns the answer boxes inside out. */
const NEGATIONS = new Set([
  'never', 'not', 'dont', 'didnt', 'havent', 'hasnt', 'cant', 'cannot', 'wont', 'wasnt', 'werent', 'isnt',
])
/** Mirrors `participleWords`: irregular past participles a statement may open on. */
const PARTICIPLES = new Set([
  'been', 'gone', 'done', 'had', 'made', 'seen', 'sat', 'stood', 'slept', 'overslept', 'kept', 'left', 'met',
  'bought', 'brought', 'caught', 'taught', 'thought', 'told', 'sold', 'found', 'won', 'lost', 'built', 'felt',
  'heard', 'held', 'read', 'run', 'begun', 'sung', 'swum', 'rung', 'spun', 'hung', 'dug', 'fed', 'led', 'lit',
  'put', 'set', 'cut', 'hit', 'let', 'shut', 'quit', 'spent', 'sent', 'lent', 'bent', 'meant', 'dreamt',
  'learnt', 'burnt', 'spelt', 'spilt', 'knelt', 'slid', 'sped', 'stuck', 'struck', 'swung', 'wound', 'got',
  'come', 'become', 'overcome', 'understood', 'taken', 'given', 'eaten', 'driven', 'ridden', 'written',
  'hidden', 'bitten', 'woken', 'spoken', 'chosen', 'frozen', 'fallen', 'shaken', 'forgiven', 'mistaken',
  'worn', 'torn', 'sworn', 'grown', 'known', 'shown', 'blown', 'thrown', 'flown', 'drawn', 'sewn', 'sown',
  'mown', 'paid', 'laid', 'said', 'beaten', 'gotten', 'proven', 'risen', 'awoken', 'shot', 'sunk', 'shrunk',
  'flung', 'clung', 'stung', 'sprung', 'strung', 'bred', 'fled', 'dealt', 'leapt', 'swept', 'wept', 'crept',
  'knit', 'split', 'spread', 'cast', 'burst', 'shed', 'upset', 'fit', 'sought', 'fought',
])

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_TERMS.map(escapeRegExp).join('|')})\\b`, 'i')
const NUMBER_RE = /^\s*(\(?\d{1,2}\s*[.):-]\s+|[-*•]\s+)/
const GAME_LABEL_RE = /^\s*ever\s+or\s+never\s*[:,.!?-]*\s*/i
const HAVE_YOU_RE = /^\s*(have|has)\s+(you|anyone|anybody)\s+(ever\s+)?/i
const EVER_RE = /^\s*ever\b[\s,]*/i
/** A second experience hiding inside one statement ("… on the couch or the porch"). */
const INNER_OR_RE = /\b(or|either|nor)\b/i
/** Letters, digits and light punctuation: no second sentence, no slash, no emoji. */
const ALLOWED_RE = /^[A-Za-z0-9 ,'’\-&()]+$/
const REGULAR_PARTICIPLE_RE = /^[a-z]{2,}ed$/
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g

export function isUnsafeEonCopy(text: string): boolean {
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

/** Words that carry a statement's meaning, qualifiers and plurals folded. */
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

/** A statement tokenised once, so a book of hundreds is a flat pass per candidate. */
export interface StatementTokens {
  text: string
  tokens: Set<string>
}

export const statementTokens = (text: string): StatementTokens => ({
  text,
  tokens: contentTokens(text),
})

/**
 * True when a reader would call the two statements the same experience: most
 * of their meaning shared ("a nap before lunch" / "a nap after lunch"), or one
 * wholly inside the other once it has three words of substance.
 */
export function tokensRepeat(x: StatementTokens, y: StatementTokens): boolean {
  const { tokens: a } = x
  const { tokens: b } = y
  if (a.size === 0 || b.size === 0) return x.text.trim().toLowerCase() === y.text.trim().toLowerCase()
  if (jaccard(a, b) >= 0.6) return true
  return Math.min(a.size, b.size) >= 3 && (isSubset(a, b) || isSubset(b, a))
}

export function statementsRepeat(first: string, second: string): boolean {
  return tokensRepeat(statementTokens(first), statementTokens(second))
}

/**
 * Content words inside the 60-char label cap the server and the browser memory
 * both enforce. Mirrors `avoid_label`. A full statement compares the same way,
 * so the book's stamped labels and these compact ones are interchangeable.
 */
export function compactStatementLabel(statement: string): string {
  let out = ''
  for (const word of rawTokens(statement).filter((w) => !QUALIFIERS.has(w))) {
    const candidate = out ? `${out} ${word}` : word
    if (candidate.length > COMPACT_LABEL_CHARS) break
    out = candidate
  }
  return out || statement.slice(0, COMPACT_LABEL_CHARS)
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

/** Reads as the verb after "Ever" — "taken", "napped", "sung". */
export function isParticiple(word: string): boolean {
  const folded = word.toLowerCase()
  return PARTICIPLES.has(folded) || REGULAR_PARTICIPLE_RE.test(folded)
}

/** One statement as printed — "Ever taken …?" — or null. */
export function normalizeStatement(raw: unknown, budget: number = MAX_STATEMENT_CHARS): string | null {
  let text = clean(raw)
  for (const pattern of [NUMBER_RE, GAME_LABEL_RE]) text = text.replace(pattern, '').trim()
  text = text.replace(EDGE_QUOTES_RE, '').replace(/[\s.,;:!?…]+$/, '').replace(EDGE_QUOTES_RE, '')
  text = text.replace(HAVE_YOU_RE, '')
  const body = text.replace(EVER_RE, '').trim()
  if (!body || !ALLOWED_RE.test(body) || INNER_OR_RE.test(body)) return null
  const letters = body.match(/[A-Za-z]/g) ?? []
  const upper = body.match(/[A-Z]/g) ?? []
  if (letters.length === 0 || upper.length > letters.length * 0.5) return null
  const tokens = rawTokens(body)
  if (!tokens[0] || !isParticiple(tokens[0])) return null
  if (tokens.some((token) => NEGATIONS.has(token))) return null
  const words = body.split(' ').filter(Boolean).length
  if (words < MIN_BODY_WORDS || words > MAX_BODY_WORDS) return null
  const statement = `Ever ${body.charAt(0).toLowerCase()}${body.slice(1)}?`
  if (statement.length < MIN_STATEMENT_CHARS || statement.length > budget) return null
  if (isUnsafeEonCopy(statement)) return null
  return statement
}

/** One complete statement from raw service output — or null, never a repair. */
export function normalizeEonItem(raw: unknown): EonStatement | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const statement = normalizeStatement(record.statement)
  if (!statement) return null
  return { statement, topic: clean(record.topic).slice(0, 60) }
}

/**
 * Why a statement may not print, or null when it may. The preflight's last
 * word on one that has already been through `normalizeEonItem`.
 */
export function eonStatementProblem(item: EonStatement): string | null {
  const again = normalizeEonItem(item)
  if (!again || again.statement !== item.statement) {
    return 'A statement is not suitable for a published activity book.'
  }
  return null
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds labels this seller's book already prints (full or compact), so
 * a reply that ignores the prompt's avoid list still cannot repeat them.
 */
export function selectEonStatements(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): EonStatement[] {
  const { cap, avoid = [] } = options
  const out: EonStatement[] = []
  if (!Array.isArray(raw) || cap <= 0) return out
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map(statementTokens)
  const kept: StatementTokens[] = []
  for (const item of raw) {
    const statement = normalizeEonItem(item)
    if (!statement) continue
    const tokens = statementTokens(statement.statement)
    if (avoided.some((other) => tokensRepeat(tokens, other))) continue
    if (kept.some((other) => tokensRepeat(tokens, other))) continue
    out.push(statement)
    kept.push(tokens)
    if (out.length >= cap) break
  }
  return out
}

/** The verb after "Ever" — "taken", "stayed" — for spreading sentence shapes. */
export function openingVerb(statement: string): string {
  return rawTokens(statement)[1] ?? ''
}

/**
 * Order the pool so a page mixes its sentence shapes and topics.
 *
 * Statements that bring a new opening verb and a new topic come first, the
 * rest keep their order behind them. Nothing is dropped: a page short on
 * variety still beats a page short on statements.
 */
export function orderForVariety(items: readonly EonStatement[]): EonStatement[] {
  const fresh: EonStatement[] = []
  const rest: EonStatement[] = []
  const verbs = new Set<string>()
  const topics = new Set<string>()
  for (const item of items) {
    const verb = openingVerb(item.statement)
    const topic = item.topic.toLowerCase()
    if (verbs.has(verb) || (topic && topics.has(topic))) {
      rest.push(item)
      continue
    }
    verbs.add(verb)
    if (topic) topics.add(topic)
    fresh.push(item)
  }
  return [...fresh, ...rest]
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseEonPayload(remote: unknown): readonly EverOrNeverItem[] {
  if (!remote || typeof remote !== 'object') return []
  const items = (remote as Partial<EverOrNeverResponse>).items
  return Array.isArray(items) ? items : []
}
