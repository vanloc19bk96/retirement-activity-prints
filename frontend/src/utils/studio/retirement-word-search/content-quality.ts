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
]

/** Soft filters for AI / custom theme copy — never medical claims. */
export function hasMedicalClaim(text: string): boolean {
  return MEDICAL_CLAIM_PATTERNS.some((re) => re.test(text))
}

export function hasTrademarkHint(text: string): boolean {
  return TRADEMARK_HINTS.some((re) => re.test(text))
}

export function filterUnsafeThemeCopy(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (hasMedicalClaim(trimmed)) return null
  if (hasTrademarkHint(trimmed)) return null
  return trimmed
}

/** Drop word-bank lines that look like medical claims. */
export function filterSafeWordLines(lines: string[]): string[] {
  return lines.filter((line) => !hasMedicalClaim(line) && !hasTrademarkHint(line))
}
