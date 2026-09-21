import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRng } from '../studio-rng'
import { bitmapToRows, filledCount } from './bitmap'
import { loadPatterns } from './patterns'
import { drawThemedHalf, passesHalfQuality, SHAPE_CATALOG } from './shapes'
import type { GridSize, MirrorPattern, MirrorTheme } from './types'
import { MIRROR_GRID_SIZES, MIRROR_THEMES } from './types'

/** Cap curated JSON size; runtime themed gen covers endless scale. */
const MAX_PER_THEME_SIZE = 48
const SEEDS_PER_COMBO = 120
const ATTEMPTS_PER_SEED = 8

function mergeKey(rows: number, half: string[]): string {
  return `${rows}|${half.join('')}`
}

function bucketKey(theme: string, size: number): string {
  return `${theme}:${size}`
}

function asTheme(theme: string): MirrorTheme {
  if ((MIRROR_THEMES as readonly string[]).includes(theme)) return theme as MirrorTheme
  return 'objects'
}

/**
 * Build a large, deduped multi-theme pixel library from handcrafted + procedural shapes.
 */
export function buildExpandedLibrary(): MirrorPattern[] {
  const existing = loadPatterns()
  const seen = new Set(
    existing.filter((p) => p.style === 'pixel').map((p) => mergeKey(p.rows, p.half)),
  )
  const counts = new Map<string, number>()
  const out: MirrorPattern[] = []

  for (const p of existing) {
    if (p.style !== 'pixel') {
      out.push(p)
      continue
    }
    const bk = bucketKey(p.theme, p.rows)
    const n = counts.get(bk) ?? 0
    if (n >= MAX_PER_THEME_SIZE) continue
    counts.set(bk, n + 1)
    out.push(p)
  }

  for (const size of MIRROR_GRID_SIZES) {
    for (const theme of MIRROR_THEMES) {
      const bk = bucketKey(theme, size)
      let have = counts.get(bk) ?? 0
      if (have >= MAX_PER_THEME_SIZE) continue

      for (let i = 0; i < SEEDS_PER_COMBO && have < MAX_PER_THEME_SIZE; i++) {
        const seed = size * 1_000_003 + theme.length * 97_000 + i * 31 + 19
        const rng = createRng(seed)
        for (let attempt = 0; attempt < ATTEMPTS_PER_SEED; attempt++) {
          const { half, shapeId } = drawThemedHalf(size as GridSize, theme, rng)
          if (!passesHalfQuality(half, size as GridSize)) continue
          if (filledCount(half) < size) continue
          const rows = bitmapToRows(half)
          const key = mergeKey(size, rows)
          if (seen.has(key)) continue
          seen.add(key)
          out.push({
            id: `${shapeId}-${size}-g${out.length}`,
            name: shapeId,
            rows: size,
            halfCols: size / 2,
            theme,
            style: 'pixel',
            half: rows,
          })
          have++
          counts.set(bk, have)
          break
        }
      }
    }
  }

  // Keep a few line patterns (existing + simple outline variants from catalog ids).
  const lineExisting = existing.filter((p) => p.style === 'line')
  for (const p of lineExisting) {
    if (!out.some((o) => o.id === p.id)) out.push(p)
  }

  return out
}

export function writeExpandedLibrary(targetPath: string): {
  total: number
  added: number
  pixel: number
} {
  const before = loadPatterns().length
  const library = buildExpandedLibrary()
  const serializable = library.map((p) => ({
    id: p.id,
    name: p.name,
    rows: p.rows,
    halfCols: p.halfCols,
    theme: p.theme,
    style: p.style,
    half: p.half,
    ...(p.segments ? { segments: p.segments } : {}),
  }))
  writeFileSync(targetPath, `${JSON.stringify(serializable, null, 2)}\n`, 'utf8')
  return {
    total: library.length,
    added: library.length - before,
    pixel: library.filter((p) => p.style === 'pixel').length,
  }
}

export function defaultPatternsPath(): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  return resolve(here, '../../../data/studio/mirror-draw/patterns.json')
}

export function libraryCoverageSummary(patterns: MirrorPattern[] = loadPatterns()): {
  total: number
  bySizeTheme: Record<string, number>
  shapeFamilies: number
} {
  const bySizeTheme: Record<string, number> = {}
  for (const p of patterns.filter((x) => x.style === 'pixel')) {
    const k = bucketKey(asTheme(p.theme), p.rows)
    bySizeTheme[k] = (bySizeTheme[k] ?? 0) + 1
  }
  return {
    total: patterns.length,
    bySizeTheme,
    shapeFamilies: SHAPE_CATALOG.length,
  }
}
