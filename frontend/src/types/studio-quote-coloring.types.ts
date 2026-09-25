/** The mood a Quote Coloring Page's sayings are written in. */
export type QuoteColoringTone = 'mixed' | 'uplifting' | 'playful' | 'reflective'

/**
 * What a Quote Coloring Page asks the content service for.
 *
 * `maxChars` is in the request rather than filtered for afterwards, because
 * the page fixes it before any saying exists: the saying has to letter at a
 * colorable size on the trim in Settings, and a longer one would only be
 * shrunk into lettering too thin to color.
 */
export interface QuoteColoringRequest {
  theme: string
  /** One retirement topic per saying instead of every saying on `theme`. */
  mixedTopics: boolean
  tone: QuoteColoringTone
  /** Sayings to write — the page prints one; the rest are spares for its own gates. */
  count: number
  maxChars: number
  seed: number
  /** Compact labels this seller's book has already printed. */
  avoid?: string[]
  locale?: string
}

/**
 * One saying, exactly as the page letters it. `verified` is only true on
 * sayings that passed the service's blind originality and quality check.
 */
export interface QuoteColoringItem {
  text: string
  verified: boolean
}

export interface QuoteColoringResponse {
  items: QuoteColoringItem[]
}
