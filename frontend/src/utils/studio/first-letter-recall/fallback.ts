import type { FirstLetterRecallResponse } from '@/types/studio-first-letter-recall.types'
import fallbackByLetter from '@/data/studio/first-letter-recall/fallback.json'
import { createRng } from '../studio-rng'
import { listThemeMeta, loadThemeWords } from '../word-search/wordlists'

const POOL = fallbackByLetter as Record<string, string[]>
const MIN_EXAMPLES = 8
const MAX_EXAMPLES = 30

function clampExampleCount(lineCount: number): number {
  return Math.min(MAX_EXAMPLES, Math.max(MIN_EXAMPLES, Math.round(lineCount)))
}

function catalogWordsForLetter(letter: string): string[] {
  const prefix = letter.toUpperCase()
  const seen = new Set<string>()
  const out: string[] = []
  for (const meta of listThemeMeta()) {
    for (const word of loadThemeWords(meta.key)) {
      if (!word.startsWith(prefix)) continue
      const key = word.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(word.toLowerCase())
    }
  }
  return out
}

function takeUniqueWords(sources: string[][], count: number): string[] {
  const used = new Set<string>()
  const out: string[] = []
  for (const source of sources) {
    for (const raw of source) {
      const word = raw.trim()
      const key = word.toLowerCase()
      if (!word || used.has(key)) continue
      used.add(key)
      out.push(word)
      if (out.length >= count) return out
    }
  }
  return out
}

function wordsForLetter(letter: string, seed: number, lineCount: number): string[] {
  const count = clampExampleCount(lineCount)
  const pool = (POOL[letter] ?? POOL.F ?? []).map((w) => w.trim()).filter(Boolean)
  const rng = createRng(seed + letter.charCodeAt(0) * 31)
  return takeUniqueWords(
    [rng.shuffle(pool), rng.shuffle(catalogWordsForLetter(letter))],
    count,
  )
}

/** Merge a short API list with the bundled catalog so lineCount still fills. */
export function assembleFirstLetterExamples(
  preferred: string[] | undefined,
  letter: string,
  seed: number,
  lineCount: number,
): string[] {
  const count = clampExampleCount(lineCount)
  const fallback = wordsForLetter(letter, seed, lineCount)
  return takeUniqueWords([preferred ?? [], fallback], count)
}

/** Bundled sample words when the API is unavailable. */
export function resolveFirstLetterFallback(
  letters: string[],
  seed: number,
  lineCount: number,
): FirstLetterRecallResponse {
  const byLetter: Record<string, string[]> = {}
  for (const letter of letters) {
    byLetter[letter] = wordsForLetter(letter, seed, lineCount)
  }
  return { byLetter }
}
