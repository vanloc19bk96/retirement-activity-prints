/** A E I O U only — Y stays visible per the retirement missing-vowels spec. */
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

export interface MissingVowelItem {
  display: string
  token: string
  masked: string
}

export function isVowel(ch: string): boolean {
  return VOWELS.has(ch.toUpperCase())
}

/** Uppercase A–Z only, spaces stripped. */
export function letterToken(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/**
 * Replace A/E/I/O/U with `_`. Consonants (including Y) and spaces stay put.
 * Deterministic — never leaves a vowel visible.
 */
export function maskVowels(answer: string): string {
  return String(answer ?? '')
    .toUpperCase()
    .split('')
    .map((ch) => {
      if (ch === ' ') return ' '
      if (!/[A-Z]/.test(ch)) return ''
      return VOWELS.has(ch) ? '_' : ch
    })
    .join('')
    .replace(/ +/g, ' ')
    .trim()
}

export function vowelCount(token: string): number {
  let n = 0
  for (const ch of token) {
    if (VOWELS.has(ch)) n += 1
  }
  return n
}

export function consonantCount(token: string): number {
  let n = 0
  for (const ch of token) {
    if (/[A-Z]/.test(ch) && !VOWELS.has(ch)) n += 1
  }
  return n
}

/** Solver needs at least one blank and enough consonants to recognise the word. */
export function isPlayableMask(item: Pick<MissingVowelItem, 'token' | 'masked'>): boolean {
  if (vowelCount(item.token) < 1) return false
  if (consonantCount(item.token) < 2) return false
  if (!item.masked.includes('_')) return false
  return item.masked.replace(/ /g, '').length === item.token.length
}
