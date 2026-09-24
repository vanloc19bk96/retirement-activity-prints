import type {
  RiddlesJokesItem,
  RiddlesJokesKind,
  RiddlesJokesMix,
  RiddlesJokesResponse,
} from '@/types/studio-riddles-jokes.types'
import { createRng } from '../studio-rng'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Riddles & Jokes item is, and every rule it must pass to print.
 *
 * An item is a riddle or a clean joke: the question the reader sees, and the
 * answer or punchline printed under the same number on the answer page.
 *
 * Quality is decided by the content service: every item it returns has passed
 * a blind check that matched each setup back to its own answer among shuffled
 * answers, and rated it clear, funny, single-answer, fresh and suitable. It
 * carries `verified: true`. An item without that mark never prints, whatever
 * else it gets right.
 *
 * The remaining gates mirror `backend/app/services/studio_riddles_jokes_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, well-formed item reaches
 * the editor. An item is never repaired.
 */

export const RJ_TEMPLATE_KEY = 'riddles-and-jokes'
export const RJ_DEFAULT_TITLE = 'Retirement Riddles & Jokes'
/** Keeps this game's mixed-theme draw independent of other games on the same seed. */
export const RJ_THEME_SALT = 0x726a6b73

/** Longest setup the page plans for — three lines of large print at most. */
export const MAX_SETUP_CHARS = 90
/** Longest answer the answer page plans for — two lines at most. */
export const MAX_ANSWER_CHARS = 56

/** The service's hard limits (`prompt.json` → `limits`); a test keeps them identical. */
export const RJ_LIMITS = {
  minSetupChars: 16,
  maxSetupWords: 24,
  minAnswerChars: 3,
  maxAnswerWords: 14,
  maxRiddleAnswerWords: 8,
} as const

/** Setups sharing their first three words a page may print ("Why did the …"). */
export const MAX_SAME_OPENER_PER_PAGE = 2
/** Answers this short are noun phrases: "A tree." and "An oak tree." are one answer. */
const SHORT_ANSWER_WORDS = 4

export const RJ_AI_EMPTY_MESSAGE =
  'Could not write riddles and jokes good enough to print for this theme. Try again, or pick a broader theme.'
export const RJ_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Riddles & Jokes page. Pick a larger page in Settings.'
export const RJ_BUILD_FAILED_MESSAGE = 'Could not fit these riddles and jokes on this page. Try again.'

export const RJ_MIXES: readonly { value: RiddlesJokesMix; label: string }[] = [
  { value: 'both', label: 'Riddles and jokes' },
  { value: 'riddles', label: 'Riddles only' },
  { value: 'jokes', label: 'Jokes only' },
]

export function parseRjMix(raw: unknown): RiddlesJokesMix {
  const value = String(raw ?? '')
  return RJ_MIXES.some((m) => m.value === value) ? (value as RiddlesJokesMix) : 'both'
}

/** The only instruction a reader needs. The answer page may sit after the game or at the back. */
export function rjInstruction(mix: RiddlesJokesMix): string {
  if (mix === 'riddles') return 'Solve each riddle, then check your answers on the answer page.'
  if (mix === 'jokes') return 'Guess the punchline to each joke, then check the answer page.'
  return 'Guess the answer to each riddle and joke, then check the answer page.'
}

/** One validated item, as the service wrote it. */
export interface RjItem {
  kind: RiddlesJokesKind
  setup: string
  answer: string
}

/* ------------------------------------------------------------------ *
 * Word lists. Mirror `backend/app/data/studio/riddles-and-jokes/prompt.json`.
 * ------------------------------------------------------------------ */

export const RJ_BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dies', 'dying', 'died', 'funeral', 'grave',
  'cemetery', 'coffin', 'widow', 'widower', 'will and testament', 'illness', 'ill', 'sick',
  'disease', 'cancer', 'dementia', 'alzheimer', 'alzheimers', 'senile', 'stroke', 'surgery',
  'operation', 'hospital', 'doctor', 'doctors', 'nurse', 'nursing home', 'care home', 'retirement home',
  'medication', 'medicine', 'pills', 'diagnosis', 'arthritis', 'pain', 'aches', 'creaky',
  'hip replacement', 'knee replacement', 'wheelchair', 'walking stick', 'zimmer', 'disabled', 'disability', 'blind',
  'deaf', 'hearing', 'hearing aid', 'eyesight', 'reading glasses', 'glasses', 'dentures', 'teeth',
  'false teeth', 'incontinence', 'bladder', 'toilet', 'bathroom', 'diaper', 'prunes', 'constipation',
  'fart', 'diet', 'weight loss', 'overweight', 'fat', 'wrinkles', 'wrinkly', 'grey hair',
  'gray hair', 'bald', 'hair loss', 'memory', 'memory loss', 'remember', 'forget', 'forgot',
  'forgotten', 'forgetful', 'forgetting', 'senior moment', 'over the hill', 'old fogey', 'elderly', 'geriatric',
  'senior', 'seniors', 'senior citizen', 'old age', 'getting old', 'growing old', 'too old', 'so old',
  'old man', 'old woman', 'old lady', 'old people', 'old folks', 'old-timer', 'fossil', 'dinosaur',
  'ancient', 'frail', 'feeble', 'decline', 'rocking chair', 'grumpy', 'cranky', 'grouch', 'lonely', 'loneliness', 'alone forever',
  'nobody visits', 'bored to death', 'debt', 'broke', 'bankrupt', 'poverty', 'poor', 'bills',
  'pay off', 'paying off', 'mortgage', 'loan', 'taxes', "can't afford", 'cannot afford', 'pension',
  'savings', 'stingy', 'cheapskate', 'early bird special', 'wife', 'wives', 'husband', 'husbands',
  'mother-in-law', 'in-laws', 'nag', 'nagging', 'honey-do', 'divorce', 'ex-wife', 'ex-husband',
  'affair', 'election', 'political', 'politics', 'democrat', 'republican', 'president', 'government',
  'religion', 'church', 'prayer', 'god', 'heaven', 'hell', 'drunk', 'hangover',
  'beer', 'wine', 'vodka', 'whiskey', 'whisky', 'cocktail', 'booze', 'alcohol',
  'pub', 'bar', 'gamble', 'gambling', 'casino', 'lottery', 'bet', 'betting',
  'tobacco', 'cigarette', 'cigar', 'smoking', 'gun', 'weapon', 'war', 'fight',
  'kill', 'killing', 'violence', 'police', 'arrested', 'illegal', 'prison', 'sex',
  'sexy', 'naked', 'nude', 'stupid', 'idiot', 'dumb', 'hate', 'ugly',
  'crazy', 'useless', 'boring old', 'damn', 'knock knock',
] as const

export const RJ_BRAND_TERMS = [
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google',
  'amazon', 'iphone', 'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola',
  'coca cola', 'pepsi', 'lego', 'barbie', 'monopoly', 'scrabble', 'harry potter', 'star wars',
  'star trek', 'taylor swift', 'elvis', 'beatles', 'rolex', 'ferrari', 'harley', 'nintendo',
  'playstation', 'xbox', 'costco', 'ikea', 'uber', 'airbnb', 'zoom', 'facetime',
  'whatsapp', 'kindle', 'wordle', 'alexa', 'siri', 'fitbit', 'tupperware', 'velcro',
  'post-it', 'kodak', 'polaroid',
] as const

/** Function words, joke-frame words and the retirement words every item shares. */
export const RJ_QUALIFIER_WORDS = [
  'a', 'an', 'the', 'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'or',
  'but', 'from', 'by', 'into', 'onto', 'as', 'up', 'out', 'off', 'so', 'too', 'very',
  'just', 'all', 'any', 'some', 'every', 'each', 'no', 'not', 'if', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'am', 'has', 'have', 'had', 'do', 'does', 'did', 'done',
  'dont', 'can', 'cant', 'could', 'would', 'will', 'wont', 'should', 'get', 'gets', 'got', 'go',
  'goes', 'going', 'went', 'it', 'its', 'i', 'im', 'me', 'my', 'you', 'your', 'youre',
  'we', 'our', 'they', 'their', 'them', 'he', 'she', 'his', 'her', 'him', 'this', 'that',
  'these', 'those', 'there', 'then', 'than', 'now', 'still', 'anymore', 'ever', 'never', 'always', 'what',
  'whats', 'why', 'how', 'where', 'who', 'which', 'when', 'call', 'called', 'say', 'said', 'says',
  'tell', 'know', 'kind', 'difference', 'between', 'cross', 'favourite', 'favorite', 'happen', 'happens', 'best', 'thing',
  'because', 'retire', 'retired', 'retiree', 'retirees', 'retirement', 'retiring', 'pensioner', 'pensioners', 'man', 'woman', 'person',
  'people', 'guy', 'lady', 'fellow', 'someone', 'one', 'much', 'many', 'more', 'most',
] as const

/** Synonyms folded before comparing, so "throw away" and "get rid of" are one joke. */
export const RJ_ALIASES: Readonly<Record<string, string>> = {
  napping: 'nap', snooze: 'nap', snoozing: 'nap', doze: 'nap', dozing: 'nap',
  siesta: 'nap', sleep: 'nap', sleeping: 'nap', slept: 'nap', asleep: 'nap',
  golfer: 'golf', golfers: 'golf', golfing: 'golf', gardener: 'garden', gardeners: 'garden',
  gardening: 'garden', fisherman: 'fish', fishing: 'fish', angler: 'fish', manager: 'boss',
  supervisor: 'boss', office: 'work', workplace: 'work', job: 'work', jobs: 'work',
  career: 'work', working: 'work', worked: 'work', vacation: 'holiday', vacations: 'holiday',
  holidays: 'holiday', throw: 'discard', threw: 'discard', thrown: 'discard', toss: 'discard',
  tossed: 'discard', ditch: 'discard', ditched: 'discard', rid: 'discard', bin: 'discard',
  binned: 'discard', saturday: 'weekend', sunday: 'weekend', saturdays: 'weekend', sundays: 'weekend',
  weekends: 'weekend', monday: 'weekday', tuesday: 'weekday', wednesday: 'weekday', thursday: 'weekday',
  friday: 'weekday', mondays: 'weekday', tuesdays: 'weekday', wednesdays: 'weekday', thursdays: 'weekday',
  fridays: 'weekday', espresso: 'coffee', latte: 'coffee', cappuccino: 'coffee', tomatoes: 'tomato',
  potatoes: 'potato', meetings: 'meeting',
}

/** The service's prompt examples. An item repeating one is the model copying the shape sheet. */
const EXAMPLES: readonly { setup: string; answer: string }[] = [
  { setup: 'I went to work around your neck, but now I just hang around in the closet. What am I?', answer: 'Your old work tie.' },
  { setup: "What is a retired baker's favourite part of the day?", answer: 'Loafing around.' },
]

const QUALIFIERS: ReadonlySet<string> = new Set(RJ_QUALIFIER_WORDS)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = wordPattern(RJ_BLOCKED_TERMS)
const BRAND_RE = wordPattern(RJ_BRAND_TERMS)
const MEDICAL_RE = /\bprevent\s+dementia\b|\breverse\s+aging\b|\bcures?\s+for\b|\banti[\s-]?aging\b/i
const FINANCE_RE =
  /\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock/i
const ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().:;&!?]+$/
const INNER_SENTENCE_RE = /[.;:!]\s+[A-Z]/g
const NUMBER_RE = /^\s*(\(?\d{1,2}[.):]\s+|[-*•]\s+)/
const SETUP_LABEL_RE = /^\s*(q|question|riddle|joke|setup)\s*[:\-–]\s*/i
const ANSWER_LABEL_RE = /^\s*(answer|punchline|solution|a)\s*:\s*/i
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const QUOTE_RE = /["“”]/

export function isUnsafeRjCopy(text: string): boolean {
  return (
    isUnsafeCopy(text) ||
    MEDICAL_RE.test(text) ||
    FINANCE_RE.test(text) ||
    BLOCKED_RE.test(text) ||
    BRAND_RE.test(text)
  )
}

/* ------------------------------------------------------------------ *
 * Repeats
 * ------------------------------------------------------------------ */

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3)
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function rawTokens(text: string): string[] {
  const folded = text.toLowerCase().replace(/’/g, "'").replace(/'s /g, ' ').replace(/'/g, '')
  return folded.match(/[a-z0-9]+/g) ?? []
}

/** The words that carry an item's idea: frame and retirement words dropped, synonyms folded. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of rawTokens(text)) {
    if (QUALIFIERS.has(raw)) continue
    const word = RJ_ALIASES[raw] ?? raw
    const stemmed = stem(word)
    out.add(RJ_ALIASES[stemmed] ?? stemmed)
  }
  return out
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((token) => b.has(token)).length
const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].every((token) => b.has(token))
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && isSubset(a, b)

/**
 * True when a reader would call the two setups the same joke: most of their
 * words shared once both carry two words of substance, one wholly inside the
 * other at three words, or two distinctive words and a third of their meaning
 * shared — "Why did the retiree throw away the alarm clock?" and "Why did the
 * retired man get rid of his alarm clock?" are one joke with the nouns shuffled.
 */
export function setupsRepeat(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return first.trim().toLowerCase() === second.trim().toLowerCase()
  if (Math.min(a.size, b.size) < 2) return sameSet(a, b)
  const similarity = jaccard(a, b)
  if (similarity >= 0.5) return true
  if (Math.min(a.size, b.size) >= 3 && (isSubset(a, b) || isSubset(b, a))) return true
  return sharedCount(a, b) >= 2 && similarity >= 0.34
}

/**
 * True when two answers are the same answer: one riddle, or one punchline,
 * twice. Short answers count as one when either sits wholly inside the other
 * ("The alarm clock." / "Your old alarm clock!").
 */
export function answersRepeat(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) {
    const fold = (text: string) => text.trim().toLowerCase().replace(/[.!]+$/, '')
    return fold(first) === fold(second)
  }
  if (sameSet(a, b)) return true
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length
  const short = Math.max(words(first), words(second)) <= SHORT_ANSWER_WORDS
  if (isSubset(small, large) && (small.size >= 2 || short)) return true
  return small.size >= 3 && jaccard(a, b) >= 0.6
}

/** The first three words, so "Why did the …?" can only open so many setups. */
export function openerKey(setup: string): string {
  return rawTokens(setup).slice(0, 3).join(' ')
}

/** True when two items would read as the same joke, or share an answer. */
export function itemsRepeat(first: RjItem, second: RjItem): boolean {
  return setupsRepeat(first.setup, second.setup) || answersRepeat(first.answer, second.answer)
}

/** Compact label for avoid lists — content words only, inside the 60-character cap. */
export function compactRjLabel(text: string): string {
  let out = ''
  for (const word of rawTokens(text).filter((w) => !QUALIFIERS.has(w))) {
    const candidate = `${out} ${word}`.trim()
    if (candidate.length > 60) break
    out = candidate
  }
  return out || text.slice(0, 60)
}

/** What a printed item is remembered by: its setup and its answer. */
export function rjItemLabels(item: RjItem): string[] {
  return [compactRjLabel(item.setup), compactRjLabel(item.answer)]
}

/* ------------------------------------------------------------------ *
 * Gates
 * ------------------------------------------------------------------ */

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_QUOTES_RE, '')
}

function mostlyCaps(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = letters.filter((ch) => ch >= 'A' && ch <= 'Z').length
  return letters.length === 0 || upper > letters.length * 0.4
}

/** Printable, one or two sentences, starting with a capital, not shouted. */
function plain(text: string): boolean {
  if (QUOTE_RE.test(text) || !ALLOWED_RE.test(text)) return false
  if ((text.match(INNER_SENTENCE_RE) ?? []).length > 1) return false
  return /^[A-Z]/.test(text) && !mostlyCaps(text)
}

const wordCount = (text: string) => text.split(' ').filter(Boolean).length

/** The question the reader sees, ending in its only question mark — or null. */
export function normalizeSetup(raw: unknown, budget = MAX_SETUP_CHARS): string | null {
  const text = clean(clean(raw).replace(NUMBER_RE, '').replace(SETUP_LABEL_RE, ''))
  if (!text || !text.endsWith('?') || (text.match(/\?/g) ?? []).length !== 1 || text.includes('!')) {
    return null
  }
  if (!plain(text)) return null
  if (wordCount(text) > RJ_LIMITS.maxSetupWords) return null
  if (text.length < RJ_LIMITS.minSetupChars || text.length > budget) return null
  if (isUnsafeRjCopy(text)) return null
  return text
}

/** The answer or punchline as printed, ending in a full stop or "!" — or null. */
export function normalizeAnswer(
  raw: unknown,
  kind: RiddlesJokesKind,
  budget = MAX_ANSWER_CHARS,
): string | null {
  let text = clean(clean(raw).replace(NUMBER_RE, '').replace(ANSWER_LABEL_RE, ''))
  if (!text || text.includes('?') || !plain(text)) return null
  if (!/[.!]$/.test(text)) {
    if (!/[A-Za-z0-9)]$/.test(text)) return null
    text = `${text}.`
  }
  const maxWords = kind === 'riddle' ? RJ_LIMITS.maxRiddleAnswerWords : RJ_LIMITS.maxAnswerWords
  if (wordCount(text) > maxWords) return null
  if (text.length < RJ_LIMITS.minAnswerChars || text.length > budget) return null
  if (isUnsafeRjCopy(text)) return null
  return text
}

/** A riddle whose answer already sits in its setup has nothing left to guess. */
function givesItselfAway(kind: RiddlesJokesKind, setup: string, answer: string): boolean {
  const answerTokens = contentTokens(answer)
  if (answerTokens.size === 0) return false
  const setupTokens = contentTokens(setup)
  return kind === 'riddle' ? isSubset(answerTokens, setupTokens) : sameSet(answerTokens, setupTokens)
}

const mixAllows = (mix: RiddlesJokesMix, kind: RiddlesJokesKind) =>
  mix === 'both' || mix === `${kind}s`

/**
 * One complete, checked item from raw service output — or null, never a repair.
 *
 * `mix` drops a kind the seller did not ask for, so a "Riddles only" page can
 * never print a joke however the reply was shaped.
 */
export function normalizeRjItem(raw: unknown, mix: RiddlesJokesMix = 'both'): RjItem | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  // Only the service's blind check can say an item is good enough to print.
  if (record.verified !== true) return null
  const kind = String(record.kind ?? '').trim().toLowerCase()
  if (kind !== 'riddle' && kind !== 'joke') return null
  if (!mixAllows(mix, kind)) return null
  const setup = normalizeSetup(record.setup)
  if (!setup) return null
  const answer = normalizeAnswer(record.answer, kind)
  if (!answer || givesItselfAway(kind, setup, answer)) return null
  if (EXAMPLES.some((ex) => setupsRepeat(setup, ex.setup) || answersRepeat(answer, ex.answer))) return null
  return { kind, setup, answer }
}

function repeatsLabel(item: RjItem, labels: readonly string[]): boolean {
  return labels.some((label) => setupsRepeat(item.setup, label) || answersRepeat(item.answer, label))
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds setups and answers this seller's book already printed (full or
 * compact), so a reply that ignores the prompt's avoid list still cannot
 * repeat them.
 */
export function selectRjItems(
  raw: unknown,
  options: { cap: number; mix?: RiddlesJokesMix; avoid?: readonly string[] },
): RjItem[] {
  const { cap, mix = 'both', avoid = [] } = options
  const out: RjItem[] = []
  if (!Array.isArray(raw)) return out
  for (const entry of raw) {
    const item = normalizeRjItem(entry, mix)
    if (!item) continue
    if (repeatsLabel(item, avoid)) continue
    if (out.some((kept) => itemsRepeat(item, kept))) continue
    out.push(item)
    if (out.length >= cap) break
  }
  return out
}

/** The service item a validated item came from — for handing back to generate. */
export function rjServiceItem(item: RjItem): RiddlesJokesItem {
  return { kind: item.kind, setup: item.setup, answer: item.answer, verified: true }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseRjPayload(remote: unknown): readonly RiddlesJokesItem[] {
  if (!remote || typeof remote !== 'object') return []
  const items = (remote as Partial<RiddlesJokesResponse>).items
  return Array.isArray(items) ? items : []
}

/* ------------------------------------------------------------------ *
 * Order
 * ------------------------------------------------------------------ */

/** Keeps this game's ordering draw independent of other games on the same seed. */
const ORDER_SALT = 0x726a6f72

/**
 * The order a page reads its items in.
 *
 * Riddles and jokes alternate — a riddle to think about, then a joke to
 * laugh at — starting with a kind the seed picks, so the page has a rhythm
 * rather than four riddles in a row. When one kind runs out, the other fills
 * in. Seeded, so a sheet always redraws alike; within each kind the service's
 * order (already a seed-shuffled set of briefs) is kept.
 */
export function orderRjItems(items: readonly RjItem[], seed: number): RjItem[] {
  const riddles = items.filter((item) => item.kind === 'riddle')
  const jokes = items.filter((item) => item.kind === 'joke')
  const rng = createRng(((seed >>> 0) ^ ORDER_SALT) >>> 0)
  let turn = rng.next() < 0.5 ? 0 : 1
  const out: RjItem[] = []
  while (riddles.length > 0 || jokes.length > 0) {
    const queue = (turn === 0 && riddles.length > 0) || jokes.length === 0 ? riddles : jokes
    out.push(queue.shift()!)
    turn = 1 - turn
  }
  return out
}
