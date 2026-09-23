/**
 * What a Riddle Scramble page asks the content service for.
 *
 * Two pools in one request, because neither is a page on its own. The sheet
 * prints one scrambled word per letter of the riddle answer, and each of those
 * words has to *contain* the letter it stands for — so a riddle arriving
 * without a word pool that can spell it is not half a page, and a second paid
 * call to repair that is a second chance to fail.
 *
 * `answerLetters` is exact rather than a band: it is also the number of words
 * the page prints, and a book whose pages hold five words, then four, then six,
 * reads as assembled rather than made.
 */
export interface RiddleScrambleRequest {
  theme: string
  /** Riddle candidates to write — the page keeps the first one it can spell. */
  riddleCount: number
  /** Letters in every riddle answer, and words on the page. */
  answerLetters: number
  /** Longest riddle the printed band was planned for; longer ones are dropped. */
  maxRiddleChars: number
  /** Word candidates to write — far more than the page prints, for matching slack. */
  wordCount: number
  minLetters: number
  maxLetters: number
  /** Longest clue the printed line was planned for. */
  maxClueChars: number
  seed: number
  /** Recently printed answers and words for this template + theme. */
  avoid?: string[]
  locale?: string
}

/** One riddle as the service writes it. */
export interface RiddleScrambleRiddle {
  riddle: string
  answer: string
}

/** One candidate word as the service writes it. */
export interface RiddleScrambleWord {
  word: string
  clue: string
}

export interface RiddleScrambleResponse {
  riddles: RiddleScrambleRiddle[]
  words: RiddleScrambleWord[]
}
