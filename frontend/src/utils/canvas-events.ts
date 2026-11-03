export const CANVAS_LIVE_EVENT = 'canvas:live'

export function dispatchCanvasLive(canvasIndex: number): void {
  window.dispatchEvent(new CustomEvent(CANVAS_LIVE_EVENT, { detail: { canvasIndex } }))
}

/** The cover canvas took a new size from Book Info and its objects were laid out again. */
export const COVER_CANVAS_RESIZED_EVENT = 'canvas:cover-resized'

export function dispatchCoverCanvasResized(): void {
  window.dispatchEvent(new CustomEvent(COVER_CANVAS_RESIZED_EVENT))
}

/** Loading a canvas lost an image for good (`images-removed`) or could not finish (`failed`). */
export const CANVAS_LOAD_PROBLEM_EVENT = 'canvas:load-problem'

export type CanvasLoadProblemEventDetail = {
  canvasIndex: number
  problem: 'images-removed' | 'failed'
}

export function dispatchCanvasLoadProblem(detail: CanvasLoadProblemEventDetail): void {
  window.dispatchEvent(new CustomEvent(CANVAS_LOAD_PROBLEM_EVENT, { detail }))
}
