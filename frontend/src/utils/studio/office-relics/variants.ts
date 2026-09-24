import { createRngFromSeedInput } from '../_shared/uniqueness'
import {
  RELIC_ART,
  referenceKnobs,
  type RelicDrawing,
  type RelicDrawingId,
  type RelicElement,
  type RelicKnobValues,
} from './drawings'
import { elementPathData } from './picture'

/**
 * Which version of an object's drawing a picture prints.
 *
 * The picture library is shared by every seller, so without this two sellers'
 * books would print the very same typewriter, line for line — the kind of
 * sameness a marketplace review of two puzzle books notices first. Each
 * drawing exposes knobs (drawer count, key shape, which way it faces), and each
 * picture on a page is dealt one combination from a stream keyed by the
 * seller's puzzle salt, the page seed and the object. Two sellers therefore
 * print the same version of an object about as often as one in the number of
 * versions it has (8 to 48), and a page of nine pictures matching another
 * seller's picture for picture practically never happens.
 *
 * Within one seller, the versions of an object printed lately are passed over
 * while others remain, so a seller's second book does not reuse the first
 * book's pictures either.
 *
 * The deal is a pure function of (salt, seed, object, recent history), and the
 * seed is persisted with the page, so regenerating a book reprints it exactly.
 */

export interface RelicVariant {
  knobs: RelicKnobValues
  mirrored: boolean
}

/** Bump only to reshuffle every seller's pictures; adding a knob does not need it. */
const ART_STREAM = 'art-v1'

/** Stable, readable name of a version: `drawers1.handle2.feet0` plus `.m` when mirrored. */
export function variantKey(id: RelicDrawingId, variant: RelicVariant): string {
  const knobs = Object.keys(RELIC_ART[id].knobs).map((name) => `${name}${variant.knobs[name] ?? 0}`)
  return [...knobs, ...(variant.mirrored ? ['m'] : [])].join('.') || 'ref'
}

export const referenceVariant = (id: RelicDrawingId): RelicVariant => ({
  knobs: referenceKnobs(RELIC_ART[id]),
  mirrored: false,
})

/** A version the drawing really has: every knob named, each choice in range, mirrored only where allowed. */
export function isValidVariant(id: RelicDrawingId, variant: RelicVariant): boolean {
  const art = RELIC_ART[id]
  if (!art) return false
  if (variant.mirrored && !art.mirror) return false
  const names = Object.keys(art.knobs)
  if (Object.keys(variant.knobs).length !== names.length) return false
  return names.every((name) => {
    const value = variant.knobs[name]
    return Number.isInteger(value) && value! >= 0 && value! < art.knobs[name]!
  })
}

const variantCache = new Map<RelicDrawingId, RelicVariant[]>()

/** Every version of a drawing, reference first. */
export function relicVariants(id: RelicDrawingId): RelicVariant[] {
  const cached = variantCache.get(id)
  if (cached) return cached
  const art = RELIC_ART[id]
  let combos: Record<string, number>[] = [{}]
  for (const [name, count] of Object.entries(art.knobs)) {
    combos = combos.flatMap((combo) => Array.from({ length: count }, (_, value) => ({ ...combo, [name]: value })))
  }
  const variants = combos.flatMap((knobs) => [
    { knobs, mirrored: false },
    ...(art.mirror ? [{ knobs, mirrored: true }] : []),
  ])
  variantCache.set(id, variants)
  return variants
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Path data reflected left to right inside a canvas `width` wide.
 *
 * Absolute commands only — the library never writes relative ones. An arc keeps
 * its radii and flips its sweep, so a rounded corner stays the same corner.
 */
export function mirrorPathData(d: string, width: number): string {
  const flip = (x: number) => r2(width - x)
  const out: string[] = []
  for (const [, op, args] of d.matchAll(/([MLHVQCAZ])([^MLHVQCAZ]*)/g)) {
    const nums = (args!.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)
    switch (op) {
      case 'Z':
        out.push('Z')
        break
      case 'H':
        out.push(`H${nums.map(flip).join(' ')}`)
        break
      case 'V':
        out.push(`V${nums.join(' ')}`)
        break
      case 'A': {
        const parts: number[] = []
        for (let i = 0; i + 6 < nums.length; i += 7) {
          const [rx, ry, rot, large, sweep, x, y] = nums.slice(i, i + 7) as [number, number, number, number, number, number, number]
          parts.push(rx, ry, rot === 0 ? 0 : -rot, large, sweep ? 0 : 1, flip(x), y)
        }
        out.push(`A${parts.join(' ')}`)
        break
      }
      default: {
        const parts: number[] = []
        for (let i = 0; i + 1 < nums.length; i += 2) parts.push(flip(nums[i]!), nums[i + 1]!)
        out.push(`${op}${parts.join(' ')}`)
      }
    }
  }
  return out.join(' ')
}

function mirrorElement(element: RelicElement, width: number): RelicElement {
  const [shape, attrs] = element
  const style: Record<string, string | number> = {}
  if (attrs.fine) style.fine = attrs.fine
  if (attrs.fill) style.fill = attrs.fill
  return ['path', { d: mirrorPathData(elementPathData([shape, attrs]), width), ...style }]
}

const drawingCache = new Map<string, RelicDrawing>()

/**
 * The drawing a version prints. Cached per version, so every picture of it is
 * the same object and its measured ink box is computed once.
 */
export function relicArtDrawing(id: RelicDrawingId, variant: RelicVariant): RelicDrawing {
  const cacheKey = `${id}|${variantKey(id, variant)}`
  const cached = drawingCache.get(cacheKey)
  if (cached) return cached
  const drawn = RELIC_ART[id].draw(variant.knobs)
  const drawing = variant.mirrored
    ? { ...drawn, elements: drawn.elements.map((element) => mirrorElement(element, drawn.width)) }
    : drawn
  drawingCache.set(cacheKey, drawing)
  return drawing
}

/** `id:version` — how the variety ledger remembers a picture. */
export const artLabel = (id: RelicDrawingId, variant: RelicVariant) => `${id}:${variantKey(id, variant)}`

/**
 * The version one picture on one page prints.
 *
 * Keyed by salt, seed and object, so two sellers on the same seed still print
 * different versions, and adding an object to a page never re-deals the others.
 * Versions in `recent` (this seller's `id:version` labels) are passed over
 * while any other remains.
 */
export function dealRelicVariant(options: {
  id: RelicDrawingId
  ownerSalt: string
  seed: number
  recent?: ReadonlySet<string>
}): RelicVariant {
  const { id, ownerSalt, seed, recent } = options
  const rng = createRngFromSeedInput({
    ownerSalt,
    templateKey: 'office-relics',
    configHash: ART_STREAM,
    pageNonce: seed,
    stream: id,
  })
  const all = relicVariants(id)
  const fresh = recent ? all.filter((variant) => !recent.has(artLabel(id, variant))) : all
  return rng.pick(fresh.length > 0 ? fresh : all)
}
