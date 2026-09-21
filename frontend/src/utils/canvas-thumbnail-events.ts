export const CANVAS_THUMBNAIL_INVALIDATED_EVENT = 'canvas:thumbnail-invalidated'

export type CanvasThumbnailInvalidatedEventDetail = {
  canvasIndex: number
}

export function dispatchCanvasThumbnailInvalidated(canvasIndex: number): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<CanvasThumbnailInvalidatedEventDetail>(CANVAS_THUMBNAIL_INVALIDATED_EVENT, {
      detail: {
        canvasIndex,
      },
    }),
  )
}
