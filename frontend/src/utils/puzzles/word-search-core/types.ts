export type WordSearchDifficulty = 'easy' | 'medium' | 'hard'

export interface Dir {
  dr: number
  dc: number
  name: string
}

export interface Placement {
  word: string
  r: number
  c: number
  dir: Dir
}

/** Grid uses `token`; word bank prints `display`. */
export interface WordEntry {
  display: string
  token: string
}

export interface WordSearchPuzzle {
  grid: string[][]
  placements: Placement[]
  size: number
  /** Placed tokens — clue list must match this set. */
  words: string[]
  /** Parallel display labels for the word bank (same order as `words`). */
  displays: string[]
}
