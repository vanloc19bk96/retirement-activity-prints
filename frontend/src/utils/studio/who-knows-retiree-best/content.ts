import type {
  WhoKnowsBestAnswer,
  WhoKnowsBestAudience,
  WhoKnowsBestResponse,
} from '@/types/studio-who-knows-best.types'
import { createRng } from '../studio-rng'
import { BL_BRAND_TERMS, keysRepeat, stem, type IdeaKey } from '../bucket-list/content'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Who Knows the Retiree Best? question is, every rule it must pass
 * to print, and how twelve questions become one varied, balanced set.
 *
 * A question is one short, light guess about the retiree — "What was the
 * very first job they were paid for?" — that someone who knows them could
 * make, with one reasonably clear answer the retiree can confirm. It speaks
 * of the retiree as they/their/them (never a name, "he" or "she") and never
 * to the player as "you". Nothing about age, health, money, relationships,
 * beliefs, private details or anything embarrassing.
 *
 * Nothing about the retiree is known or invented: the retiree writes the real
 * answers on their own sheet. The optional name the seller types is printed
 * in headings and instructions only, and never sent to the content service.
 *
 * A set is judged as a whole, not question by question: twelve questions from
 * at least nine topics, no topic more than twice (and never twice on the same
 * detail), no group of topics swamping it (two food questions at most, three
 * office ones…), "favourite" twice at most, no three questions opening alike,
 * and always one about the future.
 *
 * These gates mirror `backend/app/services/studio_who_knows_best_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only whole, valid questions reach the
 * editor. A question is never repaired. The word lists are the service's own
 * (`backend/app/data/studio/who-knows-retiree-best/prompt.json`), checked
 * equal by `content.test.ts`; brands are the Bucket List's list, as there.
 */

export const WKB_TEMPLATE_KEY = 'who-knows-retiree-best'
export const WKB_DEFAULT_TITLE = 'Who Knows the Retiree Best?'

/** Mirrors `limits` in the service's prompt.json. */
export const WKB_LIMITS = {
  questions: 12,
  spares: 8,
  maxAsk: 24,
  topicMax: 2,
  minTopics: 9,
  shapeMax: 3,
  favouriteMax: 2,
  openingMax: 3,
  minQuestionChars: 18,
  maxQuestionChars: 80,
  minQuestionWords: 4,
  maxQuestionWords: 16,
  maxConceptChars: 40,
} as const

export const WKB_QUESTIONS = WKB_LIMITS.questions
/** Longest question the page plans for. */
export const MAX_QUESTION_CHARS = WKB_LIMITS.maxQuestionChars

/** The topic every full set plans first. Mirrors `ANCHOR_TOPIC`. */
export const WKB_ANCHOR_TOPIC = 'retirement-plans'
/** The group a set must always draw on: it is a retirement book. */
export const WKB_FUTURE_GROUP = 'future'

/**
 * Keeps this game's shuffle out of step with the other games'. A book run
 * hands a spread one seed; without a salt two games would draw alike.
 */
export const WKB_SALT = 0x776b6273

export const WKB_ANSWERS: readonly WhoKnowsBestAnswer[] = ['word', 'phrase', 'sentence']

export const WKB_AUDIENCES: readonly { value: WhoKnowsBestAudience; label: string; help: string }[] = [
  {
    value: 'mixed',
    label: 'Friends, family & coworkers',
    help: 'Questions anyone who knows them could answer: tastes, habits, hobbies and plans, with a little from work.',
  },
  {
    value: 'work',
    label: 'Coworkers',
    help: 'More about their working life — routines, desk habits and what they’re known for — plus a little life outside work.',
  },
  {
    value: 'family',
    label: 'Friends & family',
    help: 'Tastes, habits, hobbies, travel and plans — no office questions.',
  },
]

export function parseWkbAudience(raw: unknown): WhoKnowsBestAudience {
  return WKB_AUDIENCES.some((a) => a.value === raw) ? (raw as WhoKnowsBestAudience) : 'mixed'
}

/** Answer sheets a set prints, one per player, plus the retiree's own. */
export const WKB_PLAYER_COUNTS = [1, 2, 3, 4, 5, 6] as const
export const WKB_DEFAULT_PLAYERS = 2

export function parseWkbPlayers(raw: unknown): number {
  const value = Number(raw)
  return (WKB_PLAYER_COUNTS as readonly number[]).includes(value) ? value : WKB_DEFAULT_PLAYERS
}

/** A first name or nickname: long enough for "Aunt Josephine", short enough for a heading. */
export const WKB_NAME_MAX = 24
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u

/** The retiree's name as printed, or '' — blank, too long, or not a name. */
export function parseRetireeName(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || text.length > WKB_NAME_MAX || !NAME_RE.test(text)) return ''
  return text.replace(/'/g, '’')
}

export function retireeNameProblem(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text || parseRetireeName(text)) return null
  return `Use a first name or nickname: letters only, up to ${WKB_NAME_MAX} characters.`
}

/** "Linda’s", "James’". */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

/** Who the instructions speak of. */
export const whoFor = (name: string) => name || 'the retiree'

/**
 * The player sheets' heading: the seller's own, or — while the default is
 * untouched and a name is set — "Who Knows Linda Best?". Blank when titles
 * are off.
 */
export function wkbTitleFor(rawTitle: unknown, name: string): string {
  const title = String(rawTitle ?? '').trim()
  if (!title) return ''
  return name && title === WKB_DEFAULT_TITLE ? `Who Knows ${name} Best?` : title
}

/** The retiree's sheet heading, whenever the player sheets carry one. */
export function wkbAnswersTitleFor(playerTitle: string, name: string): string {
  if (!playerTitle) return ''
  return name ? `${possessive(name)} Real Answers` : 'The Real Answers'
}

/** How a player plays: guess, then tick the matches. */
export function wkbPlayerInstruction(name: string): string {
  const who = whoFor(name)
  return `Write the answer you think ${who} would give. When the real answers are read out, tick the box beside every one you got right — close enough counts!`
}

/** How the retiree's sheet is used: filled in by them, read out, scored. */
export function wkbAnswersInstruction(name: string, players: number): string {
  const who = whoFor(name)
  const scoreboard = players > 1 ? ' Then fill in the scoreboard.' : ''
  return `For ${who} to fill in. Read the answers out once everyone has finished — ${who} has the final say on close calls!${scoreboard}`
}

export const WKB_AI_EMPTY_MESSAGE =
  'Could not write fresh questions about the retiree this time. Please try again.'
export const WKB_SHORT_MESSAGE =
  'Could not gather 12 distinct, well-balanced questions this time. Please try again.'
export const WKB_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for Who Knows the Retiree Best? Pick a larger page in Settings.'
export const WKB_BUILD_FAILED_MESSAGE = 'Could not lay out these questions on your page. Please try again.'

/** One topic of the bank: the group it balances under and how much each audience draws on it. */
export interface WkbTopic {
  group: string
  audiences: Readonly<Record<WhoKnowsBestAudience, number>>
}

/* The service's word lists and topic bank, verbatim. */
export const WKB_RETIREE_WORDS: readonly string[] = [
  'they', 'their', 'them', 'theirs', 'themselves', 'theyd', 'theyre', 'theyve', 'theyll',
]
export const WKB_READER_WORDS: readonly string[] = [
  'you', 'your', 'yours', 'yourself', 'youd', 'youre', 'youve', 'youll', 'i', 'me', 'my', 'mine', 'im',
  'ive', 'id',
]
export const WKB_GENDERED_WORDS: readonly string[] = [
  'he', 'she', 'him', 'her', 'his', 'hers', 'himself', 'herself', 'hes', 'shes',
]
export const WKB_SAYING_TERMS: readonly string[] = [
  'say', 'says', 'saying', 'sayings', 'said', 'phrase', 'expression', 'motto', 'catchphrase', 'advice',
  'story', 'speech', 'why', 'title', 'perfect day', 'from start to finish',
]
export const WKB_QUALIFIER_WORDS: readonly string[] = [
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'as', 'into',
  'onto', 'up', 'out', 'over', 'off', 'and', 'or', 'but', 'so', 'if', 'than', 'then', 'that', 'this',
  'these', 'those', 'there', 'here', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why',
  'how', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'done', 'doing', 'would',
  'will', 'could', 'should', 'can', 'might', 'may', 'must', 'they', 'their', 'them', 'theirs',
  'themselves', 'theyd', 'theyre', 'theyve', 'theyll', 'it', 'its', 'most', 'more', 'likely', 'usually',
  'always', 'often', 'ever', 'never', 'normally', 'typically', 'probably', 'really', 'very', 'just',
  'only', 'every', 'each', 'all', 'any', 'some', 'one', 'ones', 'thing', 'things', 'something', 'someone',
  'somewhere', 'kind', 'sort', 'type', 'favourite', 'favorite', 'go', 'goto', 'best', 'top', 'pick',
  'picks', 'choose', 'chose', 'chosen', 'choice', 'prefer', 'like', 'likes', 'love', 'loves', 'enjoy',
  'enjoys', 'get', 'gets', 'got', 'have', 'has', 'had', 'know', 'known', 'think', 'guess', 'name',
  'retire', 'retired', 'retirement', 'retiree', 'now', 'still', 'again', 'time', 'day', 'days', 'much',
  'many', 'way', 'place', 'places', 'spot', 'finally', 'little', 'perfect', 'ideal', 'special', 'look',
  'looks', 'completely', 'exactly', 'totally',
]
export const WKB_PHRASES: Readonly<Record<string, string>> = {
  'go-to': '', 'go to': '', 'hot chocolate': 'drink', 'ice cream': 'icecream', 'day off': 'dayoff',
  'days off': 'dayoff', 'free day': 'dayoff', 'road trip': 'journey', 'long drive': 'journey',
  'karaoke': 'sing', 'dance floor': 'dance', 'desert island': 'island', 'time machine': 'timetravel',
  'grew up': 'childhood', 'grow up': 'childhood', 'as a child': 'childhood', 'as a kid': 'childhood',
  'younger days': 'childhood', 'at school': 'school', 'alarm clock': 'alarm', 'to-do list': 'todo',
  'to do list': 'todo', 'good at': 'skill', 'get-together': 'party', 'get together': 'party',
}
export const WKB_SYNONYMS: Readonly<Record<string, string>> = {
  'coffee': 'drink', 'tea': 'drink', 'cuppa': 'drink', 'latte': 'drink', 'espresso': 'drink',
  'cappuccino': 'drink', 'cocoa': 'drink', 'beverage': 'drink', 'drinks': 'drink', 'brew': 'drink',
  'snacks': 'snack', 'treat': 'snack', 'treats': 'snack', 'sweet': 'snack', 'sweets': 'snack',
  'biscuit': 'snack', 'biscuits': 'snack', 'cookie': 'snack', 'cookies': 'snack', 'chocolate': 'snack',
  'chocolates': 'snack', 'candy': 'snack', 'crisps': 'snack', 'chips': 'snack', 'nibble': 'snack',
  'lunch': 'meal', 'lunches': 'meal', 'dinner': 'meal', 'supper': 'meal', 'breakfast': 'meal',
  'meals': 'meal', 'dish': 'meal', 'dishes': 'meal', 'food': 'meal', 'foods': 'meal', 'sandwich': 'meal',
  'holiday': 'travel', 'holidays': 'travel', 'vacation': 'travel', 'vacations': 'travel',
  'trip': 'travel', 'trips': 'travel', 'destination': 'travel', 'getaway': 'travel', 'journey': 'travel',
  'journeys': 'travel', 'visit': 'travel', 'abroad': 'travel', 'job': 'work', 'jobs': 'work',
  'career': 'work', 'occupation': 'work', 'profession': 'work', 'employer': 'work', 'working': 'work',
  'worked': 'work', 'office': 'work', 'workplace': 'work', 'song': 'music', 'songs': 'music',
  'tune': 'music', 'tunes': 'music', 'band': 'music', 'album': 'music', 'singer': 'music',
  'sing': 'music', 'movie': 'film', 'movies': 'film', 'films': 'film', 'cinema': 'film', 'tv': 'show',
  'television': 'show', 'series': 'show', 'programme': 'show', 'program': 'show', 'novel': 'book',
  'novels': 'book', 'books': 'book', 'read': 'book', 'reading': 'book', 'hobbies': 'hobby',
  'pastime': 'hobby', 'pastimes': 'hobby', 'saying': 'say', 'sayings': 'say', 'says': 'say',
  'said': 'say', 'phrase': 'say', 'expression': 'say', 'motto': 'say', 'catchphrase': 'say',
  'arrive': 'arrive', 'arrived': 'arrive', 'arrives': 'arrive', 'arrival': 'arrive', 'desk': 'desk',
  'workspace': 'desk', 'cubicle': 'desk', 'mug': 'mug', 'cup': 'mug', 'saturday': 'weekend',
  'sunday': 'weekend', 'weekends': 'weekend', 'morning': 'morning', 'mornings': 'morning',
  'wake': 'morning', 'woke': 'morning', 'party': 'party', 'parties': 'party', 'celebrate': 'party',
  'celebration': 'party', 'gathering': 'party', 'gift': 'gift', 'gifts': 'gift', 'present': 'gift',
  'presents': 'gift', 'laugh': 'laugh', 'laughs': 'laugh', 'funny': 'laugh', 'giggle': 'laugh',
  'talent': 'skill', 'talents': 'skill', 'skill': 'skill', 'skills': 'skill', 'paid': 'pay',
  'pays': 'pay', 'earn': 'pay', 'earned': 'pay', 'earning': 'pay',
}
export const WKB_BLOCKED_TERMS: readonly string[] = [
  'age', 'aged', 'ageing', 'aging', 'how old', 'older', 'oldest', 'elderly', 'senior citizen', 'old age',
  'born', 'birth', 'birth year', 'years old', 'getting on', 'over the hill', 'senior moment', 'health',
  'healthy', 'unhealthy', 'illness', 'ill', 'sick', 'sickness', 'disease', 'doctor', 'dentist', 'nurse',
  'hospital', 'surgery', 'operation', 'medication', 'medicine', 'pill', 'pills', 'diagnosis', 'injury',
  'injured', 'pain', 'aches', 'arthritis', 'cancer', 'dementia', 'alzheimer', 'memory loss', 'forget',
  'forgets', 'forgot', 'forgotten', 'forgetful', 'forgetting', 'hearing aid', 'reading glasses',
  'wheelchair', 'walking stick', 'disability', 'disabled', 'therapy', 'therapist', 'anxiety',
  'depression', 'stress', 'stressed', 'weight', 'weigh', 'weighs', 'diet', 'dieting', 'calories', 'fat',
  'overweight', 'skinny', 'wrinkles', 'grey hair', 'gray hair', 'bald', 'salary', 'salaries', 'wage',
  'wages', 'pay rise', 'pay raise', 'paycheck', 'paycheque', 'bonus', 'income', 'money', 'debt', 'debts',
  'loan', 'loans', 'mortgage', 'pension', 'savings', 'invest', 'investment', 'investments', 'broke',
  'afford', 'bankrupt', 'rich', 'wealthy', 'poor', 'net worth', 'budget', 'politics', 'political',
  'politician', 'vote', 'voted', 'voting', 'election', 'government', 'protest', 'religion', 'religious',
  'church', 'prayer', 'pray', 'god', 'faith', 'bible', 'sex', 'sexy', 'crush', 'flirt', 'flirting',
  'kiss', 'kissed', 'romance', 'romantic', 'dating', 'first date', 'divorce', 'divorced', 'ex', 'affair',
  'breakup', 'break up', 'argument', 'argue', 'argued', 'fight', 'fought', 'feud', 'grudge',
  'family drama', 'death', 'dead', 'die', 'died', 'dying', 'funeral', 'grave', 'widow', 'widower',
  'embarrassing', 'embarrassed', 'embarrass', 'humiliating', 'awkward', 'worst', 'mistake', 'mistakes',
  'blunder', 'regret', 'regrets', 'secret', 'secrets', 'confess', 'confession', 'scandal', 'gossip',
  'lie', 'lied', 'lying', 'fired', 'sacked', 'laid off', 'layoff', 'redundancy', 'redundant',
  'disciplinary', 'complaint', 'complaints', 'lawsuit', 'performance review', 'quit', 'resign',
  'resigned', 'hate', 'hates', 'hated', 'annoying', 'lazy', 'grumpy', 'stupid', 'idiot', 'ugly', 'weird',
  'crazy', 'useless', 'boring', 'drunk', 'hangover', 'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'gin',
  'rum', 'cocktail', 'cocktails', 'booze', 'alcohol', 'brewery', 'pub', 'gamble', 'gambling', 'casino',
  'lottery', 'bet', 'betting', 'gun', 'guns', 'weapon', 'war', 'police', 'arrested', 'illegal', 'address',
  'street', 'postcode', 'zip code', 'maiden name', 'first pet', 'pets name', 'password', 'passwords',
  'pin', 'bank', 'account', 'phone number', 'licence plate', 'license plate', 'number plate',
  'social security', 'passport', 'hometown', 'spouse', 'husband', 'wife', 'partner', 'boyfriend',
  'girlfriend', 'married', 'marriage', 'wedding', 'their kids', 'their children', 'son', 'sons',
  'daughter', 'daughters', 'grandchild', 'grandchildren', 'grandkid', 'grandkids', 'grandson',
  'granddaughter', 'in-laws', 'in-law', 'mother-in-law', 'father-in-law', 'quote', 'quotes', 'lyric',
  'lyrics', 'celebrity', 'celebrities', 'crypto', 'bitcoin',
]
export const WKB_TOPICS: Readonly<Record<string, WkbTopic>> = {
  'career-path': { group: 'career', audiences: { mixed: 2, work: 3, family: 2 } },
  'workday': { group: 'office', audiences: { mixed: 1, work: 3, family: 0 } },
  'legacy': { group: 'office', audiences: { mixed: 1, work: 3, family: 0 } },
  'desk': { group: 'office', audiences: { mixed: 0, work: 2, family: 0 } },
  'food': { group: 'food', audiences: { mixed: 2, work: 2, family: 2 } },
  'drinks-snacks': { group: 'food', audiences: { mixed: 2, work: 2, family: 2 } },
  'hobbies': { group: 'leisure', audiences: { mixed: 2, work: 2, family: 2 } },
  'entertainment': { group: 'leisure', audiences: { mixed: 2, work: 1, family: 2 } },
  'travel': { group: 'travel', audiences: { mixed: 2, work: 2, family: 2 } },
  'personality': { group: 'personality', audiences: { mixed: 2, work: 2, family: 2 } },
  'social': { group: 'personality', audiences: { mixed: 2, work: 2, family: 2 } },
  'everyday': { group: 'home', audiences: { mixed: 2, work: 1, family: 3 } },
  'early-years': { group: 'past', audiences: { mixed: 2, work: 1, family: 2 } },
  'retirement-plans': { group: 'future', audiences: { mixed: 3, work: 3, family: 3 } },
  'what-ifs': { group: 'future', audiences: { mixed: 2, work: 2, family: 2 } },
  'talents': { group: 'personality', audiences: { mixed: 2, work: 2, family: 2 } },
  'little-pleasures': { group: 'leisure', audiences: { mixed: 2, work: 1, family: 2 } },
}
export const WKB_GROUP_MAX: Readonly<Record<string, number>> = {
  career: 2, office: 3, food: 2, leisure: 3, travel: 2, personality: 3, home: 2, past: 2, future: 3,
}
export const WKB_SHAPES: readonly string[] = ['past', 'habit', 'choice', 'number', 'prediction', 'known-for', 'top-pick']

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = termPattern([...WKB_BLOCKED_TERMS, ...BL_BRAND_TERMS])
const SAYING_RE = termPattern(WKB_SAYING_TERMS)
const PHRASE_PATTERNS: readonly (readonly [RegExp, string])[] = Object.entries(WKB_PHRASES)
  .sort(([a], [b]) => b.length - a.length)
  .map(([phrase, replacement]) => [new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'g'), replacement])
const QUALIFIERS = new Set([...WKB_QUALIFIER_WORDS, ...WKB_QUALIFIER_WORDS.map(stem)])
const SYNONYMS = new Map(Object.entries(WKB_SYNONYMS))
const RETIREE = new Set(WKB_RETIREE_WORDS)
const READER = new Set(WKB_READER_WORDS)
const GENDERED = new Set(WKB_GENDERED_WORDS)

const NUMBER_RE = /^\s*(q(uestion)?\s*\d+\s*[.):-]?\s+|\(?\d{1,2}\s*[.):]\s+|[-*•]\s+)/i
/** Letters (any script), digits, spaces and light punctuation: no quotation marks, no slash. */
const ALLOWED_RE = /^[\p{L}\p{N}][\p{L}\p{N} ,'’\-–:?]*$/u
/** A second sentence hiding before the question. */
const SENTENCE_BREAK_RE = /[.!;]/
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const WORD_RE = /[\p{L}\p{N}]+/gu
const FAVOURITE_RE = /\bfavou?rites?\b/i

function fold(text: string): string {
  let folded = text.toLowerCase().replace(/’/g, "'")
  for (const [pattern, replacement] of PHRASE_PATTERNS) folded = folded.replace(pattern, replacement)
  return folded.replace(/'s\s/g, ' ').replace(/'/g, '')
}

/** Lower-case words with apostrophes closed up: THEY'D → theyd. */
function plainWords(text: string): string[] {
  return text.toLowerCase().replace(/’/g, "'").replace(/'/g, '').match(WORD_RE) ?? []
}

/** The detail a question asks about: question words and padding gone, synonyms folded. Mirrors `question_tokens`. */
export function questionTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of fold(text).match(WORD_RE) ?? []) {
    if (QUALIFIERS.has(word)) continue
    const canon = stem(SYNONYMS.get(word) || SYNONYMS.get(stem(word)) || word)
    if (QUALIFIERS.has(canon)) continue
    out.add(canon)
  }
  return out
}

export const questionKey = (text: string, concept = ''): IdeaKey => ({
  text: text.replace(/\s+/g, ' ').trim().toLowerCase(),
  tokens: questionTokens(text),
  concept: concept ? questionTokens(concept) : new Set(),
})

/** True when a player would call two questions the same question. Mirrors `questions_repeat`. */
export const questionsRepeat = (first: string, second: string) =>
  keysRepeat(questionKey(first), questionKey(second))

export function isUnsafeWkbCopy(text: string): boolean {
  const plain = text.replace(/’/g, "'").replace(/'/g, '')
  return isUnsafeCopy(text) || BLOCKED_RE.test(plain)
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

function mostlyLowercase(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  const upper = text.match(/\p{Lu}/gu) ?? []
  return letters.length > 0 && upper.length <= letters.length * 0.3
}

/**
 * One question as printed — "What was the very first job they were paid
 * for?" — or null. Mirrors `normalize_question`: one sentence ending in a
 * single question mark, about the retiree as they/their/them, never the
 * player or a gendered pronoun, kind and private, with a concrete detail left
 * once the question words are gone.
 */
export function normalizeQuestion(raw: unknown, budget: number = MAX_QUESTION_CHARS): string | null {
  const text = clean(raw).replace(NUMBER_RE, '').replace(EDGE_QUOTES_RE, '').trim()
  if (!text || !text.endsWith('?') || text.split('?').length !== 2) return null
  if (!ALLOWED_RE.test(text) || !/^\p{Lu}/u.test(text)) return null
  if (SENTENCE_BREAK_RE.test(text.slice(0, -1)) || !mostlyLowercase(text)) return null
  const words = text.split(' ').filter(Boolean).length
  if (words < WKB_LIMITS.minQuestionWords || words > WKB_LIMITS.maxQuestionWords) return null
  if (text.length < WKB_LIMITS.minQuestionChars || text.length > budget) return null
  const plain = plainWords(text)
  if (!plain.some((word) => RETIREE.has(word))) return null
  if (plain.some((word) => READER.has(word) || GENDERED.has(word))) return null
  if (isUnsafeWkbCopy(text)) return null
  // Only question words left: "What do they enjoy?" asks nothing in particular.
  if (questionTokens(text).size === 0) return null
  return text
}

/** The least room an answer needs: a saying or a story never fits on a short line. Mirrors `answer_floor`. */
export const answerFloor = (question: string): WhoKnowsBestAnswer =>
  SAYING_RE.test(question) ? 'sentence' : 'word'

/** The room an answer needs, never less than the question's floor — or null. Mirrors `normalize_answer`. */
export function normalizeAnswer(raw: unknown, question: string): WhoKnowsBestAnswer | null {
  const size = clean(raw).toLowerCase() as WhoKnowsBestAnswer
  if (!WKB_ANSWERS.includes(size)) return null
  const floor = answerFloor(question)
  return WKB_ANSWERS.indexOf(size) >= WKB_ANSWERS.indexOf(floor) ? size : floor
}

export function normalizeConcept(raw: unknown): string {
  return clean(raw).toLowerCase().slice(0, WKB_LIMITS.maxConceptChars).trim()
}

const isTopic = (key: string) => Object.prototype.hasOwnProperty.call(WKB_TOPICS, key)
export const groupOf = (topic: string) => WKB_TOPICS[topic]?.group ?? ''

/** One validated question. */
export interface WkbQuestion {
  question: string
  topic: string
  shape: string
  answer: WhoKnowsBestAnswer
  concept: string
}

/** One complete question from raw service output — or null, never a repair. */
export function normalizeWkbItem(raw: unknown, budget: number = MAX_QUESTION_CHARS): WkbQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const topic = String(record.topic ?? '').trim()
  const shape = String(record.shape ?? '').trim()
  if (!isTopic(topic) || !WKB_SHAPES.includes(shape)) return null
  const question = normalizeQuestion(record.question, budget)
  if (!question) return null
  const answer = normalizeAnswer(record.answer, question)
  if (!answer) return null
  return { question, topic, shape, answer, concept: normalizeConcept(record.concept) }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseWkbPayload(remote: unknown): readonly unknown[] {
  if (!remote || typeof remote !== 'object') return []
  const questions = (remote as Partial<WhoKnowsBestResponse>).questions
  return Array.isArray(questions) ? questions : []
}

export const wkbKey = (q: Pick<WkbQuestion, 'question' | 'concept'>) => questionKey(q.question, q.concept)

/**
 * Normalize → gate → drop repeats, in the service's order, spares included.
 *
 * Repeats are caught across the whole pool and against `avoid` — questions
 * this seller's book already prints — so a reply that ignores the prompt's
 * avoid list still cannot repeat them. `keep` is an earlier pool a top-up
 * adds to.
 */
export function cleanWkbPool(
  raw: unknown,
  options: { avoid?: readonly string[]; keep?: readonly WkbQuestion[] } = {},
): WkbQuestion[] {
  const { avoid = [], keep = [] } = options
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => questionKey(label))
  const out = [...keep]
  const kept: IdeaKey[] = keep.map(wkbKey)
  for (const item of Array.isArray(raw) ? raw : []) {
    const question = normalizeWkbItem(item)
    if (!question) continue
    const key = wkbKey(question)
    if (kept.some((other) => keysRepeat(key, other))) continue
    if (avoided.some((other) => keysRepeat(key, other))) continue
    out.push(question)
    kept.push(key)
  }
  return out
}

const CONTRACTIONS: Readonly<Record<string, string>> = {
  whats: 'what is',
  wheres: 'where is',
  whos: 'who is',
  hows: 'how is',
  whens: 'when is',
}

/** "What is", "Which would", "If they": how a question opens, contractions spelled out. */
export function openingOf(question: string): string {
  const words = plainWords(question).flatMap((word) => (CONTRACTIONS[word] ?? word).split(' '))
  return words.slice(0, 2).join(' ')
}

export const isFavourite = (question: string) => FAVOURITE_RE.test(question)
export const isFuture = (q: Pick<WkbQuestion, 'topic'>) => groupOf(q.topic) === WKB_FUTURE_GROUP

function sharesDetail(a: IdeaKey, b: IdeaKey): boolean {
  for (const token of a.tokens) if (b.tokens.has(token)) return true
  return false
}

/**
 * Why `candidate` may not join `set`, or null when it may — every rule a
 * set keeps as a whole. `topicCap` lets the picker prefer one question per
 * topic before it allows a second.
 */
export function setConflict(
  set: readonly WkbQuestion[],
  candidate: WkbQuestion,
  topicCap: number = WKB_LIMITS.topicMax,
): string | null {
  const sameTopic = set.filter((q) => q.topic === candidate.topic)
  if (sameTopic.length >= topicCap) return 'topic'
  const group = groupOf(candidate.topic)
  if (set.filter((q) => groupOf(q.topic) === group).length >= (WKB_GROUP_MAX[group] ?? 0)) return 'group'
  if (set.filter((q) => q.shape === candidate.shape).length >= WKB_LIMITS.shapeMax) return 'shape'
  if (isFavourite(candidate.question) && set.filter((q) => isFavourite(q.question)).length >= WKB_LIMITS.favouriteMax) {
    return 'favourite'
  }
  const opening = openingOf(candidate.question)
  if (set.filter((q) => openingOf(q.question) === opening).length >= WKB_LIMITS.openingMax) return 'opening'
  const key = wkbKey(candidate)
  if (set.some((q) => keysRepeat(key, wkbKey(q)))) return 'repeat'
  // Two questions on one topic ask about two different details, never the same one twice.
  if (sameTopic.some((q) => sharesDetail(key, wkbKey(q)))) return 'detail'
  return null
}

export interface WkbSetPick {
  /** Exactly twelve questions, in pool order — or null when the pool cannot make a set. */
  picks: WkbQuestion[] | null
  /** What was taken, whole set or not: what a top-up is measured against. */
  taken: WkbQuestion[]
}

/**
 * The set's twelve questions, balanced — or null.
 *
 * A question about the future goes in first (the service plans retirement
 * plans first). Then every topic gets one question, in the service's order,
 * passing over any that would break a set rule or does not fit its block on
 * the page; only then may a topic give a second question on another detail.
 * Never pads with anything that failed a gate, and never prints a set drawn
 * from too few topics.
 */
export function pickWkbSet(
  pool: readonly WkbQuestion[],
  fits: (question: string) => boolean = () => true,
): WkbSetPick {
  const taken: WkbQuestion[] = []
  const tryTake = (q: WkbQuestion, cap: number) => {
    if (taken.length >= WKB_QUESTIONS || taken.includes(q) || !fits(q.question)) return
    if (setConflict(taken, q, cap) === null) taken.push(q)
  }
  const anchor = pool.find((q) => isFuture(q) && fits(q.question))
  if (anchor) tryTake(anchor, 1)
  for (const cap of [1, WKB_LIMITS.topicMax]) for (const q of pool) tryTake(q, cap)

  const topics = new Set(taken.map((q) => q.topic))
  const whole =
    taken.length === WKB_QUESTIONS && topics.size >= WKB_LIMITS.minTopics && taken.some(isFuture)
  return { picks: whole ? taken : null, taken }
}

/** Topics a set may draw on, most weighted first. */
export function wkbEligibleTopics(audience: WhoKnowsBestAudience): string[] {
  return Object.entries(WKB_TOPICS)
    .filter(([, topic]) => topic.audiences[audience] > 0)
    .sort(([, a], [, b]) => b.audiences[audience] - a.audiences[audience])
    .map(([key]) => key)
}

/**
 * What a top-up asks for when a pool cannot make a set: topics the set does
 * not use yet (the future ones first when it has none), and enough questions
 * to fill it with spares for the gates.
 */
export function wkbShortfall(
  taken: readonly WkbQuestion[],
  audience: WhoKnowsBestAudience,
): { topics: string[]; count: number } {
  const used = new Set(taken.map((q) => q.topic))
  const eligible = wkbEligibleTopics(audience)
  let topics = eligible.filter((key) => !used.has(key))
  if (!taken.some(isFuture)) {
    topics = [...topics.filter((key) => groupOf(key) === WKB_FUTURE_GROUP), ...topics.filter((key) => groupOf(key) !== WKB_FUTURE_GROUP)]
  }
  if (topics.length === 0) topics = eligible
  const need = Math.max(2, WKB_QUESTIONS - taken.length)
  return { topics, count: Math.min(WKB_LIMITS.maxAsk, need + 4) }
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return 0
}

/**
 * The picks in reading order, by seed.
 *
 * A retirement-plans question closes the set (any future one if there is
 * none): a warm last word. The rest are placed one at a time: the opener is a
 * quick one rather than a two-line answer, and no question follows one from
 * the same group of topics (the closer included), with the same opening
 * words or in the same shape where anything else is left. Ties break in a seeded order, so every set
 * reads differently.
 */
export function orderWkbSet(picks: readonly WkbQuestion[], seed: number): WkbQuestion[] {
  const rng = createRng((seed ^ WKB_SALT) >>> 0)
  const remaining = rng.shuffle([...picks])
  let closerAt = remaining.findIndex((q) => q.topic === WKB_ANCHOR_TOPIC)
  if (closerAt === -1) closerAt = remaining.findIndex(isFuture)
  const closer = closerAt === -1 ? null : remaining.splice(closerAt, 1)[0]!
  const out: WkbQuestion[] = []

  while (remaining.length > 0) {
    const prev = out.at(-1)
    let best = 0
    let bestScore: number[] = []
    remaining.forEach((q, index) => {
      const score = [
        out.length === 0 && q.answer === 'sentence' ? 1 : 0,
        prev && groupOf(prev.topic) === groupOf(q.topic) ? 1 : 0,
        // With two left, place now the one that would sit beside the closer.
        closer && remaining.length === 2 && groupOf(remaining[1 - index]!.topic) === groupOf(closer.topic) ? 1 : 0,
        prev && openingOf(prev.question) === openingOf(q.question) ? 1 : 0,
        prev && prev.shape === q.shape ? 1 : 0,
        index,
      ]
      if (index === 0 || compareScores(score, bestScore) < 0) {
        best = index
        bestScore = score
      }
    })
    out.push(remaining.splice(best, 1)[0]!)
  }
  if (closer) out.push(closer)
  return out
}

/** One question as the sheets print it. */
export interface WkbNumbered extends WkbQuestion {
  /** 1 to 12, on every sheet. */
  number: number
}

export const numberWkbSet = (ordered: readonly WkbQuestion[]): WkbNumbered[] =>
  ordered.map((q, index) => ({ ...q, number: index + 1 }))

/**
 * Why a set may not print, or null when it may — the preflight's last word on
 * content that has already been picked and ordered. Checks the set as a
 * player meets it: twelve questions numbered in order, each printable, sized
 * for its answer and distinct in meaning, and every set rule held.
 */
export function wkbSetProblem(questions: readonly WkbNumbered[]): string | null {
  if (questions.length !== WKB_QUESTIONS) {
    return `The set holds ${questions.length} questions instead of ${WKB_QUESTIONS}.`
  }
  if (questions.some((q, i) => q.number !== i + 1)) return 'The questions are not numbered 1 to 12 in order.'
  for (const q of questions) {
    if (normalizeQuestion(q.question) !== q.question) {
      return `Question ${q.number} is not suitable for a published activity book.`
    }
    if (!isTopic(q.topic) || normalizeAnswer(q.answer, q.question) !== q.answer) {
      return `Question ${q.number} has no room planned for its answer.`
    }
  }
  for (let i = 1; i < questions.length; i++) {
    const conflict = setConflict(questions.slice(0, i), questions[i]!)
    if (conflict === 'repeat' || conflict === 'detail') {
      return `Question ${i + 1} asks about the same thing as an earlier question.`
    }
    if (conflict) return 'The questions need more variety.'
  }
  if (new Set(questions.map((q) => q.topic)).size < WKB_LIMITS.minTopics) return 'The questions need more variety.'
  if (!questions.some(isFuture)) return 'The set needs a question about retirement plans.'
  return null
}

/** Every question in a pool, in the service's order. */
export const wkbQuestions = (pool: readonly WkbQuestion[]): string[] => pool.map((q) => q.question)
