import type { RollADayFocus } from '@/types/studio-roll-a-day.types'
import {
  contentTokens,
  ideaKey,
  keysRepeat,
  normalizeConcept,
  normalizeIdea,
  type IdeaKey,
} from '../bucket-list/content'

/**
 * What a Roll-a-Day table is, and every rule an activity must pass to print
 * on it.
 *
 * The reader rolls a die for a morning plan and again for an afternoon plan,
 * then puts the two together: "Take a slow walk and grab a coffee" + "Bake a
 * small batch of scones". Nobody checks all 36 pairings, so every activity is
 * held to one shape that makes any morning combine with any afternoon:
 *
 * - **half a day, on its own** — never a whole-day plan, a trip away or
 *   anything overnight, never continuing the other half ("finish", "again");
 * - **in its own half of the day** — no mealtime and nothing of the evening
 *   on either side, no nap in a morning, no sunrise in an afternoon;
 * - **no day doubles up** — no two activities on the page share a word of
 *   substance, so a walk never meets a walk;
 * - **open to everyone** — nothing strenuous, no car, golf course, beach or
 *   big budget assumed.
 *
 * Each side also takes at least five different kinds of activity (rest,
 * movement, making, people, learning, outings, home, play), so a side is never
 * six ways of drinking coffee.
 *
 * These gates mirror `backend/app/services/studio_roll_a_day_service.py` and
 * run again here on purpose: whatever the endpoint returns — an older deploy,
 * a mock, a truncated reply — only whole, valid activities reach the editor.
 * Idea shape, safety and meaning-level repeats are the Bucket List's own
 * gates; the word lists below are the service's
 * (`backend/app/data/studio/roll-a-day/prompt.json`), checked equal by
 * `content.test.ts`. An activity is never repaired.
 */

export const RD_TEMPLATE_KEY = 'roll-a-day'
export const RD_DEFAULT_TITLE = 'Roll-a-Day'

/** Mirrors `limits` in the service's prompt.json. */
export const RD_LIMITS = {
  slots: 6,
  minKindsPerSide: 5,
  minActivityChars: 12,
  maxActivityChars: 34,
  minActivityWords: 3,
  maxActivityWords: 8,
} as const

/** Longest activity the page plans for. */
export const MAX_ACTIVITY_CHARS = RD_LIMITS.maxActivityChars

/** One face of a standard die per row. */
export const RD_FACES: readonly number[] = [1, 2, 3, 4, 5, 6]

export type RdSide = 'morning' | 'afternoon'
export const RD_SIDES: readonly RdSide[] = ['morning', 'afternoon']

/** Mirrors the keys of `kinds`: what an activity is, never printed. */
export const RD_KINDS = ['rest', 'move', 'make', 'people', 'learn', 'outing', 'home', 'play'] as const
export type RdKind = (typeof RD_KINDS)[number]
const KIND_SET = new Set<string>(RD_KINDS)

/**
 * Keeps this game's shuffle out of step with the other games'. A book run
 * hands a spread one seed; without a salt two games would draw alike.
 */
export const RD_SALT = 0x726f6c6c

export const RD_FOCUSES: readonly { value: RollADayFocus; label: string; help: string }[] = [
  {
    value: 'balanced',
    label: 'A bit of everything',
    help: 'Calm and active, home and out, solo and social, side by side.',
  },
  {
    value: 'home',
    label: 'Cosy days close to home',
    help: 'More home comforts, games and free pleasures — still with a stroll and a friend in the mix.',
  },
  {
    value: 'outings',
    label: 'Out & about nearby',
    help: 'More small local outings and discoveries — still mixed with quieter ideas at home.',
  },
  {
    value: 'creative',
    label: 'Creative & curious',
    help: 'More making, learning and home projects — still mixed with fresh air and people.',
  },
  {
    value: 'social',
    label: 'Friends & community',
    help: 'More time with friends, neighbours and local groups — still with quiet moments too.',
  },
]

export function parseRdFocus(raw: unknown): RollADayFocus {
  return RD_FOCUSES.some((focus) => focus.value === raw) ? (raw as RollADayFocus) : 'balanced'
}

/** The how-to line: roll, roll, combine. */
export const RD_INSTRUCTION =
  'Roll a die for your morning, then roll again for your afternoon. Put the two together — that’s your day!'

/** Section headings: which roll, and which half of the day it plans. */
export const RD_HEADINGS: Readonly<Record<RdSide, string>> = {
  morning: 'Roll #1: Morning',
  afternoon: 'Roll #2: Afternoon',
}

export const RD_AI_EMPTY_MESSAGE =
  'Could not write a fresh Roll-a-Day table this time. Please try again.'
export const RD_SHORT_MESSAGE =
  'Could not gather six distinct morning and six afternoon ideas. Please try again.'
export const RD_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a Roll-a-Day table. Pick a larger page in Settings.'
export const RD_BUILD_FAILED_MESSAGE = 'Could not fit these ideas on this page. Please try again.'

/* The service's word lists, verbatim. */
export const RD_ANY_SIDE_BANNED: readonly string[] = [
  'all day', 'all-day', 'whole day', 'full day', 'day trip', 'day out', 'road trip', 'overnight',
  'weekend', 'vacation', 'holiday', 'holidays', 'cruise', 'flight', 'lunch', 'lunchtime', 'dinner',
  'supper', 'brunch', 'evening', 'tonight', 'night', 'nighttime', 'bedtime', 'midnight', 'sunset',
  'dusk', 'stargaze', 'stargazing', 'stars', 'moon', 'tomorrow', 'yesterday', 'finish', 'continue',
  'again', 'rest of the day', 'later', 'after', 'afterwards', 'before', 'until', 'this morning',
  'this afternoon',
]
export const RD_MORNING_BANNED: readonly string[] = ['afternoon', 'nap', 'siesta']
export const RD_AFTERNOON_BANNED: readonly string[] = [
  'morning', 'sunrise', 'dawn', 'daybreak', 'breakfast', 'wake', 'early',
]
export const RD_EXCLUSIVE_TERMS: readonly string[] = [
  'run', 'running', 'jog', 'jogging', 'marathon', 'sprint', 'hike', 'hiking', 'climb', 'climbing',
  'lift', 'lifting', 'weights', 'gym', 'workout', 'drive', 'driving', 'car', 'golf', 'beach',
  'boat', 'yacht', 'ski', 'skiing', 'splurge', 'expensive', 'luxury', 'spa day', 'shopping spree',
]
export const RD_SOFT_WORDS: readonly string[] = [
  'friend', 'friends', 'neighbour', 'neighbours', 'neighbor', 'neighbors', 'people', 'person',
  'home', 'house', 'outside', 'outdoors', 'indoors', 'inside', 'nearby', 'short', 'slow', 'slowly',
  'quiet', 'quietly', 'gentle', 'gently', 'easy', 'fresh', 'cup', 'minute', 'minutes', 'hour',
  'hours', 'room', 'spot', 'table', 'window', 'corner', 'sunny',
]

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (terms: readonly string[]) =>
  new RegExp(`\\b(${terms.map(escapeRegExp).join('|')})\\b`, 'i')

const SIDE_RE: Readonly<Record<RdSide, RegExp>> = {
  morning: termPattern([...RD_ANY_SIDE_BANNED, ...RD_MORNING_BANNED]),
  afternoon: termPattern([...RD_ANY_SIDE_BANNED, ...RD_AFTERNOON_BANNED]),
}
const EXCLUSIVE_RE = termPattern(RD_EXCLUSIVE_TERMS)
/** Who and where, not what — folded the same way as an activity's own words. */
const SOFT_TOKENS = new Set(RD_SOFT_WORDS.flatMap((word) => [...contentTokens(word)]))

/**
 * One activity as printed — "Bake a small batch of scones" — or null.
 * Mirrors `normalize_activity`: the Bucket List's idea gates, then a tighter
 * length and this page's time-of-day and open-to-everyone rules.
 */
export function normalizeActivity(
  raw: unknown,
  side: RdSide,
  budget: number = MAX_ACTIVITY_CHARS,
): string | null {
  const text = normalizeIdea(raw, budget)
  if (!text) return null
  const words = text.split(' ').filter(Boolean).length
  if (words < RD_LIMITS.minActivityWords || words > RD_LIMITS.maxActivityWords) return null
  if (text.length < RD_LIMITS.minActivityChars) return null
  if (SIDE_RE[side].test(text) || EXCLUSIVE_RE.test(text)) return null
  return text
}

/** One validated activity: printed text, plus what it is (never printed). */
export interface RdActivity {
  activity: string
  concept: string
  kind: RdKind
}

export interface RdPools {
  morning: RdActivity[]
  afternoon: RdActivity[]
}

/** An activity tokenised once: its meaning key and its words of substance. */
export interface ActivityKey {
  idea: IdeaKey
  core: Set<string>
}

export function activityKey(text: string, concept = ''): ActivityKey {
  const idea = ideaKey(text, concept)
  return { idea, core: new Set([...idea.tokens].filter((token) => !SOFT_TOKENS.has(token))) }
}

const sharedCount = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  [...a].filter((token) => b.has(token)).length

/**
 * Too alike for one page: the same activity, or any shared word of substance.
 * Mirrors `activities_clash` — every morning meets every afternoon, so two
 * activities sharing "walk" would make a day of doing the same thing twice.
 */
export function activitiesClash(x: ActivityKey, y: ActivityKey): boolean {
  return keysRepeat(x.idea, y.idea) || sharedCount(x.core, y.core) > 0
}

/**
 * The same activity in other words — the test against other pages. Mirrors
 * `activities_repeat`: a book may walk on two pages, but "Bake a small tray of
 * scones" repeats "Bake a small batch of scones".
 */
export function activitiesRepeat(x: ActivityKey, y: ActivityKey): boolean {
  if (keysRepeat(x.idea, y.idea)) return true
  const shared = sharedCount(x.core, y.core)
  const union = x.core.size + y.core.size - shared
  const smallest = Math.min(x.core.size, y.core.size)
  return shared >= 2 || (shared > 0 && (smallest === 1 || shared / union >= 0.5))
}

/** One complete activity from raw service output — or null, never a repair. */
export function normalizeRdItem(raw: unknown, side: RdSide): RdActivity | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const activity = normalizeActivity(record.activity, side)
  const kind = String(record.kind ?? '')
  if (!activity || !KIND_SET.has(kind)) return null
  return { activity, concept: normalizeConcept(record.concept), kind: kind as RdKind }
}

export interface RdPayload {
  morning: readonly unknown[]
  afternoon: readonly unknown[]
}

/** Read `ctx.remoteData` defensively — it is whatever the prefetch returned. */
export function parseRdPayload(remote: unknown): RdPayload {
  if (!remote || typeof remote !== 'object') return { morning: [], afternoon: [] }
  const record = remote as Record<string, unknown>
  return {
    morning: Array.isArray(record.morning) ? record.morning : [],
    afternoon: Array.isArray(record.afternoon) ? record.afternoon : [],
  }
}

/**
 * Normalize → gate → drop clashes and repeats, keeping each side's spares.
 *
 * Checked as one set, the way the page will print it: sides alternate (first
 * morning, first afternoon, second morning…) so each side's first briefs win
 * a clash over spares, and nothing kept on either side shares a word of
 * substance with anything else kept. `avoid` is what this seller's book and
 * browser already print: an activity that repeats one is dropped, not just
 * discouraged. `keep` carries an earlier reply through a top-up.
 */
export function cleanRdPools(
  payload: RdPayload,
  options: { avoid?: readonly string[]; keep?: RdPools } = {},
): RdPools {
  const { avoid = [], keep = { morning: [], afternoon: [] } } = options
  const avoided = avoid
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => activityKey(label))
  const out: RdPools = { morning: [...keep.morning], afternoon: [...keep.afternoon] }
  const kept = [...out.morning, ...out.afternoon].map((item) => activityKey(item.activity, item.concept))

  const longest = Math.max(payload.morning.length, payload.afternoon.length)
  for (let index = 0; index < longest; index++) {
    for (const side of RD_SIDES) {
      const item = normalizeRdItem(payload[side][index], side)
      if (!item) continue
      const key = activityKey(item.activity, item.concept)
      if (kept.some((other) => activitiesClash(key, other))) continue
      if (avoided.some((other) => activitiesRepeat(key, other))) continue
      out[side].push(item)
      kept.push(key)
    }
  }
  return out
}

const kindCount = (items: readonly RdActivity[]) => new Set(items.map((item) => item.kind)).size

/** Enough activities, of enough different kinds, to fill one side's six faces. */
export function sideCanFill(items: readonly RdActivity[]): boolean {
  return items.length >= RD_LIMITS.slots && kindCount(items) >= RD_LIMITS.minKindsPerSide
}

/**
 * Six activities for one side, or null: one of each kind first, in pool order,
 * then any spare whose kind is not already doubled — each fitting its row and
 * clashing with nothing chosen on either side. Returned in pool order, which
 * is the order the die faces take.
 */
export function pickRdSide(
  pool: readonly RdActivity[],
  fits: (activity: string) => boolean,
  taken: readonly ActivityKey[],
): RdActivity[] | null {
  const chosen = new Set<RdActivity>()
  const keys = [...taken]
  const counts = new Map<string, number>()
  const tryAdd = (item: RdActivity) => {
    if (!fits(item.activity)) return
    const key = activityKey(item.activity, item.concept)
    if (keys.some((other) => activitiesClash(key, other))) return
    chosen.add(item)
    keys.push(key)
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  }
  for (const item of pool) {
    if (chosen.size >= RD_LIMITS.slots) break
    if (!counts.has(item.kind)) tryAdd(item)
  }
  for (const item of pool) {
    if (chosen.size >= RD_LIMITS.slots) break
    if (!chosen.has(item) && (counts.get(item.kind) ?? 0) < 2) tryAdd(item)
  }
  const picked = pool.filter((item) => chosen.has(item))
  if (picked.length < RD_LIMITS.slots || kindCount(picked) < RD_LIMITS.minKindsPerSide) return null
  return picked
}

/** One printed row: a die face and its activity. */
export interface RdEntry extends RdActivity {
  face: number
}

export interface RdTable {
  morning: RdEntry[]
  afternoon: RdEntry[]
}

/**
 * The table this page prints, or null when the pools cannot fill it whole.
 * Mornings are chosen first, then afternoons that clash with none of them. A
 * table is never printed with a blank face: six and six, or nothing.
 */
export function buildRdTable(pools: RdPools, fits: (activity: string) => boolean): RdTable | null {
  const morning = pickRdSide(pools.morning, fits, [])
  if (!morning) return null
  const taken = morning.map((item) => activityKey(item.activity, item.concept))
  const afternoon = pickRdSide(pools.afternoon, fits, taken)
  if (!afternoon) return null
  const faced = (items: RdActivity[]) => items.map((item, i) => ({ ...item, face: RD_FACES[i]! }))
  return { morning: faced(morning), afternoon: faced(afternoon) }
}

/** Every activity a table prints, mornings first. */
export const rdTableActivities = (table: RdTable): string[] =>
  [...table.morning, ...table.afternoon].map((entry) => entry.activity)

/** Every activity in a pair of pools, mornings first. */
export const rdPoolActivities = (pools: RdPools): string[] =>
  [...pools.morning, ...pools.afternoon].map((item) => item.activity)

/**
 * Why a table may not print, or null when it may — the preflight's last word
 * on content that has already been through `buildRdTable`.
 */
export function rdTableProblem(table: RdTable): string | null {
  for (const side of RD_SIDES) {
    const entries = table[side]
    if (entries.length !== RD_FACES.length || entries.some((entry, i) => entry.face !== RD_FACES[i])) {
      return `Every die face from 1 to 6 needs exactly one ${side} idea.`
    }
    if (entries.some((entry) => normalizeActivity(entry.activity, side) !== entry.activity)) {
      return `A ${side} idea is not suitable for this page.`
    }
    if (entries.some((entry) => !KIND_SET.has(entry.kind)) || kindCount(entries) < RD_LIMITS.minKindsPerSide) {
      return `The ${side} ideas need more variety.`
    }
  }
  const keys = [...table.morning, ...table.afternoon].map((entry) => activityKey(entry.activity, entry.concept))
  if (keys.some((key, i) => keys.slice(0, i).some((other) => activitiesClash(key, other)))) {
    return 'Two ideas on this page are too alike — some days would do the same thing twice.'
  }
  return null
}
