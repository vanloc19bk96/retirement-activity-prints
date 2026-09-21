import indexJson from '@/data/studio/wordlists/index.json'
import animalsEn from '@/data/studio/wordlists/animals-en.json'
import foodEn from '@/data/studio/wordlists/food-en.json'
import natureEn from '@/data/studio/wordlists/nature-en.json'
import householdEn from '@/data/studio/wordlists/household-en.json'
import bodyEn from '@/data/studio/wordlists/body-en.json'
import sportsEn from '@/data/studio/wordlists/sports-en.json'
import travelEn from '@/data/studio/wordlists/travel-en.json'
import schoolEn from '@/data/studio/wordlists/school-en.json'
import musicEn from '@/data/studio/wordlists/music-en.json'
import spaceEn from '@/data/studio/wordlists/space-en.json'

export interface WordlistMeta {
  key: string
  label: string
  locale: string
  count: number
}

const THEME_WORDS: Record<string, readonly string[]> = {
  animals: animalsEn,
  food: foodEn,
  nature: natureEn,
  household: householdEn,
  body: bodyEn,
  sports: sportsEn,
  travel: travelEn,
  school: schoolEn,
  music: musicEn,
  space: spaceEn,
}

const META_BY_KEY = new Map(
  (indexJson as WordlistMeta[]).map((entry) => [entry.key, entry]),
)

export function listThemeMeta(): WordlistMeta[] {
  return indexJson as WordlistMeta[]
}

export function themeLabel(key: string): string {
  return META_BY_KEY.get(key)?.label ?? 'Word Search'
}

/** Uppercase A–Z words from a bundled theme (falls back to animals). */
export function loadThemeWords(themeKey: string): string[] {
  const pool = THEME_WORDS[themeKey] ?? THEME_WORDS.animals
  return pool.map((w) => w.toUpperCase())
}
