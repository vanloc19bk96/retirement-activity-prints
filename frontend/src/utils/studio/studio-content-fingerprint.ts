import type { StudioFabricObject, StudioPageOutput } from '@/types/studio-template.types'

/**
 * What a mark looks like, beyond where it sits.
 *
 * Two silhouettes drawn on the same anchor — a triangle and a hexagon in the
 * same grid cell — used to fingerprint identically, so a page that swapped
 * every shape read as a duplicate of the original. Vertices, paint, image src,
 * icon name, path, and rotation separate them; position alone does not.
 */
function markSignature(obj: StudioFabricObject): string {
  const parts: string[] = []
  if (obj.radius != null) parts.push(String(Math.round(obj.radius)))
  if (obj.points) {
    parts.push(obj.points.map((p) => `${Math.round(p.x)}/${Math.round(p.y)}`).join('~'))
  }
  if (obj.path) parts.push(JSON.stringify(obj.path))
  if (obj.x1 != null && obj.y1 != null && obj.x2 != null && obj.y2 != null) {
    parts.push(
      `L${Math.round(obj.x1)},${Math.round(obj.y1)}-${Math.round(obj.x2)},${Math.round(obj.y2)}`,
    )
  }
  if (obj.src) parts.push(`src:${obj.src}`)
  if (obj.angle) parts.push(`a${Math.round(obj.angle)}`)
  const iconName = obj.data?.iconName
  if (typeof iconName === 'string' && iconName) parts.push(`icon:${iconName}`)
  if (obj.fill && obj.fill !== 'transparent') parts.push(obj.fill)
  return parts.length > 0 ? `:${parts.join(':')}` : ''
}

/**
 * Fabric `data` key a generator stamps on a figure group to speak for its whole
 * subtree. Mirrors `_shared/uniqueness/hash.ts`, kept as a literal here so this
 * module carries no dependency on the card pack.
 */
const CANONICAL_KEY = 'studioCanonicalKey'

/**
 * Content-only fingerprint of a page: puzzle copy plus the anchor and look of
 * every non-text mark (grid cells, punched holes, answer rings). Header
 * decoration is identical for every seed and would hide real duplicates, so it
 * is excluded.
 */
export function contentFingerprint(objects: StudioFabricObject[]): string {
  const parts: string[] = []
  const walk = (list: StudioFabricObject[]): void => {
    for (const obj of list) {
      // A figure that carries a canonical key has already reduced itself over
      // its own symmetry group: a puzzle rotated 90° draws different vertices
      // but is the same puzzle, and transcribing its marks would report it as
      // new. The key replaces the subtree — it is both more correct and far
      // cheaper than serialising thousands of pip vertices per page.
      const canonicalKey = obj.data?.[CANONICAL_KEY]
      if (typeof canonicalKey === 'string' && canonicalKey) {
        parts.push(`canon:${canonicalKey}`)
        continue
      }
      if (obj.objects) walk(obj.objects)
      if (obj.studioRole === 'decoration') continue
      const text = typeof obj.text === 'string' ? obj.text.trim() : ''
      if (text) {
        parts.push(`${obj.studioRole}:${text}@${Math.round(obj.left)},${Math.round(obj.top)}`)
        continue
      }
      parts.push(
        `${obj.type}@${Math.round(obj.left)},${Math.round(obj.top)}${markSignature(obj)}`,
      )
    }
  }
  walk(objects)
  return parts.join('|')
}

/** Fingerprint across all pages of one generated instance. */
export function pagesContentFingerprint(pages: StudioPageOutput[]): string {
  return pages.map((page) => contentFingerprint(page.objects)).join('#')
}

/**
 * Compact, stable digest of a fingerprint.
 *
 * The raw fingerprint is a full transcript of a sheet — far too long to stamp
 * on every page. This 64-bit FNV-1a pair is short enough to persist with the
 * page, which is what lets a later run see what earlier runs already printed.
 */
export function hashStudioFingerprint(value: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0xc9dc5118
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0
  }
  return `${h1.toString(36)}${h2.toString(36)}`
}
