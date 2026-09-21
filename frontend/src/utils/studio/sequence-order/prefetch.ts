import { generateSequences } from '@/api/studio-sequence.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig, StudioConfigValidationError } from '@/types/studio-template.types'
import type {
  SequenceRequest,
  SequenceResponse,
  SequenceType,
} from '@/types/studio-sequence.types'
import { resolveSequenceFallback } from './fallback'

const THEME_MAX_LENGTH = 120
/** One study + recall pair per generate (Number of exercises removed from UI). */
const DEFAULT_SEQUENCE_COUNT = 1

function asType(value: unknown): SequenceType {
  if (
    value === 'steps' ||
    value === 'story' ||
    value === 'everyday' ||
    value === 'arbitrary'
  ) {
    return value
  }
  return 'arbitrary'
}

export function isCustomSequenceTheme(config: StudioConfig): boolean {
  return config.customTheme === true
}

export function resolveCustomTheme(config: StudioConfig): string | undefined {
  if (!isCustomSequenceTheme(config)) return undefined
  const custom = String(config.customThemeText ?? '')
    .trim()
    .slice(0, THEME_MAX_LENGTH)
  return custom || undefined
}

export function validateSequenceOrderConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (!isCustomSequenceTheme(config)) return null
  const text = String(config.customThemeText ?? '').trim()
  if (!text) {
    return {
      field: 'customThemeText',
      message: 'Enter a custom theme, or turn off Custom theme.',
    }
  }
  if (text.length > THEME_MAX_LENGTH) {
    return {
      field: 'customThemeText',
      message: `Keep the custom theme under ${THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}

function toRequest(config: StudioConfig): SequenceRequest {
  const theme = resolveCustomTheme(config)
  return {
    // Custom themes still use the arbitrary generator shape + theme hint.
    sequenceType: isCustomSequenceTheme(config) ? 'arbitrary' : asType(config.sequenceType),
    itemCount: Math.min(8, Math.max(4, Number(config.itemCount ?? 5))),
    sequenceCount: Math.min(
      40,
      Math.max(1, Number(config.pagePairCount ?? DEFAULT_SEQUENCE_COUNT)),
    ),
    theme,
    seed: Number(config.seed ?? 1),
  }
}

export async function sequenceOrderPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<SequenceResponse> {
  const req = toRequest(config)
  const varietyKey = studioVarietyKey('sequence-order', req.sequenceType, req.theme ?? '')

  // Always AI by default; curated bank only tops up / covers API failures.
  try {
    const remote = await generateSequences(
      { ...req, avoid: studioAvoidList(varietyKey) },
      signal,
    )
    // Arbitrary lists carry no title — their first item names the set well enough.
    rememberStudioContent(
      varietyKey,
      remote.sequences.map((set) => set.title ?? set.items[0]?.text ?? ''),
    )
    return remote
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[sequence-order] API failed; using curated fallback', error)
    return resolveSequenceFallback(
      req.sequenceType,
      req.itemCount,
      req.sequenceCount,
      req.seed,
    )
  }
}
