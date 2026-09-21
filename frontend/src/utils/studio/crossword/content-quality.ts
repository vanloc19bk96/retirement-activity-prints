/**
 * Answer / clue quality gates for Retirement Crossword (AI-only).
 * Never invent length-hint pseudo-clues; drop bad candidates instead.
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

export function normalizeAnswerToken(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

/** One word or a short two-word phrase → A–Z token for the grid. */
export function normalizeAnswerDisplay(raw: string): {
  display: string
  token: string
  wordCount: number
} | null {
  const display = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!display) return null
  const parts = display.split(' ').filter(Boolean)
  if (parts.length > 2) return null
  const token = normalizeAnswerToken(display)
  if (!token) return null
  return { display, token, wordCount: parts.length }
}

export function hasMedicalClaim(text: string): boolean {
  return MEDICAL_CLAIM_PATTERNS.some((re) => re.test(text))
}

export function hasTrademarkHint(text: string): boolean {
  return TRADEMARK_HINTS.some((re) => re.test(text))
}

export function hasAgeStereotype(text: string): boolean {
  return AGE_STEREOTYPE_PATTERNS.some((re) => re.test(text))
}

export function filterUnsafeThemeCopy(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (hasMedicalClaim(trimmed)) return null
  if (hasTrademarkHint(trimmed)) return null
  if (hasAgeStereotype(trimmed)) return null
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

/**
 * Spec §24 — reject clues that echo the answer or an obvious inflection.
 * Avoid over-rejecting unrelated words that only share a short stem.
 */
export function clueContainsAnswerFamily(answerToken: string, clue: string): boolean {
  const token = normalizeAnswerToken(answerToken)
  const upper = clue.toUpperCase().replace(/[^A-Z\s]/g, ' ')
  if (!token || token.length < 3) return false
  if (upper.includes(token)) return true

  const variants = answerFamilyVariants(token)
  for (const variant of variants) {
    if (variant.length < 4) continue
    const re = new RegExp(`\\b${variant}\\b`, 'i')
    if (re.test(clue)) return true
  }
  return false
}

function answerFamilyVariants(token: string): string[] {
  const out = new Set<string>([token])
  if (token.endsWith('S') && token.length > 4) out.add(token.slice(0, -1))
  else out.add(`${token}S`)
  if (token.endsWith('ING') && token.length > 6) {
    out.add(token.slice(0, -3))
    out.add(`${token.slice(0, -3)}E`)
  } else {
    out.add(`${token}ING`)
    if (token.endsWith('E')) out.add(`${token.slice(0, -1)}ING`)
  }
  if (token.endsWith('ED') && token.length > 5) {
    out.add(token.slice(0, -2))
    out.add(`${token.slice(0, -1)}`)
  } else {
    out.add(`${token}ED`)
    if (token.endsWith('E')) out.add(`${token}D`)
  }
  out.add(`${token}ER`)
  if (token.endsWith('E')) out.add(`${token}R`)
  return [...out]
}

export function isValidClueText(
  clue: string,
  answerToken: string,
  maxChars: number,
): boolean {
  const trimmed = clue.trim()
  if (!trimmed) return false
  if (trimmed.length > maxChars) return false
  if (hasMedicalClaim(trimmed) || hasTrademarkHint(trimmed) || hasAgeStereotype(trimmed)) {
    return false
  }
  if (clueContainsAnswerFamily(answerToken, trimmed)) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 12) return false
  return true
}

/** Drop near-duplicate answer tokens (TRAVEL / TRAVELING). */
export function isNearDuplicateToken(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length < 4) return false
  if (longer.startsWith(shorter) && longer.length - shorter.length <= 3) return true
  if (shorter.startsWith(longer.slice(0, -1)) && Math.abs(a.length - b.length) <= 2) {
    return true
  }
  return false
}
