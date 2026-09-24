import type {
  FillInFunniesResponse,
  FillInFunniesStoryPayload,
} from '@/types/studio-fill-in-funnies.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one Fill-in Funnies story is, and every rule it must pass to print.
 *
 * A story is a title and a few short paragraphs with numbered blanks —
 * `[1]`, `[2]` … in order of first appearance — and one kind of word per
 * number ("Describing word", "Coworker’s name"). The reader writes a word for
 * each number on the first page without seeing the story, then copies them
 * into the blanks on the second.
 *
 * These gates mirror `backend/app/services/studio_fill_in_funnies_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole story whose every blank maps
 * to a prompt reaches the editor. A story is never repaired: rewriting one
 * would print something nobody checked.
 */

export const FIF_TEMPLATE_KEY = 'fill-in-funnies'
export const FIF_DEFAULT_TITLE = 'Fill-in Funnies'

/**
 * What the page asks the service for. Ten prompts is what a 5 x 8 word list
 * holds in large print, and a hundred words is what a 6 x 9 story page holds
 * on one side with room to write in every blank.
 */
export const FIF_MIN_BLANKS = 8
export const FIF_MAX_BLANKS = 10
export const FIF_MAX_WORDS = 100

/** Mirrors `limits` in backend/app/data/studio/fill-in-funnies/prompt.json. */
export const FIF_LIMITS = {
  minWords: 60,
  minParagraphs: 2,
  maxParagraphs: 5,
  maxParagraphWords: 60,
  maxSentenceWords: 30,
  maxTitleChars: 40,
  maxTitleWords: 7,
  maxKindRepeats: 3,
  minDistinctKinds: 6,
  maxNameBlanks: 2,
  maxCallbacks: 2,
} as const

/** Server and browser label cap (`AVOID_MAX_CHARS`, `AVOID_LABEL_CHARS`). */
const COMPACT_LABEL_CHARS = 60
/** Whole-story overlap past which two stories are one with the nouns swapped. */
const STORY_REPEAT_JACCARD = 0.45
const LABEL_REPEAT_JACCARD = 0.5
const OPENING_TOKENS = 6
const OPENING_SHARED = 4
/** Separates the compact label from the story text in a book label. */
const BOOK_LABEL_SEPARATOR = ' | '

/**
 * Keeps this game's rotating theme out of step with the other games'.
 * A book run hands a spread one seed; without a salt, facing pages would share
 * a theme.
 */
export const FIF_THEME_SALT = 0x66696630

export const FIF_AI_EMPTY_MESSAGE =
  'Could not write a fresh Fill-in Funnies story for this theme. Try again, or pick a broader theme.'
export const FIF_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Fill-in Funnies activity. Pick a larger page in Settings.'
export const FIF_BUILD_FAILED_MESSAGE = 'Could not fit this story on the page. Try again.'

/** Header how-to lines, one per step. Short, so a 5 x 8 page keeps its rows. */
export const FIF_WORDS_INSTRUCTION = 'No peeking! Write a word for each prompt, then turn the page.'
export const FIF_STORY_INSTRUCTION =
  'Copy each word onto the blank with the same number, then read it aloud!'

/** Printed on the word list, exactly as the service describes them to the writer. */
export const FIF_BLANK_KINDS = {
  noun: { label: 'Noun', hint: 'a thing, like “teapot”' },
  plural_noun: { label: 'Plural noun', hint: 'like “socks”' },
  verb: { label: 'Verb', hint: 'an action, like “wiggle”' },
  verb_ing: { label: 'Verb ending in -ing', hint: 'like “juggling”' },
  verb_past: { label: 'Past-tense verb', hint: 'like “tiptoed”' },
  adjective: { label: 'Describing word', hint: 'like “fluffy”' },
  adverb: { label: 'Word ending in -ly', hint: 'like “loudly”' },
  place: { label: 'Place', hint: 'like “Paris” or “the beach”' },
  food: { label: 'Food', hint: 'like “meatloaf”' },
  animal: { label: 'Animal', hint: 'like “llama”' },
  household_item: { label: 'Household object', hint: 'like “toaster”' },
  clothing: { label: 'Item of clothing', hint: 'like “bow tie”' },
  vehicle: { label: 'Vehicle', hint: 'like “tractor”' },
  job: { label: 'Job title', hint: 'like “plumber”' },
  hobby: { label: 'Hobby', hint: 'like “knitting”' },
  coworker_name: { label: 'Coworker’s name', hint: 'real or made up' },
  friend_name: { label: 'Friend’s name', hint: 'real or made up' },
  number: { label: 'Number', hint: 'like “47”' },
  sound: { label: 'Silly sound', hint: 'like “kaboom”' },
  exclamation: { label: 'Exclamation', hint: 'like “Yippee”' },
  silly_word: { label: 'Silly word', hint: 'make one up!' },
} as const

export type FifKind = keyof typeof FIF_BLANK_KINDS
export const FIF_KINDS = Object.keys(FIF_BLANK_KINDS) as FifKind[]

/** Mirrors `nameKinds`, `noArticleKinds`, `articleWords`, `determinerWords`. */
export const FIF_NAME_KINDS: readonly FifKind[] = ['coworker_name', 'friend_name']
export const FIF_NO_ARTICLE_KINDS: readonly FifKind[] = ['place', 'coworker_name', 'friend_name']
export const FIF_ARTICLE_WORDS = ['a', 'an'] as const
export const FIF_DETERMINER_WORDS = [
  'a', 'an', 'the', 'my', 'our', 'your', 'his', 'her', 'their', 'this', 'that', 'some',
] as const

/*
 * Topics a friendly retirement book stays away from. Mirrors `blockedTerms`
 * and `brandTerms` in backend/app/data/studio/fill-in-funnies/prompt.json.
 */
export const FIF_BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dying', 'died', 'funeral', 'grave', 'cemetery', 'widow', 'widower', 'will and testament',
  'illness', 'ill', 'sick', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke', 'surgery',
  'hospital', 'doctor', 'nurse', 'nursing home', 'care home', 'retirement home', 'medication', 'medicine',
  'pills', 'diagnosis', 'arthritis', 'pain', 'aches', 'hip replacement', 'knee replacement',
  'wheelchair', 'walking stick', 'disabled', 'disability', 'blind', 'deaf', 'hearing aid', 'dentures',
  'incontinence', 'bladder', 'diet', 'weight loss', 'overweight', 'fat', 'wrinkles', 'grey hair',
  'memory loss', 'forget', 'forgot', 'forgotten', 'forgetful', 'forgetting', 'senior moment', 'over the hill', 'old fogey',
  'elderly', 'geriatric', 'senior citizen', 'old age', 'old man', 'old woman', 'old lady', 'grumpy',
  'lonely', 'loneliness', 'alone forever', 'nobody visits', 'bored to death', 'lazy', 'useless', 'boring old',
  'debt', 'broke', 'bankrupt', 'poverty', 'poor', 'bills', 'pay off', 'paying off', 'mortgage', 'loan', 'taxes',
  "can't afford", 'cannot afford', 'pension', 'savings',
  'divorce', 'ex-wife', 'ex-husband', 'affair',
  'election', 'political', 'politics', 'democrat', 'republican', 'president', 'government',
  'religion', 'church', 'prayer', 'god', 'heaven', 'hell',
  'drunk', 'hangover', 'beer', 'wine', 'vodka', 'whiskey', 'cocktail', 'booze', 'alcohol',
  'gamble', 'gambling', 'casino', 'lottery', 'bet', 'betting',
  'gun', 'weapon', 'war', 'fight', 'kill', 'violence', 'sex', 'sexy', 'naked', 'nude',
  'stupid', 'idiot', 'hate', 'ugly', 'crazy', 'damn',
  'toilet', 'fart', 'burp', 'underwear', 'butt', 'poop', 'pee', 'vomit', 'sweat',
  'police', 'arrested', 'illegal', 'speeding ticket',
] as const

export const FIF_BRAND_TERMS = [
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'amazon',
  'iphone', 'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola',
  'lego', 'barbie', 'harry potter', 'star wars', 'star trek', 'taylor swift', 'elvis', 'beatles',
  'rolex', 'ferrari', 'harley', 'nintendo', 'playstation', 'xbox', 'costco', 'ikea', 'uber', 'airbnb',
  'zoom', 'facetime', 'whatsapp', 'kindle', 'wordle', 'mad libs', 'madlibs',
] as const

/** Mirrors `qualifierWords`: dropped before two stories are compared. */
export const FIF_QUALIFIER_WORDS = [
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'you', 'yourself', 'i', 'we', 'me', 'it',
  'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'from', 'about', 'by', 'into', 'onto', 'up', 'out',
  'too', 'so', 'very', 'really', 'whole', 'entire', 'full', 'just', 'only', 'every', 'each', 'all',
  'that', 'this', 'those', 'these', 'some', 'any', 'one', 'own', 'new', 'favourite', 'favorite',
  'was', 'were', 'is', 'are', 'be', 'been', 'had', 'has', 'have', 'then', 'than', 'but', 'as', 'when', 'what',
] as const

const QUALIFIERS = new Set<string>(FIF_QUALIFIER_WORDS)
const ARTICLES = new Set<string>(FIF_ARTICLE_WORDS)
const DETERMINERS = new Set<string>(FIF_DETERMINER_WORDS)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BLOCKED_RE = new RegExp(
  `\\b(${[...FIF_BLOCKED_TERMS, ...FIF_BRAND_TERMS].map(escapeRegExp).join('|')})\\b`,
  'i',
)
/** A placeholder: `[1]` … `[99]`. Global — reset `lastIndex` or use matchAll. */
export const PLACEHOLDER_RE = /\[(\d{1,2})\]/g
const STORY_ALLOWED_RE = /^[A-Za-z0-9 ,.!?'’‘"“”\-–—:;()&[\]…]+$/
const TITLE_ALLOWED_RE = /^[A-Za-z0-9 ,.!?'’‘\-–—:&]+$/
const PARAGRAPH_END_RE = /[.!?…]["”’')]*$/
const SENTENCE_SPLIT_RE = /(?<=[.!?…])["”’')]*\s+/
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const WORD_EDGE_RE = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g
const CLAUSE_END = new Set(['.', '!', '?', ':', ';', ',', '…', '"', '”', ')', '–', '—'])

/** One validated story. */
export interface FifStory {
  title: string
  paragraphs: string[]
  blanks: FifKind[]
  premise: string
  topic: string
}

export function isUnsafeFifCopy(text: string): boolean {
  return isUnsafeCopy(text) || BLOCKED_RE.test(text)
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1)
  return token
}

function rawTokens(text: string): string[] {
  const folded = text
    .replace(PLACEHOLDER_RE, ' ')
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/'s\s/g, ' ')
    .replace(/'/g, '')
  return folded.match(/[a-z0-9]+/g) ?? []
}

const contentWords = (text: string) => rawTokens(text).filter((w) => !QUALIFIERS.has(w)).map(stem)
const contentTokens = (text: string) => new Set(contentWords(text))

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((token) => b.has(token))

export const storyText = (story: Pick<FifStory, 'paragraphs'>) => story.paragraphs.join(' ')

/** A story tokenised once, so a book of hundreds is a flat pass per candidate. */
interface StoryKey {
  title: Set<string>
  body: Set<string>
  opening: Set<string>
  compact: Set<string>
}

function storyKey(title: string, text: string, compact: string): StoryKey {
  return {
    title: contentTokens(title),
    body: contentTokens(text),
    opening: new Set(contentWords(text).slice(0, OPENING_TOKENS)),
    compact: contentTokens(compact),
  }
}

function bodiesRepeat(a: StoryKey, b: StoryKey): boolean {
  if (a.title.size > 0 && sameSet(a.title, b.title)) return true
  if (jaccard(a.body, b.body) >= STORY_REPEAT_JACCARD) return true
  let shared = 0
  for (const token of a.opening) if (b.opening.has(token)) shared++
  return shared >= OPENING_SHARED
}

/**
 * Content words of the title and premise inside the 60-char label cap the
 * server and the browser memory both enforce. Mirrors `avoid_label`.
 */
export function compactStoryLabel(story: Pick<FifStory, 'title' | 'premise'>): string {
  let out = ''
  for (const word of rawTokens(`${story.title} ${story.premise}`).filter((w) => !QUALIFIERS.has(w))) {
    const candidate = out ? `${out} ${word}` : word
    if (candidate.length > COMPACT_LABEL_CHARS) break
    out = candidate
  }
  return out || story.title.slice(0, COMPACT_LABEL_CHARS)
}

/**
 * The label stamped on the page: compact label, then the story text with its
 * blanks folded out, so a later run can compare whole stories — not just
 * titles — against what the book already prints.
 */
export function bookStoryLabel(story: FifStory): string {
  const plain = storyText(story).replace(PLACEHOLDER_RE, '___')
  return `${compactStoryLabel(story)}${BOOK_LABEL_SEPARATOR}${story.title}${BOOK_LABEL_SEPARATOR}${plain}`
}

function keyOf(story: FifStory): StoryKey {
  return storyKey(story.title, storyText(story), compactStoryLabel(story))
}

function keyOfLabel(label: string): StoryKey | null {
  const parts = label.split(BOOK_LABEL_SEPARATOR)
  if (parts.length >= 3) {
    const [compact, title, ...rest] = parts
    return storyKey(title!, rest.join(BOOK_LABEL_SEPARATOR), compact!)
  }
  return null
}

/**
 * True when a reader would call the two stories the same activity: the same
 * title, most of the words shared (the same story with a few nouns swapped),
 * or the same opening ("On my first day of retirement" / "… second day …").
 */
export function storiesRepeat(first: FifStory, second: FifStory): boolean {
  return bodiesRepeat(keyOf(first), keyOf(second))
}

/**
 * True when a label someone already printed names this story. A book label
 * carries the whole story and compares like one; a compact label (browser or
 * server memory) compares on title and premise.
 */
export function storyRepeatsLabel(story: FifStory, label: string): boolean {
  const mine = keyOf(story)
  const theirs = keyOfLabel(label)
  if (theirs) return bodiesRepeat(mine, theirs)
  const compact = contentTokens(label)
  if (mine.compact.size === 0 || compact.size === 0) return false
  return jaccard(mine.compact, compact) >= LABEL_REPEAT_JACCARD
}

function clean(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

export function normalizeKind(raw: unknown): FifKind | null {
  const value = raw && typeof raw === 'object' ? (raw as { kind?: unknown }).kind : raw
  const kind = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return kind in FIF_BLANK_KINDS ? (kind as FifKind) : null
}

export function normalizeTitle(raw: unknown): string | null {
  const title = clean(raw).replace(EDGE_QUOTES_RE, '').replace(/[\s.:;]+$/, '')
  if (!title || !TITLE_ALLOWED_RE.test(title)) return null
  if (title.length < 3 || title.length > FIF_LIMITS.maxTitleChars) return null
  if (title.split(' ').length > FIF_LIMITS.maxTitleWords) return null
  const letters = title.match(/[A-Za-z]/g) ?? []
  if (letters.length === 0 || (letters.length > 4 && letters.every((ch) => ch === ch.toUpperCase()))) {
    return null
  }
  if (isUnsafeFifCopy(title)) return null
  return title
}

function mostlyLowercase(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = text.match(/[A-Z]/g) ?? []
  return letters.length > 0 && upper.length <= letters.length * 0.35
}

/** The word read straight into a placeholder, lowercased; '' at a boundary. */
function previousWord(paragraph: string, start: number): string {
  const before = paragraph.slice(0, start)
  if (!before || !/\s$/.test(before)) return ''
  const chunk = before.trim().split(/\s+/).at(-1) ?? ''
  if (!chunk || CLAUSE_END.has(chunk.at(-1)!)) return ''
  return chunk.replace(WORD_EDGE_RE, '').toLowerCase()
}

const isAlnum = (ch: string | undefined) => Boolean(ch && /[A-Za-z0-9]/.test(ch))

/**
 * Why a story may not print, or null when it may. Mirrors `story_problem`.
 */
export function fifStoryProblem(
  title: string,
  paragraphs: readonly string[],
  blanks: readonly FifKind[],
  budgets: { minBlanks: number; maxBlanks: number; maxWords: number } = {
    minBlanks: FIF_MIN_BLANKS,
    maxBlanks: FIF_MAX_BLANKS,
    maxWords: FIF_MAX_WORDS,
  },
): string | null {
  if (paragraphs.length < FIF_LIMITS.minParagraphs || paragraphs.length > FIF_LIMITS.maxParagraphs) {
    return 'paragraph count'
  }
  const count = blanks.length
  if (count < budgets.minBlanks || count > budgets.maxBlanks) return 'blank count'

  let seen = 0
  let callbacks = 0
  let words = 0
  for (const paragraph of paragraphs) {
    if (!paragraph || !STORY_ALLOWED_RE.test(paragraph)) return 'characters'
    if (!PARAGRAPH_END_RE.test(paragraph)) return 'paragraph ending'
    if (!mostlyLowercase(paragraph)) return 'shouting'
    const stripped = paragraph.replace(PLACEHOLDER_RE, '')
    if (stripped.includes('[') || stripped.includes(']') || paragraph.includes('][')) {
      return 'malformed placeholder'
    }
    const paragraphWords = paragraph.split(' ').filter(Boolean).length
    if (paragraphWords > FIF_LIMITS.maxParagraphWords) return 'paragraph length'
    words += paragraphWords
    for (const sentence of paragraph.split(SENTENCE_SPLIT_RE)) {
      if (sentence.split(' ').filter(Boolean).length > FIF_LIMITS.maxSentenceWords) {
        return 'sentence length'
      }
    }
    for (const match of paragraph.matchAll(PLACEHOLDER_RE)) {
      const number = Number(match[1])
      const start = match.index ?? 0
      const end = start + match[0].length
      if (number === seen + 1) seen = number
      else if (number >= 1 && number <= seen) callbacks++
      else return 'placeholder order'
      if (number > count) return 'placeholder without a kind'
      if (isAlnum(paragraph[start - 1]) || isAlnum(paragraph[end])) return 'malformed placeholder'
      const previous = previousWord(paragraph, start)
      if (ARTICLES.has(previous)) return 'article before a blank'
      if (FIF_NO_ARTICLE_KINDS.includes(blanks[number - 1]!) && DETERMINERS.has(previous)) {
        return 'article before a place or name'
      }
    }
  }
  if (seen !== count) return 'unused blank'
  if (callbacks > FIF_LIMITS.maxCallbacks) return 'too many callbacks'
  if (words < FIF_LIMITS.minWords || words > budgets.maxWords) return 'story length'

  const kinds = new Map<FifKind, number>()
  for (const kind of blanks) kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
  if (Math.max(...kinds.values()) > FIF_LIMITS.maxKindRepeats) return 'one kind repeated'
  if (kinds.size < Math.min(FIF_LIMITS.minDistinctKinds, count)) return 'too few kinds'
  const names = FIF_NAME_KINDS.reduce((sum, kind) => sum + (kinds.get(kind) ?? 0), 0)
  if (names > FIF_LIMITS.maxNameBlanks) return 'too many names'
  if (isUnsafeFifCopy([title, ...paragraphs].join(' '))) return 'unsafe'
  return null
}

/**
 * One complete story from raw service output — or null, never a repair.
 *
 * Only a story the service marked `verified` (it passed the blind grammar
 * check) may print; an unchecked one is refused even when it reads well.
 */
export function normalizeFifStory(raw: unknown): FifStory | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<FillInFunniesStoryPayload> & Record<string, unknown>
  if (record.verified !== true) return null
  const title = normalizeTitle(record.title)
  if (!title || !Array.isArray(record.paragraphs) || !Array.isArray(record.blanks)) return null
  const paragraphs = record.paragraphs.map(clean).filter(Boolean)
  const blanks: FifKind[] = []
  for (const entry of record.blanks) {
    const kind = normalizeKind(entry)
    if (!kind) return null
    blanks.push(kind)
  }
  if (fifStoryProblem(title, paragraphs, blanks)) return null
  const premise = clean(record.premise).slice(0, 120)
  if (premise && isUnsafeFifCopy(premise)) return null
  return { title, paragraphs, blanks, premise, topic: clean(record.topic).slice(0, 60) }
}

/**
 * Why a story may not print, or null when it may. The preflight's last word
 * on one that has already been through `normalizeFifStory`.
 */
export function fifPrintProblem(story: FifStory): string | null {
  const again = normalizeFifStory({ ...story, verified: true })
  if (!again || JSON.stringify(again) !== JSON.stringify(story)) {
    return 'The story is not suitable for a published activity book.'
  }
  return null
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds labels this seller's book already prints (book or compact),
 * so a reply that ignores the prompt's avoid list still cannot repeat them.
 */
export function selectFifStories(
  raw: unknown,
  options: { cap: number; avoid?: readonly string[] },
): FifStory[] {
  const { cap, avoid = [] } = options
  const out: FifStory[] = []
  if (!Array.isArray(raw) || cap <= 0) return out
  const avoided = avoid.map((label) => String(label ?? '').trim()).filter(Boolean)
  for (const item of raw) {
    const story = normalizeFifStory(item)
    if (!story) continue
    if (avoided.some((label) => storyRepeatsLabel(story, label))) continue
    if (out.some((other) => storiesRepeat(story, other))) continue
    out.push(story)
    if (out.length >= cap) break
  }
  return out
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseFifPayload(remote: unknown): readonly FillInFunniesStoryPayload[] {
  if (!remote || typeof remote !== 'object') return []
  const stories = (remote as Partial<FillInFunniesResponse>).stories
  return Array.isArray(stories) ? stories : []
}

/* ------------------------------------------------------------------ *
 * Story → printable pieces.
 * ------------------------------------------------------------------ */

/** One piece of a line: a run of text, or a numbered blank to write on. */
export type FifAtom =
  | { kind: 'text'; text: string; space: boolean }
  | { kind: 'blank'; n: number; space: boolean }

/**
 * A paragraph as unbreakable chunks — one per whitespace-separated word.
 *
 * A word carrying a placeholder keeps its punctuation glued to the blank
 * ("“[8]!”" is an opening quote, the blank, then "!”"), so a line never breaks
 * between a blank and its comma. `space` is true on the first atom of every
 * chunk and false inside one.
 */
export function paragraphChunks(paragraph: string): FifAtom[][] {
  const chunks: FifAtom[][] = []
  for (const word of paragraph.split(' ').filter(Boolean)) {
    const atoms: FifAtom[] = []
    let last = 0
    for (const match of word.matchAll(PLACEHOLDER_RE)) {
      const start = match.index ?? 0
      if (start > last) atoms.push({ kind: 'text', text: word.slice(last, start), space: atoms.length === 0 })
      atoms.push({ kind: 'blank', n: Number(match[1]), space: atoms.length === 0 })
      last = start + match[0].length
    }
    if (last < word.length) atoms.push({ kind: 'text', text: word.slice(last), space: atoms.length === 0 })
    chunks.push(atoms)
  }
  return chunks
}

/**
 * The finished story with `words` in the blanks — what a reader ends up
 * reading aloud. Proves every placeholder resolves to a prompt.
 */
export function fillStory(story: Pick<FifStory, 'paragraphs'>, words: readonly string[]): string[] {
  return story.paragraphs.map((paragraph) =>
    paragraph.replace(PLACEHOLDER_RE, (_, n: string) => {
      const word = words[Number(n) - 1]
      if (word === undefined) throw new Error(`Blank ${n} has no word`)
      return word
    }),
  )
}
