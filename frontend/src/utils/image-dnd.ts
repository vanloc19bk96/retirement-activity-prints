import { beginDndDragCursor } from '@/utils/dnd-cursor'

export type DroppedImagePayload = {
  publicUrl: string
  fileName: string | null
}

export const IMAGE_DND_MIME = 'application/x-book-editor-image'

function isLocalImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return file.name.toLowerCase().endsWith('.svg')
}

export function isImageDragTransfer(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types ?? [])
  return (
    types.includes(IMAGE_DND_MIME) ||
    types.includes('text/uri-list') ||
    types.includes('Files')
  )
}

/** First image/SVG file from an OS drag (desktop / Explorer). */
export function getDroppedImageFile(dataTransfer: DataTransfer): File | null {
  const files = Array.from(dataTransfer.files ?? [])
  return files.find(isLocalImageFile) ?? null
}

export function setImageDragData(
  dataTransfer: DataTransfer,
  payload: DroppedImagePayload,
): void {
  beginDndDragCursor()
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(IMAGE_DND_MIME, JSON.stringify(payload))
  dataTransfer.setData('text/uri-list', payload.publicUrl)
  dataTransfer.setData('text/plain', payload.publicUrl)
}

export function getDroppedImageUrl(dataTransfer: DataTransfer): string | null {
  const types = Array.from(dataTransfer.types ?? [])
  // Text panel drags also set text/plain — never treat label text as an image URL.
  if (types.includes('application/x-book-editor-text')) return null

  const payload = getDroppedImagePayload(dataTransfer)
  if (payload?.publicUrl) return payload.publicUrl

  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) return uriList.split('\n').find((line) => line && !line.startsWith('#')) ?? null

  const plain = dataTransfer.getData('text/plain')
  const trimmedPlain = plain?.trim()
  // External drags may only expose text/plain with an http(s) URL.
  if (trimmedPlain && /^https?:\/\//i.test(trimmedPlain)) {
    return trimmedPlain
  }
  // Preview <img> drags often expose the data-URI only via text/plain.
  if (trimmedPlain && /^data:image\//i.test(trimmedPlain)) {
    return trimmedPlain
  }

  return null
}

/** Read a dropped local image/SVG into a URL Fabric can load (object URL or data-URI). */
export async function readDroppedImageFileAsUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const svgText = await file.text()
    const encoded =
      typeof globalThis.btoa === 'function'
        ? globalThis.btoa(unescape(encodeURIComponent(svgText)))
        : Buffer.from(svgText, 'utf8').toString('base64')
    return `data:image/svg+xml;charset=utf-8;base64,${encoded}`
  }
  return URL.createObjectURL(file)
}

export function getDroppedImagePayload(dataTransfer: DataTransfer): DroppedImagePayload | null {
  const raw = dataTransfer.getData(IMAGE_DND_MIME)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DroppedImagePayload
      if (typeof parsed?.publicUrl === 'string' && parsed.publicUrl.length > 0) {
        return parsed
      }
    } catch {
      // ignore
    }
  }
  return null
}
