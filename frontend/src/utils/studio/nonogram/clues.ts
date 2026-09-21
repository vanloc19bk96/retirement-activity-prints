import type { Bitmap } from './types'

/** Run-length clue for one line. Empty line → `[0]`. */
export function lineClue(line: readonly boolean[]): number[] {
  const clue: number[] = []
  let run = 0
  for (const filled of line) {
    if (filled) {
      run++
    } else if (run > 0) {
      clue.push(run)
      run = 0
    }
  }
  if (run > 0) clue.push(run)
  return clue.length > 0 ? clue : [0]
}

export function columnOf(bitmap: Bitmap, col: number): boolean[] {
  return bitmap.map((row) => row[col]!)
}

export function cluesFromBitmap(bitmap: Bitmap): {
  rowClues: number[][]
  colClues: number[][]
} {
  const size = bitmap.length
  const rowClues = bitmap.map((row) => lineClue(row))
  const colClues: number[][] = []
  for (let c = 0; c < size; c++) {
    colClues.push(lineClue(columnOf(bitmap, c)))
  }
  return { rowClues, colClues }
}

export function filledCount(bitmap: Bitmap): number {
  let n = 0
  for (const row of bitmap) {
    for (const cell of row) if (cell) n++
  }
  return n
}
