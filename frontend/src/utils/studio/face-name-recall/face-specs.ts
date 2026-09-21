import { schema as openPeepsSchema } from '@dicebear/open-peeps'
import type { StudioRng } from '../studio-rng'
import type { FaceSpec } from './types'
import type { NameGender } from './names'

export const MIN_DIFFERING_OPTIONS = 2

/** Odds a male face wears a beard — a natural extra cue on male-drawn heads. */
const MALE_FACIAL_HAIR_CHANCE = 0.45
/** Odds any face wears an accessory (glasses / sunglasses / eyepatch). */
const ACCESSORIES_CHANCE = 0.22

/** Faces always read as a concrete gender so every sheet shows a clear male/female mix. */
export type PresentGender = 'male' | 'female'

type SchemaProperties = Record<string, { items?: { enum?: string[] } } | undefined>

function schemaEnum(key: string): readonly string[] {
  const properties = openPeepsSchema.properties as SchemaProperties | undefined
  const values = properties?.[key]?.items?.enum
  if (!values?.length) {
    throw new Error(`[face-name-recall] Open Peeps schema missing enum for "${key}"`)
  }
  return values
}

/** Component pools — full Open Peeps enums, minus user-requested exclusions. */
const HEAD = schemaEnum('head')
const FACE = schemaEnum('face')
/** Beard / goatee / chin only — moustaches alone read too thin at worksheet size. */
const FACIAL_HAIR = schemaEnum('facialHair').filter((id) => !id.startsWith('moustache'))
const ACCESSORIES = schemaEnum('accessories').filter((id) => id !== 'eyepatch')

/** Expressions dropped for everyone (not offered in generate or Mix). */
const EXCLUDED_FACE_IDS = new Set([
  'awe',
  'cyclops',
  'fear',
  'hectic',
  'lovingGrin1',
  'lovingGrin2',
  'monster',
  'rage',
  'smileLOL',
  'smileTeethGap',
])

const USABLE_FACES = FACE.filter((id) => !EXCLUDED_FACE_IDS.has(id))

/** Expression set available to male faces. */
export const HUMAN_FACES = USABLE_FACES
export const MALE_FACES = USABLE_FACES

/** Expressions skipped for female faces only (still available for male when not globally excluded). */
const FEMALE_EXCLUDED_FACE_IDS = new Set(['smileBig'])

export const FEMALE_FACES = USABLE_FACES.filter((id) => !FEMALE_EXCLUDED_FACE_IDS.has(id))

function facePoolFor(gender: PresentGender): readonly string[] {
  return gender === 'male' ? MALE_FACES : FEMALE_FACES
}

export function facePoolForGender(gender: PresentGender): readonly string[] {
  return facePoolFor(gender)
}

const MALE_ACCESSORIES = ACCESSORIES
const FEMALE_ACCESSORIES = ACCESSORIES

function accessoryPoolFor(gender: PresentGender): readonly string[] {
  return gender === 'male' ? MALE_ACCESSORIES : FEMALE_ACCESSORIES
}

export function accessoryPoolForGender(gender: PresentGender): readonly string[] {
  return accessoryPoolFor(gender)
}

/**
 * Open Peeps `head` enum partitioned by gender. Ids in EXCLUDED_HEAD_IDS are
 * skipped for print (poor silhouette / not wanted). Every other schema id must
 * land in exactly one pool. Facial hair only ever pairs with male heads.
 */
const MALE_HEAD_IDS = [
  'afro', 'dreads1', 'dreads2', 'flatTop', 'flatTopLong', 'grayShort',
  'hatBeanie', 'hatHip', 'mohawk', 'mohawk2', 'noHair1', 'noHair2', 'noHair3',
  'pomp', 'shaved1', 'shaved2', 'shaved3', 'short1', 'short2',
  'short4', 'short5', 'turban', 'twists2',
] as const

const FEMALE_HEAD_IDS = [
  'bangs', 'bangs2', 'bantuKnots', 'bun', 'bun2', 'buns', 'cornrows2',
  'grayBun', 'grayMedium', 'hijab', 'long', 'longBangs',
  'medium1', 'medium2', 'medium3', 'mediumBangs', 'mediumBangs2', 'mediumBangs3',
  'mediumStraight',
  // Soft bob — reads feminine on the Man track even with a full beard (Mix Surprise QA).
  'short3',
] as const

/** Heads present in Open Peeps but never offered (auto-generate or Mix). */
const EXCLUDED_HEAD_IDS = [
  // Animal silhouette — not a human face for worksheets.
  'bear',
  'cornrows',
  // Path ink spills far outside the 704 frame; bust crop makes hair dominate the face.
  // No per-head scale in DiceBear — drop oversized styles instead of warping the crop.
  'longAfro',
  'longCurly',
  'twists',
] as const

/** Fail fast if a DiceBear upgrade renames/removes a curated head. */
function validateHeadPool(ids: readonly string[], name: string): readonly string[] {
  for (const id of ids) {
    if (!HEAD.includes(id)) {
      throw new Error(`[face-name-recall] ${name} references unknown head "${id}"`)
    }
  }
  return ids
}

export const MALE_HEADS = validateHeadPool(MALE_HEAD_IDS, 'MALE_HEADS')
export const FEMALE_HEADS = validateHeadPool(FEMALE_HEAD_IDS, 'FEMALE_HEADS')
export const EXCLUDED_HEADS = validateHeadPool(EXCLUDED_HEAD_IDS, 'EXCLUDED_HEADS')

;(() => {
  const assigned = new Set([...MALE_HEADS, ...FEMALE_HEADS, ...EXCLUDED_HEADS])
  for (const id of HEAD) {
    if (!assigned.has(id)) {
      throw new Error(`[face-name-recall] head "${id}" missing from MALE/FEMALE/EXCLUDED pools`)
    }
  }
  for (const id of MALE_HEADS) {
    if (FEMALE_HEADS.includes(id) || EXCLUDED_HEADS.includes(id)) {
      throw new Error(`[face-name-recall] head "${id}" appears in more than one pool`)
    }
  }
  for (const id of FEMALE_HEADS) {
    if (EXCLUDED_HEADS.includes(id)) {
      throw new Error(`[face-name-recall] head "${id}" appears in more than one pool`)
    }
  }
  if (assigned.size !== HEAD.length) {
    throw new Error(
      `[face-name-recall] head pools cover ${assigned.size} ids but schema has ${HEAD.length}`,
    )
  }
})()

function headPoolFor(gender: PresentGender): readonly string[] {
  return gender === 'male' ? MALE_HEADS : FEMALE_HEADS
}

interface VisibleOptions {
  head: string
  face: string
  glasses: string
  facialHair: string
}

function firstOption(options: Record<string, unknown>, key: string): string {
  const value = options[key]
  if (Array.isArray(value)) return String(value[0] ?? '')
  return String(value ?? '')
}

/** Smile expressions clash with facial hair on the Open Peeps ink — keep them clean-shaven. */
const NO_BEARD_FACE_IDS = new Set(['smile', 'smileBig'])

export function faceAllowsFacialHair(faceId: string): boolean {
  return !NO_BEARD_FACE_IDS.has(faceId)
}

function visibleOptions(spec: FaceSpec): VisibleOptions {
  const hasAccessory = Number(spec.options.accessoriesProbability ?? 0) > 0
  const hasFacialHair = Number(spec.options.facialHairProbability ?? 0) > 0
  return {
    head: firstOption(spec.options, 'head'),
    face: firstOption(spec.options, 'face'),
    glasses: hasAccessory ? firstOption(spec.options, 'accessories') || 'none' : 'none',
    facialHair: hasFacialHair ? firstOption(spec.options, 'facialHair') || 'none' : 'none',
  }
}

export function optionDistance(a: FaceSpec, b: FaceSpec): number {
  const left = visibleOptions(a)
  const right = visibleOptions(b)
  let distance = 0
  for (const key of Object.keys(left) as (keyof VisibleOptions)[]) {
    if (left[key] !== right[key]) distance++
  }
  return distance
}

/** Shared monochrome ink base — skin + clothing pinned white so the B&W pass keeps clean line art. */
const INK_BASE = {
  backgroundColor: ['transparent'],
  skinColor: ['ffffff'],
  clothingColor: ['ffffff'],
  maskProbability: 0,
} as const

function baseInkOptions(gender: PresentGender, rng: StudioRng): Record<string, unknown> {
  const accessories = accessoryPoolFor(gender)
  const hasAccessory = rng.chance(ACCESSORIES_CHANCE) && accessories.length > 0
  const options: Record<string, unknown> = {
    ...INK_BASE,
    head: [rng.pick(headPoolFor(gender))],
    face: [rng.pick(facePoolFor(gender))],
    accessoriesProbability: hasAccessory ? 100 : 0,
  }
  if (hasAccessory) options.accessories = [rng.pick(accessories)]
  return options
}

/**
 * Gender drives head + facial hair so a name and its face always agree:
 * - male   → a male-drawn head, may wear a beard (never with smile).
 * - female → a female-drawn head, never any facial hair.
 */
export function buildFaceOptions(
  gender: PresentGender,
  rng: StudioRng,
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    ...baseInkOptions(gender, rng),
    facialHairProbability: 0,
  }

  const faceId = firstOption(options, 'face')
  if (
    gender === 'male' &&
    faceAllowsFacialHair(faceId) &&
    rng.chance(MALE_FACIAL_HAIR_CHANCE)
  ) {
    options.facialHairProbability = 100
    options.facialHair = [rng.pick(FACIAL_HAIR)]
  }
  return options
}

export function randomFaceSpec(gender: PresentGender, rng: StudioRng): FaceSpec {
  return {
    faceSeed: `fp-${rng.int(0, 1_000_000_000)}`,
    options: buildFaceOptions(gender, rng),
  }
}

/**
 * Map name genders to concrete face genders. Explicit male/female names keep their
 * gender; unisex (neutral) names are split toward whichever gender is currently
 * under-represented — so a sheet always shows both a male and a female face, even
 * when the offline name pack is entirely neutral.
 */
export function resolvePresentationGenders(
  genders: NameGender[],
  rng: StudioRng,
): PresentGender[] {
  const resolved: (PresentGender | null)[] = genders.map((gender) =>
    gender === 'male' || gender === 'female' ? gender : null,
  )
  let maleCount = resolved.filter((gender) => gender === 'male').length
  let femaleCount = resolved.filter((gender) => gender === 'female').length

  const neutralOrder = rng.shuffle(
    resolved.flatMap((gender, index) => (gender === null ? [index] : [])),
  )
  for (const index of neutralOrder) {
    if (maleCount <= femaleCount) {
      resolved[index] = 'male'
      maleCount++
    } else {
      resolved[index] = 'female'
      femaleCount++
    }
  }

  return resolved.map((gender) => gender ?? 'female')
}

/**
 * One distinct face per name. `genders[i]` is the name that face i pairs with;
 * neutral names are balanced into a male/female mix before faces are built.
 */
export function buildDistinctFaceSpecs(genders: NameGender[], rng: StudioRng): FaceSpec[] {
  if (genders.length <= 0) return []

  const present = resolvePresentationGenders(genders, rng)
  const specs: FaceSpec[] = []
  const target = present.length
  let guard = 0
  while (specs.length < target && guard++ < target * 50) {
    const candidate = randomFaceSpec(present[specs.length], rng)
    const tooSimilar = specs.some(
      (spec) => optionDistance(spec, candidate) < MIN_DIFFERING_OPTIONS,
    )
    if (!tooSimilar) specs.push(candidate)
  }

  while (specs.length < target) {
    specs.push(randomFaceSpec(present[specs.length], rng))
  }
  return specs
}

/** Exported for tests — schema-backed pools stay in sync with DiceBear upgrades. */
export const FACE_HEAD_POOL = HEAD
export function faceHasFacialHair(options: Record<string, unknown>): boolean {
  return Number(options.facialHairProbability ?? 0) > 0
}

/**
 * One hand-picked face from the “mix your own” mode. Lives inside StudioConfig,
 * so it stays plain JSON — every id is re-validated on the way back out.
 */
export interface FaceMixEntry {
  id: string
  gender: PresentGender
  /** Name typed by the user. Empty means "give this face a generated name". */
  name: string
  head: string
  face: string
  /** Open Peeps facialHair id, or '' for none. Never set on a female face. */
  facialHair: string
  /** Open Peeps accessory id (glasses / sunglasses / eyepatch), or '' for none. */
  glasses: string
}

/** A printed name band only fits so much — longer input is trimmed on the way in. */
export const MAX_FACE_NAME_LENGTH = 24

/** Pools the mix dialog offers — same sets the generator draws from. */
export const FACIAL_HAIR_POOL = FACIAL_HAIR
/** Full accessory enum (male). Prefer `accessoryPoolForGender` for UI. */
export const GLASSES_POOL = ACCESSORIES

export function headPoolForGender(gender: PresentGender): readonly string[] {
  return headPoolFor(gender)
}

export function buildMixedFaceOptions(entry: FaceMixEntry): Record<string, unknown> {
  const canWearBeard =
    entry.gender === 'male' &&
    Boolean(entry.facialHair) &&
    faceAllowsFacialHair(entry.face)
  const options: Record<string, unknown> = {
    ...INK_BASE,
    head: [entry.head],
    face: [entry.face],
    accessoriesProbability: entry.glasses ? 100 : 0,
    facialHairProbability: canWearBeard ? 100 : 0,
  }
  if (entry.glasses) options.accessories = [entry.glasses]
  if (canWearBeard) options.facialHair = [entry.facialHair]
  return options
}

export function faceSpecFromMix(entry: FaceMixEntry): FaceSpec {
  return { faceSeed: `fp-mix-${entry.id}`, options: buildMixedFaceOptions(entry) }
}

/**
 * Re-validate a stored mix entry: a DiceBear upgrade (or a hand-edited config)
 * must never reach `createAvatar` with an id the schema no longer knows.
 * Returns null when the head/expression cannot be honoured.
 */
export function normalizeFaceMixEntry(raw: unknown): FaceMixEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const gender: PresentGender = row.gender === 'male' ? 'male' : 'female'
  const head = String(row.head ?? '')
  const face = String(row.face ?? '')
  if (!headPoolFor(gender).includes(head) || !facePoolFor(gender).includes(face)) return null

  const facialHair = String(row.facialHair ?? '')
  const glasses = String(row.glasses ?? '')
  return {
    id: String(row.id ?? '') || `mix-${head}-${face}`,
    gender,
    // Do not trim here — live rename re-parses on every keystroke; trimming
    // would eat the trailing space needed to type a multi-word name.
    name: String(row.name ?? '').slice(0, MAX_FACE_NAME_LENGTH),
    head,
    face,
    // Facial hair only on male heads, and never with smile expressions.
    facialHair:
      gender === 'male' &&
      faceAllowsFacialHair(face) &&
      FACIAL_HAIR.includes(facialHair)
        ? facialHair
        : '',
    glasses: accessoryPoolFor(gender).includes(glasses) ? glasses : '',
  }
}

export function parseFaceMixEntries(raw: unknown): FaceMixEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => normalizeFaceMixEntry(row))
    .filter((entry): entry is FaceMixEntry => entry !== null)
}

/** Seeds (and shuffles) the mix dialog with a face the generator could have drawn. */
export function randomFaceMixEntry(gender: PresentGender, rng: StudioRng): FaceMixEntry {
  const options = buildFaceOptions(gender, rng)
  return {
    id: `mix-${rng.int(0, 1_000_000_000)}`,
    gender,
    name: '',
    head: firstOption(options, 'head'),
    face: firstOption(options, 'face'),
    facialHair: faceHasFacialHair(options) ? firstOption(options, 'facialHair') : '',
    glasses:
      Number(options.accessoriesProbability ?? 0) > 0
        ? firstOption(options, 'accessories')
        : '',
  }
}
