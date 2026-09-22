/**
 * Saying / theme quality gates for Retirement Cryptogram (AI-only).
 * Drop unsafe copy instead of printing it.
 */

const MEDICAL_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bprevent\s+dementia\b/i,
  /\breverse\s+aging\b/i,
  /\bcure\s+memory\s+loss\b/i,
  /\btreat\s+alzheimer/i,
  /\bcure\s+alzheimer/i,
  /\banti[\s-]?aging\s+cure\b/i,
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

const AGE_STEREOTYPE_PATTERNS: readonly RegExp[] = [
  /\bfrail\b/i,
  /\bforgetful\b/i,
  /\bsenile\b/i,
  /\bold[\s-]?timer\b/i,
  /\bmemory\s+loss\b/i,
  /\buseless\b/i,
]

const ATTRIBUTION_PATTERNS: readonly RegExp[] = [
  /\bas\s+\w+\s+once\s+said\b/i,
  /\bquote[sd]?\b/i,
  /\baccording\s+to\b/i,
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

export function hasAttribution(text: string): boolean {
  return ATTRIBUTION_PATTERNS.some((re) => re.test(text))
}

export function isUnsafeCopy(text: string): boolean {
  return (
    hasMedicalClaim(text) ||
    hasTrademarkHint(text) ||
    hasAgeStereotype(text) ||
    hasAttribution(text)
  )
}

export function filterUnsafeThemeCopy(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (isUnsafeCopy(trimmed)) return null
  return trimmed
}

/** Soft IP warning for the Studio form (does not block generate). */
export function themeIpWarning(theme: string): string | null {
  if (!hasTrademarkHint(theme)) return null
  return (
    'This theme may involve third-party intellectual property. ' +
    'Choose a generic retirement theme for content intended for commercial publishing.'
  )
}

/** Words too common to count as shared content between two sayings. */
const STOP_WORDS = new Set([
  'A', 'AN', 'AND', 'ARE', 'AS', 'AT', 'BE', 'BUT', 'BY', 'FOR', 'FROM', 'IN',
  'IS', 'IT', 'OF', 'ON', 'OR', 'THAT', 'THE', 'TO', 'WITH', 'YOU', 'YOUR',
])

function contentWords(saying: string): Set<string> {
  return new Set(saying.split(' ').filter((word) => word && !STOP_WORDS.has(word)))
}

/** Share of the shorter saying's content words that the longer one also uses. */
const NEAR_DUPLICATE_OVERLAP = 0.6

/**
 * Two sayings a buyer would read as the same one.
 *
 * Exact text and a shared three-word opening catch the copycat phrasings a
 * language model falls into when asked twice for the same theme. The overlap
 * test catches the rest: "QUIET MORNINGS ARE THE BEST PART OF RETIREMENT" and
 * "THE BEST PART OF RETIREMENT IS QUIET MORNINGS" share no opening and every
 * idea, and a book that prints both looks padded.
 */
export function isNearDuplicateSaying(a: string, b: string): boolean {
  if (a === b) return true
  const wordsA = a.split(' ').filter(Boolean)
  const wordsB = b.split(' ').filter(Boolean)
  if (wordsA.length < 3 || wordsB.length < 3) return false
  if (wordsA.slice(0, 3).join(' ') === wordsB.slice(0, 3).join(' ')) return true

  const setA = contentWords(a)
  const setB = contentWords(b)
  const smaller = Math.min(setA.size, setB.size)
  if (smaller === 0) return false
  let shared = 0
  for (const word of setA) {
    if (setB.has(word)) shared++
  }
  return shared / smaller >= NEAR_DUPLICATE_OVERLAP
}
