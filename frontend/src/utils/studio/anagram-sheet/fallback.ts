import type { AnagramResponse } from '@/types/studio-anagram.types'
import fallbackItems from '@/data/studio/anagram/fallback.json'
import { createRng } from '../studio-rng'
import { loadThemeWords } from '../word-search/wordlists'
import {
  lengthRangeFor,
  sampleUniqueWords,
  type AnagramDifficulty,
} from './words'

interface FallbackItem {
  word: string
  hint: string
}

const ENTRIES = fallbackItems as FallbackItem[]

/** Bundled themed words + hints when the AI endpoint is unavailable. */
export function resolveAnagramFallback(
  itemCount: number,
  difficulty: AnagramDifficulty,
  seed: number,
): AnagramResponse {
  const rng = createRng(seed || 1)
  const { min, max } = lengthRangeFor(difficulty)
  const preferred = ENTRIES.filter((entry) => {
    const word = entry.word.toUpperCase().replace(/[^A-Z]/g, '')
    return word.length >= min && word.length <= max
  }).map((entry) => entry.word)
  const catalog = loadThemeWords('animals').filter((word) => {
    const cleaned = word.toUpperCase().replace(/[^A-Z]/g, '')
    return cleaned.length >= min && cleaned.length <= max
  })
  const words = sampleUniqueWords([...preferred, ...catalog], itemCount, rng)

  return {
    items: words.map((word) => ({ word, hint: '' })),
  }
}
