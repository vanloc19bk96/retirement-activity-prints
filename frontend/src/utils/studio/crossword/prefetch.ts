import { generateCrosswordClues } from '@/api/studio-crossword.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  crosswordThemeLabel,
  isCustomAiTheme,
  isCustomWords,
  letterBoundsForDifficulty,
  lengthHintClue,
  mergeClues,
  parseDifficulty,
  parseWordCount,
  candidatePoolSize,
  resolveCustomThemeText,
  resolveWordsAndClues,
  sanitizeCustomPairs,
} from './words'
import type { CrosswordPair } from './types'

function pairsFromAiClues(
  items: { word: string; clue: string }[],
): CrosswordPair[] {
  const seen = new Set<string>()
  const out: CrosswordPair[] = []
  for (const item of items) {
    const word = item.word.toUpperCase().replace(/[^A-Z]/g, '')
    const clue = String(item.clue ?? '').trim()
    if (word.length < 3 || word.length > 12 || !clue) continue
    if (seen.has(word)) continue
    if (clue.toUpperCase().includes(word)) continue
    seen.add(word)
    out.push({ word, clue })
  }
  return out
}

function resolveThemePhrase(config: StudioConfig): string {
  if (isCustomAiTheme(config)) {
    return resolveCustomThemeText(config) || 'everyday objects'
  }
  const key = String(config.theme ?? 'animals')
  return crosswordThemeLabel(key)
}

/**
 * Always ask AI for crossword content:
 * - theme modes → words + clues in one call
 * - custom words → clues for the typed answers (keeps user-supplied clues)
 * Bundled theme lists are offline fallback only.
 */
export async function crosswordPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<CrosswordPair[]> {
  const seed = Number(config.seed ?? 1)
  const rng = createRng(seed)
  const difficulty = parseDifficulty(config.difficulty)
  const bounds = letterBoundsForDifficulty(difficulty)
  const wordCount = parseWordCount(config.wordCount)

  if (isCustomWords(config)) {
    const custom = sanitizeCustomPairs(config.words)
    if (custom.length === 0) return custom

    const needsAi = custom.some((p) => !p.clue)
    if (!needsAi) {
      return custom.map((p) => ({ word: p.word, clue: p.clue }))
    }

    try {
      const response = await generateCrosswordClues(
        {
          words: custom.map((p) => p.word),
          difficulty,
          seed,
        },
        signal,
      )
      const merged = mergeClues(custom, response.clues)
      return merged.map((p) => ({
        word: p.word,
        clue: p.clue || lengthHintClue(p.word),
      }))
    } catch (error) {
      if (signal.aborted) throw error
      console.warn('[crossword] AI clues failed; using typed/length-hint clues', error)
      return custom.map((p) => ({
        word: p.word,
        clue: p.clue || lengthHintClue(p.word),
      }))
    }
  }

  // Only theme mode can repeat itself; custom words are the author's own.
  const themePhrase = resolveThemePhrase(config)
  const varietyKey = studioVarietyKey('crossword', themePhrase, difficulty)

  try {
    const response = await generateCrosswordClues(
      {
        theme: themePhrase,
        itemCount: candidatePoolSize(wordCount),
        minLetters: bounds.min,
        maxLetters: bounds.max,
        difficulty,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    const pairs = pairsFromAiClues(response.clues).slice(0, candidatePoolSize(wordCount))
    if (pairs.length >= 4) {
      rememberStudioContent(
        varietyKey,
        pairs.map((pair) => pair.word),
      )
      return pairs
    }
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[crossword] AI theme content failed; using bundled theme', error)
  }

  return resolveWordsAndClues(
    { ...config, customTheme: false, source: 'theme' },
    rng,
  )
}
