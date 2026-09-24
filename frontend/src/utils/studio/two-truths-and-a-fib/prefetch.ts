import { generateTwoTruthsFib } from '@/api/studio-two-truths-fib.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { TwoTruthsFibResponse } from '@/types/studio-two-truths-fib.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import { filterUnsafeThemeCopy } from '../retirement-word-search/content-quality'
import { customTtfSubject } from './config'
import {
  MAX_FACT_CHARS,
  MAX_STATEMENT_CHARS,
  MAX_TITLE_CHARS,
  TTF_AI_EMPTY_MESSAGE,
  TTF_TEMPLATE_KEY,
  compactTtfLabel,
  parseTtfLevel,
  parseTtfSubject,
  selectTtfSets,
  ttfItemFromSet,
  ttfSetLabels,
  type TtfSet,
} from './content'
import { MAX_SETS_PER_PAGE } from './layout'

/**
 * Sets asked for per call: the fullest page any trim holds, plus spares for
 * the page's own gates (a set that needs one line too many) and for ones this
 * book already prints. The service caps what it returns to what survived its
 * fact check, so asking for spares costs only a few hundred tokens.
 */
export const TTF_REQUEST_COUNT = MAX_SETS_PER_PAGE + 3

/**
 * Round trips before the form shows an error. The service already retries
 * its own bad replies, and each round there is a write plus a fact check, so a
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
    out.push(compactTtfLabel(labels[i]!))
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
 * AI-only — there is no bundled bank of puzzles behind this.
 *
 * A packaged list would hand every seller's book the same few dozen facts,
 * which is the fastest way to two KDP titles that look copied from each
 * other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every set its own subject-and-angle brief, sampled by
 *    the seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the subject;
 * 3. the book itself — every title and statement already on its pages,
 *    whatever the subject — is read back through the prefetch context, sent
 *    as hints, and enforced here: a set that repeats one is dropped, not just
 *    discouraged.
 *
 * Truth is the service's job: it fact-checks every set blind before
 * returning it. Every set is validated again here, before it can reach the
 * editor, and generate validates once more against the page it lands on.
 */
export async function twoTruthsFibPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<TwoTruthsFibResponse> {
  const seed = Number(config.seed ?? 1)
  const subject = parseTtfSubject(config.subject)
  const typed = subject === 'custom' ? customTtfSubject(config) : ''
  const customSubject = typed ? (filterUnsafeThemeCopy(typed) ?? typed) : ''
  const varietyKey = studioVarietyKey(TTF_TEMPLATE_KEY, subject === 'custom' ? customSubject : subject)
  const book = context?.bookContentLabels(TTF_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...compactBookLabels(book), ...recent]

  const collected: TtfSet[] = []
  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateTwoTruthsFib(
        {
          subject,
          customSubject: customSubject || undefined,
          level: parseTtfLevel(config.level),
          count: TTF_REQUEST_COUNT,
          maxStatementChars: MAX_STATEMENT_CHARS,
          maxTitleChars: MAX_TITLE_CHARS,
          maxFactChars: MAX_FACT_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(
            [...collected.flatMap(ttfSetLabels), ...rejected, ...hints],
            STUDIO_AVOID_LIMIT,
          ),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const fresh = selectTtfSets(remote?.items, {
        cap: TTF_REQUEST_COUNT - collected.length,
        avoid: [...book, ...recent, ...collected.flatMap(ttfSetLabels)],
      })
      collected.push(...fresh)
      if (fresh.length === 0) {
        for (const item of remote?.items ?? []) {
          const title = String(item?.title ?? '').trim()
          if (title) rejected.push(title)
        }
        lastError = new Error(TTF_AI_EMPTY_MESSAGE)
      }
      // A full page is in hand; a second call would only spend quota.
      if (collected.length >= MAX_SETS_PER_PAGE) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${TTF_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length > 0) {
    rememberStudioContent(varietyKey, collected.flatMap(ttfSetLabels))
    return { items: collected.map(ttfItemFromSet) }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(TTF_AI_EMPTY_MESSAGE)
}
