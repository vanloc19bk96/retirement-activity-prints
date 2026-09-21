import type { CategoryFluencyResponse } from '@/types/studio-category-fluency.types'
import fallbackCategories from '@/data/studio/category-fluency/fallback.json'
import { createRng } from '../studio-rng'

interface FallbackEntry {
  category: string
  examples: string[]
}

const ENTRIES = fallbackCategories as FallbackEntry[]

function clampExampleCount(lineCount: number): number {
  const n = Math.round(lineCount)
  if (!Number.isFinite(n)) return 15
  return Math.min(30, Math.max(8, n))
}

function takeUnique(sources: string[][], count: number): string[] {
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

function catalogExamples(preferredCategory?: string): string[] {
  const needle = preferredCategory?.trim().toLowerCase()
  const matched = needle
    ? ENTRIES.filter((entry) => entry.category.trim().toLowerCase() === needle)
    : []
  const rest = ENTRIES.filter((entry) => !matched.includes(entry))
  return [...matched, ...rest].flatMap((entry) => entry.examples)
}

/** Fill sample answers to lineCount from the grocery-style bundled catalog. */
export function assembleCategoryExamples(
  preferred: string[] | undefined,
  lineCount: number,
  seed: number,
  category?: string,
): string[] {
  const count = clampExampleCount(lineCount)
  const extras = createRng(seed || 1).shuffle(catalogExamples(category))
  return takeUnique([preferred ?? [], extras], count)
}

/** Bundled category + examples when the API is unavailable. */
export function resolveCategoryFallback(
  seed: number,
  lineCount: number,
): CategoryFluencyResponse {
  const entry = ENTRIES[Math.abs(seed) % ENTRIES.length]!
  return {
    category: entry.category,
    examples: assembleCategoryExamples(entry.examples, lineCount, seed, entry.category),
  }
}
