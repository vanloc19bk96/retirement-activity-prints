import { generateWhoKnowsBest } from '@/api/studio-who-knows-best.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { WhoKnowsBestResponse } from '@/types/studio-who-knows-best.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  MAX_QUESTION_CHARS,
  WKB_AI_EMPTY_MESSAGE,
  WKB_SHORT_MESSAGE,
  WKB_TEMPLATE_KEY,
  cleanWkbPool,
  parseWkbAudience,
  pickWkbSet,
  wkbQuestions,
  wkbShortfall,
  type WkbQuestion,
} from './content'

/**
 * Round trips before the form shows an error: the full set, then up to two
 * top-ups naming only topics the set does not use yet. The service already
 * retries its own bad briefs, so a top-up only happens when the checks here
 * spent the spares — and never after a rate limit, which a retry only
 * deepens.
 */
const MAX_AI_ATTEMPTS = 3

/** Book questions sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40
/** The server trims each avoid label to this; cut on a word instead. */
const AVOID_LABEL_CHARS = 60

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

function clip(label: string): string {
  if (label.length <= AVOID_LABEL_CHARS) return label
  const cut = label.slice(0, AVOID_LABEL_CHARS)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim()
}

function dedupe(labels: readonly string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    const folded = label.trim().toLowerCase()
    if (!folded || seen.has(folded)) continue
    seen.add(folded)
    out.push(clip(label.trim()))
    if (out.length >= limit) break
  }
  return out
}

/**
 * AI-only — there is no bundled question list behind this.
 *
 * A packaged list of twelve questions would hand every seller's book the
 * same game, which is the fastest way to two KDP titles that look copied from
 * each other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every question its own topic, facet and shape, by
 *    seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the same audience;
 * 3. the book itself — every question already on its pages, say a second
 *    round of the game — is read back through the prefetch context, sent as
 *    hints, and enforced here: a question that repeats one is dropped, not
 *    just discouraged.
 *
 * Every comparison is against a bounded list, never every set ever made.
 * Nothing about the retiree leaves the browser: the name the seller typed is
 * never part of the request. Every question is validated here, before it can
 * reach the editor, and the set must pick whole — twelve balanced questions —
 * from what came back; generate validates again against the page it lands
 * on. Spares are returned with the set so the page can pass over a question
 * that wraps too far.
 */
export async function whoKnowsBestPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<WhoKnowsBestResponse> {
  const seed = Number(config.seed ?? 1)
  const audience = parseWkbAudience(config.audience)
  const varietyKey = studioVarietyKey(WKB_TEMPLATE_KEY, audience)
  const book = context?.bookContentLabels(WKB_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const printed = [...book, ...recent]
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let pool: WkbQuestion[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    // A failed first call has nothing to top up: ask for the whole set again.
    const topUp = pool.length > 0
    let ask: ReturnType<typeof wkbShortfall> | undefined
    if (topUp) {
      const pick = pickWkbSet(pool)
      // A whole set is in hand: another call would only spend quota.
      if (pick.picks) break
      ask = wkbShortfall(pick.taken, audience)
    }
    try {
      const remote = await generateWhoKnowsBest(
        {
          audience,
          topics: ask?.topics,
          count: ask?.count,
          maxQuestionChars: MAX_QUESTION_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(topUp ? [...wkbQuestions(pool), ...hints] : hints, STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      pool = cleanWkbPool(remote?.questions, { avoid: printed, keep: pool })
      if (pool.length === 0) lastError = new Error(WKB_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${WKB_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  const { picks } = pickWkbSet(pool)
  if (picks) {
    rememberStudioContent(
      varietyKey,
      picks.map((pick) => pick.question),
    )
    return {
      questions: pool.map(({ question, topic, shape, answer, concept }) => ({
        question,
        topic,
        shape,
        answer,
        concept,
      })),
    }
  }
  if (pool.length > 0) throw new Error(WKB_SHORT_MESSAGE)
  if (lastError instanceof Error && lastError.message.trim()) throw new Error(lastError.message.trim())
  throw new Error(WKB_AI_EMPTY_MESSAGE)
}
