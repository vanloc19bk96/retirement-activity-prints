import commonEn from '@/data/studio/words/common-en.json'
import type { StudioRng } from '../studio-rng'

export type AnagramIndex = Map<string, string[]>

let cachedIndex: AnagramIndex | null = null

/** Sorted-letters key: "LISTEN" → "EILNST". */
export function sortedKey(letters: string | readonly string[]): string {
  const chars =
    typeof letters === 'string'
      ? letters.toUpperCase().replace(/[^A-Z]/g, '').split('')
      : letters.map((c) => c.toUpperCase())
  return chars.toSorted().join('')
}

export function sortLetters(word: string): string {
  return sortedKey(word)
}

function buildIndex(words: readonly string[]): AnagramIndex {
  const index: AnagramIndex = new Map()
  for (const raw of words) {
    const word = raw.toUpperCase().replace(/[^A-Z]/g, '')
    if (word.length < 3) continue
    const key = sortedKey(word)
    const bucket = index.get(key)
    if (bucket) {
      if (!bucket.includes(word)) bucket.push(word)
    } else {
      index.set(key, [word])
    }
  }
  return index
}

/** Sorted-letters → dictionary words. Built once from the common list. */
export function loadAnagramIndex(): AnagramIndex {
  if (!cachedIndex) {
    cachedIndex = buildIndex(commonEn as string[])
  }
  return cachedIndex
}

/** Test helper — build a tiny index without touching the common list. */
export function buildAnagramIndexForTests(words: readonly string[]): AnagramIndex {
  return buildIndex(words)
}

export function anagramsOf(
  letters: string | readonly string[],
  index: AnagramIndex,
): string[] {
  return index.get(sortedKey(letters)) ?? []
}

function isDerangement(original: string, scrambled: string): boolean {
  if (original.length !== scrambled.length) return false
  for (let i = 0; i < original.length; i++) {
    if (original[i] === scrambled[i]) return false
  }
  return true
}

export interface ScrambleResult {
  scrambled: string
  alternates: string[]
}

/**
 * True permutation of `word`, never equal to the original.
 * Hard mode prefers a derangement (no letter in its original seat).
 */
export function scrambleWord(
  word: string,
  index: AnagramIndex,
  rng: StudioRng,
  options?: { preferDerangement?: boolean },
): ScrambleResult {
  const answer = word.toUpperCase().replace(/[^A-Z]/g, '')
  const letters = answer.split('')
  const preferDerangement = options?.preferDerangement === true && answer.length >= 3

  let scrambled = answer
  let guard = 0
  do {
    scrambled = rng.shuffle([...letters]).join('')
    guard++
    if (scrambled === answer) continue
    if (preferDerangement && !isDerangement(answer, scrambled) && guard < 40) {
      continue
    }
    break
  } while (guard < 50)

  // Last resort: swap first two distinct letters so it cannot equal the answer.
  if (scrambled === answer && answer.length >= 2) {
    const chars = [...letters]
    const swapAt = chars.findIndex((c, i) => i > 0 && c !== chars[0])
    if (swapAt > 0) {
      ;[chars[0], chars[swapAt]] = [chars[swapAt]!, chars[0]!]
      scrambled = chars.join('')
    }
  }

  const alternates = anagramsOf(letters, index).filter((w) => w !== answer)
  return { scrambled, alternates }
}

/** True when the letter-set spells only this word in the dictionary. */
export function hasUniqueAnagram(word: string, index: AnagramIndex): boolean {
  const answer = word.toUpperCase().replace(/[^A-Z]/g, '')
  const peers = anagramsOf(answer, index)
  return peers.length <= 1 || (peers.length === 1 && peers[0] === answer)
}
