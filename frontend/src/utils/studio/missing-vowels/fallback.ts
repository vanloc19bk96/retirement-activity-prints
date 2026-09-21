import type { MissingVowelsResponse } from '@/types/studio-missing-vowels.types'
import { createRng, type StudioRng } from '../studio-rng'
import { loadThemeWords } from '../word-search/wordlists'
import { lengthRangeFor, type MvDifficulty } from './content'
import fallbackItems from '@/data/studio/missing-vowels/fallback.json'

const ENTRIES = fallbackItems as string[]

function normalizeEntry(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function takeUnique(source: string[], count: number, rng: StudioRng): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of rng.shuffle(source)) {
    const word = normalizeEntry(raw)
    if (!word || seen.has(word)) continue
    seen.add(word)
    out.push(word)
    if (out.length >= count) break
  }
  return out
}

/** Bundled words/phrases when the AI endpoint is unavailable. */
export function resolveMissingVowelsFallback(
  itemCount: number,
  kind: 'words' | 'phrases',
  difficulty: MvDifficulty,
  seed: number,
): MissingVowelsResponse {
  const rng: StudioRng = createRng(seed || 1)
  const wantPhrases = kind === 'phrases'
  const { min, max } = lengthRangeFor(difficulty)

  const bundled = ENTRIES.filter((raw) => {
    const cleaned = normalizeEntry(raw)
    const isPhrase = cleaned.includes(' ')
    if (wantPhrases !== isPhrase) return false
    if (isPhrase) return true
    return cleaned.length >= min && cleaned.length <= max
  })

  const catalog = wantPhrases
    ? []
    : loadThemeWords('animals').filter((word) => {
        const cleaned = word.toUpperCase().replace(/[^A-Z]/g, '')
        return cleaned.length >= min && cleaned.length <= max
      })

  return { items: takeUnique([...bundled, ...catalog], itemCount, rng) }
}
