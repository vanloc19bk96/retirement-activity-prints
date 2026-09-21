import type { CanvasExportItem } from '@/context/CanvasExportContext'
import type { CanvasesExportRequest } from '@/context/CanvasExportContext'
import type { DownloadFormat } from '@/types/canvas-download.types'

/** PNG, JPG, SVG — one file per page, streamed into zip. */
export const INDEPENDENT_FILE_FORMATS = new Set<DownloadFormat>(['png', 'jpg', 'svg'])

/** PDF, PPT — pages accumulate into document blobs; chunked render + merge. */
export const ACCUMULATED_DOCUMENT_FORMATS = new Set<DownloadFormat>(['pdf', 'ppt'])

export type CanvasExportPageSlot =
  | { canvas_type: 'interior'; page_index: number }
  | { canvas_type: 'cover'; page_index: 0 }

export type CanvasExportSource = {
  readonly slots: readonly CanvasExportPageSlot[]
  resolveItem: (slot: CanvasExportPageSlot) => Promise<CanvasExportItem>
}

export type CanvasExportSourceFactory = (
  request: CanvasesExportRequest,
) => CanvasExportSource | Promise<CanvasExportSource>

/** Interior pages per PPT chunk (and PDF fallback for tiny books). */
export const DOCUMENT_CHUNK_PAGE_SIZE = 32

/**
 * Smaller PDF chunks for medium+ books — limits jsPDF/svg2pdf peak RAM per chunk.
 * Image-dense pages need splits well below 40 pages.
 */
export function getPdfChunkPageSize(interiorPageCount: number): number {
  if (interiorPageCount > 200) return 8
  if (interiorPageCount > 100) return 12
  if (interiorPageCount > 40) return 12
  if (interiorPageCount > 20) return 16
  return DOCUMENT_CHUNK_PAGE_SIZE
}

/** Browser pdf-lib merge when total chunk blob bytes stay below this (~80 MB). */
export const BROWSER_PDF_MERGE_MAX_BYTES = 80 * 1024 * 1024

export function isIndependentFileFormat(format: DownloadFormat): boolean {
  return INDEPENDENT_FILE_FORMATS.has(format)
}

export function isAccumulatedDocumentFormat(format: DownloadFormat): boolean {
  return ACCUMULATED_DOCUMENT_FORMATS.has(format)
}

export function chunkSlots<T>(items: readonly T[], chunkSize: number): T[][] {
  if (chunkSize <= 0 || items.length === 0) return items.length === 0 ? [] : [Array.from(items)]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize) as T[])
  }
  return chunks
}

export function sumBlobBytes(blobs: readonly Blob[]): number {
  let total = 0
  for (const blob of blobs) total += blob.size
  return total
}
