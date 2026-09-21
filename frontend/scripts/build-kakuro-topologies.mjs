/**
 * One-off authoring script: curated Kakuro topologies (run lengths in [2,9]).
 * Starts from a structured wall lattice so long runs cannot occur, then varies walls.
 * Run: node scripts/build-kakuro-topologies.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../src/data/studio/kakuro/topologies.json')

/** @typedef {'B'|'W'} Cell */

function blank(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => /** @type {Cell} */ ('B')))
}

function extractRuns(cells, size) {
  /** @type {{ cells: {r:number,c:number}[], dir: string }[]} */
  const runs = []
  for (let r = 0; r < size; r++) {
    let run = []
    for (let c = 0; c <= size; c++) {
      if (c < size && cells[r][c] === 'W') run.push({ r, c })
      else {
        if (run.length) runs.push({ cells: run, dir: 'across' })
        run = []
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let run = []
    for (let r = 0; r <= size; r++) {
      if (r < size && cells[r][c] === 'W') run.push({ r, c })
      else {
        if (run.length) runs.push({ cells: run, dir: 'down' })
        run = []
      }
    }
  }
  return runs
}

function validate(grid) {
  const size = grid.length
  const runs = extractRuns(grid, size)
  for (const run of runs) {
    if (run.cells.length > 9) return 'run>9'
  }
  const covered = new Set()
  for (const run of runs.filter((r) => r.cells.length >= 2)) {
    for (const { r, c } of run.cells) covered.add(`${r},${c}`)
  }
  let whiteCount = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 'W') continue
      whiteCount++
      if (!covered.has(`${r},${c}`)) return 'orphan'
    }
  }
  if (whiteCount < 12) return 'too-few-white'
  for (const run of runs.filter((r) => r.cells.length >= 2)) {
    const first = run.cells[0]
    const cr = run.dir === 'across' ? first.r : first.r - 1
    const cc = run.dir === 'across' ? first.c - 1 : first.c
    if (cr < 0 || cc < 0 || cr >= size || cc >= size || grid[cr][cc] !== 'B') {
      return 'missing-clue-cell'
    }
  }
  const real = runs.filter((r) => r.cells.length >= 2)
  if (real.length < 8) return 'too-few-runs'
  return null
}

function toRows(grid) {
  return grid.map((row) => row.join(''))
}

function mulberry(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Lattice of white rooms separated by black walls every `period` cells.
 * Guarantees max run length < period.
 */
function lattice(size, period, seed) {
  const g = blank(size)
  const rnd = mulberry(seed)

  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      const onWallRow = (r - 1) % period === period - 1
      const onWallCol = (c - 1) % period === period - 1
      if (onWallRow || onWallCol) {
        // Open some wall cells as tunnels so the grid is interlocking, not rooms
        const open = rnd() < 0.35
        g[r][c] = open ? 'W' : 'B'
      } else {
        g[r][c] = 'W'
      }
    }
  }

  // Extra random blacks inside rooms for variety
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (g[r][c] !== 'W') continue
      if (rnd() < 0.08) g[r][c] = 'B'
    }
  }

  // Force-split any run that grew > 5 via tunnels
  for (let pass = 0; pass < 16; pass++) {
    const longRuns = extractRuns(g, size).filter((r) => r.cells.length > 5)
    if (longRuns.length === 0) break
    for (const run of longRuns) {
      // Try several split points
      const idxs = [2, 3, Math.floor(run.cells.length / 2), run.cells.length - 3]
      for (const i of idxs) {
        if (i <= 0 || i >= run.cells.length - 1) continue
        const cell = run.cells[i]
        if (g[cell.r][cell.c] !== 'W') continue
        g[cell.r][cell.c] = 'B'
        if (validate(g) === 'orphan' || validate(g) === 'run>9') {
          g[cell.r][cell.c] = 'W'
        } else {
          break
        }
      }
    }
  }

  // Black out orphans
  for (let pass = 0; pass < 6; pass++) {
    const runs = extractRuns(g, size)
    const covered = new Set()
    for (const run of runs.filter((r) => r.cells.length >= 2)) {
      for (const { r, c } of run.cells) covered.add(`${r},${c}`)
    }
    let fixed = false
    for (let r = 1; r < size - 1; r++) {
      for (let c = 1; c < size - 1; c++) {
        if (g[r][c] === 'W' && !covered.has(`${r},${c}`)) {
          g[r][c] = 'B'
          fixed = true
        }
      }
    }
    if (!fixed) break
  }

  return g
}

function buildLibrary() {
  /** @type {{ id: string, size: number, difficulty: string, rows: string[] }[]} */
  const topologies = []
  const buckets = [
    { difficulty: 'small', size: 8, period: 3, count: 12 },
    { difficulty: 'medium', size: 10, period: 3, count: 12 },
    { difficulty: 'large', size: 13, period: 4, count: 12 },
  ]

  for (const bucket of buckets) {
    /** @type {string[]} */
    const keys = []
    /** @type {string[][]} */
    const accepted = []
    for (let seed = 1; accepted.length < bucket.count && seed < 3000; seed++) {
      const g = lattice(bucket.size, bucket.period, seed * 31 + bucket.size * 13)
      const err = validate(g)
      if (err) continue
      const rows = toRows(g)
      const key = rows.join('|')
      if (keys.includes(key)) continue
      keys.push(key)
      accepted.push(rows)
    }
    if (accepted.length < bucket.count) {
      throw new Error(`Only ${accepted.length}/${bucket.count} for ${bucket.difficulty}`)
    }
    for (let i = 0; i < bucket.count; i++) {
      topologies.push({
        id: `${bucket.difficulty}-${String(i + 1).padStart(2, '0')}`,
        size: bucket.size,
        difficulty: bucket.difficulty,
        rows: accepted[i],
      })
    }
  }

  return { topologies }
}

const lib = buildLibrary()
writeFileSync(OUT, `${JSON.stringify(lib, null, 2)}\n`, 'utf8')
console.log(`Wrote ${lib.topologies.length} topologies → ${OUT}`)
