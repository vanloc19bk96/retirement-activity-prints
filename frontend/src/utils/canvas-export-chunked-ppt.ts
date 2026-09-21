import type { CanvasExportSource } from '@/types/canvas-export-plan.types'
import { chunkSlots } from '@/types/canvas-export-plan.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { CanvasExportProgressReporter } from '@/types/canvas-download.types'
import type { PageDimensions } from '@/types/canvas-settings.types'
import { exportItemsToPptBlob, exportItemsToPptBlobForSlots } from '@/utils/canvas-export-to-ppt'
import {
  deliverAndReleaseZipFiles,
  releaseExportChunkMemory,
} from '@/utils/canvas-export-memory'
import { getCoverSlot, getInteriorSlots } from '@/utils/canvas-export-source'
import { downloadBlobDirectly, type ZipStreamTarget, type ZipFileInput } from '@/utils/streaming-zip-download'

const COVER_PPT_FILE_NAME = 'book-editor_cover.pptx'
const INTERIOR_PPT_FILE_NAME = 'book-editor_interior.pptx'
const PPT_ZIP_FILE_NAME = 'book-editor_export_vector_ppt.zip'

type ChunkedPptExportParams = {
  source: CanvasExportSource
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  chunkPageSize: number
  throwIfCancelled: () => void
  onProgress: CanvasExportProgressReporter
  zipStreamTarget?: ZipStreamTarget | null
}

export type ChunkedPptPrepared = {
  fileCount: number
  deliverDownload: () => Promise<void>
}

/**
 * Phase 1: render cover + interior chunks.
 * Phase 2: caller invokes `deliverDownload()` after progress dialog reaches 100%.
 */
export async function prepareChunkedPptExport({
  source,
  pageDimensions,
  bookCoverDimensions,
  chunkPageSize,
  throwIfCancelled,
  onProgress,
  zipStreamTarget,
}: ChunkedPptExportParams): Promise<ChunkedPptPrepared> {
  const interiorSlots = getInteriorSlots(source)
  const coverSlot = getCoverSlot(source)
  const totalItems = interiorSlots.length + (coverSlot ? 1 : 0)
  let processedOffset = 0
  const slotChunks = chunkSlots(interiorSlots, chunkPageSize)
  const outputFiles: ZipFileInput[] = []

  if (coverSlot) {
    throwIfCancelled()
    const coverItem = await source.resolveItem(coverSlot)
    await onProgress({ label: 'Processing Cover', completed: processedOffset, total: totalItems })

    const coverBlob = await exportItemsToPptBlob({
      items: [coverItem],
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
    outputFiles.push({ fileName: COVER_PPT_FILE_NAME, blob: coverBlob })
    await releaseExportChunkMemory()
  }

  for (let chunkIndex = 0; chunkIndex < slotChunks.length; chunkIndex += 1) {
    throwIfCancelled()
    const chunkSlotsSlice = slotChunks[chunkIndex]!

    await onProgress({
      label: `Rendering PPT chunk ${chunkIndex + 1} of ${slotChunks.length}`,
      completed: processedOffset,
      total: totalItems,
    })

    const chunkBlob = await exportItemsToPptBlobForSlots({
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

    const fileName =
      slotChunks.length === 1
        ? INTERIOR_PPT_FILE_NAME
        : `book-editor_interior_part-${chunkIndex + 1}.pptx`

    outputFiles.push({ fileName, blob: chunkBlob })
    await releaseExportChunkMemory()
  }

  if (outputFiles.length === 0) {
    throw new Error('No canvases selected for PPT export')
  }

  const deliverDownload = async (): Promise<void> => {
    await deliverAndReleaseZipFiles(async () => {
      if (outputFiles.length === 1) {
        downloadBlobDirectly(outputFiles[0]!.blob, outputFiles[0]!.fileName)
        return 1
      }
      const { downloadZipFiles } = await import('@/utils/streaming-zip-download')
      await downloadZipFiles(outputFiles, PPT_ZIP_FILE_NAME, zipStreamTarget)
      return outputFiles.length
    }, outputFiles)
  }

  return {
    fileCount: outputFiles.length,
    deliverDownload,
  }
}
