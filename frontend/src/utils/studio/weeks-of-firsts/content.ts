import type {
  WeeksOfFirstsAreaAsk,
  WeeksOfFirstsFocus,
  WeeksOfFirstsResponse,
} from '@/types/studio-weeks-of-firsts.types'
import { createRng } from '../studio-rng'
import {
  contentTokens,
  ideaKey,
  keysRepeat,
  normalizeConcept,
  normalizeIdea,
  type IdeaKey,
} from '../bucket-list/content'

/**
 * What one week of a 52 Weeks of Firsts year is, every rule its idea must
 * pass to print, and how fifty-two ideas become a balanced, well-spaced year.
 *
 * A week is one concrete new thing to try — "Cook a Thai green curry from
 * scratch" — printed under its week number with a line for the date and room
 * for notes. The weeks are numbered, not dated, so a reader can start any
 * week of the year: nothing seasonal, nothing that sounds like an order.
 *
 * Idea shape, safety and meaning-level repeats are the Bucket List's own
 * gates, with a roomier line (up to twelve words) and the "never tried
 * before" padding every first carries set aside when two ideas are compared.
 *
 * A year is judged as a whole, not idea by idea: every area of life it draws
 * on keeps to its share (never more than five weeks of anything), at least
 * fourteen different areas appear, bigger outings — far, strenuous or costly —
 * are capped at four, and no area comes round two weeks running.
 *
 * These gates mirror `backend/app/services/studio_weeks_of_firsts_service.py`
 * and run again here on purpose: whatever the endpoint returns — an older
 * deploy, a mock, a truncated reply — only whole, valid weeks reach the
 * editor. An idea is never repaired. The word lists are the service's own
 * (`backend/app/data/studio/weeks-of-firsts/prompt.json`), checked equal by
 * `content.test.ts`.
 */

export const WF_TEMPLATE_KEY = 'weeks-of-firsts'
export const WF_DEFAULT_TITLE = '52 Weeks of Firsts'

/** Mirrors `limits` in the service's prompt.json. */
export const WF_LIMITS = {
  weeks: 52,
  areaMin: 2,
  areaBase: 3,
  areaBoost: 4,
  areaMax: 5,
  minAreas: 14,
  stretchMax: 4,
  minIdeaChars: 14,
  maxIdeaChars: 60,
  minIdeaWords: 3,
  maxIdeaWords: 12,
  maxConceptChars: 40,
} as const

/** Longest idea the page plans for. */
export const MAX_IDEA_CHARS = WF_LIMITS.maxIdeaChars
export const WF_WEEKS = WF_LIMITS.weeks

/**
 * Mirrors `areas` in the service's prompt.json: each area and the broader
 * kind of week it belongs to. Never printed — it only balances and spaces the
 * year, so two food weeks or two outings rarely sit side by side.
 */
export const WF_AREAS: Readonly<Record<string, string>> = {
  kitchen: 'food',
  tastes: 'food',
  nearby: 'outing',
  nature: 'outdoors',
  grow: 'outdoors',
  make: 'creative',
  picture: 'creative',
  words: 'mind',
  music: 'creative',
  learn: 'mind',
  people: 'people',
  give: 'people',
  culture: 'outing',
  calm: 'rest',
  play: 'play',
  move: 'active',
  adventure: 'outing',
  home: 'rest',
}

/**
 * Keeps this game's shuffle out of step with the other games'. A book run
 * hands a spread one seed; without a salt two games would draw alike.
 */
export const WF_SALT = 0x77656b73

export const WF_FOCUSES: readonly { value: WeeksOfFirstsFocus; label: string; help: string }[] = [
  {
    value: 'balanced',
    label: 'A bit of everything',
    help: 'Food, nature, making, learning, people, culture and quiet pleasures, spread through the year.',
  },
  {
    value: 'close-to-home',
    label: 'Close to home & low-cost',
    help: 'More cooking, growing, home projects and slow pleasures — still with outings and people in the mix.',
  },
  {
    value: 'out-and-about',
    label: 'Out & about',
    help: 'More local discoveries, nature, culture and small adventures — still mixed with quieter weeks at home.',
  },
  {
    value: 'creative',
    label: 'Creative & curious',
    help: 'More making, pictures, words and music — still mixed with fresh air and people.',
  },
  {
    value: 'social',
    label: 'Friends & community',
    help: 'More time with friends and neighbours, kindness, games and food out — still with quiet weeks too.',
  },
]

export function parseWfFocus(raw: unknown): WeeksOfFirstsFocus {
  return WF_FOCUSES.some((focus) => focus.value === raw) ? (raw as WeeksOfFirstsFocus) : 'balanced'
}

/** The how-to line: try, date, note — at the reader's own pace. */
export const WF_INSTRUCTION =
  'Try one new thing each week. Write the date you tried it, then a few notes: what you did, who was there, what you enjoyed. Start any week of the year and go at your own pace.'

export const WF_AI_EMPTY_MESSAGE =
  'Could not write a fresh year of firsts this time. Please try again.'
export const WF_SHORT_MESSAGE =
  'Could not gather 52 distinct, well-balanced ideas this time. Please try again.'
export const WF_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for 52 Weeks of Firsts. Pick a larger page in Settings.'
export const WF_BUILD_FAILED_MESSAGE = 'Could not lay out this year of firsts on your page. Please try again.'

/* The service's word lists, verbatim. */
export const WF_FILLER_WORDS: readonly string[] = [
  'tried', 'tries', 'trying', 'youve', 'youd', 'youll', 'ive', 'havent', 'hasnt', 'didnt', 'dont',
  'yet', 'unfamiliar', 'familiar', 'usual', 'usually', 'normally', 'wondered', 'wondering', 'meant',
  'always', 'first', 'new', 'never', 'someone', 'something', 'different', 'ones',
]
export const WF_SEASONAL_TERMS: readonly string[] = [
  'christmas', 'xmas', 'easter', 'halloween', 'thanksgiving', 'hanukkah', 'diwali', 'new year',
  'new years', 'valentine', 'valentines', 'bonfire night', 'fireworks', 'birthday', 'anniversary',
  'summer', 'winter', 'autumn', 'spring', 'springtime', 'wintertime', 'summertime', 'snow', 'snowman',
  'snowfall', 'frost', 'heatwave', 'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december', 'this week', 'next week', 'this year',
  'next year', 'today', 'tomorrow', 'tonight',
]
export const WF_PRESSURE_TERMS: readonly string[] = [
  'must', 'should', 'have to', 'has to', 'need to', 'needs to', 'challenge yourself', 'push yourself',
  'force yourself', 'conquer', 'overcome', 'fear', 'fears', 'scared', 'brave', 'dare', 'at last',
  'no excuses', 'resolution', 'resolutions', 'achieve', 'accomplish',
]
export const WF_STRETCH_TERMS: readonly string[] = [
  'abroad', 'overseas', 'flight', 'fly', 'flying', 'cruise', 'road trip', 'weekend away',
  'night away', 'overnight', 'hike', 'hiking', 'climb', 'climbing', 'kayak', 'kayaking', 'canoe',
  'paddleboard', 'sail', 'sailing', 'ski', 'skiing', 'camp', 'camping', 'drive', 'driving',
  'splurge', 'luxury', 'expensive', 'balloon', 'zip line', 'zipline', 'marathon', 'run', 'running',
  'cycle', 'cycling', 'bike', 'swim', 'swimming', 'escape room',
]

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const SEASONAL_RE = termPattern(WF_SEASONAL_TERMS)
const PRESSURE_RE = termPattern(WF_PRESSURE_TERMS)
const STRETCH_RE = termPattern(WF_STRETCH_TERMS)
/** The padding, folded the same way as an idea's own words. Mirrors `_filler_tokens`. */
const FILLER = new Set(WF_FILLER_WORDS.flatMap((word) => [word, ...contentTokens(word)]))

/**
 * An idea's meaning key with the "never tried before" padding set aside, so
 * two firsts do not read as alike merely for both being new. Mirrors
 * `first_key`.
 */
export function firstKey(text: string, concept = ''): IdeaKey {
  const key = ideaKey(text, concept)
  const drop = (tokens: Set<string>) => new Set([...tokens].filter((token) => !FILLER.has(token)))
  return { text: key.text, tokens: drop(key.tokens), concept: drop(key.concept) }
}

export const firstsRepeat = (first: string, second: string) =>
  keysRepeat(firstKey(first), firstKey(second))

/** A bigger outing — far, strenuous or costly. Allowed, but only a few a year. */
export const isStretch = (text: string) => STRETCH_RE.test(text)

/**
 * One weekly idea as printed — "Cook a Thai green curry from scratch" — or
 * null. Mirrors `normalize_first`: the Bucket List's idea gates with a
 * roomier line, then at least three words, nothing seasonal or dated, no
 * pressure, and something concrete left once the padding is gone.
 */
export function normalizeFirst(raw: unknown, budget: number = MAX_IDEA_CHARS): string | null {
  const text = normalizeIdea(raw, budget, WF_LIMITS.maxIdeaWords)
  if (!text) return null
  const words = text.split(' ').filter(Boolean).length
  if (words < WF_LIMITS.minIdeaWords || text.length < WF_LIMITS.minIdeaChars) return null
  if (SEASONAL_RE.test(text) || PRESSURE_RE.test(text)) return null
  if (firstKey(text).tokens.size === 0) return null
  return text
}

/** One validated idea. */
export interface WfIdea {
  idea: string
  concept: string
}

/** One area and its validated ideas, spares included, in the service's order. */
export interface WfArea {
  key: string
  target: number
  items: WfIdea[]
}

/** One complete idea from raw service output — or null, never a repair. */
export function normalizeWfItem(raw: unknown): WfIdea | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const idea = normalizeFirst(record.idea)
  if (!idea) return null
  return { idea, concept: normalizeConcept(record.concept) }
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseWfPayload(remote: unknown): readonly unknown[] {
  if (!remote || typeof remote !== 'object') return []
  const areas = (remote as Partial<WeeksOfFirstsResponse>).areas
  return Array.isArray(areas) ? areas : []
}

const isArea = (key: string) => Object.prototype.hasOwnProperty.call(WF_AREAS, key)

/**
 * Normalize → gate → drop repeats, keeping every area's spares.
 *
 * Repeats are caught across the whole year, not just within an area, and
 * against `avoid` — ideas this seller's book already prints — so a reply that
 * ignores the prompt's avoid list still cannot repeat them. Areas that arrive
 * twice (a top-up) are merged under the first, keeping its share of the year.
 * Planned areas that came back empty are kept, so a top-up can name them.
 */
export function cleanWfAreas(
  raw: unknown,
  options: { avoid?: readonly string[]; keep?: readonly WfArea[] } = {},
): WfArea[] {
  const { avoid = [], keep = [] } = options
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => firstKey(label))
  const kept: IdeaKey[] = keep.flatMap((a) => a.items.map((i) => firstKey(i.idea, i.concept)))
  const out = new Map<string, WfArea>(keep.map((a) => [a.key, { ...a, items: [...a.items] }]))

  for (const rawArea of Array.isArray(raw) ? raw : []) {
    if (!rawArea || typeof rawArea !== 'object') continue
    const record = rawArea as Record<string, unknown>
    const key = String(record.key ?? '').trim()
    const target = Math.floor(Number(record.target))
    if (!isArea(key) || !(target >= 1 && target <= WF_LIMITS.areaMax)) continue
    const area = out.get(key) ?? { key, target, items: [] }
    for (const item of Array.isArray(record.items) ? record.items : []) {
      const idea = normalizeWfItem(item)
      if (!idea) continue
      const k = firstKey(idea.idea, idea.concept)
      if (kept.some((other) => keysRepeat(k, other))) continue
      if (avoided.some((other) => keysRepeat(k, other))) continue
      area.items.push(idea)
      kept.push(k)
    }
    out.set(key, area)
  }
  return [...out.values()]
}

/** One idea chosen for the year, with the area it balances under. */
export interface WfPick extends WfIdea {
  area: string
}

export interface WfYearPick {
  /** Exactly the year's weeks, in area order — or null when the areas cannot fill it. */
  picks: WfPick[] | null
  /** Ideas taken per area, filled or not: what a top-up is measured against. */
  taken: Map<string, number>
}

/**
 * The year's fifty-two ideas, balanced across the areas — or null.
 *
 * Every area takes its share first, in the service's order, passing over an
 * idea that does not fit its week on the page and any bigger outing once the
 * year already holds four. Whatever is still missing is spread over areas
 * with spares, round robin, at most two over their share and never past five
 * weeks — so no area swamps the year. Never pads with anything that failed a
 * gate, and never prints a year drawn from too few areas.
 */
export function pickWfYear(
  areas: readonly WfArea[],
  fits: (idea: string) => boolean = () => true,
): WfYearPick {
  const cursor = new Map<string, number>()
  const picked = new Map<string, WfPick[]>(areas.map((a) => [a.key, []]))
  let stretch = 0
  let total = 0

  const takeNext = (area: WfArea): boolean => {
    for (let i = cursor.get(area.key) ?? 0; i < area.items.length; i++) {
      const item = area.items[i]!
      const bigger = isStretch(item.idea)
      if (!fits(item.idea) || (bigger && stretch >= WF_LIMITS.stretchMax)) continue
      cursor.set(area.key, i + 1)
      picked.get(area.key)!.push({ ...item, area: area.key })
      if (bigger) stretch++
      total++
      return true
    }
    cursor.set(area.key, area.items.length)
    return false
  }

  for (const area of areas) {
    while (total < WF_WEEKS && picked.get(area.key)!.length < area.target) {
      if (!takeNext(area)) break
    }
  }
  for (let over = 1; over <= 2 && total < WF_WEEKS; ) {
    let progressed = false
    for (const area of areas) {
      if (total >= WF_WEEKS) break
      const ceiling = Math.min(WF_LIMITS.areaMax, area.target + over)
      if (picked.get(area.key)!.length < ceiling && takeNext(area)) progressed = true
    }
    if (!progressed) over++
  }

  const taken = new Map([...picked].map(([key, list]) => [key, list.length]))
  const used = [...taken.values()].filter((n) => n > 0).length
  if (total !== WF_WEEKS || used < WF_LIMITS.minAreas) return { picks: null, taken }
  return { picks: areas.flatMap((area) => picked.get(area.key)!), taken }
}

/** Areas still short of their share, for a top-up request. */
export function wfShortfall(areas: readonly WfArea[], taken: ReadonlyMap<string, number>): WeeksOfFirstsAreaAsk[] {
  return areas
    .filter((area) => (taken.get(area.key) ?? 0) < area.target)
    .map((area) => ({ key: area.key, count: Math.min(10, area.target - (taken.get(area.key) ?? 0)) }))
}

/** Weeks since an area last came round before it may come round again. */
const AREA_SPACING = 3
/** No bigger outing in the opening weeks: a year starts gently. */
const GENTLE_START = 4

/**
 * The picks in reading order, by seed.
 *
 * Built one week at a time: an area used in the last three weeks waits its
 * turn, the kind of week just printed (food, an outing...) is not followed by
 * another of the same kind where anything else is left, bigger outings are
 * kept apart and out of the opening weeks, and among what remains the area
 * with the most weeks still to place goes first — so the heavier areas spread
 * through the whole year instead of bunching at the end. Ties break in a
 * seeded order, so every year reads differently.
 */
export function orderWfYear(picks: readonly WfPick[], seed: number): WfPick[] {
  const rng = createRng((seed ^ WF_SALT) >>> 0)
  const queues = new Map<string, WfPick[]>()
  for (const pick of picks) {
    const queue = queues.get(pick.area) ?? []
    queue.push(pick)
    queues.set(pick.area, queue)
  }
  const tieOrder = rng.shuffle([...queues.keys()])
  const out: WfPick[] = []

  while (out.length < picks.length) {
    const recent = out.slice(-AREA_SPACING).map((pick) => pick.area)
    const last = out.at(-1)
    const lastGroup = last ? WF_AREAS[last.area] : undefined
    const lastStretch = last ? isStretch(last.idea) : false
    let best: string | null = null
    let bestScore: number[] = []
    tieOrder.forEach((key, index) => {
      const queue = queues.get(key)!
      if (queue.length === 0) return
      const nextStretch = isStretch(queue[0]!.idea)
      const score = [
        recent.includes(key) ? 1 : 0,
        WF_AREAS[key] === lastGroup ? 1 : 0,
        nextStretch && (lastStretch || out.length < GENTLE_START) ? 1 : 0,
        -queue.length,
        index,
      ]
      if (best === null || compareScores(score, bestScore) < 0) {
        best = key
        bestScore = score
      }
    })
    out.push(queues.get(best!)!.shift()!)
  }
  return out
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return 0
}

/** One week as the page prints it. */
export interface WfWeek extends WfPick {
  /** 1 to 52, whatever page it lands on. */
  week: number
}

export const numberWfWeeks = (ordered: readonly WfPick[]): WfWeek[] =>
  ordered.map((pick, index) => ({ ...pick, week: index + 1 }))

/**
 * Why a year may not print, or null when it may — the preflight's last word
 * on content that has already been picked and ordered. Checks the year as a
 * reader meets it: every week there once and in order, every idea printable
 * and distinct in meaning, no area swamping the year or coming round twice
 * running, enough areas, and only a few bigger outings.
 */
export function wfYearProblem(weeks: readonly WfWeek[]): string | null {
  if (weeks.length !== WF_WEEKS) return `The year holds ${weeks.length} weeks instead of ${WF_WEEKS}.`
  if (weeks.some((week, i) => week.week !== i + 1)) return 'The weeks are not numbered 1 to 52 in order.'
  for (const week of weeks) {
    if (normalizeFirst(week.idea) !== week.idea) return `Week ${week.week} is not suitable for a published activity book.`
    if (!isArea(week.area)) return `Week ${week.week} has no area of the year.`
  }
  const keys = weeks.map((week) => firstKey(week.idea, week.concept))
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < i; j++) {
      if (keysRepeat(keys[i]!, keys[j]!)) return `Week ${i + 1} repeats week ${j + 1}.`
    }
  }
  const counts = new Map<string, number>()
  for (const week of weeks) counts.set(week.area, (counts.get(week.area) ?? 0) + 1)
  if ([...counts.values()].some((n) => n > WF_LIMITS.areaMax)) return 'One kind of idea takes too many weeks.'
  if (counts.size < WF_LIMITS.minAreas) return 'The year needs more variety.'
  if (weeks.filter((week) => isStretch(week.idea)).length > WF_LIMITS.stretchMax) {
    return 'Too many weeks need travel, a big budget or a lot of energy.'
  }
  if (weeks.some((week, i) => i > 0 && weeks[i - 1]!.area === week.area)) {
    return 'Two weeks in a row draw on the same kind of idea.'
  }
  return null
}

/** Every idea in a set of areas, in the service's order. */
export const wfAreaIdeas = (areas: readonly WfArea[]): string[] =>
  areas.flatMap((area) => area.items.map((item) => item.idea))
