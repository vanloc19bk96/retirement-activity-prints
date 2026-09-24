import { generateEverOrNever } from '@/api/studio-ever-or-never.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { EverOrNeverResponse } from '@/types/studio-ever-or-never.types'
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
  EON_AI_EMPTY_MESSAGE,
  EON_TEMPLATE_KEY,
  EON_THEME_SALT,
  MAX_STATEMENT_CHARS,
  compactStatementLabel,
  parseEonStyle,
  selectEonStatements,
  type EonStatement,
} from './content'
import { MAX_STATEMENTS_PER_PAGE } from './layout'

/**
 * Statements asked for per call: the fullest page any trim holds, plus spares
 * for the page's own gates (a statement that breaks onto one line too many)
 * and for ones this book already asks. Four more cost a few hundred tokens in
 * the same call.
 */
export const EON_REQUEST_COUNT = MAX_STATEMENTS_PER_PAGE + 4

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
    out.push(compactStatementLabel(labels[i]!))
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
 * AI-only — there is no bundled bank of statements behind this.
 *
 * A packaged list would hand every seller's book the same few dozen
 * statements, which is the fastest way to two KDP titles that look copied
 * from each other. Freshness comes from three places, strongest last:
 *
 * 1. the service gives every statement its own topic-and-angle brief, sampled
 *    by the seed, and drops anything it wrote for this seller recently;
 * 2. the browser remembers what this seller printed for the theme;
 * 3. the book itself — every statement already on its pages, whatever its
 *    theme — is read back through the prefetch context, sent as hints, and
 *    enforced here: a statement that repeats one is dropped, not just
 *    discouraged.
 *
 * Every statement is validated here, before it can reach the editor; generate
 * validates again against the page it lands on.
 */
export async function everOrNeverPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<EverOrNeverResponse> {
  const seed = Number(config.seed ?? 1)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, EON_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    EON_TEMPLATE_KEY,
    mixedTopics ? RETIREMENT_THEME_MIXED : theme.label || promptTheme,
  )
  const book = context?.bookContentLabels(EON_TEMPLATE_KEY) ?? []
  const recent = studioAvoidList(varietyKey)
  const hints = [...compactBookLabels(book), ...recent]

  const collected: EonStatement[] = []
  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateEverOrNever(
        {
          theme: promptTheme,
          mixedTopics,
          style: parseEonStyle(config.tone),
          count: EON_REQUEST_COUNT,
          maxStatementChars: MAX_STATEMENT_CHARS,
          seed: seed + attempt * 97,
          avoid: dedupe(
            [...collected.map((item) => compactStatementLabel(item.statement)), ...rejected, ...hints],
            STUDIO_AVOID_LIMIT,
          ),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const fresh = selectEonStatements(remote?.items, {
        cap: EON_REQUEST_COUNT - collected.length,
        avoid: [...book, ...recent, ...collected.map((item) => item.statement)],
      })
      collected.push(...fresh)
      if (fresh.length === 0) {
        for (const item of remote?.items ?? []) {
          const statement = String(item?.statement ?? '').trim()
          if (statement) rejected.push(compactStatementLabel(statement))
        }
        lastError = new Error(EON_AI_EMPTY_MESSAGE)
      }
      // A full page is in hand; a second call would only spend quota.
      if (collected.length >= MAX_STATEMENTS_PER_PAGE) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${EON_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length > 0) {
    rememberStudioContent(
      varietyKey,
      collected.map((item) => compactStatementLabel(item.statement)),
    )
    return { items: collected.map(({ statement, topic }) => ({ statement, topic })) }
  }
  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(EON_AI_EMPTY_MESSAGE)
}
