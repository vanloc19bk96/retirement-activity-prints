import type {
  BucketListFocus,
  BucketListResponse,
  BucketListSectionAsk,
} from '@/types/studio-bucket-list.types'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What one bucket-list idea is, every rule it must pass to print, and how a
 * list is balanced across its headings.
 *
 * An idea is one short, concrete thing to do in retirement, printed beside a
 * box to tick once it is done: "Take a scenic train journey". It starts with
 * a verb, names one experience, and leaves something concrete behind once the
 * empty words are gone — "Experience more adventure" does not.
 *
 * These gates mirror `backend/app/services/studio_bucket_list_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, printable idea reaches the
 * editor. An idea is never repaired: rewriting one would print something
 * nobody wrote. The word lists are the service's own
 * (`backend/app/data/studio/bucket-list/prompt.json`), checked equal by
 * `content-lists.test.ts`.
 */

export const BL_TEMPLATE_KEY = 'bucket-list'
export const BL_DEFAULT_TITLE = 'My Retirement Bucket List'

/** Mirrors `limits` in the service's prompt.json. */
export const BL_LIMITS = {
  minIdeaChars: 10,
  maxIdeaChars: 52,
  minIdeaWords: 2,
  maxIdeaWords: 10,
  maxConceptChars: 40,
  minSections: 5,
  maxSections: 12,
  itemsPerSection: 8,
} as const

/** Longest idea the page plans for. */
export const MAX_IDEA_CHARS = BL_LIMITS.maxIdeaChars

/** Lengths a seller can pick. A bucket list is a big, browsable collection. */
export const BL_COUNTS = [50, 75, 100] as const
export const BL_DEFAULT_COUNT = 100

/** A heading this thin reads as a stray line rather than a theme. */
export const BL_MIN_SECTION_IDEAS = 3

export const BL_AI_EMPTY_MESSAGE =
  'Could not write a fresh bucket list this time. Please try again.'
export const BL_SHORT_MESSAGE =
  'Could not gather enough distinct ideas for this list. Please try again, or pick fewer ideas.'
export const BL_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a bucket list. Pick a larger page in Settings.'
export const BL_BUILD_FAILED_MESSAGE = 'Could not lay out this bucket list on your page. Please try again.'

export const BL_FOCUSES: readonly { value: BucketListFocus; label: string; help: string }[] = [
  {
    value: 'balanced',
    label: 'A bit of everything',
    help: 'Travel, hobbies, learning, people, nature and simple pleasures, side by side.',
  },
  {
    value: 'close-to-home',
    label: 'Close to home & low-cost',
    help: 'More local outings, home projects and free or low-cost pleasures — with a little of everything else.',
  },
  {
    value: 'adventure',
    label: 'Travel & adventure',
    help: 'More trips, days out and experiences — still mixed with quieter ideas.',
  },
  {
    value: 'creative',
    label: 'Creativity & learning',
    help: 'More making, learning and hobbies — still mixed with outings and people.',
  },
  {
    value: 'people',
    label: 'Friends & community',
    help: 'More ideas with friends, family and neighbours, and ways to give back.',
  },
]

export function parseBlFocus(raw: unknown): BucketListFocus {
  return BL_FOCUSES.some((focus) => focus.value === raw) ? (raw as BucketListFocus) : 'balanced'
}

export function parseBlCount(raw: unknown): number {
  const value = Number(raw)
  return (BL_COUNTS as readonly number[]).includes(value) ? value : BL_DEFAULT_COUNT
}

/** Headings a list of `count` ideas prints under. Mirrors `section_count`. */
export function blSectionCount(count: number): number {
  const wanted = Math.floor(count / BL_LIMITS.itemsPerSection + 0.5)
  return Math.max(BL_LIMITS.minSections, Math.min(BL_LIMITS.maxSections, wanted))
}

/** The how-to line. Warm, short, and clear that nobody has to do everything. */
export const BL_INSTRUCTION =
  'Circle the ideas that call to you, then tick each box once you’ve done it. There’s no rush!'

/* The service's word lists, verbatim. */
export const BL_QUALIFIER_WORDS: readonly string[] = [
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'you', 'yourself', 'i', 'we', 'me',
  'us', 'them', 'it', 'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'from', 'about', 'by', 'into',
  'onto', 'up', 'out', 'over', 'under', 'near', 'around', 'through', 'across', 'along', 'as', 'too', 'so',
  'very', 'really', 'just', 'only', 'every', 'each', 'all', 'that', 'this', 'those', 'these', 'some', 'any',
  'one', 'own', 'new', 'old', 'another', 'other', 'favourite', 'favorite', 'whole', 'entire', 'full', 'once',
  'more', 'most', 'ever', 'never', 'been', 'have', 'has', 'had', 'before', 'after', 'finally', 'always',
  'somewhere', 'someone', 'something', 'place', 'where', 'who', 'what', 'how', 'when', 'there', 'here',
  'than', 'day', 'days', 'time', 'week', 'month', 'year', 'first', 'least', 'is', 'are', 'be', 'not', 'can',
  'could', 'would', 'will',
]
export const BL_GENERIC_WORDS: readonly string[] = [
  'try', 'learn', 'take', 'go', 'make', 'do', 'get', 'have', 'start', 'begin', 'enjoy', 'experience', 'find',
  'discover', 'explore', 'spend', 'see', 'watch', 'visit', 'attend', 'join', 'give', 'keep', 'plan',
  'travel', 'class', 'lesson', 'course', 'workshop', 'beginner', 'basic', 'skill', 'hobby', 'local',
  'nearby', 'different', 'special', 'simple', 'little', 'small', 'big', 'great', 'perfect', 'proper', 'real',
  'good', 'nice', 'lovely', 'beautiful', 'unusual', 'fun', 'adventure', 'thing', 'stuff', 'life', 'moment',
  'dream', 'goal', 'passion', 'happiness', 'joy', 'purpose', 'potential', 'best', 'live', 'world', 'way',
  'kind', 'type', 'bit', 'lot', 'few', 'part', 'list', 'bucket', 'use', 'put', 'let', 'become', 'embrace',
  'pursue', 'someday', 'maybe', 'famous', 'memorable', 'exciting', 'amazing',
]
export const BL_PHRASES: Readonly<Record<string, string>> = {
  'northern lights': 'aurora', 'hot air balloon': 'balloon', 'hot-air balloon': 'balloon',
  'family tree': 'genealogy', 'family history': 'genealogy', 'life story': 'memoir',
  'life stories': 'memoir', 'tai chi': 'taichi', 'board game': 'boardgame', 'board games': 'boardgame',
  'card game': 'cardgame', 'card games': 'cardgame', 'ice cream': 'icecream', 'farmers market': 'market',
  "farmers' market": 'market', 'open mic': 'openmic', 'pen pal': 'penpal', 'pen friend': 'penpal',
  'time capsule': 'timecapsule', 'afternoon tea': 'afternoontea',
}
export const BL_SYNONYMS: Readonly<Record<string, string>> = {
  trip: 'travel', trips: 'travel', journey: 'travel', journeys: 'travel', travels: 'travel',
  traveling: 'travel', travelling: 'travel', tour: 'travel', tours: 'travel', touring: 'travel',
  vacation: 'travel', vacations: 'travel', holiday: 'travel', holidays: 'travel', getaway: 'travel',
  getaways: 'travel', voyage: 'travel', outing: 'travel', outings: 'travel', abroad: 'abroad',
  overseas: 'abroad', foreign: 'abroad', country: 'abroad', countries: 'abroad', international: 'abroad',
  painting: 'paint', paintings: 'paint', painted: 'paint', watercolor: 'paint', watercolors: 'paint',
  watercolour: 'paint', watercolours: 'paint', acrylic: 'paint', acrylics: 'paint', drawing: 'draw',
  drawings: 'draw', sketch: 'draw', sketches: 'draw', sketching: 'draw', sketchbook: 'draw', photo: 'photo',
  photos: 'photo', photograph: 'photo', photographs: 'photo', photography: 'photo', camera: 'photo',
  picture: 'photo', pictures: 'photo', walking: 'walk', walks: 'walk', hike: 'walk', hikes: 'walk',
  hiking: 'walk', stroll: 'walk', ramble: 'walk', rambling: 'walk', trek: 'walk', trekking: 'walk',
  singing: 'sing', song: 'sing', songs: 'sing', choir: 'sing', choirs: 'sing', chorus: 'sing',
  dancing: 'dance', dances: 'dance', gardening: 'garden', gardens: 'garden', planting: 'grow', plant: 'grow',
  growing: 'grow', cooking: 'cook', recipe: 'cook', recipes: 'cook', dish: 'cook', dishes: 'cook',
  meal: 'cook', meals: 'cook', cuisine: 'cook', writing: 'write', wrote: 'write', diary: 'journal',
  diaries: 'journal', journals: 'journal', memoirs: 'memoir', autobiography: 'memoir',
  volunteering: 'volunteer', museums: 'museum', gig: 'concert', gigs: 'concert', concerts: 'concert',
  theater: 'theatre', theatres: 'theatre', theaters: 'theatre', stars: 'star', stargazing: 'star',
  stargaze: 'star', constellation: 'star', constellations: 'star', birds: 'bird', birdwatching: 'bird',
  birding: 'bird', fishing: 'fish', swimming: 'swim', bicycle: 'bike', cycling: 'bike', cycle: 'bike',
  biking: 'bike', bikes: 'bike', sailing: 'boat', sail: 'boat', boats: 'boat', canoe: 'paddle',
  canoeing: 'paddle', kayak: 'paddle', kayaking: 'paddle', paddling: 'paddle', friends: 'friend',
  pal: 'friend', pals: 'friend', languages: 'language', knitting: 'knit', crochet: 'knit',
  crocheting: 'knit', ancestry: 'genealogy', ancestors: 'genealogy', ocean: 'coast', sea: 'coast',
  seaside: 'coast', beach: 'coast', beaches: 'coast', coastline: 'coast', mountain: 'hill',
  mountains: 'hill', hills: 'hill', hilltop: 'hill', summit: 'hill', rail: 'train', railway: 'train',
  railroad: 'train', trains: 'train',
  read: 'book', reading: 'book', books: 'book', novel: 'book', novels: 'book',
  overnight: 'night', nights: 'night',
  markets: 'market', festivals: 'festival', fair: 'festival',
  fairs: 'festival',
}
export const BL_NON_VERB_STARTERS: readonly string[] = [
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'i', 'we', 'you', 'it', 'this',
  'that', 'these', 'those', 'to', 'and', 'or', 'but', 'some', 'any', 'more', 'less', 'most', 'new',
  'finally', 'maybe', 'perhaps', 'someday', 'one', 'really', 'always', 'never', 'ever', 'every', 'all',
  'just', 'simply', 'why', 'what', 'how', 'when', 'where', 'if', 'there', 'here', 'retirement', 'retired',
  'bucket', 'being', 'at', 'in', 'on', 'with', 'for', 'from', 'by', 'after', 'before', 'once',
]
export const BL_LEAD_VERBS: readonly string[] = [
  'visit', 'take', 'learn', 'try', 'go', 'make', 'bake', 'cook', 'grow', 'plant', 'paint', 'draw', 'write',
  'read', 'sing', 'dance', 'play', 'join', 'host', 'invite', 'teach', 'walk', 'hike', 'swim', 'ride', 'sail',
  'paddle', 'fly', 'climb', 'watch', 'see', 'spend', 'plan', 'book', 'attend', 'volunteer', 'donate',
  'start', 'build', 'create', 'knit', 'sew', 'photograph', 'explore', 'discover', 'find', 'collect',
  'organise', 'organize', 'record', 'frame', 'sort', 'fix', 'repair', 'restore', 'decorate', 'camp', 'fish',
  'feed', 'send', 'call', 'reconnect', 'meet', 'gather', 'celebrate', 'surprise', 'give', 'share', 'help',
  'mentor', 'tour', 'taste', 'sample', 'eat', 'order', 'brew', 'pick', 'sketch', 'sculpt', 'carve', 'weave',
  'quilt', 'crochet', 'journal', 'perform', 'sit', 'relax', 'rest', 'nap', 'stroll', 'wander', 'listen',
  'stargaze', 'identify', 'spot', 'keep', 'buy', 'treat', 'enjoy', 'savour', 'savor', 'soak', 'sleep',
  'follow', 'complete', 'finish', 'master', 'practise', 'practice', 'study', 'research', 'trace', 'map',
  'label', 'scan', 'digitise', 'digitize', 'print', 'bind', 'publish', 'enter', 'compete', 'win', 'bowl',
  'cycle', 'row', 'kayak', 'canoe', 'skate', 'ski', 'snorkel', 'bring', 'throw', 'hang', 'fill', 'put',
  'set', 'sell', 'tell', 'show', 'sign', 'swap', 'stay',
]
export const BL_CLICHE_PHRASES: readonly string[] = [
  'live your best life', 'follow your dreams', 'follow your heart', 'seize the day', 'carpe diem',
  'make memories', 'create memories', 'make lasting memories', 'comfort zone', 'be yourself',
  'find yourself', 'find your passion', 'find happiness', 'enjoy life', 'enjoy every moment',
  'live in the moment', 'make every day count', 'just do it', 'bucket list', 'life is short', 'yolo',
  'you only live once', "before it's too late", 'before its too late', 'too late', 'while you still can',
  'while you can', 'at your age', 'last chance', 'one last', 'too old', 'young again', 'act your age',
  'golden years', 'twilight years', 'senior discount',
]
export const BL_BLOCKED_TERMS: readonly string[] = [
  'death', 'dead', 'die', 'dying', 'died', 'funeral', 'grave', 'cemetery', 'widow', 'widower',
  'will and testament', 'illness', 'ill', 'sick', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke',
  'surgery', 'operation', 'hospital', 'doctor', 'nurse', 'nursing home', 'care home', 'retirement home',
  'medication', 'medicine', 'pills', 'diagnosis', 'arthritis', 'pain', 'aches', 'hip replacement',
  'knee replacement', 'wheelchair', 'walking stick', 'disabled', 'disability', 'blind', 'deaf',
  'hearing aid', 'dentures', 'incontinence', 'bladder', 'diet', 'weight loss', 'overweight', 'fat',
  'wrinkles', 'grey hair', 'memory loss', 'forget', 'forgot', 'forgotten', 'forgetful', 'forgetting',
  'senior moment', 'over the hill', 'old fogey', 'elderly', 'geriatric', 'senior citizen', 'old age',
  'old man', 'old woman', 'old lady', 'grumpy', 'lonely', 'loneliness', 'alone forever', 'nobody visits',
  'bored to death', 'debt', 'broke', 'bankrupt', 'poverty', 'poor', 'bills', 'pay off', 'paying off',
  'mortgage', 'loan', 'taxes', "can't afford", 'cannot afford', 'pension', 'savings', 'invest', 'investing',
  'stocks', 'crypto', 'bitcoin', 'divorce', 'ex-wife', 'ex-husband', 'affair', 'grandchild', 'grandchildren',
  'grandkid', 'grandkids', 'grandson', 'grandsons', 'granddaughter', 'granddaughters', 'spouse', 'husband',
  'wife', 'your kids', 'your children', 'your son', 'your daughter', 'backyard', 'your yard', 'your house',
  'your lawn', 'renovate', 'remodel', 'election', 'political', 'politics', 'democrat', 'republican',
  'president', 'government', 'protest', 'vote', 'voting', 'campaign', 'religion', 'church', 'prayer', 'god',
  'heaven', 'hell', 'bible', 'drunk', 'hangover', 'beer', 'wine', 'vodka', 'whiskey', 'cocktail',
  'cocktails', 'booze', 'alcohol', 'brewery', 'pub crawl', 'gamble', 'gambling', 'casino', 'lottery', 'bet',
  'betting', 'gun', 'guns', 'rifle', 'hunting', 'weapon', 'war', 'fight', 'kill', 'violence', 'sex', 'sexy',
  'naked', 'nude', 'tattoo', 'skydive', 'skydiving', 'sky dive', 'bungee', 'base jump', 'cliff dive',
  'cliff diving', 'shark', 'sharks', 'free solo', 'hitchhike', 'hitchhiking', 'motorcycle', 'stunt',
  'extreme', 'stupid', 'idiot', 'hate', 'ugly', 'crazy', 'useless', 'boring old', 'damn', 'police',
  'arrested', 'illegal', 'trespass',
]
export const BL_BRAND_TERMS: readonly string[] = [
  'disney', 'disneyland', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google',
  'amazon', 'iphone', 'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola',
  'coca cola', 'lego', 'barbie', 'harry potter', 'star wars', 'star trek', 'taylor swift', 'elvis',
  'beatles', 'rolex', 'ferrari', 'harley', 'nintendo', 'playstation', 'xbox', 'costco', 'ikea', 'uber',
  'airbnb', 'zoom', 'facetime', 'whatsapp', 'kindle', 'wordle', 'las vegas', 'route 66', 'orient express',
  'michelin', 'ted talk', 'tedx', 'peloton', 'fitbit', 'eurail', 'national geographic', 'guinness',
  'olympic', 'olympics', 'super bowl', 'wimbledon', 'world cup', 'broadway', 'royal caribbean',
  'carnival cruise', 'viking cruise',
]

const PHRASE_PATTERNS: readonly (readonly [RegExp, string])[] = Object.entries(BL_PHRASES)
  .sort(([a], [b]) => b.length - a.length)
  .map(([phrase, replacement]) => [new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'g'), replacement])

const QUALIFIERS = new Set(BL_QUALIFIER_WORDS)
const STARTERS = new Set(BL_NON_VERB_STARTERS)
const LEAD_VERBS = new Set(BL_LEAD_VERBS)
const SYNONYMS = new Map(Object.entries(BL_SYNONYMS))

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const termPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = termPattern(BL_BLOCKED_TERMS)
const BRAND_RE = termPattern(BL_BRAND_TERMS)
const CLICHE_RE = termPattern(BL_CLICHE_PHRASES)
const NUMBER_RE = /^\s*(\(?\d{1,3}\s*[.):-]\s+|[-*•]\s+)/
const BOX_RE = /^\s*(\[\s?[xX]?\s?\]|[☐☑☒□■✓✔])\s*/u
/** Letters (any script), digits, spaces and light punctuation — no sentence break, colon or slash. */
const ALLOWED_RE = /^[\p{L}\p{N}][\p{L}\p{N} ,'’&-]*$/u
/** A second idea hiding inside one ("… in Rome or Paris", "… then …"). */
const SPLIT_RE = /\b(or|either|nor|then|plus|etc)\b/i
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const TAIL_RE = /[\s.!…;:,]+$/
const WORD_RE = /[\p{L}\p{N}]+/gu
const JOIN_RE = /[\p{L}\p{N}]+|,/gu

/** Fold endings so PAINTING and PAINTS, BAKE and BAKING compare equal. Mirrors `stem`. */
export function stem(input: string): string {
  let word = input
  if (word.length <= 3) return word
  if (word.length > 4 && word.endsWith('ies')) word = `${word.slice(0, -3)}y`
  else if (word.length > 5 && word.endsWith('ing')) word = undouble(word.slice(0, -3))
  else if (word.length > 4 && word.endsWith('ed')) word = undouble(word.slice(0, -2))
  else if (word.length > 4 && /(ches|shes|sses|xes|zes)$/.test(word)) word = word.slice(0, -2)
  else if (word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1)
  if (word.length > 3 && word.endsWith('e')) word = word.slice(0, -1)
  return word
}

/** SWIMM → SWIM, PLANN → PLAN; FALL and DRESS keep their doubles. */
function undouble(word: string): string {
  const last = word.at(-1)
  if (word.length >= 3 && last === word.at(-2) && !'aeiouls'.includes(last!)) return word.slice(0, -1)
  return word
}

const GENERIC = new Set([...BL_GENERIC_WORDS, ...BL_GENERIC_WORDS.map(stem)])

function fold(text: string): string {
  let folded = text.toLowerCase().replace(/’/g, "'")
  for (const [pattern, replacement] of PHRASE_PATTERNS) folded = folded.replace(pattern, replacement)
  return folded.replace(/'s\s/g, ' ').replace(/'/g, '')
}

/** What an idea is about: qualifiers, generic verbs and empty words gone, synonyms folded. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of fold(text).match(WORD_RE) ?? []) {
    if (QUALIFIERS.has(word)) continue
    let canon = SYNONYMS.get(word)
    if (canon === undefined) {
      const stemmed = stem(word)
      canon = SYNONYMS.get(stemmed) ?? stemmed
    }
    if (GENERIC.has(canon) || GENERIC.has(word)) continue
    out.add(canon)
  }
  return out
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) => [...a].every((t) => b.has(t))
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && isSubset(a, b)

/**
 * True when a reader would call two ideas the same thing: most of their
 * substance shared, or one wholly inside the other once the smaller has two
 * words of substance, or when neither has more than two ("Take a painting
 * class" / "Try painting": both just PAINT). Mirrors `tokens_repeat`.
 */
export function tokensRepeat(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  if (sameSet(a, b) || jaccard(a, b) >= 0.6) return true
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  return isSubset(small, large) && (small.size >= 2 || large.size <= 2)
}

/** An idea tokenised once, so a book of hundreds is a flat pass per candidate. */
export interface IdeaKey {
  text: string
  tokens: Set<string>
  concept: Set<string>
}

export const ideaKey = (text: string, concept = ''): IdeaKey => ({
  text: text.replace(/\s+/g, ' ').trim().toLowerCase(),
  tokens: contentTokens(text),
  concept: concept ? contentTokens(concept) : new Set(),
})

/** Mirrors `keys_repeat`: the same words, or the same experience in other words. */
export function keysRepeat(x: IdeaKey, y: IdeaKey): boolean {
  if (x.text === y.text) return true
  if (x.concept.size > 0 && sameSet(x.concept, y.concept)) {
    if (x.concept.size >= 2 || jaccard(x.tokens, y.tokens) >= 0.34) return true
  }
  return tokensRepeat(x.tokens, y.tokens)
}

export function ideasRepeat(first: string, second: string): boolean {
  return keysRepeat(ideaKey(first), ideaKey(second))
}

export function isUnsafeBlCopy(text: string): boolean {
  const folded = text.replace(/’/g, "'")
  return (
    isUnsafeCopy(folded) || BLOCKED_RE.test(folded) || BRAND_RE.test(folded) || CLICHE_RE.test(folded)
  )
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

/** "Bake bread and share it", "Take a boat, see the fjords". */
function joinsTwoIdeas(text: string): boolean {
  const words = text.toLowerCase().match(JOIN_RE) ?? []
  return words.some((word, i) => (word === 'and' || word === ',') && LEAD_VERBS.has(words[i + 1] ?? ''))
}

function opensOnAVerb(first: string): boolean {
  if (STARTERS.has(first)) return false
  // "Visiting …", "Finally …": not an action to take.
  return !(first.length > 5 && (first.endsWith('ing') || first.endsWith('ly')))
}

/** One idea as printed — "Take a scenic train journey" — or null. Mirrors `normalize_idea`. */
export function normalizeIdea(raw: unknown, budget: number = MAX_IDEA_CHARS): string | null {
  let text = clean(raw)
  for (const pattern of [NUMBER_RE, BOX_RE]) text = text.replace(pattern, '').trim()
  text = text.replace(EDGE_QUOTES_RE, '').replace(TAIL_RE, '').replace(EDGE_QUOTES_RE, '')
  if (!text || !ALLOWED_RE.test(text) || SPLIT_RE.test(text)) return null
  const letters = text.match(/\p{L}/gu) ?? []
  const upper = text.match(/\p{Lu}/gu) ?? []
  if (letters.length === 0 || upper.length > letters.length * 0.5) return null
  const words = text.toLowerCase().match(WORD_RE) ?? []
  if (!words[0] || !opensOnAVerb(words[0]) || joinsTwoIdeas(text)) return null
  const count = text.split(' ').filter(Boolean).length
  if (count < BL_LIMITS.minIdeaWords || count > BL_LIMITS.maxIdeaWords) return null
  if (text.length < BL_LIMITS.minIdeaChars || text.length > budget) return null
  if (isUnsafeBlCopy(text)) return null
  // Nothing concrete left once the empty words are gone: a slogan, not a plan.
  if (contentTokens(text).size === 0) return null
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function normalizeConcept(raw: unknown): string {
  return clean(raw).toLowerCase().slice(0, BL_LIMITS.maxConceptChars).trim()
}

/** One validated idea. */
export interface BlIdea {
  idea: string
  concept: string
}

/** One heading and its validated ideas, spares included, in the service's order. */
export interface BlSection {
  key: string
  title: string
  target: number
  items: BlIdea[]
}

/** One complete idea from raw service output — or null, never a repair. */
export function normalizeBlItem(raw: unknown): BlIdea | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const idea = normalizeIdea(record.idea)
  if (!idea) return null
  return { idea, concept: normalizeConcept(record.concept) }
}

/** Why an idea may not print, or null when it may. The preflight's last word. */
export function blIdeaProblem(idea: string): string | null {
  return normalizeIdea(idea) === idea ? null : 'An idea is not suitable for a published activity book.'
}

const KEY_RE = /^[a-z][a-z-]{0,39}$/
/** Headings are the service's own titles (24 characters at most); anything else is not printed. */
const TITLE_RE = /^[A-Za-z][A-Za-z &'’,-]{1,23}$/

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseBlPayload(remote: unknown): readonly unknown[] {
  if (!remote || typeof remote !== 'object') return []
  const sections = (remote as Partial<BucketListResponse>).sections
  return Array.isArray(sections) ? sections : []
}

/**
 * Normalize → gate → drop repeats, keeping every heading's spares.
 *
 * Repeats are caught across the whole list, not just within a heading, and
 * against `avoid` — ideas this seller's book already prints — so a reply that
 * ignores the prompt's avoid list still cannot repeat them. Headings that
 * arrive twice (a top-up) are merged under the first.
 */
export function cleanBlSections(
  raw: unknown,
  options: { avoid?: readonly string[]; keep?: readonly BlSection[] } = {},
): BlSection[] {
  const { avoid = [], keep = [] } = options
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => ideaKey(label))
  const kept: IdeaKey[] = keep.flatMap((s) => s.items.map((i) => ideaKey(i.idea, i.concept)))
  const out = new Map<string, BlSection>(keep.map((s) => [s.key, { ...s, items: [...s.items] }]))

  for (const rawSection of Array.isArray(raw) ? raw : []) {
    if (!rawSection || typeof rawSection !== 'object') continue
    const record = rawSection as Record<string, unknown>
    const key = String(record.key ?? '').trim()
    const title = clean(record.title)
    const target = Math.floor(Number(record.target))
    if (!KEY_RE.test(key) || !TITLE_RE.test(title) || !(target >= 1 && target <= 30)) continue
    const section = out.get(key) ?? { key, title, target, items: [] }
    for (const item of Array.isArray(record.items) ? record.items : []) {
      const idea = normalizeBlItem(item)
      if (!idea) continue
      const k = ideaKey(idea.idea, idea.concept)
      if (kept.some((other) => keysRepeat(k, other))) continue
      if (avoided.some((other) => keysRepeat(k, other))) continue
      section.items.push(idea)
      kept.push(k)
    }
    out.set(key, section)
  }
  return [...out.values()].filter((section) => section.items.length > 0)
}

/** Headings still short of their share, for a top-up request. */
export function blShortfall(sections: readonly BlSection[]): BucketListSectionAsk[] {
  return sections
    .filter((section) => section.items.length < section.target)
    .map((section) => ({ key: section.key, count: Math.min(20, section.target - section.items.length) }))
}

/**
 * Exactly `count` ideas, spread evenly across the headings — or null.
 *
 * Every heading takes its share where it can. A heading too thin to stand on
 * its own is left out, and whatever is still missing is spread over headings
 * with spares, round robin, at most two over their share each — so no theme
 * swamps the list. Never pads with anything that failed a gate.
 */
export function balanceBlSections(sections: readonly BlSection[], count: number): BlSection[] | null {
  const usable = sections.filter((s) => s.items.length >= Math.min(BL_MIN_SECTION_IDEAS, s.target))
  if (usable.length === 0) return null
  const taken = usable.map((s) => Math.min(s.target, s.items.length))
  let total = taken.reduce((sum, n) => sum + n, 0)

  // Shares that add up past the count (a merged top-up): trim the fullest first.
  while (total > count) {
    const fullest = taken.indexOf(Math.max(...taken))
    taken[fullest]!--
    total--
  }
  // One more per heading per pass; the ceiling rises only once a pass stalls.
  for (let over = 1; over <= 2 && total < count; ) {
    let progressed = false
    for (let i = 0; i < usable.length && total < count; i++) {
      const section = usable[i]!
      if (taken[i]! < section.items.length && taken[i]! < section.target + over) {
        taken[i]!++
        total++
        progressed = true
      }
    }
    if (!progressed) over++
  }
  if (total !== count) return null
  return usable
    .map((section, i) => ({ ...section, items: spreadOpenings(section.items.slice(0, taken[i]!)) }))
    .filter((section) => section.items.length > 0)
}

const openingOf = (idea: string) => (idea.toLowerCase().match(WORD_RE) ?? [''])[0]!

/**
 * Keep two ideas that open on the same verb apart where the heading allows,
 * so a column reads "Visit … / Learn … / Visit …" rather than a run of
 * Visits. Nothing is dropped.
 */
export function spreadOpenings(items: readonly BlIdea[]): BlIdea[] {
  const pending = [...items]
  const out: BlIdea[] = []
  while (pending.length > 0) {
    const last = out.length > 0 ? openingOf(out[out.length - 1]!.idea) : ''
    const next = pending.findIndex((item) => openingOf(item.idea) !== last)
    out.push(pending.splice(next === -1 ? 0 : next, 1)[0]!)
  }
  return out
}

/** Every idea in a list, in print order. */
export const blIdeas = (sections: readonly BlSection[]): string[] =>
  sections.flatMap((section) => section.items.map((item) => item.idea))
