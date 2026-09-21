import { delta, type CrosswordEntry } from './types'

export function readEntry(
  grid: (string | null)[][],
  entry: Pick<CrosswordEntry, 'r' | 'c' | 'dir' | 'word'>,
): string {
  const { dr, dc } = delta(entry.dir)
  let out = ''
  for (let i = 0; i < entry.word.length; i++) {
    out += grid[entry.r + dr * i]![entry.c + dc * i] ?? ''
  }
  return out
}

export function allCrossingsConsistent(
  grid: (string | null)[][],
  entries: CrosswordEntry[],
): boolean {
  const cellOwners = new Map<string, string>()
  for (const e of entries) {
    const { dr, dc } = delta(e.dir)
    for (let i = 0; i < e.word.length; i++) {
      const key = `${e.r + dr * i},${e.c + dc * i}`
      const letter = e.word[i]!
      const existing = cellOwners.get(key)
      if (existing && existing !== letter) return false
      cellOwners.set(key, letter)
      if (grid[e.r + dr * i]![e.c + dc * i] !== letter) return false
    }
  }
  return true
}

export function whiteConnected(grid: (string | null)[][], size: number): boolean {
  let startR = -1
  let startC = -1
  let whiteCount = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]![c] === null) continue
      whiteCount += 1
      if (startR < 0) {
        startR = r
        startC = c
      }
    }
  }
  if (whiteCount === 0) return false

  const seen = new Set<string>()
  const stack: [number, number][] = [[startR, startC]]
  seen.add(`${startR},${startC}`)
  while (stack.length > 0) {
    const [r, c] = stack.pop()!
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
      if (grid[nr]![nc] === null) continue
      const key = `${nr},${nc}`
      if (seen.has(key)) continue
      seen.add(key)
      stack.push([nr, nc])
    }
  }
  return seen.size === whiteCount
}

/** Standard L→R, T→B numbering; assigns `number` on each entry. */
export function numberEntries(
  entries: CrosswordEntry[],
  grid: (string | null)[][],
  size: number,
): CrosswordEntry[] {
  const starts = new Map<string, number>()
  let next = 1
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]![c] === null) continue
      const startsAcross =
        (c === 0 || grid[r]![c - 1] === null) && c + 1 < size && grid[r]![c + 1] !== null
      const startsDown =
        (r === 0 || grid[r - 1]![c] === null) && r + 1 < size && grid[r + 1]![c] !== null
      if (startsAcross || startsDown) {
        starts.set(`${r},${c}`, next)
        next += 1
      }
    }
  }

  return entries.map((e) => ({
    ...e,
    number: starts.get(`${e.r},${e.c}`) ?? 0,
  }))
}

export function numberingValid(
  entries: CrosswordEntry[],
  grid: (string | null)[][],
): boolean {
  if (entries.some((e) => e.number <= 0)) return false
  const byStart = new Map<string, number>()
  for (const e of entries) {
    const key = `${e.r},${e.c}`
    const existing = byStart.get(key)
    if (existing !== undefined && existing !== e.number) return false
    byStart.set(key, e.number)
    if (grid[e.r]![e.c] === null) return false
  }
  const numbers = [...byStart.values()].sort((a, b) => a - b)
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) return false
  }
  return true
}
