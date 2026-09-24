import { generateRetireeQuiz } from '@/api/studio-retiree-quiz.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type {
  RetireeQuizResponse,
  RetireeQuizResultsItem,
  RetireeStyle,
} from '@/types/studio-retiree-quiz.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  RETIREMENT_THEME_MIXED,
  parseRetirementThemeChoice,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { filterUnsafeThemeCopy } from '../retirement-word-search/content-quality'
import {
  MAX_ANSWER_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_QUESTIONS,
  MAX_QUESTION_CHARS,
  MIN_QUESTIONS,
  RQ_AI_EMPTY_MESSAGE,
  RQ_STYLES,
  RQ_TEMPLATE_KEY,
  compactRqLabel,
  normalizeDescription,
  rqItemFromQuestion,
  selectRqQuestions,
  type RqQuestion,
} from './content'

/**
 * Questions asked for per call: the longest quiz, plus spares for the page's
 * own gates (a question that needs one line too many) and for ones this book
 * already prints. The service returns only what survived its style check.
 */
export const RQ_REQUEST_COUNT = MAX_QUESTIONS + 4

/** Keeps the mixed-theme draw independent of other games on the same seed. */
export const RQ_THEME_SALT = 0x72717468

/**
 * Round trips before the form shows an error. The service already retries
 * its own bad replies, and each of its rounds is a write plus a check, so a
 * second call here only happens when this side's gates left the quiz short —
 * never on a rate limit, which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book labels sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

function compactBookLabels(labels: readonly string[]): string[] {
  const out: string[] = []
  for (let i = labels.length - 1; i >= 0 && out.length < BOOK_AVOID_HINTS; i--) {
    out.push(compactRqLabel(labels[i]!))
  }
  return out
}

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
 * AI-only for the questions — there is no bundled bank behind them.
 *
 * A packaged quiz would hand every seller's book the same ten questions,
 * which is the fastest way to two KDP titles that look copied from each
 * other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every question its own topic-and-shape brief, sampled
 *    by the seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the theme;
 * 3. the book itself — every question already on its pages, whatever the
 *    theme — is read back through the prefetch context, sent as hints, and
 *    enforced here: a question that repeats one is dropped, not just
 *    discouraged.
 *
 * The result write-ups do have vetted fallbacks, because a quiz must never
 * print a style without one; a fresh write-up is used whenever it passes.
 *
 * Every question is validated here before it can reach the editor, and
 * generate validates once more against the page it lands on. The quiz only
 * prints whole: fewer than the minimum is an error, not a short quiz.
 */
export async function retireeQuizPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<RetireeQuizResponse> {
  const seed = Number(config.seed ?? 1)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, RQ_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(0, AI_THEME_MAX_LENGTH)
  const varietyKey = studioVarietyKey(
    RQ_TEMPLATE_KEY,
    mixedTopics ? RETIREMENT_THEME_MIXED : theme.label || promptTheme,
  )
  const book = context?.bookContentLabels(RQ_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...compactBookLabels(book), ...recent]

  let collected: RqQuestion[] = []
  const results: Partial<RetireeQuizResultsItem> = {}
  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateRetireeQuiz(
        {
          theme: promptTheme,
          mixedTopics,
          count: RQ_REQUEST_COUNT,
          maxQuestionChars: MAX_QUESTION_CHARS,
          maxAnswerChars: MAX_ANSWER_CHARS,
          maxDescriptionChars: MAX_DESCRIPTION_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(
            [...collected.map((q) => compactRqLabel(q.question)), ...rejected, ...hints],
            STUDIO_AVOID_LIMIT,
          ),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      // Re-selected as one pool so the quiz-wide variety rules span both calls.
      const before = collected.length
      collected = selectRqQuestions(
        [...collected.map(rqItemFromQuestion), ...(remote?.questions ?? [])],
        { cap: RQ_REQUEST_COUNT, avoid: [...book, ...recent] },
      )
      for (const style of RQ_STYLES) {
        results[style] ??= normalizeDescription(remote?.results?.[style]) ?? undefined
      }
      if (collected.length === before) {
        for (const item of remote?.questions ?? []) {
          const question = String(item?.question ?? '').trim()
          if (question) rejected.push(compactRqLabel(question))
        }
        lastError = new Error(RQ_AI_EMPTY_MESSAGE)
      }
      // A full quiz with spares is in hand; a second call would only spend quota.
      if (collected.length >= MAX_QUESTIONS) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${RQ_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length >= MIN_QUESTIONS) {
    rememberStudioContent(varietyKey, collected.map((q) => compactRqLabel(q.question)))
    const written = {} as Record<RetireeStyle, string>
    for (const style of RQ_STYLES) written[style] = results[style] ?? ''
    return { questions: collected.map(rqItemFromQuestion), results: written }
  }
  if (collected.length === 0 && lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(RQ_AI_EMPTY_MESSAGE)
}
