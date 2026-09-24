import { generateRiddlesJokes } from '@/api/studio-riddles-jokes.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { RiddlesJokesResponse } from '@/types/studio-riddles-jokes.types'
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
  MAX_SETUP_CHARS,
  RJ_AI_EMPTY_MESSAGE,
  RJ_TEMPLATE_KEY,
  RJ_THEME_SALT,
  compactRjLabel,
  parseRjMix,
  rjItemLabels,
  rjServiceItem,
  selectRjItems,
  type RjItem,
} from './content'
import { MAX_ITEMS_PER_PAGE } from './layout'

/**
 * Items asked for per call: the fullest page any trim holds, plus spares for
 * the page's own gates (a setup one line too long, a third "Why did the …")
 * and for ones this book already prints. The service caps what it returns to
 * what survived its check, so asking for spares costs only a few hundred
 * tokens.
 */
export const RJ_REQUEST_COUNT = MAX_ITEMS_PER_PAGE + 4

/**
 * Round trips before the form shows an error. The service already retries
 * its own bad replies, and each round there is a write plus a check, so a
 * second call here only happens when this side's book check left the pool
 * short of a page — never on a rate limit, which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book labels sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) =>
  error instanceof Error && /too many/i.test(error.message)

/** Book labels, newest first, folded to the compact form the server compares. */
function compactBookLabels(labels: readonly string[]): string[] {
  const out: string[] = []
  for (let i = labels.length - 1; i >= 0 && out.length < BOOK_AVOID_HINTS; i--) {
    out.push(compactRjLabel(labels[i]!))
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
 * AI-only — there is no bundled bank of jokes behind this.
 *
 * A packaged list would hand every seller's book the same few dozen jokes,
 * which is the fastest way to two KDP titles that look copied from each
 * other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every item its own kind, topic, format and humour
 *    brief, sampled by the seed, and drops anything it wrote for this seller
 *    recently;
 * 2. the browser remembers what this seller printed for the theme;
 * 3. the book itself — every setup and answer already on its pages, whatever
 *    the theme — is read back through the prefetch context, sent as hints,
 *    and enforced here: an item that repeats one is dropped, not just
 *    discouraged.
 *
 * Quality is the service's job: it checks every item blind before returning
 * it. Every item is validated again here, before it can reach the editor, and
 * generate validates once more against the page it lands on.
 */
export async function riddlesJokesPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<RiddlesJokesResponse> {
  const seed = Number(config.seed ?? 1)
  const mix = parseRjMix(config.mix)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, RJ_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  // One memory per theme, whatever the mix: a riddle printed on a mixed page
  // must not come back on a riddles-only page.
  const varietyKey = studioVarietyKey(
    RJ_TEMPLATE_KEY,
    mixedTopics ? RETIREMENT_THEME_MIXED : theme.label || promptTheme,
  )
  const book = context?.bookContentLabels(RJ_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...compactBookLabels(book), ...recent]

  const collected: RjItem[] = []
  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateRiddlesJokes(
        {
          theme: promptTheme,
          mixedTopics,
          mix,
          count: RJ_REQUEST_COUNT,
          maxSetupChars: MAX_SETUP_CHARS,
          maxAnswerChars: MAX_ANSWER_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(
            [...collected.flatMap(rjItemLabels), ...rejected, ...hints],
            STUDIO_AVOID_LIMIT,
          ),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const fresh = selectRjItems(remote?.items, {
        cap: RJ_REQUEST_COUNT - collected.length,
        mix,
        avoid: [...book, ...recent, ...collected.flatMap((item) => [item.setup, item.answer])],
      })
      collected.push(...fresh)
      if (fresh.length === 0) {
        for (const item of remote?.items ?? []) {
          const setup = String(item?.setup ?? '').trim()
          if (setup) rejected.push(compactRjLabel(setup))
        }
        lastError = new Error(RJ_AI_EMPTY_MESSAGE)
      }
      // A full page is in hand; a second call would only spend quota.
      if (collected.length >= MAX_ITEMS_PER_PAGE) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${RJ_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length > 0) {
    rememberStudioContent(varietyKey, collected.flatMap(rjItemLabels))
    return { items: collected.map(rjServiceItem) }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(RJ_AI_EMPTY_MESSAGE)
}
