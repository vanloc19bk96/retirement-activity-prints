import { generateWeeksOfFirsts } from '@/api/studio-weeks-of-firsts.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { WeeksOfFirstsResponse } from '@/types/studio-weeks-of-firsts.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  MAX_IDEA_CHARS,
  WF_AI_EMPTY_MESSAGE,
  WF_SHORT_MESSAGE,
  WF_TEMPLATE_KEY,
  cleanWfAreas,
  parseWfFocus,
  pickWfYear,
  wfAreaIdeas,
  wfShortfall,
  type WfArea,
} from './content'

/**
 * Round trips before the form shows an error: the full year, then up to two
 * top-ups naming only the areas this side's checks left short. The service
 * already retries its own bad batches, so a top-up only happens when the book
 * check here spent an area's spares — and never after a rate limit, which a
 * retry only deepens.
 */
const MAX_AI_ATTEMPTS = 3

/** Book ideas sent to the server as avoid hints, newest first. */
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

/**
 * AI-only — there is no bundled year of ideas behind this.
 *
 * A packaged list of fifty-two firsts would hand every seller's book the same
 * year, which is the fastest way to two KDP titles that look copied from each
 * other. Freshness comes from three places, strongest last:
 *
 * 1. the service spreads the year over eighteen areas and gives every idea
 *    its own facet-and-flavour brief, by seed, and drops anything it wrote for
 *    this seller recently;
 * 2. the browser remembers what this seller printed for the same mix;
 * 3. the book itself — every idea already on its pages, say a second year of
 *    firsts — is read back through the prefetch context, sent as hints, and
 *    enforced here: an idea that repeats one is dropped, not just
 *    discouraged.
 *
 * Every comparison is against a bounded list, never every year ever made.
 * Every idea is validated here, before it can reach the editor, and the year
 * must pick whole — fifty-two weeks, balanced, few bigger outings — from what
 * came back; generate validates again against the page it lands on. Spares
 * are returned with the year so the page can pass over an idea that wraps too
 * far.
 */
export async function weeksOfFirstsPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<WeeksOfFirstsResponse> {
  const seed = Number(config.seed ?? 1)
  const focus = parseWfFocus(config.focus)
  const varietyKey = studioVarietyKey(WF_TEMPLATE_KEY, focus)
  const book = context?.bookContentLabels(WF_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const printed = [...book, ...recent]
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let areas: WfArea[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    // A failed first call has nothing to top up: ask for the whole year again.
    const topUp = areas.length > 0
    let short: ReturnType<typeof wfShortfall> = []
    if (topUp) {
      // A whole year is in hand (spares may cover a short area): another call
      // would only spend quota.
      const pick = pickWfYear(areas)
      if (pick.picks) break
      short = wfShortfall(areas, pick.taken)
      if (short.length === 0) break
    }
    try {
      const remote = await generateWeeksOfFirsts(
        {
          focus,
          areas: topUp ? short : undefined,
          maxIdeaChars: MAX_IDEA_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(topUp ? [...wfAreaIdeas(areas), ...hints] : hints, STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      areas = cleanWfAreas(remote?.areas, { avoid: printed, keep: areas })
      if (wfAreaIdeas(areas).length === 0) lastError = new Error(WF_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${WF_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  const { picks } = pickWfYear(areas)
  if (picks) {
    rememberStudioContent(
      varietyKey,
      picks.map((pick) => pick.idea),
    )
    return {
      areas: areas.map(({ key, target, items }) => ({
        key,
        target,
        items: items.map(({ idea, concept }) => ({ idea, concept })),
      })),
    }
  }
  if (wfAreaIdeas(areas).length > 0) throw new Error(WF_SHORT_MESSAGE)
  if (lastError instanceof Error && lastError.message.trim()) throw new Error(lastError.message.trim())
  throw new Error(WF_AI_EMPTY_MESSAGE)
}
