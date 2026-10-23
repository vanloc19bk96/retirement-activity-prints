/**
 * The occupation behind a job-themed page, and the two fields that ask for it.
 *
 * Four games can be written for one line of work — the Occupation Trivia Pack,
 * Work Lingo Match, Office Awards and Career By the Numbers — because sellers
 * build sub-niche books ("for Retired Firefighters") whose title only holds up
 * if a few of the games inside are about that job. Every one of them asks the
 * same way: a preset picker, and above it a switch to type one's own, the same
 * shape as the theme picker's "Write my own theme".
 *
 * A typed job is planned by the content service (`app/services/studio_occupation.py`):
 * it decides whether a warm, KDP-safe page can be written for that job and,
 * when it cannot, says why — and the form shows that reason as the error. The
 * checks here are the ones that need no AI, mirrored from the service's own
 * (`app/data/studio/occupations/prompt.json`) so the form catches a company
 * name or a refused job before anything is sent; a test keeps the lists equal.
 */

import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import type { OccupationKey } from '@/types/studio-occupation-trivia.types'

export interface PresetOccupation {
  value: OccupationKey
  label: string
}

/** The hand-written profiles in the service's data, in its order; a test keeps them identical. */
export const PRESET_OCCUPATIONS: readonly PresetOccupation[] = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'police', label: 'Police' },
  { value: 'military', label: 'Military' },
  { value: 'trucker', label: 'Trucker' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'postal', label: 'Postal' },
]

/** The service's name limits (`occupations/prompt.json` → `limits`). */
export const OCCUPATION_NAME_MAX = 40
export const OCCUPATION_NAME_MAX_WORDS = 5
const OCCUPATION_NAME_MIN_LETTERS = 3

/** Mirror `refusedTerms` and `brandTerms` in `occupations/prompt.json`. */
export const OCCUPATION_REFUSED_TERMS = [
  'sex', 'sexy', 'porn', 'porno', 'pornographic', 'escort', 'stripper', 'prostitute', 'pimp', 'brothel',
  'adult film', 'adult entertainer', 'camgirl', 'hitman', 'hit man', 'assassin', 'mercenary', 'terrorist',
  'drug dealer', 'dealer of drugs', 'drug lord', 'smuggler', 'trafficker', 'hacker', 'scammer', 'con artist',
  'thief', 'burglar', 'gangster', 'mobster', 'executioner', 'torturer', 'sniper', 'bookie', 'bootlegger',
  'moonshiner', 'pickpocket', 'loan shark', 'cult leader',
] as const
export const OCCUPATION_BRAND_TERMS = [
  'disney', 'netflix', 'facebook', 'google', 'amazon', 'microsoft', 'apple', 'ibm', 'walmart', 'target',
  'costco', 'starbucks', 'mcdonald', 'mcdonalds', 'burger king', 'coca-cola', 'coca cola', 'pepsi', 'kodak',
  'xerox', 'fedex', 'ups', 'dhl', 'usps', 'nasa', 'boeing', 'ford', 'chevrolet', 'chevy', 'gm', 'tesla', 'uber',
  'lyft', 'harley', 'nike', 'ikea', 'home depot', 'kroger', 'sears',
] as const

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (terms: readonly string[]) => new RegExp(`\\b(${terms.map(escape).join('|')})\\b`, 'i')
const REFUSED_RE = wordPattern(OCCUPATION_REFUSED_TERMS)
const BRAND_RE = wordPattern(OCCUPATION_BRAND_TERMS)
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 '&/.-]*$/

/** The typed name as it should read: straight apostrophes, single spaces. Mirrors `clean_occupation`. */
export function cleanOccupation(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** What a typed job is remembered and labelled by. Mirrors `fold_occupation`. */
export function foldOccupation(raw: unknown): string {
  return cleanOccupation(raw).toLowerCase()
}

/** Why a typed name cannot be sent, in the service's own words, or null. */
export function occupationNameProblem(raw: unknown): string | null {
  const name = cleanOccupation(raw)
  if (!name) return 'Type an occupation.'
  if (name.length > OCCUPATION_NAME_MAX) return `Keep the occupation under ${OCCUPATION_NAME_MAX} characters.`
  if (name.split(' ').length > OCCUPATION_NAME_MAX_WORDS) {
    return `Keep the occupation to ${OCCUPATION_NAME_MAX_WORDS} words or fewer.`
  }
  if (!NAME_RE.test(name) || (name.match(/[A-Za-z]/g)?.length ?? 0) < OCCUPATION_NAME_MIN_LETTERS) {
    return 'Use letters and spaces for the occupation, like “Firefighter” or “Bus driver”.'
  }
  if (BRAND_RE.test(name)) return 'Name the job rather than a company or brand, like “Delivery driver”.'
  if (REFUSED_RE.test(name)) return 'This occupation can’t be used in a KDP activity book. Please choose another.'
  return null
}

/** The preset a typed name means ("teacher", "Police"), so a preset is never planned twice. */
export function presetForName(raw: unknown): OccupationKey | null {
  const folded = foldOccupation(raw)
  return PRESET_OCCUPATIONS.find((o) => folded === o.value || folded === o.label.toLowerCase())?.value ?? null
}

/** A typed job as a heading reads it: "bus driver" → "Bus Driver"; "HVAC technician" kept. */
export function occupationTitle(raw: unknown): string {
  return cleanOccupation(raw).replace(/(^|[\s/-])([a-z])/g, (_, edge: string, letter: string) => edge + letter.toUpperCase())
}

/* ------------------------------------------------------------------ *
 * The form.
 * ------------------------------------------------------------------ */

export const WRITE_OWN_OCCUPATION_KEY = 'writeOwnOccupation'
export const CUSTOM_OCCUPATION_KEY = 'customOccupation'

export function parseWriteOwnOccupation(config: StudioConfig): boolean {
  return config[WRITE_OWN_OCCUPATION_KEY] === true
}

/** `visibleWhen` for a game's preset picker: hidden while the seller types their own. */
export const isPresetOccupation = (config: StudioConfig) => !parseWriteOwnOccupation(config)

/** The switch that swaps a game's preset picker for the `customOccupation` box. */
export function writeOwnOccupationField(label = 'Type my own occupation'): StudioConfigField {
  return { key: WRITE_OWN_OCCUPATION_KEY, label, type: 'toggle', default: false }
}

export function customOccupationField(help: string): StudioConfigField {
  return {
    key: CUSTOM_OCCUPATION_KEY,
    label: 'Occupation',
    type: 'text',
    default: '',
    max: OCCUPATION_NAME_MAX,
    placeholder: 'e.g. Firefighter',
    visibleWhen: parseWriteOwnOccupation,
    help,
  }
}

/**
 * The job the seller typed, cleaned, or '' when the switch is off.
 *
 * A typed preset ("Teacher") is not a typed job: callers get '' and fall back
 * to the preset, which is better written than a plan of the same job.
 */
export function typedOccupation(config: StudioConfig): string {
  if (!parseWriteOwnOccupation(config)) return ''
  const name = cleanOccupation(config[CUSTOM_OCCUPATION_KEY])
  return presetForName(name) ? '' : name
}

/**
 * The job the seller typed, cleaned, presets included, or '' when the switch
 * is off: for games whose own presets are kinds of workplace rather than jobs,
 * where "Teacher" is a job to plan like any other.
 */
export function typedOccupationName(config: StudioConfig): string {
  return parseWriteOwnOccupation(config) ? cleanOccupation(config[CUSTOM_OCCUPATION_KEY]) : ''
}

/** The preset a typed name meant, when the switch is on and it names one. */
export function typedPreset(config: StudioConfig): OccupationKey | null {
  return parseWriteOwnOccupation(config) ? presetForName(config[CUSTOM_OCCUPATION_KEY]) : null
}

export function validateTypedOccupation(config: StudioConfig): StudioConfigValidationError | null {
  if (!parseWriteOwnOccupation(config)) return null
  const problem = occupationNameProblem(config[CUSTOM_OCCUPATION_KEY])
  return problem ? { field: CUSTOM_OCCUPATION_KEY, message: problem } : null
}
