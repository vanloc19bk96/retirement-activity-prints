import type { CoverPlacementKind } from '@/types/fabric-canvas-item.types'

/** Image panel → editor: put a generated image on the open cover or page. */
export const PLACE_GENERATED_IMAGE_EVENT = 'canvas:place-generated-image'

/** A part of the cover, or the page the editor is on. */
export type GeneratedImagePlacementTarget = CoverPlacementKind | 'page'

export type GeneratedImagePlacementResult = { placedOn: string } | { error: string }

export interface PlaceGeneratedImageEventDetail {
  imageUrl: string
  target: GeneratedImagePlacementTarget
  resolve: (result: GeneratedImagePlacementResult) => void
  /** Set by the listener; still false after dispatch when no editor is mounted. */
  handled: boolean
}

export function placeGeneratedImage(
  imageUrl: string,
  target: GeneratedImagePlacementTarget,
): Promise<GeneratedImagePlacementResult> {
  return new Promise((resolve) => {
    const detail: PlaceGeneratedImageEventDetail = { imageUrl, target, resolve, handled: false }
    window.dispatchEvent(new CustomEvent(PLACE_GENERATED_IMAGE_EVENT, { detail }))
    if (!detail.handled) resolve({ error: 'The editor is not ready yet. Try again in a moment.' })
  })
}

export function onPlaceGeneratedImage(handler: (detail: PlaceGeneratedImageEventDetail) => void): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<PlaceGeneratedImageEventDetail>).detail
    detail.handled = true
    handler(detail)
  }
  window.addEventListener(PLACE_GENERATED_IMAGE_EVENT, listener)
  return () => window.removeEventListener(PLACE_GENERATED_IMAGE_EVENT, listener)
}
