import { generateCategory } from '@/api/studio-category-fluency.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  CategoryFluencyRequest,
  CategoryFluencyResponse,
} from '@/types/studio-category-fluency.types'
import { clampLineCount } from './draw'
import { assembleCategoryExamples, resolveCategoryFallback } from './fallback'

const HINT_MAX_LENGTH = 120

function asDifficulty(value: unknown): CategoryFluencyRequest['difficulty'] {
  return value === 'easy' || value === 'hard' ? value : 'standard'
}

export async function categoryFluencyPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CategoryFluencyResponse> {
  const hint = String(config.categoryHint ?? '')
    .trim()
    .slice(0, HINT_MAX_LENGTH)
  const seed = Number(config.seed ?? 1)
  const lineCount = clampLineCount(config.lineCount)
  const difficulty = asDifficulty(config.difficulty)
  const varietyKey = studioVarietyKey('category-fluency', hint, difficulty)

  try {
    const remote = await generateCategory(
      {
        difficulty,
        categoryHint: hint || undefined,
        lineCount,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    // The picked category is the repeat a reader notices, not its members.
    rememberStudioContent(varietyKey, [remote.category])
    return {
      category: remote.category,
      examples: assembleCategoryExamples(
        remote.examples,
        lineCount,
        seed,
        remote.category,
      ),
    }
  } catch (error) {
    if (signal.aborted) throw error
    // Offline / API outage: still produce a valid printable page.
    console.warn('[category-fluency] API failed; using bundled fallback', error)
    return resolveCategoryFallback(seed, lineCount)
  }
}
