import { generateFirstLetterExamples } from '@/api/studio-first-letter-recall.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { FirstLetterRecallResponse } from '@/types/studio-first-letter-recall.types'
import { clampLineCount, resolveLetters } from './draw'
import { assembleFirstLetterExamples, resolveFirstLetterFallback } from './fallback'

export async function firstLetterRecallPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<FirstLetterRecallResponse> {
  const seed = Number(config.seed ?? 1)
  const letters = resolveLetters(config, seed)
  const lineCount = clampLineCount(config.lineCount)
  const varietyKey = studioVarietyKey('first-letter-recall', letters.join(''))

  try {
    const remote = await generateFirstLetterExamples(
      {
        letters,
        lineCount,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    const byLetter: Record<string, string[]> = {}
    for (const letter of letters) {
      byLetter[letter] = assembleFirstLetterExamples(
        remote.byLetter?.[letter],
        letter,
        seed,
        lineCount,
      )
    }
    rememberStudioContent(varietyKey, Object.values(byLetter).flat())
    return { byLetter }
  } catch (error) {
    if (signal.aborted) throw error
    // Offline / API outage: still produce a valid printable page.
    console.warn('[first-letter-recall] API failed; using bundled fallback', error)
    return resolveFirstLetterFallback(letters, seed, lineCount)
  }
}
