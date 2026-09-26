import { generateOfficeAwards } from '@/api/studio-office-awards.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { OfficeAwardsResponse } from '@/types/studio-office-awards.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  MAX_AWARD_CHARS,
  OA_AI_EMPTY_MESSAGE,
  OA_SHORT_MESSAGE,
  OA_TEMPLATE_KEY,
  cleanOaPool,
  oaAwards,
  oaShortfall,
  parseOaCount,
  parseOaWorkplace,
  pickOaSet,
  type OaAward,
} from './content'

/**
 * Round trips before the form shows an error: the full set, then up to two
 * top-ups naming only themes the set does not use yet (and the tone it is
 * short of). The service already retries its own bad briefs, so a top-up
 * only happens when the checks here spent the spares — and never after a
 * rate limit, which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 3

/** Book awards sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

function dedupe(labels: readonly string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    const folded = label.trim().toLowerCase()
    if (!folded || seen.has(folded)) continue
    seen.add(folded)
    out.push(label.trim())
    if (out.length >= limit) break
  }
  return out
}

/**
 * AI-only — there is no bundled award list behind this.
 *
 * A packaged list of awards would hand every seller's book the same page,
 * which is the fastest way to two KDP titles that look copied from each
 * other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every award its own theme, detail, tone and title
 *    shape, by seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the same workplace;
 * 3. the book itself — every award already on its pages, say a second
 *    Office Awards page — is read back through the prefetch context, sent as
 *    hints, and enforced here: an award that repeats one is dropped, not just
 *    discouraged.
 *
 * Every comparison is against a bounded list, never every set ever made.
 * Nothing about the retiree or the team leaves the browser: the name the
 * seller typed is never part of the request. Every award is validated here,
 * before it can reach the editor, and the set must pick whole — balanced in
 * themes and tone — from what came back; generate validates again against
 * the page it lands on. Spares are returned with the set so the page can
 * pass over a title that wraps too far.
 */
export async function officeAwardsPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<OfficeAwardsResponse> {
  const seed = Number(config.seed ?? 1)
  const workplace = parseOaWorkplace(config.workplace)
  const size = parseOaCount(config.awards)
  const varietyKey = studioVarietyKey(OA_TEMPLATE_KEY, workplace)
  const book = context?.bookContentLabels(OA_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const printed = [...book, ...recent]
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let pool: OaAward[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    // A failed first call has nothing to top up: ask for the whole set again.
    const topUp = pool.length > 0
    let ask: ReturnType<typeof oaShortfall> | undefined
    if (topUp) {
      const pick = pickOaSet(pool, size)
      // A whole set is in hand: another call would only spend quota.
      if (pick.picks) break
      ask = oaShortfall(pick.taken, size)
    }
    try {
      const remote = await generateOfficeAwards(
        {
          workplace,
          awards: size,
          themes: ask?.themes,
          count: ask?.count,
          tone: ask?.tone,
          maxAwardChars: MAX_AWARD_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(topUp ? [...oaAwards(pool), ...hints] : hints, STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      pool = cleanOaPool(remote?.awards, { avoid: printed, keep: pool })
      if (pool.length === 0) lastError = new Error(OA_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${OA_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  const { picks } = pickOaSet(pool, size)
  if (picks) {
    rememberStudioContent(varietyKey, oaAwards(picks))
    return {
      awards: pool.map(({ award, theme, tone, shape, concept }) => ({ award, theme, tone, shape, concept })),
    }
  }
  if (pool.length > 0) throw new Error(OA_SHORT_MESSAGE)
  if (lastError instanceof Error && lastError.message.trim()) throw new Error(lastError.message.trim())
  throw new Error(OA_AI_EMPTY_MESSAGE)
}
