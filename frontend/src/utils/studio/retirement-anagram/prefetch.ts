import { generateRetirementAnagram } from '@/api/studio-retirement-anagram.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { RetirementAnagramResponse } from '@/types/studio-retirement-anagram.types'
import {
  CANDIDATE_OVERREQUEST,
  CUSTOM_TOPIC_MAX_LENGTH,
  RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE,
  clampItemCount,
  parseDifficulty,
  resolveTopicPrompt,
  selectAiWords,
  topicLabel,
} from './content'

/** Spec: retry AI once with a different variety seed if the first pass is short. */
const MAX_AI_ATTEMPTS = 2

/**
 * AI-only prefetch — no animal / bundled theme fallback.
 * Retries once, then fails visibly.
 */
export async function retirementAnagramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<RetirementAnagramResponse> {
  const need = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const topic = resolveTopicPrompt(config).slice(0, CUSTOM_TOPIC_MAX_LENGTH)
  const label = topicLabel(config) || topic
  const varietyKey = studioVarietyKey('retirement-anagram', label, difficulty)
  const seed = Number(config.seed ?? 1)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateRetirementAnagram(
        {
          topic,
          itemCount: need,
          difficulty,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const items = selectAiWords(remote.items, { count: need, difficulty })
      if (items.length >= need) {
        rememberStudioContent(varietyKey, items)
        return { items }
      }
      rejected.push(...items)
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[retirement-anagram] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE)
}

/** Exposed for tests — confirms we still over-request on the wire via backend. */
export function candidateRequestCount(itemCount: number): number {
  return itemCount + CANDIDATE_OVERREQUEST
}
