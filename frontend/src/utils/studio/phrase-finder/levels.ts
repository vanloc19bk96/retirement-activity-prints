import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { PhraseFinderLength } from '@/types/studio-phrase-finder.types'

export type { PhraseFinderLength }

/**
 * The one difficulty decision a Phrase Finder page asks for.
 *
 * Two dials decide how hard this puzzle is, and a form that offered both could
 * be answered into a puzzle nobody can solve. How long the phrase runs and how
 * much of it is already printed pull against each other: a long phrase with a
 * third of its letters given is easier than a short one with a tenth, because
 * every extra word is another piece of context. Asking a seller to balance them
 * is asking them to playtest, so the level does it — longer phrases come with a
 * smaller share given, and the two move together down the ladder.
 *
 * What the level does not decide is how big anything prints or how many puzzles
 * a page holds. `layout.ts` derives both from the trim in Settings, and the
 * level's help line reports what came out, so the form never promises a page it
 * cannot set.
 */
export type PhraseFinderLevelId = 'gentle' | 'classic' | 'challenging'

export interface PhraseFinderLevel {
  id: PhraseFinderLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Phrase length band asked of the writer; mirrors the API's own ranges. */
  length: PhraseFinderLength
  /** Puzzles the page aims for, before the page-size cap. */
  targetPuzzles: number
  /**
   * Share of the phrase's letters printed in before the solver starts.
   *
   * The number that makes or breaks this game. Too few and the page is a row of
   * blanks with nothing to push against — a solver stares at it, puts the book
   * down and the review says "impossible". Too many and the phrase reads itself
   * out loud at a glance, which is not a puzzle, it is a headline.
   *
   * Around a third is the working middle. At that share a phrase of forty
   * letters carries a dozen printed ones spread through every word long enough
   * to hold one, so each word has a foothold and none is finished.
   *
   * It is a target rather than a promise, and on a short phrase it is usually
   * not what prints: `reveal.ts` will not give any single word more than half
   * its letters, and on a phrase built from short words those caps bind first.
   * A gentle page therefore lands nearer a third than the two-fifths asked for,
   * which is the right way round — the cap protects the puzzle, the share only
   * asks. `kdp-preflight.ts` refuses a page that drifted outside the band
   * either way.
   */
  revealShare: number
}

export const PHRASE_FINDER_LEVELS: readonly PhraseFinderLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short phrases, more letters given',
    length: 'short',
    targetPuzzles: 3,
    revealShare: 0.4,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    length: 'medium',
    targetPuzzles: 3,
    revealShare: 0.3,
  },
  {
    id: 'challenging',
    label: 'Challenging — longer phrases, fewer letters given',
    length: 'long',
    targetPuzzles: 2,
    revealShare: 0.24,
  },
]

export const DEFAULT_PHRASE_FINDER_LEVEL_ID: PhraseFinderLevelId = 'classic'

const LEVEL_INDEX = new Map(PHRASE_FINDER_LEVELS.map((level) => [level.id, level]))

export const PHRASE_FINDER_LEVEL_OPTIONS: StudioSelectOption[] =
  PHRASE_FINDER_LEVELS.map((level) => ({ label: level.label, value: level.id }))

/** Sheets saved against a plain length or difficulty field. */
function legacyLevelId(config: StudioConfig): PhraseFinderLevelId | null {
  const length = config.length
  if (length === 'short') return 'gentle'
  if (length === 'long') return 'challenging'
  if (length === 'medium') return 'classic'
  const difficulty = config.difficulty
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  if (difficulty === 'medium') return 'classic'
  return null
}

export function parsePhraseFinderLevel(config: StudioConfig): PhraseFinderLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as PhraseFinderLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_PHRASE_FINDER_LEVEL_ID)!
  )
}
