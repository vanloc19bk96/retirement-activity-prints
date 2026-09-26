import { generateCareerNumbers } from '@/api/studio-career-numbers.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { CareerNumbersResponse } from '@/types/studio-career-numbers.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  CBN_AI_EMPTY_MESSAGE,
  CBN_SHORT_MESSAGE,
  CBN_TEMPLATE_KEY,
  MAX_QUESTION_CHARS,
  MAX_UNIT_CHARS,
  cbnMemoryLabel,
  cbnQuestions,
  cbnShortfall,
  cleanCbnPool,
  parseCbnCount,
  parseCbnDistance,
  parseCbnWorkplace,
  pickCbnSet,
  type CbnQuestion,
} from './content'

/**
 * Round trips before the form shows an error: the full set, then up to two
 * top-ups naming only themes the set does not use yet (and the tone it is
 * short of). The service already retries its own bad briefs, so a top-up
 * only happens when the checks here spent the spares — and never after a
 * rate limit, which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 3

/** Book questions sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

/** Avoid hints as the server keeps them: from "How many" on, cut on a word. */
function hintsFrom(labels: readonly string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of labels) {
    const hint = cbnMemoryLabel(label.trim())
    const folded = hint.toLowerCase()
    if (!hint || seen.has(folded)) continue
    seen.add(folded)
    out.push(hint)
    if (out.length >= limit) break
  }
  return out
}

/**
 * AI-only — there is no bundled question list behind this.
 *
 * A packaged list would hand every seller's book the same page, which is the
 * fastest way to two KDP titles that look copied from each other. Freshness
 * comes from three places, strongest last:
 *
 * 1. the service gives every question its own theme, detail, tone and shape,
 *    by seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the same kind of
 *    work;
 * 3. the book itself — every question already on its pages, say a second
 *    Career By the Numbers page — is read back through the prefetch context,
 *    sent as hints, and enforced here: a question that repeats one is
 *    dropped, not just discouraged.
 *
 * Every comparison is against a bounded list, never every set ever made.
 * Nothing about the retiree leaves the browser: the name the seller typed is
 * never part of the request. Every question is validated here, before it can
 * reach the editor, and the set must pick whole — balanced in themes and
 * tone — from what came back; generate validates again against the page it
 * lands on. Spares are returned with the set so the page can pass over a
 * question that wraps too far.
 */
export async function careerNumbersPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<CareerNumbersResponse> {
  const seed = Number(config.seed ?? 1)
  const workplace = parseCbnWorkplace(config.workplace)
  const distance = parseCbnDistance(config.distance)
  const size = parseCbnCount(config.questions)
  const varietyKey = studioVarietyKey(CBN_TEMPLATE_KEY, workplace)
  const book = context?.bookContentLabels(CBN_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const printed = [...book, ...recent]
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let pool: CbnQuestion[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    // A failed first call has nothing to top up: ask for the whole set again.
    const topUp = pool.length > 0
    let ask: ReturnType<typeof cbnShortfall> | undefined
    if (topUp) {
      const pick = pickCbnSet(pool, size)
      // A whole set is in hand: another call would only spend quota.
      if (pick.picks) break
      ask = cbnShortfall(pick.taken, size)
    }
    try {
      const remote = await generateCareerNumbers(
        {
          workplace,
          distance,
          questions: size,
          themes: ask?.themes,
          count: ask?.count,
          tone: ask?.tone,
          maxQuestionChars: MAX_QUESTION_CHARS,
          maxUnitChars: MAX_UNIT_CHARS,
          seed: seed + attempt * 97,
          avoid: hintsFrom(topUp ? [...cbnQuestions(pool), ...hints] : hints, STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      pool = cleanCbnPool(remote?.questions, { avoid: printed, keep: pool, distance })
      if (pool.length === 0) lastError = new Error(CBN_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${CBN_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  const { picks } = pickCbnSet(pool, size)
  if (picks) {
    // Remembered as the service keeps them, so a long question still matches itself.
    rememberStudioContent(varietyKey, cbnQuestions(picks).map(cbnMemoryLabel))
    return {
      questions: pool.map(({ question, unit, theme, tone, shape, concept }) => ({
        question,
        unit,
        theme,
        tone,
        shape,
        concept,
      })),
    }
  }
  if (pool.length > 0) throw new Error(CBN_SHORT_MESSAGE)
  if (lastError instanceof Error && lastError.message.trim()) throw new Error(lastError.message.trim())
  throw new Error(CBN_AI_EMPTY_MESSAGE)
}
