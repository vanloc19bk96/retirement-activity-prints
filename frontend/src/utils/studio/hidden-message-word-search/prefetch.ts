import { generateHiddenMessage } from '@/api/studio-hidden-message.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { HiddenMessageResponse } from '@/types/studio-hidden-message.types'
import {
  HIDDEN_MESSAGE_AI_EMPTY_MESSAGE,
  parseCustomMessage,
  parseDifficulty,
  parsePrintStyle,
  parseTheme,
  parseTone,
  validatePayload,
} from './content'
import { tryBuildHiddenMessagePuzzle } from './place'
import { filterUnsafeThemeCopy } from '../crossword/content-quality'

const MAX_AI_ATTEMPTS = 3

export async function hiddenMessagePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<HiddenMessageResponse> {
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const tone = parseTone(config.tone)
  const themeRaw = parseTheme(config.theme)
  const theme = filterUnsafeThemeCopy(themeRaw) ?? themeRaw
  const custom = parseCustomMessage(config.customMessage)
  const varietyKey = studioVarietyKey(
    'hidden-message-word-search',
    theme || 'default',
    tone,
    difficulty,
    printStyle,
  )
  const seed = Number(config.seed ?? 1)
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateHiddenMessage(
        {
          theme,
          tone,
          difficulty,
          seed: seed + attempt * 97,
          ...(custom ? { customMessage: custom.display } : {}),
          avoid: studioAvoidList(varietyKey),
        },
        signal,
      )
      const validated = validatePayload(remote, difficulty, custom?.display, printStyle)
      if (!validated) {
        lastError = new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
        continue
      }
      const puzzle = tryBuildHiddenMessagePuzzle({
        message: validated.message,
        words: validated.words,
        difficulty,
        seed,
        printStyle,
      })
      if (!puzzle) {
        lastError = new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
        continue
      }
      rememberStudioContent(varietyKey, [validated.message.display, ...puzzle.displays])
      return {
        message: validated.message.display,
        words: validated.words.map((entry) => entry.display),
      }
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[hidden-message-word-search] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(HIDDEN_MESSAGE_AI_EMPTY_MESSAGE)
}
