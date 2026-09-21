import { beginDndDragCursor } from '@/utils/dnd-cursor'
import {
  normalizeFaceMixEntry,
  type FaceMixEntry,
} from '@/utils/studio/face-name-recall/face-specs'

/** One hand-mixed face dragged from the Studio form onto a page. */
export type DroppedFaceCardPayload = {
  entry: FaceMixEntry
}

export const FACE_CARD_DND_MIME = 'application/x-book-editor-face-card'

export function setFaceCardDragData(
  dataTransfer: DataTransfer,
  payload: DroppedFaceCardPayload,
): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(FACE_CARD_DND_MIME, JSON.stringify(payload))
  // Blank text/plain: without it the thumbnail's own data-URI would drop as a raw image.
  dataTransfer.setData('text/plain', '')
}

export function getDroppedFaceCardPayload(
  dataTransfer: DataTransfer,
): DroppedFaceCardPayload | null {
  const raw = dataTransfer.getData(FACE_CARD_DND_MIME)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DroppedFaceCardPayload>
    const entry = normalizeFaceMixEntry(parsed?.entry)
    return entry ? { entry } : null
  } catch {
    return null
  }
}
