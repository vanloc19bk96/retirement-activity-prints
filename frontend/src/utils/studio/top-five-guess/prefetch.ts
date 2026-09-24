import { generateTopFiveGuess } from '@/api/studio-top-five-guess.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { TopFiveGuessResponse } from '@/types/studio-top-five-guess.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { filterUnsafeThemeCopy } from '../retirement-word-search/content-quality'
import {
  MAX_ANSWER_CHARS,
  MAX_QUESTION_CHARS,
  TOP_FIVE_AI_EMPTY_MESSAGE,
  TOP_FIVE_TEMPLATE_KEY,
  TOP_FIVE_THEME_SALT,
  selectTopFiveSets,
  type TopFiveSet,
} from './content'
import { MAX_QUESTIONS_PER_PAGE } from './layout'

/**
 * Sets asked for per call: the fullest page any trim holds, plus spares for
 * the page's own gates (a question that breaks onto a fourth line, an answer
 * too wide for a narrow trim). The page size is not known here, and asking for
 * two more sets costs a few hundred tokens in the same call.
 */
export const TOP_FIVE_REQUEST_COUNT = MAX_QUESTIONS_PER_PAGE + 2

/**
 * Round trips before the form shows an error. The service already retries its
 * own bad replies, so a second call here only happens when a whole reply was
 * unusable on this side — never on a rate limit, which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 2

const isRateLimit = (error: unknown) =>
  error instanceof Error && /too many/i.test(error.message)

/**
 * AI-only — there is no bundled bank of questions behind this.
 *
 * A packaged list would make every seller's book ask the same few dozen
 * questions, which is the fastest way to two KDP titles that look copied from
 * each other. The browser remembers what this seller printed for the theme and
 * sends it as `avoid`, then drops any set that still repeats one, so a long
 * book does not ask the same question twice.
 *
 * Every set is validated here, before it can reach the editor; generate
 * validates again against the page it lands on.
 */
export async function topFiveGuessPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<TopFiveGuessResponse> {
  const seed = Number(config.seed ?? 1)
  const theme = resolveRetirementTheme(config, seed, TOP_FIVE_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(TOP_FIVE_TEMPLATE_KEY, theme.label || promptTheme)
  const printed = studioAvoidList(varietyKey)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    let sets: TopFiveSet[]
    try {
      const remote = await generateTopFiveGuess(
        {
          theme: promptTheme,
          count: TOP_FIVE_REQUEST_COUNT,
          maxQuestionChars: MAX_QUESTION_CHARS,
          maxAnswerChars: MAX_ANSWER_CHARS,
          seed: seed + attempt * 97,
          avoid: [...printed, ...rejected],
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      sets = selectTopFiveSets(remote?.items, { cap: TOP_FIVE_REQUEST_COUNT, avoid: printed })
      if (sets.length === 0) {
        rejected.push(
          ...(remote?.items ?? []).map((item) => String(item?.question ?? '')).filter(Boolean),
        )
        lastError = new Error(TOP_FIVE_AI_EMPTY_MESSAGE)
        continue
      }
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${TOP_FIVE_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
      continue
    }

    rememberStudioContent(
      varietyKey,
      sets.map((set) => set.question),
    )
    return { items: sets.map((set) => ({ question: set.question, answers: [...set.answers] })) }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(TOP_FIVE_AI_EMPTY_MESSAGE)
}
