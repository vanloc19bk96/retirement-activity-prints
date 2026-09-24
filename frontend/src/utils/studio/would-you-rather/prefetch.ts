import { generateWouldYouRather } from '@/api/studio-would-you-rather.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { WouldYouRatherResponse } from '@/types/studio-would-you-rather.types'
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
  MAX_OPTION_CHARS,
  WYR_AI_EMPTY_MESSAGE,
  WYR_TEMPLATE_KEY,
  WYR_THEME_SALT,
  compactPairLabel,
  pairKeyFromLabel,
  pairLabel,
  parseWyrStyle,
  selectWyrPairs,
  type WyrPair,
} from './content'
import { MAX_QUESTIONS_PER_PAGE } from './layout'

/**
 * Pairs asked for per call: the fullest page any trim holds, plus spares for
 * the page's own gates (a choice that breaks onto one line too many) and for
 * pairs this book already asks. Three more cost a few hundred tokens in the
 * same call.
 */
export const WYR_REQUEST_COUNT = MAX_QUESTIONS_PER_PAGE + 3

/**
 * Round trips before the form shows an error. The service already retries its
 * own bad replies, so a second call here only happens when this side's book
 * check left the pool short of a page — never on a rate limit, which a retry
 * only deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book labels sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) =>
  error instanceof Error && /too many/i.test(error.message)

/** Full book labels, newest first, folded to the compact form the server compares. */
function compactBookLabels(labels: readonly string[]): string[] {
  const out: string[] = []
  for (let i = labels.length - 1; i >= 0 && out.length < BOOK_AVOID_HINTS; i--) {
    const key = pairKeyFromLabel(labels[i]!)
    if (key) out.push(compactPairLabel({ optionA: key.a, optionB: key.b }))
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
 * AI-only — there is no bundled bank of questions behind this.
 *
 * A packaged list would hand every seller's book the same few dozen
 * questions, which is the fastest way to two KDP titles that look copied from
 * each other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every question its own topic-and-shape brief, sampled
 *    by the seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the theme;
 * 3. the book itself — every question already on its pages, whatever its
 *    theme — is read back through the prefetch context, sent as hints, and
 *    enforced here: a pair that repeats one is dropped, not just discouraged.
 *
 * Every pair is validated here, before it can reach the editor; generate
 * validates again against the page it lands on.
 */
export async function wouldYouRatherPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<WouldYouRatherResponse> {
  const seed = Number(config.seed ?? 1)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, WYR_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    WYR_TEMPLATE_KEY,
    mixedTopics ? RETIREMENT_THEME_MIXED : theme.label || promptTheme,
  )
  const book = context?.bookContentLabels(WYR_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...compactBookLabels(book), ...recent]

  const collected: WyrPair[] = []
  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateWouldYouRather(
        {
          theme: promptTheme,
          mixedTopics,
          style: parseWyrStyle(config.tone),
          count: WYR_REQUEST_COUNT,
          maxOptionChars: MAX_OPTION_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(
            [...collected.map(compactPairLabel), ...rejected, ...hints],
            STUDIO_AVOID_LIMIT,
          ),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const fresh = selectWyrPairs(remote?.items, {
        cap: WYR_REQUEST_COUNT - collected.length,
        avoid: [...book, ...recent, ...collected.map(pairLabel)],
      })
      collected.push(...fresh)
      if (fresh.length === 0) {
        for (const item of remote?.items ?? []) {
          const optionA = String(item?.optionA ?? '').trim()
          const optionB = String(item?.optionB ?? '').trim()
          if (optionA && optionB) rejected.push(compactPairLabel({ optionA, optionB }))
        }
        lastError = new Error(WYR_AI_EMPTY_MESSAGE)
      }
      // A full page is in hand; a second call would only spend quota.
      if (collected.length >= MAX_QUESTIONS_PER_PAGE) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${WYR_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length > 0) {
    rememberStudioContent(varietyKey, collected.map(compactPairLabel))
    return {
      items: collected.map(({ optionA, optionB, topic }) => ({ optionA, optionB, topic })),
    }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(WYR_AI_EMPTY_MESSAGE)
}
