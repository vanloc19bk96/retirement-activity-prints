import {
  deliverPdfExportResult,
  exportChunkedPdfFiles,
} from '@/utils/canvas-export-chunked-pdf'
import { prepareChunkedPptExport } from '@/utils/canvas-export-chunked-ppt'
import {
  isIndependentDownloadFormat,
  prepareIndependentFileExport,
} from '@/utils/canvas-export-streaming-independent'
import type { CanvasExportSource } from '@/types/canvas-export-plan.types'
import { DOCUMENT_CHUNK_PAGE_SIZE } from '@/types/canvas-export-plan.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { MarginGuide, PageDimensions } from '@/types/canvas-settings.types'
import type { CanvasExportProgressReporter, DownloadFormat } from '@/types/canvas-download.types'
import type { ZipStreamTarget } from '@/utils/streaming-zip-download'

export type RunCanvasExportResult = {
  fileCount: number
  /** Deferred until progress dialog reaches 100%. */
  deliverDownload?: () => Promise<void>
}

export type RunCanvasExportParams = {
  format: DownloadFormat
  source: CanvasExportSource
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  marginGuide: MarginGuide
  throwIfCancelled: () => void
  onProgress: CanvasExportProgressReporter
  zipStreamTarget?: ZipStreamTarget | null
}

export async function runCanvasExport(params: RunCanvasExportParams): Promise<RunCanvasExportResult> {
  const {
    format,
    source,
    pageDimensions,
    bookCoverDimensions,
    marginGuide,
    throwIfCancelled,
    onProgress,
    zipStreamTarget,
  } = params

  if (isIndependentDownloadFormat(format)) {
    const prepared = await prepareIndependentFileExport({
      source,
      format,
      pageDimensions,
      bookCoverDimensions,
      marginGuide,
      throwIfCancelled,
      onProgress,
      zipStreamTarget,
    })
    return {
      fileCount: prepared.fileCount,
      deliverDownload: prepared.deliverDownload,
    }
  }

  if (format === 'pdf') {
    const result = await exportChunkedPdfFiles({
      source,
      pageDimensions,
      bookCoverDimensions,
      marginGuide,
      throwIfCancelled,
      onProgress,
    })
    return {
      fileCount: result.outputFiles.length,
      deliverDownload: async () => {
        await deliverPdfExportResult(result, zipStreamTarget)
      },
    }
  }

  if (format === 'ppt') {
    const prepared = await prepareChunkedPptExport({
      source,
      pageDimensions,
      bookCoverDimensions,
      chunkPageSize: DOCUMENT_CHUNK_PAGE_SIZE,
      throwIfCancelled,
      onProgress,
      zipStreamTarget,
    })
    return {
      fileCount: prepared.fileCount,
      deliverDownload: prepared.deliverDownload,
    }
  }

  throw new Error(`Unsupported export format: ${format satisfies never}`)
}
