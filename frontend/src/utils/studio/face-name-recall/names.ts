import type { StudioConfig } from '@/types/studio-template.types'
import type { FaceNameItem } from '@/types/studio-face-names.types'
import type { StudioRng } from '../studio-rng'
import neutralEn from '@/data/studio/names/neutral-en.json'

export type NameGender = 'male' | 'female' | 'neutral'

export interface NameEntry {
  first: string
  last?: string
  gender: NameGender
  display: string
}

interface PackNameRow {
  first: string
  gender?: string
}

interface NamePack {
  key: string
  label: string
  locale: string
  names: PackNameRow[]
  surnames: string[]
}

const NAME_PACK = neutralEn as NamePack

export function normalizeGender(raw: string | undefined): NameGender {
  const gender = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (gender === 'male' || gender === 'female' || gender === 'neutral') return gender
  return 'neutral'
}

function toDisplay(first: string, last: string | undefined): string {
  return last ? `${first} ${last}` : first
}

/** Map AI / API name rows into worksheet entries (gender travels for face matching). */
export function toNameEntries(
  rows: FaceNameItem[],
  nameStyle: string = 'first',
): NameEntry[] {
  return rows.map((row) => {
    const first = String(row.first ?? '').trim()
    const last =
      nameStyle === 'full' && row.last?.trim() ? String(row.last).trim() : undefined
    return {
      first,
      last,
      gender: normalizeGender(row.gender),
      display: toDisplay(first, last),
    }
  })
}

/** Bundled JSON pack — used only when the AI face-names API fails. */
export function pickNames(config: StudioConfig, count: number, rng: StudioRng): NameEntry[] {
  if (count <= 0) return []

  const nameStyle = String(config.nameStyle ?? 'first')
  const sampled = rng.sample(NAME_PACK.names, Math.min(count, NAME_PACK.names.length))

  const lasts =
    nameStyle === 'full'
      ? rng.sample(NAME_PACK.surnames, Math.min(count, NAME_PACK.surnames.length))
      : []

  return sampled.slice(0, count).map((row, index) => {
    const first = row.first
    const last =
      nameStyle === 'full' ? (lasts[index % lasts.length] ?? lasts[0] ?? 'Smith') : undefined
    return {
      first,
      last,
      gender: normalizeGender(row.gender),
      display: toDisplay(first, last),
    }
  })
}

/**
 * Hand-mixed faces fix the gender of every slot, so the names must move to the
 * faces (the generated path does the opposite). Exact gender first, then a
 * unisex name, then whatever is left — the sheet always fills.
 */
export function orderNamesForGenders(
  entries: NameEntry[],
  genders: ('male' | 'female')[],
): NameEntry[] {
  const pool = [...entries]
  const take = (match: (entry: NameEntry) => boolean): NameEntry | undefined => {
    const index = pool.findIndex(match)
    if (index < 0) return undefined
    return pool.splice(index, 1)[0]
  }

  return genders.map((gender, index) => {
    const picked =
      take((entry) => entry.gender === gender) ??
      take((entry) => entry.gender === 'neutral') ??
      pool.shift()
    if (picked) return picked
    const fallback = `Person ${index + 1}`
    return { first: fallback, gender: 'neutral', display: fallback }
  })
}
