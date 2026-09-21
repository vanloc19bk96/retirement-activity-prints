import type {
  TitleBankEntry,
  TitleCompleteCategory,
  TitleCompleteResponse,
  TitleItem,
  TitleItemCategory,
} from '@/types/studio-title-complete.types'
import { createRng } from '../studio-rng'
import { normalizeEraLabel } from './era'
import { blankOut, restore } from './validate'

import songsBank from '@/data/studio/titles/songs.json'
import filmsBank from '@/data/studio/titles/films.json'
import tvBank from '@/data/studio/titles/tv.json'

const BANKS: Record<'songs' | 'films' | 'tv', TitleBankEntry[]> = {
  songs: songsBank as TitleBankEntry[],
  films: filmsBank as TitleBankEntry[],
  tv: tvBank as TitleBankEntry[],
}

function asCategory(value: unknown): TitleCompleteCategory {
  if (value === 'songs' || value === 'films' || value === 'tv' || value === 'mixed') {
    return value
  }
  return 'mixed'
}

function asEra(value: unknown): string {
  const raw = String(value ?? 'any').trim()
  if (!raw || raw.toLowerCase() === 'any') return 'any'
  return normalizeEraLabel(raw) ?? 'any'
}

function categoryPool(category: TitleCompleteCategory): TitleBankEntry[] {
  return category === 'mixed'
    ? [...BANKS.songs, ...BANKS.films, ...BANKS.tv]
    : [...BANKS[category]]
}

/** Era-matched entries first; empty era filter falls back to the full category bank. */
function poolFor(category: TitleCompleteCategory, era: string): TitleBankEntry[] {
  const base = categoryPool(category)
  if (era === 'any') return base
  const filtered = base.filter((e) => e.era === era)
  return filtered.length > 0 ? filtered : base
}

function toItem(entry: TitleBankEntry): TitleItem | null {
  const displayTitle = blankOut(entry.fullTitle, entry.answer)
  if (!displayTitle) return null
  if (restore(displayTitle, entry.answer) !== entry.fullTitle) return null
  const category: TitleItemCategory =
    entry.category === 'film' || entry.category === 'tv' ? entry.category : 'song'
  return {
    displayTitle,
    answer: entry.answer,
    fullTitle: entry.fullTitle,
    category,
    year: entry.year,
  }
}

function fillFromPool(
  pool: TitleBankEntry[],
  items: TitleItem[],
  seen: Set<string>,
  count: number,
  seed: number,
): void {
  const shuffled = createRng(seed).shuffle(pool)
  for (const entry of shuffled) {
    if (items.length >= count) return
    const item = toItem(entry)
    if (!item) continue
    const key = item.fullTitle.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
}

/** Hand-checked bank used when the AI API is unavailable. */
export function loadCuratedBank(options: {
  category?: unknown
  era?: unknown
  itemCount?: unknown
  seed?: unknown
}): TitleCompleteResponse {
  const category = asCategory(options.category)
  const era = asEra(options.era)
  const count = Math.min(20, Math.max(6, Number(options.itemCount ?? 12)))
  const seed = Number(options.seed ?? 1)

  const items: TitleItem[] = []
  const seen = new Set<string>()
  // Prefer the selected era, then widen so itemCount (e.g. 20) can still be met —
  // some era slices only have 16–19 hand-checked titles.
  fillFromPool(poolFor(category, era), items, seen, count, seed)
  if (items.length < count && era !== 'any') {
    fillFromPool(categoryPool(category), items, seen, count, seed + 1)
  }

  return { items }
}
