import { generateRetiredName } from '@/api/studio-retired-name.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { RetiredNameResponse } from '@/types/studio-retired-name.types'
import { createRng } from '../studio-rng'
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
  MAX_FIRST_CHARS,
  MAX_LAST_CHARS,
  RN_AI_EMPTY_MESSAGE,
  RN_LETTERS,
  RN_MONTHS,
  RN_TEMPLATE_KEY,
  RN_THEME_SALT,
  labelKind,
  selectFirstNames,
  selectLastNames,
} from './content'

/**
 * Names asked for per call: a full table plus spares for the page's own gates
 * (a name that sets wider than its column, a first name that echoes a word of
 * a last name). A few more names cost a few dozen tokens in the same call.
 */
export const RN_FIRST_REQUEST = RN_LETTERS.length + 8
export const RN_LAST_REQUEST = RN_MONTHS.length + 4

/**
 * Round trips before the form shows an error. The service already retries and
 * tops up its own short replies, so a second call here only happens when this
 * side's gates left a list short of a table — never on a rate limit, which a
 * retry only deepens.
 */
const MAX_AI_ATTEMPTS = 2

/** Book labels sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

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

/** Names nobody has printed yet first, in the order given; the rest behind them. */
function freshFirst(names: readonly string[], printed: ReadonlySet<string>): string[] {
  const fresh = names.filter((name) => !printed.has(name.toLowerCase()))
  const seen = names.filter((name) => printed.has(name.toLowerCase()))
  return [...fresh, ...seen]
}

/**
 * AI-only — there is no bundled name table behind this.
 *
 * A packaged table would hand every seller's book the same 38 names, which is
 * the fastest way to two KDP titles that look copied from each other.
 * Freshness comes from three places, strongest last:
 *
 * 1. the service gives every name its own brief (a first-name kind and
 *    flavour, or a retirement pastime), sampled by the seed, and drops last
 *    names it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the theme;
 * 3. the book itself — every name already on its pages — is read back
 *    through the prefetch context and sent as hints.
 *
 * Last names are the page's content, so one already printed in the book or
 * recently in this browser is dropped here. First names are only ranked
 * behind fresh ones: good gender-neutral titles are finite, and a book that
 * could never reuse "Captain" would eventually fail to fill a table.
 *
 * Every name is validated here, before it can reach the editor; generate
 * validates again against the page it lands on. The returned pools are
 * shuffled by seed, so which name meets which letter differs page to page.
 */
export async function retiredNamePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<RetiredNameResponse> {
  const seed = Number(config.seed ?? 1)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, RN_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    RN_TEMPLATE_KEY,
    mixedTopics ? RETIREMENT_THEME_MIXED : theme.label || promptTheme,
  )
  const book = context?.bookContentLabels(RN_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const history = [...book, ...recent]
  const printedLast = history.filter((label) => labelKind(label) === 'last')
  const printedFirst = new Set(
    history.filter((label) => labelKind(label) === 'first').map((label) => label.toLowerCase()),
  )
  const hints = [...book.slice(-BOOK_AVOID_HINTS).reverse(), ...recent]

  let firsts: string[] = []
  let lasts: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateRetiredName(
        {
          theme: promptTheme,
          mixedTopics,
          firstCount: RN_FIRST_REQUEST,
          lastCount: RN_LAST_REQUEST,
          maxFirstChars: MAX_FIRST_CHARS,
          maxLastChars: MAX_LAST_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe([...lasts, ...firsts, ...hints], STUDIO_AVOID_LIMIT),
        },
        signal,
      )
      firsts = selectFirstNames([...firsts, ...(remote?.firstNames ?? [])], {
        cap: RN_FIRST_REQUEST,
      })
      lasts = selectLastNames([...lasts, ...(remote?.lastNames ?? [])], {
        cap: RN_LAST_REQUEST,
        avoid: printedLast,
      })
      // A full table is in hand; a second call would only spend quota.
      if (firsts.length >= RN_LETTERS.length && lasts.length >= RN_MONTHS.length) break
      lastError = new Error(RN_AI_EMPTY_MESSAGE)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${RN_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (firsts.length < RN_LETTERS.length || lasts.length < RN_MONTHS.length) {
    const message = lastError instanceof Error ? lastError.message.trim() : ''
    throw new Error(message || RN_AI_EMPTY_MESSAGE)
  }

  const rng = createRng((seed ^ RN_THEME_SALT) >>> 0)
  const firstNames = freshFirst(rng.shuffle(firsts), printedFirst)
  const lastNames = rng.shuffle(lasts)
  rememberStudioContent(varietyKey, [
    ...lastNames.slice(0, RN_MONTHS.length),
    ...firstNames.slice(0, RN_LETTERS.length),
  ])
  return { firstNames, lastNames }
}
