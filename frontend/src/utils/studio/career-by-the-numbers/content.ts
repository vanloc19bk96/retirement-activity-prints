import type {
  CareerNumbersDistance,
  CareerNumbersResponse,
  CareerNumbersTone,
  CareerNumbersWorkplace,
} from '@/types/studio-career-numbers.types'
import { createRng } from '../studio-rng'
import { BL_BRAND_TERMS, keysRepeat, stem, type IdeaKey } from '../bucket-list/content'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { possessive } from '../who-knows-retiree-best/content'

/**
 * What one Career By the Numbers question is, every rule it must pass to
 * print, and how a handful of questions become one varied, balanced set.
 *
 * A question asks the retiree for one fun estimate about their working life —
 * "About how many cups of tea or coffee powered your career?" — and the page
 * gives it a line and a unit: "About ________ cups". It has one question mark,
 * says "how many" exactly once, speaks to "you", names its time frame (a
 * career, a typical week, the busiest day) so nobody wonders whether to write
 * a daily figure or a lifetime total, and carries no digits: the numbers are
 * the retiree's to write, never invented for them. Its unit is taken from the
 * question itself and never money, weight or "things". Nothing about pay,
 * health, age, memory, stress, alcohol, beliefs, romance, mistakes, arguments,
 * being fired or quitting.
 *
 * A set is judged as a whole, not question by question: mostly different
 * themes; no group of themes swamping it (one drinks question, one meetings
 * question, one commute question — counted by what a question is really
 * about, whatever its brief said); at least three in ten playful and three in
 * ten nostalgic; no question shape, opening or unit everywhere; and, where it
 * came back, one question about the road to retirement to close on.
 *
 * These gates mirror `backend/app/services/studio_career_numbers_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only whole, valid questions reach the
 * editor. A question is never repaired beyond its first capital and its
 * apostrophes. The word lists are the service's own
 * (`backend/app/data/studio/career-by-the-numbers/prompt.json`), checked equal
 * by `content.test.ts`; brands are the Bucket List's list, as there.
 */

export const CBN_TEMPLATE_KEY = 'career-by-the-numbers'
export const CBN_DEFAULT_TITLE = 'Career By the Numbers'

/** Keeps this game's shuffle out of step with the other games'. */
export const CBN_SALT = 0x63626e75

export const CBN_TONES: readonly CareerNumbersTone[] = ['playful', 'nostalgic']

/** Questions a set can print; the page count follows from the trim. */
export const CBN_COUNTS = [6, 8, 10, 12, 15, 20] as const
/** Two comfortable pages on a 6 x 9. */
export const CBN_DEFAULT_COUNT = 8

export function parseCbnCount(raw: unknown): number {
  const value = Number(raw)
  return (CBN_COUNTS as readonly number[]).includes(value) ? value : CBN_DEFAULT_COUNT
}

export const CBN_WORKPLACES: readonly { value: CareerNumbersWorkplace; label: string; help: string }[] = [
  {
    value: 'any',
    label: 'Any kind of work',
    help: 'Questions anyone who has worked can answer — no desks, email or commute assumed.',
  },
  {
    value: 'office',
    label: 'Office or corporate',
    help: 'Desks, email, meetings and the printer join the everyday moments.',
  },
  {
    value: 'school',
    label: 'School or college',
    help: 'Lessons, the staff room, marking and school trips join in.',
  },
  {
    value: 'healthcare',
    label: 'Hospital, clinic or care',
    help: 'Shifts, handovers and patients helped join in — never anything medical.',
  },
  {
    value: 'service',
    label: 'Shop, restaurant or hotel',
    help: 'Shifts, customers served, the till and the stockroom join in.',
  },
  {
    value: 'trades',
    label: 'Workshop, site or on the road',
    help: 'Tools, the van, early starts and distances driven join in.',
  },
]

export function parseCbnWorkplace(raw: unknown): CareerNumbersWorkplace {
  return CBN_WORKPLACES.some((w) => w.value === raw) ? (raw as CareerNumbersWorkplace) : 'any'
}

export const CBN_DISTANCES: readonly { value: CareerNumbersDistance; label: string; unit: string }[] = [
  { value: 'miles', label: 'Miles', unit: 'miles' },
  { value: 'km', label: 'Kilometres', unit: 'kilometres' },
]

export function parseCbnDistance(raw: unknown): CareerNumbersDistance {
  return raw === 'km' ? 'km' : 'miles'
}

/**
 * The page heading: the seller's own, or — while the default is untouched and
 * a name is set — "Linda’s Career By the Numbers". Blank when titles are off.
 */
export function cbnTitleFor(rawTitle: unknown, name: string): string {
  const title = String(rawTitle ?? '').trim()
  if (!title) return ''
  return name && title === CBN_DEFAULT_TITLE ? `${possessive(name)} ${CBN_DEFAULT_TITLE}` : title
}

/**
 * How the page is played. Estimates are the whole point, and the one sum an
 * estimate might lean on is offered, clearly as a rough guide.
 */
export const CBN_INSTRUCTION =
  'Your working life in numbers! Write a best guess on each line — nobody’s checking. Tip: a full-time year is about 48 working weeks.'

export const CBN_AI_EMPTY_MESSAGE = 'Could not write fresh career questions this time. Please try again.'
export const CBN_SHORT_MESSAGE =
  'Could not gather enough distinct, well-balanced questions this time. Please try again.'
export const CBN_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for Career By the Numbers. Pick a larger page in Settings.'
export const CBN_BUILD_FAILED_MESSAGE = 'Could not lay out these questions on your page. Please try again.'

/* The service's limits, themes, groups, shapes and word lists, verbatim. */
/** Mirrors `limits` in the service's prompt.json. */
export const CBN_LIMITS = {
  rateLimitPerWindow: 10,
  maxOutputTokens: 6144,
  maxAttempts: 2,
  maxItems: 20,
  capBase: 20,
  spares: 8,
  maxAsk: 28,
  nostalgicPercent: 40,
  minQuestionChars: 24,
  maxQuestionChars: 110,
  minQuestionWords: 6,
  maxQuestionWords: 20,
  maxUnitChars: 16,
  maxUnitWords: 2,
  maxConceptChars: 40,
} as const

/** The theme every full set plans first: the road to retirement. Mirrors `anchorTheme`. */
export const CBN_ANCHOR_THEME = 'finish-line'

/** Theme → the group it balances under. */
export const CBN_THEMES: Readonly<Record<string, string>> = {
  'finish-line': 'finish', 'hot-drinks': 'drinks', 'snacks': 'food', 'lunch': 'food', 'meetings': 'meetings',
  'messages': 'communication', 'phone': 'communication', 'commute': 'commute', 'work-travel': 'travel',
  'mornings': 'routine', 'weekdays': 'routine', 'shifts': 'time', 'breaks': 'routine', 'clock': 'time',
  'projects': 'output', 'deadlines': 'output', 'paperwork': 'output', 'supplies': 'supplies', 'gear': 'gear',
  'coworkers': 'people', 'helping': 'helping', 'chats': 'conversations', 'celebrations': 'celebrations',
  'learning': 'learning', 'career-path': 'milestones', 'tech': 'tech', 'workspace': 'workspace',
  'time-off': 'time-off',
}

/** Each group's share of a full set of `capBase` questions. */
export const CBN_GROUP_MAX: Readonly<Record<string, number>> = {
  'finish': 1, 'drinks': 1, 'food': 2, 'meetings': 1, 'communication': 2, 'commute': 1, 'travel': 1,
  'routine': 3, 'time': 2, 'output': 3, 'supplies': 1, 'gear': 1, 'people': 2, 'helping': 2,
  'conversations': 1, 'celebrations': 2, 'learning': 1, 'milestones': 2, 'tech': 1, 'workspace': 1,
  'time-off': 2,
}

export const CBN_SHAPES: readonly string[] = ['career-total', 'typical', 'guess', 'tally', 'record']

/** Words that give a question away as really being about a group. */
export const CBN_SUBJECT_WORDS: Readonly<Record<string, readonly string[]>> = {
  'drinks': ['drink'],
  'food': ['snack', 'lunch'],
  'meetings': ['meeting'],
  'communication': ['email', 'phone'],
  'commute': ['commute'],
  'supplies': ['supply'],
  'tech': ['tech', 'printer'],
}

/** A question must name one: a career, the years, a typical week, the busiest day. */
export const CBN_SCOPE_TERMS: readonly string[] = [
  'career', 'careers', 'working life', 'working lives', 'working years', 'working days', 'working week',
  'over the years', 'all those years', 'all the years', 'through the years', 'along the way', 'typical',
  'average', 'usual', 'busiest', 'quietest', 'a day', 'a week', 'a month', 'a year', 'a workday', 'a shift',
  'each day', 'each week', 'each month', 'each year', 'each workday', 'each shift', 'every day', 'every week',
  'every month', 'every year', 'every workday', 'every shift', 'per day', 'per week', 'per month', 'per year',
  'per shift', 'first day', 'first week', 'first year', 'last day', 'last week', 'last year', 'final day',
  'final year',
]

/** A question speaks to the retiree: one of these must be in it. */
export const CBN_READER_WORDS: readonly string[] = [
  'you', 'your', 'yours', 'yourself', 'youd', 'youre', 'youve', 'youll',
]

export const CBN_FIRST_PERSON_WORDS: readonly string[] = [
  'i', 'me', 'my', 'mine', 'im', 'ive', 'id', 'myself',
]

export const CBN_GENDERED_WORDS: readonly string[] = [
  'he', 'she', 'him', 'her', 'his', 'hers', 'himself', 'herself', 'hes', 'shes', 'king', 'queen', 'lady',
  'ladies', 'gentleman', 'gentlemen', 'guy', 'guys', 'gal', 'gals', 'man', 'woman', 'men', 'women', 'boy',
  'girl', 'boys', 'girls', 'sir', 'madam', 'mr', 'mrs', 'ms', 'wife', 'husband', 'boyfriend', 'girlfriend',
]

export const CBN_BLOCKED_TERMS: readonly string[] = [
  'salary', 'salaries', 'wage', 'wages', 'pay', 'paid', 'payday', 'paydays', 'paycheck', 'paychecks',
  'paycheque', 'paycheques', 'payslip', 'payslips', 'pay rise', 'pay raise', 'bonus', 'bonuses', 'income',
  'money', 'cash', 'dollar', 'dollars', 'pound', 'pounds', 'euro', 'euros', 'cent', 'cents', 'pence', 'penny',
  'debt', 'debts', 'loan', 'loans', 'pension', 'pensions', 'savings', 'tax', 'taxes', 'cost', 'costs', 'price',
  'prices', 'expenses', 'budget', 'budgets', 'bank', 'banks', 'invest', 'investment', 'sick', 'sickness',
  'sick day', 'sick days', 'ill', 'illness', 'injury', 'injuries', 'injured', 'accident', 'accidents', 'hurt',
  'pain', 'painful', 'headache', 'headaches', 'backache', 'medication', 'medicine', 'pill', 'pills', 'surgery',
  'operation', 'diagnosis', 'disease', 'infection', 'virus', 'covid', 'pandemic', 'stress', 'stressed',
  'stressful', 'burnout', 'burned out', 'burnt out', 'anxiety', 'anxious', 'panic', 'depressed', 'depression',
  'tears', 'cried', 'cry', 'crying', 'exhausted', 'exhaustion', 'tired', 'weight', 'weigh', 'calories', 'diet',
  'overweight', 'age', 'aged', 'aging', 'ageing', 'old', 'older', 'oldest', 'elderly', 'senior moment',
  'senior moments', 'forgot', 'forget', 'forgets', 'forgetting', 'forgotten', 'forgetful', 'memory loss',
  'senile', 'dementia', 'wrinkle', 'wrinkles', 'grey hair', 'grey hairs', 'gray hair', 'gray hairs', 'fired',
  'sacked', 'laid off', 'layoff', 'layoffs', 'redundancy', 'redundancies', 'redundant', 'disciplinary',
  'warning letter', 'written warning', 'performance review', 'performance reviews', 'appraisal', 'appraisals',
  'probation', 'demoted', 'demotion', 'mistake', 'mistakes', 'error', 'errors', 'blunder', 'blunders',
  'complaint', 'complaints', 'complain', 'complained', 'complaining', 'grievance', 'lawsuit', 'sued', 'strike',
  'strikes', 'lazy', 'laziest', 'slacker', 'skive', 'skived', 'skiving', 'nap', 'naps', 'napping', 'asleep',
  'dozed', 'dozing', 'argument', 'arguments', 'argue', 'argued', 'arguing', 'fight', 'fights', 'fought',
  'feud', 'grudge', 'grudges', 'rude', 'gossip', 'gossiped', 'drama', 'yell', 'yelled', 'shout', 'shouted',
  'shouting', 'angry', 'annoying', 'annoyed', 'irritating', 'rant', 'rants', 'blame', 'blamed', 'quit',
  'quitting', 'resign', 'resigned', 'resignation', 'hate', 'hated', 'boring', 'bored', 'beer', 'beers', 'wine',
  'pint', 'pints', 'pub', 'pubs', 'cocktail', 'cocktails', 'drunk', 'hangover', 'hangovers', 'alcohol',
  'booze', 'whisky', 'whiskey', 'vodka', 'happy hour', 'cigarette', 'cigarettes', 'smoke', 'smoking', 'smoked',
  'vape', 'vaping', 'church', 'prayer', 'prayers', 'pray', 'god', 'religion', 'religious', 'christmas',
  'easter', 'hanukkah', 'diwali', 'ramadan', 'politics', 'political', 'election', 'elections', 'vote',
  'voting', 'protest', 'death', 'dead', 'died', 'die', 'dying', 'funeral', 'funerals', 'grave', 'killed',
  'kill', 'romance', 'romantic', 'dating', 'crush', 'flirt', 'flirting', 'affair', 'divorce', 'divorced',
  'toilet', 'toilets', 'bathroom', 'restroom', 'loo', 'employee id', 'employee number', 'staff number',
  'social security', 'national insurance', 'home address', 'quote', 'quotes', 'lyric', 'lyrics', 'celebrity',
  'celebrities', 'crypto', 'bitcoin',
]

/** A unit must name what is counted: never vague, never money, weight or percent. */
export const CBN_BLOCKED_UNITS: readonly string[] = [
  'things', 'thing', 'items', 'item', 'stuff', 'units', 'unit', 'amount', 'amounts', 'total', 'totals',
  'number', 'numbers', 'points', 'percent', 'kilograms', 'kilos', 'grams', 'litres', 'liters', 'gallons',
]

export const CBN_MILES_WORDS: readonly string[] = [
  'mile', 'miles',
]

export const CBN_KILOMETRES_WORDS: readonly string[] = [
  'kilometre', 'kilometres', 'kilometer', 'kilometers', 'km', 'kms',
]

export const CBN_QUALIFIER_WORDS: readonly string[] = [
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'as', 'into', 'onto',
  'up', 'out', 'over', 'off', 'and', 'or', 'but', 'so', 'if', 'than', 'then', 'that', 'this', 'these', 'those',
  'there', 'here', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'many', 'much',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'has', 'have', 'had', 'it', 'its',
  'they', 'their', 'them', 'we', 'our', 'us', 'you', 'your', 'yours', 'yourself', 'roughly', 'around',
  'approximately', 'nearly', 'almost', 'estimate', 'guess', 'say', 'would', 'could', 'might', 'ever', 'all',
  'any', 'some', 'one', 'just', 'only', 'very', 'really', 'whole', 'entire', 'career', 'careers', 'life',
  'lives', 'years', 'year', 'week', 'weeks', 'month', 'months', 'typical', 'average', 'usual', 'busiest',
  'quietest', 'along', 'way', 'through', 'each', 'every', 'per', 'total', 'number', 'time', 'times', 'hour',
  'hours', 'minute', 'minutes', 'mile', 'miles', 'kilometre', 'kilometres', 'kilometer', 'kilometers', 'km',
  'lot', 'lots', 'altogether', 'single', 'first', 'last', 'final', 'will', 'going', 'down', 'still',
]

export const CBN_GENERIC_WORDS: readonly string[] = [
  'work', 'worked', 'working', 'works', 'workplace', 'job', 'spend', 'spent', 'make', 'made', 'take', 'took',
  'taken', 'get', 'got', 'gotten', 'go', 'went', 'gone', 'use', 'used', 'see', 'saw', 'seen', 'attend',
  'attended', 'send', 'sent', 'receive', 'received', 'give', 'gave', 'given', 'enjoy', 'enjoyed', 'power',
  'powered', 'keep', 'kept', 'put', 'show', 'showed', 'start', 'started', 'finish', 'finished', 'complete',
  'completed', 'need', 'needed', 'manage', 'managed', 'reckon', 'think', 'happen', 'happened', 'end', 'ended',
]

export const CBN_PHRASES: Readonly<Record<string, string>> = {
  'a typical day': '', 'a typical workday': '', 'a typical shift': '', 'a typical week': '', 'a day': '',
  'each day': '', 'every day': '', 'per day': '', 'a workday': '', 'each workday': '', 'every workday': '',
  'a shift': '', 'each shift': '', 'every shift': '', 'per shift': '', 'your busiest day': '',
  'your busiest week': '', 'if you had to guess': '', 'at a guess': '', 'over the years': '',
  'all those years': '', 'working life': '', 'working years': '', 'hours worked': 'workhours',
  'hours did you work': 'workhours', 'hours you worked': 'workhours', 'hours of work': 'workhours',
  'hours at work': 'workhours', 'hours on the job': 'workhours', 'to and from work': 'commute',
  'getting to work': 'commute', 'on the way to work': 'commute', 'on the way in': 'commute',
  'way to work': 'commute', 'way home': 'commute', 'journey to work': 'commute', 'journeys to work': 'commute',
  'train ride': 'commute', 'train rides': 'commute', 'bus ride': 'commute', 'bus rides': 'commute',
  'work trip': 'worktrip', 'work trips': 'worktrip', 'business trip': 'worktrip', 'business trips': 'worktrip',
  'trips for work': 'worktrip', 'travelling for work': 'worktrip', 'traveling for work': 'worktrip',
  'alarm clock': 'alarm', 'alarm clocks': 'alarm', 'hit snooze': 'alarm', 'hitting snooze': 'alarm',
  'sticky note': 'stickynote', 'sticky notes': 'stickynote', 'reply all': 'email', 'video call': 'meeting',
  'video calls': 'meeting', 'phone call': 'phone', 'phone calls': 'phone', 'paper clip': 'supply',
  'paper clips': 'supply', 'rubber band': 'supply', 'rubber bands': 'supply', 'thank-you': 'thanks',
  'thank you': 'thanks', 'thank-yous': 'thanks', 'vacation days': 'holiday', 'vacation day': 'holiday',
  'holiday days': 'holiday', 'days of vacation': 'holiday', 'days of holiday': 'holiday',
  'days off': 'holiday', 'time off': 'holiday', 'annual leave': 'holiday', 'public holiday': 'publicholiday',
  'public holidays': 'publicholiday', 'bank holiday': 'publicholiday', 'bank holidays': 'publicholiday',
  'holiday party': 'party', 'holiday parties': 'party', 'leaving party': 'party', 'leaving parties': 'party',
  'leaving do': 'party', 'leaving dos': 'party', 'out-of-office': 'outofoffice',
  'out of office': 'outofoffice', 'to-do list': 'todo', 'to-do lists': 'todo', 'to do list': 'todo',
  'to do lists': 'todo', 'car park': 'parking', 'parking lot': 'parking', 'break room': 'breakroom',
  'staff room': 'breakroom', 'new starter': 'newstarter', 'new starters': 'newstarter',
  'new hire': 'newstarter', 'new hires': 'newstarter', 'monday morning': 'monday', 'monday mornings': 'monday',
  'friday afternoon': 'friday', 'friday afternoons': 'friday', 'job title': 'jobtitle',
  'job titles': 'jobtitle', 'name badge': 'badge', 'name badges': 'badge', 'id card': 'badge',
  'id cards': 'badge', 'happy birthday': 'birthday',
}

export const CBN_SYNONYMS: Readonly<Record<string, string>> = {
  'coffee': 'drink', 'coffees': 'drink', 'tea': 'drink', 'teas': 'drink', 'cuppa': 'drink', 'cuppas': 'drink',
  'cup': 'drink', 'cups': 'drink', 'mug': 'drink', 'mugs': 'drink', 'kettle': 'drink', 'espresso': 'drink',
  'latte': 'drink', 'brew': 'drink', 'brews': 'drink', 'drinks': 'drink', 'refill': 'drink',
  'refills': 'drink', 'urn': 'drink', 'snacks': 'snack', 'biscuit': 'snack', 'biscuits': 'snack',
  'cookie': 'snack', 'cookies': 'snack', 'sweets': 'snack', 'candy': 'snack', 'doughnut': 'snack',
  'doughnuts': 'snack', 'donut': 'snack', 'donuts': 'snack', 'pastry': 'snack', 'pastries': 'snack',
  'treat': 'snack', 'treats': 'snack', 'chocolate': 'snack', 'chocolates': 'snack', 'lunches': 'lunch',
  'lunchtime': 'lunch', 'sandwich': 'lunch', 'sandwiches': 'lunch', 'meal': 'lunch', 'meals': 'lunch',
  'leftovers': 'lunch', 'meetings': 'meeting', 'huddle': 'meeting', 'huddles': 'meeting',
  'briefing': 'meeting', 'briefings': 'meeting', 'handover': 'meeting', 'handovers': 'meeting',
  'emails': 'email', 'e-mail': 'email', 'e-mails': 'email', 'inbox': 'email', 'message': 'email',
  'messages': 'email', 'memo': 'email', 'memos': 'email', 'phones': 'phone', 'call': 'phone', 'calls': 'phone',
  'caller': 'phone', 'callers': 'phone', 'voicemail': 'phone', 'commutes': 'commute', 'commuting': 'commute',
  'traffic': 'commute', 'journey': 'commute', 'journeys': 'commute', 'snooze': 'alarm', 'snoozed': 'alarm',
  'alarms': 'alarm', 'mondays': 'monday', 'fridays': 'friday', 'pen': 'supply', 'pens': 'supply',
  'pencil': 'supply', 'pencils': 'supply', 'highlighter': 'supply', 'highlighters': 'supply',
  'marker': 'supply', 'markers': 'supply', 'stapler': 'supply', 'staplers': 'supply', 'staple': 'supply',
  'staples': 'supply', 'paperclip': 'supply', 'paperclips': 'supply', 'photocopier': 'printer',
  'copier': 'printer', 'printers': 'printer', 'computer': 'tech', 'computers': 'tech', 'laptop': 'tech',
  'laptops': 'tech', 'screen': 'tech', 'screens': 'tech', 'keyboard': 'tech', 'keyboards': 'tech',
  'vacation': 'holiday', 'vacations': 'holiday', 'holidays': 'holiday', 'parties': 'party',
  'celebration': 'party', 'celebrations': 'party', 'gathering': 'party', 'gatherings': 'party',
  'outing': 'party', 'outings': 'party', 'birthdays': 'birthday', 'cards': 'card', 'coworkers': 'coworker',
  'colleague': 'coworker', 'colleagues': 'coworker', 'co-worker': 'coworker', 'co-workers': 'coworker',
  'teammate': 'coworker', 'teammates': 'coworker', 'boss': 'manager', 'bosses': 'manager',
  'managers': 'manager', 'supervisor': 'manager', 'supervisors': 'manager', 'customers': 'customer',
  'client': 'customer', 'clients': 'customer', 'student': 'customer', 'students': 'customer',
  'patient': 'customer', 'patients': 'customer', 'pupil': 'customer', 'pupils': 'customer',
  'guest': 'customer', 'guests': 'customer', 'trained': 'training', 'courses': 'training',
  'course': 'training', 'questions': 'question', 'chats': 'chat', 'chatted': 'chat', 'conversation': 'chat',
  'conversations': 'chat', 'laughs': 'laugh', 'laughter': 'laugh', 'joke': 'laugh', 'jokes': 'laugh',
  'stories': 'story', 'projects': 'project', 'task': 'project', 'tasks': 'project', 'deadlines': 'deadline',
  'forms': 'paperwork', 'file': 'paperwork', 'files': 'paperwork', 'folder': 'paperwork',
  'folders': 'paperwork', 'signatures': 'signature', 'tools': 'tool', 'boots': 'footwear', 'boot': 'footwear',
  'shoes': 'footwear', 'shoe': 'footwear', 'uniforms': 'uniform', 'overalls': 'uniform', 'apron': 'uniform',
  'aprons': 'uniform', 'plants': 'plant', 'keys': 'key', 'passwords': 'password', 'hotels': 'hotel',
  'sunrises': 'sunrise', 'weekends': 'weekend', 'hellos': 'greeting', 'hello': 'greeting',
  'goodbyes': 'greeting', 'goodbye': 'greeting', 'mornings': 'morning', 'workday': 'day', 'workdays': 'day',
}

/** The prompt's own examples. Printed word for word, they are the model copying. */
export const CBN_EXAMPLE_QUESTIONS: readonly string[] = [
  'About how many cups of tea or coffee powered your career?',
  'In a typical week, how many times were you asked where something was kept?',
  'If you had to guess, how many pens wandered off over the years?',
  'How many Monday mornings did you show up for over the years?',
  'On your busiest day, about how many phone calls did you answer?',
]

/** The longest question and unit the page plans for. */
export const MAX_QUESTION_CHARS = CBN_LIMITS.maxQuestionChars
export const MAX_UNIT_CHARS = CBN_LIMITS.maxUnitChars

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = termPattern([...CBN_BLOCKED_TERMS, ...BL_BRAND_TERMS])
const SCOPE_RE = termPattern(CBN_SCOPE_TERMS)
const PHRASE_PATTERNS: readonly (readonly [RegExp, string])[] = Object.entries(CBN_PHRASES)
  .sort(([a], [b]) => b.length - a.length)
  .map(([phrase, replacement]) => [new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'g'), replacement])
const withStems = (words: readonly string[]) => new Set([...words, ...words.map(stem)])
const QUALIFIERS = withStems(CBN_QUALIFIER_WORDS)
const GENERIC = withStems(CBN_GENERIC_WORDS)
const SYNONYMS = new Map(Object.entries(CBN_SYNONYMS))
const READER = new Set(CBN_READER_WORDS)
const FIRST_PERSON = new Set(CBN_FIRST_PERSON_WORDS)
const GENDERED = new Set(CBN_GENDERED_WORDS)
const BLOCKED_UNITS = new Set(CBN_BLOCKED_UNITS)
const DISTANCE_WORDS: Readonly<Record<CareerNumbersDistance, ReadonlySet<string>>> = {
  miles: new Set(CBN_MILES_WORDS),
  km: new Set(CBN_KILOMETRES_WORDS),
}
const EXAMPLES = new Set(CBN_EXAMPLE_QUESTIONS.map((example) => example.toLowerCase()))

const NUMBER_RE = /^\s*(\(?\d{1,2}\s*[.):]\s+|[-*•]\s+)/
/** Letters, spaces, apostrophes, hyphens and commas, then one closing question mark. */
const QUESTION_RE = /^\p{L}(?:[\p{L}\p{M}]|[ ,'’-])*\p{L}\?$/u
/** One or two words of letters, hyphenated or with an apostrophe. */
const UNIT_RE = /^\p{L}+(?:[-’]\p{L}+)*(?: \p{L}+(?:[-’]\p{L}+)*)?$/u
const HOW_MANY_RE = /\bhow many\b/gi
const HOW_MUCH_RE = /\bhow much\b/i
/** "Did you ever count how many…?" reads as a yes-or-no question. */
const YES_NO_RE = /^(?:did|do|does|have|has|had|was|were|is|are|can|could|would|will|should)\b/i
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const WORD_RE = /[\p{L}\p{N}]+/gu

const plain = (text: string) => text.toLowerCase().replace(/’/g, "'").replace(/'/g, '')

function fold(text: string): string {
  let folded = text.toLowerCase().replace(/’/g, "'")
  for (const [pattern, replacement] of PHRASE_PATTERNS) folded = folded.replace(pattern, replacement)
  return folded.replace(/'s\s/g, ' ').replace(/'/g, '')
}

const canon = (word: string) => stem(SYNONYMS.get(word) || SYNONYMS.get(stem(word)) || word)

/** What a question counts: time frame, estimate padding and generic verbs gone, synonyms folded. Mirrors `question_tokens`. */
export function questionTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of fold(text).match(WORD_RE) ?? []) {
    if (QUALIFIERS.has(word) || GENERIC.has(word)) continue
    const canonical = canon(word)
    if (QUALIFIERS.has(canonical) || GENERIC.has(canonical)) continue
    out.add(canonical)
  }
  return out
}

const SUBJECTS: readonly (readonly [string, ReadonlySet<string>])[] = Object.entries(CBN_SUBJECT_WORDS).map(
  ([group, words]) => [group, new Set(words.map((word) => canon(word.toLowerCase())))],
)

/** Groups a question is really about, whatever its brief said: coffee is a drinks question. Mirrors `question_subjects`. */
export function questionSubjects(text: string): Set<string> {
  const words = new Set((fold(text).match(WORD_RE) ?? []).map(canon))
  const out = new Set<string>()
  for (const [group, triggers] of SUBJECTS) {
    for (const trigger of triggers) {
      if (words.has(trigger)) {
        out.add(group)
        break
      }
    }
  }
  return out
}

export const questionKey = (text: string, concept = ''): IdeaKey => ({
  text: text.replace(/\s+/g, ' ').trim().toLowerCase(),
  tokens: questionTokens(text),
  concept: concept ? questionTokens(concept) : new Set(),
})

/** True when a retiree would call two questions the same count asked twice. Mirrors `questions_repeat`. */
export const questionsRepeat = (first: string, second: string) =>
  keysRepeat(questionKey(first), questionKey(second))

export function isUnsafeCbnCopy(text: string): boolean {
  const flat = text.replace(/’/g, "'").replace(/'/g, '')
  return isUnsafeCopy(text) || BLOCKED_RE.test(flat)
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

const wordsOf = (text: string) => new Set(plain(text).match(WORD_RE) ?? [])
const mentions = (words: ReadonlySet<string>, vocabulary: ReadonlySet<string>) => {
  for (const word of words) if (vocabulary.has(word)) return true
  return false
}
const otherDistance = (distance: CareerNumbersDistance) => DISTANCE_WORDS[distance === 'km' ? 'miles' : 'km']

/**
 * One estimate question as printed — or null. Mirrors `normalize_question`.
 */
export function normalizeQuestion(
  raw: unknown,
  budget: number = MAX_QUESTION_CHARS,
  distance: CareerNumbersDistance = 'miles',
): string | null {
  let text = clean(raw).replace(NUMBER_RE, '').replace(EDGE_QUOTES_RE, '').trim().replace(/'/g, '’')
  if (!text || !QUESTION_RE.test(text)) return null
  text = text.slice(0, 1).toUpperCase() + text.slice(1)
  const letters = text.match(/\p{L}/gu) ?? []
  const upper = text.match(/\p{Lu}/gu) ?? []
  if (upper.length > letters.length * 0.3) return null
  const count = text.split(' ').length
  if (count < CBN_LIMITS.minQuestionWords || count > CBN_LIMITS.maxQuestionWords) return null
  if (text.length < CBN_LIMITS.minQuestionChars || text.length > budget) return null
  if ((text.match(HOW_MANY_RE) ?? []).length !== 1 || HOW_MUCH_RE.test(text) || YES_NO_RE.test(text)) return null
  const words = wordsOf(text)
  if (!mentions(words, READER)) return null
  if (mentions(words, FIRST_PERSON) || mentions(words, GENDERED)) return null
  if (mentions(words, otherDistance(distance))) return null
  if (!SCOPE_RE.test(plain(text))) return null
  if (isUnsafeCbnCopy(text)) return null
  if (questionTokens(text).size === 0) return null
  if (EXAMPLES.has(text.toLowerCase())) return null
  return text
}

/** The words as written, endings folded: "call" is in "phone calls", "mugs" is not in "cups". */
const stems = (text: string) => new Set((plain(text).match(WORD_RE) ?? []).map(stem))

/**
 * The unit printed beside the writing line — "cups", "phone calls" — or null.
 * Every word of it must be in the question. Mirrors `normalize_unit`.
 */
export function normalizeUnit(
  raw: unknown,
  question: string,
  budget: number = MAX_UNIT_CHARS,
  distance: CareerNumbersDistance = 'miles',
): string | null {
  const text = clean(raw).replace(/\.+$/, '').trim().toLowerCase().replace(/'/g, '’')
  if (!text || !UNIT_RE.test(text)) return null
  if (text.split(' ').length > CBN_LIMITS.maxUnitWords || text.length < 2 || text.length > budget) return null
  const words = wordsOf(text)
  if (mentions(words, BLOCKED_UNITS) || mentions(words, otherDistance(distance))) return null
  if (isUnsafeCbnCopy(text)) return null
  const inQuestion = stems(question)
  for (const word of stems(text)) if (!inQuestion.has(word)) return null
  return text
}

export function normalizeConcept(raw: unknown): string {
  return clean(raw).toLowerCase().slice(0, CBN_LIMITS.maxConceptChars).trim()
}

const isTheme = (key: string) => Object.prototype.hasOwnProperty.call(CBN_THEMES, key)
export const groupOf = (theme: string) => CBN_THEMES[theme] ?? ''

/** One validated question. */
export interface CbnQuestion {
  question: string
  unit: string
  theme: string
  tone: CareerNumbersTone
  shape: string
  concept: string
}

/** One complete question from raw service output — or null, never a repair. */
export function normalizeCbnItem(raw: unknown, distance: CareerNumbersDistance = 'miles'): CbnQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const theme = String(record.theme ?? '').trim()
  const tone = String(record.tone ?? '').trim() as CareerNumbersTone
  const shape = String(record.shape ?? '').trim()
  if (!isTheme(theme) || !CBN_TONES.includes(tone) || !CBN_SHAPES.includes(shape)) return null
  const question = normalizeQuestion(record.question, MAX_QUESTION_CHARS, distance)
  if (!question) return null
  const unit = normalizeUnit(record.unit, question, MAX_UNIT_CHARS, distance)
  if (!unit) return null
  return { question, unit, theme, tone, shape, concept: normalizeConcept(record.concept) }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseCbnPayload(remote: unknown): readonly unknown[] {
  if (!remote || typeof remote !== 'object') return []
  const questions = (remote as Partial<CareerNumbersResponse>).questions
  return Array.isArray(questions) ? questions : []
}

export const cbnKey = (q: Pick<CbnQuestion, 'question' | 'concept'>) => questionKey(q.question, q.concept)

/** Remembered labels are cut to this, by the service and by the browser alike. */
export const CBN_MEMORY_LABEL_CHARS = 60

/**
 * A question as remembered: from "How many" on, cut on a word to fit the
 * memory. The opening is only the time frame, so the length is spent on what
 * the question counts. Mirrors `memory_label`.
 */
export function cbnMemoryLabel(question: string): string {
  const found = question.search(/\bhow many\b/i)
  let text = found >= 0 ? question.slice(found) : question
  text = text.slice(0, 1).toUpperCase() + text.slice(1)
  if (text.length <= CBN_MEMORY_LABEL_CHARS) return text
  const cut = text.slice(0, CBN_MEMORY_LABEL_CHARS)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim()
}

/**
 * Normalize → gate → drop repeats, in the service's order, spares included.
 * Repeats are caught across the pool and against `avoid` — questions this
 * seller's book already prints — so a reply that ignores the prompt's avoid
 * list still cannot repeat them. `keep` is an earlier pool a top-up adds to.
 */
export function cleanCbnPool(
  raw: unknown,
  options: { avoid?: readonly string[]; keep?: readonly CbnQuestion[]; distance?: CareerNumbersDistance } = {},
): CbnQuestion[] {
  const { avoid = [], keep = [], distance = 'miles' } = options
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => questionKey(label))
  const out = [...keep]
  const kept: IdeaKey[] = keep.map(cbnKey)
  for (const item of Array.isArray(raw) ? raw : []) {
    const question = normalizeCbnItem(item, distance)
    if (!question) continue
    const key = cbnKey(question)
    if (kept.some((other) => keysRepeat(key, other))) continue
    if (avoided.some((other) => keysRepeat(key, other))) continue
    out.push(question)
    kept.push(key)
  }
  return out
}

/** Every group a question counts toward: its brief's and whatever it is really about. */
export function groupsOf(q: Pick<CbnQuestion, 'question' | 'theme'>): Set<string> {
  const groups = questionSubjects(q.question)
  const own = groupOf(q.theme)
  if (own) groups.add(own)
  return groups
}

/** A group's share of a set of `size` questions. Mirrors `group_cap`. */
export const groupCap = (group: string, size: number) =>
  Math.max(1, Math.ceil(((CBN_GROUP_MAX[group] ?? 1) * size) / CBN_LIMITS.capBase))

/** The rules a set of `size` questions keeps as a whole. */
export function cbnSetRules(size: number) {
  return {
    themeMax: 2,
    minThemes: Math.ceil(size * 0.75),
    shapeMax: Math.ceil(size * 0.4),
    openingMax: Math.max(2, Math.ceil(size * 0.3)),
    unitMax: Math.max(2, Math.ceil(size * 0.25)),
    minNostalgic: Math.ceil(size * 0.3),
    minPlayful: Math.ceil(size * 0.3),
  }
}

/** The first two words: "about how", "on a", "if you", "how many". */
export function openingOf(question: string): string {
  return (question.toLowerCase().match(WORD_RE) ?? []).slice(0, 2).join(' ')
}

export const isAnchor = (q: Pick<CbnQuestion, 'theme'>) => q.theme === CBN_ANCHOR_THEME

function sharesIdea(a: IdeaKey, b: IdeaKey): boolean {
  for (const token of a.tokens) if (b.tokens.has(token)) return true
  return false
}

/**
 * Why `candidate` may not join `set` in a set of `size`, or null when it may.
 * `themeCap` lets the picker prefer one question per theme before it allows a
 * second.
 */
export function setConflict(
  set: readonly CbnQuestion[],
  candidate: CbnQuestion,
  size: number,
  themeCap: number = cbnSetRules(size).themeMax,
): string | null {
  const rules = cbnSetRules(size)
  const sameTheme = set.filter((q) => q.theme === candidate.theme)
  if (sameTheme.length >= themeCap) return 'theme'
  for (const group of groupsOf(candidate)) {
    if (set.filter((q) => groupsOf(q).has(group)).length >= groupCap(group, size)) return 'group'
  }
  const toneMax = size - (candidate.tone === 'nostalgic' ? rules.minPlayful : rules.minNostalgic)
  if (set.filter((q) => q.tone === candidate.tone).length >= toneMax) return 'tone'
  if (set.filter((q) => q.shape === candidate.shape).length >= rules.shapeMax) return 'shape'
  const opening = openingOf(candidate.question)
  if (set.filter((q) => openingOf(q.question) === opening).length >= rules.openingMax) return 'opening'
  if (set.filter((q) => q.unit === candidate.unit).length >= rules.unitMax) return 'unit'
  const key = cbnKey(candidate)
  if (set.some((q) => keysRepeat(key, cbnKey(q)))) return 'repeat'
  // Two questions on one theme count two different things, never the same one twice.
  if (sameTheme.some((q) => sharesIdea(key, cbnKey(q)))) return 'idea'
  return null
}

export interface CbnSetPick {
  /** Exactly `size` questions, in pool order — or null when the pool cannot make a set. */
  picks: CbnQuestion[] | null
  /** What was taken, whole set or not: what a top-up is measured against. */
  taken: CbnQuestion[]
}

/**
 * The set's questions, balanced — or null.
 *
 * The road-to-retirement question goes in first where one came back (the
 * service plans it first). Then every theme gets one question, in the
 * service's order, passing over any that would break a set rule or does not
 * fit its row on the page; only then may a theme give a second question
 * counting something else. Never pads with anything that failed a gate.
 */
export function pickCbnSet(
  pool: readonly CbnQuestion[],
  size: number,
  fits: (question: CbnQuestion) => boolean = () => true,
): CbnSetPick {
  const rules = cbnSetRules(size)
  const taken: CbnQuestion[] = []
  const tryTake = (q: CbnQuestion, cap: number) => {
    if (taken.length >= size || taken.includes(q) || !fits(q)) return
    if (setConflict(taken, q, size, cap) === null) taken.push(q)
  }
  const anchor = pool.find((q) => isAnchor(q) && fits(q))
  if (anchor) tryTake(anchor, 1)
  for (const cap of [1, rules.themeMax]) for (const q of pool) tryTake(q, cap)

  const themes = new Set(taken.map((q) => q.theme))
  const nostalgic = taken.filter((q) => q.tone === 'nostalgic').length
  const whole =
    taken.length === size &&
    themes.size >= rules.minThemes &&
    nostalgic >= rules.minNostalgic &&
    size - nostalgic >= rules.minPlayful
  return { picks: whole ? taken : null, taken }
}

/**
 * What a top-up asks for when a pool cannot make a set: themes the set does
 * not use yet (the road to retirement first when it has none), the tone it is
 * short of, and enough questions to fill it with spares for the gates.
 */
export function cbnShortfall(
  taken: readonly CbnQuestion[],
  size: number,
): { themes: string[]; count: number; tone?: CareerNumbersTone } {
  const rules = cbnSetRules(size)
  const used = new Set(taken.map((q) => q.theme))
  let themes = Object.keys(CBN_THEMES).filter((key) => !used.has(key))
  if (!taken.some(isAnchor)) {
    themes = [...themes.filter((key) => key === CBN_ANCHOR_THEME), ...themes.filter((key) => key !== CBN_ANCHOR_THEME)]
  }
  if (themes.length === 0) themes = Object.keys(CBN_THEMES)
  const nostalgic = taken.filter((q) => q.tone === 'nostalgic').length
  const playful = taken.length - nostalgic
  const tone = nostalgic < rules.minNostalgic ? 'nostalgic' : playful < rules.minPlayful ? 'playful' : undefined
  const need = Math.max(2, size - taken.length)
  return { themes, count: Math.min(CBN_LIMITS.maxAsk, need + 4), ...(tone ? { tone } : {}) }
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return 0
}

const sharesGroup = (a: CbnQuestion, b: CbnQuestion) => {
  const groups = groupsOf(b)
  for (const group of groupsOf(a)) if (groups.has(group)) return true
  return false
}

/**
 * The picks in reading order, by seed.
 *
 * The road-to-retirement question closes the page (a nostalgic one if there is
 * none): a last look back before the next chapter. The rest are placed one at
 * a time: a playful question opens, and no question follows one from the same
 * group, with the same opening, shape or unit where anything else is left —
 * so the page never reads as three "About how many…" in a row. Ties break in
 * a seeded order, so every set reads differently.
 */
export function orderCbnSet(picks: readonly CbnQuestion[], seed: number): CbnQuestion[] {
  const rng = createRng((seed ^ CBN_SALT) >>> 0)
  const remaining = rng.shuffle([...picks])
  let closerAt = remaining.findIndex(isAnchor)
  if (closerAt === -1) closerAt = remaining.findIndex((q) => q.tone === 'nostalgic')
  const closer = closerAt === -1 ? null : remaining.splice(closerAt, 1)[0]!
  const out: CbnQuestion[] = []

  while (remaining.length > 0) {
    const prev = out.at(-1)
    let best = 0
    let bestScore: number[] = []
    remaining.forEach((q, index) => {
      const score = [
        out.length === 0 && q.tone !== 'playful' ? 1 : 0,
        prev && sharesGroup(prev, q) ? 1 : 0,
        // With two left, place now the one that would sit beside the closer.
        closer && remaining.length === 2 && sharesGroup(remaining[1 - index]!, closer) ? 1 : 0,
        prev && openingOf(prev.question) === openingOf(q.question) ? 1 : 0,
        prev && prev.shape === q.shape ? 1 : 0,
        prev && prev.unit === q.unit ? 1 : 0,
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

/** One question as the page prints it. */
export interface CbnNumbered extends CbnQuestion {
  /** 1 to the set's size, down the pages. */
  number: number
}

export const numberCbnSet = (ordered: readonly CbnQuestion[]): CbnNumbered[] =>
  ordered.map((q, index) => ({ ...q, number: index + 1 }))

/**
 * Why a set may not print, or null when it may — the preflight's last word on
 * content that has already been picked and ordered: the right number of
 * questions numbered in order, each printable with its unit and distinct in
 * meaning, and every set rule held.
 */
export function cbnSetProblem(
  questions: readonly CbnNumbered[],
  size: number,
  distance: CareerNumbersDistance = 'miles',
): string | null {
  if (questions.length !== size) return `The set holds ${questions.length} questions instead of ${size}.`
  if (questions.some((q, i) => q.number !== i + 1)) return `The questions are not numbered 1 to ${size} in order.`
  for (const q of questions) {
    if (
      normalizeQuestion(q.question, MAX_QUESTION_CHARS, distance) !== q.question ||
      normalizeUnit(q.unit, q.question, MAX_UNIT_CHARS, distance) !== q.unit ||
      !isTheme(q.theme) ||
      !CBN_TONES.includes(q.tone)
    ) {
      return `Question ${q.number} is not suitable for a published activity book.`
    }
  }
  for (let i = 1; i < questions.length; i++) {
    const conflict = setConflict(questions.slice(0, i), questions[i]!, size)
    if (conflict === 'repeat' || conflict === 'idea') {
      return `Question ${i + 1} counts the same thing as an earlier question.`
    }
    if (conflict) return 'The questions need more variety.'
  }
  const rules = cbnSetRules(size)
  if (new Set(questions.map((q) => q.theme)).size < rules.minThemes) return 'The questions need more variety.'
  const nostalgic = questions.filter((q) => q.tone === 'nostalgic').length
  if (nostalgic < rules.minNostalgic || size - nostalgic < rules.minPlayful) {
    return 'The questions need a better mix of funny and nostalgic.'
  }
  return null
}

/** Every question in a pool, in the service's order. */
export const cbnQuestions = (pool: readonly CbnQuestion[]): string[] => pool.map((q) => q.question)
