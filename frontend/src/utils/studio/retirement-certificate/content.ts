import type { StudioRng } from '../studio-rng'

/**
 * Everything a Certificate of Retirement says, bundled and original.
 *
 * No AI and no network: a certificate is a heading, a presentation line, the
 * retiree's name, one short citation, an "officially promoted to" title and a
 * signature row. A curated library does that better than a model — every
 * phrase here can be read, checked and kept kind. Variety comes from
 * combining the parts by seed (heading × lead × citation × service wording ×
 * promotion line × title × frame × emblem × seal), steered away from what the
 * book and the seller printed last.
 *
 * House rules for the wording: humour is about freedom — meetings, alarm
 * clocks, hobbies, travel, coffee, gardens, slow mornings — never about age,
 * health, memory, money or being idle. Titles are short noun phrases that read
 * after "Officially promoted to" with no article.
 */

export const CR_TEMPLATE_KEY = 'retirement-certificate'

/**
 * Shown in the title field. Left as it is, it means "choose a heading for
 * me": each certificate gets one of the headings below.
 */
export const CR_DEFAULT_TITLE = 'Certificate of Retirement'

export const CR_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a certificate. Pick a larger page in Settings.'
export const CR_BUILD_FAILED_MESSAGE =
  'Could not lay out this certificate on your page size. Try a shorter title or name.'

/* ---------------------------------------------------------------- tone */

export type CrTone = 'playful' | 'warm' | 'classic'

export const CR_TONES: readonly { value: CrTone; label: string; help: string }[] = [
  {
    value: 'playful',
    label: 'Fun',
    help: 'A funny new job title and a light-hearted citation — “Chief Leisure Officer”. Great for coworker books.',
  },
  {
    value: 'warm',
    label: 'Heartfelt',
    help: 'Grateful, gentle wording and a kind new title — “Collector of Sunsets”. Ideal from family and friends.',
  },
  {
    value: 'classic',
    label: 'Classic',
    help: 'Formal certificate wording with a dignified honorary title — “Retiree Emeritus”.',
  },
]

export function parseCrTone(raw: unknown): CrTone {
  return CR_TONES.some((t) => t.value === raw) ? (raw as CrTone) : 'playful'
}

type Tones = readonly CrTone[]
const ALL: Tones = ['playful', 'warm', 'classic']
const FUN: Tones = ['playful']
const WARM: Tones = ['warm']
const FORMAL: Tones = ['classic']
const FUN_WARM: Tones = ['playful', 'warm']
const WARM_FORMAL: Tones = ['warm', 'classic']
const FUN_FORMAL: Tones = ['playful', 'classic']

const suits = (tone: CrTone, item: { for: Tones }) => item.for.includes(tone)

/* ------------------------------------------------------------- fields */

const clean = (raw: unknown) =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** Curly apostrophes print better than straight ones in every serif we ship. */
const curl = (text: string) => text.replace(/'/g, '’')

/** Room for "Dr. Margaret O’Connell-Hughes", and never more than two lines of name. */
export const CR_NAME_MAX = 32
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u

/** The retiree's name as printed, or '' — blank, too long, or not a name. */
export function parseCrName(raw: unknown): string {
  const text = clean(raw)
  if (!text || text.length > CR_NAME_MAX || !NAME_RE.test(text)) return ''
  return curl(text)
}

export function crNameProblem(raw: unknown): string | null {
  const text = clean(raw)
  if (!text || parseCrName(text)) return null
  return `Use the retiree’s name: letters only, up to ${CR_NAME_MAX} characters.`
}

export const CR_YEARS_MAX = 70

/** Whole years of service, or 0 for "leave it out". */
export function parseCrYears(raw: unknown): number {
  const text = clean(raw)
  if (!/^\d{1,2}$/.test(text)) return 0
  const years = Number(text)
  return years >= 1 && years <= CR_YEARS_MAX ? years : 0
}

export function crYearsProblem(raw: unknown): string | null {
  const text = clean(raw)
  if (!text || parseCrYears(text)) return null
  return `Enter a whole number of years, from 1 to ${CR_YEARS_MAX}.`
}

/** "September 30, 2026" fits a signature line at reading size; much longer does not. */
export const CR_DATE_MAX = 20
const DATE_RE = /^[\p{L}\d][\p{L}\d .,/-]*$/u
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * The retirement date as printed, or ''. An ISO date (what a date picker or a
 * spreadsheet pastes) is spelled out; anything else is printed as typed, so
 * "30 June 2026" and "Spring 2026" both work. It must carry a number — a date
 * with no day or year is not a date.
 */
export function parseCrDate(raw: unknown): string {
  const text = clean(raw)
  if (!text || text.length > CR_DATE_MAX || !DATE_RE.test(text) || !/\d/.test(text)) return ''
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    if (month < 1 || month > 12 || day < 1 || day > 31) return ''
    return `${MONTHS[month - 1]} ${day}, ${year}`
  }
  return text
}

export function crDateProblem(raw: unknown): string | null {
  const text = clean(raw)
  if (!text || parseCrDate(text)) return null
  return `Enter a date such as “June 30, 2026”, up to ${CR_DATE_MAX} characters.`
}

/** The four-digit year inside a printed date, for the seal. */
export function crDateYear(date: string): string {
  return /\b((?:19|20)\d{2})\b/.exec(date)?.[1] ?? ''
}

/** A company, school or team name — one short phrase after "at". */
export const CR_PLACE_MAX = 36
const PLACE_RE = /^[\p{L}\d][\p{L}\p{M}\d .,&'’()-]*$/u

export function parseCrPlace(raw: unknown): string {
  const text = clean(raw)
  if (!text || text.length > CR_PLACE_MAX || !PLACE_RE.test(text)) return ''
  return curl(text).replace(/[.,]+$/, '')
}

export function crPlaceProblem(raw: unknown): string | null {
  const text = clean(raw)
  if (!text || parseCrPlace(text)) return null
  return `Use a workplace or team name: letters and numbers, up to ${CR_PLACE_MAX} characters.`
}

/** A seller's own "promoted to" title: a short noun phrase. */
export const CR_TITLE_MAX = 40
const TITLE_RE = /^[\p{L}\d][\p{L}\p{M}\d .,&'’!-]*$/u

export function parseCrCustomTitle(raw: unknown): string {
  const text = clean(raw)
  if (!text || text.length > CR_TITLE_MAX || !TITLE_RE.test(text)) return ''
  return curl(text)
}

export function crCustomTitleProblem(raw: unknown): string | null {
  const text = clean(raw)
  if (!text || parseCrCustomTitle(text)) return null
  return `Keep the title short: letters and numbers, up to ${CR_TITLE_MAX} characters.`
}

/** A heading the seller types over the default. Two lines at most. */
export const CR_HEADING_MAX = 48

export function crHeadingProblem(raw: unknown): string | null {
  return clean(raw).length > CR_HEADING_MAX
    ? `Keep the certificate heading to ${CR_HEADING_MAX} characters or fewer.`
    : null
}

/* ------------------------------------------------------------ headings */

export interface CrHeading {
  id: string
  for: Tones
  /** Small letter-spaced line above the main heading, if any. */
  over?: string
  main: string
}

export const CR_HEADINGS: readonly CrHeading[] = [
  { id: 'certificate', for: ALL, main: 'Certificate of Retirement' },
  { id: 'official-certificate', for: ALL, over: 'Official', main: 'Certificate of Retirement' },
  { id: 'certificate-of', for: ALL, over: 'Certificate of', main: 'Retirement' },
  { id: 'retirement-certificate', for: ALL, main: 'Retirement Certificate' },
  { id: 'honorary', for: WARM_FORMAL, over: 'Honorary', main: 'Certificate of Retirement' },
  { id: 'well-earned', for: WARM_FORMAL, over: 'Certificate of', main: 'Well-Earned Retirement' },
  { id: 'happy', for: FUN_WARM, over: 'Certificate of', main: 'Happy Retirement' },
  { id: 'freedom', for: FUN_WARM, over: 'Certificate of', main: 'Well-Earned Freedom' },
  { id: 'license', for: FUN, over: 'Official License to', main: 'Retire' },
  { id: 'notice', for: FUN, over: 'Official Notice of', main: 'Retirement' },
  { id: 'diploma', for: FUN, over: 'Diploma in', main: 'The Art of Retirement' },
  { id: 'award', for: FUN_FORMAL, over: 'Official', main: 'Retirement Award' },
  { id: 'honorable', for: FORMAL, over: 'Certificate of', main: 'Honorable Retirement' },
  { id: 'honor', for: FORMAL, over: 'Certificate of Honor', main: 'Upon Retirement' },
  { id: 'next-chapter', for: WARM, over: 'Certificate for', main: 'The Next Chapter' },
  { id: 'celebration', for: FUN_WARM, over: 'A Certificate to Celebrate', main: 'Retirement' },
]

/* --------------------------------------------------------------- leads */

/**
 * The line above the name. A `that` lead reads into a verb ("This certifies
 * that … has completed"); a `to` lead reads into a phrase ("Proudly presented
 * to … in recognition of"). Citations are matched to the lead's kind.
 */
export type CrLeadKind = 'that' | 'to'

export interface CrLead {
  id: string
  for: Tones
  kind: CrLeadKind
  text: string
}

export const CR_LEADS: readonly CrLead[] = [
  { id: 'certifies', for: ALL, kind: 'that', text: 'This certifies that' },
  { id: 'to-certify', for: WARM_FORMAL, kind: 'that', text: 'This is to certify that' },
  { id: 'let-it-be-known', for: FUN_FORMAL, kind: 'that', text: 'Let it be known that' },
  { id: 'be-it-known', for: FUN_FORMAL, kind: 'that', text: 'Be it known to all that' },
  { id: 'delighted', for: FUN_WARM, kind: 'that', text: 'We are delighted to announce that' },
  { id: 'proudly-certify', for: WARM, kind: 'that', text: 'We proudly certify that' },
  { id: 'presented', for: ALL, kind: 'to', text: 'Proudly presented to' },
  { id: 'gratitude', for: WARM_FORMAL, kind: 'to', text: 'Presented with gratitude to' },
  { id: 'awarded', for: FUN_FORMAL, kind: 'to', text: 'Awarded to' },
  { id: 'in-honor', for: WARM_FORMAL, kind: 'to', text: 'In honor of' },
  { id: 'congratulations', for: FUN_WARM, kind: 'to', text: 'With warmest congratulations to' },
]

/* ----------------------------------------------------------- citations */

/**
 * One sentence under the name. `{service}` becomes "32 years of dedicated
 * service at Riverside Library", "many years of loyal service" — whatever
 * the seller gave, so a missing detail never leaves a gap or a dangling "at".
 */
export interface CrCitation {
  id: string
  for: Tones
  kind: CrLeadKind
  text: string
}

export const CR_CITATIONS: readonly CrCitation[] = [
  // Playful — freedom from the working week.
  {
    id: 'excused',
    for: FUN,
    kind: 'that',
    text: 'has completed {service} and is hereby excused from alarm clocks, meetings and Monday mornings, effective immediately.',
  },
  {
    id: 'own-hours',
    for: FUN,
    kind: 'that',
    text: 'has completed {service} and is now free to set their own hours — all of them.',
  },
  {
    id: 'inbox',
    for: FUN,
    kind: 'that',
    text: 'has successfully completed {service} and is hereby released from all meetings, deadlines and inboxes.',
  },
  {
    id: 'scenic-route',
    for: FUN,
    kind: 'that',
    text: 'has put in {service} and has officially traded the commute for the scenic route.',
  },
  {
    id: 'sleep-in',
    for: FUN,
    kind: 'that',
    text: 'has completed {service} and may now sleep in without asking anyone’s permission.',
  },
  {
    id: 'exemption',
    for: FUN,
    kind: 'to',
    text: 'in recognition of {service} and with a permanent exemption from Monday mornings.',
  },
  {
    id: 'weekdays',
    for: FUN,
    kind: 'to',
    text: 'for {service} — and a lifetime supply of free weekdays.',
  },
  {
    id: 'out-of-office',
    for: FUN,
    kind: 'to',
    text: 'in honor of {service} and an out-of-office reply that never needs to be switched off.',
  },
  // Warm — thanks and good wishes.
  {
    id: 'new-chapter',
    for: WARM,
    kind: 'that',
    text: 'has given {service} with a generous heart and now begins a wonderful new chapter.',
  },
  {
    id: 'thanks',
    for: WARM,
    kind: 'that',
    text: 'has completed {service} and goes forward with our deepest thanks and warmest wishes.',
  },
  {
    id: 'every-good-wish',
    for: WARM,
    kind: 'that',
    text: 'has completed {service} and is sent into retirement with gratitude and every good wish.',
  },
  {
    id: 'heartfelt',
    for: WARM,
    kind: 'to',
    text: 'with heartfelt thanks for {service} and every good wish for the chapter ahead.',
  },
  {
    id: 'grateful',
    for: WARM,
    kind: 'to',
    text: 'in grateful recognition of {service}, with warm wishes for all that comes next.',
  },
  // Classic — formal and brief.
  {
    id: 'privileges',
    for: FORMAL,
    kind: 'that',
    text: 'has faithfully completed {service} and is hereby granted all the rights and privileges of retirement.',
  },
  {
    id: 'distinction',
    for: FORMAL,
    kind: 'that',
    text: 'has concluded {service} with distinction and is hereby welcomed into a well-earned retirement.',
  },
  {
    id: 'honored',
    for: FORMAL,
    kind: 'that',
    text: 'has completed {service} and is hereby honored upon the occasion of retirement.',
  },
  {
    id: 'recognition',
    for: FORMAL,
    kind: 'to',
    text: 'in recognition of {service} and in honor of a well-earned retirement.',
  },
  {
    id: 'acknowledgment',
    for: FORMAL,
    kind: 'to',
    text: 'in grateful acknowledgment of {service}, upon the occasion of retirement.',
  },
]

/** What the service was, after "32 years of …". */
export interface CrService {
  id: string
  for: Tones
  text: string
}

export const CR_SERVICE: readonly CrService[] = [
  { id: 'dedicated', for: ALL, text: 'dedicated service' },
  { id: 'loyal', for: WARM_FORMAL, text: 'loyal service' },
  { id: 'outstanding', for: ALL, text: 'outstanding service' },
  { id: 'faithful', for: FORMAL, text: 'faithful service' },
  { id: 'good-humor', for: FUN_WARM, text: 'hard work and good humor' },
  { id: 'remarkable', for: FUN_WARM, text: 'remarkable work' },
  { id: 'devoted', for: WARM, text: 'devoted service' },
]

/** "32 years of dedicated service at Riverside Library" — or as much of it as is known. */
export function serviceText(service: CrService, years: number, place: string): string {
  const span = years > 0 ? `${years} ${years === 1 ? 'year' : 'years'}` : 'many years'
  return `${span} of ${service.text}${place ? ` at ${place}` : ''}`
}

export function citationText(citation: CrCitation, service: CrService, years: number, place: string): string {
  return citation.text.replace('{service}', serviceText(service, years, place))
}

/* ----------------------------------------------------- promotion line */

/** Small letter-spaced line above the new title; each reads straight into it. */
export interface CrPromotion {
  id: string
  for: Tones
  text: string
}

export const CR_PROMOTIONS: readonly CrPromotion[] = [
  { id: 'officially', for: ALL, text: 'Officially promoted to' },
  { id: 'effective', for: FUN, text: 'Effective immediately, promoted to' },
  { id: 'hereby', for: FUN_FORMAL, text: 'Hereby promoted to' },
  { id: 'now-serving', for: FUN_WARM, text: 'Now serving as' },
  { id: 'appointed', for: ALL, text: 'Newly appointed' },
  { id: 'with-honors', for: WARM, text: 'Promoted with honors to' },
  { id: 'proudly-serving', for: WARM, text: 'Now proudly serving as' },
  { id: 'named', for: FORMAL, text: 'Hereby named' },
  { id: 'honorary-title', for: FORMAL, text: 'Awarded the honorary title of' },
]

/* -------------------------------------------------------------- titles */

/**
 * The new "job" — short, warm, easy to read aloud at a party. Grouped by the
 * tone they suit; the pool a certificate draws from is its tone's list.
 */
const PLAYFUL_TITLES = [
  'Chief Leisure Officer',
  'Full-Time Relaxer',
  'Weekend Manager, Seven Days a Week',
  'Professional Vacation Planner',
  'Master of Slow Mornings',
  'Director of Free Time',
  'Head of Hobbies',
  'Vice President of Leisure',
  'Chief Coffee Officer',
  'Commissioner of Long Lunches',
  'Minister of Morning Coffee',
  'Director of Porch Operations',
  'Chief Adventure Officer',
  'Head of Garden Affairs',
  'Executive Director of Day Trips',
  'Grand Master of the Open Calendar',
  'President of the No-Meetings Club',
  'Chief Executive of Sleeping In',
  'Vice President of Weekday Adventures',
  'Director of Scenic Routes',
  'Chief Road Trip Officer',
  'Head Gardener, Now Full-Time',
  'Lead Explorer of Local Cafés',
  'Commissioner of Crossword Puzzles',
  'Director of Unscheduled Afternoons',
  'Chief Officer of Second Coffees',
  'Head of Beach Operations',
  'Chief Inspector of Farmers’ Markets',
  'Manager of Midweek Getaways',
  'Director of Weekday Matinees',
  'Chief Hobby Officer',
  'Project Lead, Fishing Trips',
  'Superintendent of the Back Garden',
  'Head Chef of Long Brunches',
  'Official Pastry Taste-Tester',
  'Grand Marshal of the Daily Walk',
  'Director of Book Club Affairs',
  'Chief Explorer of Back Roads',
  'Head of Sunshine Operations',
  'Chief Strategist of Weekend Plans',
  'President of the Out-of-Office Club',
  'Vice President of Spontaneous Plans',
  'Chair of the Coffee Committee',
  'Chief Travel Planner',
  'Director of Golf Course Research',
  'Chief Hammock Inspector',
  'Director of Doing What They Love',
  'Head of Hobby Research & Development',
  'Executive in Charge of Leisure',
  'Chief Officer of Fun',
  'Minister of Weekday Pancakes',
  'Director of Sunny Afternoons',
  'Global Head of Day Trips',
  'Chief Birdwatching Officer',
  'Director of Weekday Picnics',
  'Supervisor of the Tomato Patch',
  'Chief Postcard Writer',
  'Head of Puzzle Operations',
  'Director of the Long Weekend',
  'Chief Explorer of New Recipes',
  'Captain of the Weekday Road Trip',
  'Principal Sunset Watcher',
]

const WARM_TITLES = [
  'Full-Time Adventurer',
  'Keeper of Good Stories',
  'Chief Memory Maker',
  'Head of Happy Days',
  'Collector of Sunsets',
  'Guardian of the Garden',
  'Explorer of New Horizons',
  'Curator of Cozy Afternoons',
  'Director of Family Time',
  'Keeper of the Open Road',
  'Chief Officer of Good Times',
  'Champion of Long Walks',
  'Master of Free Afternoons',
  'Author of the Next Chapter',
  'Collector of Happy Moments',
  'Keeper of Weekend Traditions',
  'Planner of Grand Adventures',
  'Master of Well-Earned Leisure',
  'Captain of Their Own Calendar',
  'Lifetime Member of the Good-Life Club',
  'Chief Officer of Happiness',
  'Keeper of Slow Sunday Mornings',
  'Director of Doing What They Love',
  'Head of Sunshine Operations',
  'Chief Adventure Officer',
  'Master of Slow Mornings',
  'Full-Time Traveler',
  'Head Gardener, Now Full-Time',
]

const CLASSIC_TITLES = [
  'Retiree Emeritus',
  'Distinguished Retiree',
  'Honorary Lifetime Member of the Weekend',
  'Esteemed Member of the Leisure Society',
  'Retiree, With Highest Honors',
  'Master of the Leisure Arts',
  'Fellow of the Society of Free Time',
  'Honorary Doctor of Relaxation',
  'Distinguished Fellow of Leisure',
  'Laureate of the Long Weekend',
  'Grand Master of Retirement',
  'Retiree, First Class',
  'Honorary Chair of Leisure Studies',
  'Professor Emeritus of Free Time',
  'Lifetime Ambassador of Leisure',
  'Chancellor of the Open Calendar',
  'Honored Graduate of the Workforce',
  'Officer of the Order of the Weekend',
  'Commander of the Order of Leisure',
  'Esteemed Ambassador of Good Living',
  'Chief Leisure Officer',
]

const TITLES: Record<CrTone, readonly string[]> = {
  playful: PLAYFUL_TITLES,
  warm: WARM_TITLES,
  classic: CLASSIC_TITLES,
}

export const crTitlesFor = (tone: CrTone) => TITLES[tone]

/* ------------------------------------------------------ signature row */

export interface CrSignLabel {
  id: string
  for: Tones
  text: string
}

/** Under the signature line. */
export const CR_SIGN_LABELS: readonly CrSignLabel[] = [
  { id: 'presented-by', for: ALL, text: 'Presented by' },
  { id: 'signed', for: ALL, text: 'Signed' },
  { id: 'committee', for: FUN, text: 'The Retirement Committee' },
  { id: 'authorized', for: FUN_FORMAL, text: 'Authorized signature' },
  { id: 'everyone', for: WARM, text: 'On behalf of everyone' },
  { id: 'with-love', for: WARM, text: 'With love from' },
]

/** Under the date line when a date is printed on it. */
export const CR_DATE_LABELS: readonly CrSignLabel[] = [
  { id: 'retirement-date', for: ALL, text: 'Retirement date' },
  { id: 'effective', for: FUN_FORMAL, text: 'Effective date' },
  { id: 'date-of', for: WARM_FORMAL, text: 'Date of retirement' },
]

/** Under a blank date line: whoever signs writes the day it is presented. */
export const CR_BLANK_DATE_LABEL = 'Date'

/* ------------------------------------------------------------- design */

export type CrFrame = 'double' | 'deco' | 'rounded' | 'brackets' | 'dotted' | 'diamonds' | 'scalloped'
export const CR_FRAMES: readonly CrFrame[] = ['double', 'deco', 'rounded', 'brackets', 'dotted', 'diamonds', 'scalloped']

/** Small line-art emblem over the heading. */
export type CrEmblem = 'sunrise' | 'laurel' | 'star' | 'sailboat' | 'flourish' | 'compass'
export const CR_EMBLEMS: readonly CrEmblem[] = ['sunrise', 'laurel', 'star', 'sailboat', 'flourish', 'compass']

/** The seal between the signature lines, or none. */
export type CrSeal = 'scalloped' | 'starburst' | 'beaded' | 'none'
export const CR_SEALS: readonly CrSeal[] = ['scalloped', 'starburst', 'beaded', 'none']

/** How the name is set: upright bold, or a large italic. */
export type CrNameStyle = 'italic' | 'bold'
export const CR_NAME_STYLES: readonly CrNameStyle[] = ['italic', 'bold']

/* -------------------------------------------------------------- picks */

export const crHeadingsFor = (tone: CrTone) => CR_HEADINGS.filter((h) => suits(tone, h))
export const crLeadsFor = (tone: CrTone) => CR_LEADS.filter((l) => suits(tone, l))
export const crCitationsFor = (tone: CrTone, kind: CrLeadKind) =>
  CR_CITATIONS.filter((c) => suits(tone, c) && c.kind === kind)
export const crServiceFor = (tone: CrTone) => CR_SERVICE.filter((s) => suits(tone, s))
export const crPromotionsFor = (tone: CrTone) => CR_PROMOTIONS.filter((p) => suits(tone, p))
export const crSignLabelsFor = (tone: CrTone) => CR_SIGN_LABELS.filter((s) => suits(tone, s))
export const crDateLabelsFor = (tone: CrTone) => CR_DATE_LABELS.filter((s) => suits(tone, s))

/** "Chief Leisure Officer" → "chief-leisure-officer". */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Book and seller memory labels — short, stable tokens so a later
 * certificate can tell what an earlier one printed.
 */
export const crLabel = {
  heading: (id: string) => `h:${id}`,
  lead: (id: string) => `l:${id}`,
  citation: (id: string) => `c:${id}`,
  promotion: (id: string) => `p:${id}`,
  title: (text: string) => `t:${slug(text)}`,
  frame: (frame: CrFrame) => `f:${frame}`,
  emblem: (emblem: CrEmblem) => `e:${emblem}`,
  seal: (seal: CrSeal) => `s:${seal}`,
}

/** What earlier certificates printed, as the label sets `pickFresh` scores against. */
export interface CrMemory {
  book: ReadonlySet<string>
  recent: ReadonlySet<string>
}

const staleness = (label: string, memory: CrMemory) =>
  (memory.book.has(label) ? 2 : 0) + (memory.recent.has(label) ? 1 : 0)

/**
 * The option this book has not printed, then one this seller has not printed
 * lately, ties broken by seed. Bounded by the pool — never a search of
 * everything ever made.
 */
export function pickFresh<T>(rng: StudioRng, items: readonly T[], label: (item: T) => string, memory: CrMemory): T {
  let best = items[0] as T
  let bestScore = Number.POSITIVE_INFINITY
  for (const item of rng.shuffle(items)) {
    const score = staleness(label(item), memory)
    if (score < bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

/** Every bundled title, so the preflight can refuse anything malformed. */
export const CR_TITLE_TEXTS: ReadonlySet<string> = new Set(Object.values(TITLES).flat())
