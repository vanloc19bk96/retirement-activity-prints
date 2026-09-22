import type { StudioRng } from '../studio-rng'
import {
  delta,
  perp,
  type CrosswordBuild,
  type CrosswordDir,
  type CrosswordEntry,
  type CrosswordPair,
} from './types'
import { allCrossingsConsistent, whiteConnected } from './validate'

export type { CrosswordBuild, CrosswordDir, CrosswordEntry, CrosswordPair } from './types'
export {
  readEntry,
  allCrossingsConsistent,
  whiteConnected,
  numberEntries,
  numberingValid,
} from './validate'

interface Placed {
  word: string
  clue: string
  r: number
  c: number
  dir: CrosswordDir
}

interface Bounds {
  minR: number
  maxR: number
  minC: number
  maxC: number
}

const WORK = 36
const MAX_BACKTRACK_NODES = 20_000

function emptyWork(): (string | null)[][] {
  return Array.from({ length: WORK }, () => Array.from({ length: WORK }, () => null))
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < WORK && c >= 0 && c < WORK
}

function cell(grid: (string | null)[][], r: number, c: number): string | null {
  if (!inBounds(r, c)) return null
  return grid[r]![c] ?? null
}

function spanBounds(
  word: string,
  r: number,
  c: number,
  dir: CrosswordDir,
): Bounds {
  const { dr, dc } = delta(dir)
  const endR = r + dr * (word.length - 1)
  const endC = c + dc * (word.length - 1)
  return {
    minR: Math.min(r, endR),
    maxR: Math.max(r, endR),
    minC: Math.min(c, endC),
    maxC: Math.max(c, endC),
  }
}

function mergeBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return b
  return {
    minR: Math.min(a.minR, b.minR),
    maxR: Math.max(a.maxR, b.maxR),
    minC: Math.min(a.minC, b.minC),
    maxC: Math.max(a.maxC, b.maxC),
  }
}

function fitsMaxSize(bounds: Bounds, maxSize: number): boolean {
  return (
    bounds.maxR - bounds.minR + 1 <= maxSize &&
    bounds.maxC - bounds.minC + 1 <= maxSize
  )
}

/** True when word can sit at (r,c) in `dir` without illegal adjacency. */
export function canPlace(
  grid: (string | null)[][],
  word: string,
  r: number,
  c: number,
  dir: CrosswordDir,
  maxSize?: number,
  currentBounds?: Bounds | null,
): boolean {
  const { dr, dc } = delta(dir)
  const { dr: pr, dc: pc } = perp(dir)
  const len = word.length

  if (!inBounds(r, c) || !inBounds(r + dr * (len - 1), c + dc * (len - 1))) {
    return false
  }

  if (maxSize != null) {
    const next = mergeBounds(currentBounds ?? null, spanBounds(word, r, c, dir))
    if (!fitsMaxSize(next, maxSize)) return false
  }

  const beforeR = r - dr
  const beforeC = c - dc
  if (inBounds(beforeR, beforeC) && cell(grid, beforeR, beforeC) !== null) {
    return false
  }
  const afterR = r + dr * len
  const afterC = c + dc * len
  if (inBounds(afterR, afterC) && cell(grid, afterR, afterC) !== null) {
    return false
  }

  let crosses = 0
  for (let i = 0; i < len; i++) {
    const nr = r + dr * i
    const nc = c + dc * i
    const existing = cell(grid, nr, nc)
    const letter = word[i]!
    if (existing !== null) {
      if (existing !== letter) return false
      crosses += 1
      continue
    }
    // New letter: perpendicular neighbors must be empty (no parallel touch).
    if (cell(grid, nr + pr, nc + pc) !== null) return false
    if (cell(grid, nr - pr, nc - pc) !== null) return false
  }

  // Non-seed placements must cross at least once.
  return crosses > 0
}

function placeWord(
  grid: (string | null)[][],
  word: string,
  r: number,
  c: number,
  dir: CrosswordDir,
): { r: number; c: number }[] {
  const { dr, dc } = delta(dir)
  const written: { r: number; c: number }[] = []
  for (let i = 0; i < word.length; i++) {
    const nr = r + dr * i
    const nc = c + dc * i
    if (cell(grid, nr, nc) === null) {
      grid[nr]![nc] = word[i]!
      written.push({ r: nr, c: nc })
    }
  }
  return written
}

function unplace(grid: (string | null)[][], written: { r: number; c: number }[]): void {
  for (const pos of written) {
    grid[pos.r]![pos.c] = null
  }
}

function letterPositions(
  placed: Placed[],
): Map<string, { r: number; c: number; dir: CrosswordDir }[]> {
  const map = new Map<string, { r: number; c: number; dir: CrosswordDir }[]>()
  for (const e of placed) {
    const { dr, dc } = delta(e.dir)
    for (let i = 0; i < e.word.length; i++) {
      const letter = e.word[i]!
      const list = map.get(letter) ?? []
      list.push({ r: e.r + dr * i, c: e.c + dc * i, dir: e.dir })
      map.set(letter, list)
    }
  }
  return map
}

function candidatePlacements(
  word: string,
  placed: Placed[],
  grid: (string | null)[][],
  rng: StudioRng,
  maxSize: number,
  currentBounds: Bounds | null,
): { r: number; c: number; dir: CrosswordDir }[] {
  const positions = letterPositions(placed)
  const out: { r: number; c: number; dir: CrosswordDir; area: number }[] = []
  const seen = new Set<string>()

  for (let i = 0; i < word.length; i++) {
    const letter = word[i]!
    const hits = positions.get(letter)
    if (!hits) continue
    for (const hit of hits) {
      const dir: CrosswordDir = hit.dir === 'across' ? 'down' : 'across'
      const { dr, dc } = delta(dir)
      const r = hit.r - dr * i
      const c = hit.c - dc * i
      const key = `${r},${c},${dir}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!canPlace(grid, word, r, c, dir, maxSize, currentBounds)) continue
      const next = mergeBounds(currentBounds, spanBounds(word, r, c, dir))
      const area =
        (next.maxR - next.minR + 1) * (next.maxC - next.minC + 1)
      out.push({ r, c, dir, area })
    }
  }

  // Prefer compact placements; shuffle ties so seeds stay deterministic-but-varied.
  out.sort((a, b) => a.area - b.area)
  const compact = out.slice(0, Math.min(out.length, 24))
  return rng.shuffle(compact).map(({ r, c, dir }) => ({ r, c, dir }))
}

function usedBounds(grid: (string | null)[][]): Bounds | null {
  let minR = WORK
  let maxR = -1
  let minC = WORK
  let maxC = -1
  for (let r = 0; r < WORK; r++) {
    for (let c = 0; c < WORK; c++) {
      if (grid[r]![c] === null) continue
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
    }
  }
  if (maxR < 0) return null
  return { minR, maxR, minC, maxC }
}

function cropToEntries(
  grid: (string | null)[][],
  placed: Placed[],
  maxSize: number,
): CrosswordBuild | null {
  const bounds = usedBounds(grid)
  if (!bounds) return null
  const height = bounds.maxR - bounds.minR + 1
  const width = bounds.maxC - bounds.minC + 1
  const size = Math.max(height, width)
  if (size > maxSize) return null

  const cropped: (string | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  )
  for (let r = bounds.minR; r <= bounds.maxR; r++) {
    for (let c = bounds.minC; c <= bounds.maxC; c++) {
      const letter = grid[r]![c]
      if (letter === null) continue
      cropped[r - bounds.minR]![c - bounds.minC] = letter
    }
  }

  const entries: CrosswordEntry[] = placed.map((e) => ({
    ...e,
    r: e.r - bounds.minR,
    c: e.c - bounds.minC,
    number: 0,
  }))

  return { grid: cropped, entries, size }
}

function cloneWorkGrid(grid: (string | null)[][]): (string | null)[][] {
  return grid.map((row) => row.slice())
}

/**
 * Order the pool for one packing attempt.
 *
 * Longest first is what makes packing fast — a long word laid early gives
 * every later word somewhere to cross — so that ordering is kept. Words of
 * equal length are shuffled, which is where the variety comes from: returning
 * one fixed order meant attempt 0 was identical for every seed, and attempt 0
 * is the attempt that usually succeeds, so two pages built from one candidate
 * pool came out as the same grid. Later attempts additionally rotate which
 * word seeds the grid, so a pool whose longest word will not interlock is not
 * retried against itself.
 */
function buildWordOrder(
  sorted: CrosswordPair[],
  attempt: number,
  rng: StudioRng,
): CrosswordPair[] {
  const byLength = new Map<number, CrosswordPair[]>()
  for (const pair of sorted) {
    const bucket = byLength.get(pair.word.length)
    if (bucket) bucket.push(pair)
    else byLength.set(pair.word.length, [pair])
  }
  const order = [...byLength.keys()]
    .sort((a, b) => b - a)
    .flatMap((length) => rng.shuffle(byLength.get(length)!))

  if (attempt === 0) return order
  const seedIndex = attempt % order.length
  const seed = order[seedIndex]!
  return [seed, ...order.filter((_, i) => i !== seedIndex)]
}

/**
 * Word-first interlocking crossword. Returns null when a legal connected
 * grid with enough crossings cannot be built within maxSize.
 * `placeCount` is the number of answers to put on the grid (default: all pairs).
 * Extra pairs are substitutes when some words will not interlock.
 */
export function buildCrossword(
  pairs: CrosswordPair[],
  maxSize: number,
  rng: StudioRng,
  placeCount?: number,
): CrosswordBuild | null {
  const cleaned = pairs
    .map((p) => ({
      word: p.word.toUpperCase().replace(/[^A-Z]/g, ''),
      clue: String(p.clue ?? '').trim(),
    }))
    .filter((p) => p.word.length >= 3 && p.word.length <= maxSize)

  if (cleaned.length < 4) return null

  const sorted = [...cleaned].sort(
    (a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word),
  )
  const target = Math.min(sorted.length, Math.max(4, placeCount ?? sorted.length))
  const attempts = Math.min(24, 8 + Math.floor(target / 2))

  let best: CrosswordBuild | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = buildWordOrder(sorted, attempt, rng)
    const grid = emptyWork()
    const placed: Placed[] = []
    let nodes = 0
    let bestPlaced: Placed[] = []
    let bestGrid: (string | null)[][] | null = null

    const seed = order[0]!
    if (seed.word.length > maxSize) continue
    const seedR = Math.floor(WORK / 2)
    const seedC = Math.floor((WORK - seed.word.length) / 2)
    for (let i = 0; i < seed.word.length; i++) {
      grid[seedR]![seedC + i] = seed.word[i]!
    }
    placed.push({
      word: seed.word,
      clue: seed.clue,
      r: seedR,
      c: seedC,
      dir: 'across',
    })
    let bounds: Bounds | null = spanBounds(seed.word, seedR, seedC, 'across')

    const rememberBest = (): void => {
      if (placed.length <= bestPlaced.length) return
      bestPlaced = placed.map((entry) => ({ ...entry }))
      bestGrid = cloneWorkGrid(grid)
    }
    rememberBest()

    const remaining = order.slice(1)

    const search = (index: number): boolean => {
      nodes += 1
      if (nodes > MAX_BACKTRACK_NODES) return false
      rememberBest()
      if (placed.length >= target) return true
      if (index >= remaining.length) return false

      const pair = remaining[index]!
      const candidates = candidatePlacements(
        pair.word,
        placed,
        grid,
        rng,
        maxSize,
        bounds,
      )

      for (const cand of candidates) {
        const written = placeWord(grid, pair.word, cand.r, cand.c, cand.dir)
        placed.push({
          word: pair.word,
          clue: pair.clue,
          r: cand.r,
          c: cand.c,
          dir: cand.dir,
        })
        const prevBounds = bounds
        bounds = mergeBounds(bounds, spanBounds(pair.word, cand.r, cand.c, cand.dir))
        if (search(index + 1)) return true
        placed.pop()
        unplace(grid, written)
        bounds = prevBounds
      }

      return search(index + 1)
    }

    search(0)

    if (!bestGrid || bestPlaced.length < 4) continue
    const built = cropToEntries(bestGrid, bestPlaced, maxSize)
    if (!built) continue
    if (built.entries.length < 4) continue
    if (!whiteConnected(built.grid, built.size)) continue
    if (!allCrossingsConsistent(built.grid, built.entries)) continue

    const dirs = new Set(built.entries.map((e) => e.dir))
    if (dirs.size < 2) continue

    if (!best || built.entries.length > best.entries.length) {
      best = built
    }
    if (built.entries.length >= target) break
  }

  return best
}
