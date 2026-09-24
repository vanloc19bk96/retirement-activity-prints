import type {
  TwoTruthsFibItem,
  TwoTruthsFibLevel,
  TwoTruthsFibResponse,
  TwoTruthsFibSubject,
} from '@/types/studio-two-truths-fib.types'
import { createRng } from '../studio-rng'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Two Truths and a Fib puzzle is, and every rule a set must pass to print.
 *
 * A set is a short title and three statements on one topic — two true, one
 * false — plus a one-sentence correction for the answer page. The reader
 * circles the letter of the fib.
 *
 * Truth is decided by the content service: every set it returns has passed a
 * blind fact check that judged each statement without being told which one was
 * the fib, and carries `verified: true`. A set without that mark never prints,
 * whatever else it gets right.
 *
 * The remaining gates mirror `backend/app/services/studio_two_truths_fib_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, well-formed set reaches the
 * editor. A set is never repaired.
 */

export const TTF_TEMPLATE_KEY = 'two-truths-and-a-fib'
export const TTF_DEFAULT_TITLE = 'Two Truths and a Fib'

export const TTF_STATEMENTS_PER_SET = 3
/** Row labels, top to bottom. The reader circles one. */
export const TTF_LETTERS = ['A', 'B', 'C'] as const

/** Longest statement the page plans for — two to three lines of large print. */
export const MAX_STATEMENT_CHARS = 80
const MIN_STATEMENT_CHARS = 28
const MAX_STATEMENT_WORDS = 16
/** Longest set title — one line beside its number. */
export const MAX_TITLE_CHARS = 24
const MIN_TITLE_CHARS = 3
const MAX_TITLE_WORDS = 5
/** Longest correction the answer page plans for. */
export const MAX_FACT_CHARS = 90
const MIN_FACT_CHARS = 24
const MAX_FACT_WORDS = 18
/** The fib must not give itself away by being far shorter or longer. */
const MAX_LENGTH_RATIO = 2.3
/** Nothing after this year: recent "facts" are the ones most likely to change. */
const LATEST_YEAR = 2010

export const TTF_AI_EMPTY_MESSAGE =
  'Could not write reliable Two Truths and a Fib puzzles for this subject. Try again, or pick a broader subject.'
export const TTF_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Two Truths and a Fib page. Pick a larger page in Settings.'
export const TTF_BUILD_FAILED_MESSAGE = 'Could not fit these puzzles on this page. Try again.'

/**
 * The subject picker. Not the shared retirement-theme list: those themes are
 * lifestyle moods ("No More Mondays", "Relax & Unwind") that suit a word list,
 * while a fact puzzle needs a field of knowledge to draw true facts from. The
 * service owns each subject's pool of domains; the first option mixes pools
 * within the page.
 */
export const TTF_SUBJECTS: readonly { value: TwoTruthsFibSubject; label: string }[] = [
  { value: 'mixed', label: 'Mixed subjects' },
  { value: 'work', label: 'Work & careers' },
  { value: 'inventions', label: 'Inventions & everyday technology' },
  { value: 'home', label: 'Home life through the decades' },
  { value: 'leisure', label: 'Hobbies & pastimes' },
  { value: 'travel', label: 'Travel & transport' },
  { value: 'customs', label: 'Retirement traditions & customs' },
  { value: 'food', label: 'Food & the kitchen' },
  { value: 'nature', label: 'Nature & the outdoors' },
  { value: 'custom', label: 'Write my own subject…' },
]

export const TTF_LEVELS: readonly { value: TwoTruthsFibLevel; label: string }[] = [
  { value: 'gentle', label: 'Gentle — familiar facts' },
  { value: 'classic', label: 'Classic — lesser-known facts' },
  { value: 'challenging', label: 'Challenging — surprising facts' },
]

export function parseTtfSubject(raw: unknown): TwoTruthsFibSubject {
  const value = String(raw ?? '')
  return TTF_SUBJECTS.some((s) => s.value === value) ? (value as TwoTruthsFibSubject) : 'mixed'
}

export function parseTtfLevel(raw: unknown): TwoTruthsFibLevel {
  const value = String(raw ?? '')
  return TTF_LEVELS.some((l) => l.value === value) ? (value as TwoTruthsFibLevel) : 'classic'
}

/** The only instruction a reader needs. */
export function ttfInstruction(): string {
  return 'In each set, two statements are true and one is a fib. Circle the letter of the fib.'
}

/** The answer-page line under a set: which letter, and the real fact. */
export function ttfExplanation(letter: string, fact: string): string {
  return `${letter} is the fib. ${fact}`
}

/** One validated set, as the service wrote it. */
export interface TtfSet {
  title: string
  truths: readonly [string, string]
  fib: string
  fact: string
}

/** A set in the order it prints: three rows, one of them the fib. */
export interface PlacedTtfSet {
  title: string
  statements: readonly string[]
  fibIndex: number
  fact: string
}

/* ------------------------------------------------------------------ *
 * Word lists. Mirror `backend/app/data/studio/two-truths-and-a-fib/prompt.json`.
 * ------------------------------------------------------------------ */

const BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dies', 'dying', 'died', 'funeral', 'grave', 'graves', 'cemetery', 'coffin', 'widow', 'widower',
  'killed', 'kill', 'murder', 'suicide', 'execution', 'executed',
  'illness', 'ill', 'sick', 'sickness', 'disease', 'diseases', 'cancer', 'dementia', 'alzheimer', 'alzheimers', 'stroke', 'surgery',
  'diagnosis', 'medication', 'pills', 'epidemic', 'pandemic', 'plague', 'virus', 'injury', 'injured', 'infection',
  'disabled', 'disability', 'wheelchair', 'hearing aid', 'dentures', 'incontinence', 'blindness', 'deafness',
  'senile', 'forgetful', 'senior moment', 'over the hill', 'old fogey', 'elderly', 'geriatric', 'decline',
  'lonely', 'loneliness', 'divorce', 'affair',
  'poverty', 'poor', 'debt', 'bankrupt', 'bankruptcy', 'famine', 'depression', 'recession', 'unemployment', 'unemployed',
  'war', 'wars', 'wartime', 'battle', 'weapon', 'weapons', 'bomb', 'bombs', 'gun', 'guns', 'invasion', 'nazi', 'hitler',
  'prison', 'crime', 'criminal', 'arrested', 'slavery', 'slave', 'slaves',
  'politics', 'political', 'election', 'elections', 'president', 'prime minister', 'parliament', 'congress',
  'democrat', 'republican', 'communist', 'government',
  'religion', 'religious', 'church', 'god', 'bible', 'prayer', 'heaven', 'hell',
  'alcohol', 'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'gin', 'rum', 'cocktail', 'drunk', 'brewery',
  'gambling', 'gamble', 'casino', 'lottery', 'betting',
  'tobacco', 'cigarette', 'cigarettes', 'cigar', 'smoking',
  'sex', 'sexy', 'nude', 'naked',
  'stupid', 'idiot', 'ugly', 'crazy', 'useless',
] as const

const BRAND_TERMS = [
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'amazon', 'microsoft', 'ibm',
  'iphone', 'ipod', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola', 'coke', 'pepsi',
  'kellogg', 'kelloggs', 'heinz', 'nestle', 'cadbury', 'hershey', 'kodak', 'polaroid', 'xerox', 'hoover',
  'sony', 'walkman', 'tupperware', 'velcro', 'post-it', 'sellotape', 'scotch tape', 'lego', 'barbie', 'monopoly', 'scrabble',
  'model t', 'ford motor', 'rolls-royce', 'ferrari', 'harley', 'rolex', 'nintendo', 'playstation', 'xbox',
  'ikea', 'costco', 'uber', 'airbnb', 'zoom', 'whatsapp', 'kindle', 'wordle', 'harry potter', 'star wars', 'star trek',
  'beatles', 'elvis', 'taylor swift',
] as const

const TIME_TERMS = [
  'today', 'todays', 'currently', 'nowadays', 'now', 'still', 'recent', 'recently', 'latest',
  'modern-day', 'these days', 'this year', 'as of', 'world record', 'record-breaking', 'record-holder',
] as const

const ABSOLUTE_TERMS = [
  'never', 'always', 'only', 'none', 'nobody', 'nothing', 'no one', 'every', 'all', 'not', 'cannot',
  'most popular', 'most famous', 'best-selling', 'bestselling', "world's", 'largest', 'biggest', 'smallest',
  'oldest', 'tallest', 'longest', 'greatest', 'best', 'worst', 'favourite', 'favorite', 'beautiful', 'delicious',
  'amazing', 'wonderful', 'boring',
] as const

const HEDGE_TERMS = [
  'approximately', 'roughly', 'maybe', 'perhaps', 'possibly', 'probably', 'might', 'may have', 'reportedly',
  'allegedly', 'legend', 'legendary', 'rumour', 'rumor', 'believed', 'thought to', 'said to', 'some say',
  'some people', 'according to', 'supposedly', 'it is claimed',
] as const

const LEADING_PRONOUNS = new Set([
  'it', 'its', 'they', 'their', 'them', 'this', 'these', 'that', 'those', 'he', 'she', 'his', 'her', 'also', 'both', 'another', 'such',
])
const PERSONAL_WORDS = new Set(['you', 'your', 'yours', 'we', 'our', 'us', 'i', 'me', 'my'])

const QUALIFIERS = new Set([
  'a', 'an', 'the', 'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'or', 'from', 'by', 'into', 'onto', 'as',
  'was', 'were', 'is', 'are', 'be', 'been', 'being', 'had', 'has', 'have', 'did', 'do', 'does',
  'first', 'once', 'then', 'than', 'which', 'who', 'whose', 'what', 'when', 'where', 'there',
  'very', 'much', 'many', 'more', 'some', 'any', 'each', 'own', 'used', 'use', 'called', 'known', 'named',
])

/** Synonyms folded before comparing, so a paraphrase is still a repeat. */
const ALIASES: Readonly<Record<string, string>> = {
  invented: 'introduce', invent: 'introduce', invention: 'introduce', inventor: 'introduce',
  introduced: 'introduce', introduction: 'introduce', created: 'introduce', create: 'introduce',
  developed: 'introduce', develop: 'introduce', existed: 'introduce', exist: 'introduce',
  appeared: 'introduce', appear: 'introduce', launched: 'introduce', launch: 'introduce',
  patented: 'introduce', patent: 'introduce', designed: 'introduce', devised: 'introduce',
  made: 'introduce', built: 'introduce', came: 'introduce', arrived: 'introduce', began: 'introduce',
  earlier: 'before', prior: 'before', sooner: 'before', predates: 'before', predated: 'before', preceded: 'before',
  later: 'after', followed: 'after', postdates: 'after',
  telephones: 'telephone', phone: 'telephone', phones: 'telephone',
  television: 'tv', televisions: 'tv', telly: 'tv',
  automobile: 'car', automobiles: 'car', motorcar: 'car', cars: 'car',
  aeroplane: 'plane', airplane: 'plane', aircraft: 'plane',
  colour: 'color', colours: 'color', colors: 'color',
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = wordPattern(BLOCKED_TERMS)
const BRAND_RE = wordPattern(BRAND_TERMS)
const TIME_RE = wordPattern(TIME_TERMS)
const ABSOLUTE_RE = wordPattern(ABSOLUTE_TERMS)
const HEDGE_RE = wordPattern(HEDGE_TERMS)
const NUMERIC_HEDGE_RE =
  /\b(about|around|over|under|nearly|almost|roughly|approximately|some|up\s+to|more\s+than|less\s+than|fewer\s+than)\s+\$?£?\d/i
const CONTRACTED_NOT_RE = /n['’]t\b/i
const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2})s?\b/g
const ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().:;&%£$/]+$/
const INNER_SENTENCE_RE = /[.;:]\s+[A-Z]/
const NUMBER_RE = /^\s*(\(?[A-Ca-c1-9][.):]\s+|[-*•]\s+)/
const LABEL_RE = /^\s*(true|false|fib|truth|fact|correction)\s*[:\-–]\s*/i
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const TITLE_ALLOWED_RE = /^[A-Za-z0-9 &'’\-,]+$/
const TITLE_SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'or'])
/** The service's prompt example. A set on its topic is the model copying it. */
const EXAMPLE_TITLE = 'Lighthouse Lights'

export function isUnsafeTtfCopy(text: string): boolean {
  return isUnsafeCopy(text) || BLOCKED_RE.test(text) || BRAND_RE.test(text)
}

/** Worded so it is partly true, true only for now, or true only roughly. */
export function isUnverifiable(text: string): boolean {
  if (TIME_RE.test(text) || ABSOLUTE_RE.test(text) || HEDGE_RE.test(text)) return true
  if (NUMERIC_HEDGE_RE.test(text) || CONTRACTED_NOT_RE.test(text)) return true
  for (const match of text.matchAll(YEAR_RE)) {
    if (Number(match[1]) > LATEST_YEAR) return true
  }
  return false
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

/** The words that carry a statement's meaning, qualifiers dropped and synonyms folded. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of rawTokens(text)) {
    if (QUALIFIERS.has(raw)) continue
    const word = ALIASES[raw] ?? raw
    const stemmed = stem(word)
    out.add(ALIASES[stemmed] ?? stemmed)
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
 * True when a reader would call the two statements the same fact: most of
 * their meaning shared ("Telephones existed before television" / "Telephones
 * were invented earlier than television"), or one wholly inside the other once
 * it carries four words of substance.
 */
export function statementsRepeat(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return first.trim().toLowerCase() === second.trim().toLowerCase()
  if (jaccard(a, b) >= 0.6) return true
  return Math.min(a.size, b.size) >= 4 && (isSubset(a, b) || isSubset(b, a))
}

export function titlesRepeat(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  return a.size > 0 && a.size === b.size && isSubset(a, b)
}

/** Compact label for avoid lists — content words only, inside the 60-character cap. */
export function compactTtfLabel(text: string): string {
  let out = ''
  for (const word of rawTokens(text).filter((w) => !QUALIFIERS.has(w))) {
    const candidate = `${out} ${word}`.trim()
    if (candidate.length > 60) break
    out = candidate
  }
  return out || text.slice(0, 60)
}

/** What a printed set is remembered by: its title and its three statements. */
export function ttfSetLabels(set: TtfSet): string[] {
  return [set.title, ...[...set.truths, set.fib].map(compactTtfLabel)]
}

/* ------------------------------------------------------------------ *
 * Gates
 * ------------------------------------------------------------------ */

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

function sentence(raw: unknown, low: number, high: number, maxWords: number): string | null {
  let text = clean(raw).replace(NUMBER_RE, '').replace(LABEL_RE, '').trim()
  text = text.replace(EDGE_QUOTES_RE, '').replace(/[\s.]+$/, '').trim()
  if (!text || /[?!"“”]/.test(text)) return null
  if (!ALLOWED_RE.test(text) || INNER_SENTENCE_RE.test(text)) return null
  if (!/^[A-Z]/.test(text)) return null
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = letters.filter((ch) => ch >= 'A' && ch <= 'Z').length
  if (letters.length === 0 || upper > letters.length * 0.4) return null
  const tokens = rawTokens(text)
  if (tokens.length === 0 || LEADING_PRONOUNS.has(tokens[0]!)) return null
  if (tokens.some((token) => PERSONAL_WORDS.has(token))) return null
  if (text.split(' ').filter(Boolean).length > maxWords) return null
  const out = `${text}.`
  if (out.length < low || out.length > high) return null
  if (isUnsafeTtfCopy(out) || isUnverifiable(out)) return null
  return out
}

/** One plain, standalone declarative sentence, or null. */
export function normalizeStatement(raw: unknown): string | null {
  return sentence(raw, MIN_STATEMENT_CHARS, MAX_STATEMENT_CHARS, MAX_STATEMENT_WORDS)
}

export function normalizeFact(raw: unknown): string | null {
  return sentence(raw, MIN_FACT_CHARS, MAX_FACT_CHARS, MAX_FACT_WORDS)
}

function titleCase(text: string): string {
  return text
    .split(' ')
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i > 0 && TITLE_SMALL_WORDS.has(lower)) return lower
      if (word.length > 1 && word === word.toUpperCase()) return word[0] + word.slice(1).toLowerCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/** A short Title Case heading, or null. */
export function normalizeTitle(raw: unknown): string | null {
  const text = clean(raw).replace(/[\s.:;,!?]+$/, '').trim()
  if (!text || !TITLE_ALLOWED_RE.test(text)) return null
  if (text.length < MIN_TITLE_CHARS || text.length > MAX_TITLE_CHARS) return null
  if (text.split(' ').length > MAX_TITLE_WORDS) return null
  if (isUnsafeTtfCopy(text)) return null
  return titleCase(text)
}

/**
 * One complete, fact-checked set from raw service output — or null, never a repair.
 *
 * Three different facts on one topic, of similar length, and a correction that
 * is about the fib rather than a restated truth.
 */
export function normalizeTtfSet(raw: unknown): TtfSet | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  // Only the service's blind fact check can say a set is true.
  if (record.verified !== true) return null
  const title = normalizeTitle(record.title)
  if (!title || titlesRepeat(title, EXAMPLE_TITLE)) return null
  if (!Array.isArray(record.truths) || record.truths.length !== TTF_STATEMENTS_PER_SET - 1) return null
  const first = normalizeStatement(record.truths[0])
  const second = normalizeStatement(record.truths[1])
  const fib = normalizeStatement(record.fib)
  const fact = normalizeFact(record.fact)
  if (!first || !second || !fib || !fact) return null

  const statements = [first, second, fib]
  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      if (statementsRepeat(statements[i]!, statements[j]!)) return null
    }
  }
  const lengths = statements.map((s) => s.length)
  if (Math.max(...lengths) > Math.min(...lengths) * MAX_LENGTH_RATIO) return null
  const fibTokens = contentTokens(fib)
  if (![...contentTokens(fact)].some((token) => fibTokens.has(token))) return null
  if (statementsRepeat(fact, first) || statementsRepeat(fact, second)) return null
  return { title, truths: [first, second], fib, fact }
}

/** True when two sets would read as the same puzzle, or share a fact. */
export function setsRepeatEachOther(first: TtfSet, second: TtfSet): boolean {
  if (titlesRepeat(first.title, second.title)) return true
  const ours = [...first.truths, first.fib]
  const theirs = [...second.truths, second.fib]
  return ours.some((a) => theirs.some((b) => statementsRepeat(a, b)))
}

function repeatsLabel(set: TtfSet, labels: readonly string[]): boolean {
  const statements = [...set.truths, set.fib]
  return labels.some(
    (label) =>
      titlesRepeat(set.title, label) || statements.some((statement) => statementsRepeat(statement, label)),
  )
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds titles and statements this seller's book already printed (full
 * or compact), so a reply that ignores the prompt's avoid list still cannot
 * repeat them.
 */
export function selectTtfSets(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): TtfSet[] {
  const { cap, avoid = [] } = options
  const out: TtfSet[] = []
  if (!Array.isArray(raw)) return out
  for (const item of raw) {
    const set = normalizeTtfSet(item)
    if (!set) continue
    if (repeatsLabel(set, avoid)) continue
    if (out.some((kept) => setsRepeatEachOther(set, kept))) continue
    out.push(set)
    if (out.length >= cap) break
  }
  return out
}

/** The service item a validated set came from — for handing back to generate. */
export function ttfItemFromSet(set: TtfSet): TwoTruthsFibItem {
  return { title: set.title, truths: [...set.truths], fib: set.fib, fact: set.fact, verified: true }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseTtfPayload(remote: unknown): readonly TwoTruthsFibItem[] {
  if (!remote || typeof remote !== 'object') return []
  const items = (remote as Partial<TwoTruthsFibResponse>).items
  return Array.isArray(items) ? items : []
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** Keeps this game's placement draw independent of other games on the same seed. */
const PLACEMENT_SALT = 0x74746662

/**
 * Where each fib sits on the page.
 *
 * Writers put the false one last far more often than chance, so the page
 * decides instead: letters are dealt from a shuffled A-B-C deck, so three sets
 * on a page never share a fib letter and no position is a safe guess. The two
 * truths are swapped at random too. Seeded, so a sheet always redraws alike.
 *
 * The fib keeps its identity through the move — `statements[fibIndex]` is the
 * fib, and the answer page reads that index — so the key cannot drift from
 * the puzzle.
 */
export function placeTtfSets(sets: readonly TtfSet[], seed: number): PlacedTtfSet[] {
  const rng = createRng(((seed >>> 0) ^ PLACEMENT_SALT) >>> 0)
  let deck: number[] = []
  return sets.map((set) => {
    if (deck.length === 0) deck = rng.shuffle([0, 1, 2])
    const fibIndex = deck.pop()!
    const truths = rng.next() < 0.5 ? [...set.truths] : [set.truths[1], set.truths[0]]
    const statements = [...truths]
    statements.splice(fibIndex, 0, set.fib)
    return { title: set.title, statements, fibIndex, fact: set.fact }
  })
}
