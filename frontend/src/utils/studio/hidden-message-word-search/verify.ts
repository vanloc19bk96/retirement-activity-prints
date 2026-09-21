import type { Dir } from '@/utils/puzzles/word-search-core'

function pathKey(r: number, c: number, dir: Dir, length: number): string {
  const cells: string[] = []
  for (let i = 0; i < length; i++) {
    cells.push(`${r + dir.dr * i},${c + dir.dc * i}`)
  }
  return cells.sort().join('|')
}

function tokenPaths(grid: string[][], token: string, dirs: readonly Dir[]): Set<string> {
  const size = grid.length
  const found = new Set<string>()
  for (const dir of dirs) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let ok = true
        for (let i = 0; i < token.length; i++) {
          const rr = r + dir.dr * i
          const cc = c + dir.dc * i
          if (rr < 0 || rr >= size || cc < 0 || cc >= size || grid[rr]![cc] !== token[i]) {
            ok = false
            break
          }
        }
        if (ok) found.add(pathKey(r, c, dir, token.length))
      }
    }
  }
  return found
}

/** Unique cell-paths of `token` using only the difficulty's allowed directions. */
export function countExactOccurrences(
  grid: string[][],
  token: string,
  dirs: readonly Dir[],
): number {
  return tokenPaths(grid, token, dirs).size
}

export function listedWordsAreUnique(
  grid: string[][],
  tokens: string[],
  dirs: readonly Dir[],
): boolean {
  return tokens.every((token) => countExactOccurrences(grid, token, dirs) === 1)
}
