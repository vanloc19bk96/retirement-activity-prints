import { generateWorkLingo } from '@/api/studio-work-lingo.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { WorkLingoResponse } from '@/types/studio-work-lingo.types'
import {
  STUDIO_AVOID_LIMIT,
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  MAX_MEANING_CHARS,
  MAX_PHRASE_CHARS,
  MIN_PAIRS_PER_PAGE,
  WL_AI_EMPTY_MESSAGE,
  WL_TEMPLATE_KEY,
  parseWlLevel,
  selectWlPairs,
  wlLevelSpec,
  wlPhraseLabel,
  wlServicePair,
  type WlPair,
} from './content'

/**
 * Spares asked for on top of the fullest page the level holds: for the page's
 * own gates (a meaning one line too long, a look-alike) and for phrases this
 * book already prints. The service caps what it returns to what survived its
 * check, so asking for spares costs only a few hundred tokens.
 */
const SPARE_PAIRS = 4
/** The service's own ceiling on one request. */
const MAX_REQUEST = 16

export const wlRequestCount = (maxPairs: number) => Math.min(MAX_REQUEST, maxPairs + SPARE_PAIRS)

/**
 * Round trips before the form shows an error. The service already retries
 * its own bad replies, so a second call here only happens when this side's
 * book check left the response short of a page — never on a rate limit,
 * which a retry only deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book phrases sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

/** One memory for every level: a phrase printed on a Gentle page must not return on a Classic one. */
const VARIETY_BUCKET = 'all'

const isRateLimit = (error: unknown) =>
  error instanceof Error && /too many/i.test(error.message)

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
 * AI-only — there is no bundled phrase list behind this.
 *
 * A packaged list would hand every seller's book the same few dozen pairs in
 * the same words, which is the fastest way to two KDP titles that look copied
 * from each other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every pair its own workplace area and era, sampled by
 *    the seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers the phrases this seller printed;
 * 3. the book itself — every phrase already on its pages — is read back
 *    through the prefetch context, sent as hints, and enforced here: a phrase
 *    that repeats one is dropped, not just discouraged.
 *
 * Pairs from two responses are never mixed. The service checked each
 * response's pairs against one another, not against another response's, so
 * two meanings that fit one phrase could only meet on a page built from both.
 * When a first response leaves too few pairs, a second call is made and the
 * larger of the two is kept whole.
 */
export async function workLingoPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<WorkLingoResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseWlLevel(config.level)
  const target = wlLevelSpec(level).maxPairs
  const count = wlRequestCount(target)
  const varietyKey = studioVarietyKey(WL_TEMPLATE_KEY, VARIETY_BUCKET)
  const book = context?.bookContentLabels(WL_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse().map(wlPhraseLabel), ...recent]

  let best: WlPair[] = []
  const offered: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateWorkLingo(
        {
          level,
          count,
          maxPhraseChars: MAX_PHRASE_CHARS,
          maxMeaningChars: MAX_MEANING_CHARS,
          seed: seed + attempt * 97,
          // A second call is told what the first offered, so it reaches for
          // different phrases rather than the same short list again.
          avoid: dedupe([...offered, ...hints], STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const usable = selectWlPairs(remote?.pairs, { cap: count, avoid: [...book, ...recent] })
      if (usable.length > best.length) best = usable
      for (const pair of remote?.pairs ?? []) {
        const phrase = String(pair?.phrase ?? '').trim()
        if (phrase) offered.push(wlPhraseLabel(phrase))
      }
      if (usable.length < MIN_PAIRS_PER_PAGE) lastError = new Error(WL_AI_EMPTY_MESSAGE)
      // A full page is in hand; a second call would only spend quota.
      if (best.length >= target) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${WL_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (best.length >= MIN_PAIRS_PER_PAGE) {
    rememberStudioContent(varietyKey, best.map((pair) => wlPhraseLabel(pair.phrase)))
    return { pairs: best.map(wlServicePair) }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(WL_AI_EMPTY_MESSAGE)
}
