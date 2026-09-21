import { generateThemeWords } from '@/api/studio-theme-words.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  ThemeWordsRequest,
  ThemeWordsResponse,
} from '@/types/studio-theme-words.types'
import {
  MIN_WORD_LETTERS,
  aiThemeLabel,
  parseGridSize,
  parsePrintStyle,
  parseRetirementDifficulty,
  parseWordCount,
  retirementMaxLetters,
  resolveAiThemePrompt,
} from './config'
import { filterSafeWordLines, filterUnsafeThemeCopy } from './content-quality'

const MIN_USABLE_WORDS = 3

export const WORD_SEARCH_AI_EMPTY_MESSAGE =
  'Could not get enough retirement-themed words that fit this grid. Try a broader theme, fewer words, or your own list.'

function usableWordCount(items: unknown[], gridSize: number, maxLetters: number): number {
  return items.filter((word) => {
    if (typeof word !== 'string') return false
    const letters = word.toUpperCase().replace(/[^A-Z]/g, '')
    return letters.length >= MIN_WORD_LETTERS && letters.length <= Math.min(gridSize, maxLetters)
  }).length
}

export async function retirementWordSearchPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<ThemeWordsResponse> {
  const difficulty = parseRetirementDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const gridSize = parseGridSize(config.gridSize, difficulty, printStyle)
  const maxLetters = retirementMaxLetters(difficulty, printStyle)
  const theme =
    filterUnsafeThemeCopy(resolveAiThemePrompt(config)) ?? resolveAiThemePrompt(config)
  const label = aiThemeLabel(config) || theme

  const varietyKey = studioVarietyKey(
    'word-search',
    label,
    `${MIN_WORD_LETTERS}-${Math.min(gridSize, maxLetters)}`,
  )
  const req: ThemeWordsRequest = {
    theme,
    itemCount: parseWordCount(config.wordCount, difficulty, gridSize),
    minLetters: MIN_WORD_LETTERS,
    maxLetters: Math.min(gridSize, maxLetters),
    seed: Number(config.seed ?? 1),
    avoid: studioAvoidList(varietyKey),
  }

  try {
    const remote = await generateThemeWords(req, signal)
    const safeItems = filterSafeWordLines(remote.items ?? [])
    const usable = usableWordCount(safeItems, gridSize, maxLetters)
    if (usable < MIN_USABLE_WORDS) {
      throw new Error(WORD_SEARCH_AI_EMPTY_MESSAGE)
    }
    rememberStudioContent(varietyKey, safeItems)
    return { ...remote, items: safeItems }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof Error && error.message === WORD_SEARCH_AI_EMPTY_MESSAGE) {
      throw error
    }
    console.warn('[retirement-word-search] AI theme words failed', error)
    const detail = error instanceof Error ? error.message.trim() : ''
    throw new Error(detail || WORD_SEARCH_AI_EMPTY_MESSAGE)
  }
}
