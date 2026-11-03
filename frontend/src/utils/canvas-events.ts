export const CANVAS_LIVE_EVENT = 'canvas:live'

export function dispatchCanvasLive(canvasIndex: number): void {
  window.dispatchEvent(new CustomEvent(CANVAS_LIVE_EVENT, { detail: { canvasIndex } }))
}

/** The cover canvas took a new size from Book Info and its objects were laid out again. */
export const COVER_CANVAS_RESIZED_EVENT = 'canvas:cover-resized'

export function dispatchCoverCanvasResized(): void {
  window.dispatchEvent(new CustomEvent(COVER_CANVAS_RESIZED_EVENT))
}
