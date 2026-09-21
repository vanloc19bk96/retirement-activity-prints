import { generateCrosswordClues } from '@/api/studio-crossword.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import {
  aiThemeLabel,
  candidatePoolSize,
  clueMaxChars,
  letterBoundsForDifficulty,
  parseAnswerCount,
  parsePrintStyle,
  parseRetirementDifficulty,
  resolveAiThemePrompt,
  toApiDifficulty,
} from './config'
import {
  filterUnsafeThemeCopy,
  isValidClueText,
  normalizeAnswerDisplay,
} from './content-quality'
import { selectCrosswordCandidates } from './candidate-selector'
import type { CrosswordPair } from './types'

export const CROSSWORD_AI_EMPTY_MESSAGE =
  "We couldn't create enough high-quality crossword content for this theme. Try again or choose a broader retirement theme."

const MAX_AI_ATTEMPTS = 3

function pairsFromAiClues(
  items: { word: string; clue: string }[],
  options: { minLetters: number; maxLetters: number; maxClueChars: number },
): CrosswordPair[] {
  const seen = new Set<string>()
  const out: CrosswordPair[] = []
  for (const item of items) {
    const normalized = normalizeAnswerDisplay(item.word)
    if (!normalized) continue
    const { token } = normalized
    if (token.length < options.minLetters || token.length > options.maxLetters) continue
    if (seen.has(token)) continue
    const clue = String(item.clue ?? '').trim()
    if (!isValidClueText(clue, token, options.maxClueChars)) continue
    seen.add(token)
    out.push({ word: token, clue })
  }
  return out
}

/**
 * AI-only prefetch — no bundled theme fallback, no length-hint clues.
 * Retries up to 3 times with avoid lists, then fails visibly.
 */
export async function crosswordPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CrosswordPair[]> {
  const seed = Number(config.seed ?? 1)
  const difficulty = parseRetirementDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const bounds = letterBoundsForDifficulty(difficulty)
  const targetCount = parseAnswerCount(config.answerCount ?? config.wordCount, difficulty, printStyle)
  const poolSize = candidatePoolSize(targetCount)
  const maxClueChars = clueMaxChars(difficulty)

  const themeRaw = resolveAiThemePrompt(config)
  const theme = filterUnsafeThemeCopy(themeRaw) ?? themeRaw
  const label = aiThemeLabel(config) || theme
  const varietyKey = studioVarietyKey('crossword', label, difficulty)

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const response = await generateCrosswordClues(
        {
          theme,
          itemCount: poolSize,
          minLetters: bounds.min,
          maxLetters: bounds.max,
          difficulty: toApiDifficulty(difficulty),
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )
      const pairs = selectCrosswordCandidates(
        pairsFromAiClues(response.clues, {
          minLetters: bounds.min,
          maxLetters: bounds.max,
          maxClueChars,
        }),
        targetCount,
      )
      if (pairs.length >= Math.max(4, Math.ceil(targetCount * 0.75))) {
        rememberStudioContent(
          varietyKey,
          pairs.map((pair) => pair.word),
        )
        return pairs
      }
      rejected.push(...pairs.map((p) => p.word))
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
