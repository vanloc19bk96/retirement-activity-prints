import type { CanvasExportSource } from '@/types/canvas-export-plan.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { CanvasExportProgressReporter, DownloadFormat } from '@/types/canvas-download.types'
import type { CanvasType } from '@/types/canvases.types'
import type { MarginGuide, PageDimensions } from '@/types/canvas-settings.types'
import { exportCanvasJsonToImageBlob } from '@/utils/canvas-export'
import { renderCanvasJsonToSvgElement, serializeSvgElementToString } from '@/utils/canvas-export-to-svg'
import {
  downloadBlobDirectly,
  streamZipDownload,
  type ZipStreamTarget,
  type ZipFileInput,
  type ZipStreamEntry,
} from '@/utils/streaming-zip-download'
import { releaseExportChunkMemory, releaseZipFileInputs } from '@/utils/canvas-export-memory'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

const ZIP_FILE_NAME: Record<'png' | 'jpg' | 'svg', string> = {
  png: 'book-editor_export_300dpi.zip',
  jpg: 'book-editor_export_300dpi.zip',
  svg: 'book-editor_export_vector_svg.zip',
}

export type IndependentExportPrepared = {
  fileCount: number
  /** Deferred until progress dialog reaches 100%. Absent when zip already streamed during export. */
  deliverDownload?: () => Promise<void>
}

function hasRenderableCanvasContent(canvasData: Record<string, unknown>): boolean {
  const objects = canvasData.objects
  return Array.isArray(objects) && objects.length > 0
}

function getExportBaseName(canvasType: CanvasType, pageIndex: number): string {
  return canvasType === 'interior' ? `page-${pageIndex + 1}` : 'cover'
}

function getCanvasBaseDimensions({
  canvasType,
  pageDimensions,
  bookCoverDimensions,
}: {
  canvasType: CanvasType
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
}): { baseWidthPixels: number; baseHeightPixels: number } {
  if (canvasType === 'interior') {
    return {
      baseWidthPixels: pageDimensions.widthPixels,
      baseHeightPixels: pageDimensions.heightPixels,
    }
  }
  return {
    baseWidthPixels: bookCoverDimensions.fullWidthPixels,
    baseHeightPixels: bookCoverDimensions.fullHeightPixels,
  }
}

function getCanvasDisplayName(item: { canvas_type: CanvasType; page_index: number }): string {
  if (item.canvas_type === 'cover') return 'Cover'
  return `Page ${item.page_index + 1}`
}

type PrepareIndependentExportParams = {
  source: CanvasExportSource
  format: 'png' | 'jpg' | 'svg'
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  marginGuide: MarginGuide
  throwIfCancelled: () => void
  onProgress: CanvasExportProgressReporter
  zipStreamTarget?: ZipStreamTarget | null
}

async function renderIndependentFileBlob({
  item,
  canvasType,
  format,
  pageDimensions,
  bookCoverDimensions,
}: {
  item: { canvas_data: Record<string, unknown> }
  canvasType: CanvasType
  format: 'png' | 'jpg' | 'svg'
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
}): Promise<Blob> {
  const { baseWidthPixels, baseHeightPixels } = getCanvasBaseDimensions({
    canvasType,
    pageDimensions,
    bookCoverDimensions,
  })

  if (format === 'svg') {
    const svgElement = await renderCanvasJsonToSvgElement({
      canvasJson: item.canvas_data,
      baseWidthPixels,
      baseHeightPixels,
      backgroundColor: '#ffffff',
    })
    return new Blob([serializeSvgElementToString(svgElement)], { type: 'image/svg+xml;charset=utf-8' })
  }

  return exportCanvasJsonToImageBlob({
    canvasJson: item.canvas_data,
    options: {
      format,
      exportDpi: 300,
      backgroundColor: '#ffffff',
      baseWidthPixels,
      baseHeightPixels,
    },
  })
}

/**
 * Stream pages into StreamSaver as they render.
 * Avoids leaving the download channel idle for hundreds of pages (truncates to ~652B).
 */
async function streamIndependentFilesDuringExport({
  source,
  format,
  pageDimensions,
  bookCoverDimensions,
  throwIfCancelled,
  onProgress,
  zipStreamTarget,
}: PrepareIndependentExportParams & { zipStreamTarget: ZipStreamTarget }): Promise<IndependentExportPrepared> {
  const zipFileName = ZIP_FILE_NAME[format]
  const totalSlots = source.slots.length
  let fileCount = 0

  try {
    await streamZipDownload(
      () =>
        (async function* zipEntries(): AsyncGenerator<ZipStreamEntry> {
          for (let index = 0; index < source.slots.length; index += 1) {
            throwIfCancelled()
            const slot = source.slots[index]!
            const item = await source.resolveItem(slot)

            if (!hasRenderableCanvasContent(item.canvas_data)) {
              await onProgress({
                label: `Skipping empty page ${index + 1} of ${totalSlots}`,
                completed: index + 1,
                total: totalSlots,
              })
              await yieldToMainThread()
              continue
            }

            await onProgress({
              label: `Processing ${getCanvasDisplayName(item)} (${index + 1} of ${totalSlots})`,
              completed: index,
              total: totalSlots,
            })

            const blob = await renderIndependentFileBlob({
              item,
              canvasType: slot.canvas_type,
              format,
              pageDimensions,
              bookCoverDimensions,
            })

            const extension = format === 'jpg' ? 'jpg' : format
            fileCount += 1
            yield {
              fileName: `${getExportBaseName(item.canvas_type, item.page_index)}.${extension}`,
              input: blob,
            }

            await onProgress({
              label: `Exported ${index + 1} of ${totalSlots}`,
              completed: index + 1,
              total: totalSlots,
            })
            await yieldToMainThread()
          }

          if (fileCount === 0) {
            throw new Error('NO_NON_EMPTY_CANVAS_FOR_IMAGE_EXPORT')
          }
        })(),
      zipFileName,
      zipStreamTarget,
    )
  } catch (error) {
    zipStreamTarget.abort(error)
    throw error
  }

  await releaseExportChunkMemory()
  return { fileCount }
}

/**
 * Collect page blobs first, then download after the progress dialog hits 100%.
 * Used for single-file exports or when StreamSaver was not opened on click.
 */
async function collectThenDeliverIndependentFiles({
  source,
  format,
  pageDimensions,
  bookCoverDimensions,
  throwIfCancelled,
  onProgress,
}: PrepareIndependentExportParams): Promise<IndependentExportPrepared> {
  const totalSlots = source.slots.length
  const pendingFiles: ZipFileInput[] = []

  for (let index = 0; index < source.slots.length; index += 1) {
    throwIfCancelled()
    const slot = source.slots[index]!
    const item = await source.resolveItem(slot)

    if (!hasRenderableCanvasContent(item.canvas_data)) {
      await onProgress({
        label: `Skipping empty page ${index + 1} of ${totalSlots}`,
        completed: index + 1,
        total: totalSlots,
      })
      await yieldToMainThread()
      continue
    }

    await onProgress({
      label: `Processing ${getCanvasDisplayName(item)} (${index + 1} of ${totalSlots})`,
      completed: index,
      total: totalSlots,
    })

    const blob = await renderIndependentFileBlob({
      item,
      canvasType: slot.canvas_type,
      format,
      pageDimensions,
      bookCoverDimensions,
    })

    const extension = format === 'jpg' ? 'jpg' : format
    pendingFiles.push({
      fileName: `${getExportBaseName(item.canvas_type, item.page_index)}.${extension}`,
      blob,
    })

    await onProgress({
      label: `Exported ${index + 1} of ${totalSlots}`,
      completed: index + 1,
      total: totalSlots,
    })
    await yieldToMainThread()
  }

  if (pendingFiles.length === 0) {
    throw new Error('NO_NON_EMPTY_CANVAS_FOR_IMAGE_EXPORT')
  }

  const zipFileName = ZIP_FILE_NAME[format]

  const deliverDownload = async (): Promise<void> => {
    try {
      if (pendingFiles.length === 1) {
        const file = pendingFiles[0]!
        downloadBlobDirectly(file.blob, file.fileName)
        return
      }

      await streamZipDownload(
        () =>
          (async function* zipEntries(): AsyncGenerator<ZipStreamEntry> {
            for (const file of pendingFiles) {
              yield { fileName: file.fileName, input: file.blob }
            }
          })(),
        zipFileName,
      )
    } finally {
      releaseZipFileInputs(pendingFiles)
      await releaseExportChunkMemory()
    }
  }

  return {
    fileCount: pendingFiles.length,
    deliverDownload,
  }
}

export async function prepareIndependentFileExport(
  params: PrepareIndependentExportParams,
): Promise<IndependentExportPrepared> {
  if (params.zipStreamTarget) {
    return streamIndependentFilesDuringExport({
      ...params,
      zipStreamTarget: params.zipStreamTarget,
    })
  }
  return collectThenDeliverIndependentFiles(params)
}

export function isIndependentDownloadFormat(format: DownloadFormat): format is 'png' | 'jpg' | 'svg' {
  return format === 'png' || format === 'jpg' || format === 'svg'
}
