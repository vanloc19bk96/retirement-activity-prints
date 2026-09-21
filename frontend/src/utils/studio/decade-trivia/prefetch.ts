import { generateTrivia } from '@/api/studio-decade-trivia.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  DecadeTriviaDifficulty,
  DecadeTriviaFormat,
  DecadeTriviaRequest,
  DecadeTriviaResponse,
} from '@/types/studio-decade-trivia.types'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  clearStudioTextMetricsCache,
  ensureExactMeasurement,
  isExactMeasurement,
} from '../studio-text-metrics'
import {
  clampQuestionCount,
  resolveTopics,
  validateDecadeTriviaConfig,
} from './config'
import { resolveDecade } from './decade'

function asFormat(value: unknown): DecadeTriviaFormat {
  if (
    value === 'multiple-choice' ||
    value === 'short-answer' ||
    value === 'fill-blank' ||
    value === 'mixed'
  ) {
    return value
  }
  return 'multiple-choice'
}

function asDifficulty(value: unknown): DecadeTriviaDifficulty {
  return value === 'easy' || value === 'challenging' ? value : 'standard'
}

export function toDecadeTriviaRequest(config: StudioConfig): DecadeTriviaRequest {
  return {
    decade: resolveDecade(config),
    topics: resolveTopics(config),
    format: asFormat(config.format),
    difficulty: asDifficulty(config.difficulty),
    questionCount: clampQuestionCount(config.questionCount),
    seed: Number(config.seed ?? 1),
  }
}

/**
 * The layout measures glyphs with the page font, so it has to be loaded before
 * `generate` runs — otherwise the first page is wrapped on fallback metrics and
 * re-wraps once the real face arrives. Prefetch is the only async step before
 * layout, so the font load belongs here.
 */
async function preloadLayoutFont(config: StudioConfig): Promise<void> {
  const family = String(config.fontFamily ?? STUDIO_DEFAULT_FONT).trim()
  if (!family) return
  const spec = { fontFamily: family }
  if (isExactMeasurement(spec)) return
  try {
    await ensureFontFamilyLoaded(family)
  } catch {
    // Fall through: ensureExactMeasurement still gets a chance to fetch it.
  }
  // ensureFontFamilyLoaded resolves when the stylesheet lands, not when the
  // face does. Without this the layout measures a fallback font, and Fabric
  // re-measures the real one at render time — the two disagree and the page
  // comes out wrapped differently from the plan.
  clearStudioTextMetricsCache()
  await ensureExactMeasurement(spec)
}

export async function decadeTriviaPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<DecadeTriviaResponse> {
  // `validateConfig` runs after prefetch, so guard here too — an empty topic
  // selection must never reach the API and come back as a default-topic page.
  const invalid = validateDecadeTriviaConfig(config)
  if (invalid) throw new Error(invalid.message)

  await preloadLayoutFont(config)
  const req = toDecadeTriviaRequest(config)
  const varietyKey = studioVarietyKey(
    'decade-trivia',
    req.decade,
    req.topics.join(','),
    req.format,
    req.difficulty,
  )
  const remote = await generateTrivia(
    { ...req, avoid: studioAvoidList(varietyKey) },
    signal,
  )
  rememberStudioContent(
    varietyKey,
    remote.items.map((item) => item.question),
  )
  return remote
}
