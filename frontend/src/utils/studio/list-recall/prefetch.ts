import { generateList } from '@/api/studio-list.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { ListRecallRequest, ListRecallResponse } from '@/types/studio-list.types'
import {
  assembleListRecall,
  resolveListFallback,
  snapDistractorCountToFullRows,
} from './fallback'

const THEME_MAX_LENGTH = 120

function asDifficulty(value: unknown): ListRecallRequest['distractorDifficulty'] {
  return value === 'easy' || value === 'challenging' ? value : 'standard'
}

function asCategory(value: unknown): ListRecallRequest['category'] {
  return value === 'produce' || value === 'pantry' || value === 'household'
    ? value
    : 'mixed'
}

function resolveTheme(config: StudioConfig): string | undefined {
  if (config.customTheme !== true) return undefined
  const custom = String(config.customThemeText ?? '')
    .trim()
    .slice(0, THEME_MAX_LENGTH)
  return custom || undefined
}

export async function listRecallPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<ListRecallResponse> {
  const listLength = Number(config.listLength ?? 8)
  const distractorCount = snapDistractorCountToFullRows(
    listLength,
    Number(config.distractorCount ?? 10),
  )
  const category = asCategory(config.category)
  const theme = resolveTheme(config)
  const seed = Number(config.seed ?? 1)

  const catalogCategory = theme ? 'mixed' : category
  const difficulty = asDifficulty(config.distractorDifficulty)
  // Same theme + decoy difficulty is what returns the same eight items.
  const varietyKey = studioVarietyKey('list-recall', theme ?? catalogCategory, difficulty)

  try {
    const remote = await generateList(
      {
        listLength,
        distractorCount,
        distractorDifficulty: difficulty,
        category: catalogCategory,
        theme,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    rememberStudioContent(varietyKey, remote.targets)
    return assembleListRecall({
      category: catalogCategory,
      listLength,
      distractorCount,
      seed,
      preferredTargets: remote.targets,
      preferredDecoys: remote.options.filter((item) => !item.isTarget),
    })
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[list-recall] API failed; using bundled fallback', error)
    return resolveListFallback(catalogCategory, listLength, distractorCount, seed)
  }
}
