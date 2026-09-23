import { generateRiddleScramble } from '@/api/studio-riddle-scramble.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { RiddleScrambleResponse } from '@/types/studio-riddle-scramble.types'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import {
  AI_THEME_MAX_LENGTH,
  resolveRetirementTheme,
} from '../_shared/retirement-theme-config'
import { filterUnsafeThemeCopy } from '../retirement-word-search/content-quality'
import { buildRiddleScramblePuzzle } from './build'
import {
  MAX_CLUE_CHARS,
  MAX_RIDDLE_CHARS,
  RIDDLE_CANDIDATES,
  RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE,
  selectRiddles,
  selectWords,
  wordCandidateCountFor,
} from './content'
import { parseRiddleScrambleLevel } from './levels'
import { RIDDLE_SCRAMBLE_THEME_SALT } from './theme'

const MAX_AI_ATTEMPTS = 3

/**
 * AI-only — there is no bundled riddle book behind this.
 *
 * A packaged list would make every seller's book draw on the same few hundred
 * jokes, which is the fastest way to two KDP titles that look copied from each
 * other. Retrying with an avoid list and then failing visibly is the honest
 * alternative.
 *
 * The attempt loop does something the other AI games do not: it *builds the
 * puzzle here* before accepting the reply. A pool can pass every gate in
 * `content.ts` and still be useless, because the page needs one word per
 * letter of the riddle answer and the pool may hold no word with a K in it.
 * Finding that out in `generate` would mean an error page; finding it out here
 * costs a retry, and the words that failed join the avoid list so the retry is
 * asked for something new rather than handed the same pool twice.
 */
export async function riddleScramblePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<RiddleScrambleResponse> {
  const seed = Number(config.seed ?? 1)
  const level = parseRiddleScrambleLevel(config)
  const theme = resolveRetirementTheme(config, seed, RIDDLE_SCRAMBLE_THEME_SALT)

  const promptTheme = (filterUnsafeThemeCopy(theme.prompt) ?? theme.prompt).slice(
    0,
    AI_THEME_MAX_LENGTH,
  )
  const varietyKey = studioVarietyKey(
    'riddle-scramble',
    theme.label || promptTheme,
    level.id,
  )

  const rejected: string[] = []
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt++) {
    try {
      const remote = await generateRiddleScramble(
        {
          theme: promptTheme,
          riddleCount: RIDDLE_CANDIDATES,
          answerLetters: level.answerLetters,
          maxRiddleChars: MAX_RIDDLE_CHARS,
          wordCount: wordCandidateCountFor(level.answerLetters),
          minLetters: level.minLetters,
          maxLetters: level.maxLetters,
          maxClueChars: MAX_CLUE_CHARS,
          seed: seed + attempt * 97,
          avoid: [...studioAvoidList(varietyKey), ...rejected],
        },
        signal,
      )

      const riddles = selectRiddles(remote.riddles, level)
      const words = selectWords(remote.words, { level })
      const puzzle =
        riddles.length > 0 && words.length >= level.answerLetters
          ? buildRiddleScramblePuzzle({ riddles, words, level, seed })
          : null

      if (puzzle) {
        // Remember the riddle answer first: it is the thing a reader notices
        // repeating, and it is what the next page has to be written around.
        rememberStudioContent(varietyKey, [
          puzzle.answer,
          ...puzzle.rows.map((row) => row.word),
        ])
        return { riddles, words: words.map(({ word, clue }) => ({ word, clue })) }
      }
      rejected.push(...riddles.map((riddle) => riddle.answer))
    } catch (error) {
      if (signal.aborted) throw error
      lastError = error
      console.warn(`[riddle-scramble] AI attempt ${attempt + 1} failed`, error)
    }
  }

  if (lastError instanceof Error && lastError.message.trim()) {
    throw new Error(lastError.message.trim())
  }
  throw new Error(RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE)
}
