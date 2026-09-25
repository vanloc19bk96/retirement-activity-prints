import type {
  WorkLingoLevel,
  WorkLingoPair,
  WorkLingoResponse,
} from '@/types/studio-work-lingo.types'
import { createRng } from '../studio-rng'

/**
 * What one Work Lingo Match pair is, and every rule it must pass to print.
 *
 * A pair is a workplace phrase ("Circle back") and its plain-English meaning
 * ("Return to the topic later"). The page numbers the phrases and letters the
 * meanings in a shuffled order; the reader writes each meaning's letter in the
 * box beside its phrase.
 *
 * Fairness is decided by the content service: every pair it returns has passed
 * a blind check that solved the matching puzzle itself — each phrase matched
 * back to its own meaning among the shuffled meanings of the whole response,
 * no meaning picked twice — and rated the phrase real, the meaning accurate,
 * the only one that fits, familiar enough and suitable. It carries
 * `verified: true`. A pair without that mark never prints. Pairs from two
 * responses were never checked against each other, so a page is only ever
 * built from one response.
 *
 * The remaining gates mirror `backend/app/services/studio_work_lingo_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, well-formed pair reaches
 * the editor. A pair is never repaired.
 */

export const WL_TEMPLATE_KEY = 'work-lingo-match'
export const WL_DEFAULT_TITLE = 'Work Lingo Match'

/** Longest phrase the page plans for — two lines of its row at most. */
export const MAX_PHRASE_CHARS = 28
/** Longest meaning the page plans for — two lines at most. */
export const MAX_MEANING_CHARS = 50

/** The service's hard limits (`prompt.json` → `limits`); a test keeps them identical. */
export const WL_LIMITS = {
  minPhraseChars: 4,
  maxPhraseWords: 6,
  minMeaningChars: 12,
  minMeaningWords: 3,
  maxMeaningWords: 10,
} as const

/** Fewer pairs than this is not a matching puzzle worth a page. */
export const MIN_PAIRS_PER_PAGE = 5

export const WL_AI_EMPTY_MESSAGE =
  'Could not write workplace phrases good enough to print. Please try again.'
export const WL_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Work Lingo Match page. Pick a larger page in Settings.'
export const WL_BUILD_FAILED_MESSAGE = 'Could not fit these workplace phrases on this page. Try again.'

export interface WlLevelSpec {
  value: WorkLingoLevel
  label: string
  /** Most pairs a page of this level holds, if the trim allows. */
  maxPairs: number
}

/**
 * Familiarity is the difficulty. A harder page also matches a longer list,
 * since every extra meaning is one more to rule out — but never smaller type:
 * the trim decides the count, and the level only raises its ceiling.
 */
export const WL_LEVELS: readonly WlLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — everyday office phrases', maxPairs: 8 },
  { value: 'classic', label: 'Classic — familiar, with a few to think about', maxPairs: 10 },
  { value: 'challenging', label: 'Challenging — less obvious business idioms', maxPairs: 10 },
]

export function parseWlLevel(raw: unknown): WorkLingoLevel {
  const value = String(raw ?? '')
  return WL_LEVELS.some((level) => level.value === value) ? (value as WorkLingoLevel) : 'classic'
}

export const wlLevelSpec = (level: WorkLingoLevel): WlLevelSpec =>
  WL_LEVELS.find((spec) => spec.value === level)!

/** The fullest page any level asks for. */
export const MAX_PAIRS_PER_PAGE = Math.max(...WL_LEVELS.map((level) => level.maxPairs))

/**
 * The only instruction a reader needs. One short line on every trim: the
 * numbered boxes and the lettered list show how to answer, and a second line
 * of instruction would cost a small page one of its pairs.
 */
export function wlInstruction(): string {
  return 'Match each phrase to its meaning.'
}

/** One validated pair, as the service wrote it. */
export interface WlPair {
  phrase: string
  meaning: string
}

/* ------------------------------------------------------------------ *
 * Word lists. Mirror `backend/app/data/studio/work-lingo-match/prompt.json`.
 * ------------------------------------------------------------------ */

export const WL_BLOCKED_TERMS = [
  'dead', 'die', 'dies', 'dying', 'died', 'death', 'deadly', 'kill', 'killer', 'killing', 'murder',
  'shoot', 'shooting', 'gun', 'guns', 'bullet', 'bullets', 'bomb', 'war', 'warpath', 'grave',
  'funeral', 'coffin', 'suicide', 'blood', 'bloodbath', 'massacre', 'postal', 'totem pole',
  'powwow', 'pow wow', 'spirit animal', 'tribe', 'tribal', 'kimono', 'chinese', 'gypsy', 'gyp',
  'grandfathered', 'sold down the river', 'peanut gallery', 'off the reservation',
  'circle the wagons', 'long time no see', 'no can do', 'master', 'slave', 'blacklist',
  'whitelist', 'cakewalk', 'crazy', 'insane', 'lame', 'dumb', 'idiot', 'stupid', 'moron', 'psycho',
  'over the hill', 'out to pasture', 'old guard', 'dinosaur', 'fossil', 'old-timer', 'past it',
  'senior moment', 'senile', 'geezer', 'elderly', 'frail', 'feeble', 'forgetful', 'too old',
  'old dog', 'new tricks', 'sex', 'sexy', 'naked', 'screw', 'screwed', 'piss', 'pissing', 'damn',
  'hell', 'ass', 'butt', 'balls', 'crap', 'sucks', 'bitch', 'bastard', 'toilet', 'bathroom', 'god',
  'jesus', 'church', 'prayer', 'bible', 'heaven', 'hail mary', 'gospel', 'preach', 'preaching',
  'election', 'democrat', 'republican', 'political', 'politics', 'drunk', 'beer', 'wine', 'booze',
  'cocktail', 'happy hour', 'hangover', 'casino', 'gambling', 'lottery', 'cancer', 'sick',
  'illness', 'disease', 'dementia', 'alzheimer', 'stroke', 'heart attack', 'hospital',
  'medication', 'pills',
] as const

export const WL_BRAND_TERMS = [
  'kool-aid', 'kool aid', 'xerox', 'rolodex', 'google', 'zoom', 'skype', 'photoshop', 'fedex',
  'band-aid', 'band aid', 'velcro', 'post-it', 'scotch tape', 'kleenex', 'wite-out', 'tipp-ex',
  'blackberry', 'microsoft', 'powerpoint', 'amazon', 'facebook', 'twitter', 'linkedin', 'uber',
  'netflix', 'starbucks', 'disney', 'monopoly', 'lego', 'ibm',
] as const

/** Function words, pronouns, light verbs and particles: dropped before phrases are compared. */
export const WL_QUALIFIER_WORDS = [
  'a', 'an', 'the', 'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'or', 'but', 'from', 'by',
  'into', 'onto', 'as', 'about', 'up', 'down', 'out', 'off', 'over', 'under', 'so', 'too', 'very',
  'just', 'all', 'any', 'some', 'every', 'each', 'no', 'not', 'if', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'am', 'has', 'have', 'had', 'do', 'does', 'did', 'done', 'dont', 'can',
  'cant', 'could', 'would', 'will', 'wont', 'should', 'get', 'gets', 'got', 'getting', 'go',
  'goes', 'going', 'went', 'take', 'takes', 'taking', 'took', 'make', 'makes', 'making', 'made',
  'put', 'puts', 'putting', 'keep', 'keeps', 'keeping', 'kept', 'give', 'gives', 'giving', 'gave',
  'let', 'lets', 'it', 'its', 'i', 'me', 'my', 'you', 'your', 'we', 'us', 'our', 'they', 'their',
  'them', 'he', 'she', 'his', 'her', 'him', 'this', 'that', 'these', 'those', 'there', 'then',
  'than', 'now', 'what', 'who', 'which', 'when', 'where', 'how', 'why', 'someone', 'somebody',
  'something', 'thing', 'things', 'one', 'ones', 'people', 'person', 'more', 'most', 'much',
  'many', 'again', 'later',
] as const

const QUALIFIERS: ReadonlySet<string> = new Set(WL_QUALIFIER_WORDS)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = wordPattern(WL_BLOCKED_TERMS)
const BRAND_RE = wordPattern(WL_BRAND_TERMS)
const FINANCE_RE =
  /\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock/i
const PHRASE_RE = /^[A-Za-z][A-Za-z ,'’-]*[A-Za-z]$/
const MEANING_RE = /^[A-Za-z][A-Za-z0-9 ,'’-]*[A-Za-z0-9]$/
const NUMBER_RE = /^\s*(\(?(\d{1,2}|[A-Za-z])[.):]\s+|[-*•]\s+)/
const PHRASE_LABEL_RE = /^\s*(phrase|jargon|expression|term)\s*[:\-–]\s*/i
const MEANING_LABEL_RE = /^\s*(meaning|means|definition)\s*[:\-–]\s*/i
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g

export function isUnsafeWlCopy(text: string): boolean {
  return FINANCE_RE.test(text) || BLOCKED_RE.test(text) || BRAND_RE.test(text)
}

/* ------------------------------------------------------------------ *
 * Repeats and look-alikes
 * ------------------------------------------------------------------ */

/** Fold plurals, regular verb endings and a final e: "circling" and "circle" are both "circl". */
function stem(word: string): string {
  let token = word
  if (token.length > 4 && token.endsWith('ies')) token = `${token.slice(0, -3)}y`
  else if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) token = token.slice(0, -2)
  else if (token.length > 5 && token.endsWith('ing')) token = token.slice(0, -3)
  else if (token.length > 4 && token.endsWith('ed')) token = token.slice(0, -2)
  else if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) token = token.slice(0, -1)
  if (token.length > 3 && token.endsWith('e')) token = token.slice(0, -1)
  return token
}

function rawTokens(text: string): string[] {
  const folded = text.toLowerCase().replace(/’/g, "'").replace(/'s /g, ' ').replace(/'/g, '')
  return folded.match(/[a-z0-9]+/g) ?? []
}

/** The words that carry a phrase or a meaning: function words dropped, endings folded. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of rawTokens(text)) if (!QUALIFIERS.has(word)) out.add(stem(word))
  return out
}

const folded = (text: string) => rawTokens(text).join(' ')
const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((token) => b.has(token)).length
const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].every((token) => b.has(token))

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = sharedCount(a, b)
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

/** True when the two are one phrase: "Back burner" / "Put it on the back burner". */
export function phrasesRepeat(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return folded(first) === folded(second)
  return isSubset(a, b) || isSubset(b, a)
}

/**
 * True when two phrases share a word and so may share a meaning — "Circle
 * back" and "Back burner" both come down to "later". A page never holds two of
 * one family, so neither can be matched to the other's meaning.
 */
export function phrasesRelated(first: string, second: string): boolean {
  return phrasesRepeat(first, second) || sharedCount(contentTokens(first), contentTokens(second)) > 0
}

/** True when two meanings read alike enough for a reader to swap them. */
export function meaningsClash(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return folded(first) === folded(second)
  return jaccard(a, b) >= 0.5 || sharedCount(a, b) >= 3
}

/** True when a meaning repeats a word of a phrase — its own, or a neighbour's as a false cue. */
export function echoesPhrase(meaning: string, phrase: string): boolean {
  return sharedCount(contentTokens(meaning), contentTokens(phrase)) > 0
}

/** True when two pairs cannot share a page without a reader confusing them. */
export function pairsConflict(pair: WlPair, other: WlPair): boolean {
  return (
    phrasesRelated(pair.phrase, other.phrase) ||
    meaningsClash(pair.meaning, other.meaning) ||
    echoesPhrase(pair.meaning, other.phrase) ||
    echoesPhrase(other.meaning, pair.phrase)
  )
}

/** What a printed phrase is remembered by: its words, lower-cased, inside the 60-character cap. */
export function wlPhraseLabel(phrase: string): string {
  return folded(phrase).slice(0, 60).trim() || phrase.slice(0, 60)
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

function stripLabels(raw: unknown, label: RegExp): string {
  let text = clean(clean(raw).replace(NUMBER_RE, '').replace(label, ''))
  // One closing full stop is punctuation, not part of the phrase.
  if (text.endsWith('.') && !text.endsWith('..')) text = text.slice(0, -1).trimEnd()
  return text
}

const wordCount = (text: string) => text.split(' ').filter(Boolean).length

/** The phrase as printed: plain words, starting with a capital, never an acronym — or null. */
export function normalizePhrase(raw: unknown, budget = MAX_PHRASE_CHARS): string | null {
  const text = stripLabels(raw, PHRASE_LABEL_RE)
  if (!text || !PHRASE_RE.test(text)) return null
  if (!/^[A-Z]/.test(text) || mostlyCaps(text)) return null
  if (wordCount(text) > WL_LIMITS.maxPhraseWords) return null
  if (text.length < WL_LIMITS.minPhraseChars || text.length > budget) return null
  if (contentTokens(text).size === 0 || isUnsafeWlCopy(text)) return null
  return text
}

/** The meaning as printed: a short plain phrase with no closing full stop — or null. */
export function normalizeMeaning(raw: unknown, budget = MAX_MEANING_CHARS): string | null {
  const text = stripLabels(raw, MEANING_LABEL_RE)
  if (!text || !MEANING_RE.test(text)) return null
  if (!/^[A-Z]/.test(text) || mostlyCaps(text)) return null
  const words = wordCount(text)
  if (words < WL_LIMITS.minMeaningWords || words > WL_LIMITS.maxMeaningWords) return null
  if (text.length < WL_LIMITS.minMeaningChars || text.length > budget) return null
  if (isUnsafeWlCopy(text)) return null
  return text
}

/** One complete, checked pair from raw service output — or null, never a repair. */
export function normalizeWlPair(raw: unknown): WlPair | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  // Only the service's blind check can say a pair is fair enough to print.
  if (record.verified !== true) return null
  const phrase = normalizePhrase(record.phrase)
  if (!phrase) return null
  const meaning = normalizeMeaning(record.meaning)
  if (!meaning || echoesPhrase(meaning, phrase)) return null
  return { phrase, meaning }
}

/**
 * Normalize → gate → drop repeats and look-alikes → take `cap`.
 *
 * `avoid` holds phrases this seller's book already printed (full or compact),
 * so a reply that ignores the prompt's avoid list still cannot repeat them.
 */
export function selectWlPairs(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): WlPair[] {
  const { cap, avoid = [] } = options
  const out: WlPair[] = []
  if (!Array.isArray(raw)) return out
  for (const entry of raw) {
    const pair = normalizeWlPair(entry)
    if (!pair) continue
    if (avoid.some((label) => phrasesRepeat(pair.phrase, label))) continue
    if (out.some((kept) => pairsConflict(pair, kept))) continue
    out.push(pair)
    if (out.length >= cap) break
  }
  return out
}

/** The service pair a validated pair came from — for handing back to generate. */
export function wlServicePair(pair: WlPair): WorkLingoPair {
  return { phrase: pair.phrase, meaning: pair.meaning, verified: true }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseWlPayload(remote: unknown): readonly WorkLingoPair[] {
  if (!remote || typeof remote !== 'object') return []
  const pairs = (remote as Partial<WorkLingoResponse>).pairs
  return Array.isArray(pairs) ? pairs : []
}

/* ------------------------------------------------------------------ *
 * Order and letters
 * ------------------------------------------------------------------ */

/** Keep this game's draws independent of other games on the same seed. */
const ORDER_SALT = 0x776c6f72
const LETTER_SALT = 0x776c6c74

/** The letter a meaning is printed under: A for the first, B for the second… */
export const wlLetter = (position: number) => String.fromCharCode(65 + position)

/** The order the phrases read in: the service's pairs, shuffled by seed. */
export function orderWlPairs(pairs: readonly WlPair[], seed: number): WlPair[] {
  return createRng(((seed >>> 0) ^ ORDER_SALT) >>> 0).shuffle(pairs)
}

/**
 * Which phrase's meaning sits under each letter: `shown[position]` is the
 * index of the phrase whose meaning prints as letter `position`.
 *
 * A seeded shuffle in which no meaning keeps its phrase's place, so phrase 1
 * is never A and the answers never run down the page in order.
 */
export function letterWlPairs(count: number, seed: number): number[] {
  const identity = Array.from({ length: count }, (_, i) => i)
  if (count < 2) return identity
  const rng = createRng(((seed >>> 0) ^ LETTER_SALT) >>> 0)
  for (let attempt = 0; attempt < 64; attempt++) {
    const shown = rng.shuffle(identity)
    if (shown.every((pair, position) => pair !== position)) return shown
  }
  // Practically unreachable (a shuffle is a derangement about a third of the
  // time); a rotation is always one.
  return identity.map((i) => (i + 1) % count)
}
