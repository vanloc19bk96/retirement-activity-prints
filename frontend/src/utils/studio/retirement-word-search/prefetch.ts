import { generateWordSearchWords } from '@/api/studio-word-search.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { WordSearchResponse } from '@/types/studio-word-search.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import { filterUnsafeThemeCopy } from '../crossword/content-quality'
import { resolveWordSearchTheme } from './config'
import {
  WORD_SEARCH_BUILD_ERROR,
  parseDifficulty,
  parsePrintStyle,
  parseShape,
  parseTone,
  validatePayload,
} from './content'
import { tryBuildClassicWordSearch } from './place'

const MAX_AI_ATTEMPTS = 3

export async function retirementWordSearchPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<WordSearchResponse> {
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const shape = parseShape(config.shape)
  const tone = parseTone(config.tone)
  const themeRaw = resolveWordSearchTheme(config)
  const theme = filterUnsafeThemeCopy(themeRaw) ?? themeRaw
  const seed = Number(config.seed ?? 1)
  const locale = String(config.locale ?? 'en')
  const varietyKey = studioVarietyKey(
    'word-search',
    theme || 'default',
    tone,
    difficulty,
    printStyle,
    shape,
  )
  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    const attemptSeed = seed + attempt * 97
    try {
      const remote = await generateWordSearchWords(
        {
          theme,
          tone,
          difficulty,
          printStyle,
          seed: attemptSeed,
          avoid: studioAvoidList(varietyKey),
          locale,
        },
        signal,
      )
      const entries = validatePayload(remote, difficulty, printStyle)
      if (!entries) {
        continue
      }
      const puzzle = tryBuildClassicWordSearch({
        entries,
        difficulty,
        printStyle,
        shape,
        seed,
      })
      if (!puzzle) {
        continue
      }
      rememberStudioContent(varietyKey, puzzle.displays)
      return { words: entries.map((entry) => entry.display) }
    } catch (error) {
      if (signal.aborted) throw error
      console.warn(`[word-search] AI attempt ${attempt + 1} failed`, error)
    }
  }
  throw new Error(WORD_SEARCH_BUILD_ERROR)
}

export const WORD_SEARCH_AI_EMPTY_MESSAGE = WORD_SEARCH_BUILD_ERROR
