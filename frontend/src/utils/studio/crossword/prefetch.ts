import { generateCrosswordClues } from '@/api/studio-crossword.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import { parseCrosswordLevel, type CrosswordLevel } from './levels'
import { resolveCrosswordTheme } from './theme'
import {
  filterUnsafeThemeCopy,
  isValidClueText,
  normalizeAnswerDisplay,
} from './content-quality'
import { selectCrosswordCandidates } from './candidate-selector'
import type { CrosswordPair } from './types'

export const CROSSWORD_AI_EMPTY_MESSAGE =
  "We couldn't write enough clear crossword clues for this theme. Try again, or pick a broader retirement theme."

const MAX_AI_ATTEMPTS = 3

/**
 * Ask for far more answers than the grid needs.
 *
 * The packer drops any answer that will not interlock, so a pool the size of
 * the target produces a thin grid whenever two or three words share no letters
 * with the rest. Oversampling is cheap — it is one field in the same request.
 */
export function candidatePoolSize(targetCount: number): number {
  return Math.max(Math.ceil(targetCount * 2.5), targetCount + 12)
}

function pairsFromAiClues(
  items: { word: string; clue: string }[],
  level: CrosswordLevel,
): CrosswordPair[] {
  const seen = new Set<string>()
  const out: CrosswordPair[] = []
  for (const item of items) {
    const normalized = normalizeAnswerDisplay(item.word)
    if (!normalized) continue
    const { token } = normalized
    if (token.length < level.minLetters || token.length > level.maxLetters) continue
    if (seen.has(token)) continue
    const clue = String(item.clue ?? '').trim()
    if (!isValidClueText(clue, token, level.clueMaxChars)) continue
    seen.add(token)
    out.push({ word: token, clue })
  }
  return out
}

/**
 * AI-only: there is no bundled answer pool behind this.
 *
 * A packaged word list would make every seller's book draw on the same few
 * hundred answers, which is the fastest way to two KDP titles that look
 * copied from each other. Retrying with an avoid list and then failing
 * visibly is the honest alternative.
 */
export async function crosswordPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CrosswordPair[]> {
  const seed = Number(config.seed ?? 1)
  const level = parseCrosswordLevel(config)
  const theme = resolveCrosswordTheme(config, seed)
  // The page may print fewer than the level's target; asking for the target
  // keeps the pool generous either way.
  const targetCount = level.targetAnswers
  const poolSize = candidatePoolSize(targetCount)

  const promptTheme = filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt
  const varietyKey = studioVarietyKey('crossword', theme.label || promptTheme, level.id)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const response = await generateCrosswordClues(
        {
          theme: promptTheme,
          itemCount: poolSize,
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          difficulty: level.apiDifficulty,
          maxClueChars: level.clueMaxChars,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const pairs = selectCrosswordCandidates(
        pairsFromAiClues(response.clues, level),
        targetCount,
      )
      if (pairs.length >= Math.max(4, Math.ceil(targetCount * 0.75))) {
        rememberStudioContent(
          varietyKey,
          pairs.map((pair) => pair.word),
        )
        return pairs
      }
      rejected.push(...pairs.map((pair) => pair.word))
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[crossword] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(CROSSWORD_AI_EMPTY_MESSAGE)
}
