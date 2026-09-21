export type CrosswordDir = 'across' | 'down'

export interface CrosswordPair {
  word: string
  clue: string
}

export interface CrosswordEntry {
  word: string
  clue: string
  r: number
  c: number
  dir: CrosswordDir
  number: number
}

export interface CrosswordBuild {
  grid: (string | null)[][]
  entries: CrosswordEntry[]
  size: number
}

export function delta(dir: CrosswordDir): { dr: number; dc: number } {
  return dir === 'across' ? { dr: 0, dc: 1 } : { dr: 1, dc: 0 }
}

export function perp(dir: CrosswordDir): { dr: number; dc: number } {
  return dir === 'across' ? { dr: 1, dc: 0 } : { dr: 0, dc: 1 }
}
