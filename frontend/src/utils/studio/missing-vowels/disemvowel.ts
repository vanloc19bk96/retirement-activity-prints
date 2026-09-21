import commonEn from '@/data/studio/words/common-en.json'

const BASE_VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

export type SkeletonIndex = Map<string, string[]>

const indexCache = new Map<boolean, SkeletonIndex>()

function vowelSet(includeY: boolean): Set<string> {
  return includeY ? new Set([...BASE_VOWELS, 'Y']) : BASE_VOWELS
}

/** Drop vowels; keep consonants, spaces, and punctuation. */
export function disemvowel(text: string, includeY: boolean): string {
  const vowels = vowelSet(includeY)
  return text
    .toUpperCase()
    .split('')
    .map((ch) => {
      if (/[A-Z]/.test(ch)) return vowels.has(ch) ? '' : ch
      return ch
    })
    .join('')
}

/** One blank slot per missing vowel — e.g. DOLPHIN → "D __ L P H __ N". */
export const VOWEL_BLANK = '__'

/**
 * Printable prompt: consonants kept, each vowel becomes a short dash blank.
 * Single words keep letter spacing; phrases stay dense so long sayings stay legible.
 * Wider gaps mark word boundaries.
 */
export function promptWithBlanks(text: string, includeY: boolean): string {
  const vowels = vowelSet(includeY)
  const words = text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  // Phrases omit per-letter gaps — spaced blanks blow past the column and shrink type.
  const letterJoin = words.length > 1 ? '' : ' '
  return words
    .map((word) =>
      word
        .split('')
        .filter((ch) => /[A-Z]/.test(ch))
        .map((ch) => (vowels.has(ch) ? VOWEL_BLANK : ch))
        .join(letterJoin),
    )
    .join('   ')
}

/** Space letters within each word; wider gaps mark word boundaries. */
export function spaceLetters(skeleton: string): string {
  return skeleton
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.split('').join(' '))
    .join('   ')
}

/** Consonant skeleton key for a single word (no spaces). */
export function skeletonKey(word: string, includeY: boolean): string {
  return disemvowel(word, includeY).replace(/[^A-Z]/g, '')
}

function buildIndex(words: readonly string[], includeY: boolean): SkeletonIndex {
  const index: SkeletonIndex = new Map()
  for (const raw of words) {
    const word = raw.toUpperCase().replace(/[^A-Z]/g, '')
    if (word.length < 3) continue
    const key = skeletonKey(word, includeY)
    if (!key) continue
    const bucket = index.get(key)
    if (bucket) {
      if (!bucket.includes(word)) bucket.push(word)
    } else {
      index.set(key, [word])
    }
  }
  return index
}

/** Common-word consonant skeletons — shared dictionary with anagram-sheet. */
export function loadSkeletonIndex(includeY: boolean): SkeletonIndex {
  const cached = indexCache.get(includeY)
  if (cached) return cached
  const built = buildIndex(commonEn as string[], includeY)
  indexCache.set(includeY, built)
  return built
}

/** Test helper — tiny index without the common list. */
export function buildSkeletonIndexForTests(
  words: readonly string[],
  includeY: boolean,
): SkeletonIndex {
  return buildIndex(words, includeY)
}

/** Other common words that share this skeleton (answer itself excluded). */
export function skeletonAlternates(
  answer: string,
  includeY: boolean,
  index?: SkeletonIndex,
): string[] {
  const word = answer.toUpperCase().replace(/[^A-Z]/g, '')
  if (!word || word.includes(' ')) return []
  const idx = index ?? loadSkeletonIndex(includeY)
  const peers = idx.get(skeletonKey(word, includeY)) ?? []
  return peers.filter((w) => w !== word)
}

/** True when every consonant of `answer` appears in order in `skeleton`. */
export function consonantsMatch(answer: string, skeleton: string): boolean {
  const expected = disemvowel(answer, false).replace(/\s+/g, '')
  const got = skeleton.replace(/\s+/g, '')
  return expected === got
}
