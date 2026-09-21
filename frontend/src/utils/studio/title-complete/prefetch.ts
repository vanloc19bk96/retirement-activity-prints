import { generateTitleComplete } from '@/api/studio-title-complete.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  TitleCompleteDifficulty,
  TitleCompleteRequest,
  TitleCompleteResponse,
} from '@/types/studio-title-complete.types'
import { resolveCategory, resolveFallbackCategory } from './category'
import { resolveEra } from './era'
import { loadCuratedBank } from './fallback'

function asDifficulty(value: unknown): TitleCompleteDifficulty {
  // Legacy 'challenging' (two blanks) overflowed the safe area — coerce to standard.
  return value === 'easy' ? 'easy' : 'standard'
}

function toRequest(config: StudioConfig): TitleCompleteRequest {
  return {
    category: resolveCategory(config),
    era: resolveEra(config),
    difficulty: asDifficulty(config.difficulty),
    itemCount: Math.min(20, Math.max(6, Number(config.itemCount ?? 12))),
    seed: Number(config.seed ?? 1),
  }
}

export async function titleCompletePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<TitleCompleteResponse> {
  const itemCount = Math.min(20, Math.max(6, Number(config.itemCount ?? 12)))
  const curated = () =>
    loadCuratedBank({
      category: resolveFallbackCategory(config),
      era: resolveEra(config),
      itemCount,
      seed: config.seed,
    })

  const req = toRequest(config)
  const varietyKey = studioVarietyKey(
    'title-complete',
    req.category,
    req.era,
    req.difficulty,
  )

  try {
    const remote = await generateTitleComplete(
      { ...req, avoid: studioAvoidList(varietyKey) },
      signal,
    )
    const remoteItems = remote.items ?? []
    rememberStudioContent(
      varietyKey,
      remoteItems.map((item) => item.fullTitle),
    )
    if (remoteItems.length >= itemCount) return remote
    const seen = new Set(remoteItems.map((item) => item.fullTitle.toLowerCase()))
    const extras = curated().items.filter((item) => !seen.has(item.fullTitle.toLowerCase()))
    return { items: [...remoteItems, ...extras].slice(0, itemCount) }
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[title-complete] API failed; using curated fallback', error)
    return curated()
  }
}
