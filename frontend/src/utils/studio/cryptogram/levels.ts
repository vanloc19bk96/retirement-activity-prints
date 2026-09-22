import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'
import type { CryptogramSayingLength } from '@/types/studio-cryptogram.types'

/**
 * The one difficulty decision a cryptogram page asks for.
 *
 * The old form asked four separate questions to get here — saying length,
 * print style, puzzles per page, and a write-my-own-theme toggle on top of a
 * category and a theme. Three of those four are consequences of the first, and
 * two of them could be set against each other: six long sayings on a 5 x 8
 * paperback is a request no page can honour, so the form quietly clamped it
 * and printed something the seller never chose.
 *
 * One plain-language level answers all of it. Print style is gone because
 * every page is large print — `layout.ts` holds the floor. Puzzle counts here
 * are *targets*: the page decides what actually prints, stepping the count
 * down until every saying still sets at the large-print floor, and the level's
 * help line reports what that produced on the trim in Settings.
 */
export type CryptogramLevelId = 'gentle' | 'classic' | 'challenging'

export type { CryptogramSayingLength }

export interface CryptogramLevel {
  id: CryptogramLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Saying length band asked of the writer; mirrors the API's own ranges. */
  length: CryptogramSayingLength
  /** Puzzles the page aims for, before the page-size cap. */
  targetPuzzles: number
  /**
   * Letters filled in before the solver starts.
   *
   * A cryptogram with nothing given is a blank wall: the first letter costs
   * far more effort than the last twenty, and that first wall is where a
   * reader puts the book down. Starters are whole letters, not single slots —
   * every E on the page appears at once — so they teach the rule the puzzle
   * runs on instead of working against it.
   */
  starterLetters: number
}

export const CRYPTOGRAM_LEVELS: readonly CryptogramLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — short sayings, three letters given',
    length: 'short',
    targetPuzzles: 3,
    starterLetters: 3,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    length: 'medium',
    targetPuzzles: 3,
    starterLetters: 1,
  },
  {
    id: 'challenging',
    label: 'Challenging — longer sayings, nothing given',
    length: 'long',
    targetPuzzles: 2,
    starterLetters: 0,
  },
]

export const DEFAULT_CRYPTOGRAM_LEVEL_ID: CryptogramLevelId = 'classic'

const LEVEL_INDEX = new Map(CRYPTOGRAM_LEVELS.map((level) => [level.id, level]))

export const CRYPTOGRAM_LEVEL_OPTIONS: StudioSelectOption[] = CRYPTOGRAM_LEVELS.map(
  (level) => ({ label: level.label, value: level.id }),
)

/** Sheets saved before the ladder replaced length + print style + count. */
function legacyLevelId(config: StudioConfig): CryptogramLevelId | null {
  const length = config.length
  if (length === 'short') return 'gentle'
  if (length === 'long') return 'challenging'
  if (length === 'medium') return 'classic'
  return null
}

export function parseCryptogramLevel(config: StudioConfig): CryptogramLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as CryptogramLevelId)
  if (chosen) return chosen
  const legacy = legacyLevelId(config)
  return (
    (legacy ? LEVEL_INDEX.get(legacy) : undefined) ??
    LEVEL_INDEX.get(DEFAULT_CRYPTOGRAM_LEVEL_ID)!
  )
}
