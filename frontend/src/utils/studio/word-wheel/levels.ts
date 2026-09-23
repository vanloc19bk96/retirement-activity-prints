import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one difficulty decision a word wheel page asks for.
 *
 * Nearly everything a word wheel could be asked about is either fixed by the
 * puzzle or derived from the trim. Nine letters is not a setting — a wheel with
 * eight is a different game, and a wheel with ten has no hidden word. Which
 * letters they are is not a setting either: the nine-letter answer is chosen
 * first and the wheel is its letters, which is the only construction that
 * cannot ship a puzzle whose promised long word does not exist. Wheel size,
 * letter size, how many write-in lines fit and how many answers the solution
 * prints all come from `layout.ts`, which can see the page in Settings.
 *
 * What is left is one question a seller can answer without knowing any of that:
 * how hard should this page be. It moves three things at once because they are
 * one decision seen from three sides — how short a word may be, how many the
 * page asks for, and whether the nine-letter word is given a way in.
 */
export type WordWheelLevelId = 'gentle' | 'classic' | 'challenging'

export interface WordWheelLevel {
  id: WordWheelLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /**
   * Shortest word the page will accept, and print.
   *
   * Four is the published standard, and it is a floor rather than a taste: at
   * three, a wheel holding A, E and R answers "ARE", "EAR", "ERA" and "RAE",
   * and a solution list padded with them reads as a page with nothing to say.
   * Five is the classic harder variant — the same wheel, with the easy finds
   * taken off the table.
   */
  minWordLength: number
  /**
   * Fewest answers the wheel must hold before this level will use it.
   *
   * A wheel is only as good as what can be made from it, and that cannot be
   * judged from the nine-letter word: BOOKCASES reads beautifully and yields
   * almost nothing. Wheels under the floor are passed over at selection time
   * rather than printed thin.
   */
  minAnswers: number
  /**
   * Most answers this level wants a wheel to hold.
   *
   * A ceiling reads oddly until you have solved one: a wheel making fifty words
   * is not a better page, it is a longer one, and on a small trim its answer
   * list does not fit beside the wheel it belongs to. The middle letter is
   * chosen to land inside the band rather than to maximise it, which also keeps
   * consecutive pages of a book asking for numbers in the same neighbourhood.
   */
  maxAnswers: number
  /**
   * Share of the printed answer list the page asks the solver to find.
   *
   * Asking for the whole list would be asking a reader to reproduce a word
   * list they cannot see. These are the shares a solver of that level reaches
   * on a good afternoon — enough to feel earned, not enough to feel set up.
   */
  goalRatio: number
  /**
   * Print the nine-letter word's first letter beside its answer line.
   *
   * The nine-letter word is the whole reward of the page and also the one part
   * a solver can stare past for an hour. One letter is the difference between a
   * challenge and a dead end, and it gives away far less than a clue would.
   */
  firstLetterGiven: boolean
  /**
   * The sentence under the heading. Says what to make, then the one rule.
   *
   * Kept to two printed lines on the narrowest interior this app supports. A
   * third line is not merely untidy — it is pushed out of the header's
   * reservation into the top of the wheel on the tightest trims, and it is the
   * first thing an older reader has to get through before the puzzle starts.
   */
  instruction: string
}

/** Shortest word any level will print. Also the floor preflight enforces. */
export const WORD_WHEEL_MIN_WORD_LENGTH = 4

/** Letters in the wheel, and in the hidden word. The puzzle is not this minus one. */
export const WORD_WHEEL_LETTER_COUNT = 9

export const WORD_WHEEL_LEVELS: readonly WordWheelLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — fewer words, first letter given',
    minWordLength: 4,
    minAnswers: 20,
    maxAnswers: 32,
    goalRatio: 0.35,
    firstLetterGiven: true,
    instruction:
      'Make words of four letters or more. Every word must use the middle letter.',
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    minWordLength: 4,
    minAnswers: 18,
    maxAnswers: 30,
    goalRatio: 0.5,
    firstLetterGiven: false,
    instruction:
      'Make words of four letters or more. Every word must use the middle letter.',
  },
  {
    id: 'challenging',
    label: 'Challenging — five letters or more',
    minWordLength: 5,
    minAnswers: 10,
    maxAnswers: 22,
    goalRatio: 0.6,
    firstLetterGiven: false,
    instruction:
      'Make words of five letters or more. Every word must use the middle letter.',
  },
]

export const DEFAULT_WORD_WHEEL_LEVEL_ID: WordWheelLevelId = 'classic'

const LEVEL_INDEX = new Map(WORD_WHEEL_LEVELS.map((level) => [level.id, level]))

export const WORD_WHEEL_LEVEL_OPTIONS: StudioSelectOption[] = WORD_WHEEL_LEVELS.map(
  (level) => ({ label: level.label, value: level.id }),
)

/** Sheets saved against a form that spoke in difficulties rather than levels. */
function legacyLevelId(config: StudioConfig): WordWheelLevelId | null {
  const difficulty = config.difficulty
  if (difficulty == null) return null
  if (difficulty === 'easy' || difficulty === 'relaxed') return 'gentle'
  if (difficulty === 'hard' || difficulty === 'challenge') return 'challenging'
  return 'classic'
}

export function parseWordWheelLevel(config: StudioConfig): WordWheelLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as WordWheelLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_WORD_WHEEL_LEVEL_ID)!
  )
}

/** What the page tells the solver, unless the heading strip is switched off. */
export function wordWheelInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return parseWordWheelLevel(config).instruction
}

/** Fewest words a page will ever ask for. Below this it is not a target. */
export const WORD_WHEEL_MIN_GOAL = 5

/**
 * How many words the page asks for, given what the solution will print.
 *
 * Taken from the list rather than from the level alone, because a wheel that
 * makes forty words and a wheel that makes eighteen are not the same afternoon,
 * and a fixed number would be trivial on one and unreachable on the other. Never
 * more than the solution lists — a page may not ask for a word it cannot then
 * print.
 */
export function wordWheelGoal(level: WordWheelLevel, printedAnswers: number): number {
  if (printedAnswers <= 0) return 0
  const raw = Math.round(printedAnswers * level.goalRatio)
  return Math.min(printedAnswers, Math.max(WORD_WHEEL_MIN_GOAL, raw))
}
