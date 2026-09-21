export const CANVAS_LIVE_EVENT = 'canvas:live'

export function dispatchCanvasLive(canvasIndex: number): void {
  window.dispatchEvent(new CustomEvent(CANVAS_LIVE_EVENT, { detail: { canvasIndex } }))
}
