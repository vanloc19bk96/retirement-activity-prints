import { generateWordLadderPairs } from '@/api/studio-word-ladder.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  WordLadderRequest,
  WordLadderResponse,
} from '@/types/studio-word-ladder.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  maxLaddersFor,
  parseLaddersPerPage,
  parseSteps,
  parseTheme,
  parseWordLength,
} from './config'

/**
 * Candidates per ladder.
 *
 * Most pairs the model returns cannot be walked in exactly the requested number
 * of moves — that is a fact about the dictionary, not a fault in the answer — so
 * the sheet asks for several times what it prints and keeps the ones that work.
 */
const CANDIDATES_PER_LADDER = 4
/** Server ceiling (`WordLadderRequest.pair_count`). */
const MAX_PAIRS = 12

export function wordLadderPairCount(config: StudioConfig): number {
  const wanted = Math.min(
    parseLaddersPerPage(config.laddersPerPage),
    maxLaddersFor(parseWordLength(config.wordLength)),
  )
  return Math.min(MAX_PAIRS, Math.max(2, wanted * CANDIDATES_PER_LADDER))
}

/**
 * Themed end words for one sheet.
 *
 * A miss never costs the reader a page: the bundled word list still builds every
 * ladder the sheet needs, so a failed call degrades to untethered words rather
 * than to an error. That is why nothing here rethrows except an abort.
 */
export async function wordLadderPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<WordLadderResponse> {
  const theme = parseTheme(config)
  const wordLength = parseWordLength(config.wordLength)
  const steps = parseSteps(config.steps)
  const varietyKey = studioVarietyKey('word-ladder', theme, `${wordLength}|${steps}`)

  const req: WordLadderRequest = {
    theme,
    wordLength,
    steps,
    pairCount: wordLadderPairCount(config),
    seed: Number(config.seed ?? 1),
    avoid: studioAvoidList(varietyKey),
  }

  try {
    const remote = await generateWordLadderPairs(req, signal)
    const pairs = remote.pairs ?? []
    rememberStudioContent(
      varietyKey,
      pairs.flatMap((pair) => [pair.start, pair.target]),
    )
    return { pairs }
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[word-ladder] AI pairs failed; using the bundled word list', error)
    return { pairs: [] }
  }
}
