import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { useDownloadProgressAnimation } from '@/hooks/use-download-progress-animation'
import { runCanvasExport, type RunCanvasExportResult } from '@/utils/run-canvas-export'
import { yieldForUiPaint } from '@/utils/yield-for-ui-paint'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { MarginGuide, PageDimensions } from '@/types/canvas-settings.types'
import {
  CANCEL_DOWNLOAD_ERROR_MESSAGE,
  EMPTY_IMAGE_EXPORT_ERROR_MESSAGE,
  type CanvasExportProgressReporter,
  type DownloadFormat,
  type DownloadProgressStatus,
} from '@/types/canvas-download.types'
import { releaseExportChunkMemory } from '@/utils/canvas-export-memory'
import { createZipStreamTarget, type ZipStreamTarget } from '@/utils/streaming-zip-download'
import type { CanvasesExportRequest } from '@/context/CanvasExportContext'

const EXPORT_START_PERCENT = 10
const EXPORT_SPAN_PERCENT = 80
const PACKAGING_PERCENT = 92
const COMPLETED_DIALOG_LINGER_MS = 1500
/** Brief pause at 100% before browser download starts. */
const DELIVER_AFTER_COMPLETE_MS = 400
const PROGRESS_PAINT_INTERVAL_MS = 120

const IMAGE_ZIP_FILE_NAME: Record<'png' | 'jpg' | 'svg', string> = {
  png: 'book-editor_export_300dpi.zip',
  jpg: 'book-editor_export_300dpi.zip',
  svg: 'book-editor_export_vector_svg.zip',
}

type NotifyFn = (message: { title: string; description: string }) => void

type UseCanvasDownloadOptions = {
  createExportSource: (request: CanvasesExportRequest) => Promise<import('@/types/canvas-export-plan.types').CanvasExportSource>
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  marginGuide: MarginGuide
  consumeQuota: () => Promise<unknown>
  notify: NotifyFn
}

export type StartDownloadRequest = {
  format: DownloadFormat
  interiorPageIndices: number[]
  includeCover: boolean
}

export type UseCanvasDownloadResult = {
  isDownloading: boolean
  isDialogOpen: boolean
  status: DownloadProgressStatus
  progress: number
  currentLabel: string
  startDownload: (request: StartDownloadRequest) => Promise<void>
  closeDialog: () => void
  setDialogOpen: (open: boolean) => void
}

function isCancelledError(caught: unknown): boolean {
  return caught instanceof Error && caught.message === CANCEL_DOWNLOAD_ERROR_MESSAGE
}

function createZipStreamTargetIfNeeded(request: StartDownloadRequest): ZipStreamTarget | null {
  if (request.format !== 'png' && request.format !== 'jpg' && request.format !== 'svg') {
    return null
  }
  const expectedFileCount = request.interiorPageIndices.length + (request.includeCover ? 1 : 0)
  if (expectedFileCount <= 1) return null
  return createZipStreamTarget(IMAGE_ZIP_FILE_NAME[request.format])
}

function describeExportError(caught: unknown, format: DownloadFormat): string {
  if (caught instanceof Error && caught.message === EMPTY_IMAGE_EXPORT_ERROR_MESSAGE) {
    return 'No non-empty pages found. Empty pages are skipped for PNG, JPG, and SVG export.'
  }
  if (caught instanceof Error && caught.message) return caught.message
  return `Failed to export ${format.toUpperCase()}`
}

export function useCanvasDownload(options: UseCanvasDownloadOptions): UseCanvasDownloadResult {
  const {
    displayProgress,
    startAnimation,
    stopAnimation,
    reportProgress,
    finishProgress,
  } = useDownloadProgressAnimation()

  const [isDownloading, setIsDownloading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [status, setStatus] = useState<DownloadProgressStatus>('idle')
  const [currentLabel, setCurrentLabel] = useState('')
  const isCancelRequestedRef = useRef(false)
  const lastProgressPaintAtRef = useRef(0)
  const lastReportedPercentRef = useRef(0)

  useEffect(() => {
    if (status !== 'completed') return
    const timer = setTimeout(() => setIsDialogOpen(false), COMPLETED_DIALOG_LINGER_MS)
    return () => clearTimeout(timer)
  }, [status])

  const throwIfCancelled = useCallback(() => {
    if (isCancelRequestedRef.current) throw new Error(CANCEL_DOWNLOAD_ERROR_MESSAGE)
  }, [])

  const handleExportProgress = useCallback<CanvasExportProgressReporter>(
    async (progress) => {
      throwIfCancelled()

      const fraction = progress.total > 0 ? progress.completed / progress.total : 0
      const rawPercent = EXPORT_START_PERCENT + fraction * EXPORT_SPAN_PERCENT
      const percent = Math.max(lastReportedPercentRef.current, rawPercent)
      lastReportedPercentRef.current = percent
      const isFinalTick = progress.completed >= progress.total
      const now = Date.now()
      const shouldForcePaint =
        isFinalTick || now - lastProgressPaintAtRef.current >= PROGRESS_PAINT_INTERVAL_MS

      const applyUpdate = (): void => {
        setCurrentLabel(progress.label)
        reportProgress(percent)
      }

      if (shouldForcePaint) {
        flushSync(applyUpdate)
        // Skip paint waits while backgrounded — rAF/timer yields stall PDF export.
        if (typeof document === 'undefined' || !document.hidden) {
          await yieldForUiPaint()
        }
        lastProgressPaintAtRef.current = Date.now()
        return
      }

      applyUpdate()
    },
    [reportProgress, throwIfCancelled],
  )

  const deliverExport = useCallback(
    async (
      request: StartDownloadRequest,
      zipStreamTarget: ZipStreamTarget | null,
    ): Promise<RunCanvasExportResult> => {
      const source = await options.createExportSource({
        interiorPageIndices: request.interiorPageIndices,
        includeCover: request.includeCover,
      })
      throwIfCancelled()
      setStatus('exporting')
      reportProgress(EXPORT_START_PERCENT)
      await yieldToMainThread()

      const exportResult = await runCanvasExport({
        format: request.format,
        source,
        pageDimensions: options.pageDimensions,
        bookCoverDimensions: options.bookCoverDimensions,
        marginGuide: options.marginGuide,
        throwIfCancelled,
        onProgress: handleExportProgress,
        zipStreamTarget,
      })

      throwIfCancelled()
      setStatus('packaging')
      flushSync(() => {
        setCurrentLabel(
          exportResult.deliverDownload ? 'Preparing download file...' : 'Finalizing download...',
        )
        reportProgress(PACKAGING_PERCENT)
      })
      await yieldForUiPaint()

      return exportResult
    },
    [handleExportProgress, options, reportProgress, throwIfCancelled],
  )

  const startDownload = useCallback(
    async (request: StartDownloadRequest): Promise<void> => {
      if (isDownloading) return

      isCancelRequestedRef.current = false
      lastProgressPaintAtRef.current = 0
      lastReportedPercentRef.current = 0

      // Open StreamSaver on click; pages must stream into it during export (not after).
      const zipStreamTarget = createZipStreamTargetIfNeeded(request)

      setIsDialogOpen(true)
      setStatus('preparing')
      setCurrentLabel('')
      setIsDownloading(true)
      startAnimation()
      reportProgress(6)
      await yieldToMainThread()

      try {
        const exportResult = await deliverExport(request, zipStreamTarget)
        throwIfCancelled()
        finishProgress()
        setStatus('completed')
        await yieldForUiPaint()

        // Multi-file image zips already streamed during export. Single-file / PDF / PPT deliver here.
        if (exportResult.deliverDownload) {
          await new Promise((resolve) => setTimeout(resolve, DELIVER_AFTER_COMPLETE_MS))
          throwIfCancelled()
          flushSync(() => {
            setCurrentLabel('Starting browser download...')
          })
          await exportResult.deliverDownload()
        }

        try {
          await options.consumeQuota()
        } catch (caught) {
          const description = caught instanceof Error ? caught.message : 'Failed to record download usage'
          options.notify({ title: 'Download saved, quota sync failed', description })
        }

        options.notify({
          title: 'Download ready',
          description: `Format: ${request.format.toUpperCase()} · Files: ${exportResult.fileCount}`,
        })
      } catch (caught) {
        zipStreamTarget?.abort(caught)
        stopAnimation()
        if (isCancelledError(caught)) {
          setStatus('cancelled')
          setIsDialogOpen(false)
          options.notify({ title: 'Download cancelled', description: 'Export stopped before files were saved.' })
          return
        }
        setStatus('failed')
        options.notify({ title: 'Export failed', description: describeExportError(caught, request.format) })
      } finally {
        setIsDownloading(false)
        isCancelRequestedRef.current = false
        void releaseExportChunkMemory()
      }
    },
    [deliverExport, finishProgress, isDownloading, options, reportProgress, startAnimation, stopAnimation, throwIfCancelled],
  )

  const closeDialog = useCallback(() => {
    if (isDownloading) isCancelRequestedRef.current = true
    stopAnimation()
    setIsDialogOpen(false)
  }, [isDownloading, stopAnimation])

  const setDialogOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setIsDialogOpen(true)
        return
      }
      closeDialog()
    },
    [closeDialog],
  )

  return {
    isDownloading,
    isDialogOpen,
    status,
    progress: displayProgress,
    currentLabel,
    startDownload,
    closeDialog,
    setDialogOpen,
  }
}
