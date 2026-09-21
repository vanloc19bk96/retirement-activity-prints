import { isImageDragTransfer } from '@/utils/image-dnd'
import { beginDndDragCursor } from '@/utils/dnd-cursor'

export type DroppedTextPayload = {
  text: string
  fontSize: number
  fontWeight: number | 'normal' | 'bold'
}

export const TEXT_DND_MIME = 'application/x-book-editor-text'

// Dragging images also sets text/plain (URL) for interoperability.
// We must not treat that URL as a text payload, otherwise the canvas will render the URL as text.

export function setTextDragData(dataTransfer: DataTransfer, payload: DroppedTextPayload): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(TEXT_DND_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/plain', payload.text)
}

export function getDroppedTextPayload(dataTransfer: DataTransfer): DroppedTextPayload | null {
  const raw = dataTransfer.getData(TEXT_DND_MIME)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<DroppedTextPayload>
      if (
        typeof parsed?.text === 'string' &&
        parsed.text.length > 0 &&
        typeof parsed?.fontSize === 'number' &&
        Number.isFinite(parsed.fontSize) &&
        parsed.fontSize > 0
      ) {
        return {
          text: parsed.text,
          fontSize: parsed.fontSize,
          fontWeight: (parsed.fontWeight ?? 'normal') as DroppedTextPayload['fontWeight'],
        }
      }
    } catch {
      // ignore
    }
  }

  // Image drags also set text/plain (URL) for interoperability — never treat that as text.
  if (isImageDragTransfer(dataTransfer)) {
    return null
  }

  const plain = dataTransfer.getData('text/plain')
  const trimmedPlain = plain?.trim()
  if (trimmedPlain) {
    // External drags may only expose text/plain; skip bare http(s) URLs without TEXT_DND_MIME.
    if (!raw && /^https?:\/\//i.test(trimmedPlain)) {
      return null
    }
    return { text: trimmedPlain, fontSize: 32, fontWeight: 'normal' }
  }

  return null
}
