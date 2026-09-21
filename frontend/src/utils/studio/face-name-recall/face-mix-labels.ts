import type { FaceMixEntry } from './face-specs'

/** `mediumBangs2` → “Medium bangs 2”. DiceBear ids are camelCase with a trailing index. */
export function humanizeFaceOptionId(id: string): string {
  const spaced = id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .trim()
  if (!spaced) return ''
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export function faceGenderLabel(gender: FaceMixEntry['gender']): string {
  return gender === 'male' ? 'Man' : 'Woman'
}

/** Alt text so a screen reader can tell two hand-mixed faces apart. */
export function describeFaceMixEntry(entry: FaceMixEntry): string {
  const parts = [
    faceGenderLabel(entry.gender),
    `${humanizeFaceOptionId(entry.head)} hair`,
    humanizeFaceOptionId(entry.face),
  ]
  if (entry.facialHair) parts.push(humanizeFaceOptionId(entry.facialHair))
  if (entry.glasses) parts.push(humanizeFaceOptionId(entry.glasses))
  return parts.join(', ')
}
