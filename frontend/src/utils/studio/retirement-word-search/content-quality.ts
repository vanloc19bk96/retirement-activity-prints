/**
 * Word / theme quality gates for the retirement word search.
 *
 * Everything on this page is printed and sold on KDP, so copy that would put a
 * title at risk is dropped rather than set. The pool the writer returns is
 * over-requested for exactly this reason: losing a few entries here costs
 * nothing, and printing one of them can cost the book.
 */

const MEDICAL_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bprevent\s+dementia\b/i,
  /\breverse\s+aging\b/i,
  /\bcure\s+memory\s+loss\b/i,
  /\btreat\s+alzheimer/i,
  /\bcure\s+alzheimer/i,
  /\banti[\s-]?aging\s+cure\b/i,
  /\bmemory\s+loss\b/i,
]

const TRADEMARK_HINTS: readonly RegExp[] = [
  /\bnintendo\b/i,
  /\bdisney\b/i,
  /\bmarvel\b/i,
  /\bstarbucks\b/i,
  /\bmcDonald/i,
  /\bcoca[\s-]?cola\b/i,
  /\bharry\s+potter\b/i,
  /\btaylor\s+swift\b/i,
  /\bstar\s+wars\b/i,
]

/**
 * Words that describe a reader rather than a pastime.
 *
 * The buyer of this book is the person solving it, or someone who loves them.
 * "FRAIL" in a word bank is not a neutral noun on that page — it is the book
 * telling its reader what it thinks of them, and it is the single fastest way
 * to a one-star review that has nothing to do with the puzzles.
 */
const AGE_STEREOTYPE_PATTERNS: readonly RegExp[] = [
  /\bfrail\b/i,
  /\bforgetful\b/i,
  /\bsenile\b/i,
  /\bold[\s-]?timer\b/i,
  /\bdecline\b/i,
  /\bfeeble\b/i,
  /\buseless\b/i,
]

const FINANCE_ADVICE_PATTERNS: readonly RegExp[] = [
  /\bguaranteed\s+(return|income|profit)/i,
  /\binvest\s+now\b/i,
  /\bget[\s-]?rich\b/i,
  /\bcrypto/i,
  /\bbitcoin\b/i,
  /\bday[\s-]?trad/i,
  /\bpenny\s+stock/i,
  /\bno[\s-]?risk\s+invest/i,
]

export function hasMedicalClaim(text: string): boolean {
  return MEDICAL_CLAIM_PATTERNS.some((re) => re.test(text))
}

export function hasTrademarkHint(text: string): boolean {
  return TRADEMARK_HINTS.some((re) => re.test(text))
}

export function hasAgeStereotype(text: string): boolean {
  return AGE_STEREOTYPE_PATTERNS.some((re) => re.test(text))
}

export function hasFinanceAdvice(text: string): boolean {
  return FINANCE_ADVICE_PATTERNS.some((re) => re.test(text))
}

/** One gate for every entry that reaches a printed page. */
export function isUnsafeCopy(text: string): boolean {
  return (
    hasMedicalClaim(text) ||
    hasTrademarkHint(text) ||
    hasAgeStereotype(text) ||
    hasFinanceAdvice(text)
  )
}

export function filterUnsafeThemeCopy(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return isUnsafeCopy(trimmed) ? null : trimmed
}

/** Drop word-bank lines that have no business in a book sold on KDP. */
export function filterSafeWordLines(lines: string[]): string[] {
  return lines.filter((line) => !isUnsafeCopy(line))
}

/**
 * A word that reads the same forwards and backwards.
 *
 * Dropped because the answer key cannot be right about it: LEVEL placed
 * running east also reads LEVEL running west, so the grid holds two equally
 * valid answers and the key circles only one of them.
 */
export function isPalindrome(token: string): boolean {
  if (token.length < 2) return true
  return token === [...token].reverse().join('')
}

/** Soft IP warning for the Studio form (does not block generate). */
export function themeIpWarning(theme: string): string | null {
  if (!hasTrademarkHint(theme)) return null
  return (
    'This theme may involve third-party intellectual property. ' +
    'Choose a generic retirement theme for content intended for commercial publishing.'
  )
}
