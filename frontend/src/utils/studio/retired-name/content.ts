import { isUnsafeCopy } from '../retirement-word-search/content-quality'

/**
 * What a "What's Your Retired Name?" table is, and every rule a name must pass
 * to print on it.
 *
 * The reader looks up the first letter of their first name (A–Z) for a new
 * first name and their birth month for a new last name, then reads the two
 * together: "Captain" + "Hammock Snoozer". Nobody checks all 312 pairings, so
 * the two lists are held to one shape, which makes any pairing read as an
 * intentional name:
 *
 * - a **first name** is a gender-neutral title or cheerful nickname — one
 *   word, or a fixed two-word nickname that does not itself read like a
 *   surname ("Big Cheese", never "Golf Pro");
 * - a **last name** is exactly two words, a leisure thing and the doer of it
 *   ("Porch Rocker"), the second word naming a person doing something.
 *
 * These gates mirror `backend/app/services/studio_retired_name_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only whole, valid names reach the
 * editor. Nothing is repaired except letter case.
 */

export const RN_TEMPLATE_KEY = 'retired-name'
export const RN_DEFAULT_TITLE = 'What’s Your Retired Name?'

export const RN_LETTERS: readonly string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
export const RN_MONTHS: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
/** Printed instead of the full month when a narrow trim needs the room. */
export const RN_MONTHS_SHORT: readonly string[] = RN_MONTHS.map((month) => month.slice(0, 3))

/** Longest first name the page plans for ("Commodore", "Big Cheese"). */
export const MAX_FIRST_CHARS = 10
/** Longest last name the page plans for ("Tomato Whisperer"). */
export const MAX_LAST_CHARS = 16
const MIN_FIRST_CHARS = 3
const MIN_LAST_CHARS = 7
const MIN_WORD_LETTERS = 2
const MAX_WORD_LETTERS = 12

/**
 * Keeps this game's rotating theme out of step with the other games'.
 * A book run hands a spread one seed; without a salt, facing pages would share
 * a theme.
 */
export const RN_THEME_SALT = 0x726e616d

export const RN_AI_EMPTY_MESSAGE =
  'Could not write a full table of fresh retired names. Try again, or pick a broader theme.'
export const RN_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a retired-name table. Pick a larger page in Settings.'
export const RN_BUILD_FAILED_MESSAGE = 'Could not fit these names on this page. Try again.'

/** The how-to line under the title. */
export const RN_INSTRUCTION =
  'Find the first letter of your first name and your birth month, then put the two together!'

/** Section headings: the step, then what to look up. */
export const RN_LETTERS_HEADING = '1. Your first initial'
export const RN_MONTHS_HEADING = '2. Your birth month'

/*
 * Mirrors `blockedTerms`, `brandTerms` and `genderedTerms` in
 * backend/app/data/studio/retired-name/prompt.json. A name lands on everyone
 * whose initial or month it sits beside, so gendered words are out too.
 */
const BLOCKED_TERMS = [
  'death', 'dead', 'die', 'dying', 'died', 'funeral', 'grave', 'cemetery', 'coffin', 'will and testament',
  'illness', 'ill', 'sick', 'disease', 'cancer', 'dementia', 'alzheimer', 'stroke', 'surgery', 'operation',
  'hospital', 'doctor', 'nurse', 'nursing home', 'care home', 'retirement home', 'medication', 'medicine',
  'pill', 'pills', 'diagnosis', 'arthritis', 'pain', 'aches', 'achy', 'hip', 'knee', 'joint', 'joints',
  'wheelchair', 'walking stick', 'cane', 'zimmer', 'scooter', 'disabled', 'disability',
  'blind', 'deaf', 'hearing aid', 'dentures', 'denture', 'toothless', 'bifocal', 'bifocals',
  'incontinence', 'bladder', 'prune', 'prunes', 'bran', 'fibre', 'fiber', 'laxative',
  'diet', 'weight loss', 'overweight', 'fat', 'chubby', 'tubby', 'pudgy', 'wrinkles', 'wrinkly',
  'grey hair', 'gray hair', 'bald', 'baldy', 'saggy', 'creaky', 'crusty', 'rusty', 'decrepit',
  'memory loss', 'forget', 'forgot', 'forgotten', 'forgetful', 'forgetting', 'senior moment',
  'over the hill', 'old fogey', 'fogey', 'fogy', 'geezer', 'codger', 'coot', 'biddy', 'crone', 'fossil',
  'relic', 'dinosaur', 'ancient', 'old', 'older', 'oldie', 'oldster', 'elderly', 'elder', 'geriatric',
  'senior', 'senior citizen', 'old age', 'pensioner', 'retiree', 'grumpy', 'cranky', 'grouchy', 'crabby',
  'slow', 'slowpoke', 'doddering', 'dozy', 'senile', 'frail', 'feeble',
  'lonely', 'loneliness', 'alone', 'bored', 'boring',
  'lazy', 'lazybones', 'slob', 'slacker', 'loafer', 'bum', 'moocher', 'freeloader', 'couch potato',
  'sloth', 'layabout', 'idler', 'dummy', 'dumb', 'fool', 'foolish', 'nut', 'nuts', 'nutty', 'loony',
  'batty', 'crazy', 'kooky', 'stupid', 'idiot', 'ugly', 'useless', 'hate', 'damn',
  'debt', 'broke', 'bankrupt', 'poverty', 'poor', 'bills', 'mortgage', 'loan', 'taxes', 'pension',
  'savings', 'cheap', 'cheapskate', 'miser', 'stingy',
  'divorce', 'affair', 'ex',
  'election', 'political', 'politics', 'democrat', 'republican', 'president', 'government',
  'senator', 'governor', 'congress', 'parliament',
  'religion', 'church', 'prayer', 'god', 'heaven', 'hell', 'saint', 'angel', 'devil', 'bishop',
  'pastor', 'priest', 'vicar', 'reverend', 'monk', 'nun',
  'drunk', 'tipsy', 'hangover', 'beer', 'wine', 'vodka', 'whiskey', 'whisky', 'cocktail', 'booze',
  'alcohol', 'martini', 'margarita', 'sangria', 'champagne', 'prosecco', 'gin', 'rum', 'brandy',
  'sherry', 'pub', 'brewer', 'brewery', 'winery', 'happy hour', 'boozer',
  'gamble', 'gambling', 'gambler', 'casino', 'lottery', 'bet', 'betting', 'poker', 'slots',
  'gun', 'weapon', 'war', 'fight', 'fighter', 'kill', 'killer', 'violence', 'shooter', 'sniper',
  'sex', 'sexy', 'naked', 'nude', 'hottie', 'frisky', 'naughty', 'cougar', 'babe', 'stud',
  'flirt', 'flirty', 'kinky', 'bedroom',
  'police', 'cop', 'arrested', 'illegal', 'jail', 'prison', 'robber', 'thief', 'bandit', 'outlaw',
  'pirate', 'smoker', 'smoking', 'cigar', 'cigarette', 'tobacco', 'vape',
  // brandTerms
  'disney', 'marvel', 'netflix', 'facebook', 'instagram', 'tiktok', 'youtube', 'google', 'amazon',
  'iphone', 'apple watch', 'walmart', 'starbucks', 'mcdonald', 'mcdonalds', 'coca-cola', 'coca cola',
  'lego', 'barbie', 'harry potter', 'star wars', 'star trek', 'taylor swift', 'elvis', 'beatles',
  'rolex', 'ferrari', 'harley', 'nintendo', 'playstation', 'xbox', 'costco', 'ikea', 'uber', 'airbnb',
  'zoom', 'facetime', 'whatsapp', 'kindle', 'wordle', 'winnebago', 'scrabble', 'monopoly', 'yahtzee',
  'jenga', 'frisbee', 'jacuzzi', 'velcro', 'crockpot', 'crock-pot', 'rollerblade', 'rollerblader',
  'ping-pong', 'ping pong', 'popsicle', 'kleenex', 'segway', 'zamboni', 'hula', 'tupperware',
  'polaroid', 'lycra', 'spandex', 'jeep', 'vespa', 'oreo', 'nutella', 'pringles',
  'snoopy', 'garfield', 'popeye', 'scooby', 'sherlock', 'gandalf', 'yoda', 'batman', 'superman',
  'mickey', 'minnie', 'elmo', 'kermit', 'muppet', 'smurf', 'hobbit', 'rocky', 'rambo', 'bond',
  // genderedTerms
  'sir', 'lady', 'ladies', 'lord', 'duke', 'duchess', 'king', 'queen', 'prince', 'princess',
  'baron', 'baroness', 'count', 'countess', 'earl', 'dame', 'madam', 'madame', 'miss', 'mister',
  'mr', 'mrs', 'ms', 'gent', 'gentleman', 'gal', 'guy', 'boy', 'girl', 'man', 'woman', 'men',
  'women', 'lad', 'lass', 'fella', 'fellow', 'bloke', 'dude', 'sultan', 'emperor', 'empress',
  'czar', 'tsar', 'squire', 'senor', 'senora', 'monsieur', 'belle', 'diva', 'grandma', 'grandpa',
  'granny', 'gramps', 'grandad', 'granddad', 'nana', 'nan', 'papa', 'pops', 'mama', 'mom', 'mum',
  'dad', 'uncle', 'aunt', 'auntie', 'husband', 'wife', 'hubby', 'wifey', 'sister', 'brother',
  'mother', 'father', 'daughter', 'son', 'bride', 'groom', 'widow', 'widower', 'matron',
  'patriarch', 'matriarch', 'maiden', 'heiress', 'hostess', 'waitress', 'actress', 'mistress',
  'sweetheart', 'cowboy', 'cowgirl', 'fisherman', 'fisherwoman', 'chairman', 'chairwoman',
] as const

/** Mirrors `agentHeads`: doer words a last name may end on besides -er / -or / -ist. */
const AGENT_HEADS = new Set([
  'champ', 'pro', 'whiz', 'wizard', 'buff', 'fan', 'boss', 'ace', 'guru', 'legend', 'hero',
  'expert', 'maestro', 'enthusiast', 'genius', 'hound', 'devotee', 'virtuoso', 'sage', 'star',
])

/** Mirrors `nonAgentHeads`: -er / -or words that are things, not doers. */
const NON_AGENT_HEADS = new Set([
  'water', 'summer', 'winter', 'butter', 'paper', 'power', 'flower', 'river', 'silver', 'supper',
  'dinner', 'weather', 'feather', 'letter', 'ginger', 'corner', 'cucumber', 'number', 'center',
  'centre', 'timber', 'copper', 'pepper', 'clover', 'lavender', 'ladder', 'slipper', 'sweater',
  'burger', 'hammer', 'anchor', 'harbor', 'harbour', 'mirror', 'color', 'colour', 'flavor',
  'flavour', 'armor', 'armour', 'floor', 'door', 'parlor', 'parlour', 'motor', 'tractor',
  'trailer', 'blender', 'toaster', 'heater', 'sticker', 'poster', 'folder', 'border', 'chapter',
  'shower', 'tower', 'cellar', 'collar', 'cedar', 'sugar', 'vinegar', 'cheddar', 'zipper',
  'monster', 'lobster', 'oyster', 'rooster', 'otter', 'beaver', 'spider', 'tiger', 'badger',
  'ever', 'never', 'over', 'under', 'after', 'better', 'bigger', 'faster', 'later', 'other',
  'whether', 'together', 'forever', 'clever', 'proper', 'super', 'tender', 'slender',
  'bitter', 'sober', 'sister', 'brother', 'mother', 'father', 'daughter',
  'error', 'terror', 'horror', 'humor', 'humour', 'honor', 'honour', 'manor', 'major', 'minor',
  'doctor', 'mayor', 'senior', 'junior', 'janitor', 'stressor',
])
/** A non-agent word this long also catches compounds ending in it ("sunflower"). */
const NON_AGENT_SUFFIX_MIN = 6
const LONG_NON_AGENTS = [...NON_AGENT_HEADS].filter((word) => word.length >= NON_AGENT_SUFFIX_MIN)

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_TERMS.map(escapeRegExp).join('|')})\\b`, 'i')
const WORD_RE = /^[A-Za-z]+(?:'[A-Za-z]+)?(?:-[A-Za-z]+(?:'[A-Za-z]+)?)?$/
const VOWEL_RE = /[aeiouy]/
const TRIPLE_RE = /(.)\1\1/
const CONSONANT_RUN_RE = /[^aeiouy]{5,}/
const EDGE_TRIM_RE = /^["'“”‘’\s.,;:!?…]+|["'“”‘’\s.,;:!?…]+$/g
const ROOT_MIN = 3
const ROOT_PREFIX_MIN = 4
const ROOT_PREFIX_SHARE = 0.6

export function isUnsafeRnCopy(text: string): boolean {
  return isUnsafeCopy(text) || BLOCKED_RE.test(text)
}

function clean(raw: unknown): string {
  const value = raw && typeof raw === 'object' ? (raw as { name?: unknown }).name : raw
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/’/g, "'")
    .replace(EDGE_TRIM_RE, '')
}

/** "tee-time" → "Tee-Time". Case is the only repair a name ever gets. */
const titleWord = (word: string) =>
  word
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')

/** Every hyphen part is a sayable word: a vowel, no stutters, no consonant pile. */
export function isPronounceable(word: string): boolean {
  if (!WORD_RE.test(word)) return false
  return word
    .toLowerCase()
    .split('-')
    .every((part) => {
      const letters = part.replace(/'/g, '')
      return (
        letters.length >= MIN_WORD_LETTERS &&
        letters.length <= MAX_WORD_LETTERS &&
        VOWEL_RE.test(letters) &&
        !TRIPLE_RE.test(letters) &&
        !CONSONANT_RUN_RE.test(letters)
      )
    })
}

/** Reads as a person doing something: "Snoozer", "Collector", "Champ". */
export function isAgentHead(word: string): boolean {
  const head = word.toLowerCase().replace(/'/g, '').split('-').at(-1) ?? ''
  if (AGENT_HEADS.has(head)) return true
  if (NON_AGENT_HEADS.has(head) || LONG_NON_AGENTS.some((thing) => head.endsWith(thing))) {
    return false
  }
  return head.length >= 5 && /(er|or|ist)$/.test(head)
}

/** One last name as printed — "Hammock Snoozer" — or null. */
export function normalizeLastName(raw: unknown, budget: number = MAX_LAST_CHARS): string | null {
  const words = clean(raw).split(' ')
  if (words.length !== 2 || !words.every(isPronounceable)) return null
  if (!isAgentHead(words[1]!)) return null
  const name = words.map(titleWord).join(' ')
  if (name.length < MIN_LAST_CHARS || name.length > budget) return null
  return isUnsafeRnCopy(name) ? null : name
}

/** One first name as printed — "Captain", "Big Cheese" — or null. */
export function normalizeFirstName(raw: unknown, budget: number = MAX_FIRST_CHARS): string | null {
  const words = clean(raw).split(' ')
  if (words.length < 1 || words.length > 2 || !words.every(isPronounceable)) return null
  // "Golf Pro" is a last name; in front of "Hammock Snoozer" it reads as two.
  if (words.length === 2 && isAgentHead(words[1]!)) return null
  const name = words.map(titleWord).join(' ')
  if (name.length < MIN_FIRST_CHARS || name.length > budget) return null
  return isUnsafeRnCopy(name) ? null : name
}

/** The word roots two names are compared on (hyphen parts count as words). */
export function nameRoots(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[\s-]+/)
    .filter((part) => part.length >= ROOT_MIN)
}

/** Same word, or one plainly grown from the other ("snoozy" / "snoozer"). */
function rootsClash(a: string, b: string): boolean {
  if (a === b) return true
  let shared = 0
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++
  return shared >= ROOT_PREFIX_MIN && shared >= ROOT_PREFIX_SHARE * Math.min(a.length, b.length)
}

/** True when the two names share any word root — too alike for one table. */
export function namesClash(first: string, second: string): boolean {
  const b = nameRoots(second)
  return nameRoots(first).some((x) => b.some((y) => rootsClash(x, y)))
}

/** True when two last names are the same name, give or take an ending. */
export function lastNamesRepeat(first: string, second: string): boolean {
  const a = nameRoots(first)
  const b = nameRoots(second)
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return first.trim().toLowerCase() === second.trim().toLowerCase()
  }
  return (
    a.every((x) => b.some((y) => rootsClash(x, y))) &&
    b.every((y) => a.some((x) => rootsClash(y, x)))
  )
}

/** Which list a book label came from. Last names have a shape; first names are the rest. */
export function labelKind(label: string): 'first' | 'last' | null {
  if (normalizeLastName(label, Number.POSITIVE_INFINITY)) return 'last'
  if (normalizeFirstName(label, Number.POSITIVE_INFINITY)) return 'first'
  return null
}

interface SelectOptions {
  cap?: number
  /** Last names only: labels already printed. A repeat is dropped, not ranked. */
  avoid?: readonly string[]
  /** Layout gate — a name that will not set in its column is passed over. */
  fits?: (name: string) => boolean
}

/** Normalize → fit → drop near-repeats → take `cap` first names. */
export function selectFirstNames(raw: unknown, options: SelectOptions = {}): string[] {
  const { cap = Number.POSITIVE_INFINITY, fits } = options
  const kept: string[] = []
  if (!Array.isArray(raw)) return kept
  for (const item of raw) {
    if (kept.length >= cap) break
    const name = normalizeFirstName(item)
    if (!name || (fits && !fits(name))) continue
    if (kept.some((other) => namesClash(name, other))) continue
    kept.push(name)
  }
  return kept
}

/** Normalize → fit → drop near-repeats and names already printed → take `cap`. */
export function selectLastNames(raw: unknown, options: SelectOptions = {}): string[] {
  const { cap = Number.POSITIVE_INFINITY, fits, avoid = [] } = options
  const kept: string[] = []
  if (!Array.isArray(raw)) return kept
  const avoided = avoid.map((label) => String(label ?? '').trim()).filter(Boolean)
  for (const item of raw) {
    if (kept.length >= cap) break
    const name = normalizeLastName(item)
    if (!name || (fits && !fits(name))) continue
    if (kept.some((other) => namesClash(name, other))) continue
    if (avoided.some((label) => lastNamesRepeat(name, label))) continue
    kept.push(name)
  }
  return kept
}

export interface RnPayload {
  firstNames: readonly unknown[]
  lastNames: readonly unknown[]
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseRnPayload(remote: unknown): RnPayload {
  if (!remote || typeof remote !== 'object') return { firstNames: [], lastNames: [] }
  const record = remote as Record<string, unknown>
  return {
    firstNames: Array.isArray(record.firstNames) ? record.firstNames : [],
    lastNames: Array.isArray(record.lastNames) ? record.lastNames : [],
  }
}

/** True when the pools could fill a table before any layout gate runs. */
export function poolsCanFillTable(payload: RnPayload): boolean {
  return (
    selectFirstNames(payload.firstNames, { cap: RN_LETTERS.length }).length >= RN_LETTERS.length &&
    selectLastNames(payload.lastNames, { cap: RN_MONTHS.length }).length >= RN_MONTHS.length
  )
}

export interface RnEntry {
  /** "A" … "Z", or "January" … "December". */
  key: string
  name: string
}

export interface RnTable {
  letters: RnEntry[]
  months: RnEntry[]
}

/**
 * The table this page prints, or null when the pools cannot fill it whole.
 *
 * Last names are chosen first — they carry the page — then first names, each
 * one skipping any that shares a root with a chosen last name, so no pairing
 * echoes itself ("Snoozy Hammock Snoozer"). A table is never printed with a
 * gap: 26 letters and 12 months, or nothing.
 */
export function buildRnTable(
  payload: RnPayload,
  fits: { first: (name: string) => boolean; last: (name: string) => boolean },
): RnTable | null {
  const lasts = selectLastNames(payload.lastNames, { cap: RN_MONTHS.length, fits: fits.last })
  if (lasts.length < RN_MONTHS.length) return null
  const firsts = selectFirstNames(
    payload.firstNames.filter((raw) => {
      const name = normalizeFirstName(raw)
      return name !== null && !lasts.some((last) => namesClash(name, last))
    }),
    { cap: RN_LETTERS.length, fits: fits.first },
  )
  if (firsts.length < RN_LETTERS.length) return null
  return {
    letters: RN_LETTERS.map((key, i) => ({ key, name: firsts[i]! })),
    months: RN_MONTHS.map((key, i) => ({ key, name: lasts[i]! })),
  }
}

/**
 * Why a table may not print, or null when it may — the preflight's last word
 * on content that has already been through `buildRnTable`.
 */
export function rnTableProblem(table: RnTable): string | null {
  const keysMatch = (entries: readonly RnEntry[], keys: readonly string[]) =>
    entries.length === keys.length && entries.every((entry, i) => entry.key === keys[i])
  if (!keysMatch(table.letters, RN_LETTERS)) return 'Every letter from A to Z needs exactly one name.'
  if (!keysMatch(table.months, RN_MONTHS)) return 'Every month needs exactly one name.'

  const firsts = table.letters.map((entry) => entry.name)
  const lasts = table.months.map((entry) => entry.name)
  if (firsts.some((name) => normalizeFirstName(name) !== name)) {
    return 'A first name is not suitable for a published activity book.'
  }
  if (lasts.some((name) => normalizeLastName(name) !== name)) {
    return 'A last name is not suitable for a published activity book.'
  }
  const distinct = (names: readonly string[]) =>
    names.every((name, i) => names.slice(0, i).every((other) => !namesClash(name, other)))
  if (!distinct(firsts)) return 'Two first names on this page are too alike.'
  if (!distinct(lasts)) return 'Two last names on this page are too alike.'
  if (firsts.some((first) => lasts.some((last) => namesClash(first, last)))) {
    return 'A first name repeats a word from a last name.'
  }
  return null
}

/** Gender-neutral example readers, by initial. */
const EXAMPLE_PEOPLE: readonly (readonly [string, string])[] = [
  ['P', 'Pat'],
  ['S', 'Sam'],
  ['C', 'Chris'],
  ['A', 'Alex'],
  ['R', 'Robin'],
  ['T', 'Terry'],
  ['J', 'Jamie'],
  ['M', 'Morgan'],
  ['D', 'Dana'],
  ['K', 'Kelly'],
  ['L', 'Lee'],
  ['F', 'Frankie'],
]

export interface RnExample {
  /** "Example: Pat, born in July" */
  lead: string
  /** "P + July = Captain Porch Rocker" */
  result: string
}

function hashNames(table: RnTable): number {
  let hash = 0x811c9dc5
  for (const entry of [...table.letters, ...table.months]) {
    for (let i = 0; i < entry.name.length; i++) {
      hash = Math.imul(hash ^ entry.name.charCodeAt(i), 0x01000193) >>> 0
    }
  }
  return hash
}

/**
 * A worked example built from this page's own table, so the reader sees the
 * lookup done once: "Example: Pat, born in July" / "P + July = Captain Porch
 * Rocker". Picked from the content, not the seed, so the page is the same
 * whenever the same names are drawn; the first one that `fits` is taken.
 */
export function chooseRnExample(
  table: RnTable,
  monthLabels: readonly string[],
  fits: (example: RnExample) => boolean,
): RnExample | null {
  const hash = hashNames(table)
  for (let p = 0; p < EXAMPLE_PEOPLE.length; p++) {
    const [letter, person] = EXAMPLE_PEOPLE[(hash + p) % EXAMPLE_PEOPLE.length]!
    const first = table.letters.find((entry) => entry.key === letter)?.name
    if (!first) continue
    for (let m = 0; m < RN_MONTHS.length; m++) {
      const month = ((hash >>> 8) + m) % RN_MONTHS.length
      const example: RnExample = {
        lead: `Example: ${person}, born in ${RN_MONTHS[month]}`,
        result: `${letter} + ${monthLabels[month]} = ${first} ${table.months[month]!.name}`,
      }
      if (fits(example)) return example
    }
  }
  return null
}
