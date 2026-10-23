import type { SpineDesign } from '@/types/book-cover-spine.types'

/** Spine panel → cover canvas: make the spine match this design. */
export const APPLY_SPINE_DESIGN_EVENT = 'cover:apply-spine-design'
/** Spine panel → cover canvas: delete every spine object. */
export const REMOVE_SPINE_DESIGN_EVENT = 'cover:remove-spine-design'
/** Spine panel → cover canvas: reply with {@link SPINE_STATE_EVENT}. */
export const REQUEST_SPINE_STATE_EVENT = 'cover:request-spine-state'
/** Cover canvas → Spine panel: current design and colors sampled from the cover. */
export const SPINE_STATE_EVENT = 'cover:spine-state'

export interface ApplySpineDesignEventDetail {
  design: SpineDesign
}

export interface RequestSpineStateEventDetail {
  requestId: number
}

export interface SpineStateEventDetail {
  /** Echoes the request this answers; null when sent after an apply. */
  requestId: number | null
  /** False when the cover canvas is not mounted yet. */
  isCoverReady: boolean
  design: SpineDesign | null
  palette: string[]
}

export function dispatchApplySpineDesign(design: SpineDesign): void {
  window.dispatchEvent(
    new CustomEvent<ApplySpineDesignEventDetail>(APPLY_SPINE_DESIGN_EVENT, { detail: { design } }),
  )
}

export function dispatchRemoveSpineDesign(): void {
  window.dispatchEvent(new CustomEvent(REMOVE_SPINE_DESIGN_EVENT))
}

export function dispatchRequestSpineState(requestId: number): void {
  window.dispatchEvent(
    new CustomEvent<RequestSpineStateEventDetail>(REQUEST_SPINE_STATE_EVENT, {
      detail: { requestId },
    }),
  )
}

export function dispatchSpineState(detail: SpineStateEventDetail): void {
  window.dispatchEvent(new CustomEvent<SpineStateEventDetail>(SPINE_STATE_EVENT, { detail }))
}

export function onSpineState(handler: (detail: SpineStateEventDetail) => void): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<SpineStateEventDetail>).detail)
  }
  window.addEventListener(SPINE_STATE_EVENT, listener)
  return () => window.removeEventListener(SPINE_STATE_EVENT, listener)
}
