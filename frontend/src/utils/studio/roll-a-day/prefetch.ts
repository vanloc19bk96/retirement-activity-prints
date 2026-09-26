import { generateRollADay } from '@/api/studio-roll-a-day.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { RollADayResponse } from '@/types/studio-roll-a-day.types'
import { createRng } from '../studio-rng'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  MAX_ACTIVITY_CHARS,
  RD_AI_EMPTY_MESSAGE,
  RD_SALT,
  RD_SHORT_MESSAGE,
  RD_TEMPLATE_KEY,
  buildRdTable,
  cleanRdPools,
  parseRdFocus,
  parseRdPayload,
  rdPoolActivities,
  rdTableActivities,
  sideCanFill,
  type RdActivity,
  type RdPools,
} from './content'

/**
 * Activities asked for per side on the first call: six faces plus spares for
 * the page's own gates (an activity that wraps past its row, one that clashes
 * with something the book already prints). A few more cost a few dozen tokens
 * in the same call.
 */
export const RD_REQUEST_PER_SIDE = 10
/** Asked for on a top-up, and only for a side still short. */
export const RD_TOPUP_PER_SIDE = 6

/**
 * Round trips before the form shows an error. The service already retries
 * its own short replies, so a second call here only happens when this side's
 * gates left a side short — never on a rate limit, which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book activities sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

function dedupe(labels: readonly string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    const folded = label.trim().toLowerCase()
    if (!folded || seen.has(folded)) continue
    seen.add(folded)
    out.push(label)
    if (out.length >= limit) break
  }
  return out
}

const plain = (items: readonly RdActivity[]) =>
  items.map(({ activity, concept, kind }) => ({ activity, concept, kind }))

/**
 * AI-only — there is no bundled table of activities behind this.
 *
 * A packaged table would hand every seller's book the same twelve activities,
 * which is the fastest way to two KDP titles that look copied from each other.
 * Freshness comes from three places, strongest last:
 *
 * 1. the service gives each side six different kinds of activity and every
 *    activity its own facet and flavour, sampled by the seed, and drops
 *    activities it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the same mix;
 * 3. the book itself — every activity already on its pages — is read back
 *    through the prefetch context, sent as hints, and enforced here: an
 *    activity that repeats one is dropped, not just discouraged.
 *
 * So two tables in one book never share an activity, which is what makes them
 * different tables — not the same twelve ideas reordered. Every comparison is
 * against a bounded list, never every table ever made.
 *
 * Every activity is validated here, as one set with the rest, before it can
 * reach the editor; generate validates again against the page it lands on.
 * Each side is shuffled by seed, so which activity meets which die face
 * differs page to page.
 */
export async function rollADayPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<RollADayResponse> {
  const seed = Number(config.seed ?? 1)
  const focus = parseRdFocus(config.focus)
  const varietyKey = studioVarietyKey(RD_TEMPLATE_KEY, focus)
  const book = context?.bookContentLabels(RD_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const printed = [...book, ...recent]
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let pools: RdPools = { morning: [], afternoon: [] }
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    const shortMorning = !sideCanFill(pools.morning)
    const shortAfternoon = !sideCanFill(pools.afternoon)
    // A full table is in hand; another call would only spend quota.
    if (!shortMorning && !shortAfternoon) break
    const ask = attempt === 0 ? RD_REQUEST_PER_SIDE : RD_TOPUP_PER_SIDE
    try {
      const remote = await generateRollADay(
        {
          focus,
          morningCount: shortMorning ? ask : 0,
          afternoonCount: shortAfternoon ? ask : 0,
          maxActivityChars: MAX_ACTIVITY_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe([...rdPoolActivities(pools), ...hints], STUDIO_AVOID_LIMIT),
        },
        signal,
      )
      pools = cleanRdPools(parseRdPayload(remote), { avoid: printed, keep: pools })
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${RD_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (!sideCanFill(pools.morning) || !sideCanFill(pools.afternoon)) {
    // Some ideas came back but not a table's worth: say so. Nothing came back:
    // pass on the service's own reason (a rate limit, an outage) if it gave one.
    if (pools.morning.length + pools.afternoon.length > 0) throw new Error(RD_SHORT_MESSAGE)
    const message = lastError instanceof Error ? lastError.message.trim() : ''
    throw new Error(message || RD_AI_EMPTY_MESSAGE)
  }

  const rng = createRng((seed ^ RD_SALT) >>> 0)
  const shuffled: RdPools = { morning: rng.shuffle(pools.morning), afternoon: rng.shuffle(pools.afternoon) }
  const table = buildRdTable(shuffled, () => true)
  if (table) rememberStudioContent(varietyKey, rdTableActivities(table))
  return { morning: plain(shuffled.morning), afternoon: plain(shuffled.afternoon) }
}
