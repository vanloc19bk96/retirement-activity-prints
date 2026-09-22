import commonEn from '@/data/studio/words/common-en.json'
import { answerWords, isVowel } from './mask'

/**
 * Which words a row of blanks could honestly be filled to spell.
 *
 * This is the check that decides whether a missing-vowels sheet is truthful
 * about its own solution page. B_LL is BALL, BELL and BULL; R__D is ROAD, READ
 * and REED; T_M_ is TIME and TOME. A reader who writes BELL has not made a
 * mistake — they have found a second right answer, and the key calls it wrong.
 * That is the review a seller gets.
 *
 * So a row only prints when its blanks have exactly one common-English filling.
 * The gate costs content: about one word in ten at six letters and two in five
 * at four, which is why the levels start at five letters and the writer is
 * asked for more words than a page needs. Paying for extra candidates is
 * cheaper than printing a puzzle with two answers.
 *
 * `hasUniqueAnagram` in the anagram game is the same idea against a different
 * axis — letters rearranged rather than vowels restored — and shares this word
 * list.
 */
export type VowelPatternIndex = Map<string, string[]>

let cachedIndex: VowelPatternIndex | null = null

/** Vowel-blanked key: "GARDEN" → "G.RD.N". */
export function vowelPattern(word: string): string {
  let key = ''
  for (const ch of word.toUpperCase().replace(/[^A-Z]/g, '')) {
    key += isVowel(ch) ? '.' : ch
  }
  return key
}

function buildIndex(words: readonly string[]): VowelPatternIndex {
  const index: VowelPatternIndex = new Map()
  for (const raw of words) {
    const word = raw.toUpperCase().replace(/[^A-Z]/g, '')
    if (word.length < 3) continue
    const key = vowelPattern(word)
    const bucket = index.get(key)
    if (bucket) {
      if (!bucket.includes(word)) bucket.push(word)
    } else {
      index.set(key, [word])
    }
  }
  return index
}

/** Vowel pattern → dictionary words. Built once from the common list. */
export function loadVowelPatternIndex(): VowelPatternIndex {
  if (!cachedIndex) cachedIndex = buildIndex(commonEn as string[])
  return cachedIndex
}

/** Test helper — build a tiny index without touching the common list. */
export function buildVowelPatternIndexForTests(
  words: readonly string[],
): VowelPatternIndex {
  return buildIndex(words)
}

/** Every common word whose consonants and blanks match this one's. */
export function vowelFillsOf(word: string, index: VowelPatternIndex): string[] {
  return index.get(vowelPattern(word)) ?? []
}

/**
 * True when this word is the only common one its blanks can spell.
 *
 * A word the list has never heard of passes: the gate exists to catch a *known*
 * second answer, and rejecting everything outside a 6,800-word list would throw
 * away most of the vocabulary a themed page is written from.
 */
export function hasUniqueVowelFill(word: string, index: VowelPatternIndex): boolean {
  const target = word.toUpperCase().replace(/[^A-Z]/g, '')
  const peers = vowelFillsOf(target, index)
  return peers.length <= 1 || peers.every((peer) => peer === target)
}

/**
 * Every word of the answer has one filling.
 *
 * Checked word by word rather than on the phrase as a whole, because that is
 * how a solver reads it: they meet "FR__ T_M_" as two blanked words, and a
 * second reading of either half is a second reading of the row.
 */
export function hasUniqueAnswerFill(
  answer: string,
  index: VowelPatternIndex = loadVowelPatternIndex(),
): boolean {
  return answerWords(answer).every((word) => hasUniqueVowelFill(word, index))
}
