import type { CanvasExportItem } from '@/context/CanvasExportContext'
import type { ZipFileInput } from '@/utils/streaming-zip-download'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

/** Drop heavy canvas JSON references so GC can reclaim between export chunks. */
export function releaseCanvasExportItems(items: CanvasExportItem[]): void {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item) {
      item.canvas_data = {}
    }
  }
  items.length = 0
}

/** Clear blob references held in zip/download buffers. */
export function releaseZipFileInputs(files: ZipFileInput[]): void {
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (file) {
      file.blob = new Blob()
    }
  }
  files.length = 0
}

/**
 * Yield twice so the browser can GC large blobs (PDF chunks, canvas JSON)
 * after upload/download completes.
 */
export async function releaseExportChunkMemory(): Promise<void> {
  await yieldToMainThread()
  await yieldToMainThread()
}

/** Run delivery then always release any held export blobs. */
export async function deliverAndReleaseZipFiles(
  deliver: () => Promise<number>,
  files: ZipFileInput[],
): Promise<number> {
  try {
    return await deliver()
  } finally {
    releaseZipFileInputs(files)
    await releaseExportChunkMemory()
  }
}
