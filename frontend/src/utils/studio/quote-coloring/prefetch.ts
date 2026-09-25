import { generateQuoteColoring } from '@/api/studio-quote-coloring.api'
import type { StudioConfig, StudioPrefetchContext } from '@/types/studio-template.types'
import type { QuoteColoringItem } from '@/types/studio-quote-coloring.types'
import { STUDIO_AVOID_LIMIT, studioAvoidList, studioVarietyKey } from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  RETIREMENT_THEME_MIXED,
  parseRetirementThemeChoice,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { filterUnsafeThemeCopy } from '../retirement-word-search/content-quality'
import {
  QC_AI_EMPTY_MESSAGE,
  QC_FONTS_MISSING_MESSAGE,
  QC_SAYING_LIMITS,
  QC_TEMPLATE_KEY,
  QC_THEME_SALT,
  compactQcLabel,
  parseQcBook,
  parseQcTone,
  sayingsRepeat,
  selectQcSayings,
} from './content'
import { QC_LETTER_STYLES, loadQcFonts, type QcFontSet, type QcLetterStyleId } from './fonts'

/** What generate needs: checked sayings, the book's pages, and the lettering faces. */
export interface QcRemoteData {
  items: QuoteColoringItem[]
  bookLabels: string[]
  fonts: QcFontSet
}

/**
 * Sayings asked for per call. The page letters one; the rest are spares for
 * its own gates — one too long for this trim, one this book already prints.
 */
export const QC_REQUEST_COUNT = 8
/** Round trips before the form shows an error. The service already retries its own bad replies. */
const MAX_AI_ATTEMPTS = 2
/** Book sayings sent to the server as avoid hints, newest first. */
const BOOK_AVOID_HINTS = 40

const isRateLimit = (error: unknown) => error instanceof Error && /too many/i.test(error.message)

/** One memory per theme, whatever the tone: a saying printed once must not come back. */
export function qcVarietyKey(config: StudioConfig): string {
  const seed = Number(config.seed ?? 1)
  const mixed = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, QC_THEME_SALT)
  return studioVarietyKey(QC_TEMPLATE_KEY, mixed ? RETIREMENT_THEME_MIXED : theme.label || theme.prompt)
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
 * AI-only — there is no bundled bank of sayings behind this.
 *
 * A packaged list would hand every seller's book the same few hundred lines,
 * which is the fastest way to two KDP titles that look copied from each
 * other, and a quote list is exactly what gets lifted from posters and quote
 * sites. Every saying is written fresh against a per-item brief, checked
 * blind for originality and quality by the service, and checked again here.
 *
 * Freshness comes from three places, strongest last: the service's own
 * briefs and memory; this seller's recent sayings for the theme (browser
 * memory); and the book itself — every saying already on its pages, read
 * back from the page stamps, sent as hints and enforced here and in
 * generate. Nothing compares against every page ever generated: each check
 * is bounded by one seller's recent history and one book.
 *
 * The lettering faces load alongside, once per session: the page draws its
 * saying from the font files themselves.
 */
export async function quoteColoringPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
): Promise<QcRemoteData> {
  const seed = Number(config.seed ?? 1)
  const mixedTopics = parseRetirementThemeChoice(config) === RETIREMENT_THEME_MIXED
  const theme = resolveRetirementTheme(config, seed, QC_THEME_SALT)
  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(0, AI_THEME_MAX_LENGTH)
  const varietyKey = qcVarietyKey(config)
  const bookLabels = context?.bookContentLabels(QC_TEMPLATE_KEY) ?? []
  const bookSayings = parseQcBook(bookLabels).map((entry) => entry.saying)
  const recent = studioAvoidList(varietyKey)
  const hints = [...bookSayings.slice(-BOOK_AVOID_HINTS).reverse().map(compactQcLabel), ...recent]

  const fontsPending = loadQcFonts()
  const collected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateQuoteColoring(
        {
          theme: promptTheme,
          mixedTopics,
          tone: parseQcTone(config.tone),
          count: QC_REQUEST_COUNT,
          maxChars: QC_SAYING_LIMITS.maxChars,
          seed: seed + attempt * 97,
          avoid: dedupe([...collected.map(compactQcLabel), ...hints], STUDIO_AVOID_LIMIT),
          locale: String(config.locale ?? 'en'),
        },
        signal,
      )
      const fresh = selectQcSayings(remote?.items).filter(
        (text) => ![...bookSayings, ...collected].some((other) => sayingsRepeat(text, other)),
      )
      collected.push(...fresh)
      if (fresh.length === 0) lastError = new Error(QC_AI_EMPTY_MESSAGE)
      if (collected.length >= 3) break
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[${QC_TEMPLATE_KEY}] AI attempt ${attempt + 1} failed`, error)
      if (isRateLimit(error)) break
    }
  }

  if (collected.length === 0) {
    if (lastError instanceof Error && lastError.message.trim()) throw new Error(lastError.message.trim())
    throw new Error(QC_AI_EMPTY_MESSAGE)
  }
  const fonts = await fontsPending
  if (Object.keys(fonts).length === 0) throw new Error(QC_FONTS_MISSING_MESSAGE)
  return { items: collected.map((text) => ({ text, verified: true })), bookLabels, fonts }
}

export function parseQcRemoteData(raw: unknown): QcRemoteData {
  const data = (raw ?? {}) as Partial<QcRemoteData>
  const labels = Array.isArray(data.bookLabels) ? data.bookLabels.filter((l): l is string => typeof l === 'string') : []
  const fonts: QcFontSet = {}
  for (const style of QC_LETTER_STYLES) {
    const font = (data.fonts as Record<string, unknown> | undefined)?.[style.id] as QcFontSet[QcLetterStyleId]
    if (font && typeof font.charToGlyph === 'function') fonts[style.id] = font
  }
  return { items: Array.isArray(data.items) ? data.items : [], bookLabels: labels, fonts }
}
