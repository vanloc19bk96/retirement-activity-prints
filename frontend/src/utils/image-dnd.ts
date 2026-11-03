import { beginDndDragCursor } from '@/utils/dnd-cursor'
import { storageApi } from '@/api/storage.api'

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unreadable file')))
    reader.onerror = () => reject(reader.error ?? new Error('Unreadable file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Read a dropped local image/SVG into a URL Fabric can load that still works after a reload: the
 * page saves the URL. A bitmap is uploaded like one added from the Images panel (a `blob:` URL
 * dies with the tab and would leave the saved page with a broken picture); if the upload fails it
 * is kept inline as a data URI.
 */
export async function readDroppedImageFileAsUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const svgText = await file.text()
    const encoded =
      typeof globalThis.btoa === 'function'
        ? globalThis.btoa(unescape(encodeURIComponent(svgText)))
        : Buffer.from(svgText, 'utf8').toString('base64')
    return `data:image/svg+xml;charset=utf-8;base64,${encoded}`
  }
  try {
    const uploaded = await storageApi.uploadImage(file)
    if (uploaded.publicUrl) return uploaded.publicUrl
  } catch {
    // Offline or refused: the picture still goes on the page.
  }
  return readFileAsDataUrl(file)
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
