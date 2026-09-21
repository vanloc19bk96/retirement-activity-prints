import type { Dir } from '@/utils/puzzles/word-search-core'
import type { StudioRng } from '../studio-rng'

export function startRange(
  delta: number,
  length: number,
  size: number,
): [number, number] | null {
  const last = length - 1
  if (delta === 0) return [0, size - 1]
  if (delta > 0) {
    const max = size - 1 - last
    return max >= 0 ? [0, max] : null
  }
  return last <= size - 1 ? [last, size - 1] : null
}

export function sampleStarts(
  word: string,
  size: number,
  dirs: readonly Dir[],
  rng: StudioRng,
  cap: number,
): { r: number; c: number; dir: Dir }[] {
  const out: { r: number; c: number; dir: Dir }[] = []
  const seen = new Set<string>()
  for (let n = 0; n < cap * 5 && out.length < cap; n++) {
    const dir = dirs[rng.int(0, dirs.length - 1)]!
    const rows = startRange(dir.dr, word.length, size)
    const cols = startRange(dir.dc, word.length, size)
    if (!rows || !cols) continue
    const r = rng.int(rows[0], rows[1])
    const c = rng.int(cols[0], cols[1])
    const key = `${r},${c},${dir.name}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ r, c, dir })
  }
  return out
}

export function allStarts(
  word: string,
  size: number,
  dirs: readonly Dir[],
): { r: number; c: number; dir: Dir }[] {
  const out: { r: number; c: number; dir: Dir }[] = []
  for (const dir of dirs) {
    const rows = startRange(dir.dr, word.length, size)
    const cols = startRange(dir.dc, word.length, size)
    if (!rows || !cols) continue
    for (let r = rows[0]; r <= rows[1]; r++) {
      for (let c = cols[0]; c <= cols[1]; c++) {
        out.push({ r, c, dir })
      }
    }
  }
  return out
}
