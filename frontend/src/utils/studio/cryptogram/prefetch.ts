import { generateCryptogram } from '@/api/studio-cryptogram.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  CryptogramRequest,
  CryptogramResponse,
} from '@/types/studio-cryptogram.types'
import {
  clampPuzzleCount,
  CUSTOM_THEME_MAX_LENGTH,
  parseLength,
  resolveThemePrompt,
} from './content'

/**
 * Fresh sayings for one page. A failed call is swallowed so the generator can
 * fall back to the bundled bank instead of blocking the user.
 */
export async function cryptogramPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CryptogramResponse | undefined> {
  const theme = resolveThemePrompt(config).slice(0, CUSTOM_THEME_MAX_LENGTH)

  const length = parseLength(config.length)
  const varietyKey = studioVarietyKey('cryptogram', theme, length)
  const req: CryptogramRequest = {
    theme,
    itemCount: clampPuzzleCount(config.puzzleCount),
    length,
    seed: Number(config.seed ?? 1),
    avoid: studioAvoidList(varietyKey),
  }

  try {
    const remote = await generateCryptogram(req, signal)
    rememberStudioContent(varietyKey, remote.items)
    return remote
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[cryptogram] API failed; using bundled sayings', error)
    return undefined
  }
}
