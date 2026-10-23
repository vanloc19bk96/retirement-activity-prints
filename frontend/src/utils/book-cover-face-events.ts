import type { CoverFace, CoverFaceDesign } from '@/types/book-cover-face.types'

/** Front / Back cover panel → cover canvas: make that face match this design. */
export const APPLY_COVER_FACE_DESIGN_EVENT = 'cover:apply-face-design'
/** Front / Back cover panel → cover canvas: delete the face's managed objects. */
export const REMOVE_COVER_FACE_DESIGN_EVENT = 'cover:remove-face-design'
/** Panel → cover canvas: reply with {@link COVER_FACE_STATE_EVENT}. */
export const REQUEST_COVER_FACE_STATE_EVENT = 'cover:request-face-state'
/** Cover canvas → panel: current design and colors sampled from the cover. */
export const COVER_FACE_STATE_EVENT = 'cover:face-state'

export interface ApplyCoverFaceDesignEventDetail {
  face: CoverFace
  design: CoverFaceDesign
  /** Move text the user dragged back to its automatic spot. */
  resetPositions?: boolean
}

export interface RemoveCoverFaceDesignEventDetail {
  face: CoverFace
}

export interface RequestCoverFaceStateEventDetail {
  requestId: number
  face: CoverFace
}

export interface CoverFaceStateEventDetail {
  requestId: number
  face: CoverFace
  /** False when the cover canvas is not mounted yet. */
  isCoverReady: boolean
  design: CoverFaceDesign | null
  palette: string[]
  /** Some text was dragged on the canvas, away from its automatic spot. */
  hasManualPositions: boolean
}

export function dispatchApplyCoverFaceDesign(detail: ApplyCoverFaceDesignEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<ApplyCoverFaceDesignEventDetail>(APPLY_COVER_FACE_DESIGN_EVENT, { detail }),
  )
}

export function dispatchRemoveCoverFaceDesign(face: CoverFace): void {
  window.dispatchEvent(
    new CustomEvent<RemoveCoverFaceDesignEventDetail>(REMOVE_COVER_FACE_DESIGN_EVENT, {
      detail: { face },
    }),
  )
}

export function dispatchRequestCoverFaceState(detail: RequestCoverFaceStateEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<RequestCoverFaceStateEventDetail>(REQUEST_COVER_FACE_STATE_EVENT, { detail }),
  )
}

export function dispatchCoverFaceState(detail: CoverFaceStateEventDetail): void {
  window.dispatchEvent(new CustomEvent<CoverFaceStateEventDetail>(COVER_FACE_STATE_EVENT, { detail }))
}

export function onCoverFaceState(handler: (detail: CoverFaceStateEventDetail) => void): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<CoverFaceStateEventDetail>).detail)
  }
  window.addEventListener(COVER_FACE_STATE_EVENT, listener)
  return () => window.removeEventListener(COVER_FACE_STATE_EVENT, listener)
}
