import { beginDndDragCursor } from '@/utils/dnd-cursor'

export type DroppedIconPayload = {
  iconId: string
  label: string
}

export const ICON_DND_MIME = 'application/x-book-editor-icon'

export function setIconDragData(dataTransfer: DataTransfer, payload: DroppedIconPayload): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(ICON_DND_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', '')
}

export function getDroppedIconPayload(dataTransfer: DataTransfer): DroppedIconPayload | null {
  const raw = dataTransfer.getData(ICON_DND_MIME)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DroppedIconPayload>
    if (typeof parsed?.iconId !== 'string' || parsed.iconId.length === 0) return null
    if (typeof parsed?.label !== 'string' || parsed.label.length === 0) return null
    return { iconId: parsed.iconId, label: parsed.label }
  } catch {
    return null
  }
}
