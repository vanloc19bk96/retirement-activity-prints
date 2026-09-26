import { generateBucketList } from '@/api/studio-bucket-list.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { BucketListResponse } from '@/types/studio-bucket-list.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  BL_AI_EMPTY_MESSAGE,
  BL_SHORT_MESSAGE,
  BL_TEMPLATE_KEY,
  MAX_IDEA_CHARS,
  balanceBlSections,
  blIdeas,
  blShortfall,
  cleanBlSections,
  parseBlCount,
  parseBlFocus,
  type BlSection,
} from './content'

/**
 * Round trips before the form shows an error: the full list, then up to two
 * top-ups naming only the headings this side's checks left short. The service
 * already retries its own bad batches, so a top-up only happens when the book
 * check here spent a heading's spares — and never after a rate limit, which a
 * retry only deepens.
 */
const MAX_AI_ATTEMPTS = 3

/** Book ideas sent to the server as avoid hints, newest first. */
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
 * AI-only — there is no bundled bank of ideas behind this.
 *
 * A packaged list of a hundred ideas would hand every seller's book the same
 * bucket list, which is the fastest way to two KDP titles that look copied
 * from each other. Freshness comes from three places, strongest last:
 *
 * 1. the service samples its headings from a large theme bank and gives every
 *    idea its own facet-and-flavour brief, by seed, and drops anything it
 *    wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the same mix;
 * 3. the book itself — every idea already on its pages — is read back through
 *    the prefetch context, sent as hints, and enforced here: an idea that
 *    repeats one is dropped, not just discouraged.
 *
 * Every idea is validated here, before it can reach the editor, and the list
 * must balance to the exact count across its headings; generate validates
 * again against the page it lands on. Spares are returned with the list so
 * the page can pass over an idea that wraps too far.
 */
export async function bucketListPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<BucketListResponse> {
  const seed = Number(config.seed ?? 1)
  const count = parseBlCount(config.ideaCount)
  const focus = parseBlFocus(config.focus)
  const varietyKey = studioVarietyKey(BL_TEMPLATE_KEY, focus)
  const book = context?.bookContentLabels(BL_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const printed = [...book, ...recent]
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let sections: BlSection[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    const short = blShortfall(sections)
    // A failed first call has nothing to top up: ask for the whole list again.
    const topUp = sections.length > 0
    if (topUp && short.length === 0) break
    try {
      const remote = await generateBucketList(
        {
          count,
          focus,
          sections: topUp ? short : undefined,
          maxIdeaChars: MAX_IDEA_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(topUp ? [...blIdeas(sections), ...hints] : hints, STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      sections = cleanBlSections(remote?.sections, { avoid: printed, keep: sections })
      if (sections.length === 0) lastError = new Error(BL_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${BL_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  const chosen = balanceBlSections(sections, count)
  if (chosen) {
    rememberStudioContent(varietyKey, blIdeas(chosen))
    return {
      sections: sections.map(({ key, title, target, items }) => ({
        key,
        title,
        target,
        items: items.map(({ idea, concept }) => ({ idea, concept })),
      })),
    }
  }
  if (sections.length > 0) throw new Error(BL_SHORT_MESSAGE)
  if (lastError instanceof Error && lastError.message.trim()) throw new Error(lastError.message.trim())
  throw new Error(BL_AI_EMPTY_MESSAGE)
}
