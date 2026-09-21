import { generateFaceNames } from '@/api/studio-face-names.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type { FaceNameStyle } from '@/types/studio-face-names.types'
import { createRng } from '../studio-rng'
import { orderNamesForGenders, pickNames, toNameEntries, type NameEntry } from './names'
import {
  buildDistinctFaceSpecs,
  faceSpecFromMix,
  parseFaceMixEntries,
  type FaceMixEntry,
} from './face-specs'
import { renderFaceSvg } from './face-preview'
import { rasterizeSvgToPngDataUri } from './rasterize'
import type { FaceAsset, FaceNamePrefetchResult, FaceSpec } from './types'

function asNameStyle(value: unknown): FaceNameStyle {
  return value === 'full' ? 'full' : 'first'
}

async function resolveNames(
  config: StudioConfig,
  pairCount: number,
  signal: AbortSignal,
): Promise<NameEntry[]> {
  const seed = Number(config.seed ?? 1)
  const nameStyle = asNameStyle(config.nameStyle)
  const rng = createRng(seed)
  const varietyKey = studioVarietyKey('face-name-recall', nameStyle)

  try {
    const response = await generateFaceNames(
      {
        count: pairCount,
        nameStyle,
        seed,
        avoid: studioAvoidList(varietyKey),
      },
      signal,
    )
    const entries = toNameEntries(response.names, nameStyle).filter((entry) => entry.first)
    rememberStudioContent(
      varietyKey,
      entries.map((entry) => entry.first),
    )
    if (entries.length >= pairCount) return entries.slice(0, pairCount)
    // Partial AI payload — top up from local pack so the sheet still fills.
    const used = new Set(entries.map((entry) => entry.first.toLowerCase()))
    const extras = pickNames(config, pairCount, rng).filter(
      (entry) => !used.has(entry.first.toLowerCase()),
    )
    return [...entries, ...extras].slice(0, pairCount)
  } catch (error) {
    if (signal.aborted) throw error
    // Offline / API outage: still produce a valid printable page.
    console.warn('[face-name-recall] AI names failed; using bundled fallback', error)
    return pickNames(config, pairCount, rng)
  }
}

/**
 * Names for a hand-mixed cast: what the user typed wins, and every face left
 * blank takes a generated name of its own gender.
 */
export function resolveMixedPeople(
  entries: FaceMixEntry[],
  generated: NameEntry[],
): NameEntry[] {
  const filler = orderNamesForGenders(
    generated,
    entries
      .filter((entry) => !entry.name.trim())
      .map((entry) => entry.gender),
  )
  let next = 0
  return entries.map((entry) => {
    const name = entry.name.trim()
    return name
      ? { first: name, gender: entry.gender, display: name }
      : (filler[next++] ?? { first: '', gender: entry.gender, display: '' })
  })
}

export async function faceNamePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<FaceNamePrefetchResult> {
  const rng = createRng(Number(config.seed ?? 1))
  // "Mix your own" replaces the generated cast — the picked faces set the count.
  const mixEntries =
    config.faceMode === 'custom' ? parseFaceMixEntries(config.faceMix) : []
  const isMixed = mixEntries.length > 0
  // Hand-typed names need nothing from the API; only unnamed faces do.
  const unnamed = mixEntries.filter((entry) => !entry.name.trim())
  const nameCount = isMixed ? unnamed.length : Number(config.pairCount ?? 6)

  // Names first (AI, with JSON fallback) — gender ties each name to its face.
  const names = nameCount > 0 ? await resolveNames(config, nameCount, signal) : []

  let specs: FaceSpec[]
  let people: NameEntry[]
  if (isMixed) {
    // Faces are fixed here, so the names move to them instead of the other way round.
    specs = mixEntries.map((entry) => faceSpecFromMix(entry))
    people = resolveMixedPeople(mixEntries, names)
  } else {
    specs = buildDistinctFaceSpecs(
      names.map((entry) => entry.gender),
      rng,
    )
    people = names
  }

  const faces: FaceAsset[] = await Promise.all(
    specs.map(async (spec) => {
      const svg = renderFaceSvg(spec)
      const { dataUri, naturalSize } = await rasterizeSvgToPngDataUri(svg)
      return {
        faceSeed: spec.faceSeed,
        svg,
        dataUri,
        naturalSize,
      }
    }),
  )

  return { faces, names: people.map((entry) => entry.display) }
}
