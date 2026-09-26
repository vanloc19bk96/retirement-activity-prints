import type {
  OfficeAwardsResponse,
  OfficeAwardsTone,
  OfficeAwardsWorkplace,
} from '@/types/studio-office-awards.types'
import { createRng } from '../studio-rng'
import { BL_BRAND_TERMS, keysRepeat, stem, type IdeaKey } from '../bucket-list/content'
import { isUnsafeCopy } from '../retirement-word-search/content-quality'
import { possessive } from '../who-knows-retiree-best/content'

/**
 * What one Office Awards title is, every rule it must pass to print, and how
 * a handful of titles become one varied, balanced, warm set.
 *
 * An award is one short workplace category — "Keeper of the Spare Phone
 * Charger", "Calmest Voice on a Busy Shift" — that makes a coworker think of
 * one colleague straight away and write their name. It is gender neutral,
 * names nobody, never speaks to "you", and is something the winner would be
 * proud or amused to receive: never about appearance, age, health, money,
 * beliefs, romance, family, poor performance, mistakes or personal habits.
 *
 * A set is judged as a whole, not title by title: mostly different themes;
 * no group of themes swamping it (one drinks award, one timekeeping award, a
 * meetings award or two — counted by what a title is really about, whatever
 * its brief said); at least three in ten warm and three in ten playful; no
 * title shape or opening word everywhere; and, where it came back, one
 * farewell award about the retiree to close on.
 *
 * These gates mirror `backend/app/services/studio_office_awards_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only whole, valid awards reach the
 * editor. A title is never repaired beyond its casing and apostrophes. The
 * word lists are the service's own
 * (`backend/app/data/studio/office-awards/prompt.json`), checked equal by
 * `content.test.ts`; brands are the Bucket List's list, as there.
 */

export const OA_TEMPLATE_KEY = 'office-awards'
export const OA_DEFAULT_TITLE = 'Office Awards'

/** Keeps this game's shuffle out of step with the other games'. */
export const OA_SALT = 0x6f617764

export const OA_TONES: readonly OfficeAwardsTone[] = ['playful', 'warm']

/** Awards a set can print; the page count follows from the trim. */
export const OA_COUNTS = [6, 8, 10, 12, 16, 20, 24] as const
/** Two well-filled pages on a 6 x 9 without the "Why" line. */
export const OA_DEFAULT_COUNT = 10

export function parseOaCount(raw: unknown): number {
  const value = Number(raw)
  return (OA_COUNTS as readonly number[]).includes(value) ? value : OA_DEFAULT_COUNT
}

export const OA_WORKPLACES: readonly { value: OfficeAwardsWorkplace; label: string; help: string }[] = [
  {
    value: 'any',
    label: 'Any workplace',
    help: 'Awards any team would recognise — no cubicles or corporate jargon.',
  },
  {
    value: 'office',
    label: 'Office or corporate team',
    help: 'Desks, email, meetings and the printer join the everyday moments.',
  },
  {
    value: 'school',
    label: 'School or college',
    help: 'The staff room, timetables, the photocopier and school events join in.',
  },
  {
    value: 'healthcare',
    label: 'Hospital, clinic or care',
    help: 'Shifts, handovers, the rota and the staff room join in — never anything medical.',
  },
  {
    value: 'service',
    label: 'Shop, restaurant or hotel',
    help: 'Shifts, the stockroom, the till and opening up join in.',
  },
  {
    value: 'trades',
    label: 'Workshop, site or factory',
    help: 'Tools, the tea break, the van and the shift pattern join in.',
  },
]

export function parseOaWorkplace(raw: unknown): OfficeAwardsWorkplace {
  return OA_WORKPLACES.some((w) => w.value === raw) ? (raw as OfficeAwardsWorkplace) : 'any'
}

/** Who the instructions speak of. */
export const whoFor = (name: string) => name || 'the retiree'

/**
 * The page heading: the seller's own, or — while the default is untouched and
 * a name is set — "Linda’s Farewell Office Awards". Blank when titles are off.
 */
export function oaTitleFor(rawTitle: unknown, name: string): string {
  const title = String(rawTitle ?? '').trim()
  if (!title) return ''
  return name && title === OA_DEFAULT_TITLE ? `${possessive(name)} Farewell ${OA_DEFAULT_TITLE}` : title
}

/** How the page is played: one name per award, anyone can win. */
export function oaInstruction(name: string, reasonLine: boolean): string {
  const why = reasonLine ? ' Add a reason on the “Why” line.' : ''
  return `Who fits each award best? Write their name — anyone can win, even ${whoFor(name)}!${why}`
}

const RETIREE_RE = /\b(?:the )?Retiree(’s)?\b/gi

/**
 * An award as printed for this book: "the Retiree" becomes the retiree's
 * name when the seller typed one ("Most Likely to Inherit Linda’s Chair").
 * The name never leaves the browser; the service only ever writes "the
 * Retiree".
 */
export function oaDisplayAward(award: string, name: string): string {
  if (!name) return award
  return award.replace(RETIREE_RE, (_match, owns: string | undefined) => (owns ? possessive(name) : name))
}

export const OA_AI_EMPTY_MESSAGE = 'Could not write fresh office awards this time. Please try again.'
export const OA_SHORT_MESSAGE = 'Could not gather enough distinct, well-balanced awards this time. Please try again.'
export const OA_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for Office Awards. Pick a larger page in Settings.'
export const OA_BUILD_FAILED_MESSAGE = 'Could not lay out these awards on your page. Please try again.'

/** Mirrors `limits` in the service's prompt.json. */
export const OA_LIMITS = {
  rateLimitPerWindow: 10,
  maxOutputTokens: 4096,
  maxAttempts: 2,
  maxAwards: 24,
  capBase: 24,
  spares: 8,
  maxAsk: 32,
  warmPercent: 40,
  minAwardChars: 8,
  maxAwardChars: 48,
  minAwardWords: 2,
  maxAwardWords: 9,
  maxConceptChars: 40,
} as const

/** The theme every full set plans first: the retiree's farewell. Mirrors `anchorTheme`. */
export const OA_ANCHOR_THEME = 'farewell'

/* The service's word lists, theme groups and caps, verbatim. */
/** Theme → the group it balances under. */
export const OA_THEMES: Readonly<Record<string, string>> = {
  'farewell': 'farewell', 'hot-drinks': 'drinks', 'snacks-treats': 'food', 'lunch': 'food',
  'meetings': 'meetings', 'messages': 'communication', 'timekeeping': 'time', 'organizing': 'organization',
  'supplies': 'organization', 'tech': 'tech', 'fixers': 'problem-solving', 'know-how': 'knowledge',
  'humour': 'humor', 'stories': 'stories', 'workspace': 'workspace', 'teamwork': 'teamwork',
  'kindness': 'kindness', 'morale': 'morale', 'celebrations': 'celebrations', 'mentoring': 'mentoring',
  'calm': 'calm', 'breakroom': 'breakroom', 'everyday': 'everyday', 'outside-work': 'life',
}

/** Each group's share of a full set of `capBase` awards. */
export const OA_GROUP_MAX: Readonly<Record<string, number>> = {
  'drinks': 1, 'food': 2, 'meetings': 2, 'communication': 2, 'time': 1, 'organization': 3, 'tech': 2,
  'problem-solving': 2, 'knowledge': 2, 'humor': 2, 'stories': 2, 'workspace': 2, 'teamwork': 3,
  'kindness': 3, 'morale': 2, 'celebrations': 2, 'mentoring': 2, 'calm': 2, 'breakroom': 1, 'everyday': 2,
  'life': 2, 'farewell': 2,
}

export const OA_SHAPES: readonly string[] = ['most-likely', 'superlative', 'title', 'named-award', 'habit']

/** Words that give an award away as really being about a group. */
export const OA_SUBJECT_WORDS: Readonly<Record<string, readonly string[]>> = {
  'drinks': ['drink'],
  'food': ['snack', 'lunch'],
  'meetings': ['meeting'],
  'communication': ['email', 'phone'],
  'time': ['late', 'punctual', 'early'],
  'tech': ['printer', 'tech'],
  'breakroom': ['breakroom'],
  'farewell': ['retiree', 'retirees', 'retirement', 'retiring'],
}

export const OA_READER_WORDS: readonly string[] = [
  'you', 'your', 'yours', 'yourself', 'youd', 'youre', 'youve', 'youll', 'i', 'me', 'my', 'mine', 'im', 'ive',
  'id',
]

export const OA_GENDERED_WORDS: readonly string[] = [
  'he', 'she', 'him', 'her', 'his', 'hers', 'himself', 'herself', 'hes', 'shes', 'king', 'queen', 'kings',
  'queens', 'prince', 'princess', 'lady', 'ladies', 'gentleman', 'gentlemen', 'guy', 'guys', 'gal', 'gals',
  'man', 'woman', 'men', 'women', 'boy', 'girl', 'boys', 'girls', 'mom', 'mum', 'dad', 'mother', 'father',
  'sir', 'madam', 'mr', 'mrs', 'ms', 'miss', 'grandpa', 'grandma', 'granny', 'uncle', 'aunt', 'auntie',
  'sister', 'brother', 'wife', 'husband', 'boyfriend', 'girlfriend',
]

export const OA_BLOCKED_TERMS: readonly string[] = [
  'best dressed', 'dressed', 'outfit', 'outfits', 'fashion', 'fashionable', 'stylish', 'clothes', 'shoes',
  'hair', 'hairstyle', 'haircut', 'bald', 'beard', 'good looking', 'good-looking', 'best looking', 'handsome',
  'pretty', 'beautiful', 'cute', 'sexy', 'attractive', 'makeup', 'tattoo', 'tallest', 'shortest', 'glasses',
  'weight', 'weigh', 'weighs', 'diet', 'dieting', 'calories', 'fat', 'skinny', 'overweight', 'slim', 'age',
  'aged', 'ageing', 'aging', 'old', 'older', 'oldest', 'elderly', 'senior citizen', 'young', 'younger',
  'youngest', 'over the hill', 'senior moment', 'ancient', 'dinosaur', 'old-timer', 'disability', 'disabled',
  'deaf', 'blind', 'wheelchair', 'hearing aid', 'sick', 'sickness', 'sick day', 'sick days', 'illness', 'ill',
  'disease', 'injury', 'injured', 'pain', 'aches', 'medication', 'medicine', 'pill', 'pills', 'diagnosis',
  'surgery', 'therapy', 'therapist', 'mental', 'crazy', 'insane', 'psycho', 'ocd', 'adhd', 'anxiety',
  'anxious', 'depression', 'depressed', 'stress', 'stressed', 'burnout', 'panic', 'meltdown', 'allergy',
  'allergies', 'addict', 'addicted', 'addiction', 'memory loss', 'forgetful', 'forget', 'forgets', 'forgot',
  'forgetting', 'senile', 'dementia', 'salary', 'salaries', 'wage', 'wages', 'pay rise', 'pay raise',
  'paycheck', 'paycheque', 'bonus', 'income', 'money', 'cash', 'debt', 'debts', 'loan', 'loans', 'broke',
  'rich', 'cheap', 'cheapest', 'stingy', 'expenses', 'pension', 'savings', 'religion', 'religious', 'church',
  'prayer', 'pray', 'god', 'faith', 'bible', 'holy', 'saint', 'angel', 'heaven', 'christmas', 'easter',
  'hanukkah', 'diwali', 'ramadan', 'politics', 'political', 'politician', 'vote', 'voting', 'election',
  'government', 'protest', 'president', 'sex', 'flirt', 'flirting', 'crush', 'kiss', 'romance', 'romantic',
  'dating', 'affair', 'marriage', 'married', 'divorce', 'divorced', 'custody', 'family drama', 'in-laws',
  'racial', 'ethnic', 'ethnicity', 'accent', 'accents', 'nationality', 'foreigner', 'immigrant', 'fired',
  'sacked', 'laid off', 'layoff', 'redundancy', 'redundant', 'disciplinary', 'performance review',
  'probation', 'demoted', 'lazy', 'laziest', 'slacker', 'useless', 'incompetent', 'least', 'worst',
  'unproductive', 'procrastinator', 'procrastination', 'procrastinating', 'skiving', 'shirking',
  'avoiding work', 'nap', 'naps', 'napping', 'asleep', 'sleeping', 'sleepiest', 'snooze', 'snoring', 'snore',
  'hiding', 'mistake', 'mistakes', 'blunder', 'disaster', 'catastrophe', 'fail', 'failure', 'screw up',
  'mess up', 'messed up', 'crash', 'crashed', 'fire', 'smell', 'smells', 'smelly', 'burp', 'fart', 'toilet',
  'bathroom', 'restroom', 'loo', 'hygiene', 'sweat', 'sweaty', 'nose', 'chewing', 'thief', 'steal',
  'stealing', 'stole', 'nosy', 'nosiest', 'annoying', 'grumpy', 'grumpiest', 'moody', 'complain', 'complains',
  'complainer', 'complaining', 'whine', 'whiner', 'gossip', 'gossiping', 'drama', 'bossy', 'nag', 'nagging',
  'rude', 'stupid', 'idiot', 'dumb', 'clueless', 'weird', 'weirdest', 'ugly', 'boring', 'cranky', 'sarcastic',
  'loudmouth', 'know-it-all', 'know it all', 'diva', 'suck-up', 'teachers pet', 'drunk', 'drinking buddy',
  'beer', 'wine', 'whisky', 'whiskey', 'vodka', 'gin', 'rum', 'cocktail', 'cocktails', 'booze', 'alcohol',
  'alcoholic', 'happy hour', 'pub', 'hangover', 'tipsy', 'gamble', 'gambling', 'casino', 'lottery', 'bet',
  'betting', 'smoke', 'smoking', 'cigarette', 'vape', 'weed', 'gun', 'weapon', 'kill', 'killer', 'murder',
  'war', 'police', 'arrest', 'arrested', 'jail', 'prison', 'illegal', 'dead', 'death', 'die', 'died', 'dying',
  'funeral', 'grave', 'patients', 'customer complaints', 'quote', 'quotes', 'lyric', 'lyrics', 'celebrity',
  'celebrities', 'oscar', 'oscars', 'emmy', 'emmys', 'grammy', 'grammys', 'nobel', 'olympic', 'olympics',
  'post-it', 'crypto', 'bitcoin',
]

export const OA_GENERIC_WORDS: readonly string[] = [
  'coworker', 'coworkers', 'co-worker', 'co-workers', 'colleague', 'colleagues', 'person', 'people',
  'employee', 'employees', 'staff', 'worker', 'workers', 'member', 'members', 'everyone', 'anyone', 'someone',
  'everybody', 'somebody', 'overall', 'office', 'workplace', 'work', 'job', 'year', 'team', 'winner', 'prize',
  'trophy', 'medal', 'honour', 'honor', 'star', 'valuable', 'valued', 'amazing', 'awesome', 'great', 'good',
  'nice', 'nicest', 'super', 'fantastic', 'wonderful', 'brilliant', 'outstanding', 'excellent', 'incredible',
  'favourite', 'favorite', 'mvp',
]

export const OA_QUALIFIER_WORDS: readonly string[] = [
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'as', 'into', 'onto',
  'up', 'out', 'over', 'off', 'and', 'or', 'but', 'so', 'if', 'than', 'then', 'that', 'this', 'these',
  'those', 'there', 'here', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'has', 'have', 'had', 'get', 'gets',
  'got', 'it', 'its', 'they', 'their', 'them', 'we', 'our', 'us', 'most', 'more', 'likely', 'best', 'better',
  'top', 'award', 'awards', 'champion', 'champ', 'chief', 'officer', 'keeper', 'master', 'expert', 'guru',
  'wizard', 'hero', 'legend', 'ace', 'pro', 'ever', 'always', 'never', 'every', 'all', 'any', 'some', 'one',
  'biggest', 'greatest', 'ultimate', 'official', 'unofficial', 'honorary', 'certified', 'legendary',
  'resident', 'designated', 'supreme', 'grand', 'very', 'really', 'just', 'only', 'much', 'many', 'lot',
  'lots', 'whole', 'entire', 'absolutely', 'retiree', 'retirees', 'retirement', 'retiring', 'go', 'goto',
  'without', 'thing', 'things', 'something', 'everything',
]

export const OA_PHRASES: Readonly<Record<string, string>> = {
  'break room': 'breakroom', 'break-room': 'breakroom', 'staff room': 'breakroom', 'lunch room': 'breakroom',
  'tea room': 'breakroom', 'out-of-office': 'outofoffice', 'out of office': 'outofoffice',
  'to-do list': 'todo', 'to do list': 'todo', 'sticky note': 'stickynote', 'sticky notes': 'stickynote',
  'plan b': 'backup', 'back-up plan': 'backup', 'backup plan': 'backup', 'reply all': 'email',
  'on time': 'punctual', 'running late': 'late', 'being late': 'late', 'first in': 'early',
  'first through the door': 'early', 'phone voice': 'phone', 'thank-you': 'thanks', 'thank you': 'thanks',
  'good morning': 'greeting', 'high-five': 'highfive', 'high five': 'highfive', 'green fingers': 'garden',
  'green thumb': 'garden', 'go-to': '', 'go to': '', 'lend a hand': 'help', 'helping hand': 'help',
  'right hand': 'help', 'keyboard shortcut': 'shortcut', 'keyboard shortcuts': 'shortcut',
  'team player': 'teamwork', 'team spirit': 'cheer', 'new starter': 'newstarter',
  'new starters': 'newstarter', 'new hire': 'newstarter', 'new hires': 'newstarter', 'newcomer': 'newstarter',
  'newcomers': 'newstarter', 'monday morning': 'monday', 'monday mornings': 'monday', 'most likely': '',
  'hot drink': 'drink', 'hot drinks': 'drink', 'help desk': 'helpdesk', 'phone charger': 'charger',
  'phone chargers': 'charger', 'first in line': 'queue',
}

export const OA_SYNONYMS: Readonly<Record<string, string>> = {
  'coffee': 'drink', 'tea': 'drink', 'kettle': 'drink', 'cuppa': 'drink', 'brew': 'drink',
  'espresso': 'drink', 'latte': 'drink', 'cappuccino': 'drink', 'caffeine': 'drink', 'mug': 'drink',
  'mugs': 'drink', 'drinks': 'drink', 'drinker': 'drink', 'drinking': 'drink', 'beverage': 'drink',
  'consumed': 'drink', 'consume': 'drink', 'snacks': 'snack', 'treat': 'snack', 'treats': 'snack',
  'biscuit': 'snack', 'biscuits': 'snack', 'cookie': 'snack', 'cookies': 'snack', 'sweets': 'snack',
  'candy': 'snack', 'chocolate': 'snack', 'cake': 'snack', 'cakes': 'snack', 'baking': 'snack',
  'baker': 'snack', 'bake': 'snack', 'baked': 'snack', 'goodies': 'snack', 'nibbles': 'snack',
  'crisps': 'snack', 'chips': 'snack', 'doughnut': 'snack', 'donut': 'snack', 'lunches': 'lunch',
  'lunchtime': 'lunch', 'dinner': 'lunch', 'meal': 'lunch', 'meals': 'lunch', 'sandwich': 'lunch',
  'sandwiches': 'lunch', 'leftovers': 'lunch', 'potluck': 'lunch', 'meetings': 'meeting', 'huddle': 'meeting',
  'huddles': 'meeting', 'briefing': 'meeting', 'briefings': 'meeting', 'agenda': 'meeting',
  'handover': 'meeting', 'handovers': 'meeting', 'emails': 'email', 'inbox': 'email', 'message': 'email',
  'messages': 'email', 'reply': 'email', 'replies': 'email', 'responder': 'email', 'texts': 'email',
  'phones': 'phone', 'caller': 'phone', 'callers': 'phone', 'calls': 'phone', 'lateness': 'late',
  'tardy': 'late', 'punctuality': 'punctual', 'earliest': 'early', 'earlybird': 'early',
  'photocopier': 'printer', 'copier': 'printer', 'scanner': 'printer', 'printers': 'printer',
  'computer': 'tech', 'computers': 'tech', 'laptop': 'tech', 'screen': 'tech', 'keyboard': 'tech',
  'technology': 'tech', 'gadget': 'tech', 'gadgets': 'tech', 'projector': 'tech', 'wifi': 'tech',
  'desk': 'desk', 'desks': 'desk', 'workspace': 'desk', 'cubicle': 'desk', 'workstation': 'desk',
  'locker': 'desk', 'lockers': 'desk', 'plants': 'plant', 'greenery': 'plant', 'laugh': 'laugh',
  'laughs': 'laugh', 'laughter': 'laugh', 'joke': 'laugh', 'jokes': 'laugh', 'joker': 'laugh',
  'funny': 'laugh', 'funniest': 'laugh', 'humour': 'laugh', 'humor': 'laugh', 'pun': 'laugh', 'puns': 'laugh',
  'comedian': 'laugh', 'comedy': 'laugh', 'giggle': 'laugh', 'stories': 'story', 'storyteller': 'story',
  'storytelling': 'story', 'tale': 'story', 'tales': 'story', 'anecdote': 'story', 'anecdotes': 'story',
  'organized': 'organize', 'organised': 'organize', 'organizer': 'organize', 'organiser': 'organize',
  'organizing': 'organize', 'organising': 'organize', 'organization': 'organize', 'organisation': 'organize',
  'tidiest': 'tidy', 'neat': 'tidy', 'neatest': 'tidy', 'neatness': 'tidy', 'tidiness': 'tidy',
  'pen': 'supply', 'pens': 'supply', 'pencil': 'supply', 'pencils': 'supply', 'highlighter': 'supply',
  'highlighters': 'supply', 'stationery': 'supply', 'supplies': 'supply', 'stapler': 'supply',
  'staplers': 'supply', 'scissors': 'supply', 'paperclip': 'supply', 'paperclips': 'supply',
  'charger': 'supply', 'chargers': 'supply', 'party': 'party', 'parties': 'party', 'celebration': 'party',
  'celebrations': 'party', 'celebrate': 'party', 'festivities': 'party', 'birthdays': 'birthday',
  'cheerleader': 'cheer', 'cheering': 'cheer', 'morale': 'cheer', 'positivity': 'cheer', 'positive': 'cheer',
  'sunshine': 'cheer', 'upbeat': 'cheer', 'optimist': 'cheer', 'optimism': 'cheer', 'enthusiasm': 'cheer',
  'enthusiastic': 'cheer', 'sunniest': 'cheer', 'cheerful': 'cheer', 'calmest': 'calm', 'cool': 'calm',
  'coolest': 'calm', 'unflappable': 'calm', 'steady': 'calm', 'steadiest': 'calm', 'composed': 'calm',
  'zen': 'calm', 'relaxed': 'calm', 'helpful': 'help', 'helper': 'help', 'helping': 'help', 'assist': 'help',
  'assistance': 'help', 'mentor': 'mentor', 'mentoring': 'mentor', 'teacher': 'mentor', 'teaching': 'mentor',
  'coach': 'mentor', 'coaching': 'mentor', 'advice': 'mentor', 'adviser': 'mentor', 'advisor': 'mentor',
  'wisdom': 'mentor', 'wise': 'mentor', 'wisest': 'mentor', 'listener': 'listen', 'listening': 'listen',
  'ear': 'listen', 'ears': 'listen', 'volunteers': 'volunteer', 'volunteering': 'volunteer', 'problem': 'fix',
  'problems': 'fix', 'solver': 'fix', 'solving': 'fix', 'solution': 'fix', 'solutions': 'fix', 'fixer': 'fix',
  'fixing': 'fix', 'fixes': 'fix', 'troubleshooter': 'fix', 'knows': 'know', 'knowing': 'know',
  'knowledge': 'know', 'encyclopedia': 'know', 'encyclopaedia': 'know', 'know-how': 'know', 'rain': 'weather',
  'umbrella': 'weather', 'umbrellas': 'weather', 'forecast': 'weather', 'commute': 'commute',
  'commuter': 'commute', 'traffic': 'commute', 'parking': 'commute', 'holiday': 'travel',
  'holidays': 'travel', 'vacation': 'travel', 'vacations': 'travel', 'trip': 'travel', 'trips': 'travel',
  'traveller': 'travel', 'traveler': 'travel', 'travels': 'travel', 'hobbies': 'hobby', 'pastime': 'hobby',
  'pastimes': 'hobby', 'greeting': 'greeting', 'hello': 'greeting', 'welcome': 'greeting',
  'welcoming': 'greeting', 'smile': 'greeting', 'smiles': 'greeting',
}

/** The prompt's own examples. Printed word for word, they are the model copying. */
export const OA_EXAMPLE_AWARDS: readonly string[] = [
  'Most Likely to Rescue the Photocopier', 'Friendliest Hello on a Monday',
  'Keeper of the Spare Phone Charger', 'Chief Morale Booster', 'The Never-Without-a-Pen Award',
  'Never Without a Spare Umbrella', 'Calmest Voice on a Busy Shift',
]

/** The longest award the page plans for. */
export const MAX_AWARD_CHARS = OA_LIMITS.maxAwardChars

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const BLOCKED_RE = termPattern([...OA_BLOCKED_TERMS, ...BL_BRAND_TERMS])
const PHRASE_PATTERNS: readonly (readonly [RegExp, string])[] = Object.entries(OA_PHRASES)
  .sort(([a], [b]) => b.length - a.length)
  .map(([phrase, replacement]) => [new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'g'), replacement])
const withStems = (words: readonly string[]) => new Set([...words, ...words.map(stem)])
const QUALIFIERS = withStems(OA_QUALIFIER_WORDS)
const GENERIC = withStems(OA_GENERIC_WORDS)
const SYNONYMS = new Map(Object.entries(OA_SYNONYMS))
const READER = new Set(OA_READER_WORDS)
const GENDERED = new Set(OA_GENDERED_WORDS)
const EXAMPLES = new Set(OA_EXAMPLE_AWARDS.map((example) => example.toLowerCase()))
const MINOR_WORDS = new Set(
  'a an and as at but by for from in into nor of on onto or per the to via vs with'.split(' '),
)

const NUMBER_RE = /^\s*(\(?\d{1,2}\s*[.):]\s+|[-*•]\s+)/
/** Letters (any script), digits, spaces, apostrophes, hyphens, commas and "&". */
const ALLOWED_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ,'’\-&]*$/u
const LAST_RE = /[\p{L}\p{N}]$/u
const EDGE_QUOTES_RE = /^["'“”‘’\s]+|["'“”‘’\s]+$/g
const WORD_RE = /[\p{L}\p{N}]+/gu

function fold(text: string): string {
  let folded = text.toLowerCase().replace(/’/g, "'")
  for (const [pattern, replacement] of PHRASE_PATTERNS) folded = folded.replace(pattern, replacement)
  return folded.replace(/'s\s/g, ' ').replace(/'/g, '')
}

const canon = (word: string) => stem(SYNONYMS.get(word) || SYNONYMS.get(stem(word)) || word)

/** The idea an award honours: padding and generic words gone, synonyms folded. Mirrors `award_tokens`. */
export function awardTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of fold(text).match(WORD_RE) ?? []) {
    if (QUALIFIERS.has(word) || GENERIC.has(word)) continue
    const canonical = canon(word)
    if (QUALIFIERS.has(canonical) || GENERIC.has(canonical)) continue
    out.add(canonical)
  }
  return out
}

const SUBJECTS: readonly (readonly [string, ReadonlySet<string>])[] = Object.entries(OA_SUBJECT_WORDS).map(
  ([group, words]) => [group, new Set(words.map((word) => canon(word.toLowerCase())))],
)

/** Groups an award is really about, whatever its brief said: coffee is a drinks award. Mirrors `award_subjects`. */
export function awardSubjects(text: string): Set<string> {
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

export const awardKey = (text: string, concept = ''): IdeaKey => ({
  text: text.replace(/\s+/g, ' ').trim().toLowerCase(),
  tokens: awardTokens(text),
  concept: concept ? awardTokens(concept) : new Set(),
})

/** True when a coworker would call two awards the same award. Mirrors `awards_repeat`. */
export const awardsRepeat = (first: string, second: string) => keysRepeat(awardKey(first), awardKey(second))

export function isUnsafeOaCopy(text: string): boolean {
  const plain = text.replace(/’/g, "'").replace(/'/g, '')
  return isUnsafeCopy(text) || BLOCKED_RE.test(plain)
}

function clean(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

function casePart(part: string, edge: boolean): string {
  const letters = part.match(/\p{L}/gu) ?? []
  if (letters.length >= 2 && letters.every((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase())) {
    return part // an initialism: IT, ASAP
  }
  if (!edge && MINOR_WORDS.has(part.toLowerCase())) return part.toLowerCase()
  return part.slice(0, 1).toUpperCase() + part.slice(1)
}

/** Title case as a printed award reads. Casing only. Mirrors `title_case`. */
export function titleCase(text: string): string {
  const words = text.split(' ')
  return words
    .map((word, i) => {
      const parts = word.split('-')
      return parts
        .map((part, j) => casePart(part, (i === 0 && j === 0) || (i === words.length - 1 && j === parts.length - 1)))
        .join('-')
    })
    .join(' ')
}

/**
 * One award title as printed — "Keeper of the Spare Phone Charger" — or null.
 * Mirrors `normalize_award`.
 */
export function normalizeAward(raw: unknown, budget: number = MAX_AWARD_CHARS): string | null {
  let text = clean(raw).replace(NUMBER_RE, '').replace(EDGE_QUOTES_RE, '').trim()
  if (!text || !ALLOWED_RE.test(text) || !LAST_RE.test(text)) return null
  const letters = text.match(/\p{L}/gu) ?? []
  const upper = text.match(/\p{Lu}/gu) ?? []
  if (letters.length === 0 || upper.length > letters.length * 0.6) return null
  const words = text.split(' ').length
  if (words < OA_LIMITS.minAwardWords || words > OA_LIMITS.maxAwardWords) return null
  text = titleCase(text.replace(/'/g, '’'))
  if (text.length < OA_LIMITS.minAwardChars || text.length > budget) return null
  // Folded first, so "Thank-You Notes" is thanks, not the reader.
  const folded = fold(text).match(WORD_RE) ?? []
  if (folded.some((word) => READER.has(word) || GENDERED.has(word))) return null
  if (isUnsafeOaCopy(text)) return null
  // Only padding left: "Best Coworker Ever" honours nothing in particular.
  if (awardTokens(text).size === 0) return null
  if (EXAMPLES.has(text.toLowerCase())) return null
  return text
}

export function normalizeConcept(raw: unknown): string {
  return clean(raw).toLowerCase().slice(0, OA_LIMITS.maxConceptChars).trim()
}

const isTheme = (key: string) => Object.prototype.hasOwnProperty.call(OA_THEMES, key)
export const groupOf = (theme: string) => OA_THEMES[theme] ?? ''

/** One validated award. */
export interface OaAward {
  award: string
  theme: string
  tone: OfficeAwardsTone
  shape: string
  concept: string
}

/** One complete award from raw service output — or null, never a repair. */
export function normalizeOaItem(raw: unknown, budget: number = MAX_AWARD_CHARS): OaAward | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const theme = String(record.theme ?? '').trim()
  const tone = String(record.tone ?? '').trim() as OfficeAwardsTone
  const shape = String(record.shape ?? '').trim()
  if (!isTheme(theme) || !OA_TONES.includes(tone) || !OA_SHAPES.includes(shape)) return null
  const award = normalizeAward(record.award, budget)
  if (!award) return null
  return { award, theme, tone, shape, concept: normalizeConcept(record.concept) }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseOaPayload(remote: unknown): readonly unknown[] {
  if (!remote || typeof remote !== 'object') return []
  const awards = (remote as Partial<OfficeAwardsResponse>).awards
  return Array.isArray(awards) ? awards : []
}

export const oaKey = (a: Pick<OaAward, 'award' | 'concept'>) => awardKey(a.award, a.concept)

/**
 * Normalize → gate → drop repeats, in the service's order, spares included.
 * Repeats are caught across the pool and against `avoid` — awards this
 * seller's book already prints — so a reply that ignores the prompt's avoid
 * list still cannot repeat them. `keep` is an earlier pool a top-up adds to.
 */
export function cleanOaPool(
  raw: unknown,
  options: { avoid?: readonly string[]; keep?: readonly OaAward[] } = {},
): OaAward[] {
  const { avoid = [], keep = [] } = options
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => awardKey(label))
  const out = [...keep]
  const kept: IdeaKey[] = keep.map(oaKey)
  for (const item of Array.isArray(raw) ? raw : []) {
    const award = normalizeOaItem(item)
    if (!award) continue
    const key = oaKey(award)
    if (kept.some((other) => keysRepeat(key, other))) continue
    if (avoided.some((other) => keysRepeat(key, other))) continue
    out.push(award)
    kept.push(key)
  }
  return out
}

/** Every group an award counts toward: its brief's and whatever it is really about. */
export function groupsOf(a: Pick<OaAward, 'award' | 'theme'>): Set<string> {
  const groups = awardSubjects(a.award)
  const own = groupOf(a.theme)
  if (own) groups.add(own)
  return groups
}

/** A group's share of a set of `size` awards. Mirrors `group_cap`. */
export const groupCap = (group: string, size: number) =>
  Math.max(1, Math.ceil(((OA_GROUP_MAX[group] ?? 1) * size) / OA_LIMITS.capBase))

/** The rules a set of `size` awards keeps as a whole. */
export function oaSetRules(size: number) {
  return {
    themeMax: 2,
    minThemes: Math.ceil(size * 0.75),
    shapeMax: Math.ceil(size * 0.4),
    openingMax: Math.max(2, Math.ceil(size * 0.25)),
    minWarm: Math.ceil(size * 0.3),
    minPlayful: Math.ceil(size * 0.3),
  }
}

/** "most likely" for every Most Likely to…, otherwise the first word: "best", "the", "always". */
export function openingOf(award: string): string {
  const words = award.toLowerCase().match(WORD_RE) ?? []
  return words[0] === 'most' && words[1] === 'likely' ? 'most likely' : (words[0] ?? '')
}

export const isFarewell = (a: Pick<OaAward, 'theme'>) => a.theme === OA_ANCHOR_THEME

function sharesIdea(a: IdeaKey, b: IdeaKey): boolean {
  for (const token of a.tokens) if (b.tokens.has(token)) return true
  return false
}

/**
 * Why `candidate` may not join `set` in a set of `size`, or null when it may.
 * `themeCap` lets the picker prefer one award per theme before it allows a
 * second.
 */
export function setConflict(
  set: readonly OaAward[],
  candidate: OaAward,
  size: number,
  themeCap: number = oaSetRules(size).themeMax,
): string | null {
  const rules = oaSetRules(size)
  const sameTheme = set.filter((a) => a.theme === candidate.theme)
  if (sameTheme.length >= themeCap) return 'theme'
  for (const group of groupsOf(candidate)) {
    if (set.filter((a) => groupsOf(a).has(group)).length >= groupCap(group, size)) return 'group'
  }
  const toneMax = size - (candidate.tone === 'warm' ? rules.minPlayful : rules.minWarm)
  if (set.filter((a) => a.tone === candidate.tone).length >= toneMax) return 'tone'
  if (set.filter((a) => a.shape === candidate.shape).length >= rules.shapeMax) return 'shape'
  const opening = openingOf(candidate.award)
  if (set.filter((a) => openingOf(a.award) === opening).length >= rules.openingMax) return 'opening'
  const key = oaKey(candidate)
  if (set.some((a) => keysRepeat(key, oaKey(a)))) return 'repeat'
  // Two awards on one theme honour two different things, never the same one twice.
  if (sameTheme.some((a) => sharesIdea(key, oaKey(a)))) return 'idea'
  return null
}

export interface OaSetPick {
  /** Exactly `size` awards, in pool order — or null when the pool cannot make a set. */
  picks: OaAward[] | null
  /** What was taken, whole set or not: what a top-up is measured against. */
  taken: OaAward[]
}

/**
 * The set's awards, balanced — or null.
 *
 * The farewell award goes in first where one came back (the service plans
 * it first). Then every theme gets one award, in the service's order,
 * passing over any that would break a set rule or does not fit its card on
 * the page; only then may a theme give a second award honouring something
 * else. Never pads with anything that failed a gate.
 */
export function pickOaSet(
  pool: readonly OaAward[],
  size: number,
  fits: (award: OaAward) => boolean = () => true,
): OaSetPick {
  const rules = oaSetRules(size)
  const taken: OaAward[] = []
  const tryTake = (a: OaAward, cap: number) => {
    if (taken.length >= size || taken.includes(a) || !fits(a)) return
    if (setConflict(taken, a, size, cap) === null) taken.push(a)
  }
  const anchor = pool.find((a) => isFarewell(a) && fits(a))
  if (anchor) tryTake(anchor, 1)
  for (const cap of [1, rules.themeMax]) for (const a of pool) tryTake(a, cap)

  const themes = new Set(taken.map((a) => a.theme))
  const warm = taken.filter((a) => a.tone === 'warm').length
  const whole =
    taken.length === size &&
    themes.size >= rules.minThemes &&
    warm >= rules.minWarm &&
    size - warm >= rules.minPlayful
  return { picks: whole ? taken : null, taken }
}

/**
 * What a top-up asks for when a pool cannot make a set: themes the set does
 * not use yet (the farewell theme first when it has none), the tone it is
 * short of, and enough awards to fill it with spares for the gates.
 */
export function oaShortfall(
  taken: readonly OaAward[],
  size: number,
): { themes: string[]; count: number; tone?: OfficeAwardsTone } {
  const rules = oaSetRules(size)
  const used = new Set(taken.map((a) => a.theme))
  let themes = Object.keys(OA_THEMES).filter((key) => !used.has(key))
  if (!taken.some(isFarewell)) {
    themes = [...themes.filter((key) => key === OA_ANCHOR_THEME), ...themes.filter((key) => key !== OA_ANCHOR_THEME)]
  }
  if (themes.length === 0) themes = Object.keys(OA_THEMES)
  const warm = taken.filter((a) => a.tone === 'warm').length
  const playful = taken.length - warm
  const tone = warm < rules.minWarm ? 'warm' : playful < rules.minPlayful ? 'playful' : undefined
  const need = Math.max(2, size - taken.length)
  return { themes, count: Math.min(OA_LIMITS.maxAsk, need + 4), ...(tone ? { tone } : {}) }
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return 0
}

const sharesGroup = (a: OaAward, b: OaAward) => {
  const groups = groupsOf(b)
  for (const group of groupsOf(a)) if (groups.has(group)) return true
  return false
}

/**
 * The picks in reading order, by seed.
 *
 * The farewell award closes the page (a warm one if there is none): a last
 * word for the retiree. The rest are placed one at a time: a playful award
 * opens, and no award follows one from the same group, with the same opening
 * word or in the same shape where anything else is left — so the page never
 * reads as three "Most Likely to…" in a row. Ties break in a seeded order,
 * so every set reads differently.
 */
export function orderOaSet(picks: readonly OaAward[], seed: number): OaAward[] {
  const rng = createRng((seed ^ OA_SALT) >>> 0)
  const remaining = rng.shuffle([...picks])
  let closerAt = remaining.findIndex(isFarewell)
  if (closerAt === -1) closerAt = remaining.findIndex((a) => a.tone === 'warm')
  const closer = closerAt === -1 ? null : remaining.splice(closerAt, 1)[0]!
  const out: OaAward[] = []

  while (remaining.length > 0) {
    const prev = out.at(-1)
    let best = 0
    let bestScore: number[] = []
    remaining.forEach((a, index) => {
      const score = [
        out.length === 0 && a.tone !== 'playful' ? 1 : 0,
        prev && sharesGroup(prev, a) ? 1 : 0,
        // With two left, place now the one that would sit beside the closer.
        closer && remaining.length === 2 && sharesGroup(remaining[1 - index]!, closer) ? 1 : 0,
        prev && openingOf(prev.award) === openingOf(a.award) ? 1 : 0,
        prev && prev.shape === a.shape ? 1 : 0,
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

/** One award as the page prints it. */
export interface OaNumbered extends OaAward {
  /** 1 to the set's size, down the pages. */
  number: number
}

export const numberOaSet = (ordered: readonly OaAward[]): OaNumbered[] =>
  ordered.map((a, index) => ({ ...a, number: index + 1 }))

/**
 * Why a set may not print, or null when it may — the preflight's last word on
 * content that has already been picked and ordered: the right number of
 * awards numbered in order, each printable and distinct in meaning, and every
 * set rule held.
 */
export function oaSetProblem(awards: readonly OaNumbered[], size: number): string | null {
  if (awards.length !== size) return `The set holds ${awards.length} awards instead of ${size}.`
  if (awards.some((a, i) => a.number !== i + 1)) return `The awards are not numbered 1 to ${size} in order.`
  for (const a of awards) {
    if (normalizeAward(a.award) !== a.award || !isTheme(a.theme) || !OA_TONES.includes(a.tone)) {
      return `Award ${a.number} is not suitable for a published activity book.`
    }
  }
  for (let i = 1; i < awards.length; i++) {
    const conflict = setConflict(awards.slice(0, i), awards[i]!, size)
    if (conflict === 'repeat' || conflict === 'idea') {
      return `Award ${i + 1} honours the same thing as an earlier award.`
    }
    if (conflict) return 'The awards need more variety.'
  }
  const rules = oaSetRules(size)
  if (new Set(awards.map((a) => a.theme)).size < rules.minThemes) return 'The awards need more variety.'
  const warm = awards.filter((a) => a.tone === 'warm').length
  if (warm < rules.minWarm || size - warm < rules.minPlayful) return 'The awards need a better mix of funny and warm.'
  return null
}

/** Every award in a pool, in the service's order. */
export const oaAwards = (pool: readonly OaAward[]): string[] => pool.map((a) => a.award)
