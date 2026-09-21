export type HitoriSize = 5 | 6 | 8 | 10 | 12
export type HitoriDifficulty = 'easy' | 'medium' | 'hard'

/** true = shaded (blacked out) */
export type Shading = boolean[][]

export interface HitoriPuzzle {
  size: number
  grid: number[][]
  shading: Shading
}
