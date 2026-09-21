import type { CanvasExportSource } from '@/types/canvas-export-plan.types'
import {
  BROWSER_PDF_MERGE_MAX_BYTES,
  chunkSlots,
  getPdfChunkPageSize,
} from '@/types/canvas-export-plan.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { MarginGuide, PageDimensions } from '@/types/canvas-settings.types'
import type { CanvasExportProgressReporter } from '@/types/canvas-download.types'
import { exportCoverPdfBlob, exportInteriorPdfBlobForSlots } from '@/utils/canvas-export-to-pdf'
import {
  deliverAndReleaseZipFiles,
  releaseExportChunkMemory,
} from '@/utils/canvas-export-memory'
import { getCoverSlot, getInteriorSlots } from '@/utils/canvas-export-source'
import { mergePdfBlobs } from '@/utils/pdf-chunk-merge'
import { downloadsApi } from '@/api/downloads.api'
import { downloadBlobDirectly, type ZipStreamTarget, type ZipFileInput } from '@/utils/streaming-zip-download'

const INTERIOR_PDF_FILE_NAME = 'book-editor_interior.pdf'
const COVER_PDF_FILE_NAME = 'book-editor_cover.pdf'

type ChunkedPdfExportParams = {
  source: CanvasExportSource
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  marginGuide: MarginGuide
  throwIfCancelled: () => void
  onProgress: CanvasExportProgressReporter
}

type ChunkedPdfExportResult = {
  outputFiles: ZipFileInput[]
  zipFileName: string
}

function shouldUseServerMerge(estimatedTotalBytes: number): boolean {
  return estimatedTotalBytes > BROWSER_PDF_MERGE_MAX_BYTES
}

async function uploadPdfChunkAndRelease({
  sessionId,
  chunkIndex,
  chunkBlob,
}: {
  sessionId: string
  chunkIndex: number
  chunkBlob: Blob
}): Promise<void> {
  try {
    await downloadsApi.uploadPdfMergeChunk({
      sessionId,
      chunkIndex,
      chunkBlob,
    })
  } finally {
    await releaseExportChunkMemory()
  }
}

export async function exportChunkedPdfFiles({
  source,
  pageDimensions,
  bookCoverDimensions,
  throwIfCancelled,
  onProgress,
}: ChunkedPdfExportParams): Promise<ChunkedPdfExportResult> {
  const interiorSlots = getInteriorSlots(source)
  const coverSlot = getCoverSlot(source)
  const totalItems = interiorSlots.length + (coverSlot ? 1 : 0)
  let processedOffset = 0

  const outputFiles: ZipFileInput[] = []

  if (coverSlot) {
    throwIfCancelled()
    const coverItem = await source.resolveItem(coverSlot)
    await onProgress({
      label: 'Processing Cover',
      completed: processedOffset,
      total: totalItems,
    })

    const coverBlob = await exportCoverPdfBlob({
      coverItem,
      pageWidthPixels: bookCoverDimensions.fullWidthPixels,
      pageHeightPixels: bookCoverDimensions.fullHeightPixels,
      backgroundColor: '#ffffff',
      totalItems,
      processedOffset,
      onPageStart: async ({ itemIndex }) => {
        await onProgress({ label: 'Processing Cover', completed: itemIndex - 1, total: totalItems })
      },
      onPageComplete: async ({ completedCount }) => {
        await onProgress({ label: 'Cover exported', completed: completedCount, total: totalItems })
      },
    })
    coverItem.canvas_data = {}
    processedOffset += 1
    outputFiles.push({ fileName: COVER_PDF_FILE_NAME, blob: coverBlob })
    await releaseExportChunkMemory()
  }

  if (interiorSlots.length > 0) {
    const effectiveChunkPageSize = getPdfChunkPageSize(interiorSlots.length)
    const slotChunks = chunkSlots(interiorSlots, effectiveChunkPageSize)
    const browserChunkBlobs: Blob[] = []
    let serverSessionId: string | null = null
    let useServerMerge = false

    for (let chunkIndex = 0; chunkIndex < slotChunks.length; chunkIndex += 1) {
      throwIfCancelled()
      const chunkSlotsSlice = slotChunks[chunkIndex]!

      await onProgress({
        label: `Rendering PDF chunk ${chunkIndex + 1} of ${slotChunks.length}`,
        completed: processedOffset,
        total: totalItems,
      })

      let chunkBlob = await exportInteriorPdfBlobForSlots({
        source,
        interiorSlots: chunkSlotsSlice,
        pageWidthPixels: pageDimensions.widthPixels,
        pageHeightPixels: pageDimensions.heightPixels,
        backgroundColor: '#ffffff',
        totalItems,
        processedOffset,
        onPageStart: async ({ item, itemIndex }) => {
          await onProgress({
            label: `Processing Page ${item.page_index + 1} (${itemIndex} of ${totalItems})`,
            completed: itemIndex - 1,
            total: totalItems,
          })
        },
        onPageComplete: async ({ completedCount }) => {
          await onProgress({ label: `Exported ${completedCount} of ${totalItems}`, completed: completedCount, total: totalItems })
        },
      })

      processedOffset += chunkSlotsSlice.length

      if (chunkIndex === 0) {
        const estimatedTotalBytes = chunkBlob.size * slotChunks.length
        useServerMerge = shouldUseServerMerge(estimatedTotalBytes)
        if (useServerMerge) {
          const session = await downloadsApi.createPdfMergeSession({ chunkCount: slotChunks.length })
          serverSessionId = session.session_id
        }
      }

      if (useServerMerge && serverSessionId) {
        await onProgress({
          label: `Uploading PDF chunk ${chunkIndex + 1} of ${slotChunks.length}`,
          completed: processedOffset,
          total: totalItems,
        })
        await uploadPdfChunkAndRelease({
          sessionId: serverSessionId,
          chunkIndex,
          chunkBlob,
        })
      } else {
        browserChunkBlobs.push(chunkBlob)
        await releaseExportChunkMemory()
      }

      chunkBlob = new Blob()
    }

    throwIfCancelled()
    await onProgress({ label: 'Merging PDF chunks...', completed: processedOffset, total: totalItems })

    let interiorBlob: Blob
    if (useServerMerge && serverSessionId) {
      try {
        interiorBlob = await downloadsApi.finalizePdfMergeSession(serverSessionId)
      } finally {
        await releaseExportChunkMemory()
      }
    } else if (browserChunkBlobs.length === 1) {
      interiorBlob = browserChunkBlobs[0]!
      browserChunkBlobs.length = 0
    } else {
      interiorBlob = await mergePdfBlobs(browserChunkBlobs)
      browserChunkBlobs.length = 0
      await releaseExportChunkMemory()
    }

    outputFiles.push({ fileName: INTERIOR_PDF_FILE_NAME, blob: interiorBlob })
  }

  if (outputFiles.length === 0) {
    throw new Error('No canvases selected for PDF export')
  }

  return {
    outputFiles,
    zipFileName: 'book-editor_export_vector_pdf.zip',
  }
}

export async function deliverPdfExportResult(
  result: ChunkedPdfExportResult,
  zipStreamTarget?: ZipStreamTarget | null,
): Promise<number> {
  return deliverAndReleaseZipFiles(async () => {
    if (result.outputFiles.length === 1) {
      const file = result.outputFiles[0]!
      downloadBlobDirectly(file.blob, file.fileName)
      return 1
    }
    const { downloadZipFiles } = await import('@/utils/streaming-zip-download')
    await downloadZipFiles(result.outputFiles, result.zipFileName, zipStreamTarget)
    return result.outputFiles.length
  }, result.outputFiles)
}
