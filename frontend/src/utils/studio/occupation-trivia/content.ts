import type {
  OccupationKey,
  OccupationTriviaLevel,
  OccupationTriviaQuestion,
  OccupationTriviaResponse,
} from '@/types/studio-occupation-trivia.types'
import { createRng } from '../studio-rng'

/**
 * What one Occupation Trivia question is, and every rule it must pass to print.
 *
 * A question is a plain question about one job ("What did teachers write on
 * the blackboard with?"), its right answer, three wrong ones, and a short note
 * for the answer page. The page letters the four choices A–D; the answer page
 * lists each number with its letter, its answer and the note.
 *
 * Truth is decided by the content service: every question it returns has
 * passed a blind check that answered the question itself from shuffled
 * choices, rated it a settled fact about this job, clearly and fairly worded,
 * with believable wrong choices, and judged its note true on its own. It
 * carries `verified: true`. A question without that mark never prints.
 *
 * The remaining gates mirror `backend/app/services/studio_occupation_trivia_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only a whole, well-formed question
 * reaches the editor. A question is never repaired.
 */

export const OT_TEMPLATE_KEY = 'occupation-trivia'
export const OT_DEFAULT_TITLE = 'Occupation Trivia'

/** Questions a pack aims for, and the fewest it will print. */
export const OT_TARGET_QUESTIONS = 10
export const OT_MIN_QUESTIONS = 8

/** Longest question the pages plan for. */
export const MAX_QUESTION_CHARS = 120
/** Longest choice the pages plan for — two lines beside its letter at most. */
export const MAX_CHOICE_CHARS = 36
/** Longest answer-page note the pages plan for. */
export const MAX_EXPLANATION_CHARS = 80

/** The service's hard limits (`prompt.json` → `limits`); a test keeps them identical. */
export const OT_LIMITS = {
  minQuestionChars: 24,
  maxQuestionWords: 28,
  minChoiceChars: 2,
  maxChoiceWords: 7,
  minExplanationChars: 20,
  maxExplanationWords: 22,
  choiceLengthRatioPercent: 260,
  choiceLengthSlackChars: 12,
  latestYear: 2010,
} as const

export const OT_LETTERS = ['A', 'B', 'C', 'D'] as const
export const OT_CHOICE_COUNT = OT_LETTERS.length

export const OT_AI_EMPTY_MESSAGE =
  'Could not write trivia questions good enough to print. Please try again.'
export const OT_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for an Occupation Trivia Pack. Pick a larger page in Settings.'
export const OT_BUILD_FAILED_MESSAGE = 'Could not fit these trivia questions on the page. Try again.'

export interface OtOccupationSpec {
  value: OccupationKey
  label: string
  /** What a pack for this job covers — the form's help line. */
  covers: string
}

/**
 * The occupations a pack can be written for. Each is a profile in the
 * service's prompt data (its topic areas, care rules and blocked words); a
 * test keeps the two lists identical. A new occupation is a profile there and
 * one line here.
 */
export const OT_OCCUPATIONS: readonly OtOccupationSpec[] = [
  { value: 'teacher', label: 'Teacher', covers: 'Chalkboards, grade books, the school bell and the history of teaching.' },
  { value: 'nurse', label: 'Nurse', covers: 'Nursing history, uniforms, ward routines and familiar equipment. Never medical advice.' },
  { value: 'police', label: 'Police', covers: 'Badges, radios, walking the beat, call boxes and the history of policing.' },
  { value: 'military', label: 'Military', covers: 'Ranks, bugle calls, mess halls, customs and traditions. Branch and country named where it matters.' },
  { value: 'trucker', label: 'Trucker', covers: 'CB radio talk, rigs and trailers, truck stops and life on the road.' },
  { value: 'engineer', label: 'Engineer', covers: 'Slide rules, blueprints, landmark structures and engineering traditions. No calculations.' },
  { value: 'accountant', label: 'Accountant', covers: 'Ledgers, adding machines, month-end and the history of the profession. No tax law.' },
  { value: 'postal', label: 'Postal', covers: 'Stamps, postmarks, sorting cases, routes and the history of the mail.' },
]

export function parseOtOccupation(raw: unknown): OccupationKey {
  const value = String(raw ?? '')
  return OT_OCCUPATIONS.some((o) => o.value === value) ? (value as OccupationKey) : 'teacher'
}

export const otOccupationSpec = (occupation: OccupationKey): OtOccupationSpec =>
  OT_OCCUPATIONS.find((spec) => spec.value === occupation)!

export interface OtLevelSpec {
  value: OccupationTriviaLevel
  label: string
}

/**
 * How deep into the job's knowledge a pack reaches. Never type size or count:
 * the trim decides those, so a harder pack is never smaller print.
 */
export const OT_LEVELS: readonly OtLevelSpec[] = [
  { value: 'gentle', label: 'Gentle — what anyone in the job knew' },
  { value: 'classic', label: 'Classic — familiar, with a few to think about' },
  { value: 'challenging', label: 'Challenging — for the long-serving pro' },
]

export function parseOtLevel(raw: unknown): OccupationTriviaLevel {
  const value = String(raw ?? '')
  return OT_LEVELS.some((level) => level.value === value) ? (value as OccupationTriviaLevel) : 'classic'
}

/**
 * The how-to line, naming the job so a reader knows whose pack it is. One
 * short sentence: the lettered bubbles show how to answer.
 */
export function otInstruction(occupation: OccupationKey): string {
  return `${otOccupationSpec(occupation).label} trivia: circle the letter of the best answer.`
}

/** One validated question, as the service wrote it. */
export interface OtQuestion {
  topic: string
  question: string
  answer: string
  distractors: [string, string, string]
  explanation: string
}

/* ------------------------------------------------------------------ *
 * Word lists. Mirror `backend/app/data/studio/occupation-trivia/prompt.json`.
 * ------------------------------------------------------------------ */

export const OT_BLOCKED_TERMS = [
  'dead', 'die', 'dies', 'dying', 'died', 'death', 'deaths', 'deadly', 'kill', 'killed', 'killing',
  'killer', 'murder', 'murdered', 'suicide', 'funeral', 'funerals', 'coffin', 'corpse', 'massacre',
  'bloodbath', 'torture', 'execution', 'executed', 'shoot', 'shooting', 'shooter', 'bomb', 'bombs',
  'bombing', 'explosive', 'explosives', 'terrorist', 'terrorism', 'sex', 'sexy', 'naked', 'nude',
  'drunk', 'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'booze', 'cocktail', 'hangover', 'casino',
  'gambling', 'lottery', 'cigarette', 'cigarettes', 'tobacco', 'smoking', 'politics', 'political',
  'election', 'elections', 'democrat', 'republican', 'religion', 'religious', 'god', 'jesus',
  'church', 'prayer', 'bible', 'stupid', 'idiot', 'dumb', 'moron', 'lazy', 'boring', 'crazy',
  'insane', 'psycho', 'senile', 'senior moment', 'over the hill', 'geezer', 'old fogey', 'elderly',
  'frail', 'feeble', 'forgetful', 'dementia', 'alzheimer', 'alzheimers', 'crap', 'damn', 'bitch',
  'bastard', 'piss',
] as const

/** Wording that tests the reader's memory or age instead of celebrating their experience. */
export const OT_FRAMING_TERMS = [
  'remember', 'remembers', 'remembered', 'recall', 'your age', 'at your age', 'back in your day',
  'back in the day', 'old-timer', 'old-timers', 'old timer', 'old timers', 'only an old',
  'still know', 'kids today', 'young people today',
] as const

export const OT_BRAND_TERMS = [
  'disney', 'netflix', 'facebook', 'google', 'amazon', 'microsoft', 'ibm', 'iphone', 'walmart',
  'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola', 'pepsi', 'kodak', 'polaroid',
  'xerox', 'hoover', 'sony', 'tupperware', 'velcro', 'post-it', 'scotch tape', 'sellotape',
  'kleenex', 'band-aid', 'band aid', 'crayola', 'etch a sketch', 'rolodex', 'dictaphone',
  'texas instruments', 'hewlett-packard', 'casio', 'lotus 1-2-3', 'quickbooks', 'fedex', 'dhl',
  'ford', 'chevrolet', 'chevy', 'harley', 'rolex', 'timex', 'bic', 'sharpie', 'scrabble',
  'monopoly', 'lego', 'barbie',
] as const

export const OT_TIME_TERMS = [
  'today', 'todays', 'currently', 'nowadays', 'now', 'still', 'recent', 'recently', 'latest',
  'modern-day', 'these days', 'this year', 'as of', 'at present', 'presently', 'right now',
] as const

export const OT_HEDGE_TERMS = [
  'approximately', 'roughly', 'maybe', 'perhaps', 'possibly', 'probably', 'might', 'may have',
  'reportedly', 'allegedly', 'legend has it', 'rumour', 'rumor', 'believed', 'thought to',
  'said to', 'some say', 'supposedly', 'it is claimed',
] as const

/** Questions only: a negative or a superlative makes a question a trick of wording. */
export const OT_ABSOLUTE_TERMS = [
  'never', 'always', 'only', 'best', 'worst', 'favourite', 'favorite', 'most popular',
  'most famous', 'best-selling', 'greatest', 'not', 'except',
] as const

export const OT_BAD_CHOICE_TERMS = [
  'all of the above', 'none of the above', 'all of these', 'none of these', 'both of these',
  'neither of these', 'both a and b', 'a and b', 'b and c', 'neither', 'not sure',
  'trick question',
] as const

export const OT_PERSONAL_WORDS = [
  'you', 'your', 'yours', 'we', 'our', 'us', 'i', 'me', 'my',
] as const

/** Function words and question frames: dropped before two questions are compared. */
export const OT_QUALIFIER_WORDS = [
  'a', 'an', 'the', 'of', 'to', 'for', 'at', 'in', 'on', 'with', 'and', 'or', 'but', 'from', 'by',
  'into', 'onto', 'as', 'about', 'up', 'down', 'out', 'off', 'over', 'under', 'so', 'too', 'very',
  'just', 'all', 'any', 'some', 'every', 'each', 'no', 'not', 'if', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'am', 'has', 'have', 'had', 'do', 'does', 'did', 'done', 'can', 'could',
  'would', 'will', 'should', 'may', 'might', 'must', 'it', 'its', 'they', 'their', 'them', 'he',
  'she', 'his', 'her', 'this', 'that', 'these', 'those', 'there', 'then', 'than', 'what', 'who',
  'whom', 'which', 'when', 'where', 'how', 'why', 'one', 'ones', 'thing', 'things', 'item', 'items',
  'tool', 'tools', 'object', 'name', 'named', 'called', 'call', 'term', 'known', 'use', 'used',
  'using', 'commonly', 'common', 'traditionally', 'traditional', 'typically', 'typical', 'usually',
  'usual', 'often', 'generally', 'once', 'old', 'older', 'early', 'earlier', 'many', 'most', 'much',
  'more', 'also',
] as const

/** Each job's own care list, on top of the shared ones. */
export const OT_OCCUPATION_BLOCKED_TERMS: Readonly<Record<OccupationKey, readonly string[]>> = {
  teacher: [
    'paddle', 'paddling', 'spank', 'spanking', 'cane', 'caning', 'corporal punishment', 'lockdown',
    'detention center',
  ],
  nurse: [
    'dose', 'doses', 'dosage', 'dosages', 'milligram', 'milligrams', 'mg', 'overdose', 'prescribe',
    'prescribed', 'prescription', 'prescriptions', 'diagnose', 'diagnosed', 'diagnosis', 'cure',
    'cures', 'symptom', 'symptoms', 'treat', 'treated', 'treating', 'treatment', 'treatments',
    'opioid', 'opioids', 'morphine', 'insulin', 'antibiotic', 'antibiotics', 'vaccine', 'vaccines',
    'injury', 'injuries', 'wound', 'wounds', 'infection', 'infections', 'euthanasia', 'abortion',
    'pandemic', 'epidemic', 'covid',
  ],
  police: [
    'gun', 'guns', 'firearm', 'firearms', 'pistol', 'pistols', 'revolver', 'revolvers', 'rifle',
    'rifles', 'shotgun', 'ammunition', 'bullet', 'bullets', 'taser', 'tasers', 'pepper spray',
    'baton', 'batons', 'chokehold', 'tactic', 'tactics', 'tactical', 'raid', 'raids', 'swat',
    'sniper', 'pursuit', 'evade', 'evading', 'evasion', 'lethal', 'deadly force', 'use of force',
    'riot', 'riots', 'victim', 'victims', 'robbery', 'assault', 'arrest warrant',
  ],
  military: [
    'gun', 'guns', 'firearm', 'firearms', 'rifle', 'rifles', 'pistol', 'pistols', 'machine gun',
    'missile', 'missiles', 'grenade', 'grenades', 'ammunition', 'bullet', 'bullets', 'artillery',
    'tank', 'tanks', 'warhead', 'warheads', 'nuclear', 'weapon', 'weapons', 'sniper', 'combat',
    'battle', 'battles', 'battlefield', 'casualty', 'casualties', 'enemy', 'enemies', 'target',
    'targets', 'targeting', 'tactic', 'tactics', 'tactical', 'classified', 'top secret', 'covert',
    'evade', 'evasion', 'interrogation', 'invasion', 'ambush', 'wounded', 'prisoner', 'prisoners',
    'pow',
  ],
  trucker: [
    'crash', 'crashes', 'crashed', 'accident', 'accidents', 'fatal', 'fatality', 'fatalities',
    'wreck', 'wrecks', 'jackknifed', 'pills', 'amphetamine', 'amphetamines', 'speeding ticket',
    'penalty', 'penalties', 'violation', 'violations', 'hours of service', 'peterbilt', 'kenworth',
    'mack', 'freightliner', 'volvo', 'navistar', 'cummins', 'caterpillar', 'detroit diesel',
    'western star', 'international harvester',
  ],
  engineer: [
    'calculate', 'calculated', 'calculating', 'calculation', 'compute', 'computed', 'solve',
    'solved', 'equation', 'equations', 'derivative', 'integral', 'disaster', 'disasters', 'collapse',
    'collapsed', 'explosion', 'explosions', 'weapon', 'weapons', 'nuclear bomb', 'atomic bomb',
    'missile', 'missiles',
  ],
  accountant: [
    'tax rate', 'tax rates', 'tax bracket', 'tax brackets', 'standard deduction', 'deductible',
    'deduction limit', 'filing deadline', 'loophole', 'loopholes', 'evade', 'evasion', 'fraud',
    'embezzle', 'embezzlement', 'embezzled', 'penalty', 'penalties', 'ponzi', 'scandal', 'scandals',
    'bankrupt', 'bankruptcy', 'stock tip', 'invest in',
  ],
  postal: [
    'going postal', 'rage', 'anthrax', 'mail bomb', 'shooting', 'dog bite', 'dog bites',
    'postage rate', 'postage rates', 'price of a stamp', 'stamp price',
  ],
}

/** Synonyms folded before two questions are compared: "blackboard" is "chalkboard". */
export const OT_ALIASES: Readonly<Record<string, string>> = {
  blackboard: 'chalkboard', blackboards: 'chalkboard', chalkboards: 'chalkboard', slate: 'slate',
  teachers: 'teacher', schoolteacher: 'teacher', schoolteachers: 'teacher', instructor: 'teacher',
  instructors: 'teacher', pupil: 'student', pupils: 'student', students: 'student',
  schoolchildren: 'student', classroom: 'class', classrooms: 'class', nurses: 'nurse',
  wards: 'ward', hospitals: 'hospital', officers: 'officer', policeman: 'officer',
  policemen: 'officer', policewoman: 'officer', constable: 'officer', cop: 'officer',
  cops: 'officer', soldiers: 'soldier', troops: 'soldier', servicemen: 'soldier',
  serviceman: 'soldier', lorry: 'truck', lorries: 'truck', trucks: 'truck', rig: 'truck',
  rigs: 'truck', semi: 'truck', truckers: 'trucker', trucking: 'trucker', engineers: 'engineer',
  engineering: 'engineer', accountants: 'accountant', accounting: 'accountant',
  bookkeeper: 'accountant', bookkeepers: 'accountant', bookkeeping: 'accountant',
  mailman: 'carrier', mailmen: 'carrier', postman: 'carrier', postmen: 'carrier',
  postwoman: 'carrier', carriers: 'carrier', letters: 'letter', mail: 'post', postal: 'post',
  postage: 'post',
}

const QUALIFIERS: ReadonlySet<string> = new Set(OT_QUALIFIER_WORDS)
const PERSONAL: ReadonlySet<string> = new Set(OT_PERSONAL_WORDS)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = wordPattern([...OT_BLOCKED_TERMS, ...OT_FRAMING_TERMS])
const BRAND_RE = wordPattern(OT_BRAND_TERMS)
const TIME_RE = wordPattern(OT_TIME_TERMS)
const HEDGE_RE = wordPattern(OT_HEDGE_TERMS)
const ABSOLUTE_RE = wordPattern(OT_ABSOLUTE_TERMS)
const BAD_CHOICE_RE = wordPattern(OT_BAD_CHOICE_TERMS)
const OCCUPATION_RE = Object.fromEntries(
  Object.entries(OT_OCCUPATION_BLOCKED_TERMS).map(([key, terms]) => [key, wordPattern(terms)]),
) as Record<OccupationKey, RegExp>

const MEDICAL_RE =
  /\bprevent\s+dementia\b|\breverse\s+aging\b|\bcures?\s+for\b|\banti[\s-]?aging\b|\bmemory\s+loss\b/i
const FINANCE_RE =
  /\bguaranteed\s+(return|income|profit)|\binvest\s+now\b|\bget[\s-]?rich\b|\bcrypto|\bbitcoin\b|\bday[\s-]?trad|\bpenny\s+stock/i
const NUMERIC_HEDGE_RE =
  /\b(about|around|nearly|almost|roughly|approximately|up\s+to|more\s+than|less\s+than|fewer\s+than)\s+\$?£?\d/i
const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2})s?\b/g
const QUESTION_ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().:;&%£$/"“”?]+$/
const CHOICE_ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().&%£$/"“”]+$/
const SENTENCE_ALLOWED_RE = /^[A-Za-z0-9 ,'’\-–().:;&%£$/"“”]+$/
const TOPIC_ALLOWED_RE = /^[a-z0-9 '’-]+$/
const INNER_SENTENCE_RE = /[.;:!?]\s+[A-Z]/
const ABBREVIATION_RE =
  /\b(?:U\.S|U\.K|Mr|Mrs|Ms|Dr|St|No|Jr|Sr|Lt|Sgt|Cpl|Pvt|Col|Gen|Capt|Maj|Adm|a\.m|p\.m|e\.g|i\.e)\./gi
const NUMBER_RE = /^\s*(\(?(\d{1,2}|[A-Da-d])[.):]\s+|[-*•]\s+)/
const LABEL_RE = /^\s*(question|answer|correct answer|choice|option|note|fact|explanation|topic)\s*:\s*/i
const EDGE_TRIM_RE = /^['‘’\s]+|['‘’\s]+$/g

export function isUnsafeOtCopy(text: string, occupation: OccupationKey): boolean {
  return (
    MEDICAL_RE.test(text) ||
    FINANCE_RE.test(text) ||
    BLOCKED_RE.test(text) ||
    BRAND_RE.test(text) ||
    OCCUPATION_RE[occupation].test(text)
  )
}

/** Worded so it is true only for now, only roughly, or only by hearsay. */
export function isUnverifiableOtCopy(text: string): boolean {
  if (TIME_RE.test(text) || HEDGE_RE.test(text) || NUMERIC_HEDGE_RE.test(text)) return true
  return [...text.matchAll(YEAR_RE)].some((match) => Number(match[1]) > OT_LIMITS.latestYear)
}

/* ------------------------------------------------------------------ *
 * One fact once
 * ------------------------------------------------------------------ */

/** Fold plurals and regular verb endings. Deliberately crude: only ever compared with another stem. */
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

/** The words that carry a question's meaning: qualifiers dropped, endings and synonyms folded. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of rawTokens(text)) {
    if (QUALIFIERS.has(raw)) continue
    const word = OT_ALIASES[raw] ?? raw
    const stemmed = stem(word)
    out.add(OT_ALIASES[stemmed] ?? stemmed)
  }
  return out
}

const folded = (text: string) => rawTokens(text).join(' ')
const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((token) => b.has(token)).length
const isSubset = (a: ReadonlySet<string>, b: ReadonlySet<string>) => [...a].every((token) => b.has(token))

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = sharedCount(a, b)
  const union = a.size + b.size - shared
  return union === 0 ? 1 : shared / union
}

/** Share of content words two questions may have in common before they are one question. */
const QUESTION_REPEAT_JACCARD = 0.6

/** True when two answers name the same thing: "The chalk" / "Chalk". */
export function answersMatch(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return folded(first) === folded(second)
  return a.size === b.size && isSubset(a, b)
}

/** True when one topic names the other: "chalk" / "blackboard chalk". */
export function topicsRepeat(first: string, second: string): boolean {
  const a = contentTokens(first)
  const b = contentTokens(second)
  if (a.size === 0 || b.size === 0) return folded(first) === folded(second)
  return isSubset(a, b) || isSubset(b, a)
}

/**
 * True when two questions test the same fact, however they are worded — the
 * same answer, the same topic, or most of the same content words.
 */
export function questionsRepeat(item: OtQuestion, other: OtQuestion): boolean {
  if (answersMatch(item.answer, other.answer) || topicsRepeat(item.topic, other.topic)) return true
  return jaccard(contentTokens(item.question), contentTokens(other.question)) >= QUESTION_REPEAT_JACCARD
}

/**
 * What a printed question is remembered by: "teacher: blackboard chalk = chalk".
 * The occupation keeps one job's answers from ruling out another's.
 */
export function otLabel(occupation: OccupationKey, item: Pick<OtQuestion, 'topic' | 'answer'>): string {
  const topic = folded(item.topic).slice(0, 28).trim()
  const answer = folded(item.answer).slice(0, 20).trim()
  return `${occupation}: ${topic} = ${answer}`.slice(0, 60).trim()
}

/** True when `label` — a printed question's label — names this question's fact. */
export function labelRepeats(item: OtQuestion, label: string, occupation: OccupationKey): boolean {
  let text = String(label ?? '').trim()
  const colon = text.indexOf(': ')
  if (colon >= 0) {
    if (text.slice(0, colon).trim().toLowerCase() !== occupation) return false
    text = text.slice(colon + 2)
  }
  const equals = text.indexOf(' = ')
  const topic = equals >= 0 ? text.slice(0, equals) : text
  const answer = equals >= 0 ? text.slice(equals + 3) : ''
  if (answer.trim() && answersMatch(item.answer, answer)) return true
  return Boolean(topic.trim()) && topicsRepeat(item.topic, topic)
}

/* ------------------------------------------------------------------ *
 * Gates
 * ------------------------------------------------------------------ */

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_TRIM_RE, '')
}

function stripLabels(raw: unknown): string {
  return clean(clean(raw).replace(NUMBER_RE, '').replace(LABEL_RE, ''))
}

function mostlyCaps(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g) ?? []
  const upper = letters.filter((ch) => ch >= 'A' && ch <= 'Z').length
  return letters.length === 0 || upper > letters.length * 0.4
}

const balancedQuotes = (text: string) =>
  (text.match(/"/g) ?? []).length % 2 === 0 &&
  (text.match(/“/g) ?? []).length === (text.match(/”/g) ?? []).length
const personal = (text: string) => rawTokens(text).some((token) => PERSONAL.has(token))
const wordCount = (text: string) => text.split(' ').filter(Boolean).length

/** One plain question ending in a single question mark — or null. */
export function normalizeOtQuestionText(
  raw: unknown,
  occupation: OccupationKey,
  budget = MAX_QUESTION_CHARS,
): string | null {
  const text = stripLabels(raw)
  if (!text.endsWith('?') || text.split('?').length !== 2) return null
  if (!QUESTION_ALLOWED_RE.test(text) || !balancedQuotes(text)) return null
  if (!/^[A-Z]/.test(text) || mostlyCaps(text)) return null
  if (wordCount(text) > OT_LIMITS.maxQuestionWords) return null
  if (text.length < OT_LIMITS.minQuestionChars || text.length > budget) return null
  if (personal(text) || ABSOLUTE_RE.test(text)) return null
  if (isUnsafeOtCopy(text, occupation) || isUnverifiableOtCopy(text)) return null
  return text
}

/** One short answer choice, with no closing full stop — or null. */
export function normalizeOtChoice(
  raw: unknown,
  occupation: OccupationKey,
  budget = MAX_CHOICE_CHARS,
): string | null {
  let text = stripLabels(raw)
  if (text.endsWith('.') && !text.endsWith('..')) text = text.slice(0, -1).trimEnd()
  if (!text || !CHOICE_ALLOWED_RE.test(text) || !balancedQuotes(text)) return null
  if (!/^[A-Z0-9"“$£]/.test(text)) return null
  // Short acronyms ("CPA", "ZIP code") are fine; a shouted phrase is not.
  if ((text.match(/[A-Za-z]/g) ?? []).length > 6 && mostlyCaps(text)) return null
  if (wordCount(text) > OT_LIMITS.maxChoiceWords) return null
  if (text.length < OT_LIMITS.minChoiceChars || text.length > budget) return null
  if (personal(text) || BAD_CHOICE_RE.test(text)) return null
  if (isUnsafeOtCopy(text, occupation) || isUnverifiableOtCopy(text)) return null
  return text
}

/** One standalone sentence for the answer page, ending in a full stop — or null. */
export function normalizeOtExplanation(
  raw: unknown,
  occupation: OccupationKey,
  budget = MAX_EXPLANATION_CHARS,
): string | null {
  const text = stripLabels(raw).replace(/[\s.]+$/, '')
  if (!text || text.includes('?') || text.includes('!')) return null
  if (!SENTENCE_ALLOWED_RE.test(text)) return null
  if (INNER_SENTENCE_RE.test(text.replace(ABBREVIATION_RE, 'abbr'))) return null
  if (!balancedQuotes(text) || !/^[A-Z]/.test(text) || mostlyCaps(text)) return null
  if (wordCount(text) > OT_LIMITS.maxExplanationWords) return null
  const sentence = `${text}.`
  if (sentence.length < OT_LIMITS.minExplanationChars || sentence.length > budget) return null
  if (personal(sentence) || isUnsafeOtCopy(sentence, occupation) || isUnverifiableOtCopy(sentence)) {
    return null
  }
  return sentence
}

/** A short noun phrase naming the fact under test ("blackboard chalk") — or null. */
export function normalizeOtTopic(raw: unknown): string | null {
  const text = clean(raw).replace(/^[\s.:;,]+|[\s.:;,]+$/g, '').toLowerCase()
  if (!text || !TOPIC_ALLOWED_RE.test(text)) return null
  const words = wordCount(text)
  if (words < 1 || words > 6 || text.length > 48) return null
  return contentTokens(text).size > 0 ? text : null
}

/** The right answer must not give itself away by being far longer or shorter. */
function choicesBalanced(choices: readonly string[]): boolean {
  const lengths = choices.map((choice) => choice.length)
  const shortest = Math.min(...lengths)
  const longest = Math.max(...lengths)
  const ratio = OT_LIMITS.choiceLengthRatioPercent / 100
  return longest <= Math.max(shortest * ratio, shortest + OT_LIMITS.choiceLengthSlackChars)
}

/** Four different choices: never the same words, never one inside another ("Chalk" / "Coloured chalk"). */
function choicesDistinct(choices: readonly string[]): boolean {
  for (let i = 0; i < choices.length; i++) {
    const a = contentTokens(choices[i]!)
    for (let j = i + 1; j < choices.length; j++) {
      const b = contentTokens(choices[j]!)
      if (folded(choices[i]!) === folded(choices[j]!)) return false
      if (a.size > 0 && b.size > 0 && (isSubset(a, b) || isSubset(b, a))) return false
    }
  }
  return true
}

/** One complete, checked question from raw service output — or null, never a repair. */
export function normalizeOtQuestion(raw: unknown, occupation: OccupationKey): OtQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  // Only the service's blind check can say a question is right enough to print.
  if (record.verified !== true) return null
  const topic = normalizeOtTopic(record.topic)
  const question = normalizeOtQuestionText(record.question, occupation)
  const answer = normalizeOtChoice(record.answer, occupation)
  const explanation = normalizeOtExplanation(record.explanation, occupation)
  if (!topic || !question || !answer || !explanation) return null
  if (!Array.isArray(record.distractors) || record.distractors.length !== OT_CHOICE_COUNT - 1) return null
  const distractors = record.distractors.map((value) => normalizeOtChoice(value, occupation))
  if (distractors.some((d) => d === null)) return null
  const choices = [answer, ...(distractors as string[])]
  if (!choicesDistinct(choices) || !choicesBalanced(choices)) return null
  // A question that already holds its answer asks nothing.
  const answerTokens = contentTokens(answer)
  const questionTokens = contentTokens(question)
  if (answerTokens.size > 0 && isSubset(answerTokens, questionTokens)) return null
  // The note has to be about this question, not a stray fact.
  const noteTokens = contentTokens(explanation)
  if (![...noteTokens].some((token) => answerTokens.has(token) || questionTokens.has(token))) return null
  return { topic, question, answer, distractors: distractors as OtQuestion['distractors'], explanation }
}

/**
 * Normalize → gate → drop repeats → take `cap`.
 *
 * `avoid` holds labels of questions this seller's book already printed, so a
 * reply that ignores the prompt's avoid list still cannot repeat one.
 */
export function selectOtQuestions(
  raw: unknown,
  options: { occupation: OccupationKey; cap: number; avoid?: readonly string[] },
): OtQuestion[] {
  const { occupation, cap, avoid = [] } = options
  const out: OtQuestion[] = []
  if (!Array.isArray(raw)) return out
  for (const entry of raw) {
    const item = normalizeOtQuestion(entry, occupation)
    if (!item) continue
    if (avoid.some((label) => labelRepeats(item, label, occupation))) continue
    if (out.some((kept) => questionsRepeat(item, kept))) continue
    out.push(item)
    if (out.length >= cap) break
  }
  return out
}

/** The service question a validated one came from — for handing back to generate. */
export function otServiceQuestion(item: OtQuestion): OccupationTriviaQuestion {
  return { ...item, distractors: [...item.distractors], verified: true }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseOtPayload(remote: unknown): {
  occupation: OccupationKey | null
  questions: readonly OccupationTriviaQuestion[]
} {
  if (!remote || typeof remote !== 'object') return { occupation: null, questions: [] }
  const payload = remote as Partial<OccupationTriviaResponse>
  const occupation = OT_OCCUPATIONS.some((o) => o.value === payload.occupation)
    ? (payload.occupation as OccupationKey)
    : null
  return { occupation, questions: Array.isArray(payload.questions) ? payload.questions : [] }
}

/* ------------------------------------------------------------------ *
 * Order and letters
 * ------------------------------------------------------------------ */

/** Keep this game's draws independent of other games on the same seed. */
const ORDER_SALT = 0x6f746f72
const LETTER_SALT = 0x6f746c74
const CHOICE_SALT = 0x6f746368

/** The order the questions read in: the service's questions, shuffled by seed. */
export function orderOtQuestions<T>(items: readonly T[], seed: number): T[] {
  return createRng(((seed >>> 0) ^ ORDER_SALT) >>> 0).shuffle(items)
}

/**
 * The letter each question's right answer sits under, as a choice index.
 *
 * Dealt from shuffled A–D decks, one deck per four questions: over a pack of
 * ten every letter is right two or three times, and no letter can be right
 * three times running (a deck never repeats a letter, so a run is at most two,
 * across a deck boundary).
 */
export function dealOtAnswerSlots(count: number, seed: number): number[] {
  const rng = createRng(((seed >>> 0) ^ LETTER_SALT) >>> 0)
  const deck = Array.from({ length: OT_CHOICE_COUNT }, (_, i) => i)
  const out: number[] = []
  while (out.length < count) out.push(...rng.shuffle(deck))
  return out.slice(0, count)
}

/** The four choices in print order: the answer at `slot`, the wrong ones shuffled round it. */
export function arrangeOtChoices(item: OtQuestion, slot: number, seed: number, index: number): string[] {
  const rng = createRng(((seed >>> 0) ^ CHOICE_SALT ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0)
  const wrong = rng.shuffle(item.distractors)
  const choices: string[] = []
  for (let i = 0; i < OT_CHOICE_COUNT; i++) choices.push(i === slot ? item.answer : wrong.shift()!)
  return choices
}
