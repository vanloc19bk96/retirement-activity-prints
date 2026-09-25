import { generateOccupationTrivia } from '@/api/studio-occupation-trivia.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { OccupationTriviaResponse } from '@/types/studio-occupation-trivia.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  MAX_CHOICE_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_QUESTION_CHARS,
  OT_AI_EMPTY_MESSAGE,
  OT_MIN_QUESTIONS,
  OT_TARGET_QUESTIONS,
  OT_TEMPLATE_KEY,
  otLabel,
  otServiceQuestion,
  parseOtLevel,
  parseOtOccupation,
  selectOtQuestions,
  type OtQuestion,
} from './content'

/**
 * Spares asked for on top of a full pack: for the page's own gates (a
 * question one line too long for a small trim) and for facts this book
 * already prints. The service caps what it returns to what survived its
 * check, so spares cost only a few hundred tokens.
 */
const SPARE_QUESTIONS = 4
/** The service's own ceiling on one request. */
const MAX_REQUEST = 16

export const OT_REQUEST_COUNT = Math.min(MAX_REQUEST, OT_TARGET_QUESTIONS + SPARE_QUESTIONS)

/**
 * Round trips before the form shows an error. The service already retries its
 * own bad replies, so a second call here only happens when this side's book
 * check left the pack short — never on a rate limit, which a retry only
 * deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book labels sent to the server as avoid hints, newest first. */
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
 * AI-only — there is no bundled question bank behind this.
 *
 * A packaged bank would hand every seller's Teacher pack the same few dozen
 * questions in the same words, which is the fastest way to two KDP titles that
 * look copied from each other. Freshness comes from three places, strongest
 * last:
 *
 * 1. the service gives every question its own topic area of the job and
 *    question shape, sampled by the seed, and drops anything it wrote for this
 *    seller and occupation recently;
 * 2. the browser remembers the facts this seller printed for the occupation;
 * 3. the book itself — every question already on its pages — is read back
 *    through the prefetch context, sent as hints, and enforced here: a question
 *    on a fact the book already asks is dropped, not just discouraged.
 *
 * Each question was checked on its own, so two responses may share a pack;
 * a fact that turns up in both is kept once.
 */
export async function occupationTriviaPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<OccupationTriviaResponse> {
  const seed = Number(config.seed ?? 1)
  const occupation = parseOtOccupation(config.occupation)
  const level = parseOtLevel(config.level)
  const varietyKey = studioVarietyKey(OT_TEMPLATE_KEY, occupation)
  // Every label carries its occupation, so another pack's questions never rule one out.
  const book = (context?.bookContentLabels(OT_TEMPLATE_KEY) ?? []).filter((label) =>
    label.startsWith(`${occupation}: `),
  )
  const recent = studioAvoidList(varietyKey)
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]
  const avoid = [...book, ...recent]

  let pool: OtQuestion[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateOccupationTrivia(
        {
          occupation,
          level,
          count: OT_REQUEST_COUNT,
          maxQuestionChars: MAX_QUESTION_CHARS,
          maxChoiceChars: MAX_CHOICE_CHARS,
          maxExplanationChars: MAX_EXPLANATION_CHARS,
          seed: seed + attempt * 97,
          // A second call is told what the first offered, so it reaches for new facts.
          avoid: dedupe([...pool.map((item) => otLabel(occupation, item)), ...hints], STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      // A reply for another occupation (an older deploy, a mock) never fills this pack.
      const questions = remote?.occupation === occupation ? remote.questions : []
      pool = selectOtQuestions([...pool.map(otServiceQuestion), ...(questions ?? [])], {
        occupation,
        cap: OT_REQUEST_COUNT,
        avoid,
      })
      if (pool.length < OT_MIN_QUESTIONS) lastError = new Error(OT_AI_EMPTY_MESSAGE)
      // A full pack is in hand; a second call would only spend quota.
      if (pool.length >= OT_TARGET_QUESTIONS) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${OT_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (pool.length >= OT_MIN_QUESTIONS) {
    rememberStudioContent(varietyKey, pool.map((item) => otLabel(occupation, item)))
    return { occupation, questions: pool.map(otServiceQuestion) }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(OT_AI_EMPTY_MESSAGE)
}
