import { beginDndDragCursor } from '@/utils/dnd-cursor'

export type DroppedEmojiPayload = {
  publicUrl: string
  label: string
}

export const EMOJI_DND_MIME = 'application/x-book-editor-emoji'

export function setEmojiDragData(dataTransfer: DataTransfer, payload: DroppedEmojiPayload): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(EMOJI_DND_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', '')
}

export function getDroppedEmojiPayload(dataTransfer: DataTransfer): DroppedEmojiPayload | null {
  const raw = dataTransfer.getData(EMOJI_DND_MIME)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DroppedEmojiPayload>
    if (typeof parsed?.publicUrl !== 'string' || parsed.publicUrl.length === 0) return null
    const label = typeof parsed?.label === 'string' && parsed.label.length > 0 ? parsed.label : 'emoji'
    return { publicUrl: parsed.publicUrl, label }
  } catch {
    return null
  }
}
