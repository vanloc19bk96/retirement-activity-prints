import { generateFillInFunnies } from '@/api/studio-fill-in-funnies.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { FillInFunniesResponse } from '@/types/studio-fill-in-funnies.types'
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
  FIF_AI_EMPTY_MESSAGE,
  FIF_MAX_BLANKS,
  FIF_MAX_WORDS,
  FIF_MIN_BLANKS,
  FIF_TEMPLATE_KEY,
  FIF_THEME_SALT,
  compactStoryLabel,
  selectFifStories,
  type FifStory,
} from './content'

/**
 * Stories asked for per call. One prints; the rest are spares for the page's
 * own gates (a story that runs past the pages the trim allows) and for ones
 * this book already prints. The service checks all of them in one pass.
 */
export const FIF_REQUEST_COUNT = 3

/**
 * Round trips before the form shows an error. The service already retries its
 * own bad replies, so a second call here only happens when this side's book
 * check left nothing to print — never on a rate limit, which a retry only
 * deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book labels sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

/** Book labels start with their compact label; that is what the server compares. */
function compactBookLabels(labels: readonly string[]): string[] {
  const out: string[] = []
  for (let i = labels.length - 1; i >= 0 && out.length < BOOK_AVOID_HINTS; i--) {
    const compact = labels[i]!.split(' | ')[0]?.trim()
    if (compact) out.push(compact)
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

const toPayload = (story: FifStory) => ({ ...story, blanks: [...story.blanks], verified: true })

/**
 * AI-only — there is no bundled bank of stories behind this.
 *
 * A packaged set would hand every seller's book the same dozen stories, which
 * is the fastest way to two KDP titles that look copied from each other.
 * Freshness comes from three places, strongest last:
 *
 * 1. the service gives every story its own brief — a situation, a format, a
 *    humour pattern and a mix of blank kinds, sampled by the seed — and drops
 *    anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the theme;
 * 3. the book itself — every story already on its pages — is read back
 *    through the prefetch context, sent as hints, and enforced here: a story
 *    that repeats one is dropped, not just discouraged.
 *
 * Every story is validated here, before it can reach the editor; generate
 * validates again against the page it lands on.
 */
export async function fillInFunniesPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<FillInFunniesResponse> {
  const seed = Number(config.seed ?? 1)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, FIF_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    FIF_TEMPLATE_KEY,
    mixedTopics ? RETIREMENT_THEME_MIXED : theme.label || promptTheme,
  )
  const book = context?.bookContentLabels(FIF_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...compactBookLabels(book), ...recent]

  const collected: FifStory[] = []
  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateFillInFunnies(
        {
          theme: promptTheme,
          mixedTopics,
          count: FIF_REQUEST_COUNT,
          minBlanks: FIF_MIN_BLANKS,
          maxBlanks: FIF_MAX_BLANKS,
          maxWords: FIF_MAX_WORDS,
          seed: seed + attempt * 97,
          avoid: dedupe(
            [...collected.map(compactStoryLabel), ...rejected, ...hints],
            STUDIO_AVOID_LIMIT,
          ),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const fresh = selectFifStories(remote?.stories, {
        cap: FIF_REQUEST_COUNT - collected.length,
        avoid: [...book, ...recent, ...collected.map(compactStoryLabel)],
      })
      collected.push(...fresh)
      if (fresh.length === 0) {
        for (const story of remote?.stories ?? []) {
          const title = String(story?.title ?? '').trim()
          if (title) {
            rejected.push(compactStoryLabel({ title, premise: String(story?.premise ?? '') }))
          }
        }
        lastError = new Error(FIF_AI_EMPTY_MESSAGE)
      }
      // A story is in hand; a second call would only spend quota.
      if (collected.length > 0) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${FIF_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length > 0) {
    rememberStudioContent(varietyKey, collected.map(compactStoryLabel))
    return { stories: collected.map(toPayload) }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(FIF_AI_EMPTY_MESSAGE)
}
